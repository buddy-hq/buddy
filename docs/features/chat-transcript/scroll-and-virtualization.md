# Chat transcript scrolling, streaming, and virtualization

## Purpose

This document is the authoritative account of scroll ownership, attachment, and
virtualization in the chat transcript, and the durable record of the July 2026
investigation that produced it. It explains the architecture, the symptoms that started the work, the evidence gathered, the changes made, the approaches rejected, and the decisions that should not be reopened without new evidence.

The investigation crossed four systems that initially looked like one scrolling bug:

1. Bottom attachment and composer clearance.
2. Transcript-row measurement and virtualization.
3. Streaming and terminal Markdown rendering.
4. Client stream backpressure and Stop recovery.

The main lesson is that a scroll movement is usually a reaction to geometry or data. The scroll controller should be changed only after proving that it owns the bad state.

## Current status

The following behavior has been implemented and verified:

- New transcript rows and asynchronous row growth remain above the composer while the user is attached to the bottom.
- Optimistic Thinking is created only after the optimistic user row exists, so it cannot flash beneath the prior assistant turn before moving into the new assistant slot.
- Virtual-end writes synchronize the DOM spacer height before setting `scrollTop`, so tall selected text and inline assets cannot be browser-clamped beneath the composer while waiting for assistant generation.
- ActivityRow titles are argument-free category statuses, preserve semantic identity across equivalent tool phases and brief working gaps, and reveal working copy only after the dead-zone delay. See [dead-zone.md](./dead-zone.md) for the current values.
- A user who scrolls up is not pulled back down by a resize or a delayed repair.
- Resize handling no longer starts an unconditional `scrollToEnd()` loop.
- Streaming Markdown preserves its document and semantic segment identities through embedded-renderer and terminal transitions.
- Large mixed Markdown documents can evict expensive offscreen bodies while retaining bounded placeholder geometry.
- Stop fences only the aborted session's transcript/status events during authoritative recovery, so stale queued events cannot replay while unrelated directory events continue normally.
- A first-time task selection starts at the latest row; switching back to a recently visited task starts from that task's last finite offset and restores whether it was attached or detached.
- Markdown images reserve deterministic broken-image space and reuse bounded intrinsic dimensions after a successful load, so task remounts do not replay known image geometry.
- Markdown caller typography classes share the document's authoritative prose root.
- The stream consumer drains a fresh processing budget after yielding and compacts superseded text events before React receives them.
- Buddy DevTools can capture the ordered transcript, renderer, stream-buffer, and Stop lifecycle.

The 12,000-character eager-to-lazy Markdown transition remains in place. A stress trace recorded a one-time offscreen height correction at that boundary, but the row bottom stayed anchored and the user did not observe a visual jump. Do not redesign this transition solely because the probe reports a height correction. Revisit it only with evidence of visible movement, lost reading position, or unacceptable main-thread cost.

## Architecture in plain language

Think of the transcript as a long picture book.

### Transcript-row virtualization

Each user message, activity group, tool, and assistant part becomes a timeline row. TanStack Virtual renders rows around the viewport and represents distant rows using remembered or estimated height. This bounds the amount of live transcript DOM.

The current streaming row is special. It must remain available while it grows, and a single assistant text part can become much taller than the viewport. Outer row virtualization therefore cannot solve all work inside that row.

### Long-Markdown virtualization

A giant assistant text part is divided into Markdown leaves or chunks.

- A **resident** leaf has its real DOM mounted: prose, headings, KaTeX, links, and other rendered content.
- An **evicted** leaf has had that expensive DOM removed.
- A **placeholder** is the lightweight wrapper that remains after eviction. It preserves the leaf's last measured height, or an estimate if the leaf has never been measured.

Leaves near the viewport are resident. Far-offscreen leaves may be placeholders. The live streaming tail remains resident.

Task switching does not keep all this DOM alive. The transcript is keyed by session, so switching tasks unmounts the transcript and its Markdown subtree. Bounded caches retain data, measurements, expansion state, and recent scroll offsets—not live DOM for every task.

### Attachment

Attachment means that the user is following the end of the transcript. While attached, row additions and relevant height changes may move the scroll offset so the bottom remains above the composer.

Scrolling upward detaches the user. Active wheel/touch gestures and detached state must block automatic bottom correction.

### Bench width

Opening Bench narrows the conversation pane. The same text wraps onto more lines, so valid row and block heights change. Measurements are width-dependent; a height measured in the wide chat cannot be assumed correct in the narrow chat.

Width reflow is expected. Replacing content with an unrelated shell, losing the reading position, or retaining stale placeholder measurements is not.

## Vendor comparison

Buddy is vendor-aligned but cannot copy the vendor transcript literally.

Vendor's session UI:

- Projects streaming Markdown into completed blocks plus a changing live tail.
- Reuses the prior projection when text extends monotonically.
- Uses `morphdom` to update existing block DOM.
- Uses message-level `content-visibility: auto` and its timeline virtualization for offscreen cost.
- Does not have Buddy's 12,000-character inner eager-to-lazy Markdown switch.
- Does not have Buddy's combination of inline Mermaid, chemistry, KaTeX, media, HTML widgets, and a pinned giant active row.

Buddy's stable semantic Markdown identities are aligned with vendor's incremental-block principle. Buddy's bounded inner residency is a product-specific extension. Copying vendor exactly would keep the full active 80,000-character response mounted, including Buddy's heavier renderers.

The vendored core should not be patched for these Buddy UI concerns. Vendor code is reference material; Buddy-owned behavior belongs in `packages/web`.

## Where the investigation started

The original report was intermittent auto-scroll failure:

- Text usually followed correctly.
- Inline renderers, tools, assets, and headings could grow or appear below the composer.
- The failure was not limited to inline assets; an activity/summary heading could also disappear under the composer.
- Vendor had related tool/block behavior but not Buddy's inline asset mix.

The work began under an explicit constraint: preserve the existing staged snapshot. The original index hash was recorded as:

```text
b88891310c3ad870c9ad034f8da4a106c562e052
```

All investigation fixes were developed as an unstaged overlay and the staged hash was repeatedly rechecked.

## Phase 1: bottom attachment and async row growth

### First hypothesis

Buddy had copied the virtualizer configuration but missed two vendor-style follow handshakes:

1. Re-anchor after an already-present row changes height asynchronously.
2. Re-anchor when the projected timeline row count changes.

Buddy followed appends in some paths, but late renderer growth updated TanStack's measurements without an explicit Buddy follow decision. Buddy also disables browser overflow anchoring while attached, so the browser could not compensate independently.

This predicted the reported pattern:

