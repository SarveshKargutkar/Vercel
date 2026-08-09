/* End-to-end simulation of a full Sabotage v2 game (crew-win path).
   Covers: lobby, pairing, all 3 challenges (password / maze / bomb),
   team chat, saboteur secret scoring on team failure, magnifying glass,
   Buckshot-style voting + trigger (blank survival, live elimination,
   auto-fire timeout), scoreboard, and crew win.
   Run:  npm install && node test-e2e.js   (exit 0 = success) */
'use strict';
process.env.PORT = process.env.PORT || '3009';
const assert = require('assert');
const { io: Client } = require('socket.io-client');
const { server, ROOMS, _internal } = require('./server.js');
const URL = `http://localhost:${process.env.PORT}`;
function pass(m) { console.log('  ✓ ' + m); }
const wait = ms => new Promise(r => setTimeout(r, ms));
async function waitUntil(fn, what, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return; await wait(40); }
  throw new Error('timeout waiting for: ' + what);
}
const once = (sock, ev) => new Promise(res => sock.once(ev, res));
const emitAck = (sock, ev, data) => new Promise(res => sock.emit(ev, data, res));

function mkClient(playerId) {
  const s = Client(URL, { transports: ['websocket'], forceNew: true });
  s.playerId = playerId; s.role = null; s.cd = null; s.items = [];
  s.on('role', d => { s.role = d.role; s.fellows = d.fellowSaboteurs; });
  s.on('challengeData', d => { s.cd = d; });
  s.on('itemGained', d => { s.items.push(d.item); });
  s.on('room', r => { s.lastRoom = r; });
  return s;
}

/* BFS the maze from the server's ground truth */
function solveMaze(d) {
  const N = d.size, key = (x, y) => x + ',' + y;
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
  const path = []; let cur = key(d.exit.x, d.exit.y);
  while (prev[cur]) { path.unshift(prev[cur].dir); cur = key(prev[cur].from[0], prev[cur].from[1]); }
  return path;
}

