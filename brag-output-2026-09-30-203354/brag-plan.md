# Brag Plan: Phoenix Hub

## What is this app?
Phoenix Hub is a solo-built landing page for four complete browser games/tools — a card-duel battle, a glitched Wordle clone, a trip expense splitter, and a full keyframe animation studio — all living behind one dark, gold-accented hub.

## The angle
Play it as an origin-myth trailer. The hub's own tagline ("small apps, built for fun") is treated as false modesty, and the video frames the four apps as four distinct "worlds" ruled over by one flame mark — epic, wide, dramatic reveals instead of quick gags. This is the same material as a previous default-tone run, but re-cut for scale and gravity instead of playful wit.

## Hook (first 2-3 seconds)
A near-black frame. The hub's own quiet tagline sits small and dim: "small apps, built for fun." Then the Phoenix flame glyph ignites at center — gold outer flame over red inner flame — and a gold flare wipes across the frame like it's daring the claim to be believed.

## Key moments (the middle)
- **The Unfolding Battle**: wide shot on the duel board — a hand card slides into an empty gold-outlined slot, the slot reveals, and the two red power badges flash a comparison. Framed as a duel of fates, not a card game.
- **Glitchword**: a guess row flips tile by tile toward green/gray — and the final tile inverts into its glitch color instead, a small "⌁ glitch" tag flickering beside it. Framed as truth hidden inside the malfunction.
- **"...and two more realms"**: the Trip Expense Calculator's settle-up line ("X owes Y $__") and the Animation Studio's canvas + keyframe timeline scrubbing, cut together as two more worlds behind the same hub.

## Outro / punchline
Hard cut back to the real hub grid, all four cards visible, a gold glow sweep passing left→right across them like a sunrise. Title slams back in over it: "PHOENIX HUB — Four worlds. One flame." The flame mark holds as the last frame.

## User flow worth showing
No single flow spans the hub — four separate apps, one centerpiece beat each (entry → key action → result), pulled from product mechanics:
- Battle: place a card into a slot → reveal → power comparison flash.
- Glitchword: type a guess → tiles flip → one tile shows the inverted glitch color.
- Calculator: log an expense → settle-up view shows who owes whom.
- Animation Studio: draw/drop a keyframe → scrub the timeline → export.

## Tone
- Preset: cinematic
- Creative direction: origin-myth trailer for a small personal hub of games — treat four hobby apps like four worlds under one flame, played completely straight
- Interpretation: wide shots, big type, dramatic scale-in reveals rather than rapid cuts; each scene gets a full declarative line that lands before the next begins; restraint on jokes — the "epic" framing of small, real apps is the joke, and it should never wink

## Format: landscape — 1920x1080
## Duration: ~20s target

