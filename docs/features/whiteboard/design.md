!!IMP read the message file this folder and make changes. /Users/prashantbhudwal/Code/buddy/docs/features/whiteboard/message.md

# Whiteboard Design

## Locked Product Decisions

- The whiteboard is session-scoped persistent state rendered in a dedicated whiteboard view.
- Replace the temporary floating overlay with the existing reading-view interaction model: a large left workspace for the board and chat moved into the right-side pane with the same transition behavior.
- Reuse or extract the reading-view layout primitives instead of copying its layout implementation.
- The learner can pan and zoom the canvas; the persistence model must support direct learner edits.
- The backend stores immutable revisions for agent writes and learner edits.
- The revision scrubber previews historical state without moving the backend head.
- The next agent write after a scrub applies to the latest backend head and returns the view to latest.
- The view includes `New scene` and `Back to latest` affordances.
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
- Buddy does not need app-only model tools. Learner edits, checkpoint reads, and blank-scene creation travel through typed HTTP routes used by the embedded UI.
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
- A program without `restoreCheckpoint` creates a fresh scene and makes it active.
- A program beginning with `restoreCheckpoint` continues an existing scene.
- A `delete` pseudo-element removes existing elements; Buddy accepts Excalidraw MCP's `ids` list and `id` fallback forms.
- An `update` pseudo-element patches an existing element in place, and a `translate` pseudo-element moves a comma-separated group of stable ids together.
- A warning-driven roomy relayout begins with `restoreCheckpoint` and a `layoutCleanup` marker. It remains one model-chosen continuation call, not an automatic retry.
- The backend parses and validates the drawing program with an internal Zod DSL and returns actionable errors.
- Agent programs and learner-edit snapshots are capped at 5 MB, matching the official Excalidraw MCP checkpoint ceiling.
- Every successful call creates an immutable revision and returns the view to latest.
- Every successful write returns a checkpoint-compatible continuation handle; Buddy aliases this in metadata as both `sceneID` and `checkpointId`.
- Successful writes may include derived `layoutWarnings` in the tool output and metadata. This compact model-facing review is not stored revision state.
- Split layout review into hard collisions and advisory proximity notices. Hard codes are `of` for text/label overflow outside a container, `lt` for arrow/line crossing text, `tt` for overlapping text/labels, and `ss` for sibling-shape overlap. Advisory codes are `ln` for arrow/line near text and `tn` for near-touching text/labels.
- Cap layout warnings at 10 and list hard collisions before advisory proximity notices so important failures cannot be buried by cosmetic spacing notices.
- Ordinary warnings do not reject or roll back the save. When hard collisions remain, emit a prominent roomy-relayout-required prefix and ask the model for at most one warning-driven continuation write before replying. The instruction defaults to creating space before local fixes, moving related elements together, expanding the camera to the next 4:3 size, and preserving content without adding detail.
- Detect crowded container zones from child geometry and their hard-collision graph. When one zone has several hard collisions or several affected children, return its exact scope ids and ask for one redraw-zone continuation instead of positional repair: delete exactly the crowded zone and children, recreate only that zone with new ids in a substantially larger area, leave outside elements unchanged, and expand the camera.
- Reject `redraw_zone` cleanup programs that use `update` or `translate`, fail to delete exactly the reported zone scope, delete outside elements, or recreate elements outside a bounded expansion around the targeted zone. This keeps repair local and prevents a full-diagram redraw.
- Treat isolated text overflow as a resize-or-recreate problem. Ask the model to enlarge the container substantially, shorten the text, or recreate the text block; do not advise moving the text alone.
- A continuation marked with `layoutCleanup` advances the active head only when its candidate reduces the deterministic hard-collision count. A `redraw_zone` candidate must make a meaningful reduction of at least two hard collisions or 30 percent of the prior count, whichever is greater. Accepted and rejected candidates both tell the model to continue instead of attempting another warning-driven cleanup pass.
- The first warning pass skips obvious false positives for containment layouts and Venn-style ellipse overlaps.

```ts
whiteboard_read_context({})
```

- Returns compact latest-backend context for the active scene.
- The agent uses it before precise edits so learner changes are preserved.
- It returns the real backend head, never the revision currently previewed by the scrubber.
- Its result includes the active continuation handle, revision summary, stable semantic element ids, compact geometry, visible text/label text, and latest learner-edit summary.

## Drawing Program

```json
[
  {"type":"restoreCheckpoint","id":"phase-transition"},
  {"type":"layoutCleanup","strategy":"spread_zone"},
  {"type":"translate","ids":"solid,liquid,gas","dx":120,"dy":0},
  {"type":"update","id":"gas","x":620,"y":120}
]
```

