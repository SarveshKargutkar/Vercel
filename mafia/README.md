# Mafia

Real-time Mafia for a group with phones. One phone each, no accounts, no setup
for players — the host shares a 4-letter code and everyone taps in.

Next.js (App Router) on Vercel, Supabase for data and realtime.

## How a game runs

1. Host taps **Start a new game** and reads out the 4-letter code.
2. Everyone else enters the code and their name.
3. Host starts once 4+ players are in. Roles are dealt secretly.
4. **Night** (40s) — mafia pick a target, detective investigates, doctor
   protects. Everyone else waits.
5. **Dawn** (8s) — the town learns who, if anyone, died.
6. **Day** (120s) — argue.
7. **Vote** (40s) — tap a name. Most votes is eliminated and their role is
   revealed. A tie eliminates nobody.
8. Repeat until the mafia are all gone (village wins) or the mafia equal the
   rest (mafia win).

Roles: **Mafia**, **Detective**, **Doctor**, **Villager**. One mafioso per four
players; the doctor appears at 5+.

## Setup

### 1. Create a Supabase project

At [supabase.com](https://supabase.com), create a project. Then:

- **SQL Editor → New query** → paste all of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
- **Authentication → Providers → Anonymous sign-ins** → enable.

  Players never make an account, but anonymous sign-in still gives each device
  a real `auth.uid()`, which is what the security policies key off and what
  lets someone rejoin after closing the tab.

### 2. Point the app at it

```bash
cp .env.local.example .env.local
```

Fill in both values from **Project Settings → API**:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The anon key is meant to be public — it is safe in the browser, because every
rule is enforced by row level security in the database rather than by the client.

### 3. Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. To test properly, open it in several browser
profiles or incognito windows — each window is a separate player, since
identity is per-browser-session.

### 4. Deploy

Push the repo, then on Vercel: **New Project → import the repo → set Root
Directory to `mafia`**. Add the same two environment variables. Deploy.

Add your Vercel URL to **Supabase → Authentication → URL Configuration → Site
URL** so auth redirects resolve.

## How the secrecy works

Mafia only works if players can't see each other's roles. Three things enforce
that, and they matter more than anything in the UI:

1. **No game logic in the browser.** Every action is a `SECURITY DEFINER`
   Postgres function — `start_game`, `submit_night_action`, `cast_vote`,
   `advance_phase`. There are no insert or update policies on any game table, so
   a hostile client can't write anything the rules don't allow.
2. **Row level security on reads.** You can select exactly one row from `roles`:
   yours. Mafia chat is readable only if your role is mafia. Detective findings
   go to a `private_results` row addressed to one player.
3. **Secrets aren't published to realtime.** `roles` and `night_actions` are
   deliberately left out of the realtime publication. A policy mistake on a
   published table would broadcast to every subscriber; leaving them unpublished
   means there's no channel to leak down in the first place.

## Phase timing

Each phase stores a `phase_ends_at` timestamp. Clients poll their own clock and
call `advance_phase()` once it passes; the function re-checks the deadline
server-side and is idempotent under a row lock, so whichever client fires first
wins and the rest are no-ops.

The practical payoff: the game keeps moving even if the host backgrounds their
phone, and it needs no cron job or always-on server. The host also gets a
**Skip ahead** button to cut a phase short.

## Changing the pace

Phase lengths are one function in the schema:

```sql
create or replace function phase_len(p_phase text) returns int ...
  when 'night' then 40
  when 'day'   then 120
```

Edit and re-run that block. It takes effect on the next phase change.

## Known limits

- **No reconnect grace.** A player who closes their tab stays in the game as a
  live player. `last_seen` is tracked but nothing acts on it yet.
- **Mafia kill ties break arbitrarily.** If two mafia pick different targets,
  the one with the lower id dies. Fine for small groups; with 3+ mafia you'd
  want an explicit agreement step.
- **Dead players can read day chat but not post.** There's no separate
  graveyard channel.
- **No rematch.** "New game" returns to the home screen and makes a fresh room.
