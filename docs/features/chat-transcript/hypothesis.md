# Transcript scroll flicker: hypothesis and fix plan

Status: implemented (2026-08-12). Written before the change so the reasoning can
be reviewed independently of the diff, and so a regression can be reverted
against a stated prediction rather than a guess.

Evidence: three raw `transcript-perf` probe traces recorded from dev tools on
2026-08-12 covering (a) steering during streaming, (b) end-of-turn jerk, and
(c) code-block streaming. Library behavior verified against
`@tanstack/virtual-core@3.17.0` (resolved for `@tanstack/react-virtual@3.14.2`).

## Symptoms

1. **Steer flicker.** While the assistant streams, an already-visible steered
   user message moves down, then up, repeatedly.
2. **End-of-turn jerk.** At the end of essentially every message the transcript
   jumps once, sharply.
3. **Code-block flicker.** Code blocks appear to flash while streaming.

## Root cause H1: TanStack's scroll offset goes stale after a direct DOM write

`Virtualizer.getScrollOffset()` returns `this.scrollOffset`, a cached value that
is updated **only** from the `scroll` event handler installed by
`observeElementOffset`. `elementScroll` is `scrollWithAdjustments`, which writes
`offset + adjustments`.

`writeTranscriptVirtualEnd()` — since renamed `commitTranscriptVirtualEnd()` —
assigned `root.scrollTop` directly and dispatched a
synthetic `scroll` event **only when the write was a browser-level no-op**. For
a real write the native `scroll` event arrives asynchronously. In that window:

- the DOM holds the new offset,
- `virtualizer.scrollOffset` still holds the old offset,
- any `resizeItem()` that runs first computes its correction from the old
  offset and overwrites Buddy's write.

`resizeItem` reaches that path whenever attached, because `wasAtEnd`
(`anchorTo === "end"` and `getVirtualDistanceFromEnd() <= scrollEndThreshold`)
takes precedence over `shouldAdjustScrollPositionOnItemSizeChange`. So while
attached, TanStack — not Buddy — owns size-change following. That part of the
architecture is already correct.

### Trace evidence (steering, events #490–#540)

| # | event | scrollTop |
|---|---|---|
| 490 | activity row measured 52 → 48 | |
| 491 | TanStack correction, base 2610, adjustments −4 | 2610 → 2606 |
| 494 | Buddy semantic-end write | 2606 → 2658 |
| 511 | previous assistant row grows +36 (action footer) | |
| 512 | TanStack correction, **base still 2610**, adjustments +32 | 2658 → **2642** |
| 539 | trailing repair observes a 51.8px gap | 2642 → 2694 |

`2610 + 32 = 2642` exactly. The two systems never disagreed about the intended
bottom; they disagreed about the current offset.

