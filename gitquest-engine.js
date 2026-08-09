/* GitQuest - custom Git simulation engine (no real git) */
/* Returns {ok, out:[{t,c}], events:[...]} from exec(). Renders happen in app. */

class GitEngine {
  constructor(){ this.reset(false); }

  reset(initialized = false){
    this.initialized = initialized;
    this.commits = {};       // id -> {id, parents:[], msg, changed:[], lane, t}
    this.branches = {};      // name -> commitId
    this.HEAD = { type:'branch', ref:'main' };
    this.prevBranch = null;
    this.staging = [];       // file names
    this.workdir = [];       // {name, state:'untracked'|'modified'|'conflict'}
    this.tracked = new Set();
    this.stash = [];
    this.tags = {};          // name -> commitId
    this.origin = null;      // {branches:{name:id}, commits:{id:commit}}
    this.originName = null;
    this.originUrl = null;   // remembered remote url (dummy)
    this.remoteRefs = {};    // 'origin/main' -> id
    this.upstreams = {};     // branch -> 'origin/main'
    this.reflog = [];
    this.seq = 0;
    this.laneSeq = 0;
    this.branchLanes = { main: 0 };
    this.merging = null;     // {theirs, conflictFiles:[]} while conflict unresolved
    this.bisect = null;
    if(initialized) this.branches = {};
  }

  /* ---------- helpers ---------- */
  newId(){
    const chars = 'abcdef0123456789';
    let id = '';
    const seed = ++this.seq;
    for(let i=0;i<7;i++) id += chars[(seed*31 + i*17 + (seed%7)*13 + i*i) % 16];
    return id + (seed%10);
  }
  headCommit(){
    if(!this.initialized) return null;
    if(this.HEAD.type === 'branch') return this.branches[this.HEAD.ref] || null;
    return this.HEAD.ref;
  }
  headLabel(){ return this.HEAD.type==='branch' ? this.HEAD.ref : this.HEAD.ref.slice(0,7); }
  isDetached(){ return this.HEAD.type === 'commit'; }
  ancestors(id, incl = true){
    const seen = new Set(); const stack = incl ? [id] : [...(this.commits[id]?.parents||[])];
    while(stack.length){
      const c = stack.pop();
      if(!c || seen.has(c)) continue;
      seen.add(c);
      (this.commits[c]?.parents||[]).forEach(p=>stack.push(p));
    }
    return seen;
  }
  isAncestor(a, b){ return a===b || this.ancestors(b).has(a); }
  mergeBase(a, b){
    const A = this.ancestors(a);
    const q = [b]; const seen = new Set();
    while(q.length){
      const c = q.shift();
      if(seen.has(c)) continue; seen.add(c);
      if(A.has(c)) return c;
      (this.commits[c]?.parents||[]).forEach(p=>q.push(p));
    }
    return null;
  }
  commitsBetween(base, tip){ // tip..base exclusive of base, ordered old->new (first-parent walk)
    const out = [];
    let c = tip;
    while(c && c !== base){
      out.unshift(c);
      c = (this.commits[c].parents||[])[0];
    }
    return out;
  }
  changedSince(base, tip){
    const files = new Set();
    const stop = this.ancestors(base);
    const stack = [tip];
    const seen = new Set();
    while(stack.length){
      const c = stack.pop();
      if(!c || seen.has(c) || stop.has(c)) continue;
      seen.add(c);
      (this.commits[c].changed||[]).forEach(f=>files.add(f));
      (this.commits[c].parents||[]).forEach(p=>stack.push(p));
    }
    return files;
  }
  logRef(action){ this.reflog.unshift({ head: this.headCommit(), action }); if(this.reflog.length>40) this.reflog.pop(); }
  resolveRef(ref){
    if(!ref) return null;
    // HEAD~n / ref~n
    const m = ref.match(/^(.+?)(~+)(\d*)$/);
    if(m){
      let base = this.resolveRef(m[1]);
      let n = m[3] ? parseInt(m[3],10) : m[2].length;
      while(n-- > 0 && base) base = (this.commits[base]?.parents||[])[0];
      return base;
    }
    if(ref === 'HEAD') return this.headCommit();
    if(this.branches[ref] !== undefined) return this.branches[ref];
    if(this.tags[ref] !== undefined) return this.tags[ref];
    if(this.remoteRefs[ref] !== undefined) return this.remoteRefs[ref];
    // commit id prefix
    const hit = Object.keys(this.commits).filter(id => id.startsWith(ref));
    return hit.length === 1 ? hit[0] : (this.commits[ref] ? ref : null);
  }
  addCommitObj(parents, msg, changed, lane){
    const id = this.newId();
    this.commits[id] = { id, parents, msg, changed:[...changed], lane, t: Date.now() + this.seq };
    return id;
  }
  currentLane(){
    if(this.HEAD.type === 'branch'){
      if(this.branchLanes[this.HEAD.ref] === undefined) this.branchLanes[this.HEAD.ref] = ++this.laneSeq;
      return this.branchLanes[this.HEAD.ref];
    }
    const c = this.commits[this.HEAD.ref];
    return c ? c.lane : 0;
  }
  fileEntry(name){ return this.workdir.find(f=>f.name===name); }

  /* ---------- output helpers ---------- */
  ok(lines, events){ return { ok:true, out: lines.map(l=>typeof l==='string'?{t:l,c:'out'}:l), events: events||[] }; }
  err(lines, hint){
    const out = lines.map(l=>({t:l,c:'err'}));
    if(hint) out.push({t:'hint: '+hint, c:'dim'});
    return { ok:false, out, events:[] };
  }