- Normal shorthand elements append content.
- `restoreCheckpoint` is a continuation instruction and must be first when present.
- `delete` removes elements by stable semantic id.
- `update` patches an existing element while preserving its stable id and drawn type; positional patches also move bound text children with their container.
- `translate` moves related ids together and also moves bound text children with their container.
- `layoutCleanup` marks the one warning-driven roomy relayout candidate so the backend can compare its hard-collision count against the prior head before committing it.
- `cameraUpdate` controls the intended scene-space viewport with `x`, `y`, `width`, and `height` and is not a drawn element.
- Non-4:3 `cameraUpdate` entries are accepted but return the same style of corrective ratio hint as Excalidraw MCP.
- Full canonical Excalidraw snapshots remain backend-owned; the model does not submit raw editor state.

## Continuation And History

- A checkpoint id is a semantic scene-continuation handle, not an immutable revision id.
- A continuation handle resolves to the latest backend head for its scene.
- Every agent write creates an immutable revision.
- Debounced learner edits create immutable revisions and advance the scene head.
- Scrubbing changes frontend preview state only.
- A later `restoreCheckpoint` resolves to the latest scene head even when the learner is previewing history.

## UI-Only API Boundary

- React uses generated `BuddyClient` routes for scene state, revisions, scrub previews, learner-edit persistence, and new-scene creation.
- UI-only routes are not exposed as model-visible tools.
- The model does not provide `sessionID` or immutable revision ids because Buddy already knows the current session and backend head.
- Excalidraw image insertion is disabled in v1 because the persistence contract does not include binary files.
- `Share board` is a user-initiated UI action, not a model-visible tool. It settles pending learner saves, serializes the visible scrubbed revision during history preview, serializes the live canvas draft when present on the editable latest revision, sends the Excalidraw JSON through a typed Buddy route, encrypts and uploads it using Excalidraw's public JSON endpoint flow, and opens the returned `excalidraw.com/#json=...` link through Buddy's platform external-link handler.

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
- Buddy must retain runtime Zod validation after parsing the string program.
- Provider-level strict generation is a separate reliability improvement because Buddy's current AI SDK bridge does not yet pass `strict: true`.

## Streaming Decision

- Keep the string-program API regardless of initial animation scope.
- Include model-time progressive drawing in v1.
- Treat partial drawing input as an ephemeral best-effort preview; only the final parsed and validated program creates a durable revision.
- Reuse the existing provider `tool-input-delta` stream and existing `message.part.delta` SSE path rather than add a separate HTTP API.
- Add a Buddy-owned adapter startup patch that observes normalized `tool-input-delta` events before the protected vendored processor drops them and forwards pending whiteboard fragments through the existing `message.part.delta` path.
- Decode the partial outer function-argument JSON incrementally, then reuse Excalidraw MCP's approach of rendering complete inner array elements as they become available.
- Coalesce rendering work so Excalidraw conversion and drawing updates happen only when a new complete element is available.
- Apply complete streaming `restoreCheckpoint`, `delete`, `update`, `translate`, and `layoutCleanup` control objects immediately even when they are the newest complete item, matching Excalidraw MCP's widget behavior.
- When a streaming `restoreCheckpoint` targets a non-active scene, read that scene's latest revision through the typed whiteboard scene-latest route and preview against it, matching Excalidraw MCP's checkpoint loader.
- Keep the last complete progressive preview sticky through the pending-to-running-to-durable handoff so the canvas does not disappear while the tool is executing.
- Clear that sticky preview when no whiteboard write is active and no completed write is newer than the fetched durable head, so failed or rejected streams do not leave unsaved read-only drawings on screen.
- Fold message-local whiteboard history while streaming: start from the latest fetched backend revision, replay saved completed `whiteboard_create_view` calls with revision ids newer than that backend head, skip completed parts with `metadata.saved === false`, then apply the newest pending/running partial program.
- Refetch the whiteboard session when the completed whiteboard tool count changes so durable state catches up during multi-tool assistant turns instead of waiting only for final turn idle.
- Assign deterministic Excalidraw seeds to streamed skeleton elements before conversion so repeated conversions of the same complete element do not produce visual jitter.
- Derive restored zoom from the whiteboard pane's actual Excalidraw `appState.width` and `appState.height`, but stop applying agent camera restores after the learner manually pans or zooms during streaming.
- Load Excalidraw fonts before converting shorthand labels, then refresh text dimensions before applying streamed or durable elements; otherwise bound labels can be measured with fallback fonts and shift when the final editable scene settles.
- Match Excalidraw MCP's first line of defense by stripping pseudo-elements out of the durable element list and rejecting unsupported drawn element types before persistence.
- Treat frontend invalid-element handling as a fallback for legacy or corrupt state only; the canvas should skip unsupported elements and show a small warning instead of crashing the route.

## Implementation Status

