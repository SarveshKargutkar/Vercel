/* Headless UI playthrough: loads the REAL sabotage.html + sabotage-client.js
   in 4 jsdom "browsers", connects them to the real server, and plays a full
   game purely by clicking DOM elements and dispatching keyboard events —
   exactly what a player would do.
   Run:  npm install && node test-ui.js   (exit 0 = success) */
'use strict';
process.env.PORT = process.env.PORT || '3012';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const { io: ioClient } = require('socket.io-client');
const { ROOMS, server, _internal } = require('./server.js');
const URL_ = `http://localhost:${process.env.PORT}`;
function pass(m) { console.log('  ✓ ' + m); }
const wait = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, what, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await wait(40); }
  throw new Error('timeout waiting for: ' + what);
}

const HTML = fs.readFileSync(path.join(__dirname, '..', 'sabotage.html'), 'utf8');
const CLIENT = fs.readFileSync(path.join(__dirname, '..', 'sabotage-client.js'), 'utf8');

function makeBrowser(pid) {
  const dom = new JSDOM(HTML, { url: `http://localhost/sabotage.html?pid=${pid}`, runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  win.SABOTAGE_SERVER = URL_;
  win.io = ioClient;
  win.scrollTo = () => {};
  const fn = new Function(
    'window', 'document', 'location', 'localStorage', 'sessionStorage', 'navigator', 'io', 'URLSearchParams',
    'setTimeout', 'setInterval', 'clearInterval', 'clearTimeout',
    CLIENT
  );
  fn(win, win.document, win.location, win.localStorage, win.sessionStorage, win.navigator, win.io, win.URLSearchParams,
    setTimeout, setInterval, clearInterval, clearTimeout);
  win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
  const $ = id => win.document.getElementById(id);
  const q = sel => win.document.querySelector(sel);
  const qa = sel => [...win.document.querySelectorAll(sel)];
  return { pid, dom, win, $, q, qa };
}

function activeScreen(b) { return b.qa('.sb-screen').find(s => s.classList.contains('active')).id; }

function solveMaze(d) {
  const key = (x, y) => x + ',' + y;
  const prev = {}; const q = [[d.pos.x, d.pos.y]]; const seen = { [key(d.pos.x, d.pos.y)]: true };
  const dirs = [['u', 0, -1], ['d', 0, 1], ['l', -1, 0], ['r', 1, 0]];
  while (q.length) {
    const [x, y] = q.shift();
    if (x === d.exit.x && y === d.exit.y) break;
    for (const [dir, dx, dy] of dirs) {
      if (_internal.mazeBlocked(d, x, y, dir)) continue;
      const nx = x + dx, ny = y + dy;
      if (seen[key(nx, ny)]) continue;
      seen[key(nx, ny)] = true; prev[key(nx, ny)] = { from: [x, y], dir };
      q.push([nx, ny]);
    }
  }
  const path_ = []; let cur = key(d.exit.x, d.exit.y);
  while (prev[cur]) { path_.unshift(prev[cur].dir); cur = key(prev[cur].from[0], prev[cur].from[1]); }
  return path_;
}

(async () => {
  console.log('Headless UI playthrough (4 real DOM clients):');
  const names = { u1: 'Ana', u2: 'Ben', u3: 'Cleo', u4: 'Dev' };
  const B = ['u1', 'u2', 'u3', 'u4'].map(makeBrowser);
  const [host] = B;
  const byPid = pid => B.find(b => b.pid === pid);

  assert.strictEqual(activeScreen(host), 'sb-landing');
  pass('landing screen renders');

  // host creates a room through the form
  host.$('sb-c-name').value = names.u1;
  host.$('sb-c-pass').value = 'pw';
  host.$('sb-create').click();
  await waitFor(() => host.$('sb-code').textContent, 'room code');
  const code = host.$('sb-code').textContent;
  assert.ok(ROOMS[code], 'room exists on server');
  assert.strictEqual(activeScreen(host), 'sb-lobby');
  pass('create form → lobby (room ' + code + ')');

  // others join through the form
  for (const b of B.slice(1)) {
    b.$('sb-j-name').value = names[b.pid];
    b.$('sb-j-code').value = code;
    b.$('sb-j-pass').value = 'pw';
    b.$('sb-join').click();
    await waitFor(() => activeScreen(b) === 'sb-lobby', b.pid + ' in lobby');
  }
  await waitFor(() => host.qa('#sb-lobby-players .sb-player').length === 4, '4 player chips');
  pass('3 players joined via the join form; lobby shows 4 chips');

  await waitFor(() => !host.$('sb-start').disabled, 'start enabled');
  assert.ok(B.slice(1).every(b => b.$('sb-start').disabled), 'start disabled for non-hosts');
  host.$('sb-start').click();

  const room = ROOMS[code];
  await waitFor(() => room.phase === 'challenge', 'challenge phase');
  // speed the game up (re-arm round 1 timer)
  room.settings.scoreboardSeconds = 0.4;
  room.settings.triggerSeconds = 2.5;
  for (const b of B) await waitFor(() => activeScreen(b) === 'sb-challenge', b.pid + ' on challenge screen');
  pass('host started the game; all 4 browsers show the challenge screen');

  const sabPid = Object.values(room.players).find(p => p.role === 'saboteur').id;
  const crewPids = Object.values(room.players).filter(p => p.role === 'crew').map(p => p.id);
  assert.ok(byPid(sabPid).$('sb-role-banner').className.includes('saboteur'));
  assert.ok(crewPids.every(pid => byPid(pid).$('sb-role-banner').className.includes('crew')));
  pass('role banners match server truth (saboteur=' + sabPid + ')');

  /* ---------------- ROUND 1: password ---------------- */
  assert.strictEqual(room.challenge, 'password');
  for (const t of room.teams) {
    const guide = byPid(t.guideIds[0]), agent = byPid(t.agentId);
    await waitFor(() => guide.qa('.sb-pw-def').length === 5, 'guide sees 5 definitions');
    await waitFor(() => agent.qa('.sb-pw-word').length === 10, 'agent sees 10 words');
    assert.strictEqual(guide.qa('.sb-pw-word').length, 0, 'guide has no word list');
    assert.strictEqual(agent.qa('.sb-pw-def').length, 0, 'agent has no definitions');
  }
  pass('password UI: guides see definitions, agents see 10-word lists');
  const r1TeamsUI = room.teams.map(t => ({ members: [...t.members].sort().join(','), agent: t.agentId }));

  // team chat through the UI, verify isolation
  const tA = room.teams[0], tB = room.teams[1];
  const gA = byPid(tA.guideIds[0]), aA = byPid(tA.agentId), aB = byPid(tB.agentId);
  gA.$('sb-teamchat-in').value = 'slot 1 is the snow house';
  gA.$('sb-teamchat-send').click();
  await waitFor(() => aA.$('sb-teamchat-log').textContent.includes('snow house'), 'teammate got chat');
  await wait(150);
  assert.ok(!aB.$('sb-teamchat-log').textContent.includes('snow house'), 'other team saw nothing');
  pass('team chat flows through the UI and stays private');

  // wrong answer by clicking a decoy word
  {
    const t = room.teams[0], agent = byPid(t.agentId);
    const answer0 = t.data.targets[0][0];
    const decoyEl = agent.qa('.sb-pw-word').find(el => el.getAttribute('data-w') !== answer0);
    decoyEl.click();
    await waitFor(() => agent.$('sb-task-area').textContent.includes('1/5 wrong'), 'wrong-word feedback');
    pass('clicking a wrong word shows the 1/5 wrong-guess counter');
  }

  // both agents solve all 5 slots by clicking slot -> word
  for (const t of room.teams) {
    const agent = byPid(t.agentId), guide = byPid(t.guideIds[0]);
    for (let i = 0; i < 5; i++) {
      const slotEl = await waitFor(() => agent.qa('.sb-pw-slot')[i], 'slot ' + i);
      slotEl.click();
      const word = t.data.targets[i][0];
      const wordEl = await waitFor(() => agent.qa('.sb-pw-word').find(el => el.getAttribute('data-w') === word && !el.classList.contains('used')), 'word chip ' + word);
      wordEl.click();
      await waitFor(() => t.data.slots[i] === word, 'slot ' + i + ' locked');
    }
    await waitFor(() => guide.qa('.sb-pw-def.solved').length === 5, 'guide sees all definitions solved');
  }
  await waitFor(() => room.teams.every(t => t.done && t.ok), 'both teams complete');
  pass('both agents solved the password puzzle by clicking the UI');

  /* ---------------- VOTING 1: glass + blank survival ---------------- */
  await waitFor(() => room.phase === 'voting', 'voting phase');
  for (const b of B) await waitFor(() => activeScreen(b) === 'sb-voting', b.pid + ' voting screen');
  assert.strictEqual(host.qa('#sb-shells .sb-shell').length, 6, '6 shells rendered');
  assert.ok(host.$('sb-chamber-sub').textContent.includes('LIVE'));
  assert.strictEqual(host.qa('#sb-results-strip .sb-tchip.ok').length, 2, 'both teams shown as ✓');
  pass('voting screen: chamber, shell count, and round results render');

  // rig chamber, then a glass holder inspects it via the button
  room.chamber = ['blank', 'live', 'live', 'blank', 'blank', 'blank'];
  const holderPid = Object.values(room.players).find(p => p.glass > 0).id;
  const holder = byPid(holderPid);
  await waitFor(() => holder.$('sb-glass-btn').style.display !== 'none', 'glass button visible for holder');
  const nonHolder = B.find(b => b !== holder && room.players[b.pid].glass === 0);
  assert.strictEqual(nonHolder.$('sb-glass-btn').style.display, 'none', 'no button without a glass');
  holder.$('sb-glass-btn').click();
  await waitFor(() => holder.$('sb-glass-result').textContent.includes('BLANK'), 'private peek shown');
  await wait(120);
  assert.ok(!nonHolder.$('sb-glass-result').textContent.includes('BLANK'), 'peek stays private');
  pass('magnifying glass via UI: holder-only button, private BLANK reveal');

  // everyone clicks the same crew candidate -> trigger phase -> suspect pulls -> blank
  const victimPid = crewPids.find(pid => pid !== host.pid); // a crew member who is NOT the host
  for (const b of B) {
    const cand = await waitFor(() => b.qa('.sb-cand').find(el => el.getAttribute('data-id') === victimPid), 'candidate row');
    cand.click();
  }
  const victim = byPid(victimPid);
  await waitFor(() => room.phase === 'trigger', 'trigger phase');
  await waitFor(() => victim.$('sb-trigger-overlay').classList.contains('active'), 'trigger overlay up');
  assert.strictEqual(victim.$('sb-trigger-title').textContent, 'YOU WERE ACCUSED');
  assert.ok(victim.$('sb-pull-btn').style.display !== 'none', 'suspect sees the pull button');
  assert.strictEqual(host.$('sb-pull-btn').style.display, 'none', 'spectators cannot pull');
  victim.$('sb-pull-btn').click();
  await waitFor(() => victim.$('sb-trigger-title').textContent.includes('click'), 'click. (blank)');
  assert.ok(room.players[victimPid].alive, 'suspect survived');
  assert.ok(!victim.$('sb-trigger-sub').textContent.toLowerCase().includes('saboteur'), 'role not revealed on blank');
  pass('roulette via UI: accused pulled the trigger, blank, survived, role hidden');

  /* ---------------- ROUND 2: maze ---------------- */
  await waitFor(() => room.phase === 'challenge' && room.challenge === 'maze', 'maze round', 15000);
  // teams are fixed for the whole game; only roles swap
  {
    const r2 = room.teams.map(t => ({ members: [...t.members].sort().join(','), agent: t.agentId }));
    assert.deepStrictEqual(r2.map(t => t.members).sort(), r1TeamsUI.map(t => t.members).sort(), 'memberships unchanged');
    r2.forEach(t2 => {
      const t1 = r1TeamsUI.find(x => x.members === t2.members);
      assert.notStrictEqual(t2.agent, t1.agent, 'roles swapped within the team');
    });
    pass('teams persist across rounds (roles swapped, members unchanged)');
  }
  for (const t of room.teams) {
    const guide = byPid(t.guideIds[0]), agent = byPid(t.agentId);
    await waitFor(() => agent.qa('#maze-grid .sb-mcell').length === 81, 'agent 9x9 grid');
    await waitFor(() => guide.qa('#maze-grid .sb-mcell').length === 81, 'guide 9x9 grid');
    assert.ok(guide.qa('.sb-mcell.wt, .sb-mcell.wb, .sb-mcell.wl, .sb-mcell.wr').length > 20, 'guide sees walls');
    assert.strictEqual(agent.qa('.sb-mcell.wt, .sb-mcell.wb, .sb-mcell.wl, .sb-mcell.wr').length, 0, 'agent sees no walls');
    assert.ok(agent.$('dpad'), 'agent has a d-pad');
    assert.ok(!guide.$('dpad'), 'guide has no d-pad');
  }
  pass('maze UI: guide sees walls, agent is blind with a d-pad');

  // keyboard: agent walks into a wall -> hit counter, then solves via arrow keys/d-pad
  {
    const t = room.teams[0], agent = byPid(t.agentId);
    const dirs = ['u', 'd', 'l', 'r'];
    const blocked = dirs.find(dd => _internal.mazeBlocked(t.data, t.data.pos.x, t.data.pos.y, dd));
    const keyName = { u: 'ArrowUp', d: 'ArrowDown', l: 'ArrowLeft', r: 'ArrowRight' }[blocked];
    agent.win.document.dispatchEvent(new agent.win.KeyboardEvent('keydown', { key: keyName, cancelable: true, bubbles: true }));
    await waitFor(() => agent.$('maze-hits').textContent.startsWith('1'), 'wall hit registered from keyboard');
    pass('arrow-key move into a wall registers a hit');
  }
  for (const t of room.teams) {
    const agent = byPid(t.agentId);
    for (const dir of solveMaze(t.data)) {
      agent.qa('#dpad button').find(b2 => b2.getAttribute('data-d') === dir).click();
    }
    await waitFor(() => t.done && t.ok, 'team reached exit');
    assert.ok(agent.$('sb-task-area').textContent.includes('Reached the exit'));
  }
  pass('both agents were guided to the exit via the d-pad');

  /* ---------------- VOTING 2: skip path ---------------- */
  await waitFor(() => room.phase === 'voting', 'voting 2');
  for (const b of B) { await waitFor(() => activeScreen(b) === 'sb-voting', 'voting screen'); b.$('sb-skip-vote').click(); }
  await waitFor(() => host.$('sb-reveal-overlay').classList.contains('active'), 'skip reveal overlay');
  assert.ok(host.$('sb-reveal-box').textContent.includes('No one was accused'));
  pass('unanimous skip: nobody faces the chamber');

  /* ---------------- ROUND 3: bomb ---------------- */
  await waitFor(() => room.phase === 'challenge' && room.challenge === 'bomb', 'bomb round', 15000);
  for (const t of room.teams) {
    const guide = byPid(t.guideIds[0]), agent = byPid(t.agentId);
    await waitFor(() => guide.qa('.sb-man-step').length >= 4, 'guide manual');
    await waitFor(() => agent.qa('.sb-wire').length === 5, 'agent wires');
    assert.strictEqual(agent.qa('.sb-man-step').length, 0, 'agent has no manual');
    assert.strictEqual(guide.qa('.sb-wire').length, 0, 'guide has no bomb');
    assert.strictEqual(agent.qa('.sb-switch').length, 4);
    assert.ok(agent.$('sb-task-area').textContent.includes(t.data.serial), 'serial visible to agent');
  }
  pass('bomb UI: manual for the instructor, hardware for the executor');

  // one wrong action -> strike shown as 💥
  {
    const t = room.teams[0], agent = byPid(t.agentId);
    const first = t.data.steps[0];
    if (first.k === 'cut') {
      agent.qa('.sb-switch')[3].click(); // wrong: flip a switch when a cut is expected
    } else {
      const w = agent.qa('.sb-wire')[4]; w.click(); w.click(); // wrong: cut wire 5 (arm + confirm)
      if (t.data.steps[0].k === 'cut' && t.data.steps[0].i === 4) throw new Error('unlucky pick');
    }
    await waitFor(() => agent.$('bomb-strikes').textContent.includes('💥'), 'strike displayed');
    assert.strictEqual(t.data.strikes, 1);
    pass('wrong action on the bomb shows a strike (💥)');
  }

  // defuse both bombs by clicking wires (arm+confirm) and switches in manual order
  for (const t of room.teams) {
    const agent = byPid(t.agentId);
    for (const st of t.data.steps.slice(t.data.idx)) {
      const before = t.data.idx;
      if (st.k === 'cut') { const w = agent.qa('.sb-wire')[st.i]; w.click(); w.click(); }
      else agent.qa('.sb-switch')[st.i].click();
      await waitFor(() => t.data.idx === before + 1, 'step applied');
    }
    await waitFor(() => t.done && t.ok, 'bomb defused');
    assert.ok(agent.$('sb-task-area').textContent.includes('defused'));
    assert.ok(agent.qa('.sb-wire.cut').length >= 2, 'cut wires drawn as severed');
  }
  pass('both bombs defused through the interface');

  /* ---------------- FINAL VOTE: live round, crew win ---------------- */
  await waitFor(() => room.phase === 'voting', 'voting 3');
  room.chamber = ['live', 'blank', 'blank', 'blank', 'blank', 'blank'];
  for (const b of B) {
    if (!room.players[b.pid].alive) continue;
    await waitFor(() => activeScreen(b) === 'sb-voting', 'voting screen');
    const cand = await waitFor(() => b.qa('.sb-cand').find(el => el.getAttribute('data-id') === sabPid), 'saboteur candidate');
    cand.click();
  }
  const sabB = byPid(sabPid);
  await waitFor(() => room.phase === 'trigger', 'trigger 3');
  await waitFor(() => sabB.$('sb-pull-btn').style.display !== 'none', 'saboteur must pull');
  sabB.$('sb-pull-btn').click();
  await waitFor(() => host.$('sb-trigger-title').textContent.includes('BANG'), 'BANG shown');
  assert.ok(host.$('sb-trigger-sub').textContent.includes('SABOTEUR'), 'role revealed on elimination');

  await waitFor(() => room.phase === 'ended', 'game over');
  for (const b of B) await waitFor(() => activeScreen(b) === 'sb-over', 'game-over screen');
  assert.ok(host.$('sb-over-title').textContent.includes('Crew Wins'));
  assert.ok(host.qa('#sb-final-board .sb-rank .role').length === 4, 'all roles revealed on final board');
  assert.ok(host.$('sb-again').style.display !== 'none', 'host sees Play again');
  const nonHostCrew = crewPids.find(pid => pid !== host.pid);
  assert.strictEqual(byPid(nonHostCrew).$('sb-again').style.display, 'none', 'non-host does not');
  pass('live round eliminates the saboteur — crew win screen on every client');

  console.log('\nALL UI TESTS PASSED');
  B.forEach(b => { try { b.win.close(); } catch (e) {} });
  server.close();
  process.exit(0);
})().catch(e => { console.error('\nTEST FAILED:', e); process.exit(1); });
