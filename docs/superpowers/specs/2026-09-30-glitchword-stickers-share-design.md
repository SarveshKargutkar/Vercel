# Glitchword — Stickers, Share Card & Word Meanings

**Date:** 2026-09-30
**Target file:** `wordle.html` (single self-contained document, 2,778 lines)
**Branch:** `glitchword-stickers-share`

## Context

A design document proposed a "Wordle spin-off" with 10 rounds, Scrabble letter
scoring, inverted glitch tiles, collectible stickers and a shareable image.
Most of it already exists in `wordle.html` as the game Glitchword:

| Proposed feature | Status |
| --- | --- |
| 10 rounds x 3 words | Exists (`SCHED`, roles Opener/Standard/Keystone) |
| Glitch tiles, inverted feedback, 0-2 per word | Exists (`INVERT`, `glitchSlots`, `foolEvents`) |
| Turn-efficiency multiplier | Exists (`EFF`) |
| Difficulty targets | Exists (`TARGET`) |
| Between-round interstitial | Exists (`showSummary`), richer than proposed |
| Text share | Exists (`shareText`, `navigator.share({text})`) |
| Scrabble letter scoring | Not present — deliberately **out of scope** |
| Word lengths 4-7 | Not present — deliberately **out of scope** |
| Collectible stickers | Not present — **in scope** |
| 1080x1080 share image | Not present — **in scope** |
| Word meanings after a round | Not proposed in the document — **in scope** (user request) |

### Scope decision

This is **additive**. The existing scoring engine, the fixed 5-letter word
list and the difficulty targets are left untouched.

Rationale: the proposed scoring scale (targets ~2,730, word base values 8-9)
and the live game's scale (targets 6,400-8,900, base 100-200) are
irreconcilable, and the proposal's own worked example scores 122 against its
own 280 round target — near-optimal play missing by 56%. Adopting it would
require rebalancing a working, shipped game against numbers that do not hold
together. Rejected in favour of shipping the three genuinely missing features.

## Goals

1. A persistent 10-sticker collection with four rarity tiers and a browsable album.
2. A 1080x1080 shareable session card, generated with no external dependency.
3. A one-line meaning for each answer word on the round summary screen.

## Non-goals

- Scrabble letter-value scoring.
- Variable word length.
- Re-tuning `TARGET`, `EFF`, `BASE`, `GLITCH_PTS` or `SCHED`.
- Replacing the existing text/emoji share.
- A sticker progress ring on the interstitial (considered, not selected).

---

## 1. Sticker engine

### Data model

```js
STICKERS = [ { id, name, theme, check(ctx), words(ctx) }, ... ]
```

`check(ctx)` returns a boolean. `words(ctx)` returns the array of word indices
that qualified, from which rarity is derived. `ctx` is built once per
evaluation and carries the 30 `wordInfo(i)` results, `sessionStats()`, the
lifetime stats object, `S.difficulty`, and `S.roundScores`.

### Criteria

Each maps onto a metric the engine already computes. `sessionStats()` already
returns `tiles` (glitch tiles encountered, excluding yellows) and `mis` (times
fooled by `foolEvents`).

| Sticker | Implementation |
| --- | --- |
| Glitch Hunter | `tiles - mis >= 5` |
| Flawless Logic | any round with all 3 words solved at `g <= 3` |
| High Roller | any `wordInfo(i).score >= 300` |
| First Light | lifetime `played >= 1` |
| Speed Run | at least 3 words solved at `g === 1` |
| Comeback Kid | `won` and cumulative total below `roundExpected(r)` at some `r >= 6` |
| Z Is for Zenith | the winning guess of a solved word contains Q, X or Z |
| Iron Will | session completed on Expert |
| Deduction Master | `mis === 0 && tiles > 0` |
| Century Club | lifetime `played >= 100` |

Two translations from the source document:

- Its "Hard mode" is this game's **Expert** difficulty.
- "Correctly deduce a glitch tile" becomes *encountered minus fooled*, because
  `foolEvents()` already gives a precise definition of being fooled.

`Comeback Kid` requires no new persisted state: `roundScores` is already saved
and `roundExpected(r)` already exists, so the condition is derived at session end.

### Rarity

Average guesses across the sticker's qualifying words. The source document
leaves its band boundaries ambiguous (is 2.5 Rare or Epic?); bands here are
half-open, which matches its own worked example of 2.67 -> Rare:

| Tier | Band | Treatment |
| --- | --- | --- |
| Common | `avg >= 3.5` | Flat colour |
| Rare | `2.5 <= avg < 3.5` | Metallic gradient border |
| Epic | `1.5 <= avg < 2.5` | Shimmer |
| Foil | `avg < 1.5` | Rainbow sheen |

### Persistence

New key `gw:v1:stickers`, shape `{ [stickerId]: rarityIndex }` where
`rarityIndex` is 0-3. Kept separate from `gw:v1:stats` so that clearing one
does not destroy the other. Upgrade in place via `Math.max(existing, earned)`,
so the album holds one slot per sticker showing its best-earned variant.

