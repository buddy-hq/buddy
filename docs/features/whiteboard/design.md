!!IMP read the message file this folder and make changes. /Users/prashantbhudwal/Code/buddy/docs/features/whiteboard/message.md

# Whiteboard Design

## Locked Product Decisions

- The whiteboard is session-scoped persistent state rendered in a dedicated whiteboard view.
- Replace the temporary floating overlay with the existing reading-view interaction model: a large left workspace for the board and chat moved into the right-side pane with the same transition behavior.
- Reuse or extract the reading-view layout primitives instead of copying its layout implementation.
- The learner can pan and zoom the canvas; the persistence model must support direct learner edits.
- The backend stores one mutable current board per chat session, plus a previous-board snapshot only for compact learner-edit context.
- The primary whiteboard UI shows only the current board. There is no learner-facing history scrubber, scene switcher, or `New scene` action.
- Whiteboard tool activity uses the existing hidden-steps summary with a Presentation icon, `Updating Whiteboard` while running, and `Updated Whiteboard` when complete.
- The model-facing contract follows the official Excalidraw MCP append-program approach rather than a provider-facing union-heavy mutation schema.
- The long authoring guide is a feature-owned `whiteboard-authoring` skill loaded through the existing `skill` tool.
- `cameraUpdate` remains part of the drawing DSL so the contract can support guided viewport motion; full choreography may be implemented incrementally.

## Feature Boundary

- Add an atomic `whiteboard` Buddy feature.
- The feature owns `whiteboard_create_view`, `whiteboard_read_context`, and the `whiteboard-authoring` skill.
- The feature starts with `subagents: []` and `surfaces: []`.
- Add a sibling `/$directory/whiteboard` route alongside `/$directory/read` and `/$directory/chat`.
- Add a pathless `/$directory/_workspace` TanStack layout route that owns the shared resizable left-workspace/right-chat shell; make `read` and `whiteboard` its outlet children without changing their public URLs.
- Extract the reading route's resizable left-workspace/right-chat UI into a shared workspace layout component used by that pathless route.
- Extract the reading route's chat-side thread-browser wrapper so both focused workspace routes retain the same top bar, new-thread behavior, thread switching, and conversation pane.
- While `whiteboard_create_view` is pending or running, the chat frontend automatically navigates to the sibling whiteboard route so progressive frames are visible as they arrive.
- Extend the existing titlebar back-to-chat behavior from the reading route to both focused workspace routes.
- Enable the feature for each persona that should be allowed to use the whiteboard.

## Tool Count And Runtime API

- Buddy adds two model-visible tools: `whiteboard_create_view` and `whiteboard_read_context`.
- Official Excalidraw MCP registers five tools in total: model-visible `read_me` and `create_view`, plus app-only `export_to_excalidraw`, `save_checkpoint`, and `read_checkpoint`.
- Buddy does not need app-only model tools. Learner edits, session reads, and sharing travel through typed HTTP routes used by the embedded UI.
- Buddy replaces Excalidraw MCP's `read_me` tool with the `whiteboard-authoring` skill and exposes `whiteboard_read_context` because Buddy's embedded canvas context is not an MCP App widget context.
- The existing `createBuddyTool` API is sufficient. The whiteboard feature does not require a new tool-definition abstraction.
- Provider-level strict-schema propagation is a separate runtime improvement and is not required for this feature.

## Model-Visible Tools

```ts
whiteboard_create_view({
  elements: string,
})
```

