"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameEvent } from "./types";

const PREF_KEY = "mafia:narrate";

/**
 * Reads the public event log aloud on one device — the host's, so the table
 * hears a single narrator rather than a chorus of phones.
 *
 * Only `events` rows are ever spoken. Those are the same lines every player
 * can already read; private_results (roles, detective findings) are never
 * passed in, because the host is usually sitting with everyone else.
 */
export function useNarrator(events: GameEvent[], enabled: boolean) {
  const [on, setOn] = useState(false);
  const [supported, setSupported] = useState(false);
  /** Events present before narration started: history, not news. */
  const spokenUpTo = useRef<number>(-1);
  const primed = useRef(false);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" && "speechSynthesis" in window;
    setSupported(ok);
    if (!ok) return;
    try {
      setOn(localStorage.getItem(PREF_KEY) === "1");
    } catch {
      /* private mode */
    }
  }, []);

  const speak = useCallback((text: string) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      u.pitch = 0.9;
      window.speechSynthesis.speak(u);
    } catch {
      /* a failed line is not worth interrupting the game for */
    }
  }, []);

  /**
   * Safari and Chrome on iOS refuse to speak unless the first utterance comes
   * from a user gesture, so the toggle itself does the priming.
   */
  const toggle = useCallback(() => {
    if (!supported) return;
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem(PREF_KEY, next ? "1" : "0");
    } catch {
      /* private mode */
    }
    if (next) {
      primed.current = true;
      speak("Narrator on.");
    } else {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* nothing queued */
      }
    }
  }, [on, supported, speak]);

  // Never replay the backlog: jump the marker to the newest event whenever
  // narration is off, so switching on mid-game starts from here.
  useEffect(() => {
    if (on && primed.current) return;
    spokenUpTo.current = events.length ? events[events.length - 1].id : -1;
  }, [on, events]);

  useEffect(() => {
    if (!on || !enabled || !supported || !primed.current) return;
    const fresh = events.filter((e) => e.id > spokenUpTo.current);
    if (!fresh.length) return;
    spokenUpTo.current = fresh[fresh.length - 1].id;
    for (const e of fresh) speak(e.body);
  }, [events, on, enabled, supported, speak]);

  // Stop talking if the page goes away mid-sentence.
  useEffect(
    () => () => {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* nothing queued */
      }
    },
    [],
  );

  return { on, supported, toggle };
}
