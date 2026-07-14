/* The Unfolding Battle - data definitions
 * Heroes, passive powers, and card definitions.
 */

const HEROES = {
  stalwart: {
    id: "stalwart",
    name: "The Stalwart Defender",
    health: 20,
    baseDamage: 2,
    flavor: "A balanced and resilient leader, strong in sustained battles."
  },
  aggressive: {
    id: "aggressive",
    name: "The Aggressive Tactician",
    health: 16,
    baseDamage: 3,
    flavor: "Favors swift, decisive strikes, aiming to overwhelm opponents quickly."
  },
  berserker: {
    id: "berserker",
    name: "The Berserker",
    health: 14,
    baseDamage: 4,
    flavor: "A glass cannon — fragile, but every blow lands like thunder."
  }
};

/* Passive powers chosen at game start.
 * Each has an `onRoundStart(game, player)` and/or descriptive effect.
 */
const PASSIVES = {
  warlord: {
    id: "warlord",
    name: "Warlord's Fury",
    desc: "Aggressive. The first card you place each round gains +1 Power.",
    flavor: "Strike first, strike hard."
  },
  quartermaster: {
    id: "quartermaster",
    name: "Quartermaster",
    desc: "Resource-focused. Start each round with +1 Mana (6 total).",
    flavor: "An army marches on its supplies."
  },
  medic: {
    id: "medic",
    name: "Field Medic",
    desc: "Sustain. Heal 2 Health at the start of every round.",
    flavor: "No soldier left to bleed."
  },
  saboteur: {
    id: "saboteur",
    name: "Saboteur",
    desc: "Disruptive. Your Net/Smoke/Bomb cards also weaken the opposing card by an extra -1 Power.",
    flavor: "A blade in the dark is worth two in the field."
  },
  tactician: {
    id: "tactician",
    name: "Tactician",
    desc: "Flexible. Start each round with an extra card in hand (hand of 6).",
    flavor: "Knowledge is the sharpest weapon."
  }
};

/* Card definitions. `kind` is creature | trap | spell.
 * Ability hooks are resolved in game.js by `ability` id.
 */
const CARD_DEFS = {
  soldier: {
    id: "soldier", name: "Soldier", kind: "creature", power: 1, cost: 1,
    text: "A basic, reliable fighting unit.", ability: null
  },
  knight: {
    id: "knight", name: "Knight", kind: "creature", power: 2, cost: 2,
    text: "Battlecry: friendly Soldiers in adjacent slots gain +0.5 Power (even if revealed later).",
    ability: "knight"
  },
  archer: {
    id: "archer", name: "Archer", kind: "creature", power: 2, cost: 2,
    text: "Power = 2 + (number of your Archers in line - 1). They multiply in a volley.",
    ability: "archer"
  },
  catapult: {
    id: "catapult", name: "Catapult", kind: "creature", power: 4, cost: 3,
    text: "A powerful siege engine, slow but devastating.", ability: null
  },
  net_thrower: {
    id: "net_thrower", name: "Net Thrower", kind: "creature", power: 0, cost: 1,
    text: "Battlecry: the opposing card's Power is nullified (set to 0) this round.",
    ability: "net"
  },
  smoke_bomb: {
    id: "smoke_bomb", name: "Smoke Bomb Launcher", kind: "creature", power: 1, cost: 2,
    text: "Battlecry: the opposing card's Power is halved (rounded down).",
    ability: "smoke"
  },
  bomb_launcher: {
    id: "bomb_launcher", name: "Bomb Launcher", kind: "creature", power: 2, cost: 2,
    text: "Battlecry: if the opposing card is a Soldier, it loses 25% of its Power (rounded down).",
    ability: "bomb"
  },
  // Reward-pool cards (PvC progression)
  spike_pit: {
    id: "spike_pit", name: "Spike Pit", kind: "trap", power: 0, cost: 1,
    text: "Trap: when revealed, the opposing card loses 2 Power this round.",
    ability: "trap_minus2"
  },
  healing_draught: {
    id: "healing_draught", name: "Healing Draught", kind: "spell", power: 0, cost: 1,
    text: "When revealed, restore 4 Health to you.",
    ability: "heal4"
  },
  pikeman: {
    id: "pikeman", name: "Pikeman", kind: "creature", power: 2, cost: 1,
    text: "A steadfast spear, cheap and dependable.", ability: null
  },
  cavalry: {
    id: "cavalry", name: "Cavalry", kind: "creature", power: 3, cost: 2,
    text: "A swift heavy charge that hits hard.", ability: null
  },
  shield_maiden: {
    id: "shield_maiden", name: "Shield Maiden", kind: "creature", power: 1, cost: 2,
    text: "Battlecry: friendly cards in adjacent slots gain +1 Power (even if revealed later).",
    ability: "rally"
  },
  fireball: {
    id: "fireball", name: "Fireball", kind: "spell", power: 0, cost: 2,
    text: "When revealed, deal 3 damage directly to the enemy hero.",
    ability: "burn3"
  },
  frost_trap: {
    id: "frost_trap", name: "Frost Trap", kind: "trap", power: 0, cost: 1,
    text: "Trap: when revealed, the opposing card's Power is halved (rounded down).",
    ability: "smoke"
  }
};