- `elements` is a compact JSON-array string containing Excalidraw shorthand elements and supported pseudo-elements.
- A program without `restoreCheckpoint` replaces the current board from scratch.
- A program beginning with `restoreCheckpoint` continues the current board only when the handle id is exactly `current`; invalid or stale handles are rejected instead of silently mutating the current board.
- A `delete` pseudo-element removes existing elements; Buddy accepts Excalidraw MCP's `ids` list and `id` fallback forms.
- A `translate` pseudo-element moves a comma-separated group of stable ids together.
- The backend parses and validates the drawing program with an internal Zod DSL and returns actionable errors.
- Agent programs and learner-edit snapshots are capped at 5 MB, matching the official Excalidraw MCP checkpoint ceiling.
- Every successful call saves the current board and returns the view to latest.
- Every successful write returns the continuation handle as `checkpointId` plus a concrete `boardID`; the handle is the stable current-board continuation target.
- The frontend persists a post-render layout report for the current board after Excalidraw renders it. The backend stores the detailed report on `currentBoard.renderReport` but exposes only a compact digest through `whiteboard_read_context`.
- The layout report contains only information the backend/model cannot reliably know from raw JSON: actual rendered text/label bounds, actual converted element bounds, viewport/canvas dimensions, and content bounds. It must not dump the full report into model context.
- The typed UI route is `PUT /api/whiteboards/session/:sessionID/render-report` with operation id `whiteboards.renderReport.save`; it is best-effort and returns `{ saved: boolean }`.
- Do not require `whiteboard_read_context` before every write. The write path follows the useful part of file-edit and patch safety: apply against the latest backend board, hard-fail only when the program's touched ids no longer match the model's recorded anchors, and return a targeted stale/conflict digest only for those touched facts.
- A stale/conflict digest is small and specific: missing ids, moved/resized/text-changed summaries, and render-bounds changes for touched ids. It tells the model to call `whiteboard_read_context` only when the pending write cannot be safely applied.
- Successful writes may include derived `layoutWarnings` in the tool output and metadata. This compact model-facing review is not stored board state.
- Split backend-estimated layout review into hard collisions and advisory proximity notices. Hard codes are `lt` for arrow/line crossing text, `tt` for overlapping text/labels, and `ss` for sibling-shape overlap. Advisory codes are `ln` for arrow/line near text and `tn` for near-touching text/labels.
- Cap layout warnings at 10 and list hard collisions before advisory proximity notices so important failures cannot be buried by cosmetic spacing notices.
- Ordinary warnings do not reject or roll back the save. When hard collisions remain, emit a prominent repair-suggested prefix and tell the model what is wrong so it can make one normal continuation call using `restoreCheckpoint`, `translate`, and local delete-and-redraw work.
- Detect crowded container zones from child geometry and their hard-collision graph. When one zone has several hard collisions or several affected children, return its exact scope ids and suggest one redraw-zone continuation: delete exactly the crowded zone and children, recreate only that zone with new ids in a substantially larger area, leave outside elements unchanged, and expand the camera if needed.
- Do not use backend-estimated text or label overflow as an auto-repair trigger. Only frontend-render-report digest may report `text_overflow`, and only when actual rendered text bounds protrude outside the rendered container by a meaningful area and pixel margin.
- The first warning pass skips obvious false positives for containment layouts and Venn-style ellipse overlaps.

```ts
whiteboard_read_context({})
```

- Returns compact latest-backend context for the current board.
- The agent uses it before precise edits so learner changes are preserved.
- It returns the real current backend board.
- Its result includes the active continuation handle, current-board summary, stable semantic element ids, compact geometry, visible text/label text, latest learner-edit summary, and a capped `layout` digest when frontend render facts exist.
- A successful read records `modelContext` anchors for the current board. Successful agent writes also record anchors for the board they created. Learner edits and render-report saves do not update `modelContext`.

## Drawing Program

```json
[
  {"type":"restoreCheckpoint","id":"phase-transition"},
  {"type":"translate","ids":"solid,liquid,gas","dx":120,"dy":0},
  {"type":"delete","id":"old-label"},
  {"type":"text","id":"new-label","x":620,"y":120,"text":"Gas"}
]
```

- Normal shorthand elements append content.
- `restoreCheckpoint` is a continuation instruction and must be first when present.
- `delete` removes elements by stable semantic id.
- `translate` moves related ids together and also moves bound text children with their container.
- `cameraUpdate` controls the intended scene-space viewport with `x`, `y`, `width`, and `height` and is not a drawn element.
- Non-4:3 `cameraUpdate` entries are accepted but return the same style of corrective ratio hint as Excalidraw MCP.
- Full canonical Excalidraw snapshots remain backend-owned; the model does not submit raw editor state.

## Continuation

