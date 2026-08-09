/* ============================================================
   SABOTAGE v2 - real-time backend (Phoenix Hub)
   Team-based social deduction:
   - Players are paired into teams of two each round.
   - Three co-op challenges cycle: password puzzle, wire maze,
     bomb defusal. One teammate has the knowledge (guide), the
     other performs the actions (agent).
   - Hidden saboteurs try to make their team fail while
     staying unsuspected.
   - After each round: 30s discussion + vote, then the top
     suspect faces a Buckshot-Roulette chamber of live rounds
     and blanks. Blank = safe. Live = eliminated.
   - Item: magnifying glass — privately peek at the next shell.
   Node + Express + Socket.IO. In-memory rooms. Listens on $PORT.
   ============================================================ */
'use strict';

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.get('/', (_req, res) => res.json({ ok: true, service: 'sabotage', rooms: Object.keys(ROOMS).length }));
app.get('/health', (_req, res) => res.send('ok'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] } });

/* ---------------- constants / tuning ---------------- */
const CHALLENGES = ['password', 'maze', 'bomb'];
const DEFAULTS = {
  passwordSeconds: 150,
  mazeSeconds: 150,
  bombSeconds: 180,
  votingSeconds: 30,      // "During a 30-second voting phase..."
  triggerSeconds: 12,
  scoreboardSeconds: 8,
  minPlayers: 4,
  shellsTotal: 6,         // chamber size
  liveMin: 2, liveMax: 3, // live rounds loaded each voting phase
  mazeSize: 9,
  pwSlots: 5, pwDecoys: 5,   // 5 answers hidden among 10 words
  pwMaxWrong: 5,             // 5 wrong guesses fail the round
  glassChance: 0.25       // non-fastest completing teams: chance per member
};
const PTS = { complete: 150, speedMax: 100, survive: 40, vote: 100, sabFail: 120 /* secret */ };
const EMPTY_ROOM_GRACE_MS = 45000;

/* ---------------- state ---------------- */
const ROOMS = {};   // code -> room
const SOCKETS = {}; // socketId -> { code, playerId }

