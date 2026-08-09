/* GitQuest - app: screens, terminal, animated graph, progression */
(function(){
'use strict';
const $ = id => document.getElementById(id);
const ALL_LEVELS = GQ_CHAPTERS.flatMap(ch => ch.levels.map(l => ({...l, chapter: ch})));

/* ================= persistent state ================= */
const DEFAULT_STATE = {
  levels:{},            // id -> {stars, done:true}
  xp:0,
  achievements:[],
  badges:[],
  counters:{ commits:0, merges:0, rebases:0, pushes:0, conflicts:0, branches:0, cherry:0, irebase:0, sandboxCmds:0 },
  streak:{ last:null, count:0 },
  daily:{ date:null, idx:0, progress:0, done:false },
  lastLevel:null,
  sound:true
};
let S = load();
function load(){
  try{ const d = JSON.parse(localStorage.getItem('gitquest')); if(d && d.counters) return Object.assign({}, DEFAULT_STATE, d); }catch(e){}
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}
function save(){ try{ localStorage.setItem('gitquest', JSON.stringify(S)); }catch(e){} }
function today(){ return new Date().toISOString().slice(0,10); }

/* ================= sounds (WebAudio, no files) ================= */
let AC = null;
function ac(){ if(!AC) AC = new (window.AudioContext||window.webkitAudioContext)(); return AC; }
function tone(freq, dur, type, vol, when, slide){
  if(!S.sound) return;
  try{
    const c = ac(), o = c.createOscillator(), g = c.createGain();
    o.type = type||'sine'; o.frequency.setValueAtTime(freq, c.currentTime + (when||0));
    if(slide) o.frequency.exponentialRampToValueAtTime(slide, c.currentTime + (when||0) + dur);
    g.gain.setValueAtTime(vol||.12, c.currentTime + (when||0));
    g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + (when||0) + dur);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime + (when||0)); o.stop(c.currentTime + (when||0) + dur + .05);
  }catch(e){}
}
const SFX = {
  commit(){ tone(520,.15,'sine',.14,0,380); },
  branch(){ tone(700,.08,'square',.06); tone(940,.08,'square',.06,.07); },
  checkout(){ tone(300,.18,'sine',.1,0,520); },
  merge(){ tone(220,.3,'sawtooth',.06,0,660); },
  error(){ tone(140,.22,'sawtooth',.08,0,90); },
  success(){ [523,659,784,1047].forEach((f,i)=>tone(f,.35,'sine',.1,i*.09)); },
  achievement(){ [660,880,990,1320,1760].forEach((f,i)=>tone(f,.25,'triangle',.09,i*.07)); },
  type(){ }
};

/* ================= screens ================= */
const screens = ['gq-landing','gq-map','gq-game'];
function show(id){ screens.forEach(s=>$(s).classList.toggle('gq-hidden', s!==id)); window.scrollTo(0,0); }

/* ================= game session ================= */
let E = null;             // engine
let LVL = null;           // current level def (null in sandbox)
let MODE = 'level';       // 'level' | 'sandbox'
let CTX = null;           // per-session context
let prevPos = {}, prevRefPos = {};   // for FLIP animations

function newCtx(){
  return { commands:[], okCommands:[], flags:{}, hints:0, errors:0, start:Date.now(), solved:false };
}
function ctxApi(){
  return {
    ran: p => CTX.okCommands.some(c => c.startsWith(p)),
    flags: CTX.flags,
    commands: CTX.commands
  };
}

function startLevel(id){
  const lvl = ALL_LEVELS.find(l=>l.id===id);
  if(!lvl) return;
  MODE='level'; LVL=lvl; E = new GitEngine(); CTX = newCtx();
  prevPos = {}; prevRefPos = {};
  lvl.setup(E);
  S.lastLevel = id; save();
  $('gq-sbar').classList.add('gq-hidden');
  $('gq-obj-card').classList.remove('gq-hidden');
  $('gq-complete').classList.add('gq-hidden');
  $('gq-hintbox').classList.remove('gq-hidden');
  $('gq-lvl-title').textContent = lvl.title;
  const idx = ALL_LEVELS.indexOf(lvl);
  $('gq-lvl-sub').textContent = `${lvl.chapter.title} · Level ${idx+1}/${ALL_LEVELS.length} · +${lvl.xp} XP`;
  $('gq-objective').innerHTML = lvl.obj + `<div class="gq-goal">🎯 Do this: <b>${lvl.goalText}</b></div>`;
  $('gq-hints').innerHTML = '';
  $('gq-hint').textContent = '💡 Need a hint?';
  $('gq-hint').style.animation = '';
  $('gq-out').innerHTML = '';
  termLine([{t:`Level: ${lvl.title}`, c:'head'}]);
  termLine([{t:'type "help" for available commands', c:'dim'}]);
  updChips(); renderAll(true);
  show('gq-game');
  setTimeout(()=>$('gq-in').focus(), 60);
}

function startSandbox(preset){
  MODE='sandbox'; LVL=null; E = new GitEngine(); CTX = newCtx();
  prevPos = {}; prevRefPos = {};
  (preset||sbPresets.fresh)(E);
  $('gq-sbar').classList.remove('gq-hidden');
  $('gq-obj-card').classList.add('gq-hidden');
  $('gq-complete').classList.add('gq-hidden');
  $('gq-hintbox').classList.add('gq-hidden');
  $('gq-lvl-title').textContent = 'Sandbox';
  $('gq-lvl-sub').textContent = 'free experimentation · everything is allowed';
  $('gq-out').innerHTML = '';
  termLine([{t:'Sandbox: any command, no objectives. Break things!', c:'head'}]);
  updChips(); renderAll(true);
  show('gq-game');
  setTimeout(()=>$('gq-in').focus(), 60);
}

