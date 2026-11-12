'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const port=31000+Math.floor(Math.random()*1000);
const child=spawn(process.execPath,['server.js'],{cwd:__dirname,env:{...process.env,PORT:String(port),SESSION_DATA_DIR:'/tmp/ward13-smoke-'+port},stdio:['ignore','pipe','pipe']});
let errors='';child.stderr.on('data',x=>errors+=x);
const base='http://127.0.0.1:'+port;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function api(p,data){const r=await fetch(base+p,data?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}:{});const txt=await r.text();let j;try{j=JSON.parse(txt)}catch{j=txt};if(!r.ok)throw Error(p+' '+r.status+' '+txt);return j}
(async()=>{try{
 let ready=false;for(let i=0;i<40;i++){try{const h=await api('/api/health');if(h.ok){ready=true;break}}catch{}await wait(100)}assert.ok(ready,'server failed '+errors);
 const email='teacher@example.com';const created=await api('/api/create',{email});assert.match(created.id,/^[A-F0-9]{6}$/);assert.ok(created.key.length>10);
 const initial=await api('/api/session?code='+created.id+'&key='+created.key);assert.equal(initial.teacherEmail,email);assert.equal(initial.status,'lobby');assert.equal(initial.teams.length,0);
 const qr=await fetch(base+'/api/qr?code='+created.id);assert.equal(qr.status,200);assert.match(qr.headers.get('content-type'),/svg/);assert.match(await qr.text(),/<svg/);
 const teamIDs=initial.teamNames.slice(0,10).map(t=>t.id);let tokens=[];
 for(let i=0;i<40;i++){const team=teamIDs[Math.floor(i/4)];const joined=await api('/api/action',{code:created.id,action:'join',name:'Student '+(i+1),team});tokens.push(joined.token)}
 const view=await api('/api/session?code='+created.id+'&key='+created.key);assert.equal(view.teams.length,10);assert.equal(view.teams.reduce((n,t)=>n+t.players,0),40);
 assert.ok(view.teams.every(t=>t.players===4));
 await api('/api/action',{code:created.id,key:created.key,action:'teacher',op:'start'});
 const started=await api('/api/session?code='+created.id+'&key='+created.key);assert.equal(started.status,'running');
 const player=await api('/api/session?code='+created.id+'&token='+tokens[0]);assert.equal(player.me.myClues.length,2);assert.equal(player.me.puzzleIndex,0);
 const answer=await api('/api/action',{code:created.id,token:tokens[0],action:'answer',value:1});assert.equal(answer.correct,true);
 const report=await fetch(base+'/api/report?code='+created.id+'&key='+created.key);assert.equal(report.status,200);const csv=await report.text();assert.match(csv,/Student 40/);
 const teacherPage=await fetch(base+'/teacher');assert.equal(teacherPage.status,200);const js=await fetch(base+'/teacher.js');const source=await js.text();assert.match(source,/teacher-email/);assert.match(source,/api\/create',\{email\}/);
 console.log('PASS: live HTTP create/email/QR, 40 students in 10 teams, start, puzzle answer, CSV and teacher UI.');
 }catch(e){console.error('SMOKE TEST FAILED:',e.stack||e,errors);process.exitCode=1}finally{child.kill('SIGTERM')}})();