/* ---------------- helpers ---------------- */
function genCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 4 }, () => A[(Math.random() * A.length) | 0]).join(''); }
  while (ROOMS[c]);
  return c;
}
function clean(s, max) { return String(s == null ? '' : s).replace(/[<>]/g, '').trim().slice(0, max || 24); }
function now() { return Date.now(); }
function rand(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function sample(arr) { return arr[(Math.random() * arr.length) | 0]; }
function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
function aliveList(room) { return Object.values(room.players).filter(p => p.alive); }
function aliveConnected(room) { return Object.values(room.players).filter(p => p.alive && p.connected); }
function saboteursAlive(room) { return aliveList(room).filter(p => p.role === 'saboteur'); }
function crewAlive(room) { return aliveList(room).filter(p => p.role !== 'saboteur'); }
function saboteurCount(n) { return Math.max(1, Math.min(Math.floor(n / 4) || 1, Math.floor((n - 1) / 2))); }
function clearTimers(room) {
  if (!room.timers) return;
  for (const k of Object.keys(room.timers)) { clearTimeout(room.timers[k]); delete room.timers[k]; }
}
function toPlayer(room, pid, ev, data) { const p = room.players[pid]; if (p && p.socketId) io.to(p.socketId).emit(ev, data); }
function toTeam(room, team, ev, data) { team.members.forEach(pid => toPlayer(room, pid, ev, data)); }

/* Public snapshot everyone may see (roles hidden unless game ended). */
function publicRoom(room) {
  const revealRoles = room.phase === 'ended';
  return {
    code: room.code,
    phase: room.phase,
    round: room.round,
    challenge: room.challenge || null,
    hostId: room.hostId,
    settings: { minPlayers: room.settings.minPlayers },
    endsAt: room.endsAt || null,
    chamberInfo: room.chamberInfo || null, // { live, blank, total } announced publicly
    suspectId: room.suspectId || null,
    teams: (room.teams || []).map(t => ({
      id: t.id, done: t.done, ok: t.ok,
      members: t.members.map(pid => ({ id: pid, guide: t.guideIds.includes(pid) }))
    })),
    players: Object.values(room.players)
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map(p => ({
        id: p.id, name: p.name, alive: p.alive, connected: p.connected,
        score: p.score, glass: p.glass, isHost: p.id === room.hostId,
        role: revealRoles ? p.role : undefined
      }))
  };
}
function emitRoom(room) { io.to(room.code).emit('room', publicRoom(room)); }

function rankings(room, final) {
  return Object.values(room.players)
    .map(p => ({
      id: p.id, name: p.name, role: p.role, alive: p.alive,
      score: p.score + (final ? p.secretScore : 0),
      secret: final ? p.secretScore : undefined
    }))
    .sort((a, b) => b.score - a.score);
}

/* ---------------- room lifecycle ---------------- */
function createRoom(password, host) {
  const code = genCode();
  const room = {
    code,
    password: password || '',
    hostId: host.id,
    players: {},
    phase: 'lobby',
    round: 0,
    challenge: null,
    settings: { ...DEFAULTS },
    teams: [],
    pairs: [],            // fixed team groupings for the whole game
    votes: {},
    chat: [],
    chamber: [],           // hidden order of shells: 'live' | 'blank'
    chamberInfo: null,     // public counts
    suspectId: null,
    timers: {},
    createdAt: now()
  };
  ROOMS[code] = room;
  return room;
}

function addPlayer(room, { id, name, socketId }) {
  const existing = room.players[id];
  if (existing) { // reconnect
    existing.connected = true;
    existing.socketId = socketId;
    if (name) existing.name = name;
    return existing;
  }
  const p = {
    id, name, socketId,
    role: 'crew', alive: true, connected: true,
    score: 0, secretScore: 0, glass: 0, joinedAt: now()
  };
  room.players[id] = p;
  if (!room.hostId || !room.players[room.hostId]) room.hostId = id;
  return p;
}

function removeSocket(socketId) {
  const ref = SOCKETS[socketId];
  delete SOCKETS[socketId];
  if (!ref) return;
  const room = ROOMS[ref.code];
  if (!room) return;
  const p = room.players[ref.playerId];
  if (p && p.socketId === socketId) {
    p.connected = false;
    if (room.phase === 'lobby') delete room.players[ref.playerId];
    reassignHostIfNeeded(room);
    emitRoom(room);
    if (room.phase === 'voting') maybeEndVoting(room);
    if (room.phase === 'challenge') maybeEndChallenge(room);
    scheduleEmptyCheck(room);
  }
}

function reassignHostIfNeeded(room) {
  if (room.players[room.hostId] && room.players[room.hostId].connected) return;
  const next = Object.values(room.players).filter(p => p.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0];
  if (next) room.hostId = next.id;
}

function scheduleEmptyCheck(room) {
  const anyConnected = Object.values(room.players).some(p => p.connected);
  if (anyConnected) return;
  clearTimeout(room._emptyTimer);
  room._emptyTimer = setTimeout(() => {
    const stillEmpty = !Object.values(room.players).some(p => p.connected);
    if (stillEmpty) { clearTimers(room); delete ROOMS[room.code]; }
  }, EMPTY_ROOM_GRACE_MS);
}

/* ============================================================
   CHALLENGE GENERATORS
   ============================================================ */

/* ---------- 1. Password puzzle ---------- */
const WORDBANK = [
  ['ANCHOR', 'A heavy device dropped from a ship to keep it in place'],
  ['BEACON', 'A light or fire set up high as a signal or warning'],
  ['CIPHER', 'A secret way of writing; a code'],
  ['DYNAMO', 'A machine that turns motion into electric current'],
  ['EMBER', 'A small piece of glowing coal in a dying fire'],
  ['FALCON', 'A fast bird of prey trained for hunting'],
  ['GLACIER', 'A slow-moving river of ice'],
  ['HARPOON', 'A spear thrown to catch whales or large fish'],
  ['IGLOO', 'A dome-shaped shelter built from blocks of snow'],
  ['JIGSAW', 'A puzzle of small oddly-shaped interlocking pieces'],
  ['KAYAK', 'A light narrow one-person paddle boat'],
  ['LANTERN', 'A portable case that protects a light or flame'],
  ['MIRAGE', 'An optical illusion of water in a desert'],
  ['NOMAD', 'A person who roams with no fixed home'],
  ['ORACLE', 'A person believed to speak prophecies'],
  ['PARDON', 'An official act of forgiving a crime'],
  ['QUIVER', 'A case for carrying arrows'],
  ['RUDDER', 'The flat piece at a boat\'s stern used for steering'],
  ['SPHINX', 'A mythical creature with a lion\'s body and human head'],
  ['TUNDRA', 'A vast, flat, treeless Arctic region'],
  ['UMPIRE', 'The official who enforces rules in a match'],
  ['VERTIGO', 'A dizzy sensation of spinning or losing balance'],
  ['WALRUS', 'A large Arctic sea mammal with long tusks'],
  ['XYLOPHONE', 'An instrument of wooden bars struck with mallets'],
  ['YONDER', 'At some distance in the direction indicated; over there'],
  ['ZEPHYR', 'A soft, gentle breeze'],
  ['ABACUS', 'An ancient counting frame with sliding beads'],
  ['BUREAU', 'An office or a chest of drawers'],
  ['CANYON', 'A deep gorge carved by a river'],
  ['DECOY', 'Something used to lure or mislead into a trap'],
  ['ENIGMA', 'A person or thing that is mysterious or puzzling'],
  ['FATHOM', 'To understand deeply; also a unit of water depth'],
  ['GAZEBO', 'A small open garden pavilion with a roof'],
  ['HERMIT', 'A person living in solitude, away from society'],
  ['INFERNO', 'A large, uncontrollable blazing fire'],
  ['JUBILEE', 'A special anniversary celebration'],
  ['KERNEL', 'The inner, essential part of a seed or an idea'],
  ['LAGOON', 'A shallow body of water separated from the sea'],
  ['MUTINY', 'An open rebellion against a ship\'s captain'],
  ['NECTAR', 'The sweet liquid flowers make, gathered by bees'],
  ['OMEN', 'A sign of something about to happen'],
  ['PLATEAU', 'An area of high, level ground'],
  ['QUARRY', 'A pit where stone is dug; also, prey being hunted'],
  ['RELIC', 'An object surviving from an earlier time'],
  ['SIPHON', 'A bent tube used to move liquid using gravity'],
  ['TALON', 'The sharp claw of a bird of prey'],
  ['UTOPIA', 'An imagined perfect world'],
  ['VOYAGE', 'A long journey by sea or in space'],
  ['WHARF', 'A platform where ships load and unload'],
  ['YEARN', 'To long for something deeply']
];

function genPassword(room) {
  const s = room.settings;
  const bank = shuffle(WORDBANK);
  const targets = bank.slice(0, s.pwSlots);              // [word, definition]
  const decoys = bank.slice(s.pwSlots, s.pwSlots + s.pwDecoys).map(x => x[0]);
  return {
    kind: 'password',
    targets,
    words: shuffle([...targets.map(t => t[0]), ...decoys]),
    slots: Array(s.pwSlots).fill(null),                  // locked words
    wrong: 0
  };
}
function pwPrivate(data, isGuide) {
  return isGuide
    ? { defs: data.targets.map(t => t[1]) }
    : { words: data.words, slotCount: data.slots.length };
}
function pwState(data) { return { slots: data.slots, wrong: data.wrong }; }

/* ---------- 2. Wire maze ---------- */
/* Recursive-backtracker maze on an N x N cell grid.
   walls.h[y][x] = wall ABOVE cell (x,y)   (h has N+1 rows)
   walls.v[y][x] = wall LEFT of cell (x,y) (v rows have N+1 cols) */
function genMaze(room) {
  const N = room.settings.mazeSize;
  const h = Array.from({ length: N + 1 }, () => Array(N).fill(true));
  const v = Array.from({ length: N }, () => Array(N + 1).fill(true));
  const seen = Array.from({ length: N }, () => Array(N).fill(false));
  const stack = [[0, 0]];
  seen[0][0] = true;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const opts = [];
    if (y > 0 && !seen[y - 1][x]) opts.push('u');
    if (y < N - 1 && !seen[y + 1][x]) opts.push('d');
    if (x > 0 && !seen[y][x - 1]) opts.push('l');
    if (x < N - 1 && !seen[y][x + 1]) opts.push('r');
    if (!opts.length) { stack.pop(); continue; }
    const dir = sample(opts);
    if (dir === 'u') { h[y][x] = false; seen[y - 1][x] = true; stack.push([x, y - 1]); }
    if (dir === 'd') { h[y + 1][x] = false; seen[y + 1][x] = true; stack.push([x, y + 1]); }
    if (dir === 'l') { v[y][x] = false; seen[y][x - 1] = true; stack.push([x - 1, y]); }
    if (dir === 'r') { v[y][x + 1] = false; seen[y][x + 1] = true; stack.push([x + 1, y]); }
  }
  return {
    kind: 'maze', size: N, h, v,
    pos: { x: 0, y: 0 }, exit: { x: N - 1, y: N - 1 }, hits: 0
  };
}
function mazeBlocked(data, x, y, dir) {
  if (dir === 'u') return y === 0 || data.h[y][x];
  if (dir === 'd') return y === data.size - 1 || data.h[y + 1][x];
  if (dir === 'l') return x === 0 || data.v[y][x];
  if (dir === 'r') return x === data.size - 1 || data.v[y][x + 1];
  return true;
}
function mazePrivate(data, isGuide) {
  return isGuide
    ? { size: data.size, h: data.h, v: data.v, pos: data.pos, exit: data.exit }
    : { size: data.size, pos: data.pos, exit: data.exit };
}
function mazeState(data) { return { pos: data.pos, hits: data.hits }; }