  /* ---------- main dispatcher ---------- */
  exec(raw){
    const line = raw.trim();
    if(!line) return this.ok([]);
    const args = this.tokenize(line);
    const cmd = args[0];

    if(cmd === 'ls'){
      const names = this.workdir.map(f=>f.name);
      return this.ok([names.length ? names.join('  ') : '(no files in working directory)']);
    }
    if(cmd === 'touch'){
      if(!args[1]) return this.err(['usage: touch <filename>']);
      return this.createFile(args[1]);
    }
    if(cmd === 'mkdir'){
      if(!args[1]) return this.err(['usage: mkdir <dirname>']);
      return this.createDir(args[1]);
    }
    if(cmd === 'edit'){
      if(!args[1]) return this.err(['usage: edit <filename>']);
      return this.editFile(args[1]);
    }
    if(cmd !== 'git') return this.err([`command not found: ${cmd}`], `this terminal knows: git, touch <file>, edit <file>, ls, clear, help`);

    const sub = args[1];
    if(!sub) return this.err(['usage: git <command>'], 'try: git init, git status, git add, git commit');
    if(sub !== 'init' && sub !== 'clone' && !this.initialized)
      return this.err(['fatal: not a git repository'], 'run git init first');

    switch(sub){
      case 'init':        return this.gitInit();
      case 'status':      return this.gitStatus();
      case 'add':         return this.gitAdd(args.slice(2));
      case 'commit':      return this.gitCommit(args.slice(2));
      case 'log':         return this.gitLog(args.slice(2));
      case 'branch':      return this.gitBranch(args.slice(2));
      case 'checkout':    return this.gitCheckout(args.slice(2));
      case 'switch':      return this.gitSwitch(args.slice(2));
      case 'merge':       return this.gitMerge(args.slice(2));
      case 'rebase':      return this.gitRebase(args.slice(2));
      case 'cherry-pick': return this.gitCherryPick(args.slice(2));
      case 'reset':       return this.gitReset(args.slice(2));
      case 'revert':      return this.gitRevert(args.slice(2));
      case 'restore':     return this.gitRestore(args.slice(2));
      case 'stash':       return this.gitStash(args.slice(2));
      case 'tag':         return this.gitTag(args.slice(2));
      case 'remote':      return this.gitRemote(args.slice(2));
      case 'clone':       return this.gitClone(args.slice(2));
      case 'fetch':       return this.gitFetch(args.slice(2));
      case 'pull':        return this.gitPull(args.slice(2));
      case 'push':        return this.gitPush(args.slice(2));
      case 'reflog':      return this.gitReflog();
      case 'bisect':      return this.gitBisect(args.slice(2));
      case 'submodule':   return this.gitSubmodule(args.slice(2));
      case 'worktree':    return this.gitWorktree(args.slice(2));
      default:
        return this.err([`git: '${sub}' is not a git command this course covers.`],
          this.closest(sub));
    }
  }

  tokenize(line){
    const out = []; let cur = ''; let q = null;
    for(const ch of line){
      if(q){ if(ch === q){ out.push(cur); cur=''; q=null; } else cur += ch; }
      else if(ch === '"' || ch === "'") q = ch;
      else if(/\s/.test(ch)){ if(cur){ out.push(cur); cur=''; } }
      else cur += ch;
    }
    if(cur) out.push(cur);
    return out;
  }
  closest(sub){
    const known = ['init','status','add','commit','log','branch','checkout','switch','merge','rebase','cherry-pick','reset','revert','restore','stash','tag','remote','clone','fetch','pull','push','reflog','bisect'];
    let best = null, bd = 3;
    for(const k of known){
      const d = Math.abs(k.length - sub.length) + (k[0]===sub[0]?0:1) + (k.includes(sub.slice(0,3))?0:1);
      if(d < bd){ bd = d; best = k; }
    }
    return best ? `did you mean: git ${best}?` : null;
  }

  /* ---------- file ops ---------- */
  createFile(name){
    if(this.fileEntry(name)) return this.err([`file '${name}' already exists`], `use: edit ${name} to modify it`);
    this.workdir.push({ name, state: this.tracked.has(name) ? 'modified' : 'untracked' });
    return this.ok([{t:`created ${name}`, c:'ok'}], ['workdir']);
  }
  createDir(name){
    const clean = name.replace(/\/+$/,'');
    const dirName = clean + '/';
    if(this.fileEntry(dirName)) return this.err([`directory '${clean}' already exists`]);
    this.workdir.push({ name: dirName, state:'untracked', dir:true });
    return this.ok([
      {t:`created directory ${clean}/`, c:'ok'},
      {t:'note: Git does not track empty folders — put a file inside it (e.g. touch '+clean+'/README.md)', c:'dim'}
    ], ['workdir']);
  }
  editFile(name){
    const f = this.fileEntry(name);
    if(f){
      if(f.state === 'conflict') { f.state = 'modified'; f.resolved = true;
        return this.ok([{t:`resolved conflict markers in ${name}`, c:'ok'}], ['workdir']); }
      f.state = this.tracked.has(name) ? 'modified' : 'untracked';
      this.staging = this.staging.filter(s=>s!==name || f.state==='untracked');
      return this.ok([{t:`modified ${name}`, c:'ok'}], ['workdir']);
    }
    if(this.tracked.has(name)){
      this.workdir.push({ name, state:'modified' });
      return this.ok([{t:`modified ${name}`, c:'ok'}], ['workdir']);
    }
    this.workdir.push({ name, state:'untracked' });
    return this.ok([{t:`created ${name}`, c:'ok'}], ['workdir']);
  }

  /* ---------- git commands ---------- */
  gitInit(){
    if(this.initialized) return this.err(['repository already initialized']);
    this.initialized = true;
    this.branches = {};
    this.HEAD = { type:'branch', ref:'main' };
    return this.ok([{t:'Initialized empty Git repository', c:'ok'}], ['init']);
  }

