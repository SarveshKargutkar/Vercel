/* GitQuest - chapters & levels. Learning by doing: tiny objective -> command -> animation -> short explanation. */

function gqRun(e, cmds){ cmds.forEach(c => e.exec(c)); }
function gqSeed(e, msgs, file){ // init + n commits on main
  e.exec('git init');
  msgs.forEach((m,i)=>{
    e.exec('touch ' + (file || ('file'+(i+1)+'.txt')));
    if(file && i>0) e.exec('edit '+file);
    e.exec('git add .');
    e.exec(`git commit -m "${m}"`);
  });
}
function gqCommitOn(e, branch, msg, file){
  e.exec('git checkout '+branch);
  e.exec('edit '+(file||'notes.txt'));
  e.exec('git add .');
  e.exec(`git commit -m "${msg}"`);
}
function gqOriginAhead(e, msg, file){
  e.ensureOrigin(); e.originName = e.originName || 'origin';
  const tip = e.origin.branches['main'] !== undefined ? e.origin.branches['main'] : e.branches['main'];
  const id = e.addCommitObj(tip?[tip]:[], msg, [file||'remote.txt'], 0);
  const c = e.commits[id]; delete e.commits[id];
  e.origin.commits[id] = c;
  e.origin.branches['main'] = id;
  // origin also knows history
  if(tip) e.ancestors(tip).forEach(a=>{ if(e.commits[a]) e.origin.commits[a]=e.commits[a]; });
  return id;
}
function gqCommitCount(e){ return Object.keys(e.commits).length; }