/* ---------- 3. Bomb defusal ---------- */
const WIRE_COLORS = ['red', 'blue', 'yellow', 'white', 'black'];
const SW_LABELS = ['A', 'B', 'C', 'D'];

function genBomb() {
  const serialLetters = Array.from({ length: 2 }, () => sample('BCDFGHJKLMNPRSTVWXZ'.split(''))).join('');
  const serialDigits = String(rand(100, 999));
  const serial = serialLetters + '-' + serialDigits;
  const lastDigit = Number(serialDigits[2]);
  const wires = Array.from({ length: 5 }, () => sample(WIRE_COLORS));
  const switches = SW_LABELS.map(l => ({ label: l, on: Math.random() < 0.5 }));
  const indicator = Math.random() < 0.5;

  const steps = [];
  const manual = [];
  const cut = [false, false, false, false, false];
  const count = c => wires.filter(w => w === c).length;
  const lastIdx = c => wires.lastIndexOf(c);
  const firstIdx = c => wires.indexOf(c);

  /* STEP 1 — first wire cut */
  const t1 = rand(0, 2);
  let w1;
  if (t1 === 0) {
    manual.push('STEP 1 — WIRES: If there is more than one RED wire, cut the LAST red wire. Otherwise, cut the 2nd wire.');
    w1 = count('red') > 1 ? lastIdx('red') : 1;
  } else if (t1 === 1) {
    manual.push('STEP 1 — WIRES: If there are NO blue wires, cut the 1st wire. Otherwise, cut the LAST blue wire.');
    w1 = count('blue') === 0 ? 0 : lastIdx('blue');
  } else {
    manual.push('STEP 1 — WIRES: If the last digit of the serial number is ODD, cut the 3rd wire. Otherwise, cut the FIRST white wire (if there is no white wire, cut the 4th wire).');
    w1 = (lastDigit % 2 === 1) ? 2 : (firstIdx('white') !== -1 ? firstIdx('white') : 3);
  }
  steps.push({ k: 'cut', i: w1 });
  cut[w1] = true;

  /* STEP 2 — flip two switches, in order */
  const t2 = rand(0, 2);
  let sw;
  if (t2 === 0) {
    manual.push('STEP 2 — SWITCHES: If the indicator light is LIT, flip switch B, then switch D. If it is DARK, flip switch A, then switch C.');
    sw = indicator ? ['B', 'D'] : ['A', 'C'];
  } else if (t2 === 1) {
    manual.push('STEP 2 — SWITCHES: If the last digit of the serial number is 5 or higher, flip switch D, then switch A. Otherwise, flip switch B, then switch C.');
    sw = lastDigit >= 5 ? ['D', 'A'] : ['B', 'C'];
  } else {
    manual.push('STEP 2 — SWITCHES: If switch A is currently ON, flip switch C, then switch B. If switch A is OFF, flip switch A, then switch D.');
    sw = switches[0].on ? ['C', 'B'] : ['A', 'D'];
  }
  const swState = switches.map(s => s.on);
  sw.forEach(label => {
    const i = SW_LABELS.indexOf(label);
    steps.push({ k: 'switch', i });
    swState[i] = !swState[i];
  });

  /* STEP 3 — final wire, derived from switches now ON */
  manual.push('STEP 3 — FINAL WIRE: Count how many switches are ON after step 2. Cut the wire at that position (1st–4th; if the count is 0, cut the 5th wire). If that wire is already cut, move RIGHT to the next uncut wire (wrap around to the 1st).');
  const onCount = swState.filter(Boolean).length;
  let w3 = onCount === 0 ? 4 : onCount - 1;
  while (cut[w3]) w3 = (w3 + 1) % 5;
  steps.push({ k: 'cut', i: w3 });
  cut[w3] = true;

  manual.push('WARNING: 3 wrong actions and the bomb explodes. Actions must be done in exact order.');

  return {
    kind: 'bomb',
    serial, wires, indicator,
    switches: switches.map(s => ({ ...s })),
    initialSwitches: switches.map(s => s.on),
    manual, steps, idx: 0, strikes: 0,
    cut: [false, false, false, false, false],
    exploded: false
  };
}
function bombPrivate(data, isGuide) {
  return isGuide
    ? { manual: data.manual }
    : {
      serial: data.serial, wires: data.wires, indicator: data.indicator,
      switches: data.switches.map(s => ({ label: s.label, on: s.on }))
    };
}
function bombState(data) {
  return {
    strikes: data.strikes, stepsDone: data.idx, stepsTotal: data.steps.length,
    cut: data.cut, switches: data.switches.map(s => s.on), exploded: data.exploded
  };
}