  gitStatus(){
    const out = [];
    out.push({t:`On branch ${this.isDetached() ? '(HEAD detached at '+this.HEAD.ref.slice(0,7)+')' : this.HEAD.ref}`, c:'head'});
    if(this.merging){
      out.push({t:'You have unmerged paths (merge conflict).', c:'err'});
      this.merging.conflictFiles.forEach(f=>{
        const e = this.fileEntry(f);
        out.push({t:`  both modified: ${f}${e && e.resolved ? ' (edited - ready to add)' : ''}`, c:'warn'});
      });
      out.push({t:'fix conflicts (edit <file>), then: git add <file> && git commit', c:'dim'});
    }
    const staged = this.staging;
    const modified = this.workdir.filter(f=>f.state==='modified' && !staged.includes(f.name));
    const untracked = this.workdir.filter(f=>f.state==='untracked' && !staged.includes(f.name));
    if(staged.length){
      out.push({t:'Changes to be committed:', c:'out'});
      staged.forEach(f=>out.push({t:`  staged: ${f}`, c:'ok'}));
    }
    if(modified.length){
      out.push({t:'Changes not staged for commit:', c:'out'});
      modified.forEach(f=>out.push({t:`  modified: ${f.name}`, c:'warn'}));
    }
    if(untracked.length){
      out.push({t:'Untracked files:', c:'out'});
      untracked.forEach(f=>out.push({t:`  ${f.name}`, c:'err'}));
    }
    if(!staged.length && !modified.length && !untracked.length && !this.merging)
      out.push({t:'nothing to commit, working tree clean', c:'dim'});
    return { ok:true, out, events:[] };
  }

  gitAdd(a){
    if(!a.length) return this.err(['Nothing specified, nothing added.'], 'try: git add <file> or git add .');
    let files;
    if(a[0]==='.' || a[0]==='-A' || a[0]==='--all'){
      files = this.workdir.filter(f=>!f.dir && (f.state!=='conflict' || f.resolved)).map(f=>f.name);
      if(this.merging) files = files.filter(f=>{ const e=this.fileEntry(f); return e.state!=='conflict'; });
    } else {
      files = [];
      for(const name of a){
        const f = this.fileEntry(name) || this.fileEntry(name.replace(/\/+$/,'')+'/');
        if(!f) return this.err([`pathspec '${name}' did not match any files`], 'check: ls');
        if(f.dir) return this.err([`nothing to add — '${name}' is an empty folder`], `Git only tracks files; add one inside: touch ${f.name}file.txt`);
        if(f.state==='conflict' && !f.resolved) return this.err([`${name} still has conflict markers`], `run: edit ${name} first`);
        files.push(f.name);
      }
    }
    if(!files.length) return this.err(['nothing to add'], 'create a file first: touch <name>');
    let added = 0;
    files.forEach(name=>{
      if(!this.staging.includes(name)){ this.staging.push(name); added++; }
      const f = this.fileEntry(name);
      if(f && f.state==='conflict') f.state='modified';
    });
    if(this.merging && this.merging.conflictFiles.every(f=>this.staging.includes(f)))
      this.merging.resolved = true;
    return this.ok([{t:`staged ${added} file${added!==1?'s':''}`, c:'ok'}], ['stage']);
  }

  gitCommit(a){
    // --amend
    if(a.includes('--amend')){
      const head = this.headCommit();
      if(!head) return this.err(['nothing to amend']);
      const mi = a.indexOf('-m');
      const msg = mi>=0 ? a[mi+1] : this.commits[head].msg;
      if(!msg) return this.err(['need a message'], 'git commit --amend -m "new message"');
      const c = this.commits[head];
      const nid = this.addCommitObj(c.parents, msg, [...new Set([...c.changed, ...this.staging])], c.lane);
      delete this.commits[head];
      // repoint
      Object.keys(this.branches).forEach(b=>{ if(this.branches[b]===head) this.branches[b]=nid; });
      if(this.HEAD.type==='commit' && this.HEAD.ref===head) this.HEAD.ref = nid;
      Object.keys(this.tags).forEach(t=>{ if(this.tags[t]===head) this.tags[t]=nid; });
      this.absorbStaged();
      this.logRef('commit --amend');
      return this.ok([{t:`amended -> ${nid.slice(0,7)} "${msg}"`, c:'ok'}], ['commit']);
    }
    const mi = a.indexOf('-m');
    if(mi < 0 || !a[mi+1]) return this.err(['Aborting commit due to empty commit message.'], 'use: git commit -m "your message"');
    const msg = a[mi+1];
    if(this.merging){
      if(!this.merging.resolved) return this.err(['error: unresolved merge conflicts'], 'edit the conflicted file, then git add it');
      const head = this.headCommit();
      const id = this.addCommitObj([head, this.merging.theirs], msg, [...this.staging], this.currentLane());
      this.branches[this.HEAD.ref] = id;
      this.merging = null;
      this.absorbStaged();
      this.logRef('merge commit');
      return this.ok([{t:`merge commit ${id.slice(0,7)} "${msg}"`, c:'ok'}], ['mergecommit']);
    }
    if(!this.staging.length) return this.err(['nothing to commit'], 'stage changes first: git add <file>');
    if(this.isDetached()){
      const id = this.addCommitObj([this.HEAD.ref], msg, [...this.staging], this.currentLane());
      this.HEAD.ref = id;
      this.absorbStaged();
      this.logRef('commit (detached)');
      return this.ok([{t:`[detached HEAD ${id.slice(0,7)}] ${msg}`, c:'ok'}], ['commit']);
    }
    const parent = this.branches[this.HEAD.ref];
    const id = this.addCommitObj(parent?[parent]:[], msg, [...this.staging], this.currentLane());
    this.branches[this.HEAD.ref] = id;
    this.absorbStaged();
    this.logRef('commit');
    return this.ok([{t:`[${this.HEAD.ref} ${id.slice(0,7)}] ${msg}`, c:'ok'}], ['commit']);
  }
  absorbStaged(){
    this.staging.forEach(name=>{
      this.tracked.add(name);
      this.workdir = this.workdir.filter(f=>f.name!==name);
    });
    this.staging = [];
  }