const sbPresets = {
  fresh(e){},
  random(e){
    e.exec('git init');
    const n = 2+Math.floor(Math.random()*3);
    for(let i=0;i<n;i++){ e.exec('touch f'+i+'.txt'); e.exec('git add .'); e.exec(`git commit -m "commit ${i+1}"`); }
    if(Math.random()>.3){
      e.exec('git checkout -b feature');
      e.exec('touch feat.js'); e.exec('git add .'); e.exec('git commit -m "feature work"');
      if(Math.random()>.5){ e.exec('touch feat2.js'); e.exec('git add .'); e.exec('git commit -m "more feature"'); }
      e.exec('git checkout main');
      if(Math.random()>.5){ e.exec('touch m.js'); e.exec('git add .'); e.exec('git commit -m "main moves on"'); }
    }
  },
  branches(e){
    gqSeed(e, ['Initial commit','Add core','Fix bug']);
    e.exec('git checkout -b feature'); e.exec('touch f.js'); e.exec('git add .'); e.exec('git commit -m "Feature A"');
    e.exec('touch g.js'); e.exec('git add .'); e.exec('git commit -m "Feature B"');
    e.exec('git checkout main'); e.exec('touch h.js'); e.exec('git add .'); e.exec('git commit -m "Hotfix"');
  },
  remote(e){
    gqSeed(e, ['Initial commit','Setup']);
    e.exec('git remote add origin https://github.com/you/repo.git');
    e.exec('git push -u origin main');
    gqOriginAhead(e, 'Teammate pushed this');
  }
};

/* ================= terminal ================= */
const HISTORY = []; let hIdx = -1;
function termLine(parts, cmdEcho){
  const out = $('gq-out');
  if(cmdEcho !== undefined){
    const d = document.createElement('div');
    d.className='cmdline';
    const esc = cmdEcho.replace(/&/g,'&amp;').replace(/</g,'&lt;');
    d.innerHTML = `<span class="prompt">❯ </span>` + esc.replace(/^(git)(\s|$)/, '<span class="c-git">$1</span>$2');
    out.appendChild(d);
  }
  (parts||[]).forEach(p=>{
    const d = document.createElement('div');
    d.className = p.c || 'out';
    d.textContent = p.t;
    out.appendChild(d);
  });
  out.scrollTop = out.scrollHeight;
}
function termAction(text){
  const out = $('gq-out');
  const d = document.createElement('div');
  d.className = 'action';
  d.innerHTML = `<span class="ax">↳ what happened:</span> ${text.replace(/&/g,'&amp;').replace(/</g,'&lt;')}`;
  out.appendChild(d);
  out.scrollTop = out.scrollHeight;
}

const GIT_SUBS = ['init','status','add','commit','log','branch','checkout','switch','merge','rebase','cherry-pick','reset','revert','restore','stash','tag','remote','clone','fetch','pull','push','reflog','bisect','submodule','worktree'];
function candidates(line){
  const parts = line.split(/\s+/);
  if(parts.length === 1) return ['git ','touch ','mkdir ','edit ','ls','clear','help','pr '];
  if(parts[0]==='git'){
    if(parts.length === 2) return GIT_SUBS.map(s=>s+(s==='init'||s==='status'||s==='log'||s==='fetch'||s==='pull'||s==='push'||s==='reflog'?'':' '));
    const sub = parts[1];
    if(['checkout','switch','merge','rebase','branch'].includes(sub))
      return [...Object.keys(E.branches), ...Object.keys(E.remoteRefs), '-b ','-c ','-d ','-m ','--no-ff ','-i '];
    if(['add','restore'].includes(sub))
      return ['.', '--staged ', ...E.workdir.map(f=>f.name)];
    if(sub==='commit') return ['-m "','--amend '];
    if(sub==='cherry-pick' || sub==='revert' || sub==='reset')
      return ['HEAD~1','--soft ','--hard ', ...Object.keys(E.commits).map(c=>c.slice(0,7))];
    if(sub==='stash') return ['pop','list','apply','drop'];
    if(sub==='push' || sub==='pull') return ['-u ','origin ', ...Object.keys(E.branches)];
    if(sub==='remote') return ['add origin https://github.com/you/repo.git','-v'];
    if(sub==='bisect') return ['start','good','bad','reset'];
  }
  if(parts[0]==='pr') return ['create','review','merge'];
  if(parts[0]==='edit'||parts[0]==='touch') return E.workdir.map(f=>f.name);
  return [];
}
function ghostFor(line){
  if(!line) return '';
  const parts = line.split(/\s+/);
  const last = parts[parts.length-1];
  if(last === '') return '';
  const cands = candidates(parts.slice(0,-1).join(' ') || last);
  const pool = parts.length===1 ? candidates('') : cands;
  const hit = pool.find(c => c.startsWith(last) && c !== last);
  return hit ? hit.slice(last.length) : '';
}
function updGhost(){
  const v = $('gq-in').value;
  const g = ghostFor(v);
  $('gq-ghost').textContent = g ? v + g : '';
}
function updSuggest(){
  const box = $('gq-suggest');
  let sugg = [];
  if(!E.initialized) sugg = ['git init','git clone https://github.com/you/repo.git'];
  else if(E.merging && !E.merging.resolved) sugg = ['edit '+E.merging.conflictFiles[0], 'git status'];
  else if(E.merging) sugg = ['git commit -m "merge"'];
  else if(E.staging.length) sugg = ['git commit -m "message"','git status'];
  else if(E.workdir.length) sugg = ['git add .','git status'];
  else sugg = ['git status','git log','touch file.txt','git branch'];
  box.innerHTML = '';
  sugg.slice(0,3).forEach(s=>{
    const el = document.createElement('span');
    el.textContent = s;
    el.onclick = ()=>{ $('gq-in').value = s; $('gq-in').focus(); updGhost(); };
    box.appendChild(el);
  });
}