/* ============================================================
   GAME FLOW
   ============================================================ */
function startGame(room) {
  const players = Object.values(room.players).filter(p => p.connected);
  if (players.length < room.settings.minPlayers) return { error: `Need at least ${room.settings.minPlayers} players.` };

  Object.values(room.players).forEach(p => {
    p.alive = true; p.score = 0; p.secretScore = 0; p.glass = 0; p.role = 'crew';
  });
  const sabN = saboteurCount(players.length);
  const shuffled = shuffle(players);
  for (let i = 0; i < sabN; i++) shuffled[i].role = 'saboteur';

  room.round = 0;
  room.pairs = makePairs(room);   // teams are drawn once and stay fixed
  const sabs = Object.values(room.players).filter(p => p.role === 'saboteur');
  Object.values(room.players).forEach(p => {
    if (!p.socketId) return;
    io.to(p.socketId).emit('role', {
      role: p.role,
      fellowSaboteurs: p.role === 'saboteur' ? sabs.filter(s => s.id !== p.id).map(s => ({ id: s.id, name: s.name })) : []
    });
  });
  io.to(room.code).emit('gameStart', { saboteurs: sabN, players: players.length });
  beginChallenge(room);
  return { ok: true };
}

/* Teams are FIXED for the whole game: pairs are drawn once at game start and
   never reshuffled. Each round only removes eliminated players — a player whose
   partner is gone is merged with other strays (or joins the smallest team as an
   extra guide). Guide/agent roles swap every round so both teammates get both
   seats, but the team itself stays together. */
function makePairs(room) {
  const pool = shuffle(aliveConnected(room).map(p => p.id));
  const pairs = [];
  while (pool.length) {
    if (pool.length === 3) pairs.push(pool.splice(0, 3));
    else pairs.push(pool.splice(0, Math.min(2, pool.length)));
  }
  return pairs;
}
function refreshPairs(room) {
  const aliveIds = new Set(aliveList(room).map(p => p.id));
  let groups = (room.pairs || []).map(g => g.filter(id => aliveIds.has(id))).filter(g => g.length > 0);
  const singles = groups.filter(g => g.length === 1).map(g => g[0]);
  groups = groups.filter(g => g.length >= 2);
  while (singles.length >= 2) groups.push(singles.splice(0, singles.length === 3 ? 3 : 2));
  if (singles.length === 1) {
    if (groups.length) groups.reduce((a, b) => (a.length <= b.length ? a : b)).push(singles[0]);
    else groups.push([singles[0]]); // lone survivor: solo team
  }
  room.pairs = groups;
}
function makeTeams(room) {
  if (!room.pairs || !room.pairs.length) room.pairs = makePairs(room);
  refreshPairs(room);
  return room.pairs.map((g, i) => {
    const solo = g.length === 1;
    const agentId = g[(room.round - 1) % g.length]; // roles rotate each round
    return {
      id: 't' + i, members: [...g],
      guideIds: solo ? [...g] : g.filter(id => id !== agentId),
      agentId, done: false, ok: false, doneAt: null, data: null,
      solo: solo || undefined
    };
  });
}

function challengeSeconds(room, kind) {
  const s = room.settings;
  return kind === 'password' ? s.passwordSeconds : kind === 'maze' ? s.mazeSeconds : s.bombSeconds;
}

