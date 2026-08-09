/* Sabotage v2 - client. Teams of two, three co-op challenges, roulette voting.
   Includes a WebAudio sound engine (no audio files) and juice: splashes,
   confetti, muzzle flash, screen shake, cylinder spin. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  /* persistent player id.
     - normal: one identity per browser (localStorage), survives refresh -> reconnects to your seat.
     - ?guest : a per-TAB identity (sessionStorage) so you can open several tabs on one machine
                as different players when testing locally.
     - ?pid=NAME : force a specific id (handy for scripted/local testing). */
  const _q = new URLSearchParams(location.search);
  const _newId = () =>
    "p" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  let playerId;
  if (_q.get("pid")) {
    playerId = _q.get("pid");
  } else if (_q.has("guest")) {
    playerId = sessionStorage.getItem("sabotage-pid") || _newId();
    sessionStorage.setItem("sabotage-pid", playerId);
  } else {
    playerId = localStorage.getItem("sabotage-pid") || _newId();
    localStorage.setItem("sabotage-pid", playerId);
  }

  /* ================= SOUND ENGINE (WebAudio, all synthesized) ================= */
  const SFX = (() => {
    let ctx = null;
    let muted = false;
    try {
      muted = localStorage.getItem("sabotage-muted") === "1";
    } catch (e) {}
    function ac() {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        if (!ctx) ctx = new AC();
        if (ctx.state === "suspended") ctx.resume();
        return ctx;
      } catch (e) {
        return null;
      }
    }
    function master(c, vol, t0, dur) {
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      g.connect(c.destination);
      return g;
    }
    function tone(freq, dur, o2) {
      if (muted) return;
      const c = ac();
      if (!c) return;
      const o = o2 || {};
      const t0 = c.currentTime + (o.delay || 0);
      const osc = c.createOscillator();
      osc.type = o.type || "sine";
      osc.frequency.setValueAtTime(freq, t0);
      if (o.slide)
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(30, freq + o.slide),
          t0 + dur,
        );
      osc.connect(master(c, o.vol == null ? 0.16 : o.vol, t0, dur));
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    }
    function noise(dur, o2) {
      if (muted) return;
      const c = ac();
      if (!c) return;
      const o = o2 || {};
      const t0 = c.currentTime + (o.delay || 0);
      const n = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, n, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = c.createBufferSource();
      src.buffer = buf;
      let node = src;
      if (o.low) {
        const f = c.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = o.low;
        src.connect(f);
        node = f;
      }
      node.connect(master(c, o.vol == null ? 0.2 : o.vol, t0, dur));
      src.start(t0);
    }
    const S = {
      click() {
        tone(660, 0.06, { type: "square", vol: 0.05 });
      },
      type() {
        tone(420 + Math.random() * 120, 0.05, { type: "triangle", vol: 0.09 });
      },
      good() {
        [523, 659, 784].forEach((f, i) =>
          tone(f, 0.12, { type: "triangle", vol: 0.14, delay: i * 0.07 }),
        );
      },
      lock() {
        tone(880, 0.09, { type: "triangle", vol: 0.16 });
        tone(1318, 0.15, { type: "triangle", vol: 0.12, delay: 0.06 });
      },
      bad() {
        tone(170, 0.22, { type: "sawtooth", vol: 0.13, slide: -70 });
      },
      move() {
        tone(310, 0.035, { type: "square", vol: 0.035 });
      },
      bump() {
        noise(0.12, { vol: 0.24, low: 320 });
        tone(85, 0.13, { type: "sine", vol: 0.22, slide: -35 });
      },
      snip() {
        noise(0.05, { vol: 0.18 });
        tone(1100, 0.06, { type: "square", vol: 0.08, slide: 700 });
      },
      toggle() {
        tone(500, 0.05, { type: "square", vol: 0.1 });
        tone(720, 0.05, { type: "square", vol: 0.1, delay: 0.05 });
      },
      tick() {
        tone(1050, 0.03, { type: "square", vol: 0.05 });
      },
      alarm() {
        [0, 0.13].forEach((d) =>
          tone(310, 0.11, { type: "sawtooth", vol: 0.16, delay: d }),
        );
      },
      boom() {
        noise(0.8, { vol: 0.5, low: 420 });
        tone(60, 0.9, { type: "sine", vol: 0.42, slide: -30 });
      },
      defused() {
        [392, 523, 659, 784].forEach((f, i) =>
          tone(f, 0.16, { type: "triangle", vol: 0.15, delay: i * 0.09 }),
        );
      },
      whoosh() {
        noise(0.35, { vol: 0.12, low: 900 });
      },
      spin() {
        for (let i = 0; i < 11; i++)
          tone(650 + i * 45, 0.03, {
            type: "square",
            vol: 0.05,
            delay: i * 0.075,
          });
      },
      heartbeat() {
        tone(72, 0.12, { type: "sine", vol: 0.3 });
        tone(62, 0.12, { type: "sine", vol: 0.24, delay: 0.22 });
      },
      cock() {
        tone(400, 0.04, { type: "square", vol: 0.13 });
        tone(250, 0.05, { type: "square", vol: 0.13, delay: 0.07 });
      },
      bang() {
        noise(0.5, { vol: 0.6, low: 1600 });
        tone(90, 0.55, { type: "sine", vol: 0.5, slide: -55 });
      },
      dry() {
        tone(430, 0.03, { type: "square", vol: 0.15 });
        tone(300, 0.04, { type: "square", vol: 0.11, delay: 0.05 });
      },
      vote() {
        tone(520, 0.07, { type: "triangle", vol: 0.12 });
        tone(780, 0.08, { type: "triangle", vol: 0.1, delay: 0.06 });
      },
      item() {
        [880, 1108, 1318, 1760].forEach((f, i) =>
          tone(f, 0.1, { type: "sine", vol: 0.1, delay: i * 0.06 }),
        );
      },
      win() {
        [523, 659, 784, 1046, 784, 1046].forEach((f, i) =>
          tone(f, 0.15, { type: "triangle", vol: 0.14, delay: i * 0.11 }),
        );
      },
      lose() {
        [392, 370, 349, 294].forEach((f, i) =>
          tone(f, 0.22, { type: "sawtooth", vol: 0.09, delay: i * 0.17 }),
        );
      },
      chime() {
        tone(660, 0.15, { type: "sine", vol: 0.1 });
        tone(990, 0.2, { type: "sine", vol: 0.08, delay: 0.08 });
      },
    };
    return Object.assign(S, {
      toggleMute() {
        muted = !muted;
        try {
          localStorage.setItem("sabotage-muted", muted ? "1" : "0");
        } catch (e) {}
        return muted;
      },
      isMuted() {
        return muted;
      },
      unlock() {
        ac();
      },
    });
  })();

  /* ---------- visual helpers ---------- */
  function flashScreen(color, ms) {
    try {
      const d = document.createElement("div");
      d.className = "sb-screenflash";
      d.style.background = color;
      document.body.appendChild(d);
      setTimeout(() => d.remove(), ms || 650);
    } catch (e) {}
  }
  function shake() {
    document.body.classList.remove("sb-shake");
    void document.body.offsetWidth; // restart animation
    document.body.classList.add("sb-shake");
    setTimeout(() => document.body.classList.remove("sb-shake"), 650);
  }
  const CONF_COLORS = [
    "#f06a4d",
    "#f5a524",
    "#43c98c",
    "#5aa2e8",
    "#b78af5",
    "#e85aa2",
    "#d6a84a",
  ];
  function confetti(n) {
    try {
      const w = document.createElement("div");
      w.className = "sb-confetti";
      for (let i = 0; i < (n || 26); i++) {
        const s = document.createElement("i");
        s.style.setProperty("--x", Math.random() * 100 + "vw");
        s.style.setProperty("--r", Math.random() * 720 - 360 + "deg");
        s.style.setProperty("--d", 1.4 + Math.random() * 1.2 + "s");
        s.style.setProperty("--w", 6 + Math.random() * 8 + "px");
        s.style.background =
          CONF_COLORS[(Math.random() * CONF_COLORS.length) | 0];
        w.appendChild(s);
      }
      document.body.appendChild(w);
      setTimeout(() => w.remove(), 2800);
    } catch (e) {}
  }

  const state = {
    code: null,
    phase: "landing",
    players: [],
    hostId: null,
    role: null,
    fellows: [],
    round: 1,
    challenge: null,
    endsAt: null,
    teams: [], // public: [{id, members:[{id,name,guide}], done, ok}]
    cd: null, // my private challengeData
    chamber: null, // {live, blank, total}
    suspectId: null,
  };
  let socket = null,
    timerInt = null,
    trigInt = null,
    heartInt = null,
    bombTimerInt = null,
    splashTO = null;

  const SCREENS = [
    "sb-landing",
    "sb-lobby",
    "sb-challenge",
    "sb-voting",
    "sb-over",
  ];
  function show(id) {
    SCREENS.forEach((s) => $(s).classList.toggle("active", s === id));
    window.scrollTo(0, 0);
  }
  function me() {
    return state.players.find((p) => p.id === playerId);
  }
  function isHost() {
    return state.hostId === playerId;
  }
  function toast(text, cls) {
    const w = $("sb-toasts");
    const d = document.createElement("div");
    d.className = "sb-toast " + (cls || "");
    d.textContent = text;
    w.appendChild(d);
    setTimeout(() => {
      d.style.opacity = "0";
      d.style.transform = "translateX(120%)";
      d.style.transition = "all .4s";
      setTimeout(() => d.remove(), 400);
    }, 3200);
  }
  function err(t) {
    $("sb-error").textContent = t || "";
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    );
  }
  function nameOf(id) {
    const p = state.players.find((x) => x.id === id);
    return p ? p.name : "?";
  }

  /* ---------------- connection ---------------- */
  function serverUrl() {
    return window.SABOTAGE_SERVER || "http://192.168.1.10:3001";
  }

  function connect(url) {
    return new Promise((resolve, reject) => {
      if (socket && socket.connected && socket.io.uri === url) {
        resolve();
        return;
      }
      if (socket) {
        try {
          socket.close();
        } catch (e) {}
        socket = null;
      }
      socket = io(url, {
        transports: ["websocket", "polling"],
        forceNew: true,
        reconnection: true,
      });
      let settled = false;
      socket.on("connect", () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
      socket.on("connect_error", () => {
        if (!settled) {
          settled = true;
          reject(new Error("Could not reach the server. Is it awake?"));
        }
      });
      wireHandlers();
    });
  }

  /* ---------------- server -> client handlers ---------------- */
  function wireHandlers() {
    socket.on("room", (room) => {
      state.players = room.players;
      state.hostId = room.hostId;
      state.round = room.round || state.round;
      if (room.endsAt) state.endsAt = room.endsAt;
      if (room.phase) state.phase = room.phase;
      if (room.teams && room.teams.length) {
        room.teams.forEach((rt) => {
          const t = state.teams.find((x) => x.id === rt.id);
          if (t) {
            t.done = rt.done;
            t.ok = rt.ok;
          }
        });
      }
      renderLobby();
      renderTeamStatus();
      renderGlassBtn();
    });

    socket.on("role", (d) => {
      state.role = d.role;
      state.fellows = d.fellowSaboteurs || [];
      renderRoleBanner();
    });

    socket.on("gameStart", (d) => {
      SFX.whoosh();
      toast(
        `Game on! ${d.saboteurs} saboteur${d.saboteurs > 1 ? "s" : ""} hidden among ${d.players}.`,
      );
    });

    socket.on("challengePhase", (d) => {
      hideOverlays();
      state.phase = "challenge";
      state.round = d.round;
      state.endsAt = d.endsAt;
      state.challenge = d.challenge;
      state.teams = d.teams.map((t) => ({ ...t, done: false, ok: false }));
      state.cd = null;
      state.suspectId = null;
      mazeTrail = {};
      $("sb-round").textContent = d.round;
      $("sb-ch-name").textContent = CH_NAMES[d.challenge] || d.challenge;
      $("sb-teamchat-log").innerHTML = "";
      show("sb-challenge");
      startTimer($("sb-timer"), d.endsAt);
      renderRoleBanner();
      renderTeamStatus();
      showSplash(d.round, d.challenge);
      $("sb-task-title").textContent = CH_NAMES[d.challenge];
      $("sb-task-sub").textContent = "";
      $("sb-task-area").innerHTML =
        '<div class="dim">' +
        (d.teams.some((t) => t.members.some((m) => m.id === playerId))
          ? "Receiving your briefing…"
          : "You sat out this round — watch the timer and think about who to accuse.") +
        "</div>";
      $("sb-team-banner").innerHTML = "";
    });

    socket.on("challengeData", (d) => {
      state.cd = d;
      renderTeamBanner(d);
      renderChallenge(d);
    });

    socket.on("pwState", (d) => onPwState(d));
    socket.on("mazeState", (d) => onMazeState(d));
    socket.on("bombState", (d) => onBombState(d));

    socket.on("teamDone", (d) => {
      const t = state.teams.find((x) => x.id === d.teamId);
      if (t) {
        t.done = true;
        t.ok = d.ok;
      }
      renderTeamStatus();
      const mine = state.cd && state.cd.teamId === d.teamId;
      if (mine) {
        if (d.ok) {
          SFX.good();
          confetti(22);
          toast("✓ Your team finished!", "good");
        }
      } else {
        if (d.ok) SFX.chime();
        else SFX.bad();
        toast(
          (d.ok ? "✓ " : "✗ ") + d.name + (d.ok ? " finished" : " failed"),
          d.ok ? "good" : "bad",
        );
      }
    });

    socket.on("teamChat", (m) => {
      if (m.id !== playerId) SFX.type();
      addChat($("sb-teamchat-log"), m);
    });

    socket.on("itemGained", (d) => {
      if (d.item === "glass") {
        SFX.item();
        toast(
          "🔍 You found a magnifying glass! (" +
            d.reason +
            ") Use it during voting to peek at the next shell.",
          "good",
        );
      }
    });

    socket.on("votingPhase", (d) => {
      hideOverlays();
      SFX.whoosh();
      state.phase = "voting";
      state.endsAt = d.endsAt;
      state.chamber = d.chamber;
      state.suspectId = null;
      show("sb-voting");
      startTimer($("sb-vote-timer"), d.endsAt);
      renderResultsStrip(d.results || []);
      renderChamber($("sb-shells"), d.chamber);
      $("sb-chamber-sub").innerHTML =
        `<b>${d.chamber.live} LIVE</b> · ${d.chamber.blank} blank — in a random order. The accused pulls the trigger.`;
      $("sb-glass-result").textContent = "";
      renderGlassBtn();
      $("sb-chat-log").innerHTML = "";
      addChat($("sb-chat-log"), {
        sys: true,
        text: "30 seconds. Who made their team fail on purpose?",
      });
      renderCandidates(d.candidates);
      $("sb-vote-note").textContent = "";
    });

    socket.on("glassUsed", (d) => {
      if (d.id !== playerId) {
        SFX.chime();
        toast("🔍 " + d.name + " inspected the chamber…");
      }
      renderGlassBtn();
    });
    socket.on("glassResult", (d) => {
      SFX.item();
      const el = $("sb-glass-result");
      el.innerHTML =
        d.shell === "live"
          ? 'Next shell: <b class="live">LIVE 💥</b> <span class="dim small">(only you know)</span>'
          : 'Next shell: <b class="blank">BLANK</b> <span class="dim small">(only you know)</span>';
    });

    socket.on("voteTally", (d) => {
      $("sb-vote-note").textContent =
        `${d.votedIds.length} / ${d.aliveCount} voted`;
    });
    socket.on("chat", (m) => {
      if (m.id !== playerId) SFX.type();
      addChat($("sb-chat-log"), m);
    });

    socket.on("voteResult", (d) => {
      if (d.skipped) {
        const box = $("sb-reveal-box");
        box.innerHTML = `<div class="big">🤔</div><div class="who">No one was accused</div>
          <div class="verdict">${d.tie ? "The vote was tied." : "The room abstained."} The chamber stays loaded…</div>`;
        $("sb-reveal-overlay").classList.add("active");
        setTimeout(
          () => $("sb-reveal-overlay").classList.remove("active"),
          2800,
        );
      }
      // if a suspect was chosen, the trigger overlay takes over via 'triggerPhase'
    });

    socket.on("triggerPhase", (d) => showTrigger(d));
    socket.on("triggerResult", (d) => showTriggerResult(d));

    socket.on("scoreboard", (d) => {
      SFX.chime();
      showScoreboard(d);
    });
    socket.on("gameOver", (d) => showGameOver(d));
    socket.on("lobby", () => {
      hideOverlays();
      state.phase = "lobby";
      show("sb-lobby");
    });
  }

  /* ---------------- create / join ---------------- */
  async function doCreate() {
    err("");
    SFX.click();
    const btn = $("sb-create");
    btn.disabled = true;
    const name = $("sb-c-name").value.trim() || "Player";
    const password = $("sb-c-pass").value.trim();
    toast("Connecting…");
    try {
      await connect(serverUrl());
      socket
        .timeout(9000)
        .emit("createRoom", { name, password, playerId }, (errT, res) => {
          btn.disabled = false;
          if (errT) {
            const m = "Server not responding. Is it awake?";
            err(m);
            toast(m, "bad");
            return;
          }
          if (!res || res.error) {
            const m = (res && res.error) || "Failed to create room.";
            err(m);
            toast(m, "bad");
            return;
          }
          localStorage.setItem(
            "sabotage-last",
            JSON.stringify({ code: res.code, password, name }),
          );
          toast("Room " + res.code + " created!", "good");
          SFX.good();
          enterRoom(res);
        });
    } catch (e) {
      btn.disabled = false;
      err(e.message);
      toast(e.message, "bad");
    }
  }
  async function doJoin() {
    err("");
    SFX.click();
    const name = $("sb-j-name").value.trim() || "Player";
    const code = $("sb-j-code").value.trim().toUpperCase();
    const password = $("sb-j-pass").value.trim();
    if (!code) {
      err("Enter a room code.");
      toast("Enter a room code.", "bad");
      return;
    }
    const btn = $("sb-join");
    btn.disabled = true;
    toast("Joining " + code + "…");
    try {
      await connect(serverUrl());
      socket
        .timeout(9000)
        .emit("joinRoom", { code, name, password, playerId }, (errT, res) => {
          btn.disabled = false;
          if (errT) {
            const m = "Server not responding. Is it awake?";
            err(m);
            toast(m, "bad");
            return;
          }
          if (!res || res.error) {
            const m = (res && res.error) || "Failed to join.";
            err(m);
            toast(m, "bad");
            return;
          }
          localStorage.setItem(
            "sabotage-last",
            JSON.stringify({ code: res.code, password, name }),
          );
          toast("Joined room " + res.code + "!", "good");
          SFX.good();
          enterRoom(res);
        });
    } catch (e) {
      btn.disabled = false;
      err(e.message);
      toast(e.message, "bad");
    }
  }
  function enterRoom(res) {
    state.code = res.code;
    state.players = res.room.players;
    state.hostId = res.room.hostId;
    state.phase = res.room.phase;
    state.chamber = res.room.chamberInfo || null;
    $("sb-code").textContent = res.code;
    routePhase(res.room.phase);
  }
  function routePhase(phase) {
    if (phase === "lobby" || phase === "ended") {
      show(phase === "ended" ? "sb-over" : "sb-lobby");
      renderLobby();
    } else if (phase === "challenge") {
      show("sb-challenge");
    } else if (
      phase === "voting" ||
      phase === "reveal" ||
      phase === "trigger"
    ) {
      show("sb-voting");
    } else if (phase === "scoreboard") {
      show("sb-voting");
    } else show("sb-lobby");
  }

  /* ---------------- lobby / players ---------------- */
  function playerChip(p) {
    const dead = !p.alive;
    const off = !p.connected;
    return `<div class="sb-player ${dead ? "dead" : ""} ${off ? "off" : ""}">
      <span class="dot"></span>${escapeHtml(p.name)}
      ${p.isHost ? '<span class="host-badge">HOST</span>' : ""}
      ${p.id === playerId ? '<span class="me-badge">you</span>' : ""}
      ${p.glass ? '<span class="glass-badge" title="magnifying glass">🔍</span>' : ""}
      ${state.phase !== "lobby" ? `<span class="sc">${p.score}</span>` : ""}
    </div>`;
  }
  function renderLobby() {
    $("sb-lobby-players").innerHTML = state.players.map(playerChip).join("");
    const connected = state.players.filter((p) => p.connected).length;
    const MIN = 4;
    const canStart = isHost() && connected >= MIN;
    $("sb-start").disabled = !canStart;
    $("sb-start-note").textContent = !isHost()
      ? "Waiting for the host to start…"
      : connected < MIN
        ? `Need at least ${MIN} players (have ${connected}).`
        : `${connected} players ready.`;
  }

  function renderRoleBanner() {
    const b = $("sb-role-banner");
    if (!state.role) {
      b.innerHTML = "";
      b.className = "sb-role-banner";
      return;
    }
    if (state.role === "saboteur") {
      b.className = "sb-role-banner saboteur";
      b.innerHTML =
        "&#9760; You are a SABOTEUR" +
        (state.fellows.length
          ? " &middot; with " +
            state.fellows.map((f) => escapeHtml(f.name)).join(", ")
          : " &middot; working alone") +
        ". Make your team fail — without getting caught.";
    } else {
      b.className = "sb-role-banner crew";
      b.innerHTML =
        "&#128737;&#65039; You are CREW. Work with your partner, complete the challenge, spot the liars.";
    }
  }

  function renderTeamBanner(cd) {
    const mates = cd.mates.map((m) => escapeHtml(m.name)).join(" & ");
    const roleTxt = cd.isAgent
      ? "<b>You have the controls.</b> Your partner has the info — listen and act."
      : "<b>You have the knowledge.</b> Your partner is flying blind — talk them through it.";
    $("sb-team-banner").innerHTML =
      `👥 Teamed with <b>${mates || "no one"}</b> · ${roleTxt}`;
  }

  function renderTeamStatus() {
    const el = $("sb-teamstatus");
    if (!state.teams.length) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML = state.teams
      .map((t) => {
        const names = t.members
          .map((m) => escapeHtml((m.name || nameOf(m.id)).slice(0, 8)))
          .join("+");
        const cls = t.done ? (t.ok ? "ok" : "fail") : "";
        const mine = t.members.some((m) => m.id === playerId);
        return `<span class="sb-tchip ${cls} ${mine ? "mine" : ""}">${t.done ? (t.ok ? "✓" : "✗") : "…"} ${names}</span>`;
      })
      .join("");
  }

  /* ---------------- round splash ---------------- */
  const CH_NAMES = {
    password: "Password Puzzle",
    maze: "Wire Maze",
    bomb: "Bomb Defusal",
  };
  const CH_ICONS = { password: "🔑", maze: "🧭", bomb: "💣" };
  function showSplash(round, challenge) {
    const ov = $("sb-splash");
    if (!ov) return;
    SFX.whoosh();
    setTimeout(() => SFX.chime(), 250);
    $("sb-splash-icon").textContent = CH_ICONS[challenge] || "🎲";
    $("sb-splash-round").textContent = "ROUND " + round;
    $("sb-splash-name").textContent = (
      CH_NAMES[challenge] || challenge
    ).toUpperCase();
    ov.classList.remove("active");
    void ov.offsetWidth;
    ov.classList.add("active");
    clearTimeout(splashTO);
    splashTO = setTimeout(() => ov.classList.remove("active"), 2200);
  }

  /* ---------------- timers ---------------- */
  function startTimer(el, endsAt) {
    clearInterval(timerInt);
    let lastS = -1;
    const tick = () => {
      const ms = Math.max(0, endsAt - Date.now());
      const s = Math.ceil(ms / 1000);
      el.textContent =
        Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
      el.classList.toggle("urgent", s <= 10);
      if (s !== lastS) {
        if (
          s <= 10 &&
          s > 0 &&
          (state.phase === "voting" || state.phase === "challenge")
        )
          SFX.tick();
        lastS = s;
      }
      if (ms <= 0) clearInterval(timerInt);
    };
    tick();
    timerInt = setInterval(tick, 250);
  }

  /* ================= CHALLENGES ================= */
  function renderChallenge(cd) {
    const area = $("sb-task-area");
    area.style.pointerEvents = "";
    area.innerHTML = "";
    $("sb-task-title").textContent = CH_NAMES[cd.kind];
    clearInterval(bombTimerInt);
    if (cd.kind === "password") renderPassword(cd, area);
    else if (cd.kind === "maze") renderMaze(cd, area);
    else renderBomb(cd, area);
  }

  /* ---------- password ---------- */
  let pwSel = 0,
    pwJustLocked = -1;
  function renderPassword(cd, area) {
    const st = cd.state;
    if (cd.isGuide && !cd.isAgent && !cd.view.words) {
      $("sb-task-sub").textContent = "read the definitions to your partner";
      area.innerHTML = `<div class="sb-pw-defs">
        ${cd.view.defs.map((d, i) => `<div class="sb-pw-def" id="pwdef-${i}"><span class="n">${i + 1}</span> ${escapeHtml(d)}</div>`).join("")}
      </div>
      <div class="dim small">Your partner has 10 words — only 5 are right. Help them fill each slot, in any order. <b>5 wrong guesses fail the round!</b></div>
      <div class="sb-task-msg" id="t-msg"></div>`;
      paintPwGuide(st);
      return;
    }
    // agent (or solo)
    $("sb-task-sub").textContent =
      "find each word your partner describes — 5 wrong guesses fail the round";
    area.innerHTML = `
      <div class="sb-pw-slots" id="pw-slots"></div>
      <div class="sb-pw-words" id="pw-words"></div>
      ${cd.view.defs ? `<div class="sb-pw-defs solo">${cd.view.defs.map((d, i) => `<div class="sb-pw-def"><span class="n">${i + 1}</span> ${escapeHtml(d)}</div>`).join("")}</div>` : ""}
      <div class="sb-task-msg" id="t-msg"></div>`;
    pwSel = firstOpenSlot(st.slots);
    paintPwAgent(cd, st);
  }
  function firstOpenSlot(slots) {
    const i = slots.findIndex((s) => !s);
    return i < 0 ? 0 : i;
  }
  function paintPwGuide(st) {
    st.slots.forEach((w, i) => {
      const el = $("pwdef-" + i);
      if (el) el.classList.toggle("solved", !!w);
    });
  }
  function paintPwAgent(cd, st) {
    const slotsEl = $("pw-slots"),
      wordsEl = $("pw-words");
    if (!slotsEl) return;
    slotsEl.innerHTML = st.slots
      .map(
        (w, i) =>
          `<div class="sb-pw-slot ${w ? "locked" : ""} ${i === pwJustLocked ? "pop" : ""} ${i === pwSel && !w ? "sel" : ""}" data-i="${i}">
        <span class="n">${i + 1}</span>${w ? escapeHtml(w) : "____"}</div>`,
      )
      .join("");
    slotsEl.querySelectorAll(".sb-pw-slot").forEach((el) => {
      el.onclick = () => {
        const i = +el.dataset.i;
        if (!st.slots[i]) {
          SFX.click();
          pwSel = i;
          pwJustLocked = -1;
          paintPwAgent(cd, st);
        }
      };
    });
    const used = st.slots.filter(Boolean);
    wordsEl.innerHTML = cd.view.words
      .map(
        (w) =>
          `<div class="sb-pw-word ${used.includes(w) ? "used" : ""}" data-w="${escapeHtml(w)}">${escapeHtml(w)}</div>`,
      )
      .join("");
    wordsEl.querySelectorAll(".sb-pw-word:not(.used)").forEach((el) => {
      el.onclick = () => {
        SFX.type();
        socket.emit("pwSubmit", { slot: pwSel, word: el.dataset.w });
      };
    });
  }
  function onPwState(d) {
    if (!state.cd || state.cd.kind !== "password") return;
    state.cd.state = { slots: d.slots, wrong: d.wrong };
    const m = $("t-msg");
    pwJustLocked = -1;
    if (d.lastOk === true) {
      SFX.lock();
      pwJustLocked = d.slot;
      if (m) {
        m.textContent = "✓ Slot " + (d.slot + 1) + " locked in!";
        m.className = "sb-task-msg ok";
      }
      pwSel = firstOpenSlot(d.slots);
      if (d.slots.every(Boolean)) SFX.defused();
    } else if (d.lastOk === false) {
      const max = d.maxWrong || 5;
      if (d.failed) {
        SFX.boom();
        shake();
        flashScreen("rgba(240,90,50,.35)", 550);
        if (m) {
          m.textContent =
            "💥 " + max + " wrong guesses — the vault locked. Round failed.";
          m.className = "sb-task-msg no";
        }
        const area = $("sb-task-area");
        if (area) area.style.pointerEvents = "none";
        $("sb-taskcard").classList.add("sabotaged");
        return;
      }
      SFX.bad();
      if (m) {
        m.textContent =
          '✗ "' +
          d.tried +
          '" is not slot ' +
          (d.slot + 1) +
          " — " +
          d.wrong +
          "/" +
          max +
          " wrong!";
        m.className = "sb-task-msg no";
      }
      $("sb-taskcard").classList.add("sabotaged");
      setTimeout(() => $("sb-taskcard").classList.remove("sabotaged"), 450);
    }
    paintPwGuide(state.cd.state);
    paintPwAgent(state.cd, state.cd.state);
  }

  /* ---------- maze ---------- */
  let mazeTrail = {};
  function renderMaze(cd, area) {
    const v = cd.view;
    $("sb-task-sub").textContent = cd.isAgent
      ? "move with the arrows — you can't see the walls"
      : "you see the maze — call out directions";
    const hasWalls = !!v.h;
    area.innerHTML = `
      <div class="sb-maze ${hasWalls ? "" : "blind"}" id="maze-grid" style="grid-template-columns:repeat(${v.size},1fr)"></div>
      <div class="sb-maze-info"><span id="maze-hits">0 wall hits</span></div>
      ${
        cd.isAgent || cd.view.words
          ? `
      <div class="sb-dpad" id="dpad">
        <button data-d="u">▲</button>
        <div class="sb-dpad-mid"><button data-d="l">◀</button><button data-d="d">▼</button><button data-d="r">▶</button></div>
      </div><div class="dim small">or use arrow keys</div>`
          : ""
      }
      <div class="sb-task-msg" id="t-msg"></div>`;
    const grid = $("maze-grid");
    for (let y = 0; y < v.size; y++)
      for (let x = 0; x < v.size; x++) {
        const c = document.createElement("div");
        c.className = "sb-mcell";
        c.id = `mc-${x}-${y}`;
        if (hasWalls) {
          if (v.h[y][x]) c.classList.add("wt");
          if (v.h[y + 1][x]) c.classList.add("wb");
          if (v.v[y][x]) c.classList.add("wl");
          if (v.v[y][x + 1]) c.classList.add("wr");
        }
        if (x === 0 && y === 0) c.classList.add("start");
        if (x === v.exit.x && y === v.exit.y) {
          c.classList.add("exit");
          c.textContent = "⭐";
        }
        grid.appendChild(c);
      }
    mazeTrail = { "0,0": true };
    paintMaze(v.pos, null);
    const pad = $("dpad");
    if (pad)
      pad.querySelectorAll("button").forEach((b) => {
        b.onclick = () => socket.emit("mazeMove", { dir: b.dataset.d });
      });
  }
  let mazeLast = { x: 0, y: 0 };
  function paintMaze(pos, hitDir) {
    const old = $(`mc-${mazeLast.x}-${mazeLast.y}`);
    if (old) {
      old.classList.remove("cur");
      old.classList.remove("hit");
      old.classList.add("trail");
    }
    const cell = $(`mc-${pos.x}-${pos.y}`);
    if (cell) {
      cell.classList.add("cur");
      if (hitDir) {
        cell.classList.add("hit");
        setTimeout(() => cell.classList.remove("hit"), 350);
      }
    }
    mazeTrail[pos.x + "," + pos.y] = true;
    mazeLast = { x: pos.x, y: pos.y };
  }
  function onMazeState(d) {
    if (!state.cd || state.cd.kind !== "maze") return;
    const moved = !d.hit;
    state.cd.view.pos = d.pos;
    paintMaze(d.pos, d.hit || null);
    if (moved && !d.done) SFX.move();
    const h = $("maze-hits");
    if (h) {
      h.textContent = d.hits + " wall hit" + (d.hits === 1 ? "" : "s");
      if (d.hit) {
        h.classList.add("bump");
        setTimeout(() => h.classList.remove("bump"), 300);
      }
    }
    const m = $("t-msg");
    if (d.hit) {
      SFX.bump();
      if (m) {
        m.textContent = "✗ Wall!";
        m.className = "sb-task-msg no";
        setTimeout(() => {
          if (m.textContent === "✗ Wall!") {
            m.textContent = "";
          }
        }, 700);
      }
    }
    if (d.done && m) {
      m.textContent = "✓ Reached the exit!";
      m.className = "sb-task-msg ok";
    }
  }
  document.addEventListener("keydown", (e) => {
    if (state.phase !== "challenge" || !state.cd || state.cd.kind !== "maze")
      return;
    if (!state.cd.isAgent && !state.cd.view.words) return;
    const map = {
      ArrowUp: "u",
      ArrowDown: "d",
      ArrowLeft: "l",
      ArrowRight: "r",
    };
    if (map[e.key]) {
      e.preventDefault();
      socket.emit("mazeMove", { dir: map[e.key] });
    }
  });

  /* ---------- bomb ---------- */
  let bombArmed = -1; // wire pending confirmation
  function renderBomb(cd, area) {
    if (cd.isGuide && !cd.view.wires) {
      $("sb-task-sub").textContent =
        "you have the manual — your partner has the bomb";
      area.innerHTML = `<div class="sb-manual">
        ${cd.view.manual.map((m, i) => `<div class="sb-man-step ${i === cd.view.manual.length - 1 ? "warn" : ""}">${escapeHtml(m)}</div>`).join("")}
      </div>
      <div class="dim small">Ask your partner what they see: wire colors, serial number, switches, the light.</div>
      <div class="sb-task-msg" id="t-msg"></div>`;
      return;
    }
    $("sb-task-sub").textContent =
      "do exactly what your partner says — 3 mistakes and it blows";
    const v = cd.view;
    bombArmed = -1;
    area.innerHTML = `
      <div class="sb-bomb">
        <div class="sb-bomb-top">
          <div class="sb-bomb-timer" id="bomb-timer">--:--</div>
          <div class="sb-serial">SN: <b>${escapeHtml(v.serial)}</b></div>
          <div class="sb-indicator ${v.indicator ? "lit" : ""}" title="indicator light">●</div>
          <div class="sb-strikes" id="bomb-strikes">💚💚💚</div>
        </div>
        <div class="sb-wires" id="bomb-wires">
          ${v.wires.map((w, i) => `<div class="sb-wire ${w}" data-i="${i}"><span class="wn">${i + 1}</span><span class="wl"></span><span class="cutlab">CUT?</span></div>`).join("")}
        </div>
        <div class="sb-switches" id="bomb-switches">
          ${v.switches.map((s, i) => `<div class="sb-switch" data-i="${i}"><div class="lab">${s.label}</div><div class="tog ${s.on ? "on" : ""}"><div class="knob"></div></div><div class="st">${s.on ? "ON" : "OFF"}</div></div>`).join("")}
        </div>
        ${cd.view.manual ? `<div class="sb-manual solo">${cd.view.manual.map((m) => `<div class="sb-man-step">${escapeHtml(m)}</div>`).join("")}</div>` : ""}
      </div>
      <div class="sb-task-msg" id="t-msg"></div>`;
    // bomb countdown display + soft ticking
    clearInterval(bombTimerInt);
    let lastBs = -1;
    bombTimerInt = setInterval(() => {
      const el = $("bomb-timer");
      if (!el || state.phase !== "challenge") {
        clearInterval(bombTimerInt);
        return;
      }
      const ms = Math.max(0, (state.endsAt || 0) - Date.now());
      const s = Math.ceil(ms / 1000);
      el.textContent =
        Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
      el.classList.toggle("danger", s <= 30);
      if (s !== lastBs) {
        lastBs = s;
        if (s > 10 && s % 2 === 0) SFX.tick();
        else if (s <= 10 && s > 0) SFX.tick();
      }
      if (ms <= 0) clearInterval(bombTimerInt);
    }, 250);
    $("bomb-wires")
      .querySelectorAll(".sb-wire")
      .forEach((el) => {
        el.onclick = () => {
          if (el.classList.contains("cut")) return;
          const i = +el.dataset.i;
          if (bombArmed === i) {
            bombArmed = -1;
            el.classList.remove("armed");
            socket.emit("bombAction", { kind: "cut", index: i });
          } else {
            SFX.click();
            $("bomb-wires")
              .querySelectorAll(".sb-wire")
              .forEach((x) => x.classList.remove("armed"));
            bombArmed = i;
            el.classList.add("armed");
          }
        };
      });
    $("bomb-switches")
      .querySelectorAll(".sb-switch")
      .forEach((el) => {
        el.onclick = () => {
          bombArmed = -1;
          document
            .querySelectorAll(".sb-wire.armed")
            .forEach((x) => x.classList.remove("armed"));
          socket.emit("bombAction", { kind: "switch", index: +el.dataset.i });
        };
      });
  }
  function onBombState(d) {
    if (!state.cd || state.cd.kind !== "bomb") return;
    const strikes = $("bomb-strikes");
    if (strikes)
      strikes.textContent =
        "💚".repeat(Math.max(0, 3 - d.strikes)) + "💥".repeat(d.strikes);
    const wires = $("bomb-wires");
    if (wires)
      d.cut.forEach((c, i) => {
        if (c) {
          const w = wires.querySelector(`[data-i="${i}"]`);
          if (w && !w.classList.contains("cut")) {
            w.classList.add("cut");
            if (d.lastOk === true) SFX.snip();
          } else if (w) w.classList.add("cut");
        }
      });
    const sws = $("bomb-switches");
    if (sws)
      d.switches.forEach((on, i) => {
        const el = sws.querySelector(`[data-i="${i}"]`);
        if (!el) return;
        const tog = el.querySelector(".tog");
        if (tog.classList.contains("on") !== on && d.lastOk === true)
          SFX.toggle();
        tog.classList.toggle("on", on);
        el.querySelector(".st").textContent = on ? "ON" : "OFF";
      });
    const m = $("t-msg");
    if (d.exploded) {
      SFX.boom();
      shake();
      flashScreen("rgba(240,90,50,.5)", 700);
      clearInterval(bombTimerInt);
      if (m) {
        m.textContent = "💥 BOOM. The bomb exploded — challenge failed.";
        m.className = "sb-task-msg no";
      }
      $("sb-taskcard").classList.add("sabotaged");
      const bomb = document.querySelector(".sb-bomb");
      if (bomb) bomb.classList.add("exploded");
      const area = $("sb-task-area");
      if (area) area.style.pointerEvents = "none";
      return;
    }
    if (d.lastOk === true && m) {
      m.textContent = `✓ Correct (${d.stepsDone}/${d.stepsTotal})`;
      m.className = "sb-task-msg ok";
    }
    if (d.lastOk === false && m) {
      SFX.alarm();
      m.textContent = `✗ WRONG — strike ${d.strikes}/3!`;
      m.className = "sb-task-msg no";
      $("sb-taskcard").classList.add("sabotaged");
      flashScreen("rgba(240,90,50,.18)", 350);
      setTimeout(() => $("sb-taskcard").classList.remove("sabotaged"), 450);
    }
    if (d.stepsDone >= d.stepsTotal) {
      clearInterval(bombTimerInt);
      SFX.defused();
      flashScreen("rgba(67,201,140,.25)", 600);
      const bomb = document.querySelector(".sb-bomb");
      if (bomb) bomb.classList.add("defused");
      if (m) {
        m.textContent = "✓ Bomb defused!";
        m.className = "sb-task-msg ok";
      }
    }
  }

  /* ================= VOTING ================= */
  function renderResultsStrip(results) {
    const el = $("sb-results-strip");
    if (!results.length) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML = results
      .map(
        (r) =>
          `<span class="sb-tchip ${r.ok ? "ok" : "fail"}">${r.ok ? "✓" : "✗"} ${r.members.map((m) => escapeHtml(m.name)).join(" & ")}</span>`,
      )
      .join("");
  }

  function renderChamber(el, chamber) {
    if (!el || !chamber) return;
    el.innerHTML = Array.from(
      { length: chamber.total },
      () =>
        `<span class="sb-shell"><span class="tip"></span><span class="body">?</span><span class="rim"></span></span>`,
    ).join("");
  }

  function renderGlassBtn() {
    const btn = $("sb-glass-btn");
    if (!btn) return;
    const my = me();
    const has = my && my.glass > 0 && my.alive && state.phase === "voting";
    btn.style.display = has ? "inline-block" : "none";
  }

  let myVote = null;
  function renderCandidates(cands) {
    myVote = null;
    const my = me();
    const dead = my && !my.alive;
    $("sb-vote-note").textContent = dead
      ? "You were eliminated — spectating."
      : "";
    const box = $("sb-candidates");
    box.innerHTML = cands
      .map(
        (
          c,
        ) => `<div class="sb-cand ${dead ? "disabled" : ""}" data-id="${c.id}">
      <span>${escapeHtml(c.name)}${c.id === playerId ? " (you)" : ""}</span><span class="votes"></span></div>`,
      )
      .join("");
    box.querySelectorAll(".sb-cand").forEach((el) => {
      el.onclick = () => {
        if (dead) return;
        SFX.vote();
        myVote = el.dataset.id;
        socket.emit("vote", { targetId: myVote });
        box
          .querySelectorAll(".sb-cand")
          .forEach((x) => x.classList.toggle("voted", x === el));
      };
    });
    $("sb-skip-vote").disabled = !!dead;
  }

  function addChat(log, m) {
    if (!log) return;
    const d = document.createElement("div");
    if (m.sys) {
      d.className = "sb-msg sys";
      d.textContent = m.text;
    } else {
      d.className = "sb-msg" + (m.id === playerId ? " me" : "");
      d.innerHTML = `<b>${escapeHtml(m.from)}:</b> ${escapeHtml(m.text)}`;
    }
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  /* ================= TRIGGER (roulette) ================= */
  function showTrigger(d) {
    state.suspectId = d.suspectId;
    const ov = $("sb-trigger-overlay");
    const isMe = d.suspectId === playerId;
    $("sb-trigger-box").className = "sb-trigger-box";
    $("sb-trigger-title").textContent = isMe
      ? "YOU WERE ACCUSED"
      : String(d.suspectName).toUpperCase() + " WAS ACCUSED";
    $("sb-trigger-gun").textContent = "";
    $("sb-trigger-gun").style.display = "none";
    const cyl = $("sb-cylinder");
    if (cyl) {
      cyl.style.display = "";
      cyl.classList.remove("spin");
      void cyl.getBoundingClientRect();
      cyl.classList.add("spin");
    }
    const fl = $("sb-flash");
    if (fl) fl.className = "sb-flash";
    const sm = $("sb-smoke");
    if (sm) sm.className = "sb-smoke";
    SFX.spin();
    renderChamber($("sb-trigger-shells"), d.chamber);
    $("sb-trigger-sub").innerHTML =
      `${d.chamber.live} live · ${d.chamber.blank} blank remain. ${isMe ? "<b>Pull the trigger.</b>" : "They must pull the trigger…"}`;
    const btn = $("sb-pull-btn");
    btn.style.display = isMe ? "inline-block" : "none";
    btn.disabled = false;
    ov.classList.add("active");
    clearInterval(trigInt);
    clearInterval(heartInt);
    heartInt = setInterval(() => SFX.heartbeat(), 1100);
    trigInt = setInterval(() => {
      const s = Math.max(0, Math.ceil((d.endsAt - Date.now()) / 1000));
      $("sb-trigger-count").textContent =
        s > 0 ? (isMe ? `auto-fires in ${s}s` : `${s}s`) : "";
      if (s <= 0) clearInterval(trigInt);
    }, 200);
  }

  function showTriggerResult(d) {
    clearInterval(trigInt);
    clearInterval(heartInt);
    const ov = $("sb-trigger-overlay");
    ov.classList.add("active"); // in case we reconnected mid-trigger
    $("sb-pull-btn").style.display = "none";
    $("sb-trigger-count").textContent = "";
    const box = $("sb-trigger-box");
    const cyl = $("sb-cylinder");
    const gun = $("sb-trigger-gun");
    if (d.shell === "live") {
      SFX.bang();
      shake();
      flashScreen("rgba(255,220,150,.55)", 500);
      const fl = $("sb-flash");
      if (fl) {
        fl.className = "sb-flash bang";
      }
      if (cyl) cyl.style.display = "none";
      gun.style.display = "";
      gun.textContent = "💥";
      box.className = "sb-trigger-box bang";
      $("sb-trigger-title").textContent = "BANG.";
      $("sb-trigger-sub").innerHTML =
        `<b>${escapeHtml(d.suspectName)}</b> is eliminated — they were ${d.role === "saboteur" ? '<b class="live">a SABOTEUR ☠️</b>' : '<b class="blank">innocent crew 💔</b>'}`;
    } else {
      SFX.dry();
      const sm = $("sb-smoke");
      if (sm) sm.className = "sb-smoke puff";
      if (cyl) cyl.style.display = "none";
      gun.style.display = "";
      gun.textContent = "😮‍💨";
      box.className = "sb-trigger-box click";
      $("sb-trigger-title").textContent = "…click.";
      $("sb-trigger-sub").innerHTML =
        `A blank! <b>${escapeHtml(d.suspectName)}</b> lives. Their role stays secret.`;
    }
    setTimeout(() => ov.classList.remove("active"), 3800);
  }

  /* ================= SCOREBOARD / GAME OVER ================= */
  function boardRows(rankings, showRoles) {
    return rankings
      .map(
        (
          r,
          i,
        ) => `<div class="sb-rank ${i === 0 ? "top" : ""} ${r.alive === false ? "deadrow" : ""}">
      <span class="pos">${i + 1}</span><span class="nm">${escapeHtml(r.name)}${r.alive === false ? " ☠" : ""}</span>
      ${showRoles ? `<span class="role ${r.role === "saboteur" ? "saboteur" : "crew"}">${r.role === "saboteur" ? "Saboteur" : "Crew"}</span>` : ""}
      <span class="pts">${r.score}${showRoles && r.secret ? ` <span class="dim small">(+${r.secret} secret)</span>` : ""}</span></div>`,
      )
      .join("");
  }
  function showScoreboard(d) {
    const ov = $("sb-score-overlay");
    $("sb-score-board").innerHTML = boardRows(d.rankings, false);
    ov.classList.add("active");
    const iv = setInterval(() => {
      const s = Math.max(0, Math.ceil((d.endsAt - Date.now()) / 1000));
      $("sb-score-sub").textContent = `Round ${d.nextRound} starts in ${s}s`;
      if (Date.now() >= d.endsAt) {
        clearInterval(iv);
        ov.classList.remove("active");
      }
    }, 200);
  }
  function showGameOver(d) {
    hideOverlays();
    clearInterval(timerInt);
    clearInterval(trigInt);
    clearInterval(bombTimerInt);
    state.phase = "ended";
    const iWon = (d.winner === "crew") === (state.role !== "saboteur");
    if (iWon) {
      SFX.win();
      confetti(46);
    } else {
      SFX.lose();
    }
    const title = $("sb-over-title");
    if (d.winner === "crew") {
      title.textContent = "🛡️ The Crew Wins!";
      title.className = "sb-over-title-crew";
      $("sb-over-sub").textContent = "Every saboteur took a live round.";
    } else {
      title.textContent = "☠️ The Saboteurs Win!";
      title.className = "sb-over-title-sab";
      $("sb-over-sub").textContent =
        "The saboteurs are as many as the crew. It's over.";
    }
    $("sb-final-board").innerHTML = boardRows(d.rankings, true);
    $("sb-again").style.display = isHost() ? "inline-block" : "none";
    show("sb-over");
  }

  function hideOverlays() {
    [
      "sb-trigger-overlay",
      "sb-reveal-overlay",
      "sb-score-overlay",
      "sb-splash",
    ].forEach((id) => {
      const el = $(id);
      if (el) el.classList.remove("active");
    });
    clearInterval(trigInt);
    clearInterval(heartInt);
  }

  /* ---------------- wiring UI ---------------- */
  function bind() {
    $("sb-create").onclick = doCreate;
    $("sb-join").onclick = doJoin;
    ["sb-c-name", "sb-c-pass"].forEach((id) =>
      $(id).addEventListener("keydown", (e) => {
        if (e.key === "Enter") doCreate();
      }),
    );
    ["sb-j-name", "sb-j-code", "sb-j-pass"].forEach((id) =>
      $(id).addEventListener("keydown", (e) => {
        if (e.key === "Enter") doJoin();
      }),
    );
    $("sb-start").onclick = () => {
      SFX.click();
      socket.emit("startGame", {}, (r) => {
        if (r && r.error) toast(r.error, "bad");
      });
    };
    $("sb-copy").onclick = () => {
      SFX.click();
      navigator.clipboard && navigator.clipboard.writeText(state.code || "");
      toast("Room code copied");
    };
    $("sb-skip-vote").onclick = () => {
      SFX.vote();
      socket.emit("vote", { targetId: "skip" });
      document
        .querySelectorAll(".sb-cand")
        .forEach((x) => x.classList.remove("voted"));
    };
    $("sb-chat-send").onclick = () => sendChat("sb-chat-in", "chat");
    $("sb-chat-in").addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendChat("sb-chat-in", "chat");
    });
    $("sb-teamchat-send").onclick = () =>
      sendChat("sb-teamchat-in", "teamChat");
    $("sb-teamchat-in").addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendChat("sb-teamchat-in", "teamChat");
    });
    $("sb-glass-btn").onclick = () => {
      SFX.click();
      socket.emit("useGlass");
    };
    $("sb-pull-btn").onclick = () => {
      SFX.cock();
      $("sb-pull-btn").disabled = true;
      setTimeout(() => socket.emit("pullTrigger"), 350);
    };
    $("sb-again").onclick = () => {
      SFX.click();
      socket.emit("playAgain", {}, (r) => {
        if (r && r.error) toast(r.error, "bad");
      });
    };
    $("sb-leave1").onclick = leave;
    $("sb-leave2").onclick = leave;
    $("sb-j-code").addEventListener(
      "input",
      (e) => (e.target.value = e.target.value.toUpperCase()),
    );
    // sound toggle + audio unlock on first interaction
    const mute = $("sb-mute");
    if (mute) {
      mute.textContent = SFX.isMuted() ? "🔇" : "🔊";
      mute.onclick = () => {
        const m = SFX.toggleMute();
        mute.textContent = m ? "🔇" : "🔊";
        if (!m) SFX.chime();
      };
    }
    const unlock = () => SFX.unlock();
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
  }
  function sendChat(inputId, ev) {
    const inp = $(inputId);
    const t = inp.value.trim();
    if (!t) return;
    socket.emit(ev, { text: t });
    inp.value = "";
  }
  function leave() {
    try {
      socket && socket.emit("leaveRoom");
      socket && socket.close();
    } catch (e) {}
    socket = null;
    localStorage.removeItem("sabotage-last");
    location.reload();
  }

  document.addEventListener("DOMContentLoaded", bind);
})();