  gitLog(a){
    const head = this.headCommit();
    if(!head) return this.err(['fatal: no commits yet'], 'make one: git commit -m "msg"');
    const out = [];
    let c = head; let n = 0;
    while(c && n < 12){
      const cm = this.commits[c];
      const refs = [];
      Object.entries(this.branches).forEach(([b,id])=>{ if(id===c) refs.push(b); });
      Object.entries(this.tags).forEach(([t,id])=>{ if(id===c) refs.push('tag: '+t); });
      Object.entries(this.remoteRefs).forEach(([r,id])=>{ if(id===c) refs.push(r); });
      if(c===head) refs.unshift('HEAD');
      const ref = refs.length ? `(${refs.join(', ')}) ` : '';
      out.push({t:`${c.slice(0,7)} ${ref}${cm.msg}`, c: c===head?'head':'out'});
      c = (cm.parents||[])[0]; n++;
    }
    return { ok:true, out, events:[] };
  }

  gitBranch(a){
    if(!a.length){
      const out = Object.keys(this.branches).map(b=>({
        t: (this.HEAD.type==='branch' && this.HEAD.ref===b ? '* ' : '  ') + b,
        c: (this.HEAD.type==='branch' && this.HEAD.ref===b) ? 'ok' : 'out'
      }));
      return { ok:true, out: out.length?out:[{t:'(no branches yet - make a commit first)',c:'dim'}], events:[] };
    }
    if(a[0]==='-d' || a[0]==='-D'){
      const name = a[1];
      if(!name) return this.err(['usage: git branch -d <name>']);
      if(this.branches[name]===undefined) return this.err([`branch '${name}' not found`]);
      if(this.HEAD.type==='branch' && this.HEAD.ref===name) return this.err([`cannot delete branch '${name}' while on it`], 'switch to another branch first');
      if(a[0]==='-d'){
        const head = this.headCommit();
        if(head && !this.isAncestor(this.branches[name], head))
          return this.err([`branch '${name}' is not fully merged`], `merge it first, or force delete: git branch -D ${name}`);
      }
      this.lastDeleted = { name, id: this.branches[name] };
      delete this.branches[name];
      return this.ok([{t:`Deleted branch ${name}`, c:'ok'}], ['branch']);
    }
    if(a[0]==='-m'){
      let oldN, newN;
      if(a.length>=3){ oldN=a[1]; newN=a[2]; }
      else { if(this.HEAD.type!=='branch') return this.err(['detached HEAD: specify both names']); oldN=this.HEAD.ref; newN=a[1]; }
      if(this.branches[oldN]===undefined) return this.err([`branch '${oldN}' not found`]);
      if(!newN) return this.err(['usage: git branch -m <old> <new>']);
      this.branches[newN] = this.branches[oldN];
      this.branchLanes[newN] = this.branchLanes[oldN];
      delete this.branches[oldN];
      if(this.HEAD.type==='branch' && this.HEAD.ref===oldN) this.HEAD.ref = newN;
      return this.ok([{t:`renamed ${oldN} -> ${newN}`, c:'ok'}], ['branch']);
    }
    const name = a[0];
    if(this.branches[name]!==undefined) return this.err([`branch '${name}' already exists`]);
    const at = a[1] ? this.resolveRef(a[1]) : this.headCommit();
    if(!at) return this.err(['cannot create branch: no commits yet'], 'commit something first');
    this.branches[name] = at;
    if(this.branchLanes[name]===undefined) this.branchLanes[name] = ++this.laneSeq;
    return this.ok([{t:`created branch ${name}`, c:'ok'}], ['branch']);
  }

  guardDirty(){
    if(this.merging) return 'finish the merge first (git commit) or abort';
    return null;
  }
  gitCheckout(a){
    if(!a.length) return this.err(['usage: git checkout <branch|commit>'], 'or create+switch: git checkout -b <name>');
    if(a[0]==='-b'){
      const name = a[1];
      if(!name) return this.err(['usage: git checkout -b <name>']);
      const r = this.gitBranch([name, a[2]].filter(Boolean));
      if(!r.ok) return r;
      this.prevBranch = this.HEAD.type==='branch' ? this.HEAD.ref : null;
      this.HEAD = { type:'branch', ref:name };
      this.logRef('checkout -b '+name);
      return this.ok([{t:`Switched to a new branch '${name}'`, c:'ok'}], ['branch','head']);
    }
    if(a[0]==='--'){
      const name = a[1];
      const f = this.fileEntry(name);
      if(!f || f.state!=='modified') return this.err([`no local modifications for '${name}'`]);
      this.workdir = this.workdir.filter(x=>x.name!==name);
      return this.ok([{t:`discarded changes in ${name}`, c:'ok'}], ['workdir']);
    }
    const g = this.guardDirty(); if(g) return this.err(['error: you are mid-merge'], g);
    const target = a[0];
    if(this.branches[target]!==undefined){
      this.prevBranch = this.HEAD.type==='branch' ? this.HEAD.ref : null;
      this.HEAD = { type:'branch', ref:target };
      this.logRef('checkout '+target);
      return this.ok([{t:`Switched to branch '${target}'`, c:'ok'}], ['head']);
    }
    const id = this.resolveRef(target);
    if(!id) return this.err([`error: pathspec '${target}' did not match anything`], 'check branch names: git branch');
    this.prevBranch = this.HEAD.type==='branch' ? this.HEAD.ref : null;
    this.HEAD = { type:'commit', ref:id };
    this.logRef('checkout '+id.slice(0,7));
    return this.ok([
      {t:`Note: switching to '${target}'.`, c:'out'},
      {t:`You are in 'detached HEAD' state at ${id.slice(0,7)}`, c:'warn'}
    ], ['head']);
  }

