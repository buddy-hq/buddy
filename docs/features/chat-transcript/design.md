# Chat Transcript Design

Date: 2026-06-28

This document describes Buddy's chat transcript architecture: data flow, state
ownership, row projection, and rendering. Scroll and virtualization behavior has
its own document and is authoritative there.

Read with:

- [invariants.md](./invariants.md) — the contracts every change must preserve
- [scroll-and-virtualization.md](./scroll-and-virtualization.md) — scroll ownership
- [history.md](./history.md) — what broke before and why the current shape exists

Date: 2026-06-28. Revised 2026-08-12 to match the code.

## Reference lock

For this feature, the implementation reference is the current standalone OpenCode checkout:

`/Users/prashantbhudwal/code/opencode`

Do not use `vendor/opencode` as the reference for this pass. Buddy should follow current OpenCode transcript patterns unless Buddy has an explicit product or architecture reason to diverge.

## Goal

The transcript should behave like one stable, streaming, virtualized timeline.

The user-facing experience is:

- opening or switching chats lands at the end of the chat
- streaming appears continuously without artificial character pacing
- thinking appears immediately after send, then becomes real thinking/tool state, then remains available as a completed collapsed thought row
- Markdown, math, code, Mermaid, media, tools, and cards do not flicker or remount unnecessarily
- resizing sidebars or showing the bench does not visually churn the transcript
- history pagination preserves the visible anchored row
- stopping a run stops visible streaming/rendering work promptly

## Current implementation map

Primary files:

- `packages/web/src/state/chat-sync.ts`
  - SSE connection, frame batching, reconnect, heartbeat, and event buffering.
- `packages/web/src/lib/directory-chat/use-chat-sync.ts`
  - Maps SSE events into Buddy store updates, transcript repository updates, notifications, query cache updates, and pending-input protection.
- `packages/web/src/state/transcript-repository.ts`
  - Directory/session-scoped normalized transcript repository.
  - Owns messages, parts, orphan parts, pagination metadata, terminal reconciliation, LRU, and external-store subscriptions.
- `packages/web/src/state/session-messages.ts`
  - Typed SDK adapter for `session.messages`, pagination limits, cursor header parsing, and retry behavior.
- `packages/web/src/components/chat/chat-timeline-rows.ts`
  - Projects normalized transcript messages into stable semantic timeline rows.
- `packages/web/src/components/chat/chat-transcript.tsx`
  - React transcript timeline, TanStack Virtual wiring, row rendering, row measurement, cached measurements, and view-state cache.
- `packages/web/src/components/markdown/*`
  - Markdown block projection, sanitized HTML rendering, streaming code highlighting, math, Mermaid segmentation, and large-Markdown lazy rendering.
- `packages/web/src/components/chat/inline-asset-boundary.tsx`
  - Near-viewport activation and row-local content-ready/size-change reporting for heavy inline content.
- `packages/web/src/components/chat/tools/render/*`
  - Tool/card/object renderers for Mermaid, figures, media, HTML widgets, task cards, question sets, and other Buddy-specific inline artifacts.

Reference OpenCode files:

- `/Users/prashantbhudwal/code/opencode/packages/app/src/context/server-sdk.tsx`
- `/Users/prashantbhudwal/code/opencode/packages/app/src/pages/session/timeline/`
- `/Users/prashantbhudwal/code/opencode/packages/ui/src/hooks/create-auto-scroll.tsx`
- `/Users/prashantbhudwal/code/opencode/packages/session-ui/src/components/markdown*`

## End-to-end data flow

Current Buddy flow:

```text
SSE
  → startChatSync()
  → frame-batched event buffer
  → useChatSync event mapping
  → transcript repository event appliers
  → keyed useSyncExternalStore subscriptions
  → projectTimelineRows()
  → ChatTranscript virtual rows
  → part-local renderers / Markdown / tool cards / inline assets
  → row-local measurement into TanStack Virtual
```

The intended ownership split is:

- SSE and event coalescing own transport timing.
- The transcript repository owns message/part truth.
- Row projection owns semantic timeline structure.
- Individual rows own visual rendering and subscribe only to the entities they need.
- The virtualizer owns scroll anchoring and row-size correction.
- Inline asset renderers own their content caches, but report readiness/size changes to their row.

## State ownership

### Chat store

The monolithic chat Zustand store should no longer own transcript message arrays as the source of truth.

It still owns navigation and directory-level UI state:

- active directory
- active session ID
- session lists and titles
- provider/model metadata
- session status
- pending permissions/questions
- directory errors/loading state

`useChatSync` still updates this store for non-transcript UI state and compatibility behavior.

### Transcript repository

`transcript-repository.ts` is the current transcript source of truth.

It stores, per directory/session:

