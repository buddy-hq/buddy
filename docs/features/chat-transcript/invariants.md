# Chat transcript invariants

The contracts every transcript change must preserve. This is the single canonical list — [scroll-and-virtualization.md](./scroll-and-virtualization.md) and [chat-switch-flicker.md](./chat-switch-flicker.md) explain *why* scroll and transition contracts hold, but do not maintain competing lists.

## Navigation and scroll

- A normal chat switch lands at the latest message/end of the chat.
- Quick chat switching must not show blank frames, rows from the previous chat, or stale source-chat content.
- Attached scrolling remains bottom-anchored during streaming.
- Explicit upward user gestures detach following.
- Sending, Jump to latest, and normal chat switching reattach following.
- Detached history must not be pulled down by new streaming content or async row resizing.
- Prepending history preserves the visible keyed anchor, not an approximate aggregate `scrollHeight` offset.
- Jump to latest appears only when the user is meaningfully separated from the end.
- An attached position is semantic ("follow the end"), never a durable pixel offset. A detached position is a pixel offset and is restored exactly.
- A first-time task starts attached. A revisited task restores its own state independently of the previously visible task.

## Scroll ownership

The core invariant:

> While attached to the bottom, a height change of `Δ` causes exactly one scroll correction of `Δ`, in the same direction. While detached, streaming causes no bottom-following correction at all.

- Row **size** changes are corrected by TanStack Virtual (`resizeItem` → `applyScrollAdjustment`). Row **appends** are corrected by Buddy (`commitTranscriptVirtualEnd`). A settled remaining gap is corrected by the gated 120ms trailing repair. Nothing else writes the scroll offset.
- Every direct write to the virtual end synchronizes spacer height, sets programmatic flag, writes `scrollTop`, and notifies the virtualizer before returning, preventing measurements from correcting from a stale base.
- Measurement must not be deferred past the frame that laid it out (`useAnimationFrameWithResizeObserver: false`).
- No two scroll writes inside one measurement batch may have opposite signs.
- A scroll correction and the row geometry it compensates for land in the same painted frame (`syncVirtualRowGeometry`). A correction written directly to the DOM may not wait on a React commit to move the rows it accounts for.
- Geometry that appears after an async load is reserved in advance: an HTML widget's viewport box, and any content whose size is known before it arrives.
- Space is never reserved for something the turn has not produced yet: the assistant action footer mounts at terminal and is followed, rather than sitting empty under streaming answers.
- Sub-pixel row remeasures are ignored to avoid flipping virtual range boundaries.
- Row estimates derive from rendered geometry tables, never hand-tuned numbers.
- Estimates count only what the row renders: user row estimates exclude hidden prompt context, and assistant prose rows appended before deltas estimate as empty prose.

## Streaming and thinking

- Thinking appears optimistically immediately after send.
- Real thinking activity replaces the optimistic thinking indicator as soon as real reasoning/tool activity arrives.
- Completed reasoning remains visible as a collapsed summary-heading row, falling back to “Thought” when no heading is present.
- Ambiguous: when completed reasoning and successful activity-style tools share one collapsed row, the current implementation prefers the tool summary. Whether mixed rows should instead prefer the reasoning heading or compose both remains an explicit product decision for later.
- The completed thought row is expandable after the turn is done.
- Disabling reasoning summaries must not hide all active reasoning context when there is no visible assistant text.
- Streaming assistant text must appear as soon as the first non-empty text delta arrives; it must not wait for an unrelated session event.
- Stopping or interrupting a run must stop visible streaming work promptly. Queued async rendering should not keep visibly mutating the transcript forever.

## Timeline row projection