The end-of-turn trace shows the same failure at #1447 → #1461
(`1137 → 1125 → 1161 → 1125`, reversed 1.8ms after Buddy's write). **One root
cause produces symptoms 1 and 2.**

### Prediction

Notifying the virtualizer synchronously after every direct end-write removes all
opposite-direction scroll writes within a measurement batch. Motion while
attached becomes monotonic, and the gated 120ms trailing repair stops finding a
gap in the ordinary case.

## Root cause H2: activity row estimates are not derived from real geometry

`estimateRowSize` used `row.partIDs.length > 0 ? 96 : 52`. Neither number models
the rendered row, and having parts does not mean the row is expanded — a new
activity row always mounts collapsed.

Actual collapsed geometry:

```text
header button: py-1.5 (6 + 6) + text-xs line-height (16) = 28px
gap:           TRANSCRIPT_GAP_PX[previousLayoutRole]["activity"], or 20 with no previous role
```

giving 28 + 12 = **40px** after prose and 28 + 20 = **48px** at turn start. All
three traces show exactly `52 → 40` and `52 → 48` corrections. (The earlier
diagnosis of a `96 → 40` correction was wrong; the 96 branch never fires in any
trace. The fix is unaffected.)

### Prediction

The first opposing correction in each steer/terminal sequence disappears, and
newly appended activity rows stop churning the virtual range.

## Root cause H3: the assistant action footer mounts at the terminal transition

`assistantCopyPartID` was `active ? undefined : textPartID`, so the copy/fork
footer in `AssistantTextPart` mounted only once the turn became terminal:

```text
mt-3    12px
min-h-6 24px
total   36px
```

Every trace contains exactly one `+35.9…+36.2px` assistant row growth per turn,
with `buttonCount +2` and `svgCount +2` at the same instant.

Because that growth is reported by `ResizeObserver` a frame or more after the
commit, it cannot be netted against anything else that happened in that commit.
In the steering trace it is also the +36 at #511 that triggers the stale-offset
reversal — so this is not only the end-of-turn jerk, it is the trigger of the
steer flicker.

The footer is already `opacity-0` / `pointer-events-none` until hover, so
reserving its box costs nothing visually.

### Prediction

The deterministic terminal `+36px` measurement disappears from traces entirely.

### Reverted after H9

"Costs nothing visually" was wrong. Reserving the box put 36px of empty space
under every streaming answer, which reads as a gap between the assistant text
and the live activity row below it — reported from a screenshot, and the
clearest visual regression of this whole effort.

The reservation only ever existed because the growth could not be netted against
anything in its own commit. That premise is gone: H9 puts the bottom-follow
correction and the geometry it compensates in the same painted frame, and H4
means the ±40px tail row is no longer inserted and removed around the same
moment. A lone `+36px` at terminal is now the same shape as any streaming
paragraph — one downward step, followed in the same frame, invisible.

So the footer mounts at terminal again (`ownsActions && actionsEnabled`), and
`proseRowHeightPx` takes `hasActionFooter` so a streaming row does not estimate
space for a footer it has not mounted. The `+36px` is expected back in traces;
what must not come back is a *reversal* around it.

## Root cause H4: the end-of-turn dead-zone row inserts and removes 40px

`needsTailActivity` projects an empty tail activity row as soon as text stops
streaming while the session is still busy. `ActivityRow` then hides it with
`invisible` for `END_OF_TURN_DEAD_ZONE_MS` (1200ms) so its working word never
flashes — but `invisible` still occupies layout. The turn normally ends inside
that window, so the row is inserted (+40px) and removed (−40px) without ever
being seen.

The virtual spacer height is rendered from `getTotalSize()`, so the removal
shrinks the scroll range in the same commit and the browser clamps `scrollTop`.
That clamp produces no probe event, which is why it was invisible in the first
reading of the traces.

This is **not** fixed by H1–H3. Applied without it, H1–H3 make the transcript
land accurately at the bottom and thereby *expose* the clamp as a clean 40px
drop on every turn.

The existing code comment states the intent: "Hold it back until
`END_OF_TURN_DEAD_ZONE_MS` so the turn-ending case unmounts before its working
word ever paints." Today that holds back the paint but not the layout. Holding
back the row itself completes that intent rather than reversing it.

### Prediction

With H3 and H4 together, the active → terminal transition becomes a **zero**
total-size change with no deferred measurement.

## Root cause H5: the streaming tail paints one line taller than its final form

Found after H1–H4 landed, from live traces plus a frame-by-frame recording. Two
independent sources, same shape — content paints one line low, then collapses:

1. **Partial closing fence rendered as code.** A closing fence arrives one
   character at a time, and `openCode()` handed the whole body — including the
   partial `` `` `` — to the renderer. Marked's completed `code.text` has no
   trailing newline either, so the open block was one line taller than the
   completed one. `projectMarkdownBlocks`'s incremental fast path made it worse
   by appending each delta straight onto `src`, and that is the path every
   provider delta takes.
2. **The raw-markdown fallback's trailing `<br>`.** `sanitizeRawMarkdownFallback`
   converted every newline to `<br>`, and a streaming block's text almost always
   ends in one. The fallback paints for a frame before parsed HTML replaces it,
   one line taller.

Both are now covered by a projection-level invariant test: streaming a document
prefix by prefix may never reduce the projection's line count.

## Root cause H6: measurement deferred a frame behind the paint

`useAnimationFrameWithResizeObserver: true` wrapped `resizeItem` — and therefore
the bottom-following correction — in `requestAnimationFrame`. ResizeObserver
already fires after layout and before paint, which is the only moment a
correction can land in the same frame as the growth that caused it. The rAF
wrapper guaranteed one painted frame per line with the row already taller and
`scrollTop` not yet moved.

This is invisible to the probe: the `row-size` and `scroll-write` events are
milliseconds apart either way, because both run inside the deferred callback.
Clean traces and visible per-line jitter are consistent with each other here.

## Root cause H7: geometry that appears only after an async load

Two variants, both large:

- **Sub-pixel range churn.** A row measuring `8456 → 8455.828 → 8456` moved the
  total size enough to flip a virtual range boundary, unmounting and remounting
  an 8456px row three times in 15.6ms. Sub-pixel remeasures now skip
  `resizeItem` entirely — they cannot matter visually but can move a boundary.
- **HTML widget hydration.** `CompletedHtmlWidgetTool` rendered a one-line status
  row while `useHydratedInlinePresentation` fetched, then swapped in a ~480px
  frame. The box is now reserved up front, the same reserve-then-reveal shape as
  H3. Correction from review: the viewport preset is *not* known before
  hydration — `isPending` is true only while `presentation.data` is null, which
  is the same condition that hides the preset. The reservation therefore uses a
  fallback preset, and the loading and resolved states render the same outer
  shape so no status row disappears on hydration.

## Root cause H8: rows that lie about their size on send

Recorded in `thinking.ficker.trace.json` — four sends, the same three lies every
time. Every one is an estimate that disagrees with what the row measures a frame
later, so the bottom-follow chases the estimate and then unwinds it.

| row | entered at | measured | delta |
| --- | --- | --- | --- |
| assistant text part | 360px | 48px | −312 |
| user message | 108px | 88px | −20 |
| user message, first of session | 348px | 88px | −260 |

- **The assistant text row used `VIRTUAL_CHAT_TURN_ESTIMATE_PX`** (360) — a
  whole-turn number applied to a single part row that is empty at the moment it
  is appended, because the row is created when the part exists and the first
  delta has not arrived. At `@28836` the row entered at 360, `scrollTop` went
  `0 → 106` following it, the row measured 48, and 50ms later `scrollTop` was
  back at 0. That is the reported "up, down, then back up": the working-label
  row sits directly above the row that lies. Now `proseRowHeightPx`, derived the
  same way as the activity row — the `TRANSCRIPT_GAP_PX` gap plus 36px of empty
  prose chrome plus 24px per line. It reproduces all four heights the trace
  measured for one streaming row: 48, 72, 96, 136 (the last including a 16px
  paragraph margin the estimate does not model).
- **The user row counted text the bubble does not render.** `UserSection` shows
  only parts passing `isVisibleUserTextPart`; the estimate summed *every* text
  part, including synthetic ones and the four prompt-metadata kinds. One line of
  hidden context made a one-line message estimate two lines on every send, and
  the session's first message — which carries the largest synthetic context —
  estimate fourteen. The predicate now lives in `utils/user-message-text.ts` and
  both sides use it.

Probe gaps this exposed, both fixed:

- `TranscriptRowShellSnapshot.rowHeight` reads the virtual **wrapper**, whose
  height the virtualizer writes from its own size. Every trace that looked like
  a DOM height change (`88 → 348 → 88` on a row reading "hi") was reporting the
  estimate. `contentHeight` now reads the measured child, so the two can be told
  apart without arithmetic.
- `rows-appended` recomputed the estimate at record time rather than reporting
  what the virtualizer held: one send logged 88 while the row had entered at
  108, because the message had changed in between. It now reads
  `measurementsCache`.

Hardened: on one of four sends the *previous* turn's tail activity row
materialised above the new turn's rows (`activity:<prev>:1` inserted at index 7,
+40px) and was removed 62ms later when the new turn's own row appeared.
`activeTurnIndex` was searching every historical turn for a non-terminal
assistant. It now accepts a running assistant only from the latest
assistant-bearing turn, so a newer assistant response permanently supersedes
stale state from older turns. User-only steer turns still follow the latest
assistant-bearing turn; distinguishing a real steer from a stale latest record
requires fixing the upstream terminal marker rather than guessing from turn
ordering.