$('gq-in').addEventListener('keydown', ev=>{
  const inp = ev.target;
  if(ev.key==='Enter'){ const v = inp.value; inp.value=''; $('gq-ghost').textContent=''; runCommand(v); }
  else if(ev.key==='ArrowUp'){ ev.preventDefault(); if(HISTORY.length){ hIdx = Math.max(0, (hIdx<0?HISTORY.length:hIdx)-1); inp.value = HISTORY[hIdx]; setTimeout(updGhost); } }
  else if(ev.key==='ArrowDown'){ ev.preventDefault(); if(hIdx>=0){ hIdx++; inp.value = hIdx>=HISTORY.length ? (hIdx=-1, '') : HISTORY[hIdx]; updGhost(); } }
  else if(ev.key==='Tab' || (ev.key==='ArrowRight' && inp.selectionStart===inp.value.length)){
    const g = ghostFor(inp.value);
    if(g){ ev.preventDefault(); inp.value += g; updGhost(); }
    else if(ev.key==='Tab') ev.preventDefault();
  }
});
$('gq-in').addEventListener('input', updGhost);

/* ================= plain-language "what just happened" ================= */
function actionSummary(line, res){
  const p = line.split(/\s+/);
  const ev = res.events || [];
  const head = E.headLabel();
  // local file ops
  if(p[0]==='touch')  return `Created file "${p[1]}" in the working directory — Git isn't tracking it yet.`;
  if(p[0]==='mkdir')  return `Made a folder "${p[1].replace(/\/+$/,'')}/". Git only stores files, so add one inside to save it.`;
  if(p[0]==='edit')   return `Changed "${p[1]}" — it now shows as modified until you stage & commit it.`;
  if(p[0]!=='git')    return null;
  const sub = p[1];
  // read-only commands: no summary (avoid noise)
  if(['status','log','branch','remote','reflog','tag','stash'].includes(sub) && p.length<=2) return null;
  if(sub==='init')    return `Initialized a repository — the hidden .git folder now records your snapshots.`;
  if(sub==='add')     return `Staged your changes. They're queued for the next commit (green in Staging).`;
  if(ev.includes('mergecommit')) return `Created a merge commit that ties two branches together on "${head}".`;
  if(ev.includes('ff'))          return `Fast-forwarded "${head}" — it slid straight to the tip, no merge commit.`;
  if(sub==='commit' && line.includes('--amend'))   return `Replaced the last commit with a corrected one (new hash).`;
  if(ev.includes('commit') && sub==='commit')      return `Saved a snapshot on "${head}". HEAD and the branch moved forward.`;
  if(ev.includes('commit') && sub==='revert')      return `Added a new commit that undoes the old one — history is preserved.`;
  if(ev.includes('cherry'))      return `Copied that single commit onto "${head}" (a brand-new commit).`;
  if(ev.includes('rebase'))      return `Replayed your commits on top of the target — a clean, linear history.`;
  if(sub==='checkout' && line.includes('-b')) return `Created a branch and moved you onto it.`;
  if(ev.includes('branch') && sub==='branch') return `Created a branch label — you stayed where you are.`;
  if(ev.includes('head') || sub==='switch' || sub==='checkout') return `Moved HEAD — you're now on "${head}".`;
  if(sub==='reset')   return `Moved "${head}" to an earlier commit.`;
  if(sub==='restore') return `Reverted the file to its last saved state.`;
  if(ev.includes('push'))  return `Uploaded your commits — the remote's branch caught up to yours.`;
  if(ev.includes('fetch')) return `Downloaded the remote's latest into origin/* — your work is untouched.`;
  if(sub==='pull')    return `Fetched and merged the remote's changes into "${head}".`;
  if(sub==='clone')   return `Downloaded the whole repository and set up "origin" as the remote.`;
  if(ev.includes('stash'))   return `Shelved your uncommitted changes — working tree is clean now.`;
  if(ev.includes('unstash')) return `Brought your shelved changes back into the working directory.`;
  if(ev.includes('tag'))     return `Pinned a permanent label on this commit.`;
  return null;
}

/* ================= command processing ================= */
function bumpCounter(key, n){
  S.counters[key] = (S.counters[key]||0) + (n||1);
  // daily challenge progress
  const d = GQ_DAILY[S.daily.idx];
  if(d && d.key===key && !S.daily.done){
    S.daily.progress += (n||1);
    if(S.daily.progress >= d.target){ S.daily.done = true; awardXP(30); toast('🎯','Daily Challenge!','+30 XP'); }
  }
  save();
}

function runCommand(raw){
  const line = raw.trim();
  if(!line) return;
  HISTORY.push(line); hIdx = -1;
  CTX.commands.push(line);

  if(line==='clear'){ $('gq-out').innerHTML=''; return; }
  if(line==='help'){
    termLine([
      {t:'git init · status · add · commit -m · log · branch · checkout · switch', c:'out'},
      {t:'git merge · rebase (-i) · cherry-pick · reset · revert · restore · stash · tag', c:'out'},
      {t:'git remote · clone · fetch · pull · push · reflog · bisect', c:'out'},
      {t:'files: touch <name> · mkdir <name> · edit <name> · ls    misc: clear · help · pr create/review/merge', c:'dim'},
    ], line);
    return;
  }
  if(line.startsWith('pr ')){ handlePR(line); return; }

  const res = E.exec(line);
  termLine(res.out, line);

  if(res.ok){
    CTX.okCommands.push(line);
    handleEvents(res, line);
    const summary = actionSummary(line, res);
    if(summary) termAction(summary);
  } else {
    CTX.errors++;
    SFX.error();
  }
  if(E.isDetached()) CTX.flags.wasDetached = true;
  updChips(); renderAll();
  updSuggest();
  if(MODE==='sandbox'){
    bumpCounter('sandboxCmds');
    checkAchievements();
  }
  if(res.irebase){ openIRebase(res.irebase); return; }
  maybeSolve();
}