function beginChallenge(room) {
  clearTimers(room);
  room.round += 1;
  room.phase = 'challenge';
  room.challenge = CHALLENGES[(room.round - 1) % CHALLENGES.length];
  room.suspectId = null;
  room.chamberInfo = null;
  room.votes = {};
  room.teams = makeTeams(room);
  room.teams.forEach(t => {
    t.data = room.challenge === 'password' ? genPassword(room)
      : room.challenge === 'maze' ? genMaze(room)
      : genBomb();
  });
  const secs = challengeSeconds(room, room.challenge);
  room.endsAt = now() + secs * 1000;

  emitRoom(room);
  io.to(room.code).emit('challengePhase', {
    round: room.round, challenge: room.challenge, endsAt: room.endsAt,
    teams: room.teams.map(t => ({
      id: t.id,
      members: t.members.map(pid => ({ id: pid, name: room.players[pid] ? room.players[pid].name : '?', guide: t.guideIds.includes(pid) }))
    }))
  });
  room.teams.forEach(t => sendChallengeData(room, t));
  room.timers.challenge = setTimeout(() => endChallenge(room), secs * 1000);
}

function sendChallengeData(room, team, onlyPid) {
  const d = team.data;
  team.members.forEach(pid => {
    if (onlyPid && pid !== onlyPid) return;
    const isGuide = team.guideIds.includes(pid) || team.solo;
    const priv = d.kind === 'password' ? pwPrivate(d, isGuide)
      : d.kind === 'maze' ? mazePrivate(d, isGuide)
      : bombPrivate(d, isGuide);
    // solo players get both halves
    if (team.solo) {
      const agentSide = d.kind === 'password' ? pwPrivate(d, false)
        : d.kind === 'maze' ? mazePrivate(d, false)
        : bombPrivate(d, false);
      Object.assign(priv, agentSide);
    }
    toPlayer(room, pid, 'challengeData', {
      teamId: team.id, kind: d.kind, isGuide, isAgent: pid === team.agentId,
      mates: team.members.filter(x => x !== pid).map(x => ({ id: x, name: room.players[x] ? room.players[x].name : '?', guide: team.guideIds.includes(x) })),
      view: priv,
      state: d.kind === 'password' ? pwState(d) : d.kind === 'maze' ? mazeState(d) : bombState(d)
    });
  });
}

function teamOf(room, pid) {
  return (room.teams || []).find(t => t.members.includes(pid));
}

function finishTeam(room, team, ok) {
  if (team.done) return;
  team.done = true; team.ok = ok; team.doneAt = now();
  if (ok) {
    const secs = challengeSeconds(room, room.challenge);
    const left = Math.max(0, room.endsAt - now()) / (secs * 1000);
    const bonus = Math.round(PTS.speedMax * left);
    team.members.forEach(pid => {
      const p = room.players[pid];
      if (p && p.alive) p.score += PTS.complete + bonus;
    });
  }
  io.to(room.code).emit('teamDone', { teamId: team.id, ok, name: team.members.map(pid => room.players[pid] ? room.players[pid].name : '?').join(' & ') });
  emitRoom(room);
  maybeEndChallenge(room);
}

function maybeEndChallenge(room) {
  if (room.phase !== 'challenge') return;
  // teams with no connected member can never finish; ignore them for the early-end check
  const pending = room.teams.filter(t => !t.done && t.members.some(pid => room.players[pid] && room.players[pid].connected));
  if (pending.length === 0) {
    clearTimers(room);
    room.timers.challengeEnd = setTimeout(() => endChallenge(room), 1200);
  }
}

function endChallenge(room) {
  if (room.phase !== 'challenge') return;
  clearTimers(room);
  // unfinished teams fail
  room.teams.forEach(t => { if (!t.done) { t.done = true; t.ok = false; } });
  // saboteurs profit (secretly) when their own team fails
  room.teams.forEach(t => {
    if (!t.ok) t.members.forEach(pid => {
      const p = room.players[pid];
      if (p && p.alive && p.role === 'saboteur') p.secretScore += PTS.sabFail;
    });
  });
  // items: fastest successful team always earns a glass; other successful teams roll a chance
  const okTeams = room.teams.filter(t => t.ok).sort((a, b) => a.doneAt - b.doneAt);
  okTeams.forEach((t, idx) => {
    t.members.forEach(pid => {
      const p = room.players[pid];
      if (!p || !p.alive || p.glass >= 1) return;
      if (idx === 0 || Math.random() < room.settings.glassChance) {
        p.glass = 1;
        toPlayer(room, pid, 'itemGained', { item: 'glass', reason: idx === 0 ? 'fastest team' : 'lucky find' });
      }
    });
  });
  const results = room.teams.map(t => ({
    id: t.id, ok: t.ok,
    members: t.members.map(pid => ({ id: pid, name: room.players[pid] ? room.players[pid].name : '?' }))
  }));
  beginVoting(room, results);
}

/* ---------------- voting + roulette ---------------- */
function loadChamber(room) {
  const s = room.settings;
  const live = rand(s.liveMin, s.liveMax);
  const blank = s.shellsTotal - live;
  room.chamber = shuffle([...Array(live).fill('live'), ...Array(blank).fill('blank')]);
  room.chamberInfo = { live, blank, total: s.shellsTotal };
}