(async () => {
  console.log('End-to-end game (crew-win path):');
  const host = mkClient('p1'), c2 = mkClient('p2'), c3 = mkClient('p3'), c4 = mkClient('p4');
  const all = [host, c2, c3, c4];
  const byId = id => all.find(s => s.playerId === id);
  await Promise.all(all.map(s => once(s, 'connect')));
  pass('4 clients connected');

  const cr = await emitAck(host, 'createRoom', { name: 'Host', playerId: 'p1', password: 'secret' });
  assert.ok(cr.ok && cr.code); const code = cr.code;
  pass('room created: ' + code);

  const badJoin = await emitAck(c2, 'joinRoom', { code, name: 'Bob', playerId: 'p2', password: 'nope' });
  assert.ok(badJoin.error && /password/i.test(badJoin.error));
  pass('wrong password rejected');

  for (const [c, id, nm] of [[c2, 'p2', 'Bob'], [c3, 'p3', 'Cara'], [c4, 'p4', 'Dan']]) {
    const j = await emitAck(c, 'joinRoom', { code, name: nm, playerId: id, password: 'secret' });
    assert.ok(j.ok, nm + ' joined');
  }
  pass('3 players joined with correct password');

  // duplicate names are rejected (case-insensitive)
  const dup = mkClient('p5');
  await once(dup, 'connect');
  const dupJoin = await emitAck(dup, 'joinRoom', { code, name: 'bob', playerId: 'p5', password: 'secret' });
  assert.ok(dupJoin.error && /taken/i.test(dupJoin.error));
  dup.close();
  pass('joining with an already-used name is rejected');

  const tooFew = await emitAck(host, 'startGame', {});
  // 4 players is exactly minPlayers, so this should START, not fail — register listener first
  // (we did not, so restart cleanly below if needed). Instead verify min-players with a fresh room:
  assert.ok(tooFew.ok, 'startGame with 4 players ok');

  const room = ROOMS[code];
  // speed up the game for testing
  room.settings.scoreboardSeconds = 0.4;
  room.settings.triggerSeconds = 1.5;

  await wait(100);
  const saboteur = all.find(s => s.role === 'saboteur');
  const crew = all.filter(s => s.role === 'crew');
  assert.ok(saboteur && crew.length === 3, 'roles assigned');
  assert.strictEqual((saboteur.fellows || []).length, 0);
  pass('roles assigned privately (saboteur=' + saboteur.playerId + ')');

  assert.strictEqual(room.phase, 'challenge');
  assert.strictEqual(room.challenge, 'password');
  assert.strictEqual(room.teams.length, 2, 'two teams of two');
  room.teams.forEach(t => {
    assert.strictEqual(t.members.length, 2);
    assert.strictEqual(t.guideIds.length, 1);
    assert.ok(t.agentId && !t.guideIds.includes(t.agentId));
  });
  pass('round 1 = password puzzle, 2 teams, one guide + one agent each');

  // private views: guide sees definitions only; agent sees word list only
  await wait(80);
  for (const t of room.teams) {
    const guide = byId(t.guideIds[0]), agent = byId(t.agentId);
    assert.ok(guide.cd && guide.cd.isGuide && guide.cd.view.defs && guide.cd.view.defs.length === 5 && !guide.cd.view.words);
    assert.ok(agent.cd && agent.cd.isAgent && agent.cd.view.words && agent.cd.view.words.length === 10 && !agent.cd.view.defs);
    const targets = t.data.targets.map(x => x[0]);
    targets.forEach(w => assert.ok(agent.cd.view.words.includes(w), 'answer present in agent word list'));
  }
  pass('asymmetric private views delivered (definitions vs 10-word list)');

  // remember round-1 team memberships + agents (teams must never change)
  const r1Teams = room.teams.map(t => ({ members: [...t.members].sort().join(','), agent: t.agentId }));

  // team chat reaches teammates only
  const tA = room.teams[0], tB = room.teams[1];
  const gA = byId(tA.guideIds[0]), aA = byId(tA.agentId), aB = byId(tB.agentId);
  let leaked = false; aB.on('teamChat', () => { leaked = true; });
  const gotChat = once(aA, 'teamChat');
  gA.emit('teamChat', { text: 'first word is the boat one' });
  const cm = await gotChat;
  assert.strictEqual(cm.text, 'first word is the boat one');
  await wait(120);
  assert.ok(!leaked, 'team chat did not leak to the other team');
  pass('team chat is team-only');

  // find which team the saboteur is on; solve the OTHER team, then make the
  // saboteur's team burn through the 5-wrong-guess limit
  const sabTeam = room.teams.find(t => t.members.includes(saboteur.playerId));
  const okTeam = room.teams.find(t => t !== sabTeam);
  const okAgent = byId(okTeam.agentId);

  // a wrong submission first (decoy word)
  const decoy = okAgent.cd.view.words.find(w => w !== okTeam.data.targets[0][0]);
  const wrongState = once(okAgent, 'pwState');
  okAgent.emit('pwSubmit', { slot: 0, word: decoy });
  const ws = await wrongState;
  assert.strictEqual(ws.lastOk, false); assert.strictEqual(ws.wrong, 1);
  assert.strictEqual(ws.failed, false);
  pass('wrong password submission counted (1/5), slot stays open');

  // now solve all 5 slots
  for (let i = 0; i < 5; i++) {
    const st = once(okAgent, 'pwState');
    okAgent.emit('pwSubmit', { slot: i, word: okTeam.data.targets[i][0] });
    const r = await st;
    assert.strictEqual(r.lastOk, true, 'slot ' + i + ' accepted');
  }
  assert.ok(okTeam.done && okTeam.ok, 'team marked complete');
  pass('password puzzle solved by the agent (with 1 wrong guess, under the limit)');

  // saboteur's team: 5 wrong guesses = round failed
  const sabAgent = byId(sabTeam.agentId);
  const sabDecoy = sabTeam.data.words.find(w => w !== sabTeam.data.targets[0][0]);
  const votingP = once(host, 'votingPhase');
  let lastPw = null;
  sabAgent.on('pwState', d => { lastPw = d; });
  for (let i = 0; i < 5; i++) sabAgent.emit('pwSubmit', { slot: 0, word: sabDecoy });
  await waitUntil(() => lastPw && lastPw.failed, 'pw fail state');
  assert.strictEqual(lastPw.wrong, 5);
  assert.ok(sabTeam.done && !sabTeam.ok, '5 wrong guesses fail the team');
  pass('5th wrong guess fails the round for that team');

  const voting = await votingP;
  assert.ok(voting.chamber && voting.chamber.total === 6 && voting.chamber.live >= 2 && voting.chamber.live <= 3);
  assert.strictEqual(voting.chamber.live + voting.chamber.blank, voting.chamber.total);
  assert.strictEqual(room.chamber.length, 6);
  pass(`voting phase begins; chamber announced (${voting.chamber.live} live / ${voting.chamber.blank} blank)`);

  // secret saboteur scoring: own team failed
  const sabPlayer = room.players[saboteur.playerId];
  assert.strictEqual(sabPlayer.secretScore, 120, 'saboteur secretly profits from own team failure');
  const snap = JSON.stringify(voting) + JSON.stringify(room.teams.map(t => t.id));
  assert.ok(!snap.includes('secretScore'), 'secret score not leaked in events');
  pass('saboteur gains SECRET points when their team fails (hidden from public)');

  // roles + secret scores are hidden in public snapshots until game end
  assert.ok(host.lastRoom, 'public room snapshot received');
  host.lastRoom.players.forEach(p => {
    assert.strictEqual(p.role, undefined, 'role hidden in public snapshot');
    assert.ok(!('secretScore' in p), 'secret score hidden in public snapshot');
  });
  pass('public snapshots hide roles and secret scores');

  // glass: winning (fastest/only successful) team members hold a magnifying glass
  await wait(50);
  okTeam.members.forEach(pid => assert.strictEqual(room.players[pid].glass, 1, pid + ' has glass'));
  sabTeam.members.forEach(pid => assert.strictEqual(room.players[pid].glass, 0));
  pass('fastest successful team earned magnifying glasses');

  // rig the chamber so we know the outcome, then peek with the glass
  room.chamber = ['blank', 'live', 'live', 'blank', 'blank', 'blank'];
  const holder = byId(okTeam.members[0]);
  const peek = once(holder, 'glassResult');
  const publik = once(host, 'glassUsed');
  holder.emit('useGlass');
  const [pr, pu] = await Promise.all([peek, publik]);
  assert.strictEqual(pr.shell, 'blank', 'glass shows the true next shell');
  assert.strictEqual(pu.id, holder.playerId, 'glass use is publicly announced');
  assert.strictEqual(room.players[holder.playerId].glass, 0, 'glass consumed');
  pass('magnifying glass: private peek, public announcement, consumed');

  // vote a CREW member (not the saboteur) onto the chair; next shell is blank -> survives
  const victim1 = crew.find(c => c !== host) || crew[0];
  const suspectIsHost = victim1 === host;
  const voteRes = once(host, 'voteResult');
  const trigP = once(host, 'triggerPhase');
  all.forEach(s => s.emit('vote', { targetId: victim1.playerId }));
  const vr = await voteRes;
  assert.strictEqual(vr.suspectId, victim1.playerId);
  const tp = await trigP;
  assert.strictEqual(tp.suspectId, victim1.playerId);
  pass('vote resolved; suspect sent to the trigger');

  // suspect does NOT pull -> auto-fire after triggerSeconds
  const trigRes = once(host, 'triggerResult');
  const tr = await trigRes;
  assert.strictEqual(tr.shell, 'blank');
  assert.strictEqual(tr.eliminated, false);
  assert.strictEqual(tr.role, undefined, 'role stays hidden on survival');
  assert.ok(room.players[victim1.playerId].alive);
  assert.ok(room.players[victim1.playerId].score >= 40, 'survivor got survive points');
  pass('blank shell: suspect survives (auto-fire on timeout), role stays hidden');

  // -> scoreboard -> round 2 (maze)
  await once(host, 'scoreboard');
  pass('scoreboard shown');
  await once(host, 'challengePhase');
  await wait(80);
  assert.strictEqual(room.challenge, 'maze');
  pass('round 2 = wire maze');

  // teams must be IDENTICAL to round 1 (nobody was eliminated), roles swapped
  const r2Teams = room.teams.map(t => ({ members: [...t.members].sort().join(','), agent: t.agentId }));
  assert.deepStrictEqual(r2Teams.map(t => t.members).sort(), r1Teams.map(t => t.members).sort(), 'same team memberships');
  r2Teams.forEach(t2 => {
    const t1 = r1Teams.find(x => x.members === t2.members);
    assert.notStrictEqual(t2.agent, t1.agent, 'guide/agent roles swapped within the fixed team');
  });
  pass('teams stayed the same as round 1; roles swapped inside each team');

  for (const t of room.teams) {
    const guide = byId(t.guideIds[0]), agent = byId(t.agentId);
    assert.ok(guide.cd.view.h && guide.cd.view.v, 'guide sees the walls');
    assert.ok(!agent.cd.view.h && !agent.cd.view.v, 'agent is blind');
    assert.deepStrictEqual(agent.cd.view.pos, { x: 0, y: 0 });
  }
  pass('maze views: guide sees layout, agent moves blind');

  // wall hit is detected & counted
  const t0 = room.teams[0], ag0 = byId(t0.agentId);
  const dirs = ['u', 'd', 'l', 'r'];
  const blockedDir = dirs.find(dd => _internal.mazeBlocked(t0.data, t0.data.pos.x, t0.data.pos.y, dd));
  const hitEvt = once(ag0, 'mazeState');
  ag0.emit('mazeMove', { dir: blockedDir });
  const hs = await hitEvt;
  assert.strictEqual(hs.hit, blockedDir); assert.strictEqual(hs.hits, 1);
  pass('hitting a wall is detected and counted');

  // solve both mazes via BFS on server truth
  for (const t of room.teams) {
    const agent = byId(t.agentId);
    const path = solveMaze(t.data);
    assert.ok(path.length > 0, 'maze solvable');
    path.forEach(dir => agent.emit('mazeMove', { dir }));
  }
  await wait(500);
  assert.ok(room.teams.every(t => t.done && t.ok), 'both teams reached the exit');
  pass('both teams guided through the maze');

  // voting 2: blank again on a crew member — vote resolution needs majority over skip
  const voting2 = await once(host, 'votingPhase');
  room.chamber = ['blank', 'blank', 'live', 'live', 'blank', 'blank'];
  const victim2 = crew.find(c => c !== victim1);
  const trigP2 = once(host, 'triggerPhase');
  all.forEach(s => s.emit('vote', { targetId: victim2.playerId }));
  await trigP2;
  // suspect pulls the trigger themselves this time
  const trigRes2 = once(host, 'triggerResult');
  victim2.emit('pullTrigger');
  const tr2 = await trigRes2;
  assert.strictEqual(tr2.shell, 'blank'); assert.strictEqual(tr2.eliminated, false);
  pass('suspect pulled the trigger themselves — blank, survives');

  await once(host, 'scoreboard');
  await once(host, 'challengePhase');
  await wait(80);
  assert.strictEqual(room.challenge, 'bomb');
  pass('round 3 = bomb defusal');

  for (const t of room.teams) {
    const guide = byId(t.guideIds[0]), agent = byId(t.agentId);
    assert.ok(guide.cd.view.manual && guide.cd.view.manual.length >= 4, 'guide has the manual');
    assert.ok(!agent.cd.view.manual && agent.cd.view.wires.length === 5 && agent.cd.view.switches.length === 4, 'agent sees the bomb, not the manual');
  }
  pass('bomb views: instructor has the manual, executor has the interface');

  // one team makes a wrong move first -> strike
  const tb = room.teams[0], agb = byId(tb.agentId);
  const exp0 = tb.data.steps[0];
  const wrong = exp0.k === 'cut'
    ? { kind: 'switch', index: 0 }
    : { kind: 'cut', index: (tb.data.steps.find(s => s.k === 'cut') || { i: 0 }).i === 0 ? 1 : 0 };
  const bs1 = once(agb, 'bombState');
  agb.emit('bombAction', wrong);
  const b1 = await bs1;
  assert.strictEqual(b1.lastOk, false); assert.strictEqual(b1.strikes, 1);
  pass('wrong bomb action = strike (1/3)');

  // now both teams defuse correctly, in order
  for (const t of room.teams) {
    const agent = byId(t.agentId);
    for (const st of t.data.steps.slice(t.data.idx)) {
      const ev = once(agent, 'bombState');
      agent.emit('bombAction', { kind: st.k, index: st.i });
      const r = await ev;
      assert.strictEqual(r.lastOk, true);
    }
  }
  await wait(300);
  assert.ok(room.teams.every(t => t.done && t.ok), 'both bombs defused');
  pass('both bombs defused following the manual');

  // final vote: everyone votes the saboteur; rig a LIVE shell
  await once(host, 'votingPhase');
  room.chamber = ['live', 'blank', 'blank', 'blank', 'blank', 'blank'];
  const trigP3 = once(host, 'triggerPhase');
  all.forEach(s => s.emit('vote', { targetId: saboteur.playerId }));
  await trigP3;
  const trigRes3 = once(host, 'triggerResult');
  const overP = once(host, 'gameOver');
  saboteur.emit('pullTrigger');
  const tr3 = await trigRes3;
  assert.strictEqual(tr3.shell, 'live');
  assert.strictEqual(tr3.eliminated, true);
  assert.strictEqual(tr3.role, 'saboteur', 'role revealed on elimination');
  pass('live round: saboteur eliminated, role revealed');

  const over = await overP;
  assert.strictEqual(over.winner, 'crew');
  const sabRow = over.rankings.find(r => r.id === saboteur.playerId);
  assert.ok(sabRow.role === 'saboteur');
  assert.ok(sabRow.secret >= 120, 'secret points revealed at game end');
  const voterRow = over.rankings.find(r => r.id === host.playerId);
  assert.ok(voterRow.score > 0);
  pass('crew wins; final board reveals roles and secret saboteur points');

  // restart flow
  const lobbyP = once(host, 'lobby');
  const again = await emitAck(host, 'playAgain', {});
  assert.ok(again.ok); await lobbyP;
  assert.strictEqual(room.phase, 'lobby');
  pass('play again returns everyone to the lobby');

  console.log('\nALL E2E TESTS PASSED');
  all.forEach(s => s.close());
  server.close();
  process.exit(0);
})().catch(e => { console.error('\nTEST FAILED:', e); process.exit(1); });