- ordered message IDs
- message info records by message ID
- ordered part IDs per message
- part records by part ID
- accumulated streaming fields by part ID/field
- orphan parts keyed by parent message ID
- removed message tombstones
- removed part tombstones
- cursor/completeness/loading/freshness metadata
- cached message/meta snapshots

It exposes these subscription levels:

- session-level: message ordering, structural visibility, pagination/meta
- message-level: a specific message info record
- part-level: a specific part record
- grouped message/part selectors for row rendering

This split matters because most deltas should update only the changed part. But if a part changes timeline structure or visibility, the session must also emit so row projection reruns.

Examples:

- Empty text part receives first non-empty `message.part.delta`: session emit required.
- Existing visible text part receives more text: part emit usually enough.
- Tool part appears: session emit required.
- Terminal assistant message reconciles running tool state: session emit required if row output changes.

## Event ordering and reconciliation model

The repository treats SSE and HTTP pages as eventually consistent sources that can interleave.

Supported event cases:

- `message.updated`
- `message.removed`
- `message.part.updated`
- `message.part.removed`
- `message.part.delta`
- `session.status`
- HTTP `session.messages` refresh/initial load/prepend pages

Important rules:

- Parts may arrive before parent messages. They are stored as orphans and merged when the parent message arrives.
- Deltas may arrive for orphan parts. They are accumulated on the orphan and preserved.
- Removals may arrive for orphan parts. They delete the orphan and prevent stale resurrection.
- Refresh pages must preserve newer touched messages/parts from active stream events.
- Pagination prepends older messages without replacing newer streamed suffixes.
- Terminal assistant messages must reconcile their parts:
  - text/reasoning parts get terminal end times
  - pending/running tools become interrupted tool errors
  - already terminal tool states are preserved
- Late snapshots after terminal state must not resurrect running tools.

This is the Buddy equivalent of OpenCode’s event/cache reconciliation behavior, adapted to the React external-store repository.

## Loading and pagination

`session-messages.ts` defines:

- `INITIAL_TRANSCRIPT_MESSAGE_LIMIT = 2`
- `HISTORY_TRANSCRIPT_MESSAGE_LIMIT = 200`
- cursor from `x-next-cursor`

Initial load starts small for fast chat switching, but `transcript-repository.ts` extends the initial page backward when the page starts inside an assistant turn. The invariant is not “load exactly two messages”; the invariant is:

The initial tail must include the latest user boundary needed to own the visible turn.

History pagination uses `loadOlderTranscriptMessages()` with `mode: "prepend"`. Before loading older history, `chat-transcript.tsx` captures a visible row by `data-timeline-key`; after the page applies, it restores that keyed anchor instead of using aggregate `scrollHeight` compensation.

## Timeline projection

`chat-timeline-rows.ts` projects `MessageWithParts[]` into semantic rows:

- `turn-gap`
- `user`
- `turn-divider`
- `assistant`
- `activity` (the row historically called "thinking")
- `retry`
- `caveat`

Assistant rows contain one of:

- `part`
- `abstracted`
- `grouped-parts`

`groupAssistantParts()` is still used to group hidden/reasoning/tool/content parts into Buddy’s existing assistant render model.

Row keys are logical:

- `user:${userMessageID}`
- `turn-gap:${userMessageID}`
- `assistant:${userMessageID}:${item.key}`
- `activity:${userMessageID}:${ordinal}`
- `turn-divider:${userMessageID}:${label}`
- `retry:${userMessageID}`
- `caveat:${userMessageID}`

`reuseTimelineRows()` preserves row object identity when row semantics have not changed. This is necessary so unrelated part updates do not remount stable rows.

## Thinking and reasoning behavior

Expected behavior:

- On send, Buddy inserts an optimistic user message and marks the session optimistic/running enough for a thinking row to appear.
- If the active turn has no visible assistant item yet, `projectTimelineRows()` emits a `thinking` row.
- When real reasoning arrives and summaries are disabled, the active thinking row can display the current reasoning heading.
- When reasoning is renderable and reasoning summaries are enabled, reasoning is represented as an assistant `abstracted` row using `HiddenSteps`.
- After the turn completes, a reasoning summary heading remains visible on the collapsed row. Reasoning without a heading falls back to “Thought for Ns”; either row can be expanded.

The important distinction is active thinking versus completed thought:

- Active thinking is an optimistic/live status row.
- Completed thought is a persisted assistant reasoning summary row whose label prefers the summary heading and falls back to duration.

Both are product requirements.

Ambiguous behavior to revisit: reasoning and successful activity-style tools can share one
`abstracted` row. The current settled-header precedence shows the tool summary in that case, while
reasoning-only rows show the reasoning heading. It is intentionally undecided whether mixed rows
should prefer the reasoning heading, prefer the tool summary, or compose both; do not treat the
current precedence as a newly resolved product rule.

