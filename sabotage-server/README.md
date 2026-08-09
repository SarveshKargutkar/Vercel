# Sabotage — backend server

Real-time server for **Sabotage**, the team-based social-deduction game in Phoenix Hub.
Node + Express + Socket.IO, in-memory rooms. Runs on any Node host; this guide uses
**Render (free)** for the backend and **Vercel** for the frontend.

---

## The game in one paragraph

Players are paired into **teams of two** each round. One teammate has the _knowledge_,
the other has the _controls_, and they must talk it out through three cycling challenges:
a **password puzzle** (one reads definitions, the other finds and spells the word),
a **wire maze** (one sees the walls, the other moves a cursor blind), and
**bomb defusal** (one has the manual, the other cuts wires and flips switches).
Hidden **saboteurs** secretly profit when their own team fails. After every round comes a
**30-second vote**, then Buckshot-Roulette justice: a chamber loaded with **live rounds
and blanks** — the accused pulls the trigger. Blank = safe (role stays hidden). Live =
eliminated (role revealed). A **🔍 magnifying glass** item lets a player privately peek at
the next shell. Crew wins when all saboteurs are gone; saboteurs win at parity.

---

## Split hosting: Vercel (frontend) + Render (backend)

Vercel runs serverless functions, which don't hold a long-lived WebSocket. So:

- **Frontend** (`sabotage.html`, `sabotage.css`, `sabotage-client.js`, plus the rest of
  Phoenix Hub) → **Vercel**.
- **Backend** (this `sabotage-server/` folder) → **Render** (or Railway / Fly).

## 1. Deploy the backend on Render

1. Push this repo to GitHub (the whole `The Unfolding game` folder is fine).
2. Go to **render.com → New + → Web Service** and connect the repo.
3. Configure:
   - **Root Directory:** `sabotage-server`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free
   - (Optional) **Environment variable** `CORS_ORIGIN` = your Vercel URL, e.g.
     `https://your-hub.vercel.app`. Leave unset / `*` to allow any origin.
4. Deploy. You'll get a URL like `https://sabotage-server.onrender.com`.
   Open it — you should see `{"ok":true,"service":"sabotage",...}`.

> There's also a `render.yaml` blueprint here — you can instead pick
> **New + → Blueprint** and Render will read it automatically.

**Free-tier note:** Render free web services sleep after ~15 min idle and cold-start in
~30s. The first player to connect may wait a few seconds while it wakes.

## 2. Deploy the frontend on Vercel

1. Import the same GitHub repo into **vercel.com → Add New → Project**.
2. Framework preset: **Other** (it's static HTML). No build step needed.
3. Deploy. You'll get `https://your-hub.vercel.app`.

## 3. Point the frontend at the backend

Open `sabotage.html` and change the ONE hardcoded line near the top:

```html
<script>
  window.SABOTAGE_SERVER = "https://sabotage-server.onrender.com";
</script>
```

(If you set `CORS_ORIGIN` on Render, make sure it matches your Vercel domain exactly,
no trailing slash.)

---

## Test the game locally (full walkthrough)

You need two things running: the **backend** and a small **static server** for the frontend.

**1. Start the backend**

```bash
cd sabotage-server
npm install
npm start                     # -> "Sabotage server listening on :3001"
```

**2. Serve the frontend** (from the project root, a new terminal). Opening the HTML by
double-click uses `file://`, which some browsers block for sockets — serve it over http:

```bash
cd ..                         # the folder with sabotage.html
npx serve .                   # or:  python -m http.server 8000
```

Open the URL it prints, e.g. `http://localhost:8000/sabotage.html`.
The page is already hardcoded to `http://192.168.1.10:3001`, so it connects automatically.

**3. Play with multiple players on one machine**
Every browser tab normally shares one identity, so open players like this instead:

- Add `?guest` to the URL — each **tab** becomes its own player:
  `http://localhost:8000/sabotage.html?guest`
- Or `?pid=alice`, `?pid=bob`, … to force specific identities per tab.
- Or just use different browsers / an incognito window / phones on the same Wi-Fi.

Open **4+** such tabs (minimum 4 players): create a room in one, join with the code in
the others, then **Start**.

**4. Run the automated tests** (they drive real socket clients — and real DOM clients —
through complete games):

```bash
cd sabotage-server
npm install                   # includes dev deps: socket.io-client, jsdom
node test-e2e.js   # full game: pairing, all 3 challenges, glass, roulette, crew win
node test-win.js   # generator fuzz tests, bomb explosion, trio pairing, saboteur win
node test-ui.js    # 4 headless browsers play a whole game by clicking the real UI
npm test           # all three
```

> On phones testing against a locally-run server, use your computer's LAN IP
> (e.g. `http://192.168.1.20:3001` / `:8000`) instead of `localhost`.

---

## How the game works (server side)

- **Rooms**: any player creates a room and gets a 4-char code; others join with the code
  and (optional) password. **Names must be unique per room** (case-insensitive) — a join
  with a taken name is rejected. Reconnect is supported via a persistent `playerId`
  stored in the browser, so a refresh or dropped connection rejoins the same seat mid-game.
- **Roles**: on start, the server secretly assigns saboteurs (~1 per 4 players, always a
  crew majority). Saboteurs privately learn each other. Minimum 4 players.
- **Pairing**: teams of two are drawn **once at game start and stay fixed for the whole
  game** — they are never reshuffled. Guide/agent seats swap inside each team every
  round. If a player is eliminated, their surviving partner is merged with other strays
  (or joins the smallest team as an extra guide). Roles within the team:
  **guide** (has the knowledge) and **agent** (has the controls).
- **Challenges** cycle password → maze → bomb. All validation is server-side:
  the server generates the puzzle, sends each teammate only their half, and checks every
  submission/move/action. The password puzzle hides 5 answers among 10 words and allows
  at most **5 wrong guesses** — the 5th fails the round. Bombs explode after 3 wrong actions.
- **Team chat** is private to each team during challenges; voting chat is global.
- **Scoring**: challenge completion + speed bonus; surviving a blank; voting correctly.
  Saboteurs earn **secret** points when their own team fails — hidden until game end so
  the scoreboard doesn't expose them.
- **Items**: the fastest successful team earns a **magnifying glass** each round (other
  successful teams roll a chance). During voting it privately reveals the next shell;
  its use is publicly announced. One per player, kept until used.
- **Roulette**: each voting phase loads a fresh 6-shell chamber (2–3 live, announced
  publicly, order hidden). The top-voted suspect must pull the trigger (auto-fires after
  12s). Blank = safe + small score. Live = eliminated + role revealed.
- **Win**: crew wins when all saboteurs are eliminated; saboteurs win at parity.

### Socket API (for reference)

Client → server: `createRoom`, `joinRoom`, `startGame`, `pwSubmit`, `mazeMove`,
`bombAction`, `teamChat`, `chat`, `vote`, `useGlass`, `pullTrigger`, `playAgain`, `leaveRoom`.
Server → client: `room`, `role`, `gameStart`, `challengePhase`, `challengeData`,
`pwState`, `mazeState`, `bombState`, `teamDone`, `teamChat`, `itemGained`, `votingPhase`,
`glassUsed`, `glassResult`, `voteTally`, `chat`, `voteResult`, `triggerPhase`,
`triggerResult`, `scoreboard`, `gameOver`, `lobby`.