- `checkpointId` is a semantic current-board continuation handle, not an immutable revision id.
- Buddy currently exposes one continuation handle, `current`.
- A continuation handle resolves to the latest persisted current board under the session mutation lock.
- Every agent write creates the next current checkpoint. Learner autosaves update that same checkpoint id in place, matching Excalidraw MCP's widget-only `save_checkpoint`.
- The backend keeps the previous board only to summarize the latest learner edit for model context.
- Continuation writes are stale-guarded only for touched ids from `delete`, `translate`, and new elements that reference an existing `containerId`, `startBinding.elementId`, or `endBinding.elementId`.
- Continuation appends that touch no existing ids are allowed even if unrelated learner edits happened after the model last read the board.
- Render bounds are supplemental stale anchors. They fail a touched-id write only when both the model-seen anchor and current board have render bounds and those bounds changed; bounds becoming newly available or temporarily unavailable is not a stale conflict.
- Replacement writes without `restoreCheckpoint` skip stale safety because they intentionally replace the whole board.

## UI-Only API Boundary

- React uses generated `BuddyClient` routes for session state, learner-edit persistence, and sharing.
- UI-only routes are not exposed as model-visible tools.
- The model does not provide `sessionID` or immutable revision ids because Buddy already knows the current session and current board.
- Excalidraw image insertion is disabled in v1 because the persistence contract does not include binary files.
- `Share board` is a user-initiated UI action, not a model-visible tool. It settles pending learner saves, serializes the live canvas draft when present, otherwise serializes the latest fetched current board, sends the Excalidraw JSON through a typed Buddy route, encrypts and uploads it using Excalidraw's public JSON endpoint flow, and opens the returned `excalidraw.com/#json=...` link through Buddy's platform external-link handler.

## Frontend Summary Integration

- `whiteboard_create_view` appears inside the existing hidden-steps summary block alongside other tool activity; it is not rendered as a new standalone transcript block.
- The summary row uses a Presentation icon.
- While pending or running, the summary label is `Updating Whiteboard` and uses the existing active `TextShimmer` treatment.
- When complete, the summary label becomes the static past-tense `Updated Whiteboard`.
- Repeated completed whiteboard writes aggregate using the existing hidden-steps count treatment, for example `Updated Whiteboard ×3`.
- `whiteboard_read_context` remains summarized as lightweight tool activity and should not create a visible artifact card.
- Configure `whiteboard_create_view` with the existing Buddy tool UI metadata:

```ts
ui: {
  presentation: "hidden-summary",
  labels: {
    running: "Updating Whiteboard",
    idle: "Updated Whiteboard",
  },
}
```

- Add a built-in web tool-renderer registration for `whiteboard_create_view` so the summary row uses a Presentation icon instead of the generic fallback Wrench icon.

## Composer Workspace Shortcuts

- After a whiteboard tool has appeared in the current conversation, show a ghost Presentation button in the composer context row next to the Buddy persona selector.
- The Presentation button toggles between the normal chat route and the whiteboard workspace route.
- After a reading resource has been opened for the directory, show a ghost Book button in the same composer context row.
- The Book button toggles between the normal chat route and the reading workspace route, using the existing persisted last-opened reading resource.
- These buttons are derived from existing chat/tool history and reading store state; they do not introduce a new persistence model.

## Tool Schema Constraints

- Model-visible tool schemas use strict root objects and avoid root-level discriminated unions.
- `whiteboard_create_view` has only `elements: string`.
- `whiteboard_read_context` has an empty strict object.
- Keep `whiteboard_create_view` close to Excalidraw MCP's `create_view`: the tool text itself should stay short and format-first, while Buddy-specific continuation workflow, repair instructions, and editing strategy live in `whiteboard_read_context` and the `whiteboard-authoring` skill.
- Buddy must retain runtime Zod validation after parsing the string program.
- Provider-level strict generation is a separate reliability improvement because Buddy's current AI SDK bridge does not yet pass `strict: true`.

## Streaming Decision

