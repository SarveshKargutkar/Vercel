/* The Unfolding Battle - UI controller (DOM glue) */
(function () {
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const wait = ms => new Promise(r => setTimeout(r, ms));

  let game = null;
  let mode = "pvc";
  let setup = { idx: 0, picks: [] };       // setup state
  let selectedCardUid = null;              // currently selected hand card
  let placer = 0;                          // whose placement turn
  let busy = false;                        // lock during animations/AI
  let hotseatHidden = false;               // pvp: hide hand until "ready"
  let campaignDeck = null;                 // pvc: persistent 9-card deck
  let campaignLevel = 1;                   // pvc: current map level (1..7)
  let campaignPicks = null;                // pvc: player hero/passive
  let lastPicks = null;                    // remember hero/passive for retries

  // ---------- screens ----------
  function show(id) { $$(".screen").forEach(s => s.classList.remove("active")); $("#" + id).classList.add("active"); }
  function openModal(html) { $("#modal-body").innerHTML = html; $("#overlay").classList.add("active"); }
  function closeModal() { $("#overlay").classList.remove("active"); }

  // ---------- sound (WebAudio, no files) ----------
  let soundOn = (function(){ try { return localStorage.getItem("unfolding_sound") !== "off"; } catch(e){ return true; } })();
  let actx = null;
  function ensureAudio() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){} } return actx; }
  function tone(freq, dur, type, vol, when) {
    const a = ensureAudio(); if (!a || !soundOn) return;
    const t = (when != null) ? when : a.currentTime;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || "sine"; o.frequency.value = freq;
    o.connect(g); g.connect(a.destination);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  }
  const sfx = {
    place(){ tone(320, 0.08, "triangle", 0.12); },
    reveal(){ const a = ensureAudio(); if (!a) return; tone(523, 0.10, "sine", 0.12, a.currentTime); tone(659, 0.12, "sine", 0.10, a.currentTime + 0.06); },
    hit(){ tone(120, 0.18, "sawtooth", 0.20); },
    win(){ const a = ensureAudio(); if (!a) return; [523,659,784,1047].forEach((fr,i)=>tone(fr,0.18,"triangle",0.14,a.currentTime+i*0.10)); },
    lose(){ const a = ensureAudio(); if (!a) return; [392,330,247].forEach((fr,i)=>tone(fr,0.24,"sine",0.14,a.currentTime+i*0.13)); }
  };
  function toggleSound(){ soundOn = !soundOn; try { localStorage.setItem("unfolding_sound", soundOn ? "on" : "off"); } catch(e){} updateSoundBtn(); if (soundOn) { ensureAudio(); sfx.place(); } }
  function updateSoundBtn(){ const b = $("#btn-sound"); if (b) b.textContent = soundOn ? "Sound: On" : "Sound: Off"; }

  // ---------- campaign save (localStorage) ----------
  const SAVE_KEY = "unfolding_campaign";
  let campaignWins = 0;
  function saveCampaign(){ try { localStorage.setItem(SAVE_KEY, JSON.stringify({ deck: campaignDeck, heroId: campaignPicks && campaignPicks.heroId, passiveId: campaignPicks && campaignPicks.passiveId, level: campaignLevel, wins: campaignWins })); } catch(e){} }
  function loadCampaign(){ try { const r = localStorage.getItem(SAVE_KEY); return r ? JSON.parse(r) : null; } catch(e){ return null; } }
  function clearCampaign(){ try { localStorage.removeItem(SAVE_KEY); } catch(e){} }

  function shakeLoser(res){
    if (!res.combat) return;
    const viewer = viewerIndex();
    const node = (res.loser === viewer) ? $("#strip-bottom") : $("#strip-top");
    if (node) { node.classList.add("shake"); setTimeout(()=>node.classList.remove("shake"), 450); }
  }

  // ---------- title ----------
  $$("#screen-title [data-mode]").forEach(b => b.addEventListener("click", () => {
    ensureAudio();
    mode = b.dataset.mode;
    if (mode === "pvc") {
      const sv = loadCampaign();
      if (sv && sv.deck && sv.heroId) { promptContinue(sv); return; }
    }
    startSetup();
  }));
  function promptContinue(sv) {
    openModal(`<h2>Continue Campaign?</h2>
      <p class="small">Saved progress: Level <b>${Math.min(sv.level||1,7)}</b> of 7, ${sv.deck.length}-card deck.</p>
      <div class="mt"><button id="cc-cont">Continue</button> <button id="cc-new">New Campaign</button></div>`);
    $("#cc-cont").addEventListener("click", () => {
      closeModal();
      campaignDeck = sv.deck.slice();
      campaignWins = sv.wins || 0;
      campaignLevel = sv.level || 1;
      campaignPicks = { heroId: sv.heroId, passiveId: sv.passiveId };
      showMap();
    });
    $("#cc-new").addEventListener("click", () => { closeModal(); clearCampaign(); startSetup(); });
  }
  $("#btn-rules").addEventListener("click", showRules);
  $("#btn-back-title").addEventListener("click", () => show("screen-title"));
  $("#btn-menu").addEventListener("click", () => { if (confirm("Quit to menu?")) show("screen-title"); });
  (function(){ const m=document.getElementById("map-menu"); if(m) m.addEventListener("click", ()=>show("screen-title")); })();

  function showRules() {
    openModal(`<h2>How to Play</h2>
      <div style="text-align:left;font-size:1.2rem;line-height:1.4">
      <p>Each round you both get <b>5 mana</b> and take turns placing one hidden card into your 3 slots.</p>
      <p>When both players have filled the <b>same slot number</b>, those two cards flip face-up and their <b>Battlecries / Traps</b> fire at once (the player who goes first that round resolves first).</p>
      <p>When the line is full, each side's <b>Power</b> is summed. The lower total loses health equal to the <b>difference + the winner's Base Damage</b>.</p>
      <p>The round winner then picks a bonus for next round. Reduce the enemy hero to <b>0</b> Health to win.</p>
      </div>
      <div class="mt"><button onclick="document.getElementById('overlay').classList.remove('active')">Got it</button></div>`);
  }

  // ---------- setup ----------
  function startSetup() {
    setup = { idx: 0, picks: [{}, {}] };
    renderSetup();
    show("screen-setup");
  }
  function renderSetup() {
    const who = setup.idx;
    $("#setup-title").textContent = mode === "pvp"
      ? `Player ${who + 1}: choose Hero & Passive`
      : "Choose your Hero & Passive";
    $("#setup-who").textContent = mode === "pvp" ? "(keep your choices secret if you like)" : "";
    const hl = $("#hero-list"); hl.innerHTML = "";
    Object.values(HEROES).forEach(h => {
      const c = el("div", "choice sketch", `<h3>${h.name}</h3>
        <div class="stats">HP ${h.health} &middot; Base Damage ${h.baseDamage}</div>
        <div class="flavor">${h.flavor}</div>`);
      if (setup.picks[who].heroId === h.id) c.classList.add("selected");
      c.addEventListener("click", () => { setup.picks[who].heroId = h.id; renderSetup(); });
      hl.appendChild(c);
    });
    const pl = $("#passive-list"); pl.innerHTML = "";
    Object.values(PASSIVES).forEach(p => {
      const c = el("div", "choice sketch alt", `<h3>${p.name}</h3>
        <div class="flavor">${p.desc}</div>`);
      if (setup.picks[who].passiveId === p.id) c.classList.add("selected");
      c.addEventListener("click", () => { setup.picks[who].passiveId = p.id; renderSetup(); });
      pl.appendChild(c);
    });
    const pick = setup.picks[who];
    $("#btn-confirm-setup").disabled = !(pick.heroId && pick.passiveId);
  }
  function rollAiOpponent() {
    const heroes = Object.keys(HEROES), pas = Object.keys(PASSIVES);
    return { heroId: heroes[Math.floor(Math.random() * heroes.length)], passiveId: pas[Math.floor(Math.random() * pas.length)] };
  }
  $("#btn-confirm-setup").addEventListener("click", () => {
    if (mode === "pvp") {
      if (setup.idx === 0) { setup.idx = 1; renderSetup(); return; }
      beginGamePvP();
      return;
    }
    // PvC: start a fresh campaign
    campaignPicks = { ...setup.picks[0] };
    campaignDeck = STARTING_DECK.slice();
    campaignLevel = 1;
    campaignWins = 0;
    saveCampaign();
    showMap();
  });

  function beginGamePvP() {
    lastPicks = setup.picks.map(p => ({ ...p }));
    game = new Engine.Game({
      mode: "pvp",
      p1: { heroId: setup.picks[0].heroId, passiveId: setup.picks[0].passiveId, name: "Player 1", deck: STARTING_DECK.slice() },
      p2: { heroId: setup.picks[1].heroId, passiveId: setup.picks[1].passiveId, name: "Player 2", deck: STARTING_DECK.slice() }
    });
    placer = game.currentPlayer;
    selectedCardUid = null;
    show("screen-game");
    renderAll();
    nextPlacement();
  }

  // ---------- campaign map ----------
  function showMap() {
    mode = "pvc";
    const wrap = $("#map-nodes"); wrap.innerHTML = "";
    $("#map-sub").innerHTML = `Hero: <b>${HEROES[campaignPicks.heroId].name.replace('The ','')}</b> &middot; ${PASSIVES[campaignPicks.passiveId].name} &middot; Wins: <b>${campaignWins}</b>`;
    CAMPAIGN.forEach(L => {
      const status = L.level < campaignLevel ? "done" : (L.level === campaignLevel ? "current" : "locked");
      const foe = HEROES[L.heroId], pas = PASSIVES[L.passiveId];
      const scale = `HP ${foe.health + L.hpBonus} &middot; Dmg ${foe.baseDamage + L.dmgBonus}${L.manaPerRound ? ` &middot; +${L.manaPerRound} mana/rd` : ""}`;
      const node = el("div", "map-node " + status,
        `<div class="map-node-num">Level ${L.level}${L.level === 7 ? " &#9819;" : ""}</div>
         <div class="map-node-name">${L.name}</div>
         <div class="map-node-foe">${pas.name}</div>
         <div class="small">${status === "locked" ? "Locked" : scale}</div>
         <div class="map-node-blurb small">${L.blurb}</div>
         ${status === "current" ? `<button class="map-battle" data-lvl="${L.level}">Battle</button>` : ""}
         ${status === "done" ? `<div class="map-badge">&#10003; Cleared</div>` : ""}`);
      wrap.appendChild(node);
    });
    wrap.querySelectorAll(".map-battle").forEach(b => b.addEventListener("click", () => startLevel(parseInt(b.dataset.lvl, 10))));
    const ds = $("#map-deck-strip"); if (ds) ds.innerHTML = campaignDeck.map(d => miniCard(d)).join("");
    show("screen-map");
  }

  function startLevel(lvl) {
    ensureAudio();
    mode = "pvc";
    campaignLevel = lvl;
    const L = CAMPAIGN[lvl - 1];
    lastPicks = [ { ...campaignPicks }, { heroId: L.heroId, passiveId: L.passiveId } ];
    game = new Engine.Game({
      mode: "pvc",
      p1: { heroId: campaignPicks.heroId, passiveId: campaignPicks.passiveId, name: "You", deck: campaignDeck.slice() },
      p2: { heroId: L.heroId, passiveId: L.passiveId, name: L.name, isAI: true, hpBonus: L.hpBonus, dmgBonus: L.dmgBonus, manaPerRound: L.manaPerRound }
    });
    placer = game.currentPlayer;
    selectedCardUid = null;
    show("screen-game");
    renderAll();
    nextPlacement();
  }

  // ---------- rendering ----------
  // bottom strip = the player who is currently the "viewer".
  // PvC: viewer always player 0. PvP: viewer = current placer.
  function viewerIndex() { return mode === "pvc" ? 0 : placer; }

  function cardFace(card, pi, extra) {
    const eff = game.effectivePower(pi, { card });
    let powCls = "";
    if (card.kind === "creature") {
      if (eff > card.basePower) powCls = "buffed";
      else if (eff < card.basePower) powCls = "debuffed";
    }
    const powVal = card.kind === "creature" ? eff : "0";
    return `<div class="card ${card.kind} ${extra || ""}">
      <div class="cost">${card.cost}</div>
      <div class="cname">${card.name}</div>
      <div class="ctext">${card.text || ""}</div>
      <div class="pow ${powCls}">${powVal}</div>
    </div>`;
  }
  function cardBack() { return `<div class="card back"></div>`; }

  // power visible to a viewer: revealed slots always count; the viewer also
  // sees the power of their own not-yet-revealed placed cards.
  function visiblePower(pi, isViewer) {
    let sum = 0;
    game.players[pi].slots.forEach(slot => {
      if (!slot) return;
      if (slot.revealed || isViewer) sum += game.effectivePower(pi, slot);
    });
    return sum;
  }

  function renderStrip(node, pi, isViewer) {
    const p = game.players[pi];
    const hero = HEROES[p.heroId];
    const hpPct = Math.max(0, Math.min(100, (p.health / p.maxHealth) * 100));
    const pow = visiblePower(pi, isViewer);
    node.innerHTML = `
      <div class="strip-left">
        <div class="pname">${p.name} <span class="small">(${hero.name.replace('The ','')})</span></div>
      </div>
      <div class="hpbar-wrap">
        <div class="small">${Math.max(0, p.health)} / ${p.maxHealth} HP</div>
        <div class="hpbar"><div class="hpfill" style="width:${hpPct}%"></div></div>
      </div>
      <div class="stat-chips">
        <span class="chip pow-chip" title="Total power on the line so far">Power ${pow}</span>
        <span class="chip mana">Mana ${isViewer ? p.mana : "?"}</span>
        <span class="chip dmg">Dmg ${p.baseDamage}</span>
      </div>`;
  }

  function renderSidePanel() {
    const viewer = viewerIndex();
    const opp = viewer === 0 ? 1 : 0;
    const me = game.players[viewer], foe = game.players[opp];
    const firstName = game.players[game.firstResolver()].name;
    $("#side-round").innerHTML = `<div class="side-round-num">Round ${game.round}</div>
      <div class="small">${firstName} acts first this round</div>`;
    const box = (p, who, whoClass) => {
      const pas = PASSIVES[p.passiveId];
      return `<div class="side-passive-who ${whoClass}">${who}</div>
        <div class="passive-name">${pas.name}</div>
        <div class="small">${pas.desc}</div>`;
    };
    $("#side-passive-opp").innerHTML = box(foe, foe.name + "'s Passive", "foe");
    $("#side-passive-me").innerHTML = box(me, (mode === "pvc" ? "Your" : me.name + "'s") + " Passive", "mine");
  }

  function renderSlots(node, pi, ownerIsViewer, clickable) {
    node.innerHTML = "";
    const p = game.players[pi];
    for (let s = 0; s < 3; s++) {
      const slot = p.slots[s];
      const cell = el("div", "slot");
      cell.appendChild(el("span", "slot-num", `Slot ${s + 1}`));
      if (slot) {
        const reveal = slot.revealed;
        if (reveal) cell.insertAdjacentHTML("beforeend", cardFace(slot.card, pi, slot._justRevealed ? "reveal" : ""));
        else if (ownerIsViewer) cell.insertAdjacentHTML("beforeend", cardFace(slot.card, pi));
        else cell.insertAdjacentHTML("beforeend", cardBack());
        slot._justRevealed = false;
      } else {
        cell.classList.add("empty");
        if (clickable) {
          cell.classList.add("playable");
          cell.addEventListener("click", () => onSlotClick(s));
        }
      }
      node.appendChild(cell);
    }
  }

  function renderHand() {
    const viewer = viewerIndex();
    const p = game.players[viewer];
    $("#hand-label").textContent = mode === "pvp" ? `${p.name}'s Hand` : "Your Hand";
    const node = $("#hand"); node.innerHTML = "";
    if (mode === "pvp" && hotseatHidden) {
      const btn = el("button", "", `Player ${placer + 1}: tap when ready`);
      btn.style.fontSize = "1.6rem";
      btn.addEventListener("click", () => { hotseatHidden = false; renderAll(); });
      node.appendChild(btn);
      return;
    }
    p.hand.forEach(card => {
      const affordable = card.cost <= p.mana && isMyTurn(viewer);
      const wrap = el("div", "hand-card " + (card.cost <= p.mana ? "affordable" : "unaffordable"));
      wrap.innerHTML = cardFace(card, viewer);
      if (selectedCardUid === card.uid) wrap.classList.add("selected");
      if (affordable) wrap.addEventListener("click", () => {
        selectedCardUid = (selectedCardUid === card.uid) ? null : card.uid;
        renderHand();
      });
      node.appendChild(wrap);
    });
  }

  function isMyTurn(pi) {
    if (busy || game.over) return false;
    if (mode === "pvc") return placer === 0;       // human only
    return placer === pi;
  }

  function renderAll() {
    const viewer = viewerIndex();
    const opp = viewer === 0 ? 1 : 0;
    const vs = document.querySelector(".vs-line");
    if (vs) vs.textContent = "~ the line of battle ~";
    renderSidePanel();
    renderStrip($("#strip-top"), opp, false);
    renderStrip($("#strip-bottom"), viewer, true);
    renderSlots($("#slots-top"), opp, false, false);
    renderSlots($("#slots-bottom"), viewer, true, isMyTurn(viewer));
    renderHand();
    renderLog();
  }

  function renderLog() {
    const node = $("#log"); node.innerHTML = "";
    game.log.slice(-12).forEach(l => node.appendChild(el("div", "", l)));
    node.scrollTop = node.scrollHeight;
  }

  function banner(txt) { $("#turn-banner").textContent = txt; }

  // ---------- turn flow ----------
  function nextPlacement() {
    if (game.over) return;
    if (game.allSlotsFilled() || game.placementStalled()) { return doCombat(); }

    // skip a player who cannot act
    if (!playerCanAct(placer)) {
      const other = placer === 0 ? 1 : 0;
      if (playerCanAct(other)) { placer = other; }
      else return doCombat();
    }

    if (mode === "pvc" && placer === 1) {
      banner("The Computer is plotting...");
      renderAll();
      aiTurn();
      return;
    }
    // human turn
    if (mode === "pvp") { hotseatHidden = true; }
    banner(mode === "pvp" ? `Player ${placer + 1}, place a card.` : "Your turn — pick a card, then a slot.");
    renderAll();
  }

  function playerCanAct(pi) {
    const p = game.players[pi];
    return p.slots.some(s => !s) && p.hand.some(c => c.cost <= p.mana);
  }

  function onSlotClick(slotIndex) {
    const viewer = viewerIndex();
    if (!isMyTurn(viewer)) return;
    if (selectedCardUid == null) { banner("Pick a card from your hand first."); return; }
    const res = game.placeCard(viewer, selectedCardUid, slotIndex);
    if (!res.ok) { banner("Can't place there."); return; }
    selectedCardUid = null;
    sfx.place();
    if (res.revealedSlot != null) { markRevealed(res.revealedSlot); sfx.reveal(); }
    afterPlacement();
  }

  function markRevealed(slotIndex) {
    for (let pi = 0; pi < 2; pi++) {
      const s = game.players[pi].slots[slotIndex];
      if (s) s._justRevealed = true;
    }
  }

  function afterPlacement() {
    // pass turn to the other player
    const other = placer === 0 ? 1 : 0;
    placer = other;
    renderAll();
    nextPlacement();
  }

  async function aiTurn() {
    busy = true;
    await wait(650);
    const mv = AI.chooseMove(game, 1);
    if (mv) {
      const res = game.placeCard(1, mv.cardUid, mv.slotIndex);
      sfx.place();
      if (res.revealedSlot != null) { markRevealed(res.revealedSlot); sfx.reveal(); }
    }
    busy = false;
    placer = 0;
    renderAll();
    nextPlacement();
  }

  // ---------- combat ----------
  async function doCombat() {
    busy = true;
    game.revealRemaining();
    // flash any newly revealed
    for (let s = 0; s < 3; s++) markRevealed(s);
    banner("The line is set — resolving battle!");
    sfx.reveal();
    renderAll();
    await wait(800);
    const res = game.resolveCombat();
    if (res.damage > 0) { sfx.hit(); shakeLoser(res); }
    renderAll();
    await wait(300);
    busy = false;
    showCombatResult(res);
  }

  // ---- descriptive round-end breakdown ----
  function lineHTML(pi, res) {
    const cells = res.breakdown[pi].map(c => {
      if (!c) return `<span class="bd-card empty">empty</span>`;
      const cls = c.kind !== "creature" ? "util" : (c.power > c.base ? "up" : (c.power < c.base ? "down" : ""));
      return `<span class="bd-card ${cls}">${c.name}<b>${c.power}</b></span>`;
    }).join("");
    const total = pi === 0 ? res.p0Power : res.p1Power;
    return `<div class="bd-row"><span class="bd-name">${res.names[pi]}</span>${cells}<span class="bd-total">= ${total}</span></div>`;
  }

  function breakdownHTML(res) {
    let h = `<div class="bd-totals">
        <span class="bd-tot"><span class="bd-tname">${res.names[0]}</span><b>${res.p0Power}</b></span>
        <span class="bd-vs">vs</span>
        <span class="bd-tot"><span class="bd-tname">${res.names[1]}</span><b>${res.p1Power}</b></span>
      </div>`;
    if (res.tie) {
      h += `<p class="bd-explain">Both sides tied at <b>${res.p0Power}</b> power, so no combat damage is dealt.</p>`;
    } else {
      const c = res.combat;
      h += `<div class="bd-explain">
        <div class="bd-math">
          <span><b>${c.winnerName}</b> ${c.winnerPower}</span>
          <span>&minus;</span>
          <span><b>${c.loserName}</b> ${c.loserPower}</span>
          <span>=</span>
          <span class="bd-hl">${c.diff} power gap</span>
        </div>
        <div class="bd-math">
          <span>${c.diff} gap</span><span>+</span>
          <span>${c.winnerName}'s Base Damage ${c.baseDamage}</span>
          <span>=</span>
          <span class="bd-hl big">${c.damage} damage</span>
        </div>
        <div class="bd-hp">${c.loserName}: ${c.loserHpBefore} &rarr; <b>${Math.max(0,c.loserHpAfter)}</b> HP</div>
      </div>`;
    }
    if (res.parity && res.parity.length) {
      h += `<div class="bd-parity"><div class="bd-sub">End-of-round effects</div>` +
        res.parity.map(p => `<div class="${p.even ? 'pe-up':'pe-down'}">${p.text}</div>`).join("") +
        `</div>`;
    }
    return h;
  }

  function showCombatResult(res) {
    let head;
    if (res.tie) head = `<h2>A Stalemate!</h2>`;
    else head = `<h2>${res.combat.winnerName} wins the round</h2>`;

    if (game.over) {
      const youWon = (mode !== "pvc") ? null : (game.winner === 0);
      let footer;
      if (mode === "pvc" && youWon) {
        const clearedLevel = campaignLevel;
        campaignWins++;
        sfx.win();
        if (clearedLevel >= 7) {
          campaignLevel = 8; saveCampaign();
          footer = `<h2 style="color:var(--gold)">Campaign Complete! &#9819;</h2>
            <p class="small">You defeated The Unfolding King and cleared all 7 levels!</p>
            <div class="mt"><button id="m-again">New Campaign</button> <button id="m-menu">Quit to Menu</button></div>`;
        } else {
          campaignLevel = clearedLevel + 1; saveCampaign();
          footer = `<h2 style="color:var(--gold)">Level ${clearedLevel} Cleared! &#9876;</h2>
            <p class="small">Choose a reward, then march to Level ${campaignLevel}.</p>
            <div class="mt"><button id="m-reward">Claim Reward</button> <button id="m-map">To Map</button></div>`;
        }
      } else if (mode === "pvc" && !youWon) {
        sfx.lose(); saveCampaign();
        footer = `<h2 style="color:var(--red)">Defeated at Level ${campaignLevel}</h2>
          <p class="small">Your deck is kept \u2014 try this level again.</p>
          <div class="mt"><button id="m-retry">Retry Level</button> <button id="m-map">To Map</button></div>`;
      } else {
        sfx.win();
        footer = `<h2 style="color:var(--gold)">${res.winnerName} wins the war! &#9876;</h2>
          <div class="mt"><button id="m-again">Play Again</button> <button id="m-menu">Quit to Menu</button></div>`;
      }
      openModal(`${head}${breakdownHTML(res)}${footer}`);
      const menu = $("#m-menu"); if (menu) menu.addEventListener("click", () => { closeModal(); show("screen-title"); });
      const again = $("#m-again"); if (again) again.addEventListener("click", () => { closeModal(); clearCampaign(); show("screen-title"); });
      const retry = $("#m-retry"); if (retry) retry.addEventListener("click", () => { closeModal(); startLevel(campaignLevel); });
      const toMap = $("#m-map"); if (toMap) toMap.addEventListener("click", () => { closeModal(); showMap(); });
      const reward = $("#m-reward"); if (reward) reward.addEventListener("click", () => openRewardScreen());
      return;
    }

    // round continues: show breakdown + winner powerup choice
    if (res.winner != null && !(mode === "pvc" && res.winner === 1)) {
      openModal(`${head}${breakdownHTML(res)}
        <p class="small">${res.combat.winnerName}, claim a bonus for next round:</p>
        <div class="powerup-row">
          <button id="pw-potion">Health Potion (+5 HP)</button>
          <button id="pw-mana">Stockpile (+5 Mana)</button>
        </div>`);
      $("#pw-potion").addEventListener("click", () => { game.applyWinnerPowerup(res.winner, "potion"); afterPowerup(res); });
      $("#pw-mana").addEventListener("click", () => { game.applyWinnerPowerup(res.winner, "mana"); afterPowerup(res); });
    } else {
      if (res.winner === 1) game.applyWinnerPowerup(1, Math.random() < 0.5 ? "potion" : "mana");
      openModal(`${head}${breakdownHTML(res)}<div class="mt"><button id="m-cont">Continue</button></div>`);
      $("#m-cont").addEventListener("click", () => afterPowerup(res));
    }
  }

  function afterPowerup(res) {
    closeModal();
    if (game.over) { showCombatResult(res); return; }
    game.finishRound();
    placer = game.currentPlayer;
    hotseatHidden = (mode === "pvp");
    renderAll();
    nextPlacement();
  }

  // ---- post-win card reward flow (PvC) ----
  function miniCard(defId, cls) {
    const d = CARD_DEFS[defId];
    const pv = d.kind === "creature" ? d.power : 0;
    return `<div class="card ${d.kind} ${cls || ''}" data-def="${defId}">
      <div class="cost">${d.cost}</div>
      <div class="cname">${d.name}</div>
      <div class="ctext">${d.text || ''}</div>
      <div class="pow">${pv}</div>
    </div>`;
  }
  const pick1 = arr => arr[Math.floor(Math.random() * arr.length)];

  function openRewardScreen() {
    const offered = [ pick1(REWARD_POOL.creature), pick1(REWARD_POOL.trap), pick1(REWARD_POOL.utility) ];
    let chosen = null;
    openModal(`<h2>Choose a New Card</h2>
      <p class="small">One Creature, one Trap, one Utility. Pick one to bring into your deck.</p>
      <div class="reward-row" id="reward-offer">${offered.map(d => miniCard(d, "selectable")).join("")}</div>
      <div class="mt"><button id="r-next" disabled>Next: pick a card to replace</button>
      <button id="r-skip">Skip Reward</button></div>`);
    $("#reward-offer").querySelectorAll(".card").forEach(c => {
      c.addEventListener("click", () => {
        $("#reward-offer").querySelectorAll(".card").forEach(x => x.classList.remove("chosen"));
        c.classList.add("chosen");
        chosen = c.dataset.def;
        $("#r-next").disabled = false;
      });
    });
    $("#r-skip").addEventListener("click", () => { saveCampaign(); closeModal(); showMap(); });
    $("#r-next").addEventListener("click", () => { if (chosen) openReplaceScreen(chosen); });
  }

  function openReplaceScreen(newDef) {
    openModal(`<h2>Replace a Card</h2>
      <p class="small">Your deck has 9 cards. Tap one to swap it for <b>${CARD_DEFS[newDef].name}</b>.</p>
      <div class="reward-row deck-strip" id="deck-strip">
        ${campaignDeck.map((d, i) => miniCard(d, "selectable") .replace('data-def="'+d+'"', 'data-def="'+d+'" data-idx="'+i+'"')).join("")}
      </div>
      <div class="mt"><button id="r-back">Back</button></div>`);
    $("#deck-strip").querySelectorAll(".card").forEach(c => {
      c.addEventListener("click", () => {
        const idx = parseInt(c.dataset.idx, 10);
        campaignDeck[idx] = newDef;
        saveCampaign();
        confirmReward(idx, newDef);
      });
    });
    $("#r-back").addEventListener("click", () => openRewardScreen());
  }

  function confirmReward(idx, newDef) {
    openModal(`<h2>Deck Updated</h2>
      <p class="small"><b>${CARD_DEFS[newDef].name}</b> joined your deck.</p>
      <div class="reward-row deck-strip">${campaignDeck.map(d => miniCard(d)).join("")}</div>
      <div class="mt"><button id="r-onward">Back to Map</button>
      <button id="r-menu">Quit to Menu</button></div>`);
    $("#r-onward").addEventListener("click", () => { closeModal(); showMap(); });
    $("#r-menu").addEventListener("click", () => { closeModal(); show("screen-title"); });
  }

  // sound toggle button (in side panel)
  const soundBtn = $("#btn-sound");
  if (soundBtn) soundBtn.addEventListener("click", toggleSound);
  updateSoundBtn();

  // mobile: tap passive boxes / log header to expand details
  ["side-passive-opp", "side-passive-me"].forEach(id => {
    const n = document.getElementById(id);
    if (n) n.addEventListener("click", () => n.classList.toggle("open"));
  });
  const logBox = document.querySelector(".side-log");
  if (logBox) {
    const t = logBox.querySelector(".side-log-title");
    if (t) t.addEventListener("click", () => logBox.classList.toggle("open"));
  }

})();