function beginVoting(room, results) {
  room.phase = 'voting';
  room.votes = {};
  room.chat = [];
  loadChamber(room);
  room.endsAt = now() + room.settings.votingSeconds * 1000;
  emitRoom(room);
  io.to(room.code).emit('votingPhase', {
    round: room.round,
    endsAt: room.endsAt,
    results: results || [],
    chamber: room.chamberInfo,
    candidates: aliveList(room).map(p => ({ id: p.id, name: p.name }))
  });
  room.timers.vote = setTimeout(() => endVoting(room), room.settings.votingSeconds * 1000);
}

function castVote(room, voter, targetId) {
  if (room.phase !== 'voting' || !voter.alive) return;
  const valid = targetId === 'skip' || (room.players[targetId] && room.players[targetId].alive);
  if (!valid) return;
  room.votes[voter.id] = targetId;
  io.to(room.code).emit('voteTally', { votedIds: Object.keys(room.votes), aliveCount: aliveConnected(room).length });
  maybeEndVoting(room);
}

function maybeEndVoting(room) {
  if (room.phase !== 'voting') return;
  const voters = aliveConnected(room);
  if (voters.length > 0 && voters.every(p => room.votes[p.id] !== undefined)) endVoting(room);
}

function useGlass(room, player) {
  if (room.phase !== 'voting' || !player.alive || player.glass < 1) return;
  player.glass = 0;
  const shell = room.chamber[0];
  toPlayer(room, player.id, 'glassResult', { shell });
  io.to(room.code).emit('glassUsed', { id: player.id, name: player.name });
  emitRoom(room);
}

function endVoting(room) {
  if (room.phase !== 'voting') return;
  clearTimers(room);
  const counts = {};
  Object.values(room.votes).forEach(t => { counts[t] = (counts[t] || 0) + 1; });
  let top = null, topN = 0, tie = false;
  for (const [t, c] of Object.entries(counts)) {
    if (t === 'skip') continue;
    if (c > topN) { top = t; topN = c; tie = false; }
    else if (c === topN) tie = true;
  }
  const skipVotes = counts['skip'] || 0;
  const suspect = (top && !tie && topN > skipVotes) ? room.players[top] : null;

  io.to(room.code).emit('voteResult', {
    suspectId: suspect ? suspect.id : null,
    suspectName: suspect ? suspect.name : null,
    skipped: !suspect,
    tie,
    tally: counts
  });

  if (!suspect) {
    room.phase = 'reveal';
    emitRoom(room);
    room.timers.postVote = setTimeout(() => checkWin(room), 3000);
    return;
  }
  beginTrigger(room, suspect);
}

function beginTrigger(room, suspect) {
  room.phase = 'trigger';
  room.suspectId = suspect.id;
  room.endsAt = now() + room.settings.triggerSeconds * 1000;
  emitRoom(room);
  io.to(room.code).emit('triggerPhase', {
    suspectId: suspect.id,
    suspectName: suspect.name,
    chamber: room.chamberInfo,
    endsAt: room.endsAt
  });
  room.timers.trigger = setTimeout(() => fireTrigger(room), room.settings.triggerSeconds * 1000);
}

function fireTrigger(room) {
  if (room.phase !== 'trigger') return;
  clearTimers(room);
  const suspect = room.players[room.suspectId];
  const shell = room.chamber.shift() || 'blank';
  let eliminated = false, role;
  if (shell === 'live') {
    eliminated = true;
    if (suspect) { suspect.alive = false; role = suspect.role; }
    // reward accurate voters if the eliminated player was a saboteur
    if (role === 'saboteur') {
      Object.entries(room.votes).forEach(([vid, tid]) => {
        if (tid === room.suspectId && room.players[vid]) room.players[vid].score += PTS.vote;
      });
    }
  } else if (suspect) {
    suspect.score += PTS.survive;
  }
  room.phase = 'reveal';
  emitRoom(room);
  io.to(room.code).emit('triggerResult', {
    suspectId: room.suspectId,
    suspectName: suspect ? suspect.name : '?',
    shell,
    eliminated,
    role: eliminated ? role : undefined   // role only revealed on elimination
  });
  room.suspectId = null;
  room.timers.postTrigger = setTimeout(() => checkWin(room), 4200);
}

function checkWin(room) {
  const sab = saboteursAlive(room).length;
  const crew = crewAlive(room).length;
  if (sab === 0) return endGame(room, 'crew');
  if (sab >= crew) return endGame(room, 'saboteurs');
  showScoreboardThenNext(room);
}

function showScoreboardThenNext(room) {
  room.phase = 'scoreboard';
  room.endsAt = now() + room.settings.scoreboardSeconds * 1000;
  emitRoom(room);
  io.to(room.code).emit('scoreboard', { rankings: rankings(room, false), endsAt: room.endsAt, nextRound: room.round + 1 });
  room.timers.next = setTimeout(() => beginChallenge(room), room.settings.scoreboardSeconds * 1000);
}

function endGame(room, winner) {
  clearTimers(room);
  room.phase = 'ended';
  room.endsAt = null;
  // fold secret saboteur points into final scores
  Object.values(room.players).forEach(p => { p.score += p.secretScore; });
  emitRoom(room);
  io.to(room.code).emit('gameOver', {
    winner, // 'crew' | 'saboteurs'
    rankings: Object.values(room.players)
      .map(p => ({ id: p.id, name: p.name, role: p.role, alive: p.alive, score: p.score, secret: p.secretScore }))
      .sort((a, b) => b.score - a.score)
  });
  Object.values(room.players).forEach(p => { p.secretScore = 0; });
}