function handleEvents(res, line){
  (res.events||[]).forEach(ev=>{
    if(ev==='commit') { bumpCounter('commits'); SFX.commit(); }
    if(ev==='mergecommit'){ bumpCounter('commits'); bumpCounter('merges'); SFX.merge();
      if(line.startsWith('git commit')) { bumpCounter('conflicts'); CTX.flags.resolvedConflict = true; } }
    if(ev==='ff'){ bumpCounter('merges'); SFX.merge(); }
    if(ev==='branch'){ if(line.includes('-d')||line.includes('-D')||line.includes('-m')){} else bumpCounter('branches'); SFX.branch(); }
    if(ev==='head'){ SFX.checkout(); }
    if(ev==='rebase'){ bumpCounter('rebases'); SFX.merge(); }
    if(ev==='cherry'){ bumpCounter('cherry'); SFX.commit(); }
    if(ev==='push'){ bumpCounter('pushes'); SFX.branch(); }
    if(ev==='stage'||ev==='workdir'||ev==='unstage'){ SFX.type(); }
    if(ev==='conflict'){ SFX.error(); }
    if(ev==='bisect-done'){ CTX.flags.bisectDone = true; SFX.success(); }
    if(ev==='clone'){ SFX.merge(); }
  });
  if(res.cherry) flyAnimation(res.cherry.from, res.cherry.to);
  checkAchievements();
}

function handlePR(line){
  const sub = line.split(/\s+/)[1];
  const cur = E.HEAD.type==='branch' ? E.HEAD.ref : null;
  if(sub==='create'){
    if(!E.origin || !cur || E.origin.branches[cur]===undefined || cur==='main'){
      termLine([{t:'pr: push a feature branch first (git push -u origin <branch>)', c:'err'}], line);
      CTX.errors++; SFX.error(); return;
    }
    if(E.origin.branches[cur] !== E.branches[cur]){
      termLine([{t:'pr: your branch has unpushed commits - push first', c:'err'}], line); CTX.errors++; return;
    }
    CTX.flags.prCreated = true; E.prBranch = cur;
    CTX.okCommands.push(line);
    termLine([
      {t:`✔ Pull Request #42 opened: ${cur} → main`, c:'ok'},
      {t:'reviewers notified · CI running · discussion open', c:'dim'}
    ], line);
    SFX.branch();
  } else if(sub==='review'){
    if(!CTX.flags.prCreated && !E.prBranch){ termLine([{t:'pr: no open pull request (pr create first)', c:'err'}], line); CTX.errors++; return; }
    CTX.flags.prReviewed = true; CTX.okCommands.push(line);
    termLine([{t:'✔ Review approved: "LGTM! 🚀"', c:'ok'}], line);
    SFX.branch();
  } else if(sub==='merge'){
    const fb = E.prBranch || cur;
    if(!E.origin || !fb || E.origin.branches[fb]===undefined){ termLine([{t:'pr: nothing to merge (pr create first)', c:'err'}], line); CTX.errors++; return; }
    const mainTip = E.origin.branches['main'];
    const featTip = E.origin.branches[fb];
    const id = E.addCommitObj([mainTip, featTip], `Merge pull request #42 from ${fb}`, [], 0);
    const c = E.commits[id]; delete E.commits[id];
    E.origin.commits[id] = c;
    E.ancestors(featTip).forEach(a=>{ if(E.commits[a]) E.origin.commits[a]=E.commits[a]; });
    E.origin.branches['main'] = id;
    CTX.flags.prMerged = true; CTX.okCommands.push(line);
    termLine([
      {t:'✔ Pull Request #42 merged on GitHub!', c:'ok'},
      {t:'the REMOTE main moved - your local main is now behind (try: git switch main && git pull)', c:'dim'}
    ], line);
    SFX.success();
  } else {
    termLine([{t:'pr: use pr create | pr review | pr merge', c:'err'}], line);
  }
  updChips(); renderAll(); updSuggest(); maybeSolve();
}

/* ================= level solving ================= */
function maybeSolve(){
  if(MODE!=='level' || !LVL || CTX.solved) return;
  let solved = false;
  try{ solved = LVL.goal(E, ctxApi()); }catch(e){ solved = false; }
  if(!solved) return;
  CTX.solved = true;
  const time = (Date.now()-CTX.start)/1000;
  const par = (LVL.solution||[]).length;
  const cmds = CTX.okCommands.length;
  let stars = 1;
  if(CTX.hints===0 && cmds<=par+1 && CTX.errors<=1) stars = 3;
  else if(CTX.hints<=1 && cmds<=par+4) stars = 2;

  const first = !S.levels[LVL.id]?.done;
  const prev = S.levels[LVL.id] || {};
  S.levels[LVL.id] = { done:true, stars: Math.max(stars, prev.stars||0) };
  let gained = 0;
  if(first){ gained = LVL.xp; awardXP(gained); bumpCounter('levels'); }
  updateStreak();

  // chapter badge
  let badgeEarned = null;
  if(LVL.chapter.levels.every(l=>S.levels[l.id]?.done) && !S.badges.includes(LVL.chapter.id)){
    S.badges.push(LVL.chapter.id);
    badgeEarned = LVL.chapter;
    unlock('chapter-clear');
  }
  if(GQ_CHAPTERS.every(ch=>ch.levels.every(l=>S.levels[l.id]?.done))) unlock('git-ninja');
  if(time < 20) unlock('speed-runner');
  if(stars===3 && CTX.hints===0 && CTX.errors===0) unlock('perfect-run');
  if(CTX.flags.resolvedConflict) unlock('conflict-res');
  save();
  SFX.success();
  confetti();
  setTimeout(()=>showComplete(stars, gained, time, badgeEarned), 500);
}

function awardXP(n){ S.xp += n; save(); updChips(); }

function updateStreak(){
  const t = today();
  if(S.streak.last === t) return;
  const y = new Date(Date.now()-864e5).toISOString().slice(0,10);
  S.streak.count = (S.streak.last === y) ? S.streak.count+1 : 1;
  S.streak.last = t;
  if(S.streak.count>=3) unlock('streak-3');
  save();
}