// Predefined starting 9-card deck for v1.
const STARTING_DECK = [
  "soldier", "soldier", "soldier",
  "knight",
  "archer", "archer",
  "catapult",
  "net_thrower",
  "smoke_bomb"
];

// Cards offered as rewards after a PvC win.
const REWARD_POOL = {
  creature: ["bomb_launcher", "catapult", "knight", "archer", "pikeman", "cavalry", "shield_maiden"],
  trap: ["spike_pit", "frost_trap"],
  utility: ["healing_draught", "net_thrower", "smoke_bomb", "fireball"]
};


// ===== Campaign: 7 scaling levels (opponent hero + passive + stat bonuses) =====
const CAMPAIGN = [
  { level: 1, name: "Gate Sentry",      heroId: "stalwart",   passiveId: "quartermaster", hpBonus: 0,  dmgBonus: 0, manaPerRound: 0,
    blurb: "A green recruit guarding the gate." },
  { level: 2, name: "Watch Captain",    heroId: "stalwart",   passiveId: "warlord",       hpBonus: 2,  dmgBonus: 0, manaPerRound: 0,
    blurb: "Leads the first card in with force." },
  { level: 3, name: "Field Surgeon",    heroId: "aggressive", passiveId: "medic",         hpBonus: 4,  dmgBonus: 0, manaPerRound: 0,
    blurb: "Mends wounds between clashes." },
  { level: 4, name: "Shadow Agent",     heroId: "aggressive", passiveId: "saboteur",      hpBonus: 6,  dmgBonus: 0, manaPerRound: 0,
    blurb: "Strikes from the dark, weakening your line." },
  { level: 5, name: "Grand Tactician",  heroId: "stalwart",   passiveId: "tactician",     hpBonus: 8,  dmgBonus: 1, manaPerRound: 0,
    blurb: "Draws extra cards and out-plans you." },
  { level: 6, name: "Berserker Lord",   heroId: "berserker",  passiveId: "warlord",       hpBonus: 10, dmgBonus: 1, manaPerRound: 1,
    blurb: "Hits like a landslide, and fast." },
  { level: 7, name: "The Unfolding King", heroId: "berserker", passiveId: "saboteur",     hpBonus: 14, dmgBonus: 2, manaPerRound: 1,
    blurb: "The final foe \u2014 brutal, cunning, and rich in mana." }
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { HEROES, PASSIVES, CARD_DEFS, STARTING_DECK, REWARD_POOL, CAMPAIGN };
}
if (typeof window !== "undefined") {
  Object.assign(window, { HEROES, PASSIVES, CARD_DEFS, STARTING_DECK, REWARD_POOL, CAMPAIGN });
}