  gitSwitch(a){
    if(!a.length) return this.err(['usage: git switch <branch>'], 'or create+switch: git switch -c <name>');
    if(a[0]==='-c') return this.gitCheckout(['-b', a[1], a[2]].filter(Boolean));
    if(a[0]==='-'){
      if(!this.prevBranch || this.branches[this.prevBranch]===undefined) return this.err(['no previous branch']);
      return this.gitCheckout([this.prevBranch]);
    }
    if(this.branches[a[0]]===undefined)
      return this.err([`fatal: invalid reference: ${a[0]}`], `switch only moves between branches - to visit a commit use: git checkout <id>`);
    return this.gitCheckout([a[0]]);
  }

  gitMerge(a){
    if(this.merging) return this.err(['already merging'], 'finish it: git add <file> then git commit -m "..."');
    const noff = a.includes('--no-ff');
    const abort = a.includes('--abort');
    if(abort) return this.err(['no merge in progress']);
    const name = a.filter(x=>!x.startsWith('-'))[0];
    if(!name) return this.err(['usage: git merge <branch>']);
    if(this.isDetached()) return this.err(['cannot merge in detached HEAD state'], 'switch to a branch first');
    const theirs = this.resolveRef(name);
    if(theirs===null || theirs===undefined) return this.err([`merge: ${name} - not something we can merge`], 'check: git branch');
    const ours = this.headCommit();
    if(!ours){ // empty branch: fast-forward
      this.branches[this.HEAD.ref] = theirs;
      return this.ok([{t:'Fast-forward', c:'ok'}], ['ff']);
    }
    if(this.isAncestor(theirs, ours)) return this.ok([{t:'Already up to date.', c:'dim'}]);
    const base = this.mergeBase(ours, theirs);
    if(base === ours && !noff){
      this.branches[this.HEAD.ref] = theirs;
      this.logRef('merge (ff)');
      return this.ok([{t:`Updating ${ours.slice(0,7)}..${theirs.slice(0,7)}`, c:'out'},{t:'Fast-forward', c:'ok'}], ['ff']);
    }
    // conflict?
    const oursFiles = this.changedSince(base, ours);
    const theirsFiles = this.changedSince(base, theirs);
    const conflicts = [...oursFiles].filter(f=>theirsFiles.has(f));
    if(conflicts.length){
      this.merging = { theirs, conflictFiles: conflicts, resolved:false };
      conflicts.forEach(f=>{
        const e = this.fileEntry(f);
        if(e){ e.state='conflict'; e.resolved=false; }
        else this.workdir.push({ name:f, state:'conflict', resolved:false });
      });
      return { ok:true, out:[
        {t:`Auto-merging ${conflicts.join(', ')}`, c:'out'},
        {t:`CONFLICT (content): Merge conflict in ${conflicts.join(', ')}`, c:'err'},
        {t:'Automatic merge failed; fix conflicts and then commit the result.', c:'warn'},
        {t:`steps: edit ${conflicts[0]}  ->  git add ${conflicts[0]}  ->  git commit -m "merge"`, c:'dim'}
      ], events:['conflict'] };
    }
    const msg = `Merge branch '${name}'`;
    const id = this.addCommitObj([ours, theirs], msg, [...theirsFiles], this.currentLane());
    this.branches[this.HEAD.ref] = id;
    this.logRef('merge '+name);
    return this.ok([{t:`Merge made by the 'ort' strategy.`, c:'ok'},{t:`merge commit ${id.slice(0,7)}`, c:'out'}], ['mergecommit']);
  }

  gitRebase(a){
    if(a[0]==='-i' || a[0]==='--interactive'){
      const ref = a[1];
      if(!ref) return this.err(['usage: git rebase -i HEAD~<n>']);
      const base = this.resolveRef(ref);
      if(!base) return this.err([`invalid ref: ${ref}`]);
      const head = this.headCommit();
      const list = this.commitsBetween(base, head);
      if(!list.length) return this.err(['noop - nothing to rebase']);
      return { ok:true, out:[{t:`interactive rebase: ${list.length} commit(s)`, c:'out'}],
               events:['irebase'], irebase:{ base, list } };
    }
    const upstream = a.filter(x=>!x.startsWith('-'))[0];
    if(!upstream) return this.err(['usage: git rebase <branch>']);
    if(this.isDetached()) return this.err(['rebase from a branch, not detached HEAD']);
    const onto = this.resolveRef(upstream);
    if(onto===null) return this.err([`invalid upstream '${upstream}'`], 'check: git branch');
    const head = this.headCommit();
    if(this.isAncestor(head, onto)){
      this.branches[this.HEAD.ref] = onto;
      this.logRef('rebase (ff)');
      return this.ok([{t:'Fast-forwarded to '+upstream, c:'ok'}], ['ff']);
    }
    const base = this.mergeBase(head, onto);
    if(base===head){ return this.ok([{t:'Current branch is up to date.', c:'dim'}]); }
    const todo = this.commitsBetween(base, head);
    const newIds = [];
    let parent = onto;
    const lane = this.currentLane();
    todo.forEach(cid=>{
      const c = this.commits[cid];
      const nid = this.addCommitObj([parent], c.msg, c.changed, lane);
      newIds.push(nid); parent = nid;
    });
    this.branches[this.HEAD.ref] = parent;
    this.logRef('rebase '+upstream);
    return { ok:true, out:[
      {t:`Successfully rebased ${this.HEAD.ref} onto ${upstream}`, c:'ok'},
      {t:`replayed ${todo.length} commit(s) with new hashes`, c:'dim'}
    ], events:['rebase'], rebased:{ old: todo, neu: newIds } };
  }