function showComplete(stars, gained, time, badge){
  const idx = ALL_LEVELS.indexOf(LVL);
  const next = ALL_LEVELS[idx+1];
  const nextTask = next
    ? `<div class="gq-next"><span class="lbl">Next task</span>
         <span class="tt">${next.chapter.title} · Level ${idx+2} — <b>${next.title}</b></span>
         <span class="goal">${next.goalText}</span></div>`
    : `<div class="gq-next done">🏆 Course complete — you're a Git Grandmaster!</div>`;
  const c = $('gq-complete');
  c.innerHTML = `
    <div class="gq-complete-head">
      <h2>Level Complete! 🎉</h2>
      <div class="big-stars">${'★'.repeat(stars)}${'<span style="opacity:.25">★</span>'.repeat(3-stars)}</div>
    </div>
    <div class="gq-complete-meta">
      ${gained?`<span class="xp-gain">+${gained} XP</span>`:'<span class="xp-gain" style="opacity:.6">already completed</span>'}
      <span>${CTX.okCommands.length} commands</span><span>${CTX.hints} hints</span><span>${Math.round(time)}s</span>
    </div>
    ${badge?`<div class="badge-row"><span class="badge-big">${badge.icon}</span><span style="color:var(--gold);font-weight:700">Badge earned: ${badge.badge}!</span></div>`:''}
    <div class="explain">${LVL.explain}</div>
    ${nextTask}
    <div class="row">
      ${next?`<button class="primary" id="m-next">Next Level →</button>`:''}
      <button id="m-replay">Replay</button>
      <button id="m-map">Level Select</button>
    </div>`;
  $('gq-obj-card').classList.add('gq-hidden');
  c.classList.remove('gq-hidden');
  c.scrollIntoView({ behavior:'smooth', block:'nearest' });
  if(next) $('m-next').onclick = ()=>startLevel(next.id);
  $('m-replay').onclick = ()=>startLevel(LVL.id);
  $('m-map').onclick = ()=>{ hideComplete(); renderMap(); show('gq-map'); };
}
function hideComplete(){ $('gq-complete').classList.add('gq-hidden'); }
function closeModal(){ $('gq-overlay').classList.remove('active'); }

/* ================= hints ================= */
$('gq-hint').onclick = ()=>{
  if(!LVL) return;
  $('gq-hint').style.animation = 'none';
  const hints = LVL.hints.concat([`Solution: ${LVL.solution.join('  →  ')}`]);
  if(CTX.hints >= hints.length) return;
  const h = hints[CTX.hints];
  CTX.hints++;
  const d = document.createElement('div');
  d.className='hint-line';
  d.textContent = (CTX.hints===hints.length ? '🔓 ' : `Hint ${CTX.hints}: `) + h;
  $('gq-hints').appendChild(d);
  if(CTX.hints >= hints.length) $('gq-hint').textContent = 'No more hints';
  else if(CTX.hints === hints.length-1) $('gq-hint').textContent = '🔓 Reveal solution';
  else $('gq-hint').textContent = `💡 Next hint (${hints.length-1-CTX.hints} left + solution)`;
};

/* ================= interactive rebase modal ================= */
function openIRebase(data){
  const m = $('gq-modal');
  const rows = data.list.map((id,i)=>{
    const c = E.commits[id];
    return `<div class="gq-todo-row" data-id="${id}">
      <select ${i===0?'data-first="1"':''}>
        <option>pick</option><option ${i===0?'disabled':''}>squash</option>
        <option ${i===0?'disabled':''}>fixup</option><option>reword</option><option>drop</option>
      </select>
      <span class="h">${id.slice(0,7)}</span>
      <span class="m">${c.msg}</span>
      <input type="text" placeholder="new message" style="display:none">
    </div>`;
  }).join('');
  m.innerHTML = `
    <h2>Interactive Rebase</h2>
    <div style="font-size:.82rem;color:var(--ink-soft)">choose what happens to each commit (oldest at top)</div>
    <div class="gq-todo">${rows}</div>
    <div class="row"><button id="ir-go" style="background:var(--gold);color:#14161f;border-color:var(--gold);font-weight:700">Confirm Rebase</button>
    <button id="ir-cancel">Abort</button></div>`;
  $('gq-overlay').classList.add('active');
  m.querySelectorAll('select').forEach(sel=>{
    sel.onchange = ()=>{ const inp = sel.parentElement.querySelector('input');
      inp.style.display = sel.value==='reword' ? 'block' : 'none'; };
  });
  $('ir-cancel').onclick = ()=>{ closeModal(); termLine([{t:'rebase aborted', c:'dim'}]); };
  $('ir-go').onclick = ()=>{
    const actions = [...m.querySelectorAll('.gq-todo-row')].map(r=>({
      id: r.dataset.id,
      action: r.querySelector('select').value,
      msg: r.querySelector('input').value || undefined
    }));
    closeModal();
    E.applyInteractiveRebase(data.base, actions);
    CTX.flags.irebaseDone = true;
    if(actions.some(a=>a.action==='fixup')) CTX.flags.irebaseFixup = true;
    if(actions.some(a=>a.action==='squash')) CTX.flags.irebaseSquash = true;
    bumpCounter('irebase'); bumpCounter('rebases');
    unlock('historian');
    termLine([{t:'Successfully rebased and updated refs.', c:'ok'}]);
    SFX.merge();
    updChips(); renderAll(); updSuggest(); maybeSolve();
  };
}

/* ================= achievements ================= */
function unlock(id){
  if(S.achievements.includes(id)) return;
  const a = GQ_ACHIEVEMENTS.find(x=>x.id===id);
  if(!a) return;
  S.achievements.push(id); save();
  toast(a.icon, 'Achievement unlocked!', a.name);
  SFX.achievement();
}
function checkAchievements(){
  const c = S.counters;
  if(c.commits>=1) unlock('first-commit');
  if(c.commits>=25) unlock('commit-25');
  if(c.commits>=100) unlock('commit-100');
  if(c.merges>=5) unlock('merge-master');
  if(c.rebases>=3) unlock('rebase-wizard');
  if(c.cherry>=1) unlock('cherry');
  if(c.pushes>=5) unlock('pusher');
  if(c.sandboxCmds>=20) unlock('sandboxer');
  if(LVL && LVL.id==='8-3' && CTX.solved) unlock('time-lord');
}
function toast(icon, name, desc){
  const w = $('gq-toasts');
  const d = document.createElement('div');
  d.className='gq-toast';
  d.innerHTML = `<span class="ti">${icon}</span><div><div class="tn">${name}</div><div class="td">${desc}</div></div>`;
  w.appendChild(d);
  setTimeout(()=>{ d.style.transition='all .4s'; d.style.opacity='0'; d.style.transform='translateX(120%)'; setTimeout(()=>d.remove(), 400); }, 3200);
}
function confetti(){
  const colors = ['#f5a524','#43c98c','#5aa2e8','#f06a4d','#b78af5'];
  const cx = window.innerWidth/2, cy = window.innerHeight/2;
  for(let i=0;i<26;i++){
    const d = document.createElement('div');
    d.className='gq-burst';
    d.style.left = cx+'px'; d.style.top = cy+'px';
    d.style.background = colors[i%colors.length];
    d.style.setProperty('--dx', (Math.random()*440-220)+'px');
    d.style.setProperty('--dy', (Math.random()*440-260)+'px');
    document.body.appendChild(d);
    setTimeout(()=>d.remove(), 950);
  }
}