- Ordinary text appends often worked.
- Same-key renderer, heading, or activity growth sometimes left a positive bottom gap.
- A newly added user/activity row could exist below the visible composer boundary.

### Probe and regression

The existing Buddy DevTools Transcript Geometry surface already recorded `row-size` and `scroll-write`. A regression test drove an attached bottom row through multiple same-key height changes.

The failing signature was:

```text
row-size -> scroll-write -> row-size -> no later bottom correction
```

The first resize was corrected, but a second resize arrived before the scroll state settled and became the final uncorrected event.

### Initial fix

Two missing follow paths were added:

- Coalesced correction after asynchronous row measurement.
- A row-count anchor when the projected timeline gains a semantic row.

Both were gated by attached/detached state and active user gestures.

The first live renderer-plus-headings stress run kept the complete tail above the composer, including three Mermaid renderers and six trailing headings. The probe captured 273 row-size events and growth up to 408px while the tail remained visible.

### Regression introduced by the initial fix

The first implementation called `scrollToEnd()` after every measured resize. This was too strong.

LaTeX placeholders, KaTeX completion, Mermaid loading, and renderer measurements can change height many times. TanStack Virtual was already adjusting for row-size changes. The additional unconditional Buddy write created a second reconciliation loop and could visibly bounce the viewport.

This regression belonged to the scroll fix and was removed.

### Final resize model

The accepted model is:

- Let TanStack perform its normal one-shot size adjustment.
- Use a one-shot virtual-end write for semantic row additions.
- Schedule a trailing repair only when the viewport is still genuinely separated from the bottom after geometry settles.
- Never repair while detached or during an active user gesture.
- Do not run an unconditional `scrollToEnd()` loop for every measurement.

The trailing repair delay is currently 120ms. Its purpose is to catch a missed final gap, not to continuously animate against renderer churn.

## Scroll ownership (authoritative)

Three mechanisms can move the transcript. They are not interchangeable, and the
distinction is the difference between a stable transcript and a flickering one.

| Change | Owner | Mechanism |
| --- | --- | --- |
| A mounted row changes height | **TanStack Virtual** | `resizeItem` → `applyScrollAdjustment` |
| A new row is appended at the tail | **Buddy** | `commitTranscriptVirtualEnd("semantic-row-addition")` |
| A settled gap remains after either | **Buddy** | gated 120ms trailing repair |

### Why TanStack owns size changes while attached

`shouldAdjustScrollPositionOnItemSizeChange` returns `false` while attached, and
it is tempting to read that as "Buddy repairs the bottom instead." It does not.
In `virtual-core`'s `resizeItem`, `wasAtEnd` is evaluated **before** that
predicate and takes precedence:

```js
if (wasAtEnd) {
  this.applyScrollAdjustment(this.getTotalSize() - prevTotalSize)
} else if (shouldAdjustScroll) {
  this.applyScrollAdjustment(delta)
}
```

`wasAtEnd` is true when `anchorTo === "end"` and the viewport is within
`scrollEndThreshold` (80px) of the virtual end — which is exactly the attached
case. So while attached, the custom predicate is unreachable and TanStack applies
the total-size delta itself. This is correct and should not be "fixed".

### Why a direct write must notify the virtualizer

`Virtualizer.getScrollOffset()` returns a cached value refreshed **only** from
the `scroll` event installed by `observeElementOffset`. A native scroll event is
asynchronous. Between a direct `scrollTop` assignment and that event, the DOM
holds the new offset while the virtualizer still believes the old one, and any
row measurement landing in that window computes its correction from the stale
base and reverses the write.

`commitTranscriptVirtualEnd()` therefore replays the resulting offset as a
synchronous `scroll` event. Every call site is a timer, animation frame,
ResizeObserver callback, or passive effect, so this never runs during render.

Recorded evidence of the failure it prevents, from a steering trace:

| # | event | scrollTop |
| --- | --- | --- |
| 490 | activity row measured 52 → 48 | |
| 491 | TanStack correction, base 2610, adjustments −4 | 2610 → 2606 |
| 494 | Buddy semantic-end write | 2606 → **2658** |
| 511 | previous assistant row grows +36 | |
| 512 | TanStack correction, **base still 2610**, adjustments +32 | 2658 → **2642** |
| 539 | trailing repair observes a 51.8px gap | 2642 → 2694 |

`2610 + 32 = 2642` exactly. The two systems never disagreed about the intended
bottom; they disagreed about the current offset.

### Why measurement must not be deferred a frame

`useAnimationFrameWithResizeObserver` must stay `false`. ResizeObserver fires
after layout and before paint, which is the only moment a correction can land in
the same frame as the growth that caused it. Wrapping `resizeItem` in
`requestAnimationFrame` guarantees one painted frame per line with the row
already taller and `scrollTop` not yet moved — a per-line jitter that no scroll
trace can show, because both events then run inside the deferred callback.

### Why the correction and its geometry must share a frame