- Transcript rows are semantic: user messages, thinking, assistant parts, grouped inline objects, retries, errors, turn dividers, and turn gaps.
- The active turn is virtualized like every other row. There is no separate unvirtualized live tail.
- Row keys are stable logical identities, not content hashes for growing live content.
- Part deltas must not remount unrelated rows.
- A part update or delta that changes row visibility/structure must emit a session-level update so row projection reruns.
- A part update or delta that only changes already-mounted part content should notify only that part where possible.
- Assistant-only fallback turns are not acceptable for normal initial load. The latest user boundary must be present before the tail is considered ready.
- Undo/fork actions must resolve against the real user message that owns the turn, not an assistant-message fallback ID.

## Event ordering and reconciliation

- `message.part.updated` arriving before parent `message.updated` must be preserved as an orphan and merged when the parent arrives.
- `message.part.delta` arriving while the part is orphaned must be accumulated and preserved.
- `message.part.removed` arriving while the part is orphaned must be honored.
- HTTP refreshes and pagination must not truncate newer streamed suffixes.
- Snapshot prefix reconciliation must preserve newer streamed suffixes.
- Removals, optimistic entities, orphan parts, pending inputs, and in-flight refresh state must survive refresh races.
- Terminal assistant messages must reconcile terminal parts: unterminated text/reasoning part times get an end time, pending/running tool parts become interrupted tool errors, and already terminal tool parts are preserved.
- Late part/message snapshots after terminal assistant state must not resurrect running tools.

## Markdown, code, math, and media rendering

- Streaming Markdown renders the latest frame-coalesced state without artificial character pacing.
- Streaming-to-final Markdown must not visibly collapse the response to the first block while final parsing is pending.
- A streaming projection may only grow. Streaming a document prefix by prefix must never reduce its rendered line count — an open code fence must not render its uncommitted trailing line, and a raw fallback must not paint a line the parsed HTML will not have.
- Existing rendered blocks stay visible until replacement content is ready.
- Broken Markdown images keep a stable node/shell while the live block grows.
- Code blocks keep Buddy’s theme and raw fallback when highlighting is unavailable.
- Worker startup failure for code highlighting must not crash the transcript.
- Math rendering keeps stable loading/fallback behavior for incomplete or invalid live math.
- Markdown, KaTeX, code, images, and Mermaid must not flicker due to unnecessary parent remounts.
- Unsupported syntax should not trigger expensive whole-response parsing unless rendering support actually exists.

## Inline objects and tools

- Inline artifacts are first-class transcript rows.
- Mermaid, figures, media, HTML widgets, object cards, and tool cards use stable shells/placeholders for async content.
- Expensive inline content activates near the viewport, not globally for every hidden instance.
- Offscreen heavy DOM unmounts are allowed, but row interaction state and last measured height should be preserved.
- Async artifacts must report content-ready or size-change so the virtualizer can remeasure the specific row.
- Do not introduce a generic rendered-DOM cache for inline artifacts; rely on source-owner caches (React Query, Mermaid cache, tool caches).

## Motion and geometry

- Virtualized rows and inline artifact wrappers must not replay mount/layout animations on remount.
- Avoid animations of height, width, margin, padding, top, or left in transcript rows.
- Prefer static final geometry for transcript artifacts.
- If semantic entrance motion remains, it must be compositor-only: opacity and transform.
- Reduced motion must remove positional movement while preserving non-moving opacity/color transitions where helpful.
- Mermaid and HTML widgets must preserve stable shell geometry while responsive layout recalculates.
- Sidebar/bench width changes must not trigger broad viewport-wide measure-and-scroll-repair loops that cause flicker.
- Measurement should be row-local and event-driven where possible.

## Verification expectations

- Every regression in these invariants needs a focused test.
- Required coverage includes orphan ordering, terminal part reconciliation, user boundary completeness on initial load, visibility-changing delta notifications, broken image stability, worker-unavailable code fallback, reduced-motion artifact entrances, and attached/detached scroll behavior.
- Before code changes are complete, run package test scripts, then root `bun lint` and root `bun typecheck`.
- Probe numbers must be correlated with viewport position and user observation before declaring a visible regression.