  applyInteractiveRebase(base, actions){
    // actions: [{id, action:'pick'|'squash'|'fixup'|'reword'|'drop', msg?}]
    let parent = base;
    const lane = this.currentLane();
    const neu = [];
    let pending = null; // for squash/fixup accumulation
    const flush = ()=>{
      if(!pending) return;
      const nid = this.addCommitObj([parent], pending.msg, pending.changed, lane);
      neu.push(nid); parent = nid; pending = null;
    };
    actions.forEach(act=>{
      const c = this.commits[act.id];
      if(!c) return;
      if(act.action==='drop') return;
      if(act.action==='squash' || act.action==='fixup'){
        if(!pending){ pending = { msg: c.msg, changed:[...c.changed] }; return; }
        pending.changed.push(...c.changed);
        if(act.action==='squash') pending.msg = pending.msg + ' + ' + c.msg;
        return;
      }
      flush();
      pending = { msg: act.action==='reword' && act.msg ? act.msg : c.msg, changed:[...c.changed] };
    });
    flush();
    if(this.HEAD.type==='branch') this.branches[this.HEAD.ref] = parent;
    else this.HEAD.ref = parent;
    this.logRef('rebase -i');
    return neu;
  }

  gitCherryPick(a){
    const ref = a[0];
    if(!ref) return this.err(['usage: git cherry-pick <commit>']);
    const id = this.resolveRef(ref);
    if(!id) return this.err([`bad revision '${ref}'`], 'find ids with: git log or the graph');
    if(this.isDetached()) return this.err(['switch to a branch first']);
    const head = this.headCommit();
    if(this.isAncestor(id, head)) return this.err([`commit ${id.slice(0,7)} is already on this branch`]);
    const c = this.commits[id];
    const nid = this.addCommitObj(head?[head]:[], c.msg, c.changed, this.currentLane());
    this.branches[this.HEAD.ref] = nid;
    this.logRef('cherry-pick');
    return { ok:true, out:[{t:`[${this.HEAD.ref} ${nid.slice(0,7)}] ${c.msg}`, c:'ok'}], events:['cherry'], cherry:{ from:id, to:nid } };
  }

  gitReset(a){
    let mode = '--mixed';
    const flags = a.filter(x=>x.startsWith('--'));
    if(flags.includes('--soft')) mode='--soft';
    if(flags.includes('--hard')) mode='--hard';
    const ref = a.filter(x=>!x.startsWith('-'))[0] || 'HEAD';
    const id = this.resolveRef(ref);
    if(!id) return this.err([`bad revision '${ref}'`], 'try: git reset --hard HEAD~1');
    if(this.isDetached()) return this.err(['reset moves a branch - switch to one first']);
    const old = this.headCommit();
    this.branches[this.HEAD.ref] = id;
    if(mode==='--hard'){ this.staging=[]; this.workdir = this.workdir.filter(f=>f.state==='untracked'); }
    else {
      // changes from undone commits come back
      const undone = this.commitsBetween(id, old);
      const files = new Set(); undone.forEach(c=>(this.commits[c].changed||[]).forEach(f=>files.add(f)));
      files.forEach(f=>{ if(!this.fileEntry(f)) this.workdir.push({name:f, state:'modified'}); });
      if(mode==='--soft'){ files.forEach(f=>{ if(!this.staging.includes(f)) this.staging.push(f); }); }
      else this.staging = [];
    }
    this.logRef('reset '+mode+' '+ref);
    return this.ok([{t:`HEAD is now at ${id.slice(0,7)} ${this.commits[id]?.msg||''}`, c:'ok'},
                    {t:mode==='--hard'?'working tree reset':'changes kept '+(mode==='--soft'?'(staged)':'(unstaged)'), c:'dim'}], ['reset']);
  }

  gitRevert(a){
    const ref = a[0] || 'HEAD';
    const id = this.resolveRef(ref);
    if(!id) return this.err([`bad revision '${ref}'`]);
    if(this.isDetached()) return this.err(['switch to a branch first']);
    const c = this.commits[id];
    const head = this.headCommit();
    const nid = this.addCommitObj([head], `Revert "${c.msg}"`, c.changed, this.currentLane());
    this.branches[this.HEAD.ref] = nid;
    this.logRef('revert');
    return this.ok([{t:`[${this.HEAD.ref} ${nid.slice(0,7)}] Revert "${c.msg}"`, c:'ok'},
                    {t:'history preserved - a new commit undoes the old one', c:'dim'}], ['commit']);
  }

  gitRestore(a){
    if(a[0]==='--staged'){
      const name = a[1];
      if(!name) return this.err(['usage: git restore --staged <file>']);
      if(!this.staging.includes(name)) return this.err([`'${name}' is not staged`]);
      this.staging = this.staging.filter(f=>f!==name);
      if(!this.fileEntry(name)) this.workdir.push({ name, state: this.tracked.has(name)?'modified':'untracked' });
      return this.ok([{t:`unstaged ${name}`, c:'ok'}], ['unstage']);
    }
    const name = a[0];
    if(!name) return this.err(['usage: git restore <file>']);
    const f = this.fileEntry(name);
    if(!f || f.state!=='modified') return this.err([`no local changes in '${name}'`]);
    this.workdir = this.workdir.filter(x=>x.name!==name);
    return this.ok([{t:`restored ${name} (changes discarded)`, c:'ok'}], ['workdir']);
  }