## Virtualization and scroll

`chat-transcript.tsx` uses `@tanstack/react-virtual` for all timeline rows, including the active turn.

Current virtualizer settings are:

- stable row keys via `getItemKey`
- `anchorTo: "end"` — while attached this is what follows row growth
- `followOnAppend: false` — Buddy owns row-append following so it can gate on
  attachment and gesture state
- `scrollEndThreshold: 80`
- `paddingEnd: 64`
- `useAnimationFrameWithResizeObserver: false` — measurement must correct scroll
  in the same frame as the growth, before paint
- `initialOffset`: the task's restored offset when one exists, otherwise
  `Number.MAX_SAFE_INTEGER` when attached and `0` when not
- restored measurements from a 16-session timeline cache
- active row kept in the extracted range
- visible rows temporarily pinned during viewport-sized height changes
- `shouldAdjustScrollPositionOnItemSizeChange` returns false while attached — but
  see [scroll-and-virtualization.md](./scroll-and-virtualization.md) for why that
  branch is not reached in the attached case

The authoritative account of scroll ownership is
[scroll-and-virtualization.md](./scroll-and-virtualization.md). Do not restate
the ownership rules here.

The transcript also caches memory-only per-session view state:

- virtual row measurements
- hidden-steps expansion state
- tool open state

The cache is intentionally memory-only and bounded to 16 sessions. It should preserve short-term chat switching smoothness without persisting UI expansion state across app restarts.

## Measurement model

The desired measurement owner is the virtualizer.

Buddy uses row-local measurement paths:

- each `TimelineVirtualRow` binds `rowVirtualizer.measureElement`
- row mount/layout effects call `resizeItem()` with the current row height
- inline asset content-ready/size-change schedules a connected measure for that specific row
- large height changes temporarily pin currently visible indexes so visible content is not dropped during settlement

The design avoids broad “viewport changed, remeasure every row, repair scroll repeatedly” loops. Sidebar/bench width changes should settle through row-local ResizeObserver/measurement rather than causing transcript-wide scroll churn.

## Markdown rendering

Buddy’s Markdown implementation is in `packages/web/src/components/markdown`.

Current behavior:

- `Markdown.tsx` chooses ordinary HTML Markdown, virtualized Markdown, or Mermaid-segmented rendering.
- `markdown-parser.ts` splits streaming Markdown into stable completed blocks plus one live tail where possible.
- Completed code fences are rendered as code blocks.
- Open code fences render through a raw fallback first, then worker-highlighted spans when available.
- `markdown-html-segment.tsx` sanitizes with DOMPurify, decorates code blocks, links, presented media links, and uses `morphdom` for HTML updates.
- Broken Markdown images are preserved when the new image node has the same `src`, `alt`, and `title`, avoiding repeated broken-image disappearance/retry during active streaming.
- Incomplete streaming math can preserve the rendered fallback until a safe parse is available.
- Large Markdown can be split into lazy blocks by `virtualized-markdown.tsx`.

Code highlighting:

- The worker path follows OpenCode’s latest/superseding worker model.
- Worker startup failure returns a rejected promise instead of throwing synchronously into React render/effects.
- Raw code fallback remains visible if highlighting is unavailable.

Resolved since this document was first written (see
[history.md](./history.md)): streaming-to-final Markdown no longer collapses the
response, tail block identity is ordinal rather than content-derived, and open
fences stay in `MarkdownCodeBlock` across completion. `markdown-stream-rendering.test.tsx`
holds those contracts.

The streaming projection additionally withholds the uncommitted trailing line of
an open code fence, so a block never renders taller than its completed form.

## Inline artifacts and tool rows

Buddy intentionally diverges from OpenCode here because Buddy renders richer inline educational/product artifacts:

- Mermaid tool output
- figures and freeform figures
- media/file presentations
- HTML widgets
- question-set and flashcard cards
- object cards
- bench-linked resources
- grouped tool result rows

Design rules:

- Inline artifacts are transcript rows, not overlays or an unvirtualized live tail.
- Heavy DOM may unmount offscreen.
- Content-owner caches remain tool-specific: React Query, Mermaid persisted render caches, object/media caches, etc.
- There is no generic rendered-DOM cache.
- Rows preserve interaction/open state and last measured height through the timeline cache where appropriate.
- Async content must use a stable shell and report content-ready/size-change through `InlineAssetBoundary` or the lifecycle context.
- Expensive content should activate near the viewport rather than all at once.

Animations inside transcript artifact rows are constrained because virtualization can remount rows during normal scrolling. Mount/layout animations in these rows can amplify flicker and cause recalculation. Remaining motion should be compositor-only and respect reduced motion.