`false` alone is not enough. `resizeItem` writes `scrollTop` directly and then
calls `notify(false)`, an ordinary React re-render — so the offset moves before
paint while the geometry it compensates (each wrapper's height, each following
row's `translateY`) waits for the next commit. That frame paints the new offset
against old positions: everything below the row that grew sits exactly one line
too high, then snaps back. Frame-by-frame capture of a steered message showed ten
such events in five seconds, `-24px` on a line and `-40px` on a paragraph break,
one frame each — and only while attached, since `wasAtEnd` is the only branch
that reaches this.

`syncVirtualRowGeometry`, called from the virtualizer's `onChange`, writes every
mounted wrapper's height and transform in that same synchronous turn. The spacer
was already immune because `scrollToFn` writes its height directly; the rows were
not. react-virtual's own `directDomUpdates` does this but styles the element
registered with `measureElement`, which here is the measured child rather than
the wrapper carrying the transform.

This is what makes a lone growth safe to follow, and therefore what allowed the
action footer's reservation to be dropped.

### Geometry that must not change after the fact

Anything that *arrives* at a size the user could not anticipate must reserve it
rather than appear later. This is not a licence to reserve space for content the
turn has not produced: the assistant action footer was reserved through the whole
turn and that cost 36px of empty space under every streaming answer — a visible
gap above the live activity row. It now mounts at terminal and the bottom-follow
handles the growth, which is correct once a correction and its geometry share a
frame (see below). Two cases remain load-bearing:

- The end-of-turn dead-zone row is withheld from projection until its pause is
  real, rather than mounted hidden at full height. See [dead-zone.md](./dead-zone.md).
- An HTML widget reserves a box while its descriptor hydrates. Its real viewport
  preset lives in that descriptor, so the pre-hydration reservation uses
  `HTML_WIDGET_FALLBACK_VIEWPORT_PRESET` and the loading and resolved states
  render the same outer shape (frame only, no status row). This trades the full
  collapse-and-expand for a bounded aspect correction.

Sub-pixel remeasures are ignored outright: they cannot matter visually but can
flip a virtual range boundary and remount a very tall row.

### Row estimates

An estimate is corrected in the same frame as the write that revealed the row, so
an overshoot on a newly appended row *is* the flicker. Every estimate is derived
from rendered geometry, never tuned, and counts only what the row renders.

**User rows.** A one-line message measures 88px: 68px of chrome (`px-4 py-3`
bubble padding, the `mt-1 min-h-6` action footer, the row's leading gap) plus a
20px `text-sm` line box. Lines come from `textLength` against the bubble's 64ch
cap; non-text parts (attachment chips, selection clips) are counted separately
rather than as lines.

`textLength` is the *rendered* text: `visibleUserTextLength` applies the same
`isVisibleUserTextPart` predicate `UserSection` renders with, so synthetic parts
and the four prompt-metadata kinds are excluded. Summing every text part made a
one-line message estimate two lines on every send, and the session's first
message — carrying the largest synthetic context — estimate fourteen (348px
against a measured 88px).

The estimate before that used `partIDs.length` as a line count, so a two-part
message was estimated at two lines regardless of its text. A recorded steer
entered at 144px and measured 88px — a 56px jolt on the row the user had just
sent, at the moment it appeared.

**Assistant prose rows.** `proseRowHeightPx` is the gap from `TRANSCRIPT_GAP_PX`,
plus 24px per `text-sm` line, plus the 36px action footer *only when the turn is
terminal*. A streaming row appended before its first delta therefore estimates as
an empty row. It used to fall through to `VIRTUAL_CHAT_TURN_ESTIMATE_PX` — a
whole-turn number — so every turn appended a row at 360px that measured 48px, and
the bottom-follow chased all 360 before unwinding 312 of it a frame later.

Paragraph margins (16px per break) are not modelled; they are not derivable from
a character count.

### Activity row estimates

`estimateRowSize` derives a collapsed activity row from the same spacing table
the renderer uses:

```text
collapsed header (py-1.5 + text-xs line box) = 28px
+ TRANSCRIPT_GAP_PX[previousLayoutRole]["activity"]  (20px when there is none)
```

giving 48px at turn start and 40px after prose. An estimate corrected in the same
frame as a bottom write leaves the virtualizer and the transcript disagreeing
about where the end is.

## Phase 2: the in-flight transcript trace

The old geometry probe was insufficient because it showed scroll consequences without showing what the renderer or stream did first.

The DevTools Transcript surface was extended into an explicit capture session:

1. Press **Start**.
2. Send one stress message.
3. Optionally open Bench or press Stop during the turn.
4. Wait for the intended observation window.
5. Press **Stop** in DevTools.
6. Copy the frozen trace.

The ordered trace includes:

- Streaming source length and hash.
- Markdown phase: streaming, complete, or interrupted.
- Markdown branch: eager, lazy, segmented, or segmented-lazy.
- Semantic document, segment, and block identities.
- Parse state and parse duration.
- Resident and placeholder block counts.
- Render-shell state, KaTeX placeholders/nodes, Mermaid loading/ready/error, and inline media.
- Markdown image pending/ready/error state, intrinsic dimensions, and rendered dimensions.
- Row mounts, unmounts, measurements, and virtual ranges.
- Scroll writes, no-ops, and bottom repairs.
- Rows appended at the tail, with the estimate each entered at (`rows-appended`).
  A capture started after a steer sees only ordinary streaming, so without this
  the moment a steered row appears is invisible.
- Stream-buffer flushes with queued and applied counts.
- Stream suspension, discarded events, and resume.
- Stop request and abort settlement.
- RAF gaps, long tasks, and layout shifts.

### Probe caveat

Browser `PerformanceObserver` entries requested with buffering can predate **Start**. Several traces contained old long tasks and layout shifts clamped to offset zero. Capture-only performance analysis must exclude pre-capture entries instead of trusting the top-level totals blindly.

## Phase 3: LaTeX, Mermaid, and Markdown lifecycle

### Origin/main comparison

The LaTeX parser, loading placeholder, Markdown shell, streaming-text hook, and math styling were compared directly with `origin/main`. They were byte-identical at the time of diagnosis.

The repeated forced scroll correction was new unstaged work; the underlying renderer churn was already present in main or the staged transcript refactor.

This separated two concerns:

- Scroll writes could amplify renderer churn.
- Renderer churn could independently destroy and rebuild geometry.

### First full stress trace

One mixed LaTeX/media response showed a critical structural collapse:

```text
12,725px -> 1,246.75px -> 12,439px
```

The virtualizer reacted with scroll adjustments of approximately:

```text
-11,367px -> +11,192px
```

Additional evidence:

- KaTeX node count generally grew monotonically; recurring small skeletons were often newly opened equations, not destruction of every completed equation.
- The large collapse was abnormal: most surrounding Markdown/KaTeX disappeared and then rebuilt.
- Mermaid rows themselves remained geometrically stable around 612-613px in that trace.
- Auto-scroll bottom repair fired only four times, ruling out a runaway repair loop as the primary cause.
- The problematic row produced thousands of DOM mutations and many redundant measurements.

The scroll controller was reacting to real geometry loss.

### Stop and terminal transition

The trace initially made the final dump look like a slow abort. Closer ordering showed that token delivery and UI finalization were different phases.

At terminal/interrupted state, the old Markdown pipeline could:

- Include interruption state in parse/cache identity even though parsing did not use it.
- Change React block keys when live/full/code mode changed.
- Replace a streaming multi-block projection with a different terminal projection.
- Temporarily show estimated lazy shells while reparsing.
- Re-run KaTeX and media decoration and then remeasure the outer row.

Vendor also performs a final non-streaming Markdown render, but Buddy adds React block projection, long-Markdown residency, inline renderers, and asset measurement.

## Full Markdown and transcript audit

The audit considered outer transcript virtualization, inner Markdown virtualization, stream/repository ordering, task switching, asset measurement, and git history.

### What history showed

- Transcript virtualization was added on March 30 for whole turns and later redesigned around individual timeline rows.
- Long-Markdown virtualization was added on May 18 as part of a broad parser/math/streaming overhaul.
- The 12,000-character threshold, 2,400-character target block size, 4,800-character maximum token size, and 220px fallback estimate were introduced together.
- The May commit described long-output protection but did not include a benchmark justifying the exact 12,000-character cutoff.
- Inner Markdown virtualization was added after outer transcript virtualization, but before the later row-level transcript redesign.

The inner layer is not pointless legacy. One enormous active text part is still one outer row, so outer virtualization cannot reduce work inside it. However, parts of the implementation had become stale or duplicated after later refactors.

### Mounting concern

Keeping every activated Markdown block mounted forever would be wrong. It would retain heavy DOM inside a single enormous active response.

Stable identity does not require permanent residency:

- Keep lightweight semantic wrappers and their last measurements.
- Keep heavy bodies only near the viewport and at the live tail.
- Evict far-offscreen heavy bodies.
- Unmount the entire transcript on task switch.

### Mixed-renderer finding

The first reproduced mixed Mermaid/LaTeX collapse did not prove that the old `VirtualizedMarkdown` alone was responsible. A renderable Mermaid/chemistry segment could select a different top-level Markdown branch, and the old implementation bypassed long-response protection for surrounding HTML.

Therefore, merely changing lazy block keys would have missed the captured failure. The document/segment projection also had to remain stable when an embedded fence appeared or closed.

### Measurement finding

Ordinary Markdown HTML and code roots were reporting through an API named for inline assets. This created extra `ResizeObserver` instances and misleading probe counts. The outer timeline row already has TanStack measurement.

Explicit lifecycle reporting should be reserved for genuinely asynchronous assets that need it. Ordinary Markdown layout should flow into the outer row's normal measurement.

### Legacy and overlap found during the audit

The audit identified the following stale or overlapping pieces:

- An unused Markdown overscan constant.
- An eager-render escape hatch with no remaining caller from old transcript staging.
- A streaming-text abstraction that had become a direct identity function.
- Duplicate protection of running sessions in cache retention.
- Parser-level and React-level block splitting/caching that overlapped.

Only remove such pieces with focused regression coverage; their existence alone is not permission to rewrite the pipeline.

### Rejected monotonic-length rule

It is unsafe to keep whichever text string is longest. Authoritative part snapshots may intentionally correct earlier deltas with shorter text. Vendor tests support corrected shorter snapshots.

Repository correctness must come from event ordering and recovery fencing, not string length.

## Phase 4: accepted Markdown changes

The Markdown work kept transcript-row ownership unchanged and repaired the subtree inside a text row.

Implemented behavior:

- Semantic document and segment shells remain stable when Mermaid or chemistry fences appear or close.
- Streaming blocks keep stable part-and-ordinal identities through completion/interruption.
- Large HTML leaves can use bounded residency even inside mixed embedded-renderer documents.
- Heavy offscreen DOM can be evicted while lightweight wrappers retain measured space.
- Interruption metadata no longer invalidates Markdown parsing by itself.
- Ordinary Markdown blocks no longer masquerade as inline assets.
- Obsolete eager-Markdown plumbing and the unused overscan constant were removed.
- The trace exposes phase, branch, source identity, semantic keys, residency, and parse timing.

Focused Markdown/scroll tests reached 79 passing tests during this phase. Lint and repository-root typecheck passed, with only unrelated existing lint warnings.

## Phase 5: the apparent two-minute Stop

### Symptom

In a later trace, pressing Stop did not appear to stop generation. Text continued appearing for almost two minutes.

The new Markdown trace proved that this was not merely delayed paint:

- The visible text part had about 5,179 characters at Stop.
- It had grown to 9,344 characters when the trace ended and was still increasing.
- Canonical backend storage already contained the completed 11,929-character response.
- Backend completion happened 35.9 seconds before Stop was pressed.

The model was not still generating. The frontend was replaying an SSE backlog.

### Root causes

Two systems composed without an ordering contract:

1. The inherited stream consumer set its yield timestamp before yielding. Under a busy renderer, the next iteration could immediately believe its budget was exhausted and yield again, degrading toward one event per turn.
2. Buddy added immediate authoritative transcript recovery after abort, but did not fence the already-open SSE stream. Pre-recovery queued deltas could therefore apply after the recovered snapshot.

Vendor had a similar buffered event loop, including the yield-timing flaw, but did not combine Stop with Buddy's immediate recovery reload. The stale-replay hazard was Buddy-specific.

### Initial stream and Stop fix

- Record a fresh drain budget after yielding so the next burst receives its intended processing window.
- Compact superseded text deltas/snapshots within a buffered burst before React sees them.
- Preserve tool raw-state ordering; do not compact tool deltas using text rules.
- Suspend and discard the directory's old live stream before abort/recovery.
- Load the authoritative transcript while the old stream is fenced.
- Resume/reconnect only after recovery is complete.
- Expose queued/applied/discarded counts and suspend/resume boundaries in the probe.

This implementation proved the stale-replay diagnosis and passed the original Stop stress trace, but a later review found that its recovery boundary was too broad. The directory has one SSE connection carrying background-session messages, Bench actions, watcher updates, and other product events. Closing that connection and clearing its whole buffer could lose unrelated events that transcript-only recovery did not reload. The session-scoped refinement is recorded below.

Restarting only the backend was rejected because the backend was already complete. Reloading the Buddy window was a temporary way to discard a stuck client queue, not the fix.

### Verification trace

The final Stop verification recorded:

- Stop request at `+93,313.3ms`.
- Stream suspension `1.9ms` later.
- One queued event discarded.
- Stream resume at `+94,491.5ms`.
- Successful abort settlement after `1,178.4ms`.
- Text length 18,173 at Stop.
- One authoritative recovered/final snapshot at 18,350 characters.
- Stable source length and hash for the remaining approximately ten seconds of capture.
- 5,729 queued events compacted to 1,060 applied events.

The accepted contract is: one authoritative final snapshot may appear after Stop, but text must not continue dribbling for minutes.

Focused verification after the stream fix passed 77 tests across scrolling, Markdown, stream buffering, repository reconciliation, Stop suspension, raw tool-delta ordering, and the DevTools trace. Lint, root typecheck, and `git diff --check` passed.

## Phase 6: review regressions and ownership refinements

### Stop fencing was directory-wide

The first replay fix treated the directory SSE connection as though it belonged only to the selected transcript. It did not. Suspending it during abort recovery also discarded background-session, Bench, watcher, and other directory events, while recovery reloaded only session lists/statuses and the selected transcript.

The corrected design keeps the directory stream connected:

- Starting Stop recovery removes already-buffered message and status events only for the aborted session.
- New message and status events for that session are ignored until authoritative recovery completes.
- Events for other sessions, Bench, watchers, references, and other directory concerns continue through the existing buffer and handler.
- Nested fences for the same session are reference-counted.
- The probe records `session-fence` and `session-resume`, including queued and in-flight target events discarded. It no longer describes this as a directory stream pause.

The session filter covers `message.updated`, message/part removal, part update/delta, and `session.status`, using the session ID from each event's protocol shape. Session errors and unrelated session metadata are not silently discarded because transcript recovery does not authoritatively reconstruct all of them.

### Detached state leaked across task selection

`useAutoScroll` is owned by the directory page controller, above the session-keyed `ChatTranscript`. Keying the transcript therefore unmounted its rows but did not reset the hook's detached ref. Opening a cached task after scrolling up in another task could initialize the new virtualizer at offset zero and block later bottom anchoring.

The first correction treated every `sessionKey` change as a fresh attached task. That fixed cross-task inheritance, but it also discarded legitimate reading position: switching from chat 1 to chat 2 and immediately back sent both chats to the end.

The accepted behavior is bounded, task-scoped scroll memory:

- A task with no recent scroll snapshot starts attached at the latest row.
- Every scroll stores that task's attached/detached flag and absolute virtual scroll offset.
- Returning to a **detached** task supplies its saved finite offset directly as TanStack Virtual's `initialOffset`; it does not begin with the previous task's offset and then correct after paint.
- A task that was **attached** is restored semantically, not by pixel. `useAutoScroll.initialScrollOffset()` returns `undefined` for it, and the virtualizer seeks the current virtual end. An attached position means "follow the end", and the end may legitimately have moved while the task was unmounted. This superseded the earlier attempt to restore attached tasks from a saved pixel offset; see [chat-switch-flicker.md](./chat-switch-flicker.md).
- Each task restores independently, so chat 1 can reopen in the middle while chat 2 reopens at the top.
- **Jump to latest** clears detached reading state, records the resulting finite bottom offset, and makes future revisits follow the end.
- The scroll-state cache shares the timeline cache's 16-session bound. Eviction, page/controller unmount, or app restart may naturally lose an old position.
- Key changes still clear transient gesture and programmatic-scroll markers so one task cannot inherit another task's active interaction.

### Attached task revisits flickered while cached geometry rehydrated

The first task-position fix returned a saved offset only when the task was detached. A revisited task that was still attached therefore initialized with `Number.MAX_SAFE_INTEGER`. The first correction made attached tasks retain the same bounded finite-offset snapshot as detached tasks. That removed the sentinel, but it was insufficient and briefly made the underlying disagreement more visible.

A follow-up trace showed the exact four-write oscillation on every revisit:

```text
saved task offset:       18,211
cached virtual end:      22,733
saved task offset:       18,211
cached virtual end:      22,733
```

The large final Markdown row then rehydrated from `14,397.875px` of fresh placeholder estimates to `13,014px` and finally `9,812px`. Bottom anchoring followed those corrections from `22,733 → 21,349 → 18,147`. The same sequence repeated on the next switch. Restarting the backend could not affect it because no streaming or server event participated.

Two ownership mistakes composed:

- Initial bottom-anchor effects treated the cached virtual total as more authoritative than the task's saved finite offset.
- `LazyMarkdownBlock` kept its last measured placeholder height only in a component ref. Task switching correctly unmounted that component, so every remount rebuilt distant blocks from character-based estimates before measuring them again.

The accepted fix keeps the saved task offset authoritative during initial remount and skips only the initial force-to-virtual-end effects. Genuine later row additions and settled resize repairs still follow the end while attached. Separately, a bounded cache retains only numeric Markdown block heights across remounts. Entries are keyed by semantic block identity, content hash, and transcript width, so changed content and Bench width cannot reuse incompatible geometry. Heavy Markdown DOM is still unmounted on task switch and evicted offscreen normally.

First visits still have no scroll snapshot and intentionally start at the latest row. Programmatic **Jump to latest** records its final DOM offset synchronously so an immediate task switch cannot preserve the pre-jump value.

A later review found the complementary stale-offset case: the saved finite offset can cease to be the true end while the task is unmounted because Bench shortens the viewport or background activity adds rows. The initial row-count reference already begins at the current count, so it cannot distinguish those hidden additions. Preserving the offset forever would leave an attached task above its tail while **Jump to latest** remained hidden.

The refined handshake preserves both requirements. The saved finite offset still owns the first paint, preventing cached virtual totals from causing switch flicker. A restored attached task then schedules one bottom-distance reconciliation after the existing 120ms resize quiet window. If settled geometry has a real gap, it writes the current virtual end; if the saved offset is already at the end, it performs no scroll write. Detached tasks and active scroll gestures remain excluded.

### Some eager Markdown tasks still flickered on every revisit

A later trace showed that the large task-switch oscillation was gone, but one specific stress task still shifted on every revisit. The remaining signature was much narrower:

```text
eager Markdown row: 7,713.5px -> 7,714px -> 7,762px
late correction:    +48px
layout shift:       0.111
```

There were no stream events, bottom-repair loops, large placeholder collapses, or inline-tool asset events. The document was already complete and its single Markdown block reported a cached parse. The source itself explained the content dependency:

- 11,418 characters.
- Two Markdown images: one absolute Desktop path and one intentionally missing path.
- Footnote reference definitions, which intentionally prevent the document from being split into independent lazy Markdown leaves.

The two image elements resolved to broken-image fallbacks after each session-keyed DOM remount. Each fallback added approximately 24px, exactly matching the repeated 48px row growth. Lowering the 12,000-character virtualization threshold would not have fixed this task because cross-block reference definitions keep it on the eager branch.

The accepted image behavior is:

- Give every source Markdown image a small fallback minimum height before it enters the live DOM, so success/failure cannot begin from a zero-height replaced element.
- After a successful load, retain only its intrinsic width and height in a bounded 200-entry cache keyed by source.
- Reapply both intrinsic dimensions when neither axis is authored. When exactly one axis is authored, preserve it and derive the missing dimension from the cached intrinsic aspect ratio; never override authored raw HTML dimensions.
- Normal responsive Markdown CSS still scales unsized images to the current chat width.
- Do not retain image DOM across task switches.
- Mark source Markdown images separately from file-type icons and expose pending/ready/error plus intrinsic/rendered geometry in the transcript trace.

This is deliberately image-owned geometry. The scroll controller still reacts to genuinely new image growth on a first load, but it no longer has to replay already-known success or deterministic broken-image geometry on every task visit.

### Markdown typography ownership split in two

The stable Markdown document shell introduced an outer wrapper, while each inner HTML segment retained `prose prose-sm`. Existing `className` values such as flashcard `text-xl`, custom text colors, and DevTools `text-xs` landed on the wrapper and no longer shared the element that owned typography.

The document shell is now the single prose root and receives caller classes. Inner HTML/virtual block shells keep only their block-boundary margin rules. Mermaid and chemistry segments are marked `not-prose` so document typography does not leak into renderer UI. Direct standalone `MarkdownHtmlSegment` callers retain its full default prose styling.

The review regressions cover target-session fencing while background-session, watcher, and Bench events continue; selective queued-event removal; independent recent task-position restoration; first-visit bottom attachment; explicit jump-to-latest reset; one authoritative prose root with caller typography; and probe presentation of session-fence counts.

## Phase 7: optimistic turn placement and ActivityRow status stability

### Optimistic Thinking briefly belonged to the prior turn

The session was marked busy before the optimistic user message was inserted. Those were separate observable repository updates, so React could paint one intermediate frame with the optimistic Thinking row directly beneath the previous assistant response. When the user row arrived, the same activity moved into the correct next-assistant slot.

Optimistic Thinking was desirable; its birth order was not. Prompt submission now inserts the optimistic user message first and only then applies the busy session status. The same order is used by missing-session retry recovery. A regression observes the repository at the pre-request boundary and requires the tail to be the new user row followed by its Thinking activity.

### Tall optimistic user rows were measured but still clamped beneath the composer

Selected Bench text and inline assets shared the same failure despite using different renderers. The trace showed that the new optimistic row had already been measured correctly at `315.7px`. Buddy requested virtual-end offset `16,509.8`, but the browser could reach only `16,358`, leaving a `151.8px` shortfall that matched the portion hidden under the composer.

The virtualizer's total size was current, but the DOM spacer still exposed its previous height when `scrollTop` was written. The browser therefore clamped the request to the old maximum. The assistant's first row later enlarged the spacer and made the next end write succeed, which created the misleading impression that generation itself pushed the user content upward.

`commitTranscriptVirtualEnd()` (then named `writeTranscriptVirtualEnd()`) now synchronously applies the current virtual total to the spacer before calculating and writing the end offset. This is a geometry-ordering fix, not a renderer-specific offset for selections or assets. The regression models the browser's maximum-scroll clamp and proves the full end offset is reachable on the first write.

### ActivityRow titles exposed arguments and replayed motion for equivalent work

The collapsed header mixed two levels of copy. The first active tool in a category used `action + detail`, exposing paths, glob patterns, queries, commands, URLs, and other arguments. After a second entry in the same category, it switched to the authored category summary. Expanded child rows correctly need those details; the collapsed status does not.

The animation identity also included rendered copy and active/settled phase. Repeated search/read actions could therefore exit and re-enter even though their semantic activity had not changed. A further dead zone occurs after one tool completes but before the next model/API event arrives. Past-tense copy such as “Searched files” or “Read files” is incorrect while the turn remains busy, but switching immediately to a working word made sub-frame handoff gaps visible as title flutter.

The accepted state and motion contract is:

1. A collapsed tool title always uses its authored category summary. Arguments remain only in expanded entry rows.
2. Active tools use continuous-tense status such as “Searching files” or “Reading files.” Past-tense summaries appear only after the entire turn settles.
3. A busy turn with no active entry resolves to its deterministic working word, never a completed-tool summary.
4. Motion identity comes from the semantic activity category, not detail, rendered copy, or active/settled phase. A working-word gap inherits the prior entry's identity, so `Searching files → Pawing → Searching files` keeps one mounted header. A genuinely different category may still crossfade.
5. Between existing activity entries, the previous active header remains visible and shimmering for `MID_TURN_DEAD_ZONE_MS`. If the next entry starts first, the pending working-word reveal is cancelled. A sustained gap reveals it after the delay.
6. That delay is a perceptibility gate, not an animation duration. The header is never blank during it. A genuinely empty optimistic row still shows Thinking immediately. Current values live in [dead-zone.md](./dead-zone.md); this document does not restate them.

Regression coverage operates at both levels: pure header resolution verifies title copy, tense, and semantic keys; a mounted ActivityRow test verifies that the same DOM node survives the active-to-working-word-to-active sequence, that short gaps never render a working word, and that sustained gaps reveal it only after the grace window.

## The 12,000-character transition and Bench experiment

### Why the system exists

The 12,000-character threshold activates inner Markdown virtualization for unusually large content. This matters because the active assistant part remains one outer transcript row.

An 80,040-character stress response ended with:

- 38 virtual Markdown blocks.
- 4 resident blocks.
- 34 placeholders.
- Stable terminal source hash and a 31,446px outer row.

Without the inner layer, the full 80,000 characters, equations, and embedded renderer DOM would remain mounted in the active row.

### Recorded threshold correction

At approximately `+36.8s`, source length crossed the threshold at 12,031 characters and the branch changed from eager to lazy:

```text
4,747px -> 6,008px -> 4,576px
```

The scroll offset corrected by approximately `+1,261px` and then `-1,320px` over about 99ms.

This initially looked like a visible bounce. The viewport evidence changed that conclusion:

- The row top was thousands of pixels above the viewport (`-3,587px`, then `-4,848px`).
- The row bottom remained fixed at approximately 1,160px.
- The user reported seeing no jump.

The probe therefore demonstrated offscreen geometry correction, not a proven user-visible regression. A large number in a geometry trace is not sufficient evidence to redesign the renderer.

### Bench opening around 50 seconds

The same trace opened Bench around `+50s`, narrowing the conversation pane.

Around that point:

- Markdown stayed on the lazy branch.
- There was no parser-shell or document-branch collapse.
- Individual row-size corrections were approximately 16-71px.
- The row continued streaming and remained bottom-attached.

Those changes were consistent with new content plus narrower-width wrapping. Bench was not the cause of the trace's largest correction.

### Decision

Do nothing about the 12,000-character transition for now.

Keep the threshold and inner virtualization because they provide real worst-case protection. Do not replace them with either of these extremes:

- Render every enormous active response eagerly.
- Put every ordinary short response through the full lazy observer/residency system.

Revisit the transition only if one of these is demonstrated:

- A user-visible viewport jump.
- Lost reading position while detached.
- Content passing under the composer.
- Width changes leaving persistently wrong placeholder geometry.
- Main-thread cost that materially affects ordinary usage.

If a future change is required, preserve one semantic renderer structure and let the threshold control only offscreen residency. Do not create two unrelated renderers with independent geometry calculations.

## Recorded anomalies that are not current redesign mandates

One post-fix trace recorded an eager streaming row changing from 61 rendered Markdown blocks to one parsing block:

```text
9,274px -> 69px -> 9,128px
```

It recovered after approximately 315ms and caused matching scroll compensation. It occurred before Stop and was distinct from the 12,000-character lazy transition. The later 80,040-character run did not reproduce this shell collapse, including at terminal completion.

Keep this signature in the probe and regression corpus. Do not reopen the whole virtualization design unless it becomes visibly reproducible or can be tied to a specific remaining projection transition.

## Decisions and rationale

| Decision | Rationale | Revisit when |
| --- | --- | --- |
| Keep outer transcript-row virtualization | It bounds long task DOM and establishes row ownership. | Row identity or task-switch correctness fails. |
| Keep inner long-Markdown virtualization | A giant active text part is one outer row; the 80K trace retained only 4 of 38 block bodies. | A simpler mechanism proves equal worst-case performance and correctness. |
| Do not keep every visited Markdown body mounted forever | Stable identity does not justify unbounded DOM residency inside one giant response. | Never; use bounded residency instead. |
| Let TanStack own ordinary resize correction | Duplicate unconditional Buddy writes caused bounce. | A focused test proves TanStack misses a final attached gap. |
| Keep a gated trailing bottom repair | It catches genuinely missed final geometry without fighting every resize. | It fires repeatedly or moves detached readers. |
| Preserve stable document/segment/block identities | Embedded fences and terminal state must not replace already-rendered content. | Semantic Markdown correctness requires a controlled identity change. |
| Do not enforce longest-text-wins | Authoritative corrected snapshots may legitimately be shorter. | Never without a runtime revision contract that says otherwise. |
| Fence only the aborted session around recovery | Authoritative recovery must reject stale target events without dropping unrelated directory traffic. | The transport gains an explicit server/client generation protocol. |
| Compact text events, not tool raw deltas | Text snapshots supersede prior text; tool raw deltas can be order-sensitive. | A tool-specific contract explicitly permits compaction. |
| Leave the 12K transition alone for now | The recorded correction was offscreen and the user saw no jump; the system materially reduced an 80K response. | New user-visible or performance evidence appears. |
| Treat Bench width as a geometry dependency | Wrapping and measured heights depend on pane width. | Always account for it in future placeholder/measurement work. |
| Remember recent scroll state per task | Instant task switching is navigation between reading contexts. Detached revisits need their exact pixel offset; attached revisits need the current end, which a stale pixel cannot express. | The product intentionally adopts a different navigation contract. |
| Cache only measured Markdown block heights across task remounts | Placeholder estimates must not replace known geometry on every switch; width and content remain part of measurement identity. | A shared browser-native geometry mechanism makes the cache redundant. |
| Stabilize source Markdown images before insertion | Broken images otherwise begin at zero height on every remount; successful intrinsic dimensions can fill or proportionally derive missing metadata without retaining DOM or overriding authored sizing. | Markdown adopts a first-class image renderer with an equivalent loading/error shell. |
| Insert the optimistic user row before marking the session busy | Thinking belongs to the new assistant slot; exposing busy first creates a visible frame under the prior turn. | Prompt submission becomes one atomic repository transaction with equivalent ordering. |
| Synchronize spacer geometry before virtual-end writes | Browsers clamp `scrollTop` against current DOM height even when the virtualizer already knows a larger total. | The virtualizer owns the spacer and guarantees its DOM height before callbacks run. |
| Keep collapsed activity status semantic and argument-free | Tool details belong in expanded entries; copy, tense, and transient dead zones must not remount equivalent high-frequency status. | The product intentionally adopts a different activity-title hierarchy. |
| Delay inter-entry working copy | Ordinary model/API handoffs should not become visible UI states; a sustained pause still needs a working signal. | Trace data shows the common handoff distribution or user perception warrants a different threshold. See [dead-zone.md](./dead-zone.md). |

## Approaches rejected

### Unconditional `scrollToEnd()` after every measurement

Rejected because it duplicates TanStack's correction, restarts reconciliation during LaTeX/Mermaid churn, and can pull a user after a delayed retry.

### Blaming all renderer movement on auto-scroll

Rejected because traces showed the scroll controller reacting to genuine row collapse. Geometry and data ordering must be inspected before scroll logic.

### Fixing only lazy Markdown keys

Rejected because the reproduced mixed-renderer failure could occur outside the old `VirtualizedMarkdown` branch. Stable document and segment projection was also required.

### Keeping every activated Markdown block mounted

Rejected because it would make a single enormous current response retain heavy DOM indefinitely. Stable wrappers plus bounded bodies solve identity without unbounded residency.

### Removing inner virtualization entirely

Rejected because the outer system cannot optimize inside one giant pinned row. The 80K trace demonstrated meaningful eviction.

### Virtualizing every short response from its first token

Not adopted because ordinary messages would pay observer, splitting, placeholder, and measurement complexity without demonstrated benefit.

### Choosing text by maximum length

Rejected because authoritative snapshots can intentionally shorten or correct accumulated deltas.

### Restarting the backend for apparent post-Stop generation

Rejected because canonical storage proved the backend had already completed. The defect was client backlog and stale replay.

### Patching vendor

Rejected because the product-specific UI behavior belongs in Buddy-owned code and vendor does not have the same renderer composition.

## Invariants for future work

Any future transcript or Markdown change must preserve these invariants:

1. A detached reader is never pulled to the bottom by appends, resizes, delayed parsing, or a trailing repair.
2. An attached transcript ends above the composer after semantic row additions and settled async geometry.
3. The scroll controller does not continuously fight TanStack or browser layout.
4. A Markdown document keeps stable semantic identities while its content grows.
5. Interruption changes status; it does not by itself invalidate parse identity.
6. Embedded renderer fences do not replace unrelated surrounding Markdown.
7. Heavy offscreen DOM may be removed, but its lightweight shell preserves geometry.
8. Placeholder measurements are width-dependent; Bench layout changes must not silently reuse invalid geometry forever.
9. Authoritative recovery cannot be followed by replay from the pre-recovery stream.
10. Text-event compaction cannot reorder order-sensitive tool state.
11. Task switching unmounts task-specific transcript DOM; optimizations must not retain live DOM across tasks.
12. Probe numbers must be correlated with viewport position and user observation before declaring a visible regression.
13. A first-time task starts attached. A revisited detached task starts at its own saved finite offset; a revisited attached task seeks the current virtual end. Either way the restored state is independent of the previously visible task.
14. Stop recovery cannot interrupt or discard unrelated background-session, Bench, watcher, or directory events.
15. Markdown caller typography classes belong on the authoritative prose root, not a layout-only wrapper.
16. A restored finite offset owns initial positioning for a detached task; after geometry settles, an attached task reconciles a real bottom gap without moving an already-correct offset.
17. Cross-task Markdown geometry memory stores bounded numbers, never retained task DOM, and never crosses content or width identity.
18. Source Markdown images have non-zero fallback geometry before load/error and reuse bounded intrinsic dimensions without overriding authored sizing or changing its aspect ratio.
19. Optimistic Thinking cannot render until the optimistic user row that owns the turn exists.
20. A virtual-end write synchronizes current spacer height before setting `scrollTop`; browser clamping cannot defer composer clearance until later generation.
21. Collapsed ActivityRow titles contain category status only. Paths, patterns, queries, commands, URLs, resource names, and other tool arguments remain in expanded entries.
22. Active activity copy is continuous tense, a busy no-entry gap uses working copy, and past-tense summaries appear only when the turn is fully settled.
23. Equivalent activity detail, phase, tense, and same-category working-word transitions update one mounted header. Only a semantic activity-category change may replay the header crossfade.
24. Working copy between existing entries has a cancellable reveal delay. Initial zero-entry optimistic Thinking remains immediate.

## How to investigate the next report

Use this order to avoid repeating the same investigation:

1. Ask whether the user was attached, detached, actively scrolling, opening Bench, or pressing Stop.
2. Capture with Buddy DevTools Transcript **Start** before sending the message.
3. Reproduce one behavior per capture when possible.
4. Stop the DevTools trace only after the observation window; do not confuse it with the composer Stop button.
5. Inspect source length/hash first. Continued growth means data delivery or replay, not merely rendering.
6. Inspect document/segment/block identities and parse state next. A height collapse with a parsing shell is renderer churn.
7. Inspect row-size and scroll-write ordering. A matching scroll write is often compensation, not the initiating bug.
8. Check row top and bottom relative to the viewport. Offscreen height correction may be invisible.
9. For a cached eager Markdown block with stable parse identity, inspect its Markdown image states and intrinsic/rendered dimensions before changing scroll or virtualization.
10. Separate capture-time performance entries from buffered entries at offset zero.
11. Compare the relevant Buddy path with `origin/main` and vendor, but account for Buddy-specific inline assets and recovery behavior.
12. Add a focused failing regression before changing behavior.
13. Preserve detached-state, tool ordering, and the staged worktree boundary during implementation.

## Useful stress prompts

### Long mixed Markdown

```text
Frontend rendering stress test. Do not use tools.

Produce one continuous assistant response of at least 15,000 characters.

Create 75 numbered sections. Every section must contain:
- A level-three Markdown heading
- Two substantial prose paragraphs
- One display LaTeX equation using \[...\]
- A short bulleted list

After section 60, include one Mermaid flowchart in a fenced mermaid block, then continue through section 75.

Do not abbreviate, summarize, skip sections, or put the response inside a code fence. Stream the entire response normally.
```

For a Bench-width run, start with Bench closed, begin the trace, open Bench once after the response has grown substantially, leave it open, and avoid manual scrolling. For a detached-state run, use a separate capture and deliberately scroll upward.

### Stop and backlog

Use a response long enough to remain active, press the composer Stop button during the final text part, wait approximately ten seconds, and then stop the DevTools trace. The expected signature is an immediate target-session fence, bounded recovery, at most one authoritative final snapshot, no continued source growth, and uninterrupted unrelated directory events.

## Relevant implementation areas

- `packages/web/src/components/chat/chat-transcript.tsx`
- `packages/web/src/components/chat/tools/activity-row/entries.ts`
- `packages/web/src/components/chat/tools/activity-row/index.tsx`
- `packages/web/src/lib/directory-chat/use-auto-scroll.ts`
- `packages/web/src/components/markdown/Markdown.tsx`
- `packages/web/src/components/markdown/markdown-html-segment.tsx`
- `packages/web/src/components/markdown/virtualized-markdown.tsx`
- `packages/web/src/components/virtualization/virtualization-defaults.ts`
- `packages/web/src/lib/directory-chat/transcript-performance-probe.ts`
- `packages/web/src/components/debug/devtools-transcript-tab.tsx`
- `packages/web/src/state/chat-stream-event-buffer.ts`
- `packages/web/src/state/chat-sync.ts`
- `packages/web/src/lib/directory-chat/use-chat-sync.ts`
- `packages/web/src/state/chat-actions.ts`

Relevant focused tests include:

- `packages/web/test/chat-transcript-resize-anchor.test.tsx`
- `packages/web/test/chat-actions-optimistic-send.test.ts`
- `packages/web/test/activity-row-header.test.ts`
- `packages/web/test/activity-row.test.tsx`
- `packages/web/test/use-auto-scroll.test.tsx`
- `packages/web/test/markdown-stream-rendering.test.tsx`
- `packages/web/test/virtualized-markdown-residency.test.tsx`
- `packages/web/test/chat-stream-event-buffer.test.ts`
- `packages/web/test/chat-sync-stream.test.ts`
- `packages/web/test/chat-sync.test.ts`
- `packages/web/test/transcript-performance-probe.test.ts`
- `packages/web/test/devtools-transcript-tab.test.tsx`

## Final perspective

This investigation began as “auto-scroll sometimes stops when renderers or headings grow under the composer.” It uncovered:

- Two missing attachment handshakes.
- One over-aggressive resize correction introduced during the fix.
- A terminal and embedded-renderer Markdown identity problem.
- Excess and misleading asset measurement.
- An inherited stream-yield bug.
- A Buddy-specific abort-recovery replay race.
- An over-broad first Stop fence that could discard unrelated directory traffic.
- Detached attachment state leaking from one selected task into the next.
- An overcorrection that reset every task switch instead of restoring recent task-local reading state.
- Attached task revisits initializing through an end sentinel and visibly correcting from the previous task's offset.
- A finite-offset-only correction that still fought stale virtual totals and remounted Markdown placeholder estimates.
- Source Markdown images replaying zero-to-broken or zero-to-loaded geometry on session-keyed remounts.
- Restored attached offsets becoming stale after hidden viewport or row-count changes.
- Cached intrinsic image sizing overriding explicitly authored dimensions.
- Markdown typography ownership split between a layout wrapper and inner prose roots.
- Busy status becoming observable before its optimistic user row and briefly placing Thinking beneath the prior assistant turn.
- Correctly measured tall optimistic user rows being browser-clamped because virtual-end writes preceded DOM spacer synchronization.
- Activity titles exposing first-entry arguments, replaying fades for equivalent tool work, and surfacing imperceptibly short working-word dead zones.
- An intentional 12K long-response tradeoff whose recorded offscreen correction was initially mistaken for a visible bug.

The system should be judged by user-visible invariants and ordered evidence, not by isolated large numbers in a trace. Keep the proven fixes, keep the worst-case protection, and require new evidence before reopening accepted tradeoffs.
