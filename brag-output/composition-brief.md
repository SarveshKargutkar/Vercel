# Hyperframes Composition Brief: Phoenix Hub

## Objective
Create a short launch-style brag video for Phoenix Hub, a solo-built collection of four browser apps.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: ~17.5s (target range 15-25s)

## Source Material
- Project root: `D:\Sarvesh\YOUTUBE\The Unfolding game`
- Primary files read: `index.html`, `styles.css`, `theme.js`, `favicon.svg`, `game.html`, `wordle.html`, `studio.html`, `calculator.html`
- Product name: Phoenix Hub
- Tagline / strongest claim: "small apps, built for fun" (index.html hub subtitle) — used ironically as the hook, contradicted by the rest of the video
- Key UI or visual moment to recreate:
  - The hub landing grid itself (`index.html` `.home-cards`): 4 dark cards with gold hover-glow border and lift, 2-column grid (Sabotage is commented out of the live site as of 2026-09-20 and is intentionally excluded from this video)
  - The Phoenix flame favicon glyph (`favicon.svg`): gold outer flame `#f5a524` over red inner flame `#f06a4d` on a `#11141d` rounded-square badge
  - The Unfolding Battle board: dashed gold-outlined empty slot (`.slot.empty.playable`), card reveal ink-pop animation, red power badge (`.pow`)
  - Glitchword's tile-flip mechanic with an inverted "glitch" tile color
- Copy that must appear verbatim:
  - "small apps, built for fun"
  - "place cards into 3 slots, reveal, and out-power your foe" (paraphrase target: "place cards. reveal. out-power your foe.")
  - "One hub. Four weird little worlds. No installs." (original outro line, not sourced from the site)

## Creative Direction
- Tone preset: default
- Creative direction: solo-dev demo reel for a little universe of apps — playful, wry about its own understatement, never corporate
- Interpretation: comfortable pacing, 2.5-3.5s per beat, clean crossfades/hard cuts (not chaotic-tone whiplash), one dry opening understatement that the rest of the video visibly contradicts
- Angle: The hub's own tagline undersells itself ("small apps, built for fun"). The video plays that line straight for 2.5 seconds, then rapid-fires proof it was an understatement — four real, distinct, working products.
- Hook: Phoenix flame glyph ignites on black, tagline "small apps, built for fun" lands underneath, held just long enough to be believed
- Outro / punchline: back to the full hub grid with a gold glow sweep, final line "One hub. Four weird little worlds. No installs.", flame mark holds as last frame
- Avoid:
  - Generic SaaS language ("streamline your workflow", etc.)
  - Abstract filler visuals — every scene must show a real element from one of the four apps
  - Redesigning the hub's actual palette/typography

## Visual Identity
- Background: `#11141d`
- Panel/card background: `#1c2230`
- Text (ink): `#e8ecf5`; soft ink: `#98a2b8`
- Accent (gold): `#f5a524`
- Secondary accent (flame red): `#f06a4d`
- Display font: Montserrat (700) — embedded-safe stand-in for the site's Sora, fallback: sans-serif
- Body font: Inter — fallback: system-ui, sans-serif
- Visual references from the project: gold-bordered lift-on-hover hub cards, radial glow decor on dark navy, the two-tone flame favicon mark, dashed gold slot outline + ink-pop reveal from the battle game

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. Hook — 2.5s — flame glyph ignites, "small apps, built for fun" tagline lands
2. Hub reveal — 2.5s — real hub grid, 4 cards pop in left-to-right with gold hover-glow
3. The Unfolding Battle — 3.0s — card slides into slot, reveal pop, power-badge comparison flash, line: "place cards. reveal. out-power your foe."
4. Glitchword — 3.0s — guess types out, tiles flip in sequence, last tile flips to the inverted glitch color with a small "⌁ glitch detected" tag
5. "...and one more." — 3.5s — Expense Calculator settle-up view (~1.6s) cuts to Animation Studio canvas + keyframe timeline scrub (~1.9s)
6. Outro / punchline — 3.0s — full hub grid, gold glow sweep left-to-right, line "One hub. Four weird little worlds. No installs.", flame mark holds as final frame