## Intentional divergences from OpenCode

### React external-store repository instead of Solid sync store

OpenCode keeps transcript data inside its Solid sync/session model. Buddy uses a React `useSyncExternalStore` repository because `packages/web` is React and needs keyed subscriptions without pushing message arrays back into the monolithic chat Zustand store.

The intended behavior is the same: stable ordered transcript data with event reconciliation and pagination safety.

### Buddy keeps navigation/status outside the transcript repository

OpenCode’s timeline model is closer to its session page data model. Buddy keeps session lists, provider data, pending permissions/questions, notifications, and directory errors in the existing chat/query stores.

The transcript repository owns transcript snapshots only.

### Initial page is small but extends to user boundary

Buddy starts with two newest messages to keep chat switching fast. That differs from a simple full-tail load and is acceptable only because the repository extends backward until the latest user boundary is present.

The product invariant is user-boundary completeness, not fixed count.

### Buddy has richer inline objects

OpenCode’s transcript focuses on messages, tools, diffs, files, comments, and shell/edit output. Buddy also renders educational/media/object artifacts inline.

That requires:

- stable shells for artifact rows
- near-viewport activation
- row-local measurement callbacks
- preserving Buddy-specific math, Mermaid, media routing, object cache, HTML-widget, and sanitization behavior

### Buddy does not directly import OpenCode UI hooks

Buddy aligns with OpenCode’s scroll/virtualizer behavior conceptually, but implements it in React with `@tanstack/react-virtual`.

The expected equivalent is:

- bottom anchoring belongs to the virtualizer
- prepending uses keyed anchors
- active rows stay mounted
- row measurements correct scroll position
- user upward gestures detach following
- send/jump/latest chat switch reattach

### Buddy preserves completed thought summaries as product UI

Reasoning summaries are not just debug text. Buddy’s expected UX includes completed collapsed thought rows that can be expanded later. The projection must preserve this even when optimizing active streaming.

## Expected behavior checklist

### Opening and switching chats

- Normal chat switch lands at the end.
- The transcript does not flash previous-chat rows.
- The transcript does not show a blank frame if cached rows exist.
- Short-term expansion/open state can restore from memory.
- The latest visible turn has a real user owner.

### Sending

- User message appears optimistically.
- Thinking appears immediately.
- The session is protected from LRU eviction while optimistic/running/pending.
- Real stream events replace optimistic entities when server snapshots arrive.

### Streaming

- Text appears on the first visible non-empty text delta.
- Reasoning/tool activity can appear before final text.
- Part-only content updates should not rerender unrelated rows.
- Structural part changes rerun row projection.
- Attached bottom-follow remains attached unless the user explicitly scrolls up.

### Completion, stop, and interruption

- Terminal assistant messages seal text/reasoning times.
- Pending/running tools become interrupted/error states when appropriate.
- Completed reasoning remains visible as a collapsed thought row.
- Stop/interruption should not leave pending tools running forever.
- Stop/interruption should not leave queued Markdown/code work mutating the transcript indefinitely.

### History

- Scrolling near the top loads older messages.
- Prepended history preserves a keyed visible anchor.
- Newer streamed suffixes survive refresh/pagination races.
- Detached history is not pulled to the bottom by new streaming content.

### Markdown and inline content

- Streaming Markdown renders the latest coalesced state.
- Code blocks use Buddy/OpenCode-themed Shiki styling when available.
- Raw code fallback remains stable when worker highlighting fails.
- Incomplete math uses stable fallback/loading behavior.
- Broken Markdown images keep a stable node.
- Mermaid/figures/media/cards use stable shells and row-local measurement.
- Artifact mount/layout animations must not replay under virtualization.

## Known open issues

The first two of the original P1 Markdown findings are resolved. Still open:

- Mermaid segmentation remounts prior Markdown when the first Mermaid fence
  completes.
- References and footnotes force whole-response parsing per token, and a
  reference used before a Mermaid block with its definition after it does not
  resolve.

See [history.md](./history.md) for the full record, including what was resolved.

## Regression coverage expectations

Every behavior above that previously regressed needs focused runtime tests.

Minimum coverage areas:

- orphan part update before message update
- orphan delta before message update
- orphan removal before message update
- terminal assistant part reconciliation
- initial load extends to latest user boundary
- visibility-changing deltas emit session updates
- optimistic thinking on send
- completed thought row after turn completion
- broken Markdown image stability during streaming
- worker-unavailable raw code fallback
- reduced-motion handling for transcript artifact entrances
- row projection object identity for unrelated part updates
- scroll anchor preservation on prepend
- no assistant-only latest turn on normal open

Docs-only edits do not require typecheck. Code changes to this feature require affected tests, then root `bun lint`, then root `bun typecheck`.
