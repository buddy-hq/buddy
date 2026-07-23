# Dead zones (activity-row working labels)

This document locks in the vocabulary and the tuning decisions for the "working
labels" that appear in the chat transcript's activity row — the words like
**Pondering**, **Foraging**, **Researching**, **Gathering** that show while the
assistant is busy.

If you are a future contributor (human or bot) about to change one of these
timing numbers, read Section 1 so we mean the same thing by "dead zone", then
read Section 2 so you know why the current numbers are what they are.

Code lives in:
- `packages/web/src/components/chat/tools/activity-row/index.tsx` — the timing
  constants and the delay hooks.
- `packages/web/src/components/chat/tools/activity-row/entries.ts` — the working
  label list (`ACTIVITY_WORKING_LABELS`) and `activityWorkingLabel(seed)`.
- `packages/web/src/components/chat/chat-timeline-rows.ts` — where the activity
  rows (and the empty "tail" row) are projected, and where `initial` is set.

---

## 1. What we mean

### Dead zone

A **dead zone** is a stretch of time where the assistant is *busy* (still
generating) but *nothing is streaming into the activity row* — no reasoning
text, no tool running, no answer text arriving. Left alone, the UI would show
nothing new during this stretch, which can read as "it's stuck".

To keep it feeling alive we may fill a dead zone with a **working word** (see
below). The whole design question is *when* to fill it: we only want to fill a
dead zone once a human would actually **perceive it as a stall** — not sooner,
or we churn through words for gaps nobody noticed.

There are two kinds.

### Mid-turn dead zone

A dead zone **in the middle of a turn, between steps** — e.g. one tool just
finished and the model is preparing the next step, or there's a pause between
reasoning bursts. **More output is still coming.**

- During the wait, the **previous step's label keeps shimmering**, so there's
  always a live signal on screen.
- If the gap lasts longer than `MID_TURN_DEAD_ZONE_MS`, we swap the shimmering
  label for the working word.
- Code path: the activity row still has entries in it
  (`entries.length > 0`), handled by `useDelayedWorkingGapHeader` /
  `waitingBetweenEntries`.

### End-of-turn dead zone

The empty stretch **after the assistant's visible answer**, where there is no
step in progress and the row has **nothing to show** (the empty "tail" row,
`entries.length === 0`, busy + current).

Two sub-cases land in this *exact same state* and cannot be told apart at the
moment they happen — only by how long they last:

1. **The turn is actually ending.** The answer is done; the busy flag simply
   hasn't flipped off yet (a frame or two of lag). We must **not** fill this, or
   a working word flashes for a split second under the finished answer. This is
   the flash bug this whole document came from.
2. **A genuine long pause after the answer** before the model produces more
   (e.g. it emitted text and is slow to start the next tool, especially with a
   large context / prefill). This one we *do* want to fill — but only if it
   lasts.

Because (1) and (2) are indistinguishable except by duration, we **wait
`END_OF_TURN_DEAD_ZONE_MS` before showing anything**. If the row is gone by then
(the turn ended) → no flash. If it's still there → it was a real pause → show
the working word. During the wait the space is simply blank beneath a
finished-looking answer, which reads fine. The activity shell stays mounted at
its normal height while its contents are hidden: removing the contents would
collapse the measured virtual row and make bottom anchoring visibly jump.

### Working word / working label

The placeholder verb shown during a dead zone (`ACTIVITY_WORKING_LABELS`). It is
chosen **deterministically from the activity row's key** via
`activityWorkingLabel(seed)`, so it is:

- **stable within a single dead zone** — it does not flicker while you stare at
  one gap, and
- **varied across different dead zones** — different gaps get different words.

Do **not** "fix" this to re-roll randomly on every render — that would make it
rapidly cycle words within a single gap, which is worse.

### Start-of-turn placeholder ("Thinking") — *not* a dead zone

The immediate **"Thinking"** placeholder at the very start of a turn (the
`initial` row) is a separate thing: it's the "we got your message"
acknowledgment. It must appear essentially immediately (~100ms) so keyboard
submits feel responsive, and it is **exempt** from the dead-zone delays. In the
component this is the `initial` prop on `ActivityRow`.

---

## 2. Decisions

The perception anchor: classic response-time research (Nielsen / Card) puts the
"flow of thought" limit at roughly **1 second** — below ~1s a gap doesn't
register as *stalling*, it just reads as normal responsiveness; above ~1s people
start wondering "is it stuck?". So we fill dead zones near, not far below, that
line.

### `MID_TURN_DEAD_ZONE_MS = 600` (was 400)

- **Why not 400:** at 400ms we were filling gaps a human hasn't even registered
  as a stall yet, which produced visible churn — "Thinking → Pondering →
  Thinking → Pondering" as short gaps kept crossing the threshold.
- **Why 600 and not 800–1000:** I am **intentionally choosing 600 for now** as a
  conservative first step up from 400. It swallows most quick step-to-step gaps
  and cuts the churn, without a big jump. **I may raise this to ~800 later**
  after watching it in real use — 800 sits closer to the ~1s perception line and
  would be the natural next move if 600 still feels twitchy. It's safe to sit
  below 1s here because the previous step's label keeps shimmering during the
  wait, so nothing ever looks frozen.

### `END_OF_TURN_DEAD_ZONE_MS = 1200` (was effectively 0 — the flash bug)

- **Why higher than mid-turn:** the cost of a false trigger is different. A
  mid-turn false trigger is mild churn; an end-of-turn false trigger is a
  visible *glitch* (the flash under a finished answer). And during the wait the
  space is just blank beneath a finished-looking answer, which is fine — so we
  can afford to wait longer to be *sure* the pause is real.
- **Why 1200:** it comfortably outlasts the busy-flag lag (a frame or two), so
  the end-of-turn flash never paints, while a genuine post-answer pause longer
  than ~1.2s still surfaces a word.

### Summary

| Dead zone            | On screen during the wait          | Delay before word | Constant                   |
| -------------------- | ---------------------------------- | ----------------- | -------------------------- |
| Mid-turn             | previous step's label, shimmering  | 600ms             | `MID_TURN_DEAD_ZONE_MS`    |
| End-of-turn          | blank (answer looks done)          | 1200ms            | `END_OF_TURN_DEAD_ZONE_MS` |
| Start-of-turn ("Thinking") — not a dead zone | the "Thinking" label | ~immediate (~100ms) | n/a (`initial` row)        |
