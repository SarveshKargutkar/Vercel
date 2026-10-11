"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { configured, ensureSignedIn, rpc, readableError } from "@/lib/supabase";

const NAME_KEY = "mafia:name";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* Set after mount: window is absent during prerender, and reading it in
     render would desync the server and client HTML. */
  const [isLocal, setIsLocal] = useState<boolean | null>(null);

  // Remember the name so a returning player only types a code.
  useEffect(() => {
    try {
      setName(localStorage.getItem(NAME_KEY) ?? "");
    } catch {
      /* private mode */
    }
    const h = window.location.hostname;
    setIsLocal(h === "localhost" || h === "127.0.0.1" || h === "[::1]");
  }, []);

  const remember = (n: string) => {
    try {
      localStorage.setItem(NAME_KEY, n);
    } catch {
      /* private mode */
    }
  };

  async function go(kind: "create" | "join") {
    const n = name.trim();
    if (!n) return setError("Enter your name first.");
    if (kind === "join" && code.trim().length < 4)
      return setError("Enter the 4-letter code.");

    setError(null);
    setBusy(kind);
    try {
      await ensureSignedIn();
      remember(n);
      const result =
        kind === "create"
          ? await rpc<string>("create_room", { p_name: n })
          : await rpc<string>("join_room", {
              p_code: code.trim().toUpperCase(),
              p_name: n,
            });
      router.push(`/room/${result}`);
    } catch (e) {
      setError(readableError(e));
      setBusy(null);
    }
  }

  if (!configured) {
    const seenNames = (process.env.NEXT_PUBLIC_SUPABASE_ENV_SEEN ?? "")
      .split(",")
      .filter(Boolean);
    return (
      <main className="wrap">
        <h1>Mafia</h1>
        <div className="err">
          Not connected to Supabase yet — <code>NEXT_PUBLIC_SUPABASE_URL</code>{" "}
          and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> are missing.
        </div>

        {/* Until we know where we are, show neither set of steps: dev
            instructions on a live site sent people to the wrong place. */}
        {isLocal === true && (
          <div className="card">
            <h2>Running locally</h2>
            <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
              <li>
                Copy <code>.env.local.example</code> to <code>.env.local</code>.
              </li>
              <li>
                Paste your project URL and anon key from Supabase →{" "}
                <b>Project Settings → API</b>.
              </li>
              <li>Restart the dev server.</li>
            </ol>
          </div>
        )}

        {isLocal === false && (
          <div className="card">
            <h2>Deployed site</h2>
            <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
              <li>
                In Vercel → <b>Settings → Environment Variables</b>, add both
                keys with values from Supabase → <b>Project Settings → API</b>.
              </li>
              <li>
                <b>Redeploy.</b> Environment variables are baked in at build
                time, so an existing deployment will not pick them up.
              </li>
              <li>
                In Supabase, enable <b>Authentication → Providers → Anonymous
                sign-ins</b>, and run <code>supabase/schema.sql</code> in the
                SQL editor if you have not yet.
              </li>
            </ol>
          </div>
        )}

        {/* Names only -- never values, since a service-role key can live
            under one of these and must not reach a browser. */}
        <div className="card">
          <h2>What this build saw</h2>
          {seenNames.length ? (
            <>
              <p className="small muted" style={{ marginTop: 0 }}>
                Supabase-related variables present at build time:
              </p>
              <div className="small" style={{ wordBreak: "break-all" }}>
                {seenNames.map((n) => (
                  <div key={n}>
                    <code>{n}</code>
                  </div>
                ))}
              </div>
              <p className="small muted" style={{ marginBottom: 0 }}>
                If your URL and key are in that list under different names, tell
                me the names and I&apos;ll map them.
              </p>
            </>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>
              No Supabase variables were visible at build time at all. If you
              added the integration after the last build, redeploy.
            </p>
          )}
        </div>

        <p className="muted small">Full steps are in the project README.</p>
      </main>
    );
  }

  return (
    <main className="wrap">
      <h1>Mafia</h1>
      <p className="sub">One phone each. No accounts, no setup.</p>

      {error && <div className="err">{error}</div>}

      <div className="card">
        <label htmlFor="name">Your name</label>
        <input
          id="name"
          type="text"
          value={name}
          maxLength={20}
          placeholder="Sam"
          autoComplete="given-name"
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="primary"
          onClick={() => go("create")}
          disabled={busy !== null}
        >
          {busy === "create" ? "Creating…" : "Start a new game"}
        </button>
      </div>

      <div className="card">
        <label htmlFor="code">Joining a friend? Enter their code</label>
        <input
          id="code"
          type="text"
          className="code-input"
          value={code}
          maxLength={4}
          placeholder="XXXX"
          autoCapitalize="characters"
          autoComplete="off"
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
          onKeyDown={(e) => e.key === "Enter" && go("join")}
        />
        <button onClick={() => go("join")} disabled={busy !== null}>
          {busy === "join" ? "Joining…" : "Join game"}
        </button>
      </div>

      <p className="muted small center">
        4 players minimum. Works best with 6 to 10.
      </p>
    </main>
  );
}