const GQ_CHAPTERS = [

/* ================= CHAPTER 1 : GIT BASICS ================= */
{ id:'ch1', title:'Git Basics', icon:'&#128230;', badge:'Git Beginner', color:'#f5a524',
  levels:[
  { id:'1-1', title:'Your First File', xp:20,
    obj:'Every project starts with a file. Create one:',
    goalText:'Create a file called hello.txt',
    setup(e){},
    goal(e){ return !!e.fileEntry('hello.txt'); },
    hints:['This terminal has a command to create files.','It starts with t...','touch hello.txt'],
    explain:'That file lives in your <b>Working Directory</b> — just a normal folder. Git doesn\'t know it exists yet. Git is a time machine for files: it records snapshots of your project so you can always go back.',
    solution:['touch hello.txt'] },

  { id:'1-2', title:'git init', xp:20,
    obj:'Turn this folder into a Git repository.',
    goalText:'Initialize a repository',
    setup(e){ e.exec('touch hello.txt'); },
    goal(e){ return e.initialized; },
    hints:['Every Git project begins with the same command.','It creates a hidden .git folder.','git init'],
    explain:'<b>git init</b> creates a hidden .git folder — the repository — where every snapshot will be stored. Your files are untouched; Git is now simply watching.',
    solution:['git init'] },

  { id:'1-3', title:'git status', xp:20,
    obj:'Ask Git what it sees right now.',
    goalText:'Check the repository status',
    setup(e){ e.exec('touch hello.txt'); e.exec('git init'); },
    goal(e,ctx){ return ctx.ran('git status'); },
    hints:['You want Git\'s current view of your files.','The command reports "status".','git status'],
    explain:'<b>git status</b> is your compass — it shows untracked files (red), staged files (green) and your current branch. Run it whenever you\'re unsure. hello.txt is <i>untracked</i>: Git sees it but isn\'t recording it yet.',
    solution:['git status'] },

  { id:'1-4', title:'git add', xp:20,
    obj:'Tell Git you want hello.txt in the next snapshot.',
    goalText:'Stage hello.txt',
    setup(e){ e.exec('touch hello.txt'); e.exec('git init'); },
    goal(e){ return e.staging.includes('hello.txt'); },
    hints:['Files must be staged before committing.','Watch the file slide to the Staging column.','git add hello.txt'],
    explain:'<b>git add</b> moves a file into the <b>Staging Area</b> — a preparation zone for your next snapshot. You choose exactly what goes in. Nothing is saved permanently yet.',
    solution:['git add hello.txt'] },

  { id:'1-5', title:'git commit', xp:20,
    obj:'Save your first snapshot with a message.',
    goalText:'Create your first commit',
    setup(e){ e.exec('touch hello.txt'); e.exec('git init'); e.exec('git add hello.txt'); },
    goal(e){ return gqCommitCount(e) >= 1; },
    hints:['A commit is a saved snapshot with a message.','The -m flag attaches your message.','git commit -m "first commit"'],
    explain:'A <b>commit</b> is a permanent snapshot — see it appear as a circle in the graph. The <b>main</b> branch now points to it, and <b>HEAD</b> shows where you are. This moment is saved forever.',
    solution:['git commit -m "first commit"'] },

  { id:'1-6', title:'Commit History', xp:20,
    obj:'This repo already has history. Read it.',
    goalText:'View the commit log',
    setup(e){ gqSeed(e, ['Initial commit','Add homepage','Fix typo']); },
    goal(e,ctx){ return ctx.ran('git log'); },
    hints:['Git keeps a journal of every commit.','The command lists the "log".','git log'],
    explain:'<b>git log</b> lists commits newest-first. Each has a unique hash (like a1b2c3d) — its fingerprint. The graph shows the same story: each circle points back to its parent.',
    solution:['git log'] },

  { id:'1-7', title:'Chain of Snapshots', xp:50,
    obj:'Build history yourself: make TWO more commits (create a file, add, commit — twice).',
    goalText:'Make 2 new commits',
    setup(e){ gqSeed(e, ['Initial commit']); },
    goal(e){ return gqCommitCount(e) >= 3; },
    hints:['Repeat the cycle: touch → add → commit.','touch a.txt, then git add a.txt, then commit. Then again.','touch a.txt / git add . / git commit -m "one" / touch b.txt / git add . / git commit -m "two"'],
    explain:'Each commit links to its parent, forming a chain — your project\'s timeline. The branch pointer always slides to the newest commit, and HEAD rides along. This loop (edit → add → commit) is 90% of daily Git.',
    solution:['touch a.txt','git add .','git commit -m "one"','touch b.txt','git add .','git commit -m "two"'] },
]},

/* ================= CHAPTER 2 : BRANCHES ================= */
{ id:'ch2', title:'Branches', icon:'&#127807;', badge:'Branch Master', color:'#43c98c',
  levels:[
  { id:'2-1', title:'Create a Branch', xp:20,
    obj:'Create a branch called <b>feature</b> — a parallel timeline.',
    goalText:'Create branch "feature"',
    setup(e){ gqSeed(e, ['Initial commit','Add base']); },
    goal(e){ return e.branches['feature'] !== undefined; },
    hints:['A branch is just a movable label on a commit.','git branch <name>','git branch feature'],
    explain:'A branch is only a <b>label pointing at a commit</b> — nothing is copied. Notice you\'re still on main: creating a branch doesn\'t move you there.',
    solution:['git branch feature'] },

  { id:'2-2', title:'checkout', xp:20,
    obj:'Now move onto the feature branch.',
    goalText:'Switch to "feature"',
    setup(e){ gqSeed(e, ['Initial commit','Add base']); e.exec('git branch feature'); },
    goal(e){ return e.HEAD.type==='branch' && e.HEAD.ref==='feature'; },
    hints:['HEAD needs to move to the other label.','Watch the HEAD tag slide in the graph.','git checkout feature'],
    explain:'<b>git checkout</b> moves HEAD — the "you are here" marker. New commits will now grow on feature, leaving main untouched. Safe experimentation unlocked.',
    solution:['git checkout feature'] },

  { id:'2-3', title:'switch', xp:20,
    obj:'checkout does many jobs, so modern Git added a clearer command. Go back to main using <b>switch</b>.',
    goalText:'Use git switch to reach main',
    setup(e){ gqSeed(e, ['Initial commit','Add base']); e.exec('git checkout -b feature'); },
    goal(e,ctx){ return e.HEAD.ref==='main' && ctx.ran('git switch'); },
    hints:['Same effect as checkout, newer name.','git switch <branch>','git switch main'],
    explain:'<b>git switch</b> only switches branches — nothing else — which makes it beginner-safe. Bonus: <b>git switch -c name</b> creates and switches in one step, like checkout -b.',
    solution:['git switch main'] },

  { id:'2-4', title:'Delete a Branch', xp:20,
    obj:'The hotfix branch is fully merged and finished. Clean it up.',
    goalText:'Delete branch "hotfix"',
    setup(e){ gqSeed(e, ['Initial commit','Fix bug']); e.exec('git branch hotfix'); },
    goal(e){ return e.branches['hotfix'] === undefined; },
    hints:['Deleting a branch only removes the label, not commits.','The flag is -d.','git branch -d hotfix'],
    explain:'<b>-d</b> deletes the label; the commits stay in history. Git refuses to delete unmerged work with -d — that\'s the safety net (-D forces it).',
    solution:['git branch -d hotfix'] },

  { id:'2-5', title:'Rename a Branch', xp:20,
    obj:'Team convention changed — rename <b>fix</b> to <b>bugfix/login</b>.',
    goalText:'Rename fix → bugfix/login',
    setup(e){ gqSeed(e, ['Initial commit']); e.exec('git branch fix'); },
    goal(e){ return e.branches['bugfix/login'] !== undefined && e.branches['fix'] === undefined; },
    hints:['The rename flag is -m (move).','git branch -m <old> <new>','git branch -m fix bugfix/login'],
    explain:'<b>-m</b> renames the label in place — history is untouched. Slashes in names (bugfix/login) are just naming convention, great for organizing team branches.',
    solution:['git branch -m fix bugfix/login'] },

  { id:'2-6', title:'Detached HEAD', xp:50,
    obj:'Time-travel: checkout the FIRST commit directly by its hash (find it in the graph or git log).',
    goalText:'Enter detached HEAD state',
    setup(e){ gqSeed(e, ['Initial commit','Second','Third']); },
    goal(e){ return e.isDetached(); },
    hints:['Checkout a commit hash instead of a branch name.','git log shows hashes; the graph shows them under each circle.','git checkout <first-commit-hash> (or: git checkout HEAD~2)'],
    explain:'HEAD normally points to a <i>branch</i>; pointing it at a raw <i>commit</i> is <b>detached HEAD</b> — you\'re sightseeing in history. Look, don\'t build: commits made here can get lost. To keep work from here, create a branch.',
    solution:['git checkout HEAD~2'] },
]},

/* ================= CHAPTER 3 : MERGE ================= */
{ id:'ch3', title:'Merge', icon:'&#128256;', badge:'Merge Wizard', color:'#5aa2e8',
  levels:[
  { id:'3-1', title:'Your First Merge', xp:50,
    obj:'The feature branch is done. From main, merge it in.',
    goalText:'Merge feature into main',
    setup(e){ gqSeed(e, ['Initial commit'], 'app.js');
      e.exec('git checkout -b feature'); gqCommitOn(e,'feature','Add feature','feat.js');
      gqCommitOn(e,'main','Update readme','README.md'); },
    goal(e){ const m=e.branches['main'], f=e.branches['feature']; return m && f && e.isAncestor(f,m) && (e.commits[m].parents||[]).length===2; },
    hints:['You merge INTO the branch you\'re standing on.','You\'re on main already — pull feature\'s work in.','git merge feature'],
    explain:'Both branches had new work, so Git created a <b>merge commit</b> — the diamond with TWO parent arrows. It ties both timelines together. Nothing is lost; both histories remain visible.',
    solution:['git merge feature'] },

  { id:'3-2', title:'Merge Conflict!', xp:100,
    obj:'Both branches edited <b>app.js</b>. Merge feature — then fix the mess: <span class="gq-code">edit app.js</span> → <span class="gq-code">git add app.js</span> → <span class="gq-code">git commit -m "merge"</span>',
    goalText:'Resolve the conflict and complete the merge',
    setup(e){ gqSeed(e, ['Initial commit'], 'app.js');
      e.exec('git checkout -b feature'); gqCommitOn(e,'feature','Change title','app.js');
      gqCommitOn(e,'main','Change header','app.js'); },
    goal(e){ const m=e.branches['main']; return !e.merging && m && (e.commits[m].parents||[]).length===2; },
    hints:['Start with the merge — it will stop with a CONFLICT.','Conflicted files must be edited, then staged.','git merge feature / edit app.js / git add app.js / git commit -m "merge"'],
    explain:'When both sides change the same lines, Git stops and asks YOU to pick the final version. You edit the file, <b>git add</b> it to mark it resolved, then commit. Conflicts aren\'t errors — they\'re Git asking for a decision.',
    solution:['git merge feature','edit app.js','git add app.js','git commit -m "merge"'] },

  { id:'3-3', title:'Fast-Forward', xp:50,
    obj:'Main has NO new work since feature branched off. Merge feature and watch — no merge commit needed.',
    goalText:'Fast-forward main to feature',
    setup(e){ gqSeed(e, ['Initial commit']);
      e.exec('git checkout -b feature'); gqCommitOn(e,'feature','Work 1','a.js'); gqCommitOn(e,'feature','Work 2','b.js');
      e.exec('git checkout main'); },
    goal(e){ return e.branches['main']===e.branches['feature'] && Object.values(e.commits).every(c=>(c.parents||[]).length<2); },
    hints:['Merge normally — Git notices main hasn\'t moved.','main simply slides forward along the line.','git merge feature'],
    explain:'Main was directly behind feature, so Git just <b>fast-forwarded</b> the main label along the existing commits. No merge commit, perfectly linear history — the simplest merge there is.',
    solution:['git merge feature'] },

  { id:'3-4', title:'No Fast-Forward', xp:50,
    obj:'Same setup — but your team wants an explicit merge commit for the record. Force one.',
    goalText:'Merge with --no-ff',
    setup(e){ gqSeed(e, ['Initial commit']);
      e.exec('git checkout -b feature'); gqCommitOn(e,'feature','Work 1','a.js');
      e.exec('git checkout main'); },
    goal(e){ const m=e.branches['main']; return m && (e.commits[m].parents||[]).length===2; },
    hints:['A flag forbids fast-forwarding.','--no-ff forces a merge commit even when unnecessary.','git merge --no-ff feature'],
    explain:'<b>--no-ff</b> creates a merge commit even when a fast-forward was possible. Why? The merge commit documents "a feature landed here" — many teams require it for readable history.',
    solution:['git merge --no-ff feature'] },
]},

/* ================= CHAPTER 4 : REBASE ================= */
{ id:'ch4', title:'Rebase', icon:'&#128295;', badge:'History Architect', color:'#b78af5',
  levels:[
  { id:'4-1', title:'Basic Rebase', xp:100,
    obj:'Feature drifted behind main. Instead of merging, REPLAY feature\'s commits on top of main. (You\'re on feature.)',
    goalText:'Rebase feature onto main',
    setup(e){ gqSeed(e, ['Initial commit'], 'base.js');
      e.exec('git checkout -b feature'); gqCommitOn(e,'feature','Feat A','fa.js'); gqCommitOn(e,'feature','Feat B','fb.js');
      gqCommitOn(e,'main','Main work','m.js');
      e.exec('git checkout feature'); },
    goal(e){ return e.isAncestor(e.branches['main'], e.branches['feature']) && Object.values(e.commits).every(c=>(c.parents||[]).length<2); },
    hints:['Rebase = pick my commits up, replay them elsewhere.','You rebase ONTO the other branch.','git rebase main'],
    explain:'Watch: your commits detached and were <b>replayed one-by-one</b> on top of main — with NEW hashes (they\'re new commits). Result: a clean straight line, as if you started your work after main\'s. Golden rule: never rebase commits you\'ve already shared.',
    solution:['git rebase main'] },

  { id:'4-2', title:'Interactive Rebase', xp:100,
    obj:'Open the last 3 commits for editing: <span class="gq-code">git rebase -i HEAD~3</span> — then keep all three as "pick" and confirm.',
    goalText:'Complete an interactive rebase',
    setup(e){ gqSeed(e, ['Initial commit','Add login','Fix login','Polish login']); },
    goal(e,ctx){ return ctx.flags.irebaseDone; },
    hints:['-i opens a todo list of commits.','HEAD~3 means "the last three commits".','git rebase -i HEAD~3, then Confirm'],
    explain:'<b>rebase -i</b> hands you a todo list of commits and lets you reorder, rename, squash or drop them before Git rewrites history. It\'s the history editor — the next levels use its real powers.',
    solution:['git rebase -i HEAD~3'], special:'irebase-any' },

  { id:'4-3', title:'Squash', xp:100,
    obj:'Three tiny "wip" commits are noise. Combine them into ONE: <span class="gq-code">git rebase -i HEAD~3</span>, mark the last two as <b>squash</b>.',
    goalText:'Squash 3 commits into 1',
    setup(e){ gqSeed(e, ['Initial commit','wip 1','wip 2','wip 3']); },
    goal(e,ctx){ const head=e.headCommit(); if(!head) return false;
      return ctx.flags.irebaseDone && e.commitsBetween(null, head).length===2; },
    hints:['squash melts a commit into the one above it.','Keep the first as pick, set the two below to squash.','git rebase -i HEAD~3 → pick, squash, squash → Confirm'],
    explain:'<b>squash</b> folds commits into the one above, combining messages. Three sloppy wips became one clean commit — this is how messy work-in-progress becomes a tidy history before sharing.',
    solution:['git rebase -i HEAD~3'], special:'irebase-squash' },

  { id:'4-4', title:'Fixup', xp:100,
    obj:'Same cleanup, but DISCARD the small commits\' messages entirely: use <b>fixup</b> instead of squash.',
    goalText:'Fixup 2 commits into their parent',
    setup(e){ gqSeed(e, ['Initial commit','Add payment page','typo','oops forgot file']); },
    goal(e,ctx){ const head=e.headCommit(); if(!head) return false;
      return ctx.flags.irebaseFixup && e.commitsBetween(null, head).length===2; },
    hints:['fixup = squash but silently drops the message.','pick the real commit, fixup the "typo" and "oops" ones.','git rebase -i HEAD~3 → pick, fixup, fixup → Confirm'],
    explain:'<b>fixup</b> is squash\'s quiet sibling: same fold, but the small commit\'s message is thrown away. Perfect for "typo" and "oops" commits nobody needs to remember.',
    solution:['git rebase -i HEAD~3'], special:'irebase-fixup' },

  { id:'4-5', title:'Edit a Commit Message', xp:50,
    obj:'Your last commit message is embarrassing. Rewrite it to <b>"Add user authentication"</b>.',
    goalText:'Amend the last commit message',
    setup(e){ gqSeed(e, ['Initial commit','asdfgh lol']); },
    goal(e){ const h=e.headCommit(); return h && e.commits[h].msg==='Add user authentication'; },
    hints:['You can rewrite the most recent commit.','--amend replaces the last commit.','git commit --amend -m "Add user authentication"'],
    explain:'<b>--amend</b> swaps your last commit for a corrected one — note the hash changed, because it IS a new commit. Amend freely before pushing; avoid amending commits others already have.',
    solution:['git commit --amend -m "Add user authentication"'] },
]},

/* ================= CHAPTER 5 : UNDO MISTAKES ================= */
{ id:'ch5', title:'Undo Mistakes', icon:'&#9203;', badge:'Time Traveler', color:'#f06a4d',
  levels:[
  { id:'5-1', title:'Undo, Keep Changes', xp:50,
    obj:'Story: you committed too early. Undo the LAST commit but keep the work staged.',
    goalText:'Soft-reset one commit back',
    setup(e){ gqSeed(e, ['Initial commit','Half-finished work']); },
    goal(e){ const h=e.headCommit(); return h && e.commits[h].msg==='Initial commit' && e.staging.length>0; },
    hints:['reset moves the branch pointer backwards.','--soft keeps everything staged.','git reset --soft HEAD~1'],
    explain:'<b>reset --soft HEAD~1</b> slid the branch back one commit — the commit is gone from history but its files dropped safely back into staging. Finish the work and commit again properly.',
    solution:['git reset --soft HEAD~1'] },

  { id:'5-2', title:'Hard Reset', xp:50,
    obj:'Story: the last commit is garbage. Erase it AND its changes completely.',
    goalText:'Hard-reset one commit back',
    setup(e){ gqSeed(e, ['Initial commit','Good work','Total garbage']); },
    goal(e){ const h=e.headCommit(); return h && e.commits[h].msg==='Good work' && !e.staging.length; },
    hints:['Same command, harsher flag.','--hard throws the changes away too.','git reset --hard HEAD~1'],
    explain:'<b>--hard</b> rewinds the branch AND wipes the changes — gone from history and disk. Powerful and dangerous: use it only when you truly want work destroyed. (Spoiler: reflog can still save you.)',
    solution:['git reset --hard HEAD~1'] },

  { id:'5-3', title:'Revert (the Safe Undo)', xp:50,
    obj:'This commit was already SHARED with your team — you can\'t rewrite history. Undo it the safe way.',
    goalText:'Revert the last commit',
    setup(e){ gqSeed(e, ['Initial commit','Break production']); },
    goal(e){ const h=e.headCommit(); return h && e.commits[h].msg.startsWith('Revert'); },
    hints:['Don\'t move history backwards — add a commit that cancels it.','revert creates an "anti-commit".','git revert HEAD'],
    explain:'<b>revert</b> adds a NEW commit that undoes an old one — history only grows, so it\'s safe on shared branches. Rule of thumb: <b>reset</b> for private mistakes, <b>revert</b> for public ones.',
    solution:['git revert HEAD'] },

  { id:'5-4', title:'Restore a File', xp:50,
    obj:'You broke config.js with bad edits (not committed). Throw the edits away. Then unstage extra.js which you added by mistake.',
    goalText:'Discard config.js edits, unstage extra.js',
    setup(e){ gqSeed(e, ['Initial commit'], 'config.js');
      e.exec('edit config.js'); e.exec('touch extra.js'); e.exec('git add extra.js'); },
    goal(e){ const f=e.fileEntry('config.js'); return (!f || f.state!=='modified') && !e.staging.includes('extra.js'); },
    hints:['restore has two jobs: discard edits, or unstage.','git restore <file> discards; --staged unstages.','git restore config.js / git restore --staged extra.js'],
    explain:'<b>git restore file</b> throws away uncommitted edits; <b>git restore --staged file</b> pulls a file back out of the staging area. Two small commands that fix most "oops" moments before they become commits.',
    solution:['git restore config.js','git restore --staged extra.js'] },

  { id:'5-5', title:'Visit the Past', xp:50,
    obj:'Story: "it worked two commits ago!" Go look at that old version, then come back to main.',
    goalText:'Checkout HEAD~2, then return to main',
    setup(e){ gqSeed(e, ['v1 works','v2 refactor','v3 broken']); },
    goal(e,ctx){ return ctx.flags.wasDetached && e.HEAD.type==='branch' && e.HEAD.ref==='main'; },
    hints:['Checkout an old commit to inspect it.','Then checkout main to return to the present.','git checkout HEAD~2 / git checkout main'],
    explain:'You visited an old snapshot (detached HEAD), looked around, and came home — nothing was changed or lost. This is the safe way to answer "when did it break?" — and it\'s exactly what git bisect automates later.',
    solution:['git checkout HEAD~2','git checkout main'] },
]},

/* ================= CHAPTER 6 : REMOTE GIT ================= */
{ id:'ch6', title:'Remote Git', icon:'&#127760;', badge:'Remote Explorer', color:'#4ec9d4',
  levels:[
  { id:'6-1', title:'Clone', xp:20,
    obj:'Start from someone else\'s project: clone it.',
    goalText:'Clone the remote repository',
    setup(e){},
    goal(e){ return e.initialized && e.remoteRefs['origin/main'] !== undefined; },
    hints:['clone copies a remote repo to your machine.','Any URL works here.','git clone https://github.com/you/repo.git'],
    explain:'<b>clone</b> downloaded the whole repository — full history included — and set up <b>origin</b> as a nickname for the remote. The gray <b>origin/main</b> label is your local memory of where the remote\'s main was.',
    solution:['git clone https://github.com/you/repo.git'] },

  { id:'6-2', title:'Add a Remote', xp:20,
    obj:'This repo was born locally. Connect it to GitHub.',
    goalText:'Add origin remote',
    setup(e){ gqSeed(e, ['Initial commit']); },
    goal(e){ return e.originName === 'origin'; },
    hints:['You\'re naming a remote URL.','The conventional name is origin.','git remote add origin https://github.com/you/repo.git'],
    explain:'<b>origin</b> is just the default nickname for "the remote server" — nothing magical. One repo can have several remotes (origin, upstream, a teammate\'s fork...).',
    solution:['git remote add origin https://github.com/you/repo.git'] },

  { id:'6-3', title:'Fetch', xp:50,
    obj:'A teammate pushed while you slept. Download the news WITHOUT touching your work.',
    goalText:'Fetch from origin',
    setup(e){ gqSeed(e, ['Initial commit']); e.exec('git remote add origin https://github.com/you/repo.git');
      e.exec('git push -u origin main'); gqOriginAhead(e, 'Teammate work'); },
    goal(e){ return e.remoteRefs['origin/main'] === e.origin.branches['main']; },
    hints:['fetch downloads but never merges.','Watch origin/main move while main stays put.','git fetch'],
    explain:'<b>fetch</b> downloaded the teammate\'s commit and moved <b>origin/main</b> forward — but YOUR main didn\'t move. Fetch is always safe: it updates your knowledge, never your work.',
    solution:['git fetch'] },

  { id:'6-4', title:'Pull', xp:50,
    obj:'Now actually bring the teammate\'s commit into your main.',
    goalText:'Pull origin\'s changes into main',
    setup(e){ gqSeed(e, ['Initial commit']); e.exec('git remote add origin https://github.com/you/repo.git');
      e.exec('git push -u origin main'); gqOriginAhead(e, 'Teammate work'); },
    goal(e){ return e.branches['main'] === e.origin.branches['main']; },
    hints:['pull = fetch + merge in one move.','Your main fast-forwards to match.','git pull'],
    explain:'<b>pull = fetch + merge</b>. Your main was strictly behind, so it fast-forwarded. When both sides have new commits, pull creates a merge (or a conflict — you already know how to handle those).',
    solution:['git pull'] },

  { id:'6-5', title:'Push', xp:50,
    obj:'Commit something and publish it to the remote.',
    goalText:'Make a commit, then push it',
    setup(e){ gqSeed(e, ['Initial commit']); e.exec('git remote add origin https://github.com/you/repo.git');
      e.exec('git push -u origin main'); },
    goal(e){ return e.origin.branches['main'] === e.branches['main'] && gqCommitCount(e) >= 2; },
    hints:['First commit locally, then send it up.','push uploads your new commits to origin.','touch new.js / git add . / git commit -m "new" / git push'],
    explain:'<b>push</b> uploads your commits and moves the remote\'s branch — origin/main caught up to you. Commits are local until you push; push is how work becomes visible to the team.',
    solution:['touch new.js','git add .','git commit -m "new"','git push'] },

  { id:'6-6', title:'Push Rejected!', xp:100,
    obj:'Story: your push just got REJECTED — a teammate pushed first. Try <span class="gq-code">git push</span>, read the error, fix it, push again.',
    goalText:'Recover from a rejected push',
    setup(e){ gqSeed(e, ['Initial commit']); e.exec('git remote add origin https://github.com/you/repo.git');
      e.exec('git push -u origin main'); gqOriginAhead(e, 'Teammate beat you');
      e.exec('touch mine.js'); e.exec('git add .'); e.exec('git commit -m "My work"'); },
    goal(e){ return e.origin.branches['main'] === e.branches['main'] && e.isAncestor(e.remoteRefs['origin/main'] || '', e.branches['main']); },
    hints:['Push fails: the remote has commits you lack.','Pull first to combine both histories.','git push (fails) / git pull / git commit -m "merge" if needed / git push'],
    explain:'Git rejected the push to protect the teammate\'s commit. The fix is always: <b>pull first</b> (merging their work into yours), then push the combined result. This dance is daily life on a team.',
    solution:['git pull','git push'] },

  { id:'6-7', title:'Upstream', xp:50,
    obj:'Publish a brand-new branch and link it to origin so plain "git push" works next time.',
    goalText:'Push feature with -u',
    setup(e){ gqSeed(e, ['Initial commit']); e.exec('git remote add origin https://github.com/you/repo.git');
      e.exec('git push -u origin main'); e.exec('git checkout -b feature');
      e.exec('touch f.js'); e.exec('git add .'); e.exec('git commit -m "Feature work"'); },
    goal(e){ return e.origin.branches['feature'] !== undefined && e.upstreams['feature'] === 'origin/feature'; },
    hints:['New branches don\'t exist on the remote yet.','-u sets the upstream link while pushing.','git push -u origin feature'],
    explain:'<b>-u</b> (--set-upstream) tells Git "this local branch tracks origin/feature". From now on a bare <b>git push</b> or <b>git pull</b> on this branch knows exactly where to go.',
    solution:['git push -u origin feature'] },
]},

/* ================= CHAPTER 7 : COLLABORATION ================= */
{ id:'ch7', title:'Collaboration', icon:'&#129309;', badge:'Team Player', color:'#f5c542',
  levels:[
  { id:'7-1', title:'Feature Branch Flow', xp:50,
    obj:'Golden rule: never work on main. Create <b>feature/nav</b>, commit there, and leave main clean.',
    goalText:'Commit on feature/nav, keep main untouched',
    setup(e){ gqSeed(e, ['Initial commit']); e.mainTip = e.branches['main']; },
    goal(e){ return e.branches['feature/nav'] !== undefined &&
      e.branches['main'] === e.mainTip &&
      e.branches['feature/nav'] !== e.mainTip; },
    hints:['Create + switch, then do the work there.','git switch -c makes and moves in one step.','git switch -c feature/nav / touch nav.js / git add . / git commit -m "Add nav"'],
    explain:'Feature branches keep main always releasable — work in progress can\'t break it. Every professional workflow (GitHub Flow, trunk-based, GitFlow) is built on this one habit.',
    solution:['git switch -c feature/nav','touch nav.js','git add .','git commit -m "Add nav"'] },

  { id:'7-2', title:'Open a Pull Request', xp:50,
    obj:'Push your branch, then open a Pull Request with <span class="gq-code">pr create</span> (simulated GitHub).',
    goalText:'Push feature/nav and open a PR',
    setup(e){ gqSeed(e, ['Initial commit']); e.exec('git remote add origin https://github.com/you/repo.git');
      e.exec('git push -u origin main'); e.exec('git switch -c feature/nav');
      e.exec('touch nav.js'); e.exec('git add .'); e.exec('git commit -m "Add nav"'); },
    goal(e,ctx){ return e.origin.branches['feature/nav'] !== undefined && ctx.flags.prCreated; },
    hints:['The branch must be on the remote before a PR can exist.','push -u origin feature/nav, then pr create.','git push -u origin feature/nav / pr create'],
    explain:'A <b>Pull Request</b> says: "my branch is ready — please review and merge it." It\'s not a Git command; it\'s a GitHub/GitLab layer on top where discussion, review and CI happen before merging.',
    solution:['git push -u origin feature/nav','pr create'] },

  { id:'7-3', title:'Code Review', xp:50,
    obj:'A reviewer requested changes. Make a fix commit, push it, then approve with <span class="gq-code">pr review</span>.',
    goalText:'Push a fix and complete review',
    setup(e){ gqSeed(e, ['Initial commit']); e.exec('git remote add origin https://github.com/you/repo.git');
      e.exec('git push -u origin main'); e.exec('git switch -c feature/nav');
      e.exec('touch nav.js'); e.exec('git add .'); e.exec('git commit -m "Add nav"');
      e.exec('git push -u origin feature/nav'); },
    goal(e,ctx){ return gqCommitCount(e)>=3 && e.origin.branches['feature/nav']===e.branches['feature/nav'] && ctx.flags.prReviewed; },
    hints:['New commits pushed to the branch appear in the PR automatically.','edit nav.js → add → commit → push → pr review.','edit nav.js / git add . / git commit -m "Address review" / git push / pr review'],
    explain:'Pushing more commits to a PR branch updates the PR automatically — that\'s the review loop: feedback → fix → push → re-review. Small, reviewable PRs are a superpower on real teams.',
    solution:['edit nav.js','git add .','git commit -m "Address review"','git push','pr review'] },

  { id:'7-4', title:'Merge the PR', xp:50,
    obj:'Approved! Merge the PR with <span class="gq-code">pr merge</span>, then sync your local main with <span class="gq-code">git pull</span>.',
    goalText:'Merge PR and update local main',
    setup(e){ gqSeed(e, ['Initial commit']); e.exec('git remote add origin https://github.com/you/repo.git');
      e.exec('git push -u origin main'); e.exec('git switch -c feature/nav');
      e.exec('touch nav.js'); e.exec('git add .'); e.exec('git commit -m "Add nav"');
      e.exec('git push -u origin feature/nav'); e.prBranch='feature/nav'; },
    goal(e,ctx){ return ctx.flags.prMerged && e.HEAD.ref==='main' && e.branches['main']===e.origin.branches['main']; },
    hints:['The merge happens on the SERVER, not your machine.','After pr merge, your local main is behind — pull it.','pr merge / git switch main / git pull'],
    explain:'The PR merged on GitHub — the REMOTE main moved, while your local main stayed behind until you pulled. Remember: your machine and the server are separate worlds that sync only on fetch/pull/push.',
    solution:['pr merge','git switch main','git pull'] },

  { id:'7-5', title:'Team Conflict', xp:100,
    obj:'Story: your PR conflicts with freshly-merged main. Pull main INTO your branch, resolve, push.',
    goalText:'Resolve the conflict and push',
    setup(e){ gqSeed(e, ['Initial commit'], 'app.js'); e.exec('git remote add origin https://github.com/you/repo.git');
      e.exec('git push -u origin main');
      e.exec('git switch -c feature/ui'); gqCommitOn(e,'feature/ui','My UI change','app.js');
      e.exec('git push -u origin feature/ui');
      gqOriginAhead(e, 'Merged other PR', 'app.js');
      e.exec('git switch feature/ui'); },
    goal(e){ const f=e.branches['feature/ui'];
      return !e.merging && f && (e.commits[f].parents||[]).length===2 && e.origin.branches['feature/ui']===f; },
    hints:['Bring origin/main into your branch: fetch then merge origin/main.','The conflict resolves like chapter 3: edit → add → commit.','git fetch / git merge origin/main / edit app.js / git add app.js / git commit -m "merge main" / git push'],
    explain:'You updated your branch with main\'s latest, resolved the overlap yourself, and pushed — now the PR merges cleanly. Keeping feature branches fresh with main is how teams avoid conflict pileups.',
    solution:['git fetch','git merge origin/main','edit app.js','git add app.js','git commit -m "merge main"','git push'] },
]},

/* ================= CHAPTER 8 : ADVANCED GIT ================= */
{ id:'ch8', title:'Advanced Git', icon:'&#9889;', badge:'Git Grandmaster', color:'#ff79c6',
  levels:[
  { id:'8-1', title:'Cherry-Pick', xp:100,
    obj:'One commit on <b>experiment</b> is gold ("Fix crash"); the rest is junk. Copy ONLY that commit onto main (find its hash in the graph).',
    goalText:'Cherry-pick "Fix crash" onto main',
    setup(e){ gqSeed(e, ['Initial commit']);
      e.exec('git checkout -b experiment');
      gqCommitOn(e,'experiment','Crazy idea','x.js');
      gqCommitOn(e,'experiment','Fix crash','fix.js');
      gqCommitOn(e,'experiment','More chaos','y.js');
      e.exec('git checkout main'); },
    goal(e){ const m=e.branches['main']; if(!m) return false;
      const msgs=e.commitsBetween(null,m).map(c=>e.commits[c].msg);
      return msgs.includes('Fix crash') && !msgs.includes('Crazy idea') && !msgs.includes('More chaos'); },
    hints:['cherry-pick copies a single commit to your branch.','Click the "Fix crash" circle in the graph to see its hash.','git cherry-pick <hash-of-Fix-crash>'],
    explain:'<b>cherry-pick</b> copied just that one commit onto main (new hash — it\'s a copy, and watch it fly in the graph). Great for grabbing a hotfix without dragging a whole messy branch along.',
    solution:['git cherry-pick FIXHASH'] },

  { id:'8-2', title:'Bisect', xp:100,
    obj:'Something broke... somewhere in 20 commits. Let Git binary-search: <span class="gq-code">git bisect start</span>, then answer <span class="gq-code">git bisect bad</span> / <span class="gq-code">good</span> until it finds the culprit.',
    goalText:'Find the bad commit with bisect',
    setup(e){ gqSeed(e, ['v1','v2','v3','v4','v5']); },
    goal(e,ctx){ return ctx.flags.bisectDone; },
    hints:['start it, then mark current as bad and an old one as good.','Git jumps to midpoints; keep answering good/bad.','git bisect start / git bisect bad / git bisect good / git bisect bad'],
    explain:'<b>bisect</b> binary-searches history: mark one bad and one good commit, and Git halves the range each round — 1000 commits takes ~10 answers. The fastest "when did this break?" tool that exists.',
    solution:['git bisect start','git bisect bad','git bisect good','git bisect bad'] },

  { id:'8-3', title:'Reflog Rescue', xp:100,
    obj:'DISASTER: you hard-reset away a good commit. It\'s invisible in the graph... but Git never forgets. Check <span class="gq-code">git reflog</span>, then reset back to the lost commit.',
    goalText:'Recover the lost commit via reflog',
    setup(e){ gqSeed(e, ['Initial commit','Precious work']);
      e.lostId = e.branches['main'];
      e.exec('git reset --hard HEAD~1'); },
    goal(e){ const h=e.headCommit(); return h===e.lostId || (h && e.commits[h] && e.commits[h].msg==='Precious work'); },
    hints:['reflog records every place HEAD has been.','Find the hash next to the "commit" entry, before the reset.','git reflog / git reset --hard <hash-of-Precious-work>'],
    explain:'<b>reflog</b> is Git\'s black box recorder — every HEAD move, even "deleted" ones. A hard-reset commit isn\'t destroyed, just unlabeled, and reflog still knows its hash. Almost nothing is ever truly lost in Git.',
    solution:['git reflog','git reset --hard LOSTHASH'] },

  { id:'8-4', title:'Stash', xp:50,
    obj:'You\'re mid-edit when an urgent bug report lands. Shelve your messy changes, then bring them back.',
    goalText:'Stash your changes, then pop them',
    setup(e){ gqSeed(e, ['Initial commit'], 'app.js'); e.exec('edit app.js'); },
    goal(e,ctx){ return ctx.ran('git stash') && ctx.ran('git stash pop') &&
      e.workdir.some(f=>f.name==='app.js') && !e.stash.length; },
    hints:['stash shelves uncommitted changes; pop restores them.','Watch app.js jump to the Stash box and back.','git stash / git stash pop'],
    explain:'<b>stash</b> sweeps uncommitted changes into a drawer, giving you a clean tree instantly; <b>pop</b> takes them back out. Perfect for "I need to switch tasks RIGHT NOW without committing junk."',
    solution:['git stash','git stash pop'] },

  { id:'8-5', title:'Tags', xp:50,
    obj:'This commit is your v1.0 release. Mark it permanently.',
    goalText:'Tag HEAD as v1.0',
    setup(e){ gqSeed(e, ['Initial commit','Ready for release']); },
    goal(e){ return e.tags['v1.0'] === e.headCommit(); },
    hints:['Tags are permanent labels, unlike branches.','git tag <name> tags the current commit.','git tag v1.0'],
    explain:'A <b>tag</b> is a label that never moves — unlike branches, which slide with every commit. Teams tag releases (v1.0, v2.3.1) so any version can be rebuilt forever.',
    solution:['git tag v1.0'] },

  { id:'8-6', title:'Submodules', xp:50,
    obj:'Your project needs a library that lives in ANOTHER repo. Embed it:',
    goalText:'Add a submodule',
    setup(e){ gqSeed(e, ['Initial commit']); },
    goal(e,ctx){ return ctx.ran('git submodule add'); },
    hints:['A repo inside a repo, pinned to an exact commit.','git submodule add <url>','git submodule add https://github.com/lib/module.git'],
    explain:'A <b>submodule</b> embeds another repository at an exact commit — your repo records "use library X at commit abc123". Powerful for vendored dependencies, though many teams prefer package managers when possible.',
    solution:['git submodule add https://github.com/lib/module.git'] },

  { id:'8-7', title:'Worktrees', xp:50,
    obj:'Final lesson: review a teammate\'s branch WITHOUT disturbing your current work — check it out in a second folder.',
    goalText:'Add a worktree',
    setup(e){ gqSeed(e, ['Initial commit']); e.exec('git branch review-me'); },
    goal(e,ctx){ return ctx.ran('git worktree add'); },
    hints:['One repo, multiple working folders.','git worktree add <path> <branch>','git worktree add ../review review-me'],
    explain:'<b>worktree</b> gives one repository several working folders — main open in one, a review branch in another, zero stashing or switching. You\'ve now met Git\'s whole toolbox: you are a Git Grandmaster.',
    solution:['git worktree add ../review review-me'] },
]},
];

