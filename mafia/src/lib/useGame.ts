"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, rpc, ensureSignedIn, readableError } from "./supabase";
import type {
  GameEvent,
  Message,
  Player,
  PrivateResult,
  Role,
  Room,
  Vote,
} from "./types";

/**
 * All live state for one room.
 *
 * Phase transitions are deliberately not driven from here. Each client simply
 * calls advance_phase() once its local clock passes the deadline; the function
 * re-checks the deadline server-side and is idempotent, so whichever client
 * fires first wins and the rest are no-ops. The upshot is that the game keeps
 * moving even if the host backgrounds their phone -- no server cron needed.
 */
export function useGame(code: string) {
  const [userId, setUserId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [results, setResults] = useState<PrivateResult[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);

  const roomRef = useRef<Room | null>(null);
  roomRef.current = room;
  const advancing = useRef(false);

  /* ---------- initial load ---------- */
  const load = useCallback(async () => {
    const r = await supabase.from("rooms").select("*").eq("code", code).maybeSingle();
    if (r.error || !r.data) {
      // Rooms are member-readable only, so an empty result means either the
      // code is wrong or this device has not joined. We cannot tell which,
      // and saying so beats guessing.
      setError(
        "Can't open this game. Either the code is wrong, or you haven't joined it on this device yet.",
      );
      setLoading(false);
      return;
    }
    const rm = r.data as Room;
    setRoom(rm);

    const [ps, ev, pr, vt, ms] = await Promise.all([
      supabase.from("players").select("*").eq("room_id", rm.id).order("seat"),
      supabase.from("events").select("*").eq("room_id", rm.id).order("id"),
      supabase.from("private_results").select("*").eq("room_id", rm.id).order("id"),
      supabase.from("votes").select("voter,target,day").eq("room_id", rm.id),
      supabase.from("messages").select("*").eq("room_id", rm.id).order("id"),
    ]);
    setPlayers((ps.data ?? []) as Player[]);
    setEvents((ev.data ?? []) as GameEvent[]);
    setResults((pr.data ?? []) as PrivateResult[]);
    setVotes((vt.data ?? []) as Vote[]);
    setMessages((ms.data ?? []) as Message[]);

    // my_role() returns null in the lobby; that is expected, not an error
    try {
      setRole((await rpc<Role | null>("my_role", { p_room: rm.id })) ?? null);
    } catch {
      setRole(null);
    }
    setLoading(false);
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await ensureSignedIn();
        if (cancelled) return;
        setUserId(id);
        await load();
      } catch (e) {
        if (!cancelled) {
          setError(readableError(e));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  /* ---------- realtime ---------- */
  useEffect(() => {
    if (!room?.id) return;
    const id = room.id;

    const ch = supabase
      .channel(`room:${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${id}` },
        (p) => setRoom(p.new as Room),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${id}` },
        (p) => {
          if (p.eventType === "DELETE") {
            setPlayers((cur) => cur.filter((x) => x.id !== (p.old as Player).id));
            return;
          }
          const np = p.new as Player;
          setPlayers((cur) => {
            const next = cur.filter((x) => x.id !== np.id).concat(np);
            return next.sort((a, b) => a.seat - b.seat);
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events", filter: `room_id=eq.${id}` },
        (p) => setEvents((cur) => [...cur, p.new as GameEvent]),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "private_results",
          filter: `room_id=eq.${id}`,
        },
        (p) => setResults((cur) => [...cur, p.new as PrivateResult]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes", filter: `room_id=eq.${id}` },
        () => {
          supabase
            .from("votes")
            .select("voter,target,day")
            .eq("room_id", id)
            .then(({ data }) => setVotes((data ?? []) as Vote[]));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${id}` },
        (p) => setMessages((cur) => [...cur, p.new as Message]),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [room?.id]);

  /* ---------- roles land when the game starts ---------- */
  const phase = room?.phase;
  useEffect(() => {
    if (!room?.id || phase === "lobby") return;
    rpc<Role | null>("my_role", { p_room: room.id })
      .then((r) => setRole(r ?? null))
      .catch(() => {});
  }, [room?.id, phase]);

  /* ---------- clock + lazy phase advance ---------- */
  useEffect(() => {
    const t = setInterval(async () => {
      setNow(Date.now());
      const rm = roomRef.current;
      if (!rm || !rm.phase_ends_at) return;
      if (rm.phase === "lobby" || rm.phase === "ended") return;
      if (Date.now() < new Date(rm.phase_ends_at).getTime()) return;
      if (advancing.current) return;
      advancing.current = true;
      try {
        await rpc("advance_phase", { p_room: rm.id });
      } catch {
        /* another client got there first */
      } finally {
        // brief cooldown so a slow round-trip cannot stack calls
        setTimeout(() => (advancing.current = false), 1500);
      }
    }, 1000);
    return () => clearInterval(t);
  }, []);

  /* ---------- presence heartbeat ---------- */
  useEffect(() => {
    if (!room?.id) return;
    const id = room.id;
    const beat = () => rpc("touch", { p_room: id }).catch(() => {});
    beat();
    const t = setInterval(beat, 20000);
    return () => clearInterval(t);
  }, [room?.id]);

  const me = players.find((p) => p.user_id === userId) ?? null;
  const secondsLeft = room?.phase_ends_at
    ? Math.max(0, Math.ceil((new Date(room.phase_ends_at).getTime() - now) / 1000))
    : null;

  const act = {
    start: () => rpc("start_game", { p_room: room!.id }),
    night: (target: string) =>
      rpc("submit_night_action", { p_room: room!.id, p_target: target }),
    vote: (target: string) => rpc("cast_vote", { p_room: room!.id, p_target: target }),
    skip: () => rpc("advance_phase", { p_room: room!.id }),
    leave: () => rpc("leave_room", { p_room: room!.id }),
    say: (channel: "day" | "mafia", body: string) =>
      rpc("send_message", { p_room: room!.id, p_channel: channel, p_body: body }),
  };

  return {
    loading,
    error,
    room,
    players,
    events,
    results,
    votes,
    messages,
    role,
    me,
    userId,
    secondsLeft,
    isHost: !!room && !!userId && room.host_user === userId,
    act,
    reload: load,
  };
}