- Keep the string-program API regardless of initial animation scope.
- Include model-time progressive drawing in v1.
- Treat partial drawing input as an ephemeral best-effort preview; only the final parsed and validated program saves the durable current board.
- Reuse the existing provider `tool-input-delta` stream and existing `message.part.delta` SSE path rather than add a separate HTTP API.
- Add a Buddy-owned adapter startup patch that observes normalized `tool-input-delta` events before the protected vendored processor drops them and forwards pending whiteboard fragments through the existing `message.part.delta` path.
- The chat-stream coalescer may drop ordinary stale text deltas when a newer part snapshot arrives, but it must never drop `message.part.delta` events for `state.raw`. Whiteboard live preview depends on every raw tool-input fragment reaching the progressive parser.
- Decode the partial outer function-argument JSON incrementally, then reuse Excalidraw MCP's approach of rendering complete inner array elements as they become available.
- Coalesce rendering work so Excalidraw conversion and drawing updates happen only when a new complete element is available.
- Apply complete streaming `restoreCheckpoint`, `delete`, and `translate` control objects immediately even when they are the newest complete item, matching Excalidraw MCP's widget behavior.
- A streaming `restoreCheckpoint` previews against the latest fetched current board. Buddy does not load alternate scenes.
- Streaming preview follows the same single-handle rule: only `restoreCheckpoint.id === "current"` continues the current board; invalid handles do not preview as current-board edits.
- Keep the last complete progressive preview sticky through the pending-to-running-to-durable handoff so the canvas does not disappear while the tool is executing.
- Keep that sticky preview after the latest whiteboard write fails only while the assistant turn is still busy, so malformed JSON retries do not blank and rebuild the board. Once the turn settles idle, clear the failed preview and return to the durable editable board.
- Do not replace a visible board with an empty progressive replacement preview made only from partial controls such as `cameraUpdate`; wait until usable drawable content exists, matching Excalidraw MCP's SVG update behavior.
- Fold message-local whiteboard history while streaming: start from the latest fetched backend board, replay saved completed `whiteboard_create_view` calls with board ids newer than that backend head, skip completed parts with `metadata.saved === false`, then apply the newest pending/running partial program.
- Refetch the whiteboard session when the completed whiteboard tool count changes so durable state catches up during multi-tool assistant turns instead of waiting only for final turn idle.
- Also refetch once when a mounted whiteboard pane observes chat activity move from busy to idle. This is a safety net for missed stream/final events; it must preserve the same session canvas key and pane-owned viewport so the board does not flicker or reset zoom.
- Assign deterministic Excalidraw seeds to streamed skeleton elements before conversion so repeated conversions of the same complete element do not produce visual jitter.
- Derive restored zoom from the whiteboard pane's actual Excalidraw `appState.width` and `appState.height`. Keep the visible viewport in the pane so preview and durable-board transitions reuse the same camera; model camera framing initializes the view only when the session has no retained live viewport.
- Load Excalidraw fonts before converting shorthand labels, then refresh text dimensions before applying streamed or durable elements; otherwise bound labels can be measured with fallback fonts and shift when the final editable scene settles.
- Match Excalidraw MCP's first line of defense by stripping pseudo-elements out of the durable element list, rejecting unsupported drawn element types, and otherwise preserving supported raw skeleton/native element objects for Excalidraw conversion.
- Treat frontend invalid-element handling as a fallback for legacy or corrupt state only; the canvas should skip unsupported elements and show a small warning instead of crashing the route.

## V2

- V2 simplifies the whiteboard around one rule: each chat session has one mutable current board.
- The feature is unshipped, so V2 is allowed to break old whiteboard route and storage shapes instead of preserving compatibility.
- Buddy reuses the upstream Excalidraw MCP model-facing pattern: one `elements` string, streamed partial parsing, pseudo-elements for `restoreCheckpoint`, `delete`, and `cameraUpdate`, and debounced user-edit persistence.
- Buddy intentionally does not keep the earlier Buddy-only scene/revision model:
  - no scene switcher
  - no `New scene`
  - no history scrubber
  - no `baseRevisionID`
  - no learner-facing history or revision conflict controls
- Learner autosave updates the current checkpoint in place only when its `baseBoardID` still matches. Delayed snapshots tied to an older checkpoint fail with `409` and refetch latest state. Agent writes build from the latest current board under the session mutation lock and then create the next current checkpoint.
- The backend keeps `previousBoard` only for recovery/context summaries, not as a user-visible timeline.
- The user mental model is: "this chat has one whiteboard, and Buddy or I can update the current board."