  gitStash(a){
    const sub = a[0];
    if(!sub || sub==='push'){
      const stashable = this.workdir.filter(f=>f.state==='modified');
      const stagedCopy = [...this.staging];
      if(!stashable.length && !stagedCopy.length) return this.err(['No local changes to save']);
      this.stash.unshift({ files: stashable.map(f=>f.name).concat(stagedCopy) });
      this.workdir = this.workdir.filter(f=>f.state!=='modified');
      this.staging = [];
      return this.ok([{t:`Saved working directory (stash@{0})`, c:'ok'}], ['stash']);
    }
    if(sub==='list'){
      if(!this.stash.length) return this.ok([{t:'(stash is empty)', c:'dim'}]);
      return { ok:true, out:this.stash.map((s,i)=>({t:`stash@{${i}}: ${s.files.join(', ')}`, c:'out'})), events:[] };
    }
    if(sub==='pop' || sub==='apply'){
      if(!this.stash.length) return this.err(['No stash entries found.']);
      const s = sub==='pop' ? this.stash.shift() : this.stash[0];
      s.files.forEach(name=>{ if(!this.fileEntry(name)) this.workdir.push({ name, state:'modified' }); });
      return this.ok([{t:`${sub==='pop'?'Dropped and restored':'Applied'} stash@{0}`, c:'ok'}], ['unstash']);
    }
    if(sub==='drop'){ if(!this.stash.length) return this.err(['nothing to drop']); this.stash.shift();
      return this.ok([{t:'Dropped stash@{0}', c:'ok'}], ['stash']); }
    return this.err([`unknown stash command '${sub}'`], 'try: git stash / pop / list / apply');
  }

  gitTag(a){
    if(!a.length){
      const names = Object.keys(this.tags);
      return { ok:true, out: names.length ? names.map(t=>({t,c:'out'})) : [{t:'(no tags)',c:'dim'}], events:[] };
    }
    if(a[0]==='-d'){ if(this.tags[a[1]]===undefined) return this.err([`tag '${a[1]}' not found`]);
      delete this.tags[a[1]]; return this.ok([{t:`Deleted tag ${a[1]}`,c:'ok'}], ['tag']); }
    const name = a[0];
    if(this.tags[name]!==undefined) return this.err([`tag '${name}' already exists`]);
    const at = a[1] ? this.resolveRef(a[1]) : this.headCommit();
    if(!at) return this.err(['no commit to tag']);
    this.tags[name] = at;
    return this.ok([{t:`tagged ${at.slice(0,7)} as ${name}`, c:'ok'}], ['tag']);
  }

