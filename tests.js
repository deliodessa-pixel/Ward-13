const assert=require('node:assert/strict');
process.env.PORT='0';
const {server,create,act,sessionView,assigned}=require('./server');
const {PUZZLES,CHALLENGES}=require('./game-data');
function test(){const s=create();assert.equal(PUZZLES.length,8);assert.equal(CHALLENGES.length,30);const t=s.teams[0];
const ps=['Ava','Ben','Cara'].map(name=>act(s,{action:'join',name,team:t.id}));assert.equal(t.players.length,3);for(const p of t.players)assert.ok(p.token);
assert.deepEqual(t.players.map(p=>assigned(t,0,p).length),[2,2,1]);
assert.deepEqual([0,1,2,3,4].sort(),t.players.flatMap(p=>assigned(t,0,p)).map(x=>Number(x.title.charCodeAt(0)-65)).sort());
const t2=s.teams[1];for(const name of ['One','Two','Three','Four','Five'])act(s,{action:'join',name,team:t2.id});assert.deepEqual(t2.players.map(p=>assigned(t2,0,p).length),[1,1,1,1,1]);
act(s,{action:'teacher',key:s.adminKey,op:'start'});assert.equal(s.status,'running');
const p=t.players[0];const ans=(value)=>act(s,{action:'answer',token:p.token,value});
assert.equal(ans(1).correct,true);assert.equal(t.done,1);assert.equal(ans('2407').correct,true);assert.equal(t.done,2);
assert.equal(ans(1).correct,true);assert.equal(ans(2).correct,true);assert.equal(ans(1).correct,true);assert.equal(ans(1).correct,true);
assert.equal(ans([3,2,0,1]).correct,true);assert.equal(ans(2).correct,true);assert.equal(t.done,8);assert.ok(t.escapedAt!==null);assert.equal(t.score,1400);
assert.equal(sessionView(s,p).me.esc,t.escapedAt);
console.log('PASS: 8 story puzzles, scores, team-size evidence allocation, session and escape state.');server.close();}
try{test()}catch(e){console.error(e);server.close();process.exit(1)}
