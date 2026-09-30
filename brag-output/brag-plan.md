# Brag Plan: Phoenix Hub

## What is this app?
Phoenix Hub is a solo-built collection of four complete browser games/tools living behind one dark, gold-accented landing page — a card-duel battle, a glitched Wordle clone, a trip expense splitter, and a full keyframe animation studio with GIF/SVG/video export.

## The angle
The hub's own tagline undersells itself: "small apps, built for fun." The joke/hook is deadpan understatement meeting an absurd amount of actual scope — four real, working, differently-themed products behind one modest phrase. The video plays the reveal as "small apps" ironically, then rapid-fires proof that "small" was a lie.

## Hook (first 2-3 seconds)
Black screen. The Phoenix flame favicon ignites (gold-over-red flame glyph ignites on the dark navy rounded square). Text slams in under it: "small apps, built for fun." Held just long enough to be believed — then the next scene punches that claim in the face.

## Key moments (the middle)
- **The Unfolding Battle**: a card slides into an empty battle slot, the slot reveals, and the two power numbers (red badge) flash a comparison — "out-power your foe."
- **Glitchword**: a Wordle row types out and flips tile-by-tile, and one tile flips to its *inverted* glitch color instead of the expected green/gray — "read it backwards."
- **"...and one more"**: quick double-flash of the Trip Expense Share Calculator's settle-up screen and the Animation Studio's canvas + keyframe timeline, undercutting "small apps" one more time.

## Outro / punchline
Cut back to the real hub grid (index.html) with all four cards visible, gold hover-glow sweeping across them left to right. Final line lands over it: "One hub. Four weird little worlds. No installs." Phoenix flame mark holds as the last frame.

## User flow worth showing
No single flow spans this hub — it's four separate apps. Centerpiece beats, one per app (entry → key action → result), pulled straight from the product mechanics rather than marketing copy:
- Battle: place a card into a slot → reveal → power comparison flash.
- Glitchword: type a guess → tiles flip → one tile shows the inverted glitch color.
- Calculator: log an expense → settle-up view shows who owes whom.
- Animation Studio: draw/drop a keyframe → scrub the timeline → export.

## Tone
- Preset: default
- Creative direction: solo-dev demo reel for a little universe of apps — playful, a little wry about its own understatement, never corporate.
- Interpretation: comfortable pacing with room for each app's personality to register (3-3.5s per highlight, not chaotic-tone whiplash), clean crossfades/wipes between apps, and one dry punchline ("small apps, built for fun") that the rest of the video visibly contradicts.

## Format: landscape — 1920x1080
## Duration: ~17.5s target