function returnToLobby(room) {
  clearTimers(room);
  room.phase = 'lobby';
  room.round = 0;
  room.challenge = null;
  room.teams = [];
  room.pairs = [];
  room.votes = {};
  room.chat = [];
  room.chamber = [];
  room.chamberInfo = null;
  room.suspectId = null;
  Object.values(room.players).forEach(p => { p.alive = true; p.role = 'crew'; p.score = 0; p.secretScore = 0; p.glass = 0; });
  emitRoom(room);
  io.to(room.code).emit('lobby', {});
}

/* ---------------- challenge input handlers ---------------- */
function handlePwSubmit(room, player, payload) {
  if (room.phase !== 'challenge' || room.challenge !== 'password' || !player.alive) return;
  const team = teamOf(room, player.id);
  if (!team || team.done) return;
  if (player.id !== team.agentId && !team.solo) return;   // only the agent spells
  const d = team.data;
  const slot = Number(payload && payload.slot);
  const word = clean(payload && payload.word, 20).toUpperCase();
  if (!(slot >= 0 && slot < d.slots.length) || d.slots[slot]) return;
  if (!d.words.includes(word)) return;
  if (word === d.targets[slot][0]) {
    d.slots[slot] = word;
    toTeam(room, team, 'pwState', { ...pwState(d), lastOk: true, slot, maxWrong: room.settings.pwMaxWrong });
    if (d.slots.every(Boolean)) finishTeam(room, team, true);
  } else {
    d.wrong += 1;
    const failed = d.wrong >= room.settings.pwMaxWrong;
    toTeam(room, team, 'pwState', { ...pwState(d), lastOk: false, slot, tried: word, failed, maxWrong: room.settings.pwMaxWrong });
    if (failed) finishTeam(room, team, false);   // 5 wrong guesses = round failed
  }
}

function handleMazeMove(room, player, payload) {
  if (room.phase !== 'challenge' || room.challenge !== 'maze' || !player.alive) return;
  const team = teamOf(room, player.id);
  if (!team || team.done) return;
  if (player.id !== team.agentId && !team.solo) return;   // only the agent moves
  const d = team.data;
  const dir = String(payload && payload.dir);
  if (!['u', 'd', 'l', 'r'].includes(dir)) return;
  if (mazeBlocked(d, d.pos.x, d.pos.y, dir)) {
    d.hits += 1;
    toTeam(room, team, 'mazeState', { ...mazeState(d), hit: dir });
    return;
  }
  if (dir === 'u') d.pos.y -= 1;
  if (dir === 'd') d.pos.y += 1;
  if (dir === 'l') d.pos.x -= 1;
  if (dir === 'r') d.pos.x += 1;
  const done = d.pos.x === d.exit.x && d.pos.y === d.exit.y;
  toTeam(room, team, 'mazeState', { ...mazeState(d), done });
  if (done) finishTeam(room, team, true);
}

function handleBombAction(room, player, payload) {
  if (room.phase !== 'challenge' || room.challenge !== 'bomb' || !player.alive) return;
  const team = teamOf(room, player.id);
  if (!team || team.done) return;
  if (player.id !== team.agentId && !team.solo) return;   // only the agent touches the bomb
  const d = team.data;
  if (d.exploded) return;
  const kind = payload && payload.kind;
  const i = Number(payload && payload.index);
  if (kind === 'cut' && !(i >= 0 && i < 5)) return;
  if (kind === 'switch' && !(i >= 0 && i < 4)) return;
  if (kind !== 'cut' && kind !== 'switch') return;
  if (kind === 'cut' && d.cut[i]) return; // already cut - ignore

  const expected = d.steps[d.idx];
  if (expected && expected.k === kind && expected.i === i) {
    if (kind === 'cut') d.cut[i] = true;
    else d.switches[i].on = !d.switches[i].on;
    d.idx += 1;
    toTeam(room, team, 'bombState', { ...bombState(d), lastOk: true });
    if (d.idx >= d.steps.length) finishTeam(room, team, true);
  } else {
    d.strikes += 1;
    if (d.strikes >= 3) {
      d.exploded = true;
      toTeam(room, team, 'bombState', { ...bombState(d), lastOk: false });
      finishTeam(room, team, false);
    } else {
      toTeam(room, team, 'bombState', { ...bombState(d), lastOk: false });
    }
  }
}