/* ================= graph rendering ================= */
function layout(){
  const ids = Object.keys(E.commits);
  const depth = {};
  const dfs = id => {
    if(depth[id]!==undefined) return depth[id];
    const ps = E.commits[id].parents||[];
    depth[id] = ps.length ? Math.max(...ps.map(dfs))+1 : 0;
    return depth[id];
  };
  ids.forEach(dfs);
  const reach = new Set();
  const roots = [...Object.values(E.branches), ...Object.values(E.tags), ...Object.values(E.remoteRefs)];
  if(E.HEAD.type==='commit') roots.push(E.HEAD.ref);
  roots.forEach(r=>{ if(r) E.ancestors(r).forEach(a=>reach.add(a)); });
  const laneW = 108, rowH = 72, padX = 46, padY = 40;
  const pos = {};
  let maxLane = 0, maxDepth = 0;
  ids.forEach(id=>{
    const c = E.commits[id];
    const lane = Math.min(c.lane||0, 5);
    pos[id] = { x: padX + lane*laneW, y: padY + depth[id]*rowH, lane, ghost: !reach.has(id) };
    maxLane = Math.max(maxLane, lane); maxDepth = Math.max(maxDepth, depth[id]);
  });
  return { pos, w: padX*2 + (maxLane+1)*laneW + 130, h: padY*2 + (maxDepth+1)*rowH };
}

function renderGraph(initial){
  const svg = $('gq-svg');
  const { pos, w, h } = layout();
  svg.setAttribute('width', Math.max(w, 320));
  svg.setAttribute('height', Math.max(h, 220));
  svg.innerHTML = '';
  const NS = 'http://www.w3.org/2000/svg';
  const head = E.headCommit();

  // edges
  Object.entries(E.commits).forEach(([id, c])=>{
    (c.parents||[]).forEach(pid=>{
      if(!pos[pid]) return;
      const p = document.createElementNS(NS,'path');
      const a = pos[pid], b = pos[id];
      const d = a.x===b.x
        ? `M${a.x},${a.y+16} L${b.x},${b.y-16}`
        : `M${a.x},${a.y+14} C${a.x},${a.y+46} ${b.x},${b.y-46} ${b.x},${b.y-14}`;
      p.setAttribute('d', d);
      p.setAttribute('class','gq-edge' + ((!prevPos[id] && !initial) ? ' new':''));
      if(pos[id].ghost || pos[pid].ghost) p.style.opacity = .18;
      svg.appendChild(p);
    });
  });

  // commit nodes
  Object.entries(E.commits).forEach(([id, c])=>{
    const P = pos[id];
    const g = document.createElementNS(NS,'g');
    const isNew = !prevPos[id];
    const from = prevPos[id] || (c.parents && c.parents[0] && pos[c.parents[0]]) || P;
    g.setAttribute('class','gq-commit-g' + (P.ghost?' ghost':'') + (isNew && !initial ? ' pop':''));
    g.setAttribute('transform', `translate(${isNew?P.x:from.x},${isNew?P.y:from.y})`);
    const circ = document.createElementNS(NS,'circle');
    circ.setAttribute('r', 15);
    circ.setAttribute('class','gq-commit' + (id===head?' head-node':'') + ((c.parents||[]).length>1?' merge-node':''));
    g.appendChild(circ);
    const hash = document.createElementNS(NS,'text');
    hash.setAttribute('class','gq-hash'); hash.setAttribute('y', 28); hash.setAttribute('text-anchor','middle');
    hash.textContent = id.slice(0,7);
    g.appendChild(hash);
    const msg = document.createElementNS(NS,'text');
    msg.setAttribute('class','gq-msg'); msg.setAttribute('y', 40); msg.setAttribute('text-anchor','middle');
    msg.textContent = c.msg.length>15 ? c.msg.slice(0,14)+'…' : c.msg;
    g.appendChild(msg);
    const t = document.createElementNS(NS,'title');
    t.textContent = `${id.slice(0,7)} — ${c.msg}\n(click to paste hash into terminal)`;
    g.appendChild(t);
    g.style.cursor = 'pointer';
    g.addEventListener('click', ()=>{
      const inp = $('gq-in');
      inp.value = (inp.value ? inp.value.replace(/\s*$/,' ') : '') + id.slice(0,7);
      inp.focus(); updGhost();
    });
    svg.appendChild(g);
    if(!isNew && (from.x!==P.x || from.y!==P.y)){
      requestAnimationFrame(()=>g.setAttribute('transform', `translate(${P.x},${P.y})`));
    }
  });

  // ref labels (branches, HEAD, tags, remotes)
  const refsAt = {};
  const addRef = (name, id, kind)=>{
    if(id===null || id===undefined || !pos[id]) return;
    (refsAt[id] = refsAt[id]||[]).push({name, kind});
  };
  Object.entries(E.branches).forEach(([b,id])=>addRef(b, id, 'branch'));
  Object.entries(E.tags).forEach(([t,id])=>addRef('🏷 '+t, id, 'tag'));
  Object.entries(E.remoteRefs).forEach(([r,id])=>addRef(r, id, 'remote'));

  Object.entries(refsAt).forEach(([id, refs])=>{
    const P = pos[id];
    refs.forEach((r, i)=>{
      const isHead = E.HEAD.type==='branch' && E.HEAD.ref===r.name;
      const label = (isHead?'HEAD → ':'') + r.name;
      const wpx = label.length*6.4 + 16;
      const g = document.createElementNS(NS,'g');
      g.setAttribute('class','gq-ref-g');
      const key = r.kind+':'+r.name;
      const target = { x: P.x + 26, y: P.y - 10 + i*20 };
      const from = prevRefPos[key] || target;
      g.setAttribute('transform', `translate(${from.x},${from.y})`);
      const rect = document.createElementNS(NS,'rect');
      rect.setAttribute('class','gq-ref-rect');
      rect.setAttribute('width', wpx); rect.setAttribute('height', 17); rect.setAttribute('rx', 8);
      const colors = { branch:'var(--green)', tag:'var(--gold)', remote:'#8a93a8' };
      rect.setAttribute('fill', isHead ? 'var(--gold)' : 'none');
      rect.setAttribute('stroke', isHead ? 'var(--gold)' : colors[r.kind]);
      rect.setAttribute('stroke-width', 1.6);
      g.appendChild(rect);
      const tx = document.createElementNS(NS,'text');
      tx.setAttribute('class','gq-reflabel'); tx.setAttribute('x', 8); tx.setAttribute('y', 12.5);
      tx.setAttribute('fill', isHead ? '#14161f' : colors[r.kind]);
      tx.textContent = label;
      g.appendChild(tx);
      svg.appendChild(g);
      prevRefPos[key] = target;
      requestAnimationFrame(()=>g.setAttribute('transform', `translate(${target.x},${target.y})`));
    });
  });

  // detached HEAD label
  if(E.HEAD.type==='commit' && pos[E.HEAD.ref]){
    const P = pos[E.HEAD.ref];
    const g = document.createElementNS(NS,'g');
    g.setAttribute('class','gq-ref-g');
    const from = prevRefPos['HEAD-detached'] || {x:P.x-92, y:P.y-9};
    g.setAttribute('transform',`translate(${from.x},${from.y})`);
    g.innerHTML = `<rect class="gq-ref-rect" width="64" height="17" rx="8" fill="var(--gold)"></rect>
      <text class="gq-reflabel" x="8" y="12.5" fill="#14161f">HEAD ⚠</text>`;
    svg.appendChild(g);
    prevRefPos['HEAD-detached'] = {x:P.x-92, y:P.y-9};
    requestAnimationFrame(()=>g.setAttribute('transform',`translate(${P.x-92},${P.y-9})`));
  } else { delete prevRefPos['HEAD-detached']; }

  // empty state
  if(!Object.keys(E.commits).length){
    const tx = document.createElementNS(NS,'text');
    tx.setAttribute('x','50%'); tx.setAttribute('y','50%'); tx.setAttribute('text-anchor','middle');
    tx.setAttribute('class','gq-msg');
    tx.textContent = E.initialized ? 'repository is empty — make your first commit!' : 'no repository yet — try: git init';
    svg.appendChild(tx);
  }
  Object.keys(pos).forEach(id=>{ prevPos[id] = { x:pos[id].x, y:pos[id].y }; });
}