### Unlock timing

Criteria that can resolve mid-session (Flawless Logic, Speed Run, High Roller,
Glitch Hunter) are evaluated after each word and round completion and produce a
toast, so the feedback feels live.

Nothing is **written** to storage until session end, when the final rarity is
known. A sticker whose qualifying word set is still growing would otherwise
persist a rarity that later changes.

---

## 2. Word meanings on the round summary

### Source

`https://api.dictionaryapi.dev/api/v2/entries/en/<word>`, taking
`[0].meanings[0].definitions[0].definition` plus `partOfSpeech`, trimmed to
roughly 110 characters.

Bundling ~2,000 offline glosses was considered and rejected: it would near-double
a 133KB file, and definitions authored at that volume would contain errors
neither author nor reviewer would catch by reading.

### Cache

New key `gw:v1:defs`, shape `{ WORD: gloss }`. A word with no dictionary entry
is cached as an empty string so it is never re-fetched. Only the 2,000 possible
answers are ever looked up; guess words never are.

### Flow

`showSummary(r)` renders immediately, exactly as it does today. It then fires
lookups for the round's three answers (uncached only) and patches each
definition into its table row as it resolves. The modal never blocks on the
network.

### Failure handling

- 4-second timeout via `AbortController`.
- On failure, missing entry, or timeout: the definition line is simply absent.
  No error toast — this is decoration, not function.
- If the player advances before a request resolves, the target DOM node is
  gone; the patch is guarded by an existence check.

### Privacy note

This is the first outbound request the game makes on the player's behalf
(the existing `/_vercel/insights` analytics aside). It transmits answer words
to a third-party API. Sensitivity is low, but the behaviour is new.

---

## 3. Album UI

A new header icon button beside Review opens the album modal: all 10 slots in a
grid. Unlocked slots show the rendered sticker and its rarity name. Locked slots
show a dimmed silhouette **with the criterion text visible**, so the album reads
as a goal list rather than a mystery box.

### One renderer

Each sticker's artwork is a single function `drawSticker(ctx, id, size, rarity)`.
Album slots are `<canvas>` elements that call it; the share card calls the same
function. This avoids maintaining an SVG set for the DOM and a parallel Canvas
set for export, which would drift.

Epic and Foil motion in the album comes from a light CSS overlay on top of the
static canvas, rather than a `requestAnimationFrame` redraw per slot.

---

## 4. Share card

### Rendering

Native Canvas 2D. Backing store 2160x2160 via `ctx.scale(2, 2)`, with all
layout coordinates written in 1080 space.

`html2canvas` was considered and rejected: it adds a ~200KB CDN dependency to a
file that currently has none, introduces a failure mode where a blocked CDN
kills the share button, and silently drops effects it cannot rasterise. An
SVG-to-canvas approach was also rejected because external fonts do not load
inside SVG painted into a canvas, and typography is central to this card.

### Layout

- **Top third** — `GLITCHWORD` wordmark, outcome line, final score large, target
  smaller beside it, progress ring.
- **Middle third** — 10-segment horizontal strip, each segment coloured against
  `roundExpected(r)`: green above expected, yellow within margin, red below.
- **Bottom third** — stickers newly unlocked this session at full size with
  baked rarity treatment.
- **Footer** — game name, tagline, short URL.

Palette is fixed dark regardless of the player's active theme, so a light-theme
player still produces a card that reads on social.

`await document.fonts.ready` before drawing, so JetBrains Mono renders rather
than silently falling back to a system font.

### Deviations from the source document

- **Short URL instead of a QR code.** A QR encoder is a few hundred lines for
  something a post caption already carries.
- **No `useCORS` handling.** Nothing is loaded externally, so it is moot.

### Export

`canvas.toBlob(..., 'image/png')`, then `navigator.canShare({ files })` ->
`navigator.share({ files: [file] })`. Fallback is a download via object URL and
an `<a download>`, with a short instruction line for the camera-roll flow.

The existing Share (text) and Copy buttons are **unchanged**. "Share image" is
added alongside them.

---

## 5. Verification

The repository has no test framework and the game is a single static file, so
verification is browser-based and manual.

- A temporary seeded debug hook to fast-complete sessions, so all 10 sticker
  paths are actually exercised rather than assumed. **Removed before the final
  commit.**
- Definition fetch verified in three states: cache hit, cache miss, and offline
  (each must leave the summary modal fully functional).
- Share card verified visually at full size and inspected for font fallback.
- Existing text share, results screen and round summary re-checked for regression.

## Risks

1. **`dictionaryapi.dev` availability.** It is a free unguaranteed service. The
   graceful-skip path means an outage degrades to today's behaviour rather than
   breaking anything.
2. **File growth.** The file is already 133KB. Stickers plus the card renderer
   add an estimated 25-35KB. Acceptable; the rejected definition bundle was not.
3. **Sticker criteria drift.** The criteria read private engine internals
   (`wordInfo`, `sessionStats`). Changing the scoring engine later would silently
   change what unlocks. Mitigated by building `ctx` in one place.
