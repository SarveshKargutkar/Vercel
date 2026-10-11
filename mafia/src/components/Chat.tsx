"use client";

import { useEffect, useRef, useState } from "react";
import type { Message, Player } from "@/lib/types";

export default function Chat({
  channel,
  messages,
  players,
  canSend,
  onSend,
}: {
  channel: "day" | "mafia";
  messages: Message[];
  players: Player[];
  canSend: boolean;
  onSend: (body: string) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const mine = messages.filter((m) => m.channel === channel);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "?";

  // Keep the newest message in view without yanking the whole page.
  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mine.length]);

  async function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    try {
      await onSend(body);
    } catch {
      setDraft(body); // put it back rather than silently losing it
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card">
      <h2>{channel === "mafia" ? "Mafia only" : "Town chat"}</h2>
      <div className={`chat ${channel === "mafia" ? "chat-mafia" : ""}`} ref={boxRef}>
        {mine.length === 0 && (
          <p className="muted small" style={{ margin: 0 }}>
            {channel === "mafia"
              ? "Agree on a target here. Only mafia can read this."
              : "No messages yet."}
          </p>
        )}
        {mine.map((m) => (
          <div className="msg" key={m.id}>
            <b>{nameOf(m.player_id)}</b> {m.body}
          </div>
        ))}
      </div>
      {canSend && (
        <div className="chatbar">
          <input
            type="text"
            value={draft}
            maxLength={300}
            placeholder="Say something…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button onClick={submit} disabled={sending || !draft.trim()}>
            Send
          </button>
        </div>
      )}
    </div>
  );
}