function flyAnimation(fromId, toId){
  setTimeout(()=>{
    const { pos } = layout();
    if(!pos[fromId] || !pos[toId]) return;
    const svg = $('gq-svg');
    const NS = 'http://www.w3.org/2000/svg';
    const c = document.createElementNS(NS,'circle');
    c.setAttribute('r', 13);
    c.setAttribute('class','gq-commit gq-fly');
    c.setAttribute('cx', 0); c.setAttribute('cy', 0);
    c.style.transform = `translate(${pos[fromId].x}px,${pos[fromId].y}px)`;
    c.style.stroke = 'var(--gold)';
    svg.appendChild(c);
    requestAnimationFrame(()=>{ c.style.transform = `translate(${pos[toId].x}px,${pos[toId].y}px)`; });
    setTimeout(()=>c.remove(), 850);
  }, 40);
}

/* ================= areas ================= */
function renderAreas(){
  const wd = $('gq-wd'), st = $('gq-stage'), rp = $('gq-repo'), sx = $('gq-stash');
  const chip = (name, cls)=>`<span class="gq-file ${cls}">${name}</span>`;
  wd.innerHTML = E.workdir
    .filter(f=>!E.staging.includes(f.name) || f.state==='conflict')
    .map(f=>chip((f.dir?'📁 ':'') + f.name + (f.state==='conflict'?' ⚠':''), f.dir?'dir':f.state)).join('') || '<span style="font-size:.68rem;color:var(--ink-soft)">clean</span>';
  st.innerHTML = E.staging.map(f=>chip(f,'staged')).join('') || '<span style="font-size:.68rem;color:var(--ink-soft)">empty</span>';
  const head = E.headCommit();
  const lastFiles = head ? (E.commits[head].changed||[]) : [];
  rp.innerHTML = (head
    ? `<div style="font-size:.66rem;color:var(--ink-soft);margin-bottom:3px">${Object.keys(E.commits).length} commit(s) · latest:</div>` +
      lastFiles.map(f=>chip(f,'committed')).join('')
    : '<span style="font-size:.68rem;color:var(--ink-soft)">no commits</span>');
  sx.innerHTML = E.stash.length
    ? E.stash.map((s,i)=>chip(`{${i}} ${s.files.length}f`,'modified')).join('')
    : '<span style="font-size:.68rem;color:var(--ink-soft)">—</span>';
}

function renderAll(initial){ renderGraph(initial); renderAreas(); }
function updChips(){
  $('gq-chip-cmds').innerHTML = `cmds <b>${CTX ? CTX.okCommands.length : 0}</b>`;
  $('gq-chip-xp').innerHTML = `XP <b>${S.xp}</b>`;
}

/* ================= landing & map ================= */
function totalStars(){ return Object.values(S.levels).reduce((s,l)=>s+(l.stars||0),0); }
function doneCount(){ return Object.values(S.levels).filter(l=>l.done).length; }

