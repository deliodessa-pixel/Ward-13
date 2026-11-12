'use strict';
const http=require('http'), fs=require('fs'),path=require('path'),crypto=require('crypto');
const {TEAMS,ROOMS,EVIDENCE,PUZZLES,CHALLENGES,RULES,GLOSSARY}=require('./game-data');
const PORT=Number(process.env.PORT||3000),BASE=path.join(__dirname,'public');
const sessions=new Map(),subscribers=new Map();
// Best-effort local recovery for restarts when the instance filesystem survives.
// Render Free instances can still lose their ephemeral storage after a redeploy.
const SESSION_DIR=process.env.SESSION_DATA_DIR||path.join(__dirname,'.ward13-state');
try{fs.mkdirSync(SESSION_DIR,{recursive:true});for(const name of fs.readdirSync(SESSION_DIR)){if(!/^[A-F0-9]{6}\.json$/.test(name))continue;try{const data=JSON.parse(fs.readFileSync(path.join(SESSION_DIR,name),'utf8'));if(data&&data.id&&data.teams&&data.adminKey)sessions.set(data.id,data)}catch(err){console.warn('Skipping invalid session snapshot:',name,err.message)}}}catch(err){console.warn('Session snapshots unavailable:',err.message)}
function persistSession(s){try{const target=path.join(SESSION_DIR,s.id+'.json'),temp=target+'.tmp';fs.writeFileSync(temp,JSON.stringify(s));fs.renameSync(temp,target)}catch(err){console.warn('Session snapshot failed:',err.message)}}
const QRCode=require('./qr/QRCode'),QRLevel=require('./qr/QRCode/QRErrorCorrectLevel');
const random=(len=8)=>crypto.randomBytes(12).toString('hex').slice(0,len).toUpperCase();
const now=()=>Date.now();
const json=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))};
const fail=(message,status=400)=>({error:message,status});
function sessionView(s,player,teacher=false){
 const elapsed=s.status==='running'?now()-s.startedAt-s.pausedDuration-(s.pausedAt?now()-s.pausedAt:0):s.status==='paused'?s.pausedAt-s.startedAt-s.pausedDuration:s.status==='finished'?s.finishedElapsed:0;
 const remaining=Math.max(0,s.duration-elapsed);
 const teams=s.teams.filter(t=>t.players.length).map(t=>({id:t.id,name:t.name,emoji:t.emoji,players:t.players.length,members:teacher?t.players.map(p=>({id:p.id,name:p.name,online:p.lastSeen>now()-20000})):undefined,score:t.score,room:t.room,done:t.done,escapedAt:t.escapedAt,isolatedUntil:t.isolatedUntil,duels:t.duels,steals:t.steals,hints:t.hints,keys:t.keys,first:t.first}));
 const base={id:s.id,status:s.status,duration:s.duration,remaining,startedAt:s.startedAt,teams,teamNames:TEAMS,rooms:ROOMS,ruleSlides:RULES,events:s.events.slice(-80).reverse(),winning:'Highest points among escaped teams. Fastest escape breaks ties.',questionCount:CHALLENGES.length,teacherMode:teacher};
 if(teacher){base.teacherEmail=s.teacherEmail;base.emailDeliveryConfigured=Boolean(process.env.RESEND_API_KEY&&process.env.REPORT_FROM_EMAIL);base.players=s.teams.flatMap(t=>t.players.map(p=>({name:p.name,team:t.name,id:p.id,answers:p.answers,translations:p.translations})));base.encounters=s.encounters.slice(-50).reverse().map(e=>({...e,question:CHALLENGES[e.qid]?.question}));base.teacherChallenges=s.teacherChallenges;base.adminKey=s.adminKey;return base}
 if(!player)return base;
 const t=s.teams.find(t=>t.players.some(p=>p.id===player.id));
 if(!t)return base;
 const puzzle=PUZZLES[t.done]||null;
 const room=puzzle?.room??3;
 base.me={id:player.id,name:player.name,teamId:t.id,teamName:t.name,memberIndex:t.players.indexOf(player),myClues:puzzle?assigned(t,room,player):[],puzzle:puzzle?{...puzzle,answer:undefined,reason:undefined}:null,puzzleIndex:t.done,teamScore:t.score,teamRoom:t.room,teamHints:t.hints,teamKeys:t.keys,attempts:t.attempts[t.done]||0,isolatedUntil:t.isolatedUntil,esc:t.escapedAt,canDuel:t.duelsInitiated<2,canSteal:t.steals<2,encounter:activeEncounter(s,t),clueConfirmation:t.confirmations[t.done]||[],playerNames:t.players.map(p=>p.name)};
 if(base.me.encounter){let e=base.me.encounter;base.me.encounter={id:e.id,type:e.type,qid:e.qid,question:CHALLENGES[e.qid].question,options:CHALLENGES[e.qid].options,skill:CHALLENGES[e.qid].skill,deadline:e.deadline,answered:Boolean(e.answers[t.id]),teams:e.teams,role:e.initiator===t.id?'attacker':'defender'};}
 return base;
}
function assigned(team,room,player){const idx=team.players.findIndex(p=>p.id===player.id);const n=team.players.length;if(idx<0)return[];return EVIDENCE[room].filter((_,j)=>j%n===idx).map((c,j)=>({...c,id:`${room}-${idx}-${j}`}))}
function activeEncounter(s,t){return s.encounters.find(e=>e.status==='active'&&e.teams.includes(t.id))||null}
function event(s,type,text,team=null){s.events.push({at:now(),type,text,team});if(s.events.length>500)s.events.shift()}
function update(s){persistSession(s);for(const res of subscribers.get(s.id)||[])try{res.write(`event: update\ndata: ${JSON.stringify({time:now()})}\n\n`)}catch{}}
function findSession(id){const s=sessions.get(String(id||'').toUpperCase());if(!s)throw fail('Session not found',404);return s}
function getUser(s,token){const player=s.teams.flatMap(t=>t.players).find(p=>p.token===token);if(!player)throw fail('Your session has expired. Join again.',403);player.lastSeen=now();return player}
function getTeacher(s,key){if(s.adminKey!==key)throw fail('Teacher key is incorrect',403)}
function teamOf(s,player){return s.teams.find(t=>t.players.some(p=>p.id===player.id))}
function canPlay(s,t){if(s.status!=='running')throw fail('Game is not running');if(t.escapedAt!=null)throw fail('Your team already escaped');if(t.isolatedUntil>now())throw fail('Your team is in isolation');if(activeEncounter(s,t))throw fail('Finish the active encounter first')}
function enterIsolation(s,t,reason){t.isolatedUntil=Math.max(now(),t.isolatedUntil)+15000;event(s,'isolation',`${t.name} entered isolation for 15 seconds (${reason}).`,t.id)}
function bestWinner(s){const escaped=s.teams.filter(t=>t.escapedAt!=null);return escaped.sort((a,b)=>b.score-a.score||a.escapedAt-b.escapedAt).map(t=>({name:t.name,score:t.score,escapedAt:t.escapedAt}));}
function finish(s){if(s.status==='finished')return;s.finishedElapsed=s.duration;s.status='finished';for(const e of s.encounters.filter(e=>e.status==='active'))resolveEncounter(s,e);event(s,'end','The lockdown has ended.');update(s);sendEmailReport(s).catch(e=>{console.error('Ward 13 report email:',e.message);event(s,'report','Automatic email delivery failed; download the CSV from Statistics.');update(s)})}
function tick(s){if(s.status==='running'){const r=sessionView(s).remaining;if(r<=0){finish(s);return}for(const e of s.encounters.filter(e=>e.status==='active'&&e.deadline<=now()))resolveEncounter(s,e);}}
function questionChoice(s,exclude=[]){const available=CHALLENGES.map((x,i)=>i).filter(i=>!exclude.includes(i));return available[Math.floor(Math.random()*available.length)]??0;}
function beginEncounter(s,initiator,target,type,resource=null,teacher=false){if(s.status!=='running')throw fail('Game must be running');if(target.escapedAt!=null||target.isolatedUntil>now()||activeEncounter(s,target))throw fail('Target team is unavailable');if(!teacher&&(!initiator||initiator.escapedAt!=null||initiator.isolatedUntil>now()||activeEncounter(s,initiator)))throw fail('Your team is unavailable');
 const relevant=type==='duel'||type==='theft'?[initiator.id,target.id]:[target.id];const excluded=s.encounters.flatMap(e=>relevant.some(id=>e.teams.includes(id))?[e.qid]:[]);
 const e={id:random(10),type,resource,initiator:initiator?.id||'TEACHER',teams:type==='duel'||type==='theft'?[initiator.id,target.id]:[target.id],qid:questionChoice(s,excluded),created:now(),deadline:now()+30000,answers:{},status:'active',teacher};s.encounters.push(e);event(s,'challenge',`${teacher?'Teacher':initiator.name} challenged ${target.name}${type==='duel'?' to a duel':''}.`,target.id);update(s);return e}
