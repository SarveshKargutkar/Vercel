"use client";

import { useEffect, useState } from "react";
import type { Room } from "@/lib/types";

/** What the game deals if the host leaves it alone. */
export function suggested(playerCount: number) {
  return {
    mafia: Math.max(1, Math.floor(playerCount / 4)),
    detective: 1,
    doctor: playerCount >= 5 ? 1 : 0,
  };
}

/**
 * Three steppers in the lobby. Villagers are shown as a derived number rather
 * than a fourth control, because they are whatever is left over -- making them
 * editable would just be a second way to express the same thing.
 */
export default function RoleSetup({
  room,
  playerCount,
  canEdit,
  onChange,
}: {
  room: Room;
  playerCount: number;
  canEdit: boolean;
  onChange: (m: number, d: number, k: number) => Promise<unknown>;
}) {
  const [mafia, setMafia] = useState(room.cfg_mafia ?? 1);
  const [det, setDet] = useState(room.cfg_detective ?? 1);
  const [doc, setDoc] = useState(room.cfg_doctor ?? 1);
  const [busy, setBusy] = useState(false);

  // Follow the server when another device changes it (or on first load).
  useEffect(() => {
    if (busy) return;
    setMafia(room.cfg_mafia ?? 1);
    setDet(room.cfg_detective ?? 1);
    setDoc(room.cfg_doctor ?? 1);
  }, [room.cfg_mafia, room.cfg_detective, room.cfg_doctor, busy]);

  const special = mafia + det + doc;
  const villagers = Math.max(0, playerCount - special);
  const tooMany = playerCount >= 4 && special > playerCount;
  const tooMuchMafia = playerCount >= 4 && mafia * 2 >= playerCount;

  async function push(m: number, d: number, k: number) {
    setMafia(m);
    setDet(d);
    setDoc(k);
    setBusy(true);
    try {
      await onChange(m, d, k);
    } catch {
      /* the effect above will snap back to the server's values */
    } finally {
      setBusy(false);
    }
  }

  const rows: [string, number, (n: number) => void, number][] = [
    ["Mafia", mafia, (n) => push(n, det, doc), 1],
    ["Detective", det, (n) => push(mafia, n, doc), 0],
    ["Doctor", doc, (n) => push(mafia, det, n), 0],
  ];

  return (
    <div className="card">
      <h2>Roles</h2>
      {rows.map(([label, value, set, min]) => (
        <div className="stepper" key={label}>
          <span className="stepper-label">{label}</span>
          <div className="stepper-controls">
            <button
              type="button"
              aria-label={`One fewer ${label}`}
              disabled={!canEdit || value <= min}
              onClick={() => set(value - 1)}
            >
              −
            </button>
            <span className="stepper-value" aria-live="polite">
              {value}
            </span>
            <button
              type="button"
              aria-label={`One more ${label}`}
              disabled={!canEdit || value >= 6}
              onClick={() => set(value + 1)}
            >
              +
            </button>
          </div>
        </div>
      ))}

      <div className="stepper">
        <span className="stepper-label muted">Villagers</span>
        <span className="stepper-value muted">{villagers}</span>
      </div>

      {tooMuchMafia && (
        <p className="small" style={{ color: "var(--danger)", marginBottom: 0 }}>
          Mafia must be fewer than half the players, or they win immediately.
        </p>
      )}
      {tooMany && !tooMuchMafia && (
        <p className="small" style={{ color: "var(--danger)", marginBottom: 0 }}>
          That&apos;s {special} special roles for {playerCount} players.
        </p>
      )}
      {!canEdit && (
        <p className="muted small" style={{ marginBottom: 0 }}>
          The host sets these.
        </p>
      )}
    </div>
  );
}
