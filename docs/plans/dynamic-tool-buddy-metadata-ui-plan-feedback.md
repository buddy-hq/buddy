# Feedback: Dynamic Tool Buddy Metadata UI Plan

Reviewed against the current codebase on 2026-04-27 with a falsification bias.

## Verdict

The plan is directionally right about the user-facing problem, but it currently underestimates two transport constraints in the real code:

1. pending-stage metadata has no safe place to live today
2. registration-time inference cannot happen in `ToolRegistry.register(...)` as currently wired

If those two constraints are not addressed explicitly, Phase 1 will hit a dead end or leak Buddy UI metadata back into provider history.

## What I Verified

I traced these seams in real code:

- authoring: `packages/buddy/src/learning/tools/create-buddy-tool.ts`
- registration: `packages/buddy/src/learning/tools/register-buddy-tools.ts`, `packages/opencode-adapter/src/registry.ts`
- runtime bootstrap: `packages/buddy/src/opencode-runtime/runtime.ts`
- existing live patch: `packages/opencode-adapter/src/session-live.ts`
- lifecycle writes: `vendor/opencode/packages/opencode/src/session/processor.ts`, `vendor/opencode/packages/opencode/src/session/prompt.ts`
- message serialization: `vendor/opencode/packages/opencode/src/session/message-v2.ts`
- frontend grouping/rendering: `packages/web/src/components/chat/utils/constants.ts`, `packages/web/src/components/chat/utils/message-utils.ts`, `packages/web/src/components/chat/tools/parse-tool-state.ts`, `packages/web/src/components/chat/tools/tool-info.ts`, `packages/web/src/components/chat/tools/hidden-steps/index.tsx`, `packages/web/src/components/chat/tools/tools.tsx`

I also ran these empirical checks:

```sh
bun test --preload ./happydom.ts test/hidden-steps-layout.test.tsx
```

This passed in `packages/web`.

```sh
bun -e 'import { groupAssistantParts } from "./src/components/chat/utils/message-utils"; ...'
```

This showed a tool part carrying `metadata.buddy.presentation = "hidden-summary"` is still returned as a visible `"part"` item today, not an `"abstracted"` item.

```sh
bun -e 'import { Effect } from "effect"; import { MessageV2 } from "@buddy/opencode-adapter/message"; ...'
```

This showed `part.metadata.buddy` is serialized back into model-facing `providerOptions.buddy` for prior tool calls.

```sh
bun -e 'import { MessageV2 } from "@buddy/opencode-adapter/message"; MessageV2.Part.parse(...)'
```

This showed extra `metadata` placed inside a pending tool state is stripped by the schema.

## Confirmed Assumptions

- `dynamic` is the real Buddy authoring source of truth today. `createBuddyTool(...)` stores cloned `dynamic` metadata on the returned Buddy tool object at `packages/buddy/src/learning/tools/create-buddy-tool.ts:94-99` and `:151-168`.
- frontend tool state parsing already merges `part.metadata` and `state.metadata`, with state metadata winning on key conflicts. See `packages/web/src/components/chat/tools/parse-tool-state.ts:86-116` and `:124-169`.
- the current UI absolutely still needs a non-manual path for dynamic tools. Dynamic tools are not in `ABSTRACTABLE_TOOLS`, so they do not collapse into hidden steps today. See `packages/web/src/components/chat/utils/constants.ts:17-36` and `packages/web/src/components/chat/utils/message-utils.ts:89-107`.
- `learning_tool_search` and `learning_tool_load` do still need explicit frontend treatment if they should become hidden steps. They are not registered with hidden-step presenters in `packages/web/src/components/chat/tools/tools.tsx:33-149`, and they would currently fall back to raw tool names via `packages/web/src/components/chat/tools/tool-info.ts:340-345`.
- the existing runtime bootstrap seam is real, but it already hosts a different patch. `packages/buddy/src/opencode-runtime/runtime.ts:38` installs `ensureSessionServicePatched()`, which comes from `packages/opencode-adapter/src/session-live.ts`.

## Broken Or Missing Assumptions

### 1. Pending-stage metadata does not have a safe storage slot today

This is the biggest gap.

- pending tool state has no `metadata` field in the message schema: `vendor/opencode/packages/opencode/src/session/message-v2.ts:274-279`
- the only metadata slot available at pending time is `ToolPart.metadata`: `vendor/opencode/packages/opencode/src/session/message-v2.ts:342-347`
- `tool-input-start` currently writes only `part.metadata`, not `state.metadata`: `vendor/opencode/packages/opencode/src/session/processor.ts:259-272`

That means the plan cannot attach Buddy metadata at the first visible lifecycle event by writing `state.metadata`; the schema removes it.

The empirical parse check confirmed this: extra pending-state metadata is stripped.

### 2. `ToolPart.metadata` is not a neutral UI channel

The plan treats “existing tool metadata channel” as if it were UI-only. It is not.