/* ---------------- socket wiring ---------------- */
io.on('connection', (socket) => {

  function ack(cb, payload) { if (typeof cb === 'function') cb(payload); }
  function ctx() { const ref = SOCKETS[socket.id]; if (!ref) return {}; const room = ROOMS[ref.code]; return { room, player: room && room.players[ref.playerId] }; }

  socket.on('createRoom', (data, cb) => {
    const name = clean(data && data.name, 20) || 'Player';
    const playerId = clean(data && data.playerId, 40);
    const password = clean(data && data.password, 40);
    if (!playerId) return ack(cb, { error: 'Missing player id.' });
    const room = createRoom(password, { id: playerId });
    const p = addPlayer(room, { id: playerId, name, socketId: socket.id });
    socket.join(room.code);
    SOCKETS[socket.id] = { code: room.code, playerId };
    ack(cb, { ok: true, code: room.code, you: p.id, room: publicRoom(room) });
    emitRoom(room);
  });

  socket.on('joinRoom', (data, cb) => {
    const code = clean(data && data.code, 8).toUpperCase();
    const name = clean(data && data.name, 20) || 'Player';
    const playerId = clean(data && data.playerId, 40);
    const password = clean(data && data.password, 40);
    const room = ROOMS[code];
    if (!room) return ack(cb, { error: 'Room not found.' });
    if (room.password && room.password !== password) return ack(cb, { error: 'Wrong password.' });
    if (!playerId) return ack(cb, { error: 'Missing player id.' });
    const isReturning = !!room.players[playerId];
    if (!isReturning && room.phase !== 'lobby' && room.phase !== 'ended')
      return ack(cb, { error: 'Game already in progress — wait for the next game.' });
    // no two players may share a name
    const nameTaken = Object.values(room.players)
      .some(p => p.id !== playerId && p.name.toLowerCase() === name.toLowerCase());
    if (nameTaken) return ack(cb, { error: `The name "${name}" is already taken in this room — pick another.` });
    const p = addPlayer(room, { id: playerId, name, socketId: socket.id });
    socket.join(room.code);
    SOCKETS[socket.id] = { code: room.code, playerId };
    // returning mid-game: resend everything private they need
    if (isReturning && room.phase !== 'lobby' && p.role) {
      const sabs = Object.values(room.players).filter(x => x.role === 'saboteur');
      io.to(socket.id).emit('role', { role: p.role, fellowSaboteurs: p.role === 'saboteur' ? sabs.filter(s => s.id !== p.id).map(s => ({ id: s.id, name: s.name })) : [] });
      if (room.phase === 'challenge') {
        const team = teamOf(room, p.id);
        if (team && !team.done) sendChallengeData(room, team, p.id);
      }
      if (room.phase === 'voting') {
        io.to(socket.id).emit('votingPhase', {
          round: room.round, endsAt: room.endsAt, results: [],
          chamber: room.chamberInfo,
          candidates: aliveList(room).map(x => ({ id: x.id, name: x.name }))
        });
      }
      if (room.phase === 'trigger' && room.suspectId) {
        io.to(socket.id).emit('triggerPhase', {
          suspectId: room.suspectId,
          suspectName: room.players[room.suspectId] ? room.players[room.suspectId].name : '?',
          chamber: room.chamberInfo, endsAt: room.endsAt
        });
      }
    }
    reassignHostIfNeeded(room);
    ack(cb, { ok: true, code: room.code, you: p.id, room: publicRoom(room) });
    emitRoom(room);
  });

  socket.on('startGame', (_d, cb) => {
    const { room, player } = ctx();
    if (!room || !player) return ack(cb, { error: 'Not in a room.' });
    if (player.id !== room.hostId) return ack(cb, { error: 'Only the host can start.' });
    if (room.phase !== 'lobby' && room.phase !== 'ended') return ack(cb, { error: 'Game already running.' });
    ack(cb, startGame(room));
  });

  /* challenge inputs */
  socket.on('pwSubmit', (d) => { const { room, player } = ctx(); if (room && player) handlePwSubmit(room, player, d); });
  socket.on('mazeMove', (d) => { const { room, player } = ctx(); if (room && player) handleMazeMove(room, player, d); });
  socket.on('bombAction', (d) => { const { room, player } = ctx(); if (room && player) handleBombAction(room, player, d); });

  /* team chat during challenges (guide <-> agent) */
  socket.on('teamChat', (data) => {
    const { room, player } = ctx();
    if (!room || !player || room.phase !== 'challenge' || !player.alive) return;
    const team = teamOf(room, player.id);
    if (!team) return;
    const text = clean(data && data.text, 200);
    if (!text) return;
    toTeam(room, team, 'teamChat', { from: player.name, id: player.id, text, ts: now() });
  });

  /* global chat during voting */
  socket.on('chat', (data) => {
    const { room, player } = ctx();
    if (!room || !player || room.phase !== 'voting') return;
    const text = clean(data && data.text, 200);
    if (!text) return;
    const msg = { from: player.name, id: player.id, text, ts: now() };
    room.chat.push(msg);
    if (room.chat.length > 200) room.chat.shift();
    io.to(room.code).emit('chat', msg);
  });

  socket.on('vote', (data) => {
    const { room, player } = ctx();
    if (!room || !player) return;
    castVote(room, player, clean(data && data.targetId, 40));
  });

  socket.on('useGlass', () => {
    const { room, player } = ctx();
    if (room && player) useGlass(room, player);
  });

  socket.on('pullTrigger', () => {
    const { room, player } = ctx();
    if (!room || !player) return;
    if (room.phase !== 'trigger' || player.id !== room.suspectId) return;
    fireTrigger(room);
  });

  socket.on('playAgain', (_d, cb) => {
    const { room, player } = ctx();
    if (!room || !player) return ack(cb, { error: 'Not in a room.' });
    if (player.id !== room.hostId) return ack(cb, { error: 'Only the host can restart.' });
    returnToLobby(room);
    ack(cb, { ok: true });
  });

  socket.on('leaveRoom', () => { removeSocket(socket.id); socket.leave((SOCKETS[socket.id] || {}).code); });
  socket.on('disconnect', () => { removeSocket(socket.id); });
});

server.listen(PORT, () => console.log(`Sabotage server listening on :${PORT}`));

module.exports = {
  app, server, io, ROOMS,
  _internal: {
    saboteurCount, createRoom, addPlayer, genBomb,
    genMaze: (r) => genMaze(r), genPassword: (r) => genPassword(r),
    mazeBlocked, checkWin, startGame, endChallenge, DEFAULTS,
    handlePwSubmit, handleMazeMove, handleBombAction
  }
};