## Root cause H9: the scroll write is direct, the geometry it compensates is React

The one that survived H1–H8. Frame-by-frame measurement of a 244-frame capture
(75fps, `Screen Recording 2026-08-13 at 04.58.00.mov`), template-tracking the
steered bubble's top edge:

```
resting y = 494
frame   8   470   (-24, one prose line)      → 9   back to 494
frame  61   454   (-40, line + para margin)  → 62  back to 494
frame 130   454   (-40)                      → 131 back to 494
frame 190   454   (-40)                      → 191 back to 494
```

Ten such events, **one frame each**, always upward, always exactly one line or
one line plus its 16px paragraph margin — and only once the transcript reaches
the bottom and starts following.

`resizeItem` (`virtual-core` ~822) does, in this order:

```js
if (wasAtEnd) applyScrollAdjustment(getTotalSize() - prevTotalSize)  // writes scrollTop now
this.notify(false)                                                   // React re-render, later
```

`applyScrollAdjustment` reaches `scrollToFn` and sets `root.scrollTop`
synchronously inside the ResizeObserver callback — before paint, which is what
`useAnimationFrameWithResizeObserver: false` bought. But the geometry that write
compensates for — each wrapper's `height: virtualRow.size` and each following
row's `translateY(virtualRow.start)` — is rendered by React, and `notify(false)`
is not the `flushSync` path. So the browser paints one frame with the new offset
against the old positions: everything below the row that grew sits exactly `Δ`
too high, and the new line is still clipped by the wrapper's stale height. The
next commit puts it back. `wasAtEnd` is the only branch that reaches this while
anchored, which is why nothing flickers until the transcript is following.