- prior tool calls are converted back into model history with `callProviderMetadata: providerMeta(part.metadata)`: `vendor/opencode/packages/opencode/src/session/message-v2.ts:574-577` and `:742-787`
- only `providerExecuted` is stripped; everything else survives

The empirical transform check confirmed that `metadata.buddy` becomes outbound `providerOptions.buddy` on the assistant tool-call/tool-result messages.

So if Phase 1 stores Buddy UI metadata on `part.metadata` at pending time, that metadata will leak back into provider history unless you also add an explicit filter or move the data elsewhere.

This is a real dead end for the current plan as written.

### 3. Registration-time inference cannot happen in `ToolRegistry.register(...)` with the current wiring

Today the Buddy tool object still has `dynamic`, but the runtime registration object does not.

- Buddy tools have `{ id, description, capability, dynamic, toTool }`: `packages/buddy/src/learning/tools/create-buddy-tool.ts:48-60` and `:94-99`
- `registerBuddyTools(...)` calls `ToolRegistry.register(tool.toTool(directory))`: `packages/buddy/src/learning/tools/register-buddy-tools.ts:12-14`
- the runtime object stored in the adapter registry only exposes `id` plus effect internals; it does not expose `dynamic`
- `ToolRegistry.register(...)` currently just stores `info` in a directory map keyed by `info.id`: `packages/opencode-adapter/src/registry.ts:141-148`

So the plan needs an explicit prerequisite:

- either change what `toTool(...)` returns so inferred Buddy metadata survives registration
- or change `registerBuddyTools(...)` / `ToolRegistry.register(...)` to receive the Buddy tool object alongside the runtime info
- or stop using the adapter registry as the inference seam and resolve from Buddy’s own tool catalog instead

Without one of those changes, `ToolRegistry.register(...)` cannot “infer and preserve metadata automatically from the registered tool object,” because the registered object no longer has the relevant fields.

### 4. Any adapter-side metadata cache must mirror directory scoping and unregister cleanup

The current custom-tool registry is directory-scoped:

- `customTools` is `Map<directory, Map<toolID, CustomToolInfo>>`: `packages/opencode-adapter/src/registry.ts:36-49`
- `unregister(...)` removes entries and drops the directory bucket when empty: `packages/opencode-adapter/src/registry.ts:150-158`

The plan says “runtime helper that resolves preserved metadata by tool ID,” but that is underspecified.

Missed assumptions:

- the lookup must be directory-scoped, not global by tool ID
- unregister must clear the preserved metadata side table too
- directory realpath canonicalization must match the existing `key(directory)` logic

If this is omitted, stale metadata can survive after dynamic-tool unload or leak across directories.

### 5. The runtime-bootstrap story is incomplete for non-server prompt callers

The plan names `packages/buddy/src/opencode-runtime/runtime.ts` as the bootstrap seam. That is true for the server app path, but not for every prompt caller.

- `loadOpenCodeApp()` installs only `ensureSessionServicePatched()` before `Server.Default()`: `packages/buddy/src/opencode-runtime/runtime.ts:26-45`
- `SessionPrompt` is also used directly via the adapter runtime wrapper at `packages/opencode-adapter/src/session-prompt.ts:4-43`
- Buddy’s learner decision engine calls `SessionPrompt.prompt(...)` directly: `packages/buddy/src/learning/learner-model/decisions/engine.ts:179-198`

If Phase 1 introduces a prompt/processor service patch, server bootstrap alone is not a full installation story. Either:

- scope the feature explicitly to interactive chat/server paths
- or ensure the patch is also installed for direct `SessionPrompt` adapter callers

### 6. Phase 2’s proposed Buddy contract is too small for the UI job

Phase 2 proposes:

```ts
metadata: {
  buddy: {
    dynamic: true,
    presentation: "hidden-summary",
  },
}
```

That is not enough to preserve the human-readable label the UI needs.

- dynamic tool metadata currently has `title`: `packages/buddy/src/learning/tools/dynamic-learning-tool-metadata.ts:9-18`
- the dynamic catalog also treats `title` as a first-class field: `packages/buddy/src/learning/tools/dynamic-learning-tool-catalog.ts:13-25` and `:47-59`
- current frontend fallback titles are raw tool IDs when there is no special case: `packages/web/src/components/chat/tools/tool-info.ts:340-345`

If Phase 2 moves the frontend away from raw preserved metadata but does not carry at least a display title/label in `metadata.buddy`, the UI will regress back to `pedagogy_reflection_dynamic`-style labels.

At minimum, the Buddy contract likely needs something like:

```ts
buddy: {
  dynamic: true
  presentation: "hidden-summary"
  title: "Reflection"
}
```

### 7. The plan may overbuild a generic hidden-step presenter

This is not wrong, but it may be unnecessary work in Phase 1.

Once a tool is grouped as abstracted, `HiddenSteps` already has a generic fallback path:

- it can summarize with `entry.info.title` even when no renderer provides `hiddenSteps.summaryLabel`: `packages/web/src/components/chat/tools/hidden-steps/index.tsx:234-240`
- it can preview `entry.state.output` without a custom presenter: `packages/web/src/components/chat/tools/hidden-steps/index.tsx:243-271`
- in expanded state it already falls back to `AssistantPartRenderer`, which then falls back to the generic tool renderer: `packages/web/src/components/chat/tools/hidden-steps/index.tsx:521-544`

So a new “generic hidden-summary fallback presenter” is only required if the intended expanded-state UX is summary-only rows rather than generic tool cards.

If the Phase 1 goal is simply “collapse unknown future dynamic tools into hidden steps immediately,” metadata-driven grouping plus better labels may be enough.

### 8. The plan says the frontend should not rely on naming conventions, but current rendering still does

This is a lower-priority concern, but it is real.

- Buddy custom-tool detection still uses prefix matching in `packages/web/src/components/chat/utils/tool.ts:9-20`

That does not block metadata-driven hidden-step grouping, but it means the broader statement “the frontend does not rely on naming conventions” is not fully true in today’s codebase unless this is also addressed or intentionally scoped to hidden-step detection only.

## Lifecycle Reality Check

These lifecycle overwrite points are real and should be called out explicitly in the implementation plan:

- pending creation overwrites the tool part at `vendor/opencode/packages/opencode/src/session/processor.ts:259-272`
- running transition overwrites `part.metadata` at `vendor/opencode/packages/opencode/src/session/processor.ts:291-303`
- success overwrites `state.metadata` at `vendor/opencode/packages/opencode/src/session/processor.ts:171-195`
- error currently drops state metadata entirely at `vendor/opencode/packages/opencode/src/session/processor.ts:197-214`
- `ctx.metadata(...)` in the prompt path rewrites tool state with `{ ...part.state, ...val }` at `vendor/opencode/packages/opencode/src/session/prompt.ts:603-610`
- task-tool result and error writes have their own parallel overwrite path at `vendor/opencode/packages/opencode/src/session/prompt.ts:666-695`

So the plan is right that every lifecycle write must be accounted for. That part is not theoretical.

## Frontend Reality Check

The frontend is ready for a typed metadata reader, but not for automatic abstraction today.

- merged metadata already exists in `parseToolState(...)`: `packages/web/src/components/chat/tools/parse-tool-state.ts:86-116` and `:124-169`
- grouping is still hard-coded to a manual tool-name set: `packages/web/src/components/chat/utils/constants.ts:17-36`
- `assistantPartStartsFollowup(...)` also keys off the same manual set: `packages/web/src/components/chat/utils/message-utils.ts:43-63`
- current `groupAssistantParts(...)` ignores metadata completely: `packages/web/src/components/chat/utils/message-utils.ts:65-107`

The empirical `groupAssistantParts(...)` check confirmed that even a tool part carrying `metadata.buddy.presentation = "hidden-summary"` still renders as a normal visible part today.

## Test Plan Gaps

The current checklist’s test bullets are good, but one important detail is missing:

- a final `/api/session/:id/message` JSON assertion is not enough to prove “first visible lifecycle event” behavior
- that regression only shows up on the live part-update path

Recommended test shape:

- backend/service test: registration-time inference and directory-scoped lookup
- backend live-lifecycle test: inspect `message.part.updated` / sync-stream part updates and assert the very first pending tool part already carries the preserved signal
- frontend pure test: `groupAssistantParts(...)` collapses metadata-marked tools even when their tool name is unknown
- frontend rendering test: unknown metadata-marked tools get the desired hidden-step UX with no renderer registration

Practical note:

- frontend tests need the `happy-dom` preload. Running the file directly without it fails with `document is not defined`.

## Recommended Plan Changes

Before implementation, I would revise the plan to answer these explicitly:

1. Where does pending-stage Buddy metadata live, given that pending `state.metadata` is not schema-valid?
2. If the answer is `part.metadata`, what filters prevent Buddy UI metadata from leaking into provider history?
3. How does registration-time inference survive `tool.toTool(directory)` dropping `dynamic`?
4. What is the directory-scoped storage and cleanup story for preserved metadata?
5. Is the new patch installed only for server chat, or for every `SessionPrompt` runtime caller?
6. Does the Buddy contract carry display title/label data, not just `dynamic` and `presentation`?
7. Is a generic hidden-step presenter actually required in Phase 1, or is metadata-driven grouping plus existing fallback rendering sufficient?

## Bottom Line

The plan is solving a real problem, and the identified lifecycle seams are real. But the current document is not yet implementation-safe.

The two blocking issues are:

- pending metadata transport is unsafe/underspecified
- registration-time inference is impossible with the current `register(tool.toTool(...))` boundary

Fix those first in the plan, and the rest becomes a normal implementation problem.
