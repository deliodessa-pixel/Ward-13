'use strict';
const assert=require('node:assert/strict');
process.env.PORT='0';
const {server,create,act,resolveEncounter}=require('./server');
const {CHALLENGES}=require('./game-data');
try{
const s=create(),a=s.teams[0],b=s.teams[1];for(let i=0;i<3;i++){act(s,{action:'join',team:a.id,name:'Alice'+i});act(s,{action:'join',team:b.id,name:'Bob'+i})}act(s,{action:'teacher',op:'start',key:s.adminKey});
const PA=a.players[0].token,PB=b.players[0].token;
act(s,{action:'duel',token:PA,target:b.id});let e=s.encounters.at(-1),q=CHALLENGES[e.qid];act(s,{action:'encounter_answer',token:PA,choice:q.answer});act(s,{action:'encounter_answer',token:PB,choice:(q.answer+1)%4});assert.equal(e.status,'resolved');assert.equal(e.winner,a.id);assert.equal(a.score,75);assert(b.isolatedUntil>Date.now());
b.isolatedUntil=0;a.lastChallenge=0;a.score=200;
act(s,{action:'theft',token:PA,target:b.id,resource:'hints'});e=s.encounters.at(-1);q=CHALLENGES[e.qid];assert.equal(a.score,150);assert.equal(e.type,'theft');act(s,{action:'encounter_answer',token:PA,choice:q.answer});assert.equal(e.status,'resolved');assert.equal(a.hints,2);assert.equal(b.hints,0);
b.isolatedUntil=0;act(s,{action:'teacher',key:s.adminKey,op:'challenge',team:b.id});e=s.encounters.at(-1);q=CHALLENGES[e.qid];act(s,{action:'encounter_answer',token:PB,choice:(q.answer+1)%4});assert(b.isolatedUntil>Date.now());
console.log('PASS: duel scoring, isolation, successful resource theft, free teacher challenge.');server.close();
}catch(e){console.error(e);server.close();process.exit(1)}
