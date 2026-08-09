/* Sabotage v2 — generator fuzz tests, bomb-explosion path, trio pairing,
   and the saboteur win condition.
   Run:  node test-win.js   (exit 0 = success) */
'use strict';
process.env.PORT = process.env.PORT || '3010';
const assert = require('assert');
const { io: Client } = require('socket.io-client');
const { server, ROOMS, _internal } = require('./server.js');
const URL = `http://localhost:${process.env.PORT}`;
function pass(m) { console.log('  ✓ ' + m); }
const wait = ms => new Promise(r => setTimeout(r, ms));
const once = (sock, ev) => new Promise(res => sock.once(ev, res));
const emitAck = (sock, ev, data) => new Promise(res => sock.emit(ev, data, res));

function mkClient(playerId) {
  const s = Client(URL, { transports: ['websocket'], forceNew: true });
  s.playerId = playerId; s.role = null; s.cd = null;
  s.on('role', d => { s.role = d.role; });
  s.on('challengeData', d => { s.cd = d; });
  return s;
}

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
  const path = []; let cur = key(d.exit.x, d.exit.y);
  while (prev[cur]) { path.unshift(prev[cur].dir); cur = key(prev[cur].from[0], prev[cur].from[1]); }
  return path;
}

(async () => {
  console.log('Unit checks:');
  assert.strictEqual(_internal.saboteurCount(4), 1);
  assert.strictEqual(_internal.saboteurCount(5), 1);
  assert.strictEqual(_internal.saboteurCount(7), 1);
  assert.strictEqual(_internal.saboteurCount(8), 2);
  assert.strictEqual(_internal.saboteurCount(12), 3);
  pass('saboteurCount scales and keeps crew majority');

  const fakeRoom = { settings: { ..._internal.DEFAULTS } };

  /* password generator fuzz */
  for (let i = 0; i < 200; i++) {
    const d = _internal.genPassword(fakeRoom);
    assert.strictEqual(d.targets.length, 5);
    assert.strictEqual(d.words.length, 10, 'easier: 5 answers + 5 decoys');
    assert.strictEqual(new Set(d.words).size, 10, 'word list has no duplicates');
    d.targets.forEach(t => assert.ok(d.words.includes(t[0]), 'every answer is present in the agent list'));
  }
  pass('password generator: 5 unique answers hidden in 10 words (200 runs)');

  /* password wrong-guess limit via direct handler (synthetic room) */
  {
    const room = _internal.createRoom('', { id: 'a' });
    _internal.addPlayer(room, { id: 'a', name: 'A' });
    _internal.addPlayer(room, { id: 'b', name: 'B' });
    room.phase = 'challenge'; room.challenge = 'password'; room.round = 1;
    room.endsAt = Date.now() + 60000;
    const data = _internal.genPassword(room);
    room.teams = [{ id: 't0', members: ['a', 'b'], guideIds: ['a'], agentId: 'b', done: false, ok: false, doneAt: null, data }];
    const t = room.teams[0];
    const wrongWord = data.words.find(w => w !== data.targets[0][0]);
    for (let i = 0; i < 4; i++) _internal.handlePwSubmit(room, room.players.b, { slot: 0, word: wrongWord });
    assert.strictEqual(t.data.wrong, 4);
    assert.ok(!t.done, 'still alive at 4 wrong guesses');
    _internal.handlePwSubmit(room, room.players.b, { slot: 0, word: wrongWord });
    assert.strictEqual(t.data.wrong, 5);
    assert.ok(t.done && !t.ok, '5th wrong guess fails the round');
    for (const k of Object.keys(room.timers || {})) clearTimeout(room.timers[k]);
    delete ROOMS[room.code];
    pass('password: 5 wrong guesses fail the round (4 do not)');
  }

  /* maze generator fuzz — every maze must be solvable */
  for (let i = 0; i < 200; i++) {
    const d = _internal.genMaze(fakeRoom);
    assert.strictEqual(d.size, 9);
    const path = solveMaze(d);
    assert.ok(path.length >= 2 * (d.size - 1), 'path reaches the exit');
    // walk it: no step may be blocked
    let { x, y } = d.pos;
    for (const dir of path) {
      assert.ok(!_internal.mazeBlocked(d, x, y, dir), 'solution never crosses a wall');
      if (dir === 'u') y--; if (dir === 'd') y++; if (dir === 'l') x--; if (dir === 'r') x++;
    }
    assert.deepStrictEqual({ x, y }, d.exit);
  }
  pass('maze generator: solvable, solution never crosses a wall (200 runs)');

  /* bomb generator fuzz — steps must be structurally valid */
  for (let i = 0; i < 500; i++) {
    const d = _internal.genBomb();
    assert.strictEqual(d.steps.length, 4, '1 cut + 2 switches + 1 final cut');
    assert.strictEqual(d.steps[0].k, 'cut');
    assert.strictEqual(d.steps[1].k, 'switch');
    assert.strictEqual(d.steps[2].k, 'switch');
    assert.strictEqual(d.steps[3].k, 'cut');
    assert.notStrictEqual(d.steps[0].i, d.steps[3].i, 'final wire differs from first cut');
    d.steps.forEach(s => assert.ok(s.i >= 0 && s.i < (s.k === 'cut' ? 5 : 4)));
    assert.strictEqual(d.manual.length, 4, '3 steps + warning');
    assert.ok(/WIRES/.test(d.manual[0]) && /SWITCHES/.test(d.manual[1]) && /FINAL WIRE/.test(d.manual[2]));
  }
  pass('bomb generator: valid ordered defusal sequence (500 runs)');

  /* bomb defusal + explosion via direct handlers (synthetic room) */
  {
    const room = _internal.createRoom('', { id: 'a' });
    _internal.addPlayer(room, { id: 'a', name: 'A' });
    _internal.addPlayer(room, { id: 'b', name: 'B' });
    room.phase = 'challenge'; room.challenge = 'bomb'; room.round = 3;
    room.endsAt = Date.now() + 60000;
    const mk = () => ({ id: 't0', members: ['a', 'b'], guideIds: ['a'], agentId: 'b', done: false, ok: false, doneAt: null, data: _internal.genBomb() });

    // correct sequence defuses
    room.teams = [mk()];
    let t = room.teams[0];
    for (const st of t.data.steps) _internal.handleBombAction(room, room.players.b, { kind: st.k, index: st.i });
    assert.ok(t.done && t.ok && t.data.idx === 4, 'manual sequence defuses the bomb');
    // guide cannot act
    room.teams = [mk()]; t = room.teams[0];
    _internal.handleBombAction(room, room.players.a, { kind: t.data.steps[0].k, index: t.data.steps[0].i });
    assert.strictEqual(t.data.idx, 0, 'guide input ignored');
    // three wrong actions -> boom, team fails
    let w = t.data.steps[0].k === 'cut' ? { kind: 'switch', index: 3 } : { kind: 'cut', index: 4 };
    if (t.data.steps[0].k === w.kind && t.data.steps[0].i === w.index) w = { kind: w.kind, index: w.index === 4 ? 3 : 2 };
    _internal.handleBombAction(room, room.players.b, w);
    _internal.handleBombAction(room, room.players.b, w);
    assert.strictEqual(t.data.strikes, 2);
    assert.ok(!t.done, 'still alive at 2 strikes');
    _internal.handleBombAction(room, room.players.b, w);
    assert.ok(t.data.exploded && t.done && !t.ok, '3 strikes = exploded = failed');
    clearTimeout(room.timers && room.timers.challengeEnd);
    for (const k of Object.keys(room.timers || {})) clearTimeout(room.timers[k]);
    delete ROOMS[room.code];
    pass('bomb: defuse-by-manual works, guide blocked, 3 strikes explodes');
  }

  /* ---------------- saboteur win, with a trio round ---------------- */
  console.log('\nSaboteur-win game (4 players):');
  const cs = ['q1', 'q2', 'q3', 'q4'].map(mkClient);
  const [h] = cs;
  const byId = id => cs.find(s => s.playerId === id);
  await Promise.all(cs.map(s => once(s, 'connect')));
  const cr = await emitAck(h, 'createRoom', { name: 'H', playerId: 'q1' });
  const code = cr.code;
  for (const c of cs.slice(1)) {
    const j = await emitAck(c, 'joinRoom', { code, name: c.playerId.toUpperCase(), playerId: c.playerId });
    assert.ok(j.ok);
  }
  const started = await emitAck(h, 'startGame', {});
  assert.ok(started.ok);
  const room = ROOMS[code];
  room.settings.scoreboardSeconds = 0.4;
  room.settings.triggerSeconds = 2;
  await wait(120);

  const sab = cs.find(s => s.role === 'saboteur');
  const crew = cs.filter(s => s.role === 'crew');
  pass('game started (saboteur=' + sab.playerId + ')');

  // round 1: password — solve both teams via server truth
  assert.strictEqual(room.challenge, 'password');
  for (const t of room.teams) {
    const agent = byId(t.agentId);
    for (let i = 0; i < 5; i++) agent.emit('pwSubmit', { slot: i, word: t.data.targets[i][0] });
  }
  await once(h, 'votingPhase');
  assert.ok(room.teams.every(t => t.ok));
  pass('round 1 passwords solved by both teams');

  // vote crew[0] out with a rigged live shell (auto-fire after 2s)
  room.chamber = ['live', 'blank', 'blank', 'blank', 'blank', 'blank'];
  const tr1P = once(h, 'triggerResult');
  cs.forEach(s => s.emit('vote', { targetId: crew[0].playerId }));
  const tr1 = await tr1P;
  assert.strictEqual(tr1.eliminated, true);
  assert.strictEqual(tr1.role, 'crew', 'innocent role revealed on elimination');
  pass('crew member eliminated by live round (1 sab vs 2 crew — game continues)');

  await once(h, 'scoreboard');
  await once(h, 'challengePhase');
  await wait(120);

  // round 2: maze with 3 alive -> one trio (two guides, one agent)
  assert.strictEqual(room.challenge, 'maze');
  assert.strictEqual(room.teams.length, 1);
  const trio = room.teams[0];
  assert.strictEqual(trio.members.length, 3);
  assert.strictEqual(trio.guideIds.length, 2);
  assert.ok(trio.agentId && !trio.guideIds.includes(trio.agentId));
  trio.guideIds.forEach(g => assert.ok(byId(g).cd.view.h, 'both trio guides see the walls'));
  assert.ok(!byId(trio.agentId).cd.view.h, 'trio agent is blind');
  pass('odd player count forms a trio: 2 guides + 1 blind agent');

  const agent = byId(trio.agentId);
  solveMaze(trio.data).forEach(dir => agent.emit('mazeMove', { dir }));
  await once(h, 'votingPhase');
  assert.ok(trio.done && trio.ok);
  pass('trio solved the maze');

  // vote the last crew member out -> saboteurs reach parity -> saboteur win
  room.chamber = ['live', 'blank', 'blank', 'blank', 'blank', 'blank'];
  const overP = once(h, 'gameOver');
  const aliveCs = cs.filter(s => room.players[s.playerId].alive);
  const lastCrewTargets = aliveCs.filter(s => s.role === 'crew');
  const target = lastCrewTargets[0];
  aliveCs.forEach(s => s.emit('vote', { targetId: target.playerId }));
  const over = await overP;
  assert.strictEqual(over.winner, 'saboteurs');
  assert.ok(over.rankings.every(r => r.role), 'all roles revealed at game end');
  pass('saboteurs reach parity — saboteurs win');

  console.log('\nALL WIN-CONDITION TESTS PASSED');
  cs.forEach(s => s.close());
  server.close();
  process.exit(0);
})().catch(e => { console.error('\nTEST FAILED:', e); process.exit(1); });
