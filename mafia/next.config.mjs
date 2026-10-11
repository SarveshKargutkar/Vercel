/**
 * The Vercel Supabase integration names its variables unpredictably: it may
 * prefix them with the integration's own label (NEXT_PUBLIC_MAFIASUPABASE_URL),
 * use the plain names, or use the newer "publishable key" wording. Anything
 * without the NEXT_PUBLIC_ prefix is server-only in Next.js and invisible to
 * the browser, so we resolve whatever exists at build time and re-export it
 * under the public names the client reads.
 */

/** Never expose these to the browser, whatever they happen to be called. */
const SECRET = /SERVICE_ROLE|SECRET|JWT_SECRET|PASSWORD|POSTGRES/i;

const env = process.env;

const exact = (...names) => {
  for (const n of names) {
    const v = env[n];
    if (v && v.trim()) return v.trim();
  }
  return "";
};

/** Last resort: find a variable by shape rather than by exact name. */
const byPattern = (test) => {
  for (const k of Object.keys(env).sort()) {
    if (SECRET.test(k)) continue;
    const v = env[k];
    if (v && v.trim() && test(k, v.trim())) return v.trim();
  }
  return "";
};

const url =
  exact(
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_MAFIASUPABASE_URL",
    "SUPABASE_URL",
  ) || byPattern((k, v) => /SUPABASE.*URL$/i.test(k) && /^https:\/\//.test(v));

const key =
  exact(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_MAFIASUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_MAFIASUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
  ) ||
  byPattern(
    (k, v) =>
      /SUPABASE.*(ANON|PUBLISHABLE).*KEY$/i.test(k) &&
      (v.startsWith("eyJ") || v.startsWith("sb_publishable_")),
  );

/**
 * Names only, never values: if resolution still fails, the page can show which
 * Supabase-ish variables the build actually saw, without leaking any of them.
 */
const seen = Object.keys(env)
  .filter((k) => /SUPABASE|POSTGRES/i.test(k))
  .sort()
  .join(",");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: key,
    NEXT_PUBLIC_SUPABASE_ENV_SEEN: seen,
  },
};

export default nextConfig;