- The durable backend and initial embedded UI are implemented end to end: feature registration, two model-visible tools, authoring skill, immutable session revisions, semantic continuation handles, typed UI routes, generated SDK consumption, editable Excalidraw canvas, learner-save debounce, scrub preview, `New scene`, `Back to latest`, and hidden-summary labels and icon.
- The frontend progressive consumer is implemented and tested. It accepts pending `state.raw` deltas, removes one outer JSON-string escaping layer, parses complete inner objects, withholds the newest partial item like official Excalidraw MCP, and applies restore, delete, update, translate, and layout-cleanup semantics ephemerally.
- The progressive whiteboard view now reads pending and running tool input, keeps a sticky last-complete preview until a durable revision lands, carries cameraUpdate into the preview, and avoids sending a fresh canvas scene when only the newest incomplete token changed.
- The backend now validates and repairs at the right boundary: malformed outer JSON, non-array input, oversized payloads, and missing continuation scenes remain program-level failures; recoverable individual-element issues are skipped or normalized with warnings so one bad element does not fail the whole drawing.
- The write path skips unsupported or malformed drawn elements, skips duplicate live ids, normalizes common label text aliases, and drops only unrecoverable labels while preserving their parent element.
- The write path does not save blank-success or no-op revisions: a fresh program must leave at least one valid drawable element, and a continuation must make a valid content or viewport change.
- Continuation writes resolve their base scene inside the same per-session mutation lock that appends the revision, so concurrent agent writes preserve intervening learner or agent changes.
- Learner edits run through the same persistable-element validation before storage, so unsupported or malformed user-edited elements are rejected at save time instead of being persisted and later sanitized away.
- `whiteboard_read_context` now returns compact latest-board geometry, visible text/label text, and latest learner-edit summary so the model can read user-added board text like Excalidraw MCP's widget context.
- Learner-edit debouncing captures the base revision and save handler with each pending snapshot, flushes before revision replacement, and flushes on canvas unmount.
- Learner-edit saves are serialized; queued manual edits survive failed in-flight saves, rebase onto a refetched or successfully saved head when one is available, and stale duplicate conflicts are suppressed when the attempted element content is already durable.
- Learner autosave payloads filter unsupported Excalidraw editor element types before calling the backend, matching the backend's persisted drawn-element whitelist instead of letting one unsupported local editor object fail the whole save.
- If an in-flight learner save fails without a replacement base revision, the scheduler keeps the newest queued edit rather than restoring the older failed payload.
- Learner autosaves targeting a scene that is no longer active are rejected as stale conflicts so delayed saves cannot reactivate or mutate an old scene after the user creates or switches scenes.
- `New scene` settles the pending learner-save debounce before creating the blank active scene and aborts if that forced save reports failure.
- Whiteboard revision ids are generated with a monotonic ULID factory so same-millisecond completed tool results preserve lexicographic order for progressive replay.
- Each scene retains a bounded revision window in the session JSON; old revision bodies outside that window are pruned to keep learner autosaves from rewriting unbounded full-snapshot history.
- Whiteboard session and revision reads sanitize legacy invalid persisted elements before returning data to the frontend.
- The Excalidraw canvas conversion path now skips unsupported elements with a warning overlay rather than throwing through the router boundary.
- The pure frontend element-conversion helper stays DOM-free for Bun tests; Excalidraw runtime conversion remains inside the browser canvas component.
- Viewport restore now uses persisted viewport width/height plus current canvas dimensions to restore the matching zoom instead of applying only raw scroll offsets.
- Streaming viewport restore now respects learner camera interaction: progressive updates keep rendering elements, but once the learner pans or zooms, later frames in that stream no longer reset their view. A new durable revision clears that override so later agent updates can frame themselves.
- The embedded canvas mirrors Excalidraw MCP's font-stability workaround by preloading Excalifont/Assistant, refreshing text dimensions, and applying remote scene updates with `CaptureUpdateAction.NEVER`.
- The frontend render adapter treats persisted editor-native Excalidraw elements as already converted and restores them directly; only shorthand skeleton elements go through `convertToExcalidrawElements`. This prevents bound labels from being converted twice and shifting after a durable save.
- Live model-time progressive frames use a Buddy-owned adapter startup patch: it wraps the shared vendored LLM stream before server startup, observes normalized `tool-input-delta` events before the vendored compatibility processor drops them, and publishes pending `state.raw` deltas through the existing session-delta event path.
- The adapter patch has a focused regression test that pins the upstream normalization and discard assumptions, verifies startup installation, verifies whiteboard-only forwarding, verifies cleanup after pending state, and rejects malformed events.
- Do not patch `vendor/opencode` directly for this feature.
- The temporary floating whiteboard overlay has been replaced with the `/$directory/whiteboard` route.
- Reading and whiteboard modes now share a pathless TanStack workspace layout route, the extracted resizable workspace UI, and the chat-side thread-browser wrapper; the titlebar back action handles both focused workspace routes.
- Active `whiteboard_create_view` tool parts automatically open the whiteboard route, including first-call progressive previews before a durable scene exists.
- The `whiteboard-authoring` skill is now based on Excalidraw MCP's `RECALL_CHEAT_SHEET` with Buddy-specific notes for `whiteboard_create_view`, `whiteboard_read_context`, and continuation handles.
- The `whiteboard-authoring` skill tells simplified maps, battlefield maps, and geographic sketches to reserve a roomy 1200x900 or 1600x1200 camera in their first `cameraUpdate` instead of expanding only after collisions appear.
- Composer workspace shortcut buttons are implemented for whiteboard and reading routes.
