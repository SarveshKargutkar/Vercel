# Hyperframes Composition Brief: Phoenix Hub

## Objective
Create a short cinematic launch-style brag video for Phoenix Hub, a solo-built hub of four browser apps.

## Output
- Composition directory: `composition/`
- Rendered video: `../brag.mp4` (one level up)
- Format: landscape — 1920x1080
- Duration: ~20 seconds

## Source Material
- Project root: `D:\Sarvesh\YOUTUBE\The Unfolding game`
- Primary files read: `index.html`, `styles.css`, `game.html`, `wordle.html` (inline `<style>`, `--gw-*` tokens), `calculator.html` (inline `<style>`), `studio.html` (inline `<style>`, `--ks-*` tokens), `favicon.svg`
- Product name: Phoenix Hub
- Tagline / strongest claim: "small apps, built for fun" (hub subtitle) — played as false modesty
- Key UI or visual moment to recreate:
  - `index.html` — the hub grid: `.home-card.sketch` cards (gold-bordered, `--paper` bg, lift-on-hover), `<h1>Phoenix <span class="flame">Hub</span></h1>`, flame favicon (`favicon.svg`: gold outer flame `#f5a524` / red inner flame `#f06a4d` on `#11141d` rounded-square)
  - `game.html` / styles.css `.slot`, `.card`, `.card .pow` — dashed gold-outlined empty slot (`.slot.empty.playable{border:2px solid var(--gold)}`), card with `.pow` red power badge (bottom-left), reveal pop animation (`@keyframes inkpop`)
  - `wordle.html` (Glitchword) — `.tile` (56px, `--gw-tile`), flip animation (`@keyframes gw-flip`), colored states `.tile.G` (green `#3fb950`), `.tile.Y` (yellow `#d4a72c`), `.tile.X` (gray `#3a414c`), glitch state `.tile.gl` (dashed RGB-split outline in `--gw-accent`/`--gw-accent-2`, `⌁` badge via `::after`)
  - `calculator.html` — `.settle-line` row: bold names either side of a gold "pays →" arrow, red rupee amount right-aligned (`.settle-line b.rupee{color:var(--red)}`)
  - `studio.html` (Animation Studio) — dark 3-panel editor chrome: `--ks-panel` panels, gold playhead/keyframe accents (`--ks-gold`), timeline ruler + track canvas area, gold "Add key" style markers
- Copy that must appear verbatim:
  - "small apps, built for fun"
  - "PHOENIX HUB"
  - "Four worlds. One flame."
  - "A duel of wits, waged in cards."
  - "Truth, hidden in the glitch."
  - "...and two more realms."