const GQ_ACHIEVEMENTS = [
  { id:'first-commit',  name:'First Commit',       desc:'Make your very first commit',            icon:'&#127793;' },
  { id:'commit-25',     name:'Commit Machine',      desc:'Make 25 commits total',                  icon:'&#9881;&#65039;' },
  { id:'commit-100',    name:'Commit Centurion',    desc:'Make 100 commits total',                 icon:'&#127942;' },
  { id:'merge-master',  name:'Merge Master',        desc:'Complete 5 merges',                      icon:'&#128256;' },
  { id:'rebase-wizard', name:'Rebase Wizard',       desc:'Complete 3 rebases',                     icon:'&#129668;' },
  { id:'conflict-res',  name:'Conflict Resolver',   desc:'Resolve a merge conflict',               icon:'&#9876;&#65039;' },
  { id:'cherry',        name:'Cherry Picker',       desc:'Cherry-pick a commit',                   icon:'&#127826;' },
  { id:'historian',     name:'History Rewriter',    desc:'Use interactive rebase',                 icon:'&#128220;' },
  { id:'time-lord',     name:'Time Lord',           desc:'Recover a commit with reflog',           icon:'&#9203;' },
  { id:'pusher',        name:'Publisher',           desc:'Push to a remote 5 times',               icon:'&#128640;' },
  { id:'speed-runner',  name:'Speed Runner',        desc:'Beat a level in under 20 seconds',       icon:'&#9889;' },
  { id:'perfect-run',   name:'Perfect Run',         desc:'3 stars, zero hints, zero errors',       icon:'&#128175;' },
  { id:'chapter-clear', name:'Chapter Clear',       desc:'Finish a whole chapter',                 icon:'&#128218;' },
  { id:'git-ninja',     name:'Git Ninja',           desc:'Finish every chapter',                   icon:'&#129399;' },
  { id:'streak-3',      name:'On Fire',             desc:'3-day learning streak',                  icon:'&#128293;' },
  { id:'sandboxer',     name:'Mad Scientist',       desc:'Run 20 commands in Sandbox',             icon:'&#129514;' },
];

const GQ_DAILY = [
  { id:'d-commits',  text:'Make 10 commits today',        target:10, key:'commits' },
  { id:'d-conflict', text:'Resolve a merge conflict',     target:1,  key:'conflicts' },
  { id:'d-push',     text:'Push to a remote 3 times',     target:3,  key:'pushes' },
  { id:'d-rebase',   text:'Perform a rebase',             target:1,  key:'rebases' },
  { id:'d-levels',   text:'Complete 3 levels',            target:3,  key:'levels' },
  { id:'d-branch',   text:'Create 5 branches',            target:5,  key:'branches' },
];

if(typeof module!=='undefined') module.exports = { GQ_CHAPTERS, GQ_ACHIEVEMENTS, GQ_DAILY, gqRun, gqSeed, gqOriginAhead };
