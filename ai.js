/* The Unfolding Battle - AI opponent
 * Greedy heuristic: pick the play that best improves expected power swing
 * given what is currently on the board, respecting mana.
 */
(function (root) {
  function chooseMove(game, pi) {
    const p = game.players[pi];
    const oi = pi === 0 ? 1 : 0;
    const emptySlots = [0, 1, 2].filter(i => !p.slots[i]);
    if (emptySlots.length === 0) return null;
    const affordable = p.hand.filter(c => c.cost <= p.mana);
    if (affordable.length === 0) return null;

    let best = null, bestScore = -Infinity;

    for (const card of affordable) {
      for (const slot of emptySlots) {
        let score = scorePlay(game, pi, oi, card, slot);
        // small efficiency bias: value per mana
        score += card.basePower * 0.1 - card.cost * 0.05;
        if (score > bestScore) { bestScore = score; best = { cardUid: card.uid, slotIndex: slot }; }
      }
    }
    return best;
  }

  function scorePlay(game, pi, oi, card, slot) {
    const oppSlot = game.players[oi].slots[slot];
    let score = card.basePower;

    // Archers scale: reward stacking
    if (card.defId === "archer") {
      const have = game.players[pi].slots.filter(s => s && s.card.defId === "archer").length;
      score += have * 2 + 1;
    }
    // Disruption: more valuable against a strong revealed opponent card
    if (oppSlot) {
      const oppPow = oppSlot.card.basePower;
      if (card.ability === "net") score += oppPow * 1.5;
      if (card.ability === "smoke") score += Math.floor(oppPow / 2) * 1.2;
      if (card.ability === "bomb" && oppSlot.card.defId === "soldier") score += 2;
      if (card.ability === "trap_minus2") score += Math.min(2, oppPow);
    } else {
      // unknown opponent slot: disruption is a gamble, slight discount
      if (["net", "smoke", "bomb", "trap_minus2"].includes(card.ability)) score -= 0.5;
    }
    // Knight wants adjacent soldiers
    if (card.ability === "knight") {
      for (const adj of [slot - 1, slot + 1]) {
        const s = game.players[pi].slots[adj];
        if (s && s.card.defId === "soldier") score += 0.5;
      }
      const soldiersInHand = game.players[pi].hand.filter(c => c.defId === "soldier").length;
      score += soldiersInHand * 0.3;
    }
    if (card.ability === "heal4" && game.players[pi].health < game.players[pi].maxHealth) score += 3;
    return score;
  }

  const api = { chooseMove };
  if (typeof module !== "undefined") module.exports = api;
  root.AI = api;
})(typeof window !== "undefined" ? window : globalThis);
