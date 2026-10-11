import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when the app has been pointed at a Supabase project. */
export const configured = Boolean(url && key && !url.includes("YOUR-PROJECT"));

export const supabase = createClient(url ?? "http://localhost", key ?? "anon", {
  auth: { persistSession: true, autoRefreshToken: true },
});

/**
 * Players never make an account. Anonymous sign-in still gives each device a
 * real auth.uid(), which is what the row level security policies key off and
 * what lets someone rejoin after closing the tab.
 */
export async function ensureSignedIn() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return anon.user?.id ?? null;
}

/**
 * Turns whatever went wrong into a sentence a player can act on. Postgres
 * raises arrive prefixed with context we don't want on screen, and a dropped
 * connection surfaces as the browser's bare "Failed to fetch".
 */
export function readableError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  if (/failed to fetch|networkerror|load failed/i.test(raw))
    return "Can't reach the server. Check your connection and try again.";
  if (/jwt|not signed in|session/i.test(raw))
    return "Your session expired. Reload the page.";
  if (/anonymous.*disabled|signups? not allowed/i.test(raw))
    return "Anonymous sign-in is turned off in Supabase. Enable it under Authentication → Providers.";
  return raw.replace(/^.*?:\s*/, "") || "Something went wrong.";
}

/** Unwraps a Postgres function call, surfacing its message as a plain Error. */
export async function rpc<T = unknown>(
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