function renderStrip(){
  $('gq-strip').innerHTML = doneCount()
    ? `<span><b>${S.xp}</b> XP</span><span><b>${doneCount()}</b>/${ALL_LEVELS.length} levels</span>
       <span><b>${totalStars()}</b> ★</span><span>🔥 <b>${S.streak.count}</b> day streak</span>`
    : `<span style="opacity:.7">zero Git knowledge required — jump in!</span>`;
}

function firstIncomplete(){
  return ALL_LEVELS.find(l=>!S.levels[l.id]?.done) || ALL_LEVELS[0];
}
function isUnlocked(lvl){
  const i = ALL_LEVELS.findIndex(l=>l.id===lvl.id);
  if(i===0) return true;
  return !!S.levels[ALL_LEVELS[i-1].id]?.done;
}

function renderMap(){
  $('gq-map-lvlcount').textContent = `${doneCount()}/${ALL_LEVELS.length}`;
  $('gq-map-xp').textContent = S.xp;
  $('gq-map-streak').textContent = S.streak.count;
  const maxXP = ALL_LEVELS.reduce((s,l)=>s+l.xp,0);
  $('gq-xpfill').style.width = Math.min(100, S.xp/maxXP*100)+'%';

  // daily
  if(S.daily.date !== today()){
    S.daily = { date: today(), idx: Math.abs(today().split('-').join('')|0) % GQ_DAILY.length, progress:0, done:false };
    save();
  }
  const d = GQ_DAILY[S.daily.idx];
  $('gq-daily').innerHTML = `<span class="flame">🎯</span>
    <div><b>Daily Challenge:</b> ${d.text} <span style="color:var(--ink-soft);font-size:.8rem">(+30 XP)</span></div>
    <div class="gq-daily-bar"><div style="width:${Math.min(100,S.daily.progress/d.target*100)}%"></div></div>
    <span style="font-size:.8rem;color:${S.daily.done?'var(--green)':'var(--ink-soft)'}">${S.daily.done?'✔ done':S.daily.progress+'/'+d.target}</span>`;

  const wrap = $('gq-chapters');
  wrap.innerHTML = '';
  GQ_CHAPTERS.forEach(ch=>{
    const div = document.createElement('div');
    div.className = 'gq-chapter sketch';
    const earned = S.badges.includes(ch.id);
    div.innerHTML = `<div class="gq-chapter-head">
      <span class="icon">${ch.icon}</span><h3>${ch.title}</h3>
      <span class="gq-badge ${earned?'earned':''}">${earned?'🏅 ':''}${ch.badge}</span></div>
      <div class="gq-levels"></div>`;
    const lw = div.querySelector('.gq-levels');
    ch.levels.forEach(l=>{
      const p = S.levels[l.id];
      const unlocked = isUnlocked(l);
      const n = document.createElement('div');
      n.className = 'gq-node' + (p?.done?' done':'') + (unlocked?'':' locked');
      n.innerHTML = `<div class="n">${l.id}</div><div class="t">${unlocked ? l.title : '🔒 '+l.title}</div>
        <div class="stars">${p?.done ? '★'.repeat(p.stars)+'<span style="opacity:.25">'+'★'.repeat(3-p.stars)+'</span>' : ''}</div>
        <div class="xp">+${l.xp} XP</div>`;
      if(unlocked) n.onclick = ()=>startLevel(l.id);
      lw.appendChild(n);
    });
    wrap.appendChild(div);
  });

  const ag = $('gq-achs');
  ag.innerHTML = '';
  GQ_ACHIEVEMENTS.forEach(a=>{
    const got = S.achievements.includes(a.id);
    const d2 = document.createElement('div');
    d2.className = 'gq-ach' + (got?' got':'');
    d2.innerHTML = `<span class="ai">${a.icon}</span><div><div class="an">${a.name}</div><div class="ad">${a.desc}</div></div>`;
    ag.appendChild(d2);
  });
}

/* ================= sandbox toolbar ================= */
$('sb-reset').onclick = ()=>startSandbox(sbPresets.fresh);
$('sb-random').onclick = ()=>startSandbox(sbPresets.random);
$('sb-ex1').onclick = ()=>startSandbox(sbPresets.branches);
$('sb-ex2').onclick = ()=>startSandbox(sbPresets.remote);
$('sb-export').onclick = ()=>{
  const data = E.toJSON();
  const blob = new Blob([data], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'gitquest-repo.json';
  a.click();
  termLine([{t:'graph exported as gitquest-repo.json', c:'ok'}]);
};
$('sb-import').onclick = ()=>{
  const data = prompt('Paste an exported repository JSON:');
  if(!data) return;
  try{ E.fromJSON(data); prevPos={}; prevRefPos={}; renderAll(true); updSuggest();
    termLine([{t:'graph imported!', c:'ok'}]); }
  catch(e){ termLine([{t:'invalid JSON', c:'err'}]); }
};

/* ================= wiring ================= */
$('gq-start').onclick = ()=>startLevel(ALL_LEVELS[0].id);
$('gq-continue').onclick = ()=>startLevel(firstIncomplete().id);
$('gq-levels').onclick = ()=>{ renderMap(); show('gq-map'); };
$('gq-sandbox-btn').onclick = ()=>startSandbox();
$('gq-map-back').onclick = ()=>{ renderStrip(); show('gq-landing'); };
$('gq-back').onclick = ()=>{ if(MODE==='level'){ renderMap(); show('gq-map'); } else { renderStrip(); show('gq-landing'); } };
$('gq-reset-lvl').onclick = ()=>{ if(MODE==='level' && LVL) startLevel(LVL.id); else startSandbox(); };
$('gq-sound').onclick = ()=>{ S.sound = !S.sound; save(); $('gq-sound').innerHTML = S.sound?'&#128266;':'&#128263;'; };
$('gq-overlay').addEventListener('click', ev=>{ if(ev.target.id==='gq-overlay' && !$('gq-modal').querySelector('.gq-todo')) closeModal(); });

renderStrip();
$('gq-sound').innerHTML = S.sound?'&#128266;':'&#128263;';
})();