## Audio
- Audio role: warm-but-punchy bed with SFX tied to each app's own signature action
- Audio arc: steady upbeat bed under the whole video; SFX density stays constant (~1 cue per beat) rather than escalating; fades out in the final 0.5s under the outro line
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` (already copied to `brag-output/composition/assets/music/`)
- Music treatment: start at 0, volume ~0.35, no big volume swells mid-track, gentle fade-out over the last 0.5s
- Music cue guidance: bundled preset read (`<skill-dir>/assets/music/cues/happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json`, 120 BPM). Beat grid runs roughly every 0.5s from ~3.0s onward within our 0-17.5s window; the track's `strongCues` all land at 16s+, right at the tail of our runtime, so treat the grid as loose scene-cut alignment (±0.1s) rather than a locked reveal target. Re-run `npx hyperframes beats` on the copied file if a fresh/local cue file is preferred.
- Audio-reactive treatment: subtle — flame glyph glow and hub-card gold border may breathe slightly with music RMS/bass; no waveform/equalizer visuals, no strobing
- Audio-coupled moments:
  - Scene 1 hook — soft impact under the flame ignite (~0.2s)
  - Scene 2 hub reveal — card pop-in sounds, staggered, slight accent on the last card
  - Scene 3 battle — card-slide sound on slide-in, soft impact on the reveal pop, small click on the power-badge flash
  - Scene 4 Glitchword — randomized keypress sounds while typing, a flip/click sound per tile, a distinct digital-glitch accent on the inverted tile
  - Scene 5 "...and one more" — a soft drop on the calculator cut-in, a switch/click sound as the timeline scrubs
  - Scene 6 outro — a bell-style hit when the final line lands
- SFX selection guidance: match the gesture — card sounds for card-like reveals, a short bell/impact for the outro payoff, UI click/switch sounds for simulated interaction, one distinct glitch/digital accent reserved for Glitchword's inverted tile
- SFX analysis guidance: read `<skill-dir>/assets/sfx/sfx-analysis.md`; prefer low/medium high-frequency-risk files for the repeated tile-flip and card-pop moments, reserve any higher-risk glitch file for the single isolated Glitchword accent
- Exact SFX choice: Hyperframes should choose exact filenames, timestamps, density, and volume based on the implemented animation
- Audio files: music already copied to `brag-output/composition/assets/music/`; Hyperframes should copy any chosen SFX into `brag-output/composition/assets/sfx/`

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core` (composition contract + `data-*` timing), `hyperframes-animation` (motion), `hyperframes-creative` (design spec, beats, audio-reactive), `hyperframes-keyframes` (seek-safe keyframes), and `hyperframes-cli` (lint/check/render). `/brag` is its own workflow: do not enter the `hyperframes` entry-point intent interview and do not route into its generic promo/launch-video workflow. Prefer native Hyperframes conventions over anything in `/brag`.

Requirements:
- Show at least one real UI, copy, or visual element from the source project in every scene.
- Keep all text readable in the final render.
- Keep the video within 15-25 seconds.
- Include the planned music/SFX layer.
- Treat `/brag` audio notes as guidance, not a fixed cue sheet. Choose SFX after the visual animation exists.
- Treat music cue metadata as optional timing hints; ignore cues that hurt readability, scene pacing, or the product story.
- Use only 1-3 strong cue locks if a fresh beat detection run finds usable cues within the 17.5s runtime; otherwise use natural timing.
- Use SFX to support motion and interaction as described above; restraint when the edit is already busy (never stack SFX under a text read).
- Honor the planned fade-out under the outro line.
- When music is present, extract audio data and wire at least one visual element (flame glow / card border presence) to RMS/bass, subtly.
- Use local assets for audio (already copied) and any required runtime/media dependencies.
- Run `hyperframes check` before render — it is brag's single gate.
