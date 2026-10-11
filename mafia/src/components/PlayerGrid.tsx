"use client";

import type { Player } from "@/lib/types";

/**
 * The only interactive surface during night and voting. Deliberately one
 * control type: a player is a big button, and tapping it is the whole action.
 */
export default function PlayerGrid({
  players,
  meId,
  selectable,
  selectedId,
  onPick,
  tallies,
}: {
  players: Player[];
  meId?: string | null;
  selectable: boolean;
  selectedId?: string | null;
  onPick?: (id: string) => void;
  /** player id -> number of votes against them */
  tallies?: Record<string, number>;
}) {
  return (
    <div className="players">
      {players.map((p) => {
        const isMe = p.id === meId;
        const canTap = selectable && p.alive && !isMe;
        const votes = tallies?.[p.id] ?? 0;

        // Mafia learn their partners from a private note the server sends,
        // never from anything rendered into every player's roster.
        const meta = !p.alive ? "out" : isMe ? "you" : `seat ${p.seat}`;

        return (
          <button
            key={p.id}
            className={[
              "player",
              !p.alive && "dead",
              isMe && "you",
              selectedId === p.id && "selected",
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={!canTap}
            onClick={() => canTap && onPick?.(p.id)}
            aria-pressed={selectedId === p.id}
          >
            <span className="pname">{p.name}</span>
            <span className="pmeta">{meta}</span>
            {votes > 0 && (
              <span className="tally" aria-label={`${votes} votes`}>
                {votes}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