## Creative Direction
- Tone preset: cinematic
- Creative direction: origin-myth trailer — treat four small hobby apps as four worlds under one flame, played completely straight, no winking
- Interpretation: wide shots, big Sora type, dramatic scale-in reveals (not quick cuts), each scene holds a full declarative line before the next begins
- Angle: The hub's own tagline ("small apps, built for fun") is treated as false modesty. The video frames the four apps as four distinct "worlds" ruled over by one flame mark — epic, wide, dramatic reveals instead of playful quick gags.
- Hook: Near-black frame, dim tagline text, then the flame glyph ignites with a gold flare wipe at ~1.2s.
- Outro / punchline: Hard cut to the full hub grid with a gold sweep, title slams back: "PHOENIX HUB — Four worlds. One flame." Flame mark holds as final frame.
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign (keep the hub's actual dark navy + gold + red palette)

## Visual Identity
- Background: `#11141d` (near-black navy)
- Panel background: `#1c2230`
- Text: `#e8ecf5` (ink), `#98a2b8` (soft ink)
- Accent (gold): `#f5a524`
- Secondary accent (flame red): `#f06a4d`
- Display font: Sora (700 weight) — load from Google Fonts and embed as local `@font-face` per hyperframes-core font rule, OR self-host; must satisfy `font_family_without_font_face` lint
- Body font: Inter
- Visual references from the project: two-tone flame favicon, gold-bordered hub card grid, dashed gold battle slot + red power badge, Glitchword tile flip + glitch tile, calculator settle-up line, Animation Studio dark editor chrome with gold timeline accents

## Storyboard
Use the storyboard in `../brag-plan.md` as the creative contract. Scene summary:
1. Hook: the quiet claim — 3.0s — tagline dim, then flame glyph ignites + gold flare wipe
2. Reveal: PHOENIX HUB — 3.5s — full-bleed title slam + "Four worlds. One flame." subtitle
3. The Unfolding Battle — 3.5s — card slides into gold-outlined slot, reveal pop, power badges flash compare
4. Glitchword — 3.5s — 5-tile row flips, last tile inverts to glitch state with ⌁ tag
5. "...and two more realms." — 3.5s — calculator settle-up line hold, then Animation Studio canvas+timeline scrub
6. Outro: Four worlds, one flame — 3.0s — hub grid revealed, gold sweep, title slam, flame mark holds

## Audio
- Audio role: cinematic support — steady bed under wide dramatic reveals, 2-3 big impact hits, restrained SFX layer
- Audio arc: fades in low under the hook (~0.15), rises to ~0.3 by the reveal, holds through the middle, fades over the final 0.5s
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (109.96 BPM, "steady and clean")
- Music treatment: fade-in under hook, hold ~0.3 volume through the body, fade-out over final 0.5s under the outro line
- Music cue guidance: bundled preset (`<skill-dir>/assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`). Strong cues at 8.74s (0.99), 13.11s (0.98), 17.47s (0.99) — target Battle's power-flash (Scene 3, ~6.5-10s), Glitchword's glitch-tile reveal (Scene 4 end, ~13.5s), and the outro title slam (Scene 6 start, ~17s), each within ±0.15s.
- Audio-reactive treatment: subtle — flame glyph glow and gold hub-card borders breathe gently with music RMS; no waveform/equalizer visuals
- Audio-coupled moments:
  - Scene 1 flame ignite — deep bell impact (~1.2s)
  - Scene 2 title scale-settle — soft impact under the settle
  - Scene 3 card slide-in — casino card-slide sound; power-flash — soft impact, beat-locked to 8.74s
  - Scene 4 tile flips — switch/toggle sound per tile; glitch tile — digital glitch accent, beat-locked to 13.11s
  - Scene 5 calculator cut-in — soft drop sound; timeline scrub — switch sound
  - Scene 6 title slam — deep bell impact, beat-locked to 17.47s
- SFX selection guidance: match the gesture — card sounds for the card slide, switch/toggle sounds for tile flips, soft drop for UI cut-ins, deep bell impacts reserved for the 3 major beats only. Never stack SFX under a line still being read.
- SFX analysis guidance: read `<skill-dir>/assets/sfx/sfx-analysis.md`; prefer low/medium HF-risk files for the repeated tile-flip sequence.
- Exact SFX choice: Hyperframes chooses filenames/timestamps/density from the candidates already copied into `composition/assets/sfx/` (impact/impactBell_heavy_000, impact/impactSoft_medium_001, impact/impactSoft_medium_002, casino/card-slide-3, interface/switch_004, interface/glitch_002, interface/drop_002, interface/switch_002, impact/impactBell_heavy_003).
- Audio files: already copied into `composition/assets/music/` and `composition/assets/sfx/**` (see below).

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core`, `hyperframes-animation`, `hyperframes-creative`, `hyperframes-keyframes`, `hyperframes-cli`. /brag is its own workflow: do not enter the `hyperframes` entry-point intent interview and do not route into its generic promo / launch-video workflow. Prefer native Hyperframes conventions over anything in `/brag`.

Requirements:
- Show at least one real UI, copy, or visual element from the source project (satisfied by scenes 2-6).
- Keep all text readable in the final render (respect reading-time floors: 0.8s for short labels, 0.3s/word minimum 1.2s for full lines).
- Keep the video within 15-25 seconds (target ~20s per the plan).
- Include the planned music/SFX layer.
- Beat-lock the 3 major reveals to the 8.74s / 13.11s / 17.47s strong cues within ±0.15s; mark each `// beat-locked: <time>`.
- Use SFX to support motion and interaction per the Audio section above.
- Wire subtle audio-reactive glow on the flame glyph and gold card borders using the hyperframes-creative audio-reactive workflow; if extraction is unavailable, skip and note it — do not block the render.
- Run `npx hyperframes check` before render — it is brag's single gate.