  /* ---------- remotes (simulated) ---------- */
  ensureOrigin(){ if(!this.origin) this.origin = { branches:{}, commits:{} }; }
  remoteUrl(){ return this.originUrl || GitEngine.DUMMY_REMOTE; }
  remoteHost(){ return this.remoteUrl().replace(/^https?:\/\//,'').replace(/\.git$/,''); }
  gitRemote(a){
    if(!a.length || a[0]==='-v'){
      if(!this.originName) return this.ok([{t:'(no remotes)', c:'dim'}]);
      const url = this.remoteUrl();
      return this.ok([
        {t:`${this.originName}\t${url} (fetch)`, c:'out'},
        {t:`${this.originName}\t${url} (push)`, c:'out'}
      ]);
    }
    if(a[0]==='add'){
      const name=a[1], url=a[2];
      if(!name || !url) return this.err(['usage: git remote add origin <url>']);
      if(this.originName) return this.err([`remote ${this.originName} already exists`]);
      this.originName = name;
      this.originUrl = url;
      this.ensureOrigin();
      return this.ok([{t:`added remote '${name}' -> ${url}`, c:'ok'}], ['remote']);
    }
    if(a[0]==='remove' || a[0]==='rm'){
      if(!this.originName) return this.err(['no such remote']);
      this.originName = null; this.originUrl = null;
      return this.ok([{t:'removed remote', c:'ok'}], ['remote']);
    }
    if(a[0]==='set-url'){
      if(!this.originName) return this.err(['no remote configured'], 'git remote add origin <url>');
      if(!a[1]) return this.err(['usage: git remote set-url origin <url>']);
      this.originUrl = a[a.length-1];
      return this.ok([{t:`updated remote url -> ${this.originUrl}`, c:'ok'}], ['remote']);
    }
    return this.err([`unknown remote command`], 'try: git remote add origin <url>');
  }

  gitClone(a){
    if(this.initialized && Object.keys(this.commits).length) return this.err(['directory not empty'], 'use Reset first (sandbox) or continue with this repo');
    // build a small remote repo and clone it
    this.reset(true);
    this.originName = 'origin';
    this.originUrl = a[0] || GitEngine.DUMMY_REMOTE;
    this.ensureOrigin();
    const c1 = this.addCommitObj([], 'Initial commit', ['README.md'], 0);
    const c2 = this.addCommitObj([c1], 'Add docs', ['docs.md'], 0);
    this.branches['main'] = c2;
    this.HEAD = { type:'branch', ref:'main' };
    this.remoteRefs['origin/main'] = c2;
    this.origin.branches['main'] = c2;
    this.tracked.add('README.md'); this.tracked.add('docs.md');
    this.upstreams['main'] = 'origin/main';
    return this.ok([
      {t:`Cloning into 'repo'...`, c:'out'},
      {t:`remote: ${this.remoteUrl()}`, c:'dim'},
      {t:'remote: counting objects: done.', c:'dim'},
      {t:'Receiving objects: 100% - done.', c:'ok'}
    ], ['clone']);
  }

  gitFetch(){
    if(!this.originName) return this.err(['no remote configured'], 'git remote add origin <url>');
    this.ensureOrigin();
    let news = 0;
    Object.entries(this.origin.commits||{}).forEach(([id,c])=>{
      if(!this.commits[id]){ this.commits[id] = c; news++; }
    });
    Object.entries(this.origin.branches).forEach(([b,id])=>{
      this.remoteRefs['origin/'+b] = id;
    });
    return this.ok([news
      ? {t:`fetched ${news} new commit(s) into origin/*`, c:'ok'}
      : {t:'Already up to date.', c:'dim'}], ['fetch']);
  }

  gitPull(){
    if(!this.originName) return this.err(['no remote configured'], 'git remote add origin <url>');
    const f = this.gitFetch();
    if(!f.ok) return f;
    if(this.HEAD.type!=='branch') return this.err(['detached HEAD - switch to a branch']);
    const rb = this.remoteRefs['origin/'+this.HEAD.ref];
    if(rb===undefined) return this.ok([{t:'Already up to date.', c:'dim'}]);
    const m = this.gitMerge(['origin/'+this.HEAD.ref]);
    return { ok:m.ok, out:[...f.out, ...m.out], events:[...f.events, ...m.events] };
  }

  gitPush(a){
    if(!this.originName) return this.err(['no remote configured'], 'first: git remote add origin <url>');
    this.ensureOrigin();
    let branch = this.HEAD.type==='branch' ? this.HEAD.ref : null;
    const rest = a.filter(x=>!x.startsWith('-'));
    if(rest.length===2) branch = rest[1];
    if(!branch) return this.err(['detached HEAD - cannot push']);
    if(this.branches[branch]===undefined) return this.err([`branch '${branch}' not found`]);
    const setU = a.includes('-u') || a.includes('--set-upstream');
    const local = this.branches[branch];
    const remote = this.origin.branches[branch];
    if(remote !== undefined && !this.isAncestor(remote, local))
      return this.err(['! [rejected] '+branch+' -> '+branch+' (non-fast-forward)'],
        'the remote has commits you do not have - run git pull first');
    if(remote === local) return this.ok([{t:'Everything up-to-date', c:'dim'}]);
    this.origin.branches[branch] = local;
    // remote learns commits
    this.ancestors(local).forEach(id=>{ this.origin.commits[id] = this.commits[id]; });
    this.remoteRefs['origin/'+branch] = local;
    if(setU) this.upstreams[branch] = 'origin/'+branch;
    return this.ok([
      {t:`To ${this.remoteHost()}.git`, c:'dim'},
      {t:`   ${branch} -> ${branch}${setU?' (upstream set)':''}`, c:'ok'}
    ], ['push']);
  }

  gitReflog(){
    if(!this.reflog.length) return this.ok([{t:'(reflog empty)', c:'dim'}]);
    return { ok:true, out:this.reflog.slice(0,10).map((r,i)=>
      ({t:`${(r.head||'0000000').slice(0,7)} HEAD@{${i}}: ${r.action}`, c:'out'})), events:[] };
  }

  gitBisect(a){
    const sub = a[0];
    if(sub==='start'){ this.bisect = { step:0 }; return this.ok([{t:'bisect: mark commits with git bisect good/bad', c:'out'}]); }
    if(!this.bisect) return this.err(['bisect not started'], 'git bisect start');
    if(sub==='bad' || sub==='good'){
      this.bisect.step++;
      if(this.bisect.step>=3){
        const head = this.headCommit();
        this.bisect = null;
        return this.ok([{t:`${(head||'').slice(0,7)} is the first bad commit`, c:'ok'},
                        {t:'bisect: binary search found the bug!', c:'dim'}], ['bisect-done']);
      }
      return this.ok([{t:`Bisecting: checking midpoint... (${3-this.bisect.step} step(s) left)`, c:'out'},
                      {t:'test this commit, then mark: git bisect good | bad', c:'dim'}]);
    }
    if(sub==='reset'){ this.bisect=null; return this.ok([{t:'bisect ended', c:'ok'}]); }
    return this.err(['usage: git bisect start|good|bad|reset']);
  }

  gitSubmodule(a){
    if(a[0]==='add') return this.ok([
      {t:`Cloning into 'libs/module'...`, c:'out'},
      {t:'submodule added (a repo inside your repo, pinned to a commit)', c:'ok'}], ['submodule']);
    return this.ok([{t:'submodules pin an external repo at an exact commit inside yours', c:'dim'}]);
  }
  gitWorktree(a){
    if(a[0]==='add') return this.ok([
      {t:`Preparing worktree (new folder, same repo)`, c:'out'},
      {t:'you can now work on two branches in two folders at once', c:'ok'}], ['worktree']);
    return this.ok([{t:'worktrees = extra folders sharing one repository', c:'dim'}]);
  }

  /* ---------- serialization (sandbox export/import) ---------- */
  toJSON(){
    return JSON.stringify({
      initialized:this.initialized, commits:this.commits, branches:this.branches,
      HEAD:this.HEAD, staging:this.staging, workdir:this.workdir,
      tracked:[...this.tracked], stash:this.stash, tags:this.tags,
      origin:this.origin, originName:this.originName, originUrl:this.originUrl, remoteRefs:this.remoteRefs,
      seq:this.seq, laneSeq:this.laneSeq, branchLanes:this.branchLanes
    });
  }
  fromJSON(s){
    const d = JSON.parse(s);
    this.reset(d.initialized);
    Object.assign(this, {
      commits:d.commits, branches:d.branches, HEAD:d.HEAD, staging:d.staging,
      workdir:d.workdir, stash:d.stash, tags:d.tags, origin:d.origin,
      originName:d.originName, originUrl:d.originUrl, remoteRefs:d.remoteRefs, seq:d.seq,
      laneSeq:d.laneSeq, branchLanes:d.branchLanes
    });
    this.tracked = new Set(d.tracked);
  }
}
GitEngine.DUMMY_REMOTE = 'https://github.com/phoenix-dev/project.git';
if(typeof module!=='undefined') module.exports = { GitEngine };