function resolveEncounter(s,e){if(e.status!=='active')return;e.status='resolved';e.ended=now();const q=CHALLENGES[e.qid];const correct=e.teams.filter(id=>e.answers[id]?.choice===q.answer).sort((a,b)=>e.answers[a].at-e.answers[b].at);const winner=e.type==='theft'?(e.answers[e.initiator]?.choice===q.answer?e.initiator:null):(correct[0]||null);e.winner=winner;
 const target=s.teams.find(t=>t.id===e.teams[e.teams.length-1]);
 if(e.type==='duel'){
  const other=s.teams.find(t=>t.id===e.teams[0]);
  for(const t of [other,target]){if(t.id===winner){if(t.duelWins<2){t.score+=75;t.duelWins++}}else if(t.receivedDuelIsolation<2){enterIsolation(s,t,'duel');t.receivedDuelIsolation++}}
  event(s,'duel',winner?`${s.teams.find(t=>t.id===winner).name} won the duel (+75 points, if within reward cap).`:'Both teams failed the duel.',winner);
 }else if(e.type==='theft'){
  const attacker=s.teams.find(t=>t.id===e.initiator);
  if(winner===attacker.id){target[e.resource]--;attacker[e.resource]++;event(s,'theft',`${attacker.name} stole a ${e.resource==='keys'?'bonus key':'hint credit'} from ${target.name}.`,attacker.id)}
  else{enterIsolation(s,attacker,'failed theft');event(s,'theft',`${attacker.name} failed to steal from ${target.name}.`,attacker.id)}
 }else if(e.type==='teacher'){
  if(!winner){enterIsolation(s,target,'teacher challenge');event(s,'teacher',`${target.name} failed the teacher challenge.`,target.id)}else event(s,'teacher',`${target.name} passed the teacher challenge.`,target.id)
 }
 update(s);
}
function act(s,b){const action=b.action;
 if(action==='join'){
  if(s.status!=='lobby')throw fail('Lobby is closed');const name=String(b.name||'').trim().replace(/[<>]/g,'').slice(0,26);if(name.length<2)throw fail('Enter your name (at least 2 characters)');const t=s.teams.find(t=>t.id===b.team);if(!t)throw fail('Choose a team');if(t.players.length>=5)throw fail('This team is full');if(t.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))throw fail('Name already used on this team');const player={id:random(12),token:random(32),name,answers:[],translations:{},lastSeen:now()};t.players.push(player);event(s,'join',`${name} joined ${t.name}.`,t.id);update(s);return{token:player.token,id:player.id};
 }
 if(action==='teacher'){
  getTeacher(s,b.key);
  if(b.op==='start'){
   if(s.status!=='lobby')throw fail('Only a lobby can be started');const bad=s.teams.filter(t=>t.players.length>0&&t.players.length<3);if(bad.length)throw fail('Every active team must have 3–5 players: '+bad.map(t=>t.name).join(', '));if(!s.teams.some(t=>t.players.length))throw fail('No teams have joined');s.status='running';s.startedAt=now();event(s,'start','The isolation protocol has begun.');
  }else if(b.op==='pause'){
   if(s.status!=='running')throw fail('Game is not running');s.status='paused';s.pausedAt=now();event(s,'pause','Game paused by teacher.');
  }else if(b.op==='resume'){
   if(s.status!=='paused')throw fail('Game is not paused');const delay=now()-s.pausedAt;s.pausedDuration+=delay;for(const t of s.teams)t.isolatedUntil=t.isolatedUntil>0?t.isolatedUntil+delay:0;for(const e of s.encounters.filter(e=>e.status==='active'))e.deadline+=delay;s.status='running';s.pausedAt=0;event(s,'resume','Game resumed.');
  }else if(b.op==='extend'){
   if(!['running','paused'].includes(s.status))throw fail('Game is not active');s.duration+=Math.min(300000,Math.max(1000,Number(b.ms)||60000));event(s,'time','Teacher extended the time.');
  }else if(b.op==='release'){
   const t=s.teams.find(t=>t.id===b.team);if(!t)throw fail('No such team');t.isolatedUntil=0;event(s,'release',`Teacher released ${t.name} from isolation.`,t.id);
  }else if(b.op==='challenge'){
   const target=s.teams.find(t=>t.id===b.team);if(!target||!target.players.length)throw fail('Choose an active team');beginEncounter(s,null,target,'teacher',null,true);s.teacherChallenges++;
  }else if(b.op==='finish')finish(s);
  else throw fail('Unknown teacher action');update(s);return{ok:true};
 }
 const p=getUser(s,b.token),t=teamOf(s,p);
 if(action==='move'){
  if(s.status!=='lobby')throw fail('Team selection closed');const dest=s.teams.find(x=>x.id===b.team);if(!dest||dest.players.length>=5)throw fail('Team unavailable');if(dest.players.some(x=>x.name.toLowerCase()===p.name.toLowerCase()))throw fail('A player with this name is already there');t.players=t.players.filter(x=>x.id!==p.id);dest.players.push(p);event(s,'join',`${p.name} moved to ${dest.name}.`);update(s);return{ok:true};
 }
 if(action==='view_word'){p.translations[b.word]=(p.translations[b.word]||0)+1;return{ok:true}}
 if(action==='confirm'){
  canPlay(s,t);const a=t.confirmations[t.done]||(t.confirmations[t.done]=[]);if(!a.includes(p.id))a.push(p.id);update(s);return{ok:true};
 }
 if(action==='hint'){
  canPlay(s,t);if(t.score<10&&t.hints<=0)throw fail('Not enough points for a hint');const free=t.hints>0;if(free)t.hints--;else t.score-=10;t.hintUsed[t.done]=true;event(s,'hint',`${t.name} opened a hint.`,t.id);update(s);return{hint:`Look for ${PUZZLES[t.done].evidence}.`,free};
 }
 if(action==='answer'){
  canPlay(s,t);if(t.done>=PUZZLES.length)throw fail('Already completed');const q=PUZZLES[t.done];const original=String(b.value??'');let correct=false;
  if(q.type==='multiple')correct=Number(b.value)===q.answer;
  if(q.type==='code')correct=original.replace(/\D/g,'')===q.answer;
  if(q.type==='order')correct=Array.isArray(b.value)&&JSON.stringify(b.value)===JSON.stringify(q.answer);
  t.attempts[t.done]=(t.attempts[t.done]||0)+1;p.answers.push({at:now(),puzzle:t.done,value:b.value,correct,skill:q.skill});
  if(!correct){event(s,'attempt',`${t.name} attempted ${q.title}.`,t.id);update(s);return{correct:false,feedback:'Not quite. Compare your team’s evidence and try again.'}}
  const bonus=t.attempts[t.done]===1?25:0;const score=100+50+bonus;t.score+=score;t.done++;t.room=t.done>=8?4:PUZZLES[t.done].room+1;event(s,'solve',`${t.name} solved ${q.title} (+${score} points).`,t.id);
  if(t.done>=8){t.escapedAt=s.duration-sessionView(s).remaining;event(s,'escape',`${t.name} ESCAPED Ward 13 with ${t.score} points!`,t.id)}
  update(s);return{correct:true,feedback:q.reason,score};
 }
 if(action==='duel'){
  canPlay(s,t);if(t.duelsInitiated>=2)throw fail('Your team has used both duel challenges');if(t.lastChallenge>now()-45000)throw fail('Challenge cooldown still active');const target=s.teams.find(x=>x.id===b.target);if(!target||target===t||!target.players.length)throw fail('Select another team');if(target.escapedAt!=null||target.isolatedUntil>now()||activeEncounter(s,target))throw fail('Target is unavailable');if(t.receivedDuelIsolation>=2&&target.receivedDuelIsolation>=2)throw fail('Both teams reached their penalty protection limit');t.duelsInitiated++;t.duels++;target.duels++;t.lastChallenge=now();beginEncounter(s,t,target,'duel');return{ok:true};
 }
 if(action==='theft'){
  canPlay(s,t);if(t.steals>=2)throw fail('You have used both theft attempts');if(t.lastChallenge>now()-45000)throw fail('Challenge cooldown still active');const target=s.teams.find(x=>x.id===b.target);if(!target||target===t||!target.players.length||target.escapedAt!=null||activeEncounter(s,target)||target.isolatedUntil>now())throw fail('Target unavailable');const resource=b.resource==='keys'?'keys':'hints';const cost=resource==='keys'?100:50;if(target[resource]<1)throw fail('This team has no available resource');if(t.score<cost)throw fail('Not enough points');t.score-=cost;t.steals++;t.lastChallenge=now();beginEncounter(s,t,target,'theft',resource);return{ok:true};
 }
 if(action==='encounter_answer'){
  const e=activeEncounter(s,t);if(!e)throw fail('No active challenge');if(e.type==='theft'&&e.initiator!==t.id)throw fail('This team is defending its resource');if(e.answers[t.id])throw fail('Team has already answered');if(now()>e.deadline){resolveEncounter(s,e);throw fail('Time is up')};e.answers[t.id]={choice:Number(b.choice),at:now()};p.answers.push({at:now(),challenge:e.qid,value:Number(b.choice),correct:Number(b.choice)===CHALLENGES[e.qid].answer,skill:CHALLENGES[e.qid].skill});if(e.teams.length===1||e.type==='theft'||e.teams.every(id=>e.answers[id]))resolveEncounter(s,e);update(s);return{ok:true};
 }
 throw fail('Unknown action');
}
function create(email){let id;do{id=random(6)}while(sessions.has(id));const s={id,teacherEmail:email,adminKey:random(24),duration:1200000,status:'lobby',startedAt:0,pausedAt:0,pausedDuration:0,finishedElapsed:0,teams:TEAMS.map(x=>({...x,players:[],score:0,room:0,done:0,first:0,hints:1,keys:1,attempts:{},hintUsed:{},confirmations:{},duels:0,duelWins:0,receivedDuelIsolation:0,duelsInitiated:0,steals:0,lastChallenge:0,isolatedUntil:0,escapedAt:null})),events:[],encounters:[],teacherChallenges:0};sessions.set(id,s);persistSession(s);return s}
function reportCSV(s){const rows=[['Team','Student','Score','Room','Escaped ms','Correct','Incorrect','Translations opened','Duels','Steals','Hints']];for(const t of s.teams)for(const pl of t.players)rows.push([t.name,pl.name,t.score,t.room,t.escapedAt??'',pl.answers.filter(x=>x.correct).length,pl.answers.filter(x=>!x.correct).length,Object.values(pl.translations).reduce((a,b)=>a+b,0),t.duels,t.steals,t.hints]);return '\ufeff'+rows.map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n')}
async function sendEmailReport(s){if(!process.env.RESEND_API_KEY||!process.env.REPORT_FROM_EMAIL){event(s,'report','CSV report ready for teacher download. Email provider is not configured.');update(s);return}const csv=reportCSV(s);const file=Buffer.from(csv,'utf8').toString('base64');const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.REPORT_FROM_EMAIL,to:[s.teacherEmail],subject:'Ward 13 classroom results · '+s.id,html:'<p>Your Ward 13 session has ended. The classroom results are attached as CSV.</p>',attachments:[{filename:'ward13-results-'+s.id+'.csv',content:file}]})});if(!response.ok)throw Error('Email service returned '+response.status);event(s,'report','Final statistics emailed to '+s.teacherEmail);update(s)}
function body(req){return new Promise((resolve,reject)=>{let value='';req.on('data',x=>{value+=x;if(value.length>64000){reject(fail('Request too large',413));req.destroy()}});req.on('end',()=>{try{resolve(JSON.parse(value||'{}'))}catch{reject(fail('Invalid JSON'))}})})}
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),p=url.pathname;
  if(p==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,version:'2.0.0',sessions:sessions.size});
  if(p==='/api/create'&&req.method==='POST'){const b=await body(req);const email=String(b.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw fail('Enter a valid teacher email address');const s=create(email);return json(res,200,{id:s.id,key:s.adminKey})}
  if(p==='/api/session'&&req.method==='GET'){const s=findSession(url.searchParams.get('code'));tick(s);const key=url.searchParams.get('key');const token=url.searchParams.get('token');const teacher=key&&key===s.adminKey;const player=token?getUser(s,token):null;return json(res,200,sessionView(s,player,teacher));}
  if(p==='/api/action'&&req.method==='POST'){const b=await body(req),s=findSession(b.code);tick(s);return json(res,200,act(s,b))}
  if(p==='/api/qr'&&req.method==='GET'){const code=String(url.searchParams.get('code')||'');const s=findSession(code);const protocol=String(req.headers['x-forwarded-proto']||'http').split(',')[0]==='https'?'https':'http';const joinUrl=`${process.env.PUBLIC_URL||(protocol+'://'+(req.headers.host||'localhost:'+PORT))}/student?code=${encodeURIComponent(s.id)}`;const qr=new QRCode(-1,QRLevel.M);qr.addData(joinUrl);qr.make();const n=qr.getModuleCount(),size=n+8;let rectangles='';for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))rectangles+=`<rect x="${x+4}" y="${y+4}" width="1" height="1"/>`;res.writeHead(200,{'content-type':'image/svg+xml','cache-control':'no-store'});return res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="white"/><g fill="#19372e">${rectangles}</g></svg>`)}
  if(p==='/api/glossary'&&req.method==='GET')return json(res,200,GLOSSARY);
  if(p==='/api/stream'&&req.method==='GET'){const s=findSession(url.searchParams.get('code'));const key=url.searchParams.get('key'),token=url.searchParams.get('token');if(key!==s.adminKey&&!s.teams.some(t=>t.players.some(p=>p.token===token)))throw fail('Not authorized',403);res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive','x-accel-buffering':'no','access-control-allow-origin':'*'});res.write('event: update\ndata: {}\n\n');const subs=subscribers.get(s.id)||new Set();subs.add(res);subscribers.set(s.id,subs);req.on('close',()=>subs.delete(res));return;}
  if(p==='/api/report'&&req.method==='GET'){const s=findSession(url.searchParams.get('code'));getTeacher(s,url.searchParams.get('key'));res.writeHead(200,{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="ward13-results.csv"'});return res.end(reportCSV(s));}
  let filename=p==='/'?'index.html':p==='/teacher'?'teacher.html':p==='/student'?'student.html':p.slice(1);const target=path.resolve(BASE,filename);if(!target.startsWith(BASE+path.sep))throw fail('Not found',404);const buf=fs.readFileSync(target);res.writeHead(200,{'content-type':mime[path.extname(target)]||'application/octet-stream','cache-control':'no-store'});return res.end(buf)
 }catch(e){return json(res,e.status||500,{error:e.error||e.message||'Server error'})}
});
const gameTicker=setInterval(()=>{for(const s of sessions.values())tick(s)},500);gameTicker.unref();
server.listen(PORT,'0.0.0.0',()=>console.log(`WARD 13 listening on http://localhost:${PORT}`));
module.exports={server,create,act,sessionView,assigned,resolveEncounter,bestWinner};