## Implementation Status

- The durable backend and embedded UI are implemented end to end: feature registration, two model-visible tools, authoring skill, one mutable current board per session, typed UI routes, generated SDK consumption, editable Excalidraw canvas, learner-save debounce, and hidden-summary labels and icon.
- The frontend progressive consumer is implemented and tested. It accepts pending `state.raw` deltas, removes one outer JSON-string escaping layer, parses complete inner objects, withholds the newest partial item like official Excalidraw MCP, and applies restore, delete, and translate semantics ephemerally.
- The progressive whiteboard view now reads pending and running tool input, keeps a sticky last-usable preview through malformed chunks and active failed retries until a newer usable preview or durable board lands, clears failed previews after the turn becomes idle, carries cameraUpdate into the preview, and avoids sending a fresh canvas scene when only the newest incomplete token changed.
- The backend now validates and repairs at the right boundary: malformed outer JSON, non-array input, and oversized payloads remain program-level failures; recoverable individual-element issues are skipped or normalized with warnings so one bad element does not fail the whole drawing.
- The write path skips unsupported drawn elements and elements missing required `id`, `type`, or scene `x/y`; it skips duplicate live ids, normalizes common label text aliases, and preserves supported raw skeleton/native element objects instead of requiring every optional Excalidraw geometry field up front.
- The write path does not save blank-success or no-op boards: a fresh program must leave at least one valid drawable element, and a continuation must make a valid content or viewport change.
- Continuation writes resolve their base board inside the same per-session mutation lock that writes the next board, so concurrent agent writes preserve intervening learner or agent changes.
- Learner edits run through the same persistable-element whitelist before storage, so unsupported user-edited elements are rejected while supported Excalidraw skeleton/native objects are preserved for the render adapter.
- `whiteboard_read_context` now returns compact latest-board geometry, visible text/label text, and latest learner-edit summary so the model can read user-added board text like Excalidraw MCP's widget context.
- The frontend now sends post-render Excalidraw layout reports after durable, editable board renders. Reports are deduped by board, element versions, viewport, and canvas; progressive read-only previews do not report.
- The backend stores render reports only when the report `boardID` matches the current board. Stale reports return `{ saved: false }` and do not create boards, update board content timestamps, or alter `previousBoard`.
- The frontend also keys render-report emission by current board `updatedAt`, so same-board learner autosaves that rebuild the current checkpoint can repost measurements even when the rendered element signature is unchanged.
- `whiteboard_read_context` now records `modelContext` anchors and returns a compact layout digest from stored render reports, never the full render report.
- Continuation stale safety is patch-style: appends are allowed, unrelated learner edits are allowed, touched ids that moved, resized, changed text, disappeared, or changed render bounds fail with `WhiteboardStaleWriteError`. Newly available or missing render bounds alone do not fail a write.
- Learner-edit debouncing captures the save handler with each pending snapshot, flushes before board replacement, and flushes on canvas unmount.
- Learner-edit saves are serialized and upstream-style: the scheduler keeps only the newest pending learner draft, flushes it after an in-flight save succeeds, and leaves it queued for explicit retry if that in-flight save fails.
- Learner autosaves no longer create new board ids. They carry the stable current-checkpoint `baseBoardID`; stale delayed snapshots fail with `409`, refetch latest state, and are discarded instead of overwriting an intervening agent checkpoint.
- Learner autosave payloads filter unsupported Excalidraw editor element types before calling the backend, matching the backend's persisted drawn-element whitelist instead of letting one unsupported local editor object fail the whole save.
- If an in-flight learner save fails, the scheduler keeps the newest queued edit rather than restoring the older failed payload.
- Programmatic Excalidraw scene updates are suppressed in the learner-autosave handler. Excalidraw MCP separates streamed SVG preview from its checkpoint editor; Buddy adapts that boundary by keeping one embedded Excalidraw canvas per chat session, disabling autosave while progressive preview state is applied, and rebinding autosave to a completed agent checkpoint only after the durable scene is applied and baselined.
- Progressive frames update only the mounted Excalidraw scene elements. They must not flush learner saves, re-arm durable autosave baselines, or reapply model viewport state on each partial fragment. The canvas restores viewport state on initial mount, then preserves learner pan and zoom across streamed frames and the final durable handoff.
- The Excalidraw editor does not mount while fonts are loading. After mount, learner autosave remains disarmed until the editor captures its actual initial scene baseline, matching Excalidraw MCP's delayed editor reveal and preventing empty initialization callbacks from becoming learner saves.
- Empty learner autosaves are valid, matching Excalidraw MCP's `save_checkpoint`: a learner can clear the board. A stale canvas instance cannot clear or shrink a newer agent checkpoint because it remains bound to its older `baseBoardID`.
- Whiteboard session reads return only the current board; the whiteboard header no longer exposes scene switching, `New scene`, or history controls.
- The whiteboard tool and skill now treat missing `restoreCheckpoint` as replacing the current board from scratch; every edit, repair, continuation, or follow-up should restore the current continuation handle first. The only valid handle is `current`.
- Whiteboard session reads sanitize legacy invalid persisted elements before returning data to the frontend.
- The Excalidraw canvas conversion path now skips unsupported elements with a warning overlay rather than throwing through the router boundary.
- The pure frontend element-conversion helper stays DOM-free for Bun tests; Excalidraw runtime conversion remains inside the browser canvas component.
- Viewport restore now uses persisted viewport width/height plus current canvas dimensions to restore the matching zoom instead of applying only raw scroll offsets.
- Streaming viewport restore now respects learner camera interaction: progressive updates and completed durable-board application reuse the pane-owned live viewport on the same session canvas instead of resetting zoom or pan.
- The embedded canvas mirrors Excalidraw MCP's font-stability workaround by preloading Excalifont/Assistant, refreshing text dimensions, and applying remote scene updates with `CaptureUpdateAction.NEVER`.
- The frontend render adapter treats persisted editor-native Excalidraw elements as already converted and restores them directly; only shorthand skeleton elements go through `convertToExcalidrawElements`. This prevents bound labels from being converted twice and shifting after a durable save.
- Live model-time progressive frames use a Buddy-owned adapter startup patch: it wraps the shared vendored LLM stream before server startup, observes normalized `tool-input-delta` events before the vendored compatibility processor drops them, and publishes pending `state.raw` deltas through the existing session-delta event path.
- The web chat-stream coalescer preserves whiteboard `state.raw` deltas even when a newer `message.part.updated` snapshot is queued in the same frame; otherwise live Excalidraw preview disappears even though the backend still persists the final board.
- The adapter patch has a focused regression test that pins the upstream normalization and discard assumptions, verifies startup installation, verifies whiteboard-only forwarding, verifies cleanup after pending state, and rejects malformed events.
- Do not patch `vendor/opencode` directly for this feature.
- The temporary floating whiteboard overlay has been replaced with the `/$directory/whiteboard` route.
- Reading and whiteboard modes now share a pathless TanStack workspace layout route, the extracted resizable workspace UI, and the chat-side thread-browser wrapper; the titlebar back action handles both focused workspace routes.
- Active `whiteboard_create_view` tool parts automatically open the whiteboard route, including first-call progressive previews before a durable board exists.
- The whiteboard pane primarily refetches durable session state on completed whiteboard writes, and also performs one busy-to-idle refetch fallback while mounted so a missed final update does not require a manual reload. The refetch path preserves the session canvas and live viewport.
- Transient whiteboard save/share status now resets when the linked chat session or current board changes, so an old autosave banner cannot leak into a fresh draft or newly selected chat.
- The `whiteboard-authoring` skill is now based on Excalidraw MCP's `RECALL_CHEAT_SHEET` with Buddy-specific notes for `whiteboard_create_view`, `whiteboard_read_context`, and continuation handles.
- The `whiteboard-authoring` skill tells simplified maps, battlefield maps, and geographic sketches to reserve a roomy 1200x900 or 1600x1200 camera in their first `cameraUpdate` instead of expanding only after collisions appear.
- Composer workspace shortcut buttons are implemented for whiteboard and reading routes.