The spacer was already immune — `scrollToFn` writes
`virtualContent.style.height` directly. The rows were not.

**Fix:** `syncVirtualRowGeometry`, called from the virtualizer's `onChange`,
writes every mounted wrapper's height and transform in the same synchronous turn
as the scroll write. Idempotent with the React commit that follows.

react-virtual ships `directDomUpdates`, which does exactly this — but it writes
to the element registered with `measureElement`, and the transcript measures the
inner child while the wrapper carries the transform. Merging the two is not an
option: the wrapper's explicit height is what makes it a wrapper.

## Explicitly rejected: rewriting Markdown / code-block identity

The code-block trace shows the assistant timeline row stays mounted, each code
wrapper adds ~69–70px exactly once, and existing code buttons persist. The
current projection already seals completed blocks, keeps open fences in
`MarkdownCodeBlock`, and preserves DOM identity through completion (covered by
`markdown-stream-rendering.test.tsx`).

Hypothesis: **code blocks look like they flicker because the viewport is
oscillating around them.** Re-trace after H1–H4 before touching projection. If
an existing code shell genuinely remounts, fix that mode transition; do not
redesign the projection.

## Also rejected

- Removing `anchorTo: "end"`. While attached, `wasAtEnd` is what performs
  correct per-measurement following. It works.
- Enabling `followOnAppend`. Buddy deliberately owns row-append following so it
  can gate on attachment and gesture state.
- Deleting the 120ms trailing repair. It is a gated safety net, not a duplicate
  loop. After H1 it should rarely fire; that it fires is a signal worth keeping.
- Increasing debounces or scroll thresholds. That slows reversals without
  removing them.

## Invariant this work establishes

> While attached to the bottom, a height change of `Δ` causes exactly one scroll
> correction of `Δ`, in the same direction. While detached, streaming causes no
> bottom-following correction at all.

## Change set

1. **`commitTranscriptVirtualEnd(reason)`** — one operation for every direct
   end-write: sync the spacer, mark the scroll programmatic, write `scrollTop`,
   then notify the virtualizer synchronously. Replaces the three ad-hoc call
   sites, two of which never marked the write as programmatic. The probe records
   the reason.
2. **Probe fidelity** — `scrollToFn` records the effective target
   (`offset + adjustments`), not the pre-adjustment base, so a trace no longer
   reads `req=2610 → DOM 2642`.
3. **Activity estimate** — derived from the collapsed header height plus the
   shared `TRANSCRIPT_GAP_PX` table.
4. **Stable action ownership** — the action owner is identified while active,
   but the footer mounts only when actions become enabled at terminal. The
   synchronous geometry correction makes that terminal growth paint-stable
   without leaving an empty footer under streaming answers.
5. **Deferred end-of-turn tail row** — the reveal delay moves from
   `ActivityRow`'s `invisible` class up into row projection, so the row is not
   created until it would actually be shown.

Implementation order matters: 1 first (it removes reversals in both symptoms),
then 3, then 4 and 5.

## How to falsify

Re-record the same three traces and check:

- No two scroll writes with opposite signs inside one measurement batch.
- No `row-size` event with `deltaPx ≈ 36` on an assistant row at terminal.
- No activity row `52 → 40` or `52 → 48` correction.
- No tail-activity insert/remove pair on a turn that ends normally.
- `bottom-anchor-repair` events become rare rather than routine.
- While detached: no semantic-end writes and no trailing repairs at all.

If code-block flicker survives all of that, the remaining work is Markdown
projection — and only then.
