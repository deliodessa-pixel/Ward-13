let CODE=localStorage.getItem('w13_v2_teacher_code')||'', KEY=localStorage.getItem('w13_v2_teacher_key')||'', state=null,tab='lobby',rule=0,sort='score',descending=true,expanded='',pending=false;
const root=$('teacher-root');
const origin=location.origin;
async function create(){
  try{
    const input=$('teacher-email');
    const email=String(input?.value||localStorage.getItem('w13_v2_teacher_email')||'').trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      msg('Please enter a valid teacher email address.');
      input?.focus();
      return;
    }
    const x=await api('/api/create',{email});
    CODE=x.id;KEY=x.key;
    localStorage.setItem('w13_v2_teacher_email',email);
    localStorage.setItem('w13_v2_teacher_code',CODE);
    localStorage.setItem('w13_v2_teacher_key',KEY);
    tab='lobby';await load();
    if(state)connectEvents(CODE,{key:KEY},load);
  }catch(e){msg(e.message)}
}
async function load(){
  if(!CODE||!KEY){CODE='';KEY='';state=null;render();return}
  try{
    const qs=new URLSearchParams({code:CODE,key:KEY});
    state=await api('/api/session?'+qs);
    render();
  }catch(e){
    state=null;
    if(window.eventStream){window.eventStream.close();window.eventStream=null;}
    const error=String(e.message||'');
    if(/session not found|not found|invalid session|teacher key/i.test(error)){
      CODE='';KEY='';
      localStorage.removeItem('w13_v2_teacher_code');
      localStorage.removeItem('w13_v2_teacher_key');
      render();
      msg('Your previous session expired. Please create a new game.');
    }else{
      render();
      msg('Could not load the session: '+error);
    }
  }
}
async function teacherOp(op,extra={}){try{await api('/api/action',{code:CODE,key:KEY,action:'teacher',op,...extra});await load()}catch(e){msg(e.message)}}
function render(){if(!CODE||!state){root.innerHTML=`<section class="hero"><div><span class="caps">TEACHER CONTROL ROOM</span><h1>WARD 13</h1><p>The Isolation Protocol · Live multiplayer escape room for inference and reference.</p></div></section><div class="panel stack" style="max-width:650px;margin:24px auto;text-align:center"><h2>Start a classroom investigation</h2><p>Generate a session code and QR link. Students join their own team from their phones. The timer stays paused until you start.</p><label for="teacher-email" class="caps" style="text-align:left">Teacher email</label><input class="field" id="teacher-email" type="email" autocomplete="email" placeholder="you@example.com" required value="${esc(localStorage.getItem('w13_v2_teacher_email')||'')}"><button class="btn" onclick="create()">Create session &amp; show QR →</button><p class="small muted">Your email will be linked to the session report. CSV downloads work immediately; automatic email delivery requires separate email service configuration.</p></div>`;return}
 const attendees=state.teams.reduce((a,t)=>a+t.players,0),ready=state.teams.filter(t=>t.players>=3).length,problem=state.teams.filter(t=>t.players>0&&t.players<3);$('head-status').textContent=state.status.toUpperCase();
 root.innerHTML=`<div class="hero" style="min-height:185px;margin-bottom:18px"><div><span class="caps">ST. HOLLOW'S HOSPITAL · ${esc(state.status.toUpperCase())}</span><h1 style="font-size:42px">WARD 13</h1><p style="margin:4px 0">A 20-minute cooperative mystery with competitive challenges</p></div></div><div class="grid four" style="margin-bottom:18px"><div class="stat"><strong>${fmt(state.remaining)}</strong><span class="small muted">Time remaining</span></div><div class="stat"><strong>${attendees}</strong><span class="small muted">Students joined</span></div><div class="stat"><strong>${ready}</strong><span class="small muted">Teams ready</span></div><div class="stat"><strong>${state.teams.length}</strong><span class="small muted">Active teams</span></div></div>
 <div class="tabs">${[['lobby','Join & Roster'],['briefing','Rules Presentation'],['leaderboard','Leaderboard'],['feed','Live Feed'],['encounters','Duels & Steals'],['statistics','Statistics'],['controls','Teacher Controls']].map(([id,name])=>`<button class="tab ${tab===id?'active':''}" data-tab="${id}">${name}</button>`).join('')}</div><div class="panel" id="tab-content"></div>`;
 root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;showTab()});showTab();
}
function showTab(){const el=$('tab-content');if(!el||!state)return;const ready=state.teams.filter(t=>t.players>=3).length,problem=state.teams.filter(t=>t.players>0&&t.players<3);
 if(tab==='lobby'){const join=`${origin}/student?code=${CODE}`;el.innerHTML=`<div class="between"><div><h2>Join the investigation</h2><p class="muted">Students sit together and choose the same team name.</p></div><span class="pill">SESSION ${esc(CODE)}</span></div>
 <div class="grid two" style="margin:15px 0"><div class="qr"><img src="/api/qr?code=${CODE}" alt="Working join QR code" width="170" height="170"><div><strong>Scan to join</strong><p class="small muted">Code: <strong>${esc(CODE)}</strong></p><button class="btn tiny ghost" id="copy-link">Copy student link</button><p class="small" style="overflow-wrap:anywhere">${esc(join)}</p></div></div><div class="notice">Each team can have 3 to 5 students. Students choose a team themselves. All members of the same table should choose the same name. Start the game only after everyone is ready.</div></div>
 ${state.teams.filter(t=>t.players).length?`<h3>Connected teams</h3><div class="grid three" style="margin:12px 0 20px">${state.teams.map(t=>`<div class="stat"><strong style="font-size:17px">${t.emoji} ${esc(t.name)}</strong><span class="small">${t.players}/5 students</span><p class="small muted" style="margin-bottom:0">${t.members.map(p=>esc(p.name)).join(' · ')||'Available'}</p></div>`).join('')}</div>`:`<div class="notice">Waiting for students to join. All twelve team names are available. The QR code and join link above are ready to share.</div>`}
 ${state.status==='lobby'?`<div class="between" style="margin-top:15px"><div>${state.teams.filter(t=>t.players>0&&t.players<3).length?`<span class="pill red">Teams needing players: ${state.teams.filter(t=>t.players>0&&t.players<3).map(t=>esc(t.name)).join(', ')}</span>`:'<span class="pill">Ready check: minimum 3 per active team</span>'}</div><button class="btn" id="start" ${!ready||problem.length?'disabled':''}>▶ START LOCKDOWN</button></div>`:'<div class="notice success">The game has started. You can monitor it in the leaderboard.</div>'}`;
 $('copy-link').onclick=()=>clipboard(join);if($('start'))$('start').onclick=()=>{if(confirm('Start the 20-minute lockdown for all teams?'))teacherOp('start')};
 }else if(tab==='briefing'){const r=state.ruleSlides[rule];el.innerHTML=`<div class="between"><div><h2>Teacher briefing</h2><p class="muted">Present all nine rules before the lockdown starts.</p></div><span class="pill">RULE ${rule+1} / 9</span></div><div class="rule-stage" style="margin:15px 0"><div class="symbol">${['🕯️','🤝','🔎','🇮🇱','⚔️','🗝️','🚪','💡','🏆'][rule]}</div><h2>${esc(r.title)}</h2><p style="font-size:19px">${esc(r.en)}</p><details><summary class="small" style="cursor:pointer">עברית · Hebrew explanation</summary><div lang="he" dir="rtl" style="margin-top:8px">${esc(r.he)}</div></details></div><div class="between"><button class="btn ghost" id="prev" ${rule===0?'disabled':''}>← Previous</button><button class="btn" id="next" ${rule===8?'disabled':''}>Next rule →</button></div>`;$('prev').onclick=()=>{rule--;showTab()};$('next').onclick=()=>{rule++;showTab()};
 }else if(tab==='leaderboard'){
 let arr=[...state.teams].sort((a,b)=>{let A=a[sort]??0,B=b[sort]??0;return (descending?B-A:A-B)||a.name.localeCompare(b.name)});el.innerHTML=`<div class="between"><h2>Live leaderboard</h2><span class="pill">${state.teams.filter(t=>t.escapedAt!==null).length} escaped</span></div><p class="muted small">Click a column heading to sort. Click a team to expand its members.</p><div class="tablewrap"><table><thead><tr>${[['name','Team'],['players','Players'],['room','Room'],['score','Points'],['done','Puzzles'],['escapedAt','Escape time']].map(([id,label])=>`<th data-sort="${id}">${label} ${sort===id?(descending?'▼':'▲'):''}</th>`).join('')}</tr></thead><tbody>${arr.map((t,i)=>`<tr><td><button class="btn tiny ghost" data-expand="${t.id}">${esc(t.emoji)} ${esc(t.name)} ${expanded===t.id?'▾':'▸'}</button>${expanded===t.id?`<div class="small muted" style="white-space:normal;max-width:250px">${t.members.map(m=>esc(m.name)).join(', ')}</div>`:''}</td><td>${t.players}</td><td>${t.escapedAt!==null?'Escaped':t.room||'Lobby'}</td><td><strong>${t.score}</strong></td><td>${t.done}/8</td><td>${t.escapedAt===null?'—':fmt(t.escapedAt)}</td></tr>`).join('')}</tbody></table></div><p class="small muted">Winner: highest points among escaped teams. Escape time only breaks ties.</p>`;
 el.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{const k=b.dataset.sort;descending=sort===k?!descending:true;sort=k;showTab()});el.querySelectorAll('[data-expand]').forEach(b=>b.onclick=()=>{expanded=expanded===b.dataset.expand?'':b.dataset.expand;showTab()});
 }else if(tab==='feed'){
 el.innerHTML=`<h2>Live activity</h2><p class="muted">Latest actions across all active teams.</p>${state.events.length?state.events.map(e=>`<div class="log"><span class="small muted">${new Date(e.at).toLocaleTimeString()}</span><span>${esc(e.type==='escape'?'🏆':e.type==='challenge'?'⚔️':e.type==='isolation'?'🔒':'📋')} ${esc(e.text)}</span></div>`).join(''):'<p>No activity yet.</p>'}`;
 }else if(tab==='encounters'){
 el.innerHTML=`<h2>Challenges and thefts</h2><p class="muted">All encounters are recorded, including teacher-initiated questions and isolation.</p><div class="tablewrap"><table><thead><tr><th>Time</th><th>Type</th><th>Question</th><th>Status</th><th>Winning team</th></tr></thead><tbody>${state.encounters.map(e=>`<tr><td>${new Date(e.created).toLocaleTimeString()}</td><td>${esc(e.type)}</td><td style="max-width:330px;white-space:normal">${esc(e.question)}</td><td>${esc(e.status)}</td><td>${esc(state.teams.find(t=>t.id===e.winner)?.name||'—')}</td></tr>`).join('')}</tbody></table></div>`;
 }else if(tab==='statistics'){
 let rows=state.players||[];el.innerHTML=`<div class="between"><h2>Student reading analytics</h2><button class="btn tiny" id="csv">Download CSV ↓</button></div><p class="muted small">Each row represents an individual student. Translation taps are counted for teaching insight, not penalties.</p><div class="tablewrap"><table><thead><tr><th>Student</th><th>Team</th><th>Correct</th><th>Incorrect</th><th>Reference</th><th>Inference</th><th>Word taps</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.team)}</td><td>${p.answers.filter(x=>x.correct).length}</td><td>${p.answers.filter(x=>!x.correct).length}</td><td>${p.answers.filter(x=>x.skill?.includes('Reference')).length}</td><td>${p.answers.filter(x=>x.skill?.includes('Inference')).length}</td><td>${Object.values(p.translations||{}).reduce((a,b)=>a+b,0)}</td></tr>`).join('')}</tbody></table></div>`;$('csv').onclick=()=>{location.href='/api/report?'+new URLSearchParams({code:CODE,key:KEY})};
 }else if(tab==='controls'){
 el.innerHTML=`<h2>Teacher controls</h2><p class="muted">The teacher can challenge any active team for free, pause the whole game, extend the time, or release an isolated group.</p><div class="grid two"><div class="stack"><label for="target" class="caps">Choose team</label><select id="target" class="field">${state.teams.map(t=>`<option value="${t.id}">${esc(t.emoji)} ${esc(t.name)} (${t.players} players)</option>`).join('')}</select><button id="teacher-challenge" class="btn">⚔ Free teacher challenge</button><button id="release" class="btn ghost">🔓 Release team from isolation</button></div><div class="stack"><button id="pause" class="btn ghost">${state.status==='paused'?'▶ Resume':'⏸ Pause'} game</button><button id="extend" class="btn ghost">⏱ Add 1 minute</button><button id="finish" class="btn danger">■ End lockdown</button><button id="new" class="btn ghost">＋ Create a new session</button></div></div><div class="notice" style="margin-top:15px">Teacher challenges are free and award no points. An incorrect response or timeout sends that team into isolation for 15 seconds.</div>`;
 $('teacher-challenge').onclick=()=>teacherOp('challenge',{team:$('target').value});$('release').onclick=()=>teacherOp('release',{team:$('target').value});$('pause').onclick=()=>teacherOp(state.status==='paused'?'resume':'pause');$('extend').onclick=()=>teacherOp('extend',{ms:60000});$('finish').onclick=()=>confirm('End the game now?')&&teacherOp('finish');$('new').onclick=()=>confirm('Create a fresh session? The current session will no longer be shown on this device.')&&create();
 }
}
setInterval(()=>{if(state&&state.status==='running'){state.remaining=Math.max(0,state.remaining-1000);const box=document.querySelector('.stat strong');if(box)box.textContent=fmt(state.remaining)}},1000);
loadGlossary().then(async()=>{await load();if(CODE&&KEY)connectEvents(CODE,{key:KEY},load)});