## Visual identity (from the project)
- Background: `#11141d` (near-black navy)
- Panel/card background: `#1c2230`
- Accent (gold): `#f5a524`
- Secondary accent (flame red): `#f06a4d`
- Text: `#e8ecf5` (ink), `#98a2b8` (soft ink)
- Display font: Sora (700 weight — the site's actual heading font, use directly rather than a stand-in)
- Body font: Inter
- Strongest visual element: the two-tone flame favicon (gold outer flame, red inner flame) on the dark navy field, and the hub's gold-bordered, lift-on-hover card grid with soft radial glow decor behind it.

## Share copy (draft)
Four small worlds. One flame. Built solo, no installs — welcome to Phoenix Hub. 🔥

## Audio direction
- Role: cinematic support — steady bed under wide dramatic reveals, 2-3 big impact hits rather than a dense SFX layer
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (109.96 BPM, "steady and clean," the set's cinematic/polished pick)
- Music treatment: fades in low under the hook (~0.15 volume), rises to ~0.3 by the reveal, holds steady through the middle, gentle fade over the final 0.5s under the outro line
- Music cue guidance: preset read (`happy-beats-business-moves-vol-12...music-cues.json`). Strong cues at 8.74s (0.99), 13.11s (0.98), and 17.47s (0.99) fall right at our Battle power-flash (~S3), Glitchword's glitch-tile reveal (~S4 end), and the outro title slam (~S6 start) — lock these three within ±0.15s. Everything else rides the loose beat grid, not locked.
- Audio-reactive treatment: subtle — let the flame glyph's glow and the gold hub-card borders breathe gently with music RMS; no waveform/equalizer visuals
- SFX posture: restrained, 2-3 big cinematic hits plus one motion-matched accent per app beat — never stacked, never under a text read
- Audio-coupled moments: flame ignite (deep bell impact), card slide into slot (casino card sound) + power flash (soft impact), glitch tile inversion (digital glitch accent, timed to the 13.11s cue), outro title slam (deep bell impact, timed to the 17.47s cue)
- Restraint rule: one cue per beat, always timed to an entrance, never layered under a line still being read

## Storyboard

### Scene 1 — Hook: the quiet claim — 3s
Near-black frame. Small, dim text low in the frame: "small apps, built for fun." Then at ~1.2s the Phoenix flame glyph (gold outer `#f5a524` / red inner `#f06a4d`) ignites at center on the `#11141d` field and a soft gold flare wipes once across the frame.
Sequential/interaction: none (single held claim, then one ignite beat)
Audio intent: quiet, almost too-modest — then one serious impact that says this is bigger than it sounds
Audio-coupled idea: `impact/impactBell_heavy_000` at the flame ignite (~1.2s)
Music: fades in very low under the tagline, rising slightly into the ignite
Transition mood: dramatic wipe → Scene 2

### Scene 2 — Reveal: PHOENIX HUB — 3.5s
Hard, full-bleed slam: "PHOENIX HUB" in Sora 700, scaling in from 0.95→1.0, gold flame accent on "HUB." Subtitle rises half a second later: "Four worlds. One flame."
Sequential/interaction: none (single settled full-bleed title, then one subtitle line)
Audio intent: confident, scale-establishing — the trailer's thesis statement
Audio-coupled idea: `impact/impactSoft_medium_001` under the title's scale-settle
Music: builds to ~0.3 volume
Transition mood: dramatic wipe → Scene 3

### Scene 3 — The Unfolding Battle — 3.5s
Wide shot on the duel board. A hand card slides into an empty gold-outlined slot (`.slot.empty.playable`), the slot reveals with the ink-pop animation, and the two red `.pow` power badges flash a comparison with a glow on the winner. Caption: "A duel of wits, waged in cards."
Sequential/interaction: yes — card slides in → reveal pop → power comparison flash (3-step beat)
Audio intent: tactile weight, building to one decisive hit
Audio-coupled idea: `casino/card-slide-3` on the slide-in; `impact/impactSoft_medium_002` on the power flash, targeted to the 8.74s strong cue (±0.15s)
Music: steady, no drop
Transition mood: dramatic wipe → Scene 4

### Scene 4 — Glitchword — 3.5s
A Wordle-style row flips tile by tile toward green/gray — then the final tile inverts into its glitch color instead of the expected one, a small "⌁ glitch" tag flickering beside it. Caption: "Truth, hidden in the glitch."
Sequential/interaction: yes — 5 tiles flip in sequence, last one gets the glitch treatment, timed toward scene end
Audio intent: rhythmic build into one deliberately "wrong" digital beat
Audio-coupled idea: `interface/switch_004` per tile flip; `interface/glitch_002` on the inverted tile, targeted to the 13.11s strong cue (±0.15s)
Music: unchanged, steady mid-energy
Transition mood: dramatic wipe → Scene 5

### Scene 5 — "...and two more realms." — 3.5s
Split beat, both wide and held (not rapid-fire): the Trip Expense Calculator's settle-up view ("X owes Y $__") holds for ~1.6s, then cuts to the Animation Studio's canvas + keyframe timeline scrubbing across a few frames for ~1.9s. Caption overlay: "...and two more realms."
Sequential/interaction: yes — two held sub-scenes, no internal stagger
Audio intent: still dramatic, not rushed — each half gets its own beat
Audio-coupled idea: `interface/drop_002` on the calculator cut-in; `interface/switch_002` as the timeline scrubs
Music: steady, building slightly toward the outro
Transition mood: dramatic wipe → Scene 6

### Scene 6 — Outro: Four worlds, one flame — 3s
Hard cut back to the real hub grid, all four cards visible, a gold glow sweep passing left→right across them like a sunrise. Title slams back in over it: "PHOENIX HUB — Four worlds. One flame." The flame mark holds as the final frame.
Sequential/interaction: none (single settled composition + one title reveal)
Audio intent: the trailer's closing statement, full weight
Audio-coupled idea: `impact/impactBell_heavy_003` on the title landing, targeted to the 17.47s strong cue (±0.15s)
Music: fades out over the final 0.5s
Transition mood: — (end)

**Music mood for this video:** cinematic, steady, dramatic — wide reveals, not quick cuts
**Audio summary:** One steady cinematic bed (vol-12, rising from ~0.15 to ~0.3) runs the whole way, locked to three strong cues (flame ignite's echo at the Battle power-flash, the Glitchword glitch-tile, and the outro title slam) via deep bell and soft impact hits, with light motion-matched accents (card slide, tile switch, drop) carrying the two middle app beats.

## Revision note
This is a re-cut of the prior `default`-tone run (see `brag-output/brag-plan.md`, 2026-09-20) using the same four apps and the same Sabotage-removed hub state, reframed in `cinematic` tone per user request (2026-09-30).
