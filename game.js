/* The Unfolding Battle - core engine
 * Pure logic, no DOM. Drives placement, revelation, combat, powerups.
 * Works in browser (globals from cards.js) and Node (require).
 */
(function (root) {
  const C = (typeof module !== "undefined" && module.exports)
    ? require("./cards.js")
    : { HEROES: root.HEROES, PASSIVES: root.PASSIVES, CARD_DEFS: root.CARD_DEFS,
        STARTING_DECK: root.STARTING_DECK, REWARD_POOL: root.REWARD_POOL };

  const { HEROES, PASSIVES, CARD_DEFS, STARTING_DECK } = C;

  let _uid = 0;
  function makeCardInstance(defId) {
    const def = CARD_DEFS[defId];
    return {
      uid: ++_uid,
      defId,
      name: def.name,
      kind: def.kind,
      cost: def.cost,
      basePower: def.power,
      ability: def.ability,
      text: def.text,
      // per-round modifiers (reset each round when discarded)
      mods: { soldierBuff: 0, genBuff: 0, halved: false, nullified: false, bombSoldier: false, minus: 0, firstPlaceBonus: 0 }
    };
  }
  function resetMods(card) {
    card.mods = { soldierBuff: 0, genBuff: 0, halved: false, nullified: false, bombSoldier: false, minus: 0, firstPlaceBonus: 0 };
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function makePlayer(name, heroId, passiveId, deckList, isAI, extras) {
    const hero = HEROES[heroId];
    const x = extras || {};
    const deck = shuffle(deckList.map(makeCardInstance));
    const hand = deck.splice(0, 5);
    return {
      name,
      isAI: !!isAI,
      heroId,
      passiveId,
      health: hero.health + (x.hpBonus || 0),
      maxHealth: hero.health + (x.hpBonus || 0),
      baseDamage: hero.baseDamage + (x.dmgBonus || 0),
      manaPerRound: x.manaPerRound || 0,
      mana: 0,
      manaBonus: 0,       // carried from powerups
      deck, hand,
      discard: [],
      slots: [null, null, null],   // {card, revealed}
      placedFirstThisRound: false,
      lastRoundPower: 0
    };
  }

  class Game {
    constructor(opts) {
      // opts: { mode:'pvc'|'pvp', p1:{heroId,passiveId,name}, p2:{...,isAI} }
      this.mode = opts.mode;
      this.players = [
        makePlayer(opts.p1.name || "Player 1", opts.p1.heroId, opts.p1.passiveId, opts.p1.deck || STARTING_DECK.slice(), false, opts.p1),
        makePlayer(opts.p2.name || (opts.mode === "pvc" ? "Computer" : "Player 2"),
                   opts.p2.heroId, opts.p2.passiveId, opts.p2.deck || STARTING_DECK.slice(), opts.mode === "pvc", opts.p2)
      ];
      this.round = 0;
      this.log = [];
      this.over = false;
      this.winner = null;
      this.startRound();
    }

    note(msg) { this.log.push(msg); }

    startRound() {
      this.round++;
      for (const p of this.players) {
        p.mana = 5 + (p.passiveId === "quartermaster" ? 1 : 0) + (p.manaPerRound || 0) + p.manaBonus;
        p.manaBonus = 0;
        p.slots = [null, null, null];
        p.placedFirstThisRound = false;
        if (p.passiveId === "medic" && this.round > 1) {
          p.health = Math.min(p.maxHealth, p.health + 2);
          this.note(`${p.name} (Field Medic) heals 2 Health.`);
        }
        const handSize = 5 + (p.passiveId === "tactician" ? 1 : 0);
        // refill hand up to handSize from deck (cycle discard if empty)
        while (p.hand.length < handSize) {
          if (p.deck.length === 0) {
            if (p.discard.length === 0) break;
            p.deck = shuffle(p.discard.splice(0));
          }
          p.hand.push(p.deck.shift());
        }
      }
      // turn order alternates each round (round 1 -> P1 first, round 2 -> P2 first, ...)
      this.currentPlayer = (this.round % 2 === 1) ? 0 : 1;
      this.note(`--- Round ${this.round} ---`);
    }

    opponentOf(i) { return i === 0 ? 1 : 0; }

    canPlace(pi, cardUid, slotIndex) {
      const p = this.players[pi];
      if (this.over) return false;
      if (slotIndex < 0 || slotIndex > 2 || p.slots[slotIndex]) return false;
      const card = p.hand.find(c => c.uid === cardUid);
      if (!card) return false;
      if (card.cost > p.mana) return false;
      return true;
    }

    placeCard(pi, cardUid, slotIndex) {
      if (!this.canPlace(pi, cardUid, slotIndex)) return { ok: false };
      const p = this.players[pi];
      const card = p.hand.splice(p.hand.findIndex(c => c.uid === cardUid), 1)[0];
      p.mana -= card.cost;
      resetMods(card);
      if (!p.placedFirstThisRound) {
        p.placedFirstThisRound = true;
        if (p.passiveId === "warlord") card.mods.firstPlaceBonus = 1;
      }
      p.slots[slotIndex] = { card, revealed: false };

      // Check if opponent already filled this slot -> reveal both.
      const oi = this.opponentOf(pi);
      const reveals = [];
      if (this.players[oi].slots[slotIndex]) {
        this.revealSlot(slotIndex);
        reveals.push(slotIndex);
      }
      const done = this.allSlotsFilled();
      return { ok: true, revealedSlot: reveals.length ? slotIndex : null, allFilled: done };
    }

    allSlotsFilled() {
      return this.players[0].slots.every(s => s) && this.players[1].slots.every(s => s);
    }

    // True when neither player has a legal placement left this round.
    placementStalled() {
      for (let pi = 0; pi < 2; pi++) {
        const p = this.players[pi];
        const hasEmpty = p.slots.some(s => !s);
        if (hasEmpty && p.hand.some(c => c.cost <= p.mana)) return false;
      }
      return true;
    }

    // Reveal & trigger any placed cards that never got matched (board ending early).
    revealRemaining() {
      for (let s = 0; s < 3; s++) {
        for (let pi = 0; pi < 2; pi++) {
          const slot = this.players[pi].slots[s];
          if (slot && !slot.revealed) {
            slot.revealed = true;
            this.triggerAbility(pi, s, slot.card);
          }
        }
      }
    }

    // returns the player index whose same-slot effects resolve first.
    // Alternates each round: round 1 -> P1 first, round 2 -> P2 first, ...
    firstResolver() {
      return (this.round % 2 === 1) ? 0 : 1;
    }

    revealSlot(slotIndex) {
      const order = [this.firstResolver(), this.opponentOf(this.firstResolver())];
      for (const pi of order) {
        const slot = this.players[pi].slots[slotIndex];
        if (slot) slot.revealed = true;
      }
      // trigger abilities in attack-speed order
      for (const pi of order) {
        const slot = this.players[pi].slots[slotIndex];
        if (slot) this.triggerAbility(pi, slotIndex, slot.card);
      }
    }

    triggerAbility(pi, slotIndex, card) {
      const oi = this.opponentOf(pi);
      const oppSlot = this.players[oi].slots[slotIndex];
      switch (card.ability) {
        case "knight": {
          // buff friendly soldiers in adjacent slots (now or on later reveal via mods)
          for (const adj of [slotIndex - 1, slotIndex + 1]) {
            if (adj < 0 || adj > 2) continue;
            const s = this.players[pi].slots[adj];
            if (s && s.card.defId === "soldier") {
              s.card.mods.soldierBuff += 0.5;
              this.note(`${this.players[pi].name}'s Knight buffs an adjacent Soldier (+0.5).`);
            } else {
              // pending: store buff on the slot index so a later Soldier picks it up
              this._pendingKnight = this._pendingKnight || {};
              const key = pi + ":" + adj;
              this._pendingKnight[key] = (this._pendingKnight[key] || 0) + 0.5;
            }
          }
          break;
        }
        case "rally": {
          // buff friendly creatures in adjacent slots (now or on later reveal)
          for (const adj of [slotIndex - 1, slotIndex + 1]) {
            if (adj < 0 || adj > 2) continue;
            const sl = this.players[pi].slots[adj];
            if (sl && sl.card.kind === "creature") {
              sl.card.mods.genBuff += 1;
              this.note(`${card.name} rallies an adjacent ally (+1 Power).`);
            } else {
              this._pendingRally = this._pendingRally || {};
              const key = pi + ":" + adj;
              this._pendingRally[key] = (this._pendingRally[key] || 0) + 1;
            }
          }
          break;
        }
        case "burn3":
          this.players[oi].health -= 3;
          this.note(`${card.name} burns ${this.players[oi].name} for 3 damage!`);
          this.checkWin();
          break;
        case "net":
          if (oppSlot) { oppSlot.card.mods.nullified = true; this.note(`${card.name} nullifies the opposing card.`); }
          if (oppSlot && this.players[pi].passiveId === "saboteur") oppSlot.card.mods.minus += 1;
          break;
        case "smoke":
          if (oppSlot) { oppSlot.card.mods.halved = true; this.note(`${card.name} halves the opposing card's power.`); }
          if (oppSlot && this.players[pi].passiveId === "saboteur") oppSlot.card.mods.minus += 1;
          break;
        case "bomb":
          if (oppSlot && oppSlot.card.defId === "soldier") {
            oppSlot.card.mods.bombSoldier = true;
            this.note(`${card.name} weakens the opposing Soldier (-25%).`);
          }
          if (oppSlot && this.players[pi].passiveId === "saboteur") {
            oppSlot.card.mods.minus += 1;
            this.note(`Saboteur: extra -1 Power on the opposing card.`);
          }
          break;
        case "trap_minus2":
          if (oppSlot) { oppSlot.card.mods.minus += 2; this.note(`Spike Pit: opposing card -2 Power.`); }
          break;
        case "heal4":
          this.players[pi].health = Math.min(this.players[pi].maxHealth + 4, this.players[pi].health + 4);
          this.note(`${this.players[pi].name} drinks a Healing Draught (+4 Health).`);
          break;
      }
      // apply any pending knight buff to a freshly revealed soldier
      if (card.defId === "soldier" && this._pendingKnight) {
        const key = pi + ":" + slotIndex;
        if (this._pendingKnight[key]) {
          card.mods.soldierBuff += this._pendingKnight[key];
          this.note(`${this.players[pi].name}'s Soldier receives a Knight's buff (+${this._pendingKnight[key]}).`);
          this._pendingKnight[key] = 0;
        }
      }
      if (card.kind === "creature" && this._pendingRally) {
        const key = pi + ":" + slotIndex;
        if (this._pendingRally[key]) {
          card.mods.genBuff += this._pendingRally[key];
          this.note(`${this.players[pi].name}'s ${card.name} is rallied (+${this._pendingRally[key]} Power).`);
          this._pendingRally[key] = 0;
        }
      }
    }

    effectivePower(pi, slot) {
      const card = slot.card;
      if (card.kind !== "creature") {
        // spells/traps contribute 0, unless they have base power
        return 0;
      }
      let pow;
      if (card.ability === "archer") {
        const archers = this.players[pi].slots.filter(s => s && s.card.defId === "archer").length;
        pow = 2 + (archers - 1);
      } else {
        pow = card.basePower;
      }
      pow += card.mods.firstPlaceBonus;
      pow += card.mods.genBuff;
      if (card.defId === "soldier") pow += card.mods.soldierBuff;
      if (card.mods.bombSoldier) pow = Math.floor(pow * 0.75);
      pow -= card.mods.minus;
      if (card.mods.halved) pow = Math.floor(pow / 2);
      if (card.mods.nullified) pow = 0;
      pow = Math.floor(pow);
      return Math.max(0, pow);
    }

    totalPower(pi) {
      return this.players[pi].slots.reduce((sum, s) => sum + (s ? this.effectivePower(pi, s) : 0), 0);
    }

    // Resolve combat. Returns a result object. Does NOT auto-start next round
    // (UI applies powerup choice first via finishRound()).
    resolveCombat() {
      const p0 = this.totalPower(0), p1 = this.totalPower(1);
      this.players[0].lastRoundPower = p0;
      this.players[1].lastRoundPower = p1;

      // per-card power breakdown for the round-end explanation
      const slotBreakdown = pi => this.players[pi].slots.map(sl => sl ? {
        name: sl.card.name, kind: sl.card.kind,
        base: sl.card.basePower, power: this.effectivePower(pi, sl)
      } : null);

      const result = {
        p0Power: p0, p1Power: p1, winner: null, damage: 0, tie: false,
        names: [this.players[0].name, this.players[1].name],
        breakdown: { 0: slotBreakdown(0), 1: slotBreakdown(1) },
        combat: null,
        parity: []
      };

      if (p0 === p1) {
        result.tie = true;
        this.note(`Round tie at ${p0} power. No damage.`);
      } else {
        const wi = p0 > p1 ? 0 : 1, li = wi === 0 ? 1 : 0;
        const diff = Math.abs(p0 - p1);
        const base = this.players[wi].baseDamage;
        const dmg = diff + base;
        const hpBefore = this.players[li].health;
        this.players[li].health -= dmg;
        result.winner = wi; result.loser = li; result.damage = dmg;
        result.combat = {
          winnerName: this.players[wi].name, loserName: this.players[li].name,
          winnerPower: Math.max(p0, p1), loserPower: Math.min(p0, p1),
          diff, baseDamage: base, damage: dmg,
          loserHpBefore: hpBefore, loserHpAfter: this.players[li].health
        };
        this.note(`${this.players[wi].name} wins the round (${Math.max(p0,p1)} vs ${Math.min(p0,p1)}) for ${dmg} damage.`);
      }

      // discard all slot cards, reset mods
      for (const p of this.players) {
        for (const s of p.slots) {
          if (s) { resetMods(s.card); p.discard.push(s.card); }
        }
        p.slots = [null, null, null];
      }
      this._pendingKnight = {};
      this._pendingRally = {};

      // check deaths
      this.checkWin();
      result.over = this.over;
      result.winnerName = this.winner !== null ? this.players[this.winner].name : null;
      return result;
    }

    // winner picks a powerup that applies to next round: 'potion' or 'mana'
    applyWinnerPowerup(pi, choice) {
      if (pi === null || pi === undefined) return;
      const p = this.players[pi];
      if (choice === "potion") {
        p.health = Math.min(p.maxHealth, p.health + 5);
        this.note(`${p.name} takes a Health Potion (+5 Health).`);
      } else if (choice === "mana") {
        p.manaBonus += 5;
        this.note(`${p.name} hoards +5 Mana for next round.`);
      }
      this.checkWin();
    }

    finishRound() {
      if (!this.over) this.startRound();
    }

    checkWin() {
      const dead = this.players.map(p => p.health <= 0);
      if (dead[0] && dead[1]) { this.over = true; this.winner = this.players[0].health >= this.players[1].health ? 0 : 1; }
      else if (dead[0]) { this.over = true; this.winner = 1; }
      else if (dead[1]) { this.over = true; this.winner = 0; }
    }
  }

  const api = { Game, makeCardInstance };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Engine = api;
  root.Engine = api;
})(typeof window !== "undefined" ? window : globalThis);