## Visual identity (from the project)
- Background: `#11141d` (near-black navy)
- Panel/card background: `#1c2230`
- Accent (gold): `#f5a524`
- Secondary accent (flame red): `#f06a4d`
- Text: `#e8ecf5` (ink), `#98a2b8` (soft ink)
- Display font: Montserrat (700 weight, embedded-safe stand-in for the site's Sora)
- Body font: Inter
- Strongest visual element: the hub's gold-bordered, lift-on-hover cards over a dark navy field with soft radial glow decor, plus the two-tone flame favicon (gold outer flame, red inner flame) as a recurring mark.

## Share copy (draft)
Built a little hub of browser games — a card duel, a glitched Wordle, a trip splitter, and a full animation studio. No installs, just vibes. 🔥

## Audio direction
- Role: warm-but-punchy bed with SFX tied to each app's own action (card slide, tile flip, timeline scrub)
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` (120 BPM, most energetic of the set, matches `default`/quick-cut hub reel)
- Music treatment: starts at 0 under the hook, volume ~0.35, no big volume swells mid-track, gentle fade-out in the final 0.5s under the outro line
- Music cue guidance: preset read (`happy-beats-business-moves-vol-1...music-cues.json`). Beat grid runs ~0.5s apart from 3.0s onward. No strong cues fall inside our 0-17.5s window (the track's strong cues start at 16s+, right at the tail of our runtime) — treat the grid as a loose subdivision for scene-cut alignment (±0.1s), not a locked reveal target.
- Audio-reactive treatment: subtle — let the flame glyph's glow and the hub-card gold border breathe slightly with music RMS; no waveform/equalizer visuals
- SFX posture: moderate, one cue per app beat plus the hook ignite and outro payoff
- Audio-coupled moments: flame ignite (impact), card slide into slot (casino card sound), tile flip ×5 with the glitch tile getting a distinct digital-glitch accent, outro logo hold (soft bell)
- Restraint rule: never let SFX stack on top of the tagline reads — one cue per beat, timed to entrances, not exits

## Storyboard

### Scene 1 — Hook: "small apps, built for fun" — 2.5s
Black frame. The favicon flame glyph (gold outer flame `#f5a524` / red inner `#f06a4d` on `#11141d` rounded square) ignites and scales up softly. Below it, the hub's own tagline types/slams in: "small apps, built for fun" in Inter, soft ink `#98a2b8`.
Sequential/interaction: none (single held claim)
Audio intent: warm, almost too-modest opener — the calm before the reel undercuts it
Audio-coupled idea: soft impact (`impact/impactSoft_medium`) under the flame ignite at ~0.2s
Music: fades in under the flame, low
Transition mood: clean → Scene 2

### Scene 2 — Hub reveal — 2.5s
Hard cut to the real hub grid: "Phoenix Hub" headline in Montserrat, gold flame accent on "Hub," then the four cards (Expense Calculator, Glitchword, The Unfolding Battle, Animation Studio) fan/pop in one by one left-to-right across the two-column grid, each getting its border-gold hover glow as it lands.
Sequential/interaction: yes — 4 cards pop in one by one, ~0.13s stagger
Audio intent: quick build, proof the "small" claim is about to break
Audio-coupled idea: `interface/drop_00x` on each card's pop, accent on the last card
Music: picks up energy, ~0.35 volume
Transition mood: hard cut → Scene 3

### Scene 3 — The Unfolding Battle — 3s
Cut into the battle board: a hand card slides into an empty dashed slot (`.slot.empty.playable`, gold outline), the slot reveals with the ink-pop animation, and two power badges (red `.pow` circles) flash side by side with a quick comparison glow on the winner. Caption: "place cards. reveal. out-power your foe."
Sequential/interaction: yes — card slides in → reveal flash → power comparison (3-step beat)
Audio intent: tactile, game-like impact on the reveal
Audio-coupled idea: `casino/card-slide` on the slide-in, `impact/impactSoft_medium` on the reveal pop, small `interface/click` on the power flash
Music: steady, no drop
Transition mood: crossfade → Scene 4

### Scene 4 — Glitchword — 3s
A Wordle-style row types a guess, tiles flip one by one (green/gray), and the last tile flips into its *inverted* glitch color instead of the color it "should" be — a small "⌁ glitch detected" tag flickers next to it.
Sequential/interaction: yes — 5 tiles flip in sequence, last one gets the glitch treatment
Audio intent: playful, then one deliberately "wrong" digital blip
Audio-coupled idea: `keyboard/keypress-*` (randomized) while typing, `interface/switch` per tile flip, `interface/glitch_002` on the inverted tile
Music: unchanged, steady mid-energy
Transition mood: clean wipe → Scene 5

### Scene 5 — "...and one more." — 3.5s
Split beat: the Trip Expense Share Calculator's settle-up view ("X owes Y $__") flashes for ~1.6s, then hard-cuts to the Animation Studio's canvas + keyframe timeline scrubbing across a few frames, ~1.9s. Small caption overlay: "...and two more." (calculator + studio, on top of the two already shown).
Sequential/interaction: yes — two quick sub-scenes, each a single beat, no internal stagger
Audio intent: light, fast, "oh and also this" energy
Audio-coupled idea: `interface/drop_002` on the calculator cut-in, `interface/switch` as the timeline scrubs
Music: steady, building slightly toward the outro
Transition mood: soft wipe → Scene 6

### Scene 6 — Outro / punchline — 3s
Back to the hub grid, all four cards visible at once, a gold glow sweep passes left→right across them. Final line lands centered: "One hub. Four weird little worlds. No installs." The flame mark holds as the last frame.
Sequential/interaction: none (single settled composition + one text reveal)
Audio intent: confident, warm close — the payoff after the opening's false modesty
Audio-coupled idea: `impact/impactBell_heavy_004` on the line landing
Music: fade out over final 0.5s
Transition mood: — (end)

**Music mood for this video:** upbeat, clean, quick-cut energy without going chaotic
**Audio summary:** One steady upbeat bed (vol-1, ~0.35 volume) runs the whole way, with a tasteful SFX hit tied to each app's own signature action (card slide, glitch tile, timeline scrub) and two bell-style accents bookending the hook and the outro punchline.

## Revision note
Sabotage was removed from this video (2026-09-20) because the user removed it from the live hub UI (commented out in `index.html`). Scene count dropped from 7 to 6, total duration from ~21s to ~17.5s.
