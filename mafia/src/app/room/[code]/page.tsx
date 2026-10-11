"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useGame } from "@/lib/useGame";
import { useNarrator } from "@/lib/useNarrator";
import { readableError } from "@/lib/supabase";
import { ROLE_LABEL, actsAtNight, instruction } from "@/lib/types";
import PlayerGrid from "@/components/PlayerGrid";
import RoleSetup from "@/components/RoleSetup";
import Chat from "@/components/Chat";

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();
  const router = useRouter();
  const g = useGame(code);
  const [picked, setPicked] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const alive = g.players.filter((p) => p.alive);
  const phase = g.room?.phase ?? "lobby";
  const amAlive = g.me?.alive ?? false;
  /* Narration runs on the host's device only, so the table hears one voice. */
  const narrator = useNarrator(g.events, g.isHost);

  /* Live vote tally for the current day. */
  const tallies = useMemo(() => {
    if (!g.room) return {};
    const t: Record<string, number> = {};
    for (const v of g.votes) if (v.day === g.room.day) t[v.target] = (t[v.target] ?? 0) + 1;
    return t;
  }, [g.votes, g.room]);

  async function run(fn: () => Promise<unknown>) {
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(readableError(e));
    }
  }

  if (g.loading) {
    return (
      <main className="wrap center">
        <p className="muted" style={{ marginTop: 80 }}>
          Connecting…
        </p>
      </main>
    );
  }

  if (g.error || !g.room) {
    return (
      <main className="wrap">
        <h1>Mafia</h1>
        <div className="err">{g.error ?? "Room not found."}</div>
        <button onClick={() => router.push("/")}>Back</button>
      </main>
    );
  }

  /* Not a member (e.g. opened the link without joining). */
  if (!g.me) {
    return (
      <main className="wrap">
        <h1>Mafia</h1>
        <div className="err">
          You&apos;re not in this game. Go back and join with the code{" "}
          <b>{code}</b>.
        </div>
        <button onClick={() => router.push("/")}>Back</button>
      </main>
    );
  }

  const banner =
    phase === "night"
      ? "phase-night"
      : phase === "day" || phase === "dawn"
        ? "phase-day"
        : phase === "vote"
          ? "phase-vote"
          : "phase-ended";

  const iPickTonight = phase === "night" && amAlive && actsAtNight(g.role);
  const iVote = phase === "vote" && amAlive;
  const selectable = iPickTonight || iVote;

  return (
    <main className="wrap">
      <div className="topbar">
        <span className="code-chip" aria-label={`Room code ${g.room.code}`}>
          {g.room.code}
        </span>
        {g.secondsLeft !== null && phase !== "ended" && phase !== "lobby" && (
          <span className={`timer ${g.secondsLeft <= 10 ? "low" : ""}`}>
            {g.secondsLeft}s
          </span>
        )}
      </div>

      {actionError && <div className="err">{actionError}</div>}

      {/* ---------------- LOBBY ---------------- */}
      {phase === "lobby" && (
        <>
          <div className="phase-banner phase-ended">
            <p className="instruction">
              {g.isHost
                ? alive.length < 4
                  ? `Need ${4 - alive.length} more to start.`
                  : "Everyone in? Start the game."
                : "Waiting for the host to start."}
            </p>
            <p className="muted small" style={{ margin: "6px 0 0" }}>
              Tell your friends the code <b>{g.room.code}</b>.
            </p>
          </div>

          <div className="card">
            <h2>Players ({g.players.length})</h2>
            <PlayerGrid players={g.players} meId={g.me.id} selectable={false} />
          </div>

          <RoleSetup
            room={g.room}
            playerCount={g.players.length}
            canEdit={g.isHost}
            onChange={(m, d, k) => g.act.setRoles(m, d, k)}
          />

          {g.isHost && narrator.supported && (
            <div className="card narrator">
              <div>
                <b>Narrator voice</b>
                <div className="muted small">
                  Reads the story aloud on this phone only.
                </div>
              </div>
              <button
                className={narrator.on ? "live" : ""}
                onClick={narrator.toggle}
                aria-pressed={narrator.on}
              >
                {narrator.on ? "On" : "Off"}
              </button>
            </div>
          )}

          {g.isHost ? (
            <button
              className="primary"
              disabled={g.players.length < 4}
              onClick={() => run(g.act.start)}
            >
              Start game
            </button>
          ) : (
            <button
              className="ghost danger"
              onClick={() => run(async () => {
                await g.act.leave();
                router.push("/");
              })}
            >
              Leave
            </button>
          )}
        </>
      )}

      {/* ---------------- IN PLAY ---------------- */}
      {phase !== "lobby" && (
        <>
          <div className={`phase-banner ${banner}`}>
            <p className="instruction">
              {instruction(phase, g.role, amAlive)}
            </p>
            <p className="muted small" style={{ margin: "6px 0 0" }}>
              {phase === "ended"
                ? g.room.winner === "mafia"
                  ? "The mafia win."
                  : "The village wins."
                : `${phase === "night" ? "Night" : "Day"} ${g.room.day} · ${alive.length} still in`}
            </p>
          </div>

          {/* Your role, always visible so nobody has to remember it. */}
          {g.role && phase !== "ended" && (
            <div className={`card role ${g.role}`}>
              <div className="muted small">You are</div>
              <div className="rname">{ROLE_LABEL[g.role]}</div>
            </div>
          )}

          {/* Anything addressed privately to you: role brief, detective results. */}
          {g.results.length > 0 && phase !== "ended" && (
            <div className="card">
              <h2>Just for you</h2>
              {g.results.map((r) => (
                <div className="note" key={r.id}>
                  {r.body}
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <h2>
              {iVote ? "Vote someone out" : iPickTonight ? "Choose a target" : "Players"}
            </h2>
            <PlayerGrid
              players={g.players}
              meId={g.me.id}
              selectable={selectable}
              selectedId={picked}
              tallies={phase === "vote" ? tallies : undefined}
              onPick={(id) => {
                setPicked(id);
                run(() => (iVote ? g.act.vote(id) : g.act.night(id)));
              }}
            />
            {selectable && (
              <p className="muted small" style={{ margin: "10px 0 0" }}>
                {picked
                  ? "Locked in — tap someone else to change your mind."
                  : "Tap a name."}
              </p>
            )}
            {phase === "night" && !actsAtNight(g.role) && amAlive && (
              <p className="muted small" style={{ margin: "10px 0 0" }}>
                Nothing to do tonight. Back at dawn.
              </p>
            )}
          </div>

          {/* Chat: mafia get their own channel at night. */}
          {phase !== "ended" &&
            (phase === "night" && g.role === "mafia" ? (
              <Chat
                channel="mafia"
                messages={g.messages}
                players={g.players}
                canSend={amAlive}
                onSend={(b) => g.act.say("mafia", b)}
              />
            ) : phase === "day" || phase === "vote" ? (
              <Chat
                channel="day"
                messages={g.messages}
                players={g.players}
                canSend={amAlive}
                onSend={(b) => g.act.say("day", b)}
              />
            ) : null)}

          <div className="card">
            <div className="narrator" style={{ marginBottom: 10 }}>
              <h2 style={{ margin: 0 }}>What happened</h2>
              {g.isHost && narrator.supported && (
                <button
                  className={narrator.on ? "live" : ""}
                  onClick={narrator.toggle}
                  aria-pressed={narrator.on}
                  aria-label="Narrator voice"
                >
                  {narrator.on ? "🔊 Narrating" : "🔇 Narrator off"}
                </button>
              )}
            </div>
            <div className="log">
              {g.events.slice(-14).map((e) => (
                <div key={e.id}>{e.body}</div>
              ))}
            </div>
          </div>

          {phase === "ended" ? (
            <button className="primary" onClick={() => router.push("/")}>
              New game
            </button>
          ) : (
            g.isHost && (
              <button className="ghost" onClick={() => run(g.act.skip)}>
                Skip ahead
              </button>
            )
          )}
        </>
      )}
    </main>
  );
}
