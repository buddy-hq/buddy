# Dynamic Tool Buddy Metadata UI Final Plan

Execution handoff for implementing metadata-driven hidden-step rendering for dynamic tools.

This document is intended to be sufficient for a fresh execution agent with no conversation history.

## Objective

Implement end-to-end support so Buddy tools can carry explicit UI metadata, that metadata is preserved across the full tool lifecycle, and the web chat UI uses it to hide/summarize tools inside hidden steps.

Primary user-visible outcome:

- dynamic tools render inside the hidden-steps dropdown from the first visible lifecycle event
- no tool-name convention is required
- no manual tool-ID map is required
- static tools can opt into the same hidden-summary UI behavior later

## Scope

In scope:

- Buddy tool authoring API updates
- adapter/runtime metadata preservation across pending/running/result/error
- provider-history filtering so pending-stage UI metadata does not leak back to the model
- frontend parsing and rendering updates for metadata-driven hidden-step behavior
- focused tests and required repo checks

Out of scope:

- redesigning dynamic search/load behavior
- editing vendored files under `vendor/opencode/**` directly unless absolutely unavoidable
- inventing a new transport outside existing tool metadata

## Non-Negotiable Constraints

These are real code constraints and must be respected:

1. Pending tool state does not support `state.metadata`.
2. Pending-stage UI metadata must therefore attach on `part.metadata`.
3. `part.metadata` is currently replayed into provider history unless filtered.
4. `tool.toTool(...)` drops Buddy authoring-only fields unless they are carried explicitly across the registration boundary.
5. The current frontend does not abstract tools based on metadata; it still keys abstraction off a manual tool-name set.
6. Prompt execution happens both through the server app path and through direct `SessionPrompt` adapter callers.

## Final Design Decisions

- `dynamic` remains backend/search/runtime metadata only.
- `ui` is the explicit frontend/presentation authoring field.
- transport key is `metadata.buddy.toolUi`.
- dynamic tools default to hidden-summary UI behavior even when `ui` is omitted.
- `ui` is used only to refine or override the default UI behavior.
- frontend depends only on parsed `toolUi` metadata, not on `dynamic` or backend semantic enums.
- provider-facing replay must strip `metadata.buddy.toolUi`.
- registry-side metadata must be directory-scoped and unregister-safe.

## Final API Shape

### Shared UI Types

These types may live in one shared Buddy-owned module or be duplicated carefully if a shared module is not introduced in this change.

```ts
export const TOOL_PRESENTATIONS = ["hidden-summary", "default"] as const

export type ToolPresentation = (typeof TOOL_PRESENTATIONS)[number]

export type ToolUiLabels = {
  idle?: string
  running?: string
}

export type ToolUiMetadata = {
  presentation?: ToolPresentation
  labels?: ToolUiLabels
}
```

### Backend Authoring API

```ts
type BuddyToolDefinition<
  Id extends string,
  Parameters extends z.ZodType,
  Metadata extends Record<string, unknown>,
> = {
  id: Id
  description: string
  parameters: Parameters
  execute(
    args: z.infer<Parameters>,
    ctx: BuddyToolContext<Metadata>,
  ): Promise<Tool.ExecuteResult<Metadata>> | Tool.ExecuteResult<Metadata>
  formatValidationError?(error: z.ZodError): string
  capability?: BuddyToolCapabilityConstraints
  dynamic?: DynamicBuddyToolMetadata
  ui?: ToolUiMetadata
}

type BuddyTool<
  Id extends string = string,
  Parameters extends z.ZodType = z.ZodType,
  Metadata extends Record<string, unknown> = Record<string, unknown>,
> = {
  id: Id
  description: string
  capability?: BuddyToolCapabilityConstraints
  dynamic?: DynamicBuddyToolMetadata
  ui?: ToolUiMetadata
  toTool(directory: string): Effect.Effect<Tool.Info<Parameters, Metadata>> & { id: Id }
}
```

### Backend Normalization Rule

```ts
function normalizeToolUiMetadata(
  definition: BuddyToolDefinition<string, z.ZodType, Record<string, unknown>>,
): ToolUiMetadata | undefined {
  const presentation = definition.ui?.presentation ?? (definition.dynamic ? "hidden-summary" : undefined)
  const labels = definition.ui?.labels ??
    (definition.dynamic?.title
      ? {
          idle: definition.dynamic.title,
        }
      : undefined)

  if (!presentation && !labels?.idle && !labels?.running) return undefined
  return { presentation, labels }
}
```

Meaning:

- dynamic tools get default hidden-summary UI behavior even when `ui` is omitted
- static tools can opt in explicitly through `ui`
- `ui` refines or overrides presentation without changing backend/search semantics

### Runtime Transport Shape

```ts
// Pending parts must use part.metadata, not state.metadata
metadata: {
  buddy?: {
    toolUi?: ToolUiMetadata
  }
}
```

Important:

- pending: attach on `part.metadata.buddy.toolUi`
- running/completed/error: preserve via the lifecycle rewrite path so the frontend continues to see merged metadata through `parseToolState(...)`

### Frontend Parser Contract

```ts
export type ParsedToolUiMetadata = ToolUiMetadata

export function parseToolUiMetadata(metadata: Record<string, unknown>): ParsedToolUiMetadata | undefined
```

### Frontend Usage Pattern

```ts
const state = parseToolState(part)
const toolUi = parseToolUiMetadata(state.metadata)

if (toolUi?.presentation === "hidden-summary") {
  // Group into HiddenSteps and use summary fallback when needed
}

const title =
  state.status === "pending" || state.status === "running"
    ? (toolUi?.labels?.running ?? toolUi?.labels?.idle ?? titleFromToolName(tool))
    : (toolUi?.labels?.idle ?? titleFromToolName(tool))
```

## Exact Files To Change

### Backend / Adapter / Runtime

1. `packages/buddy/src/learning/tools/create-buddy-tool.ts`
2. `packages/buddy/src/learning/tools/register-buddy-tools.ts`
3. `packages/opencode-adapter/src/registry.ts`
4. New Buddy-owned adapter lifecycle patch module
5. `packages/buddy/src/opencode-runtime/runtime.ts`
6. `packages/opencode-adapter/src/session-prompt.ts`

### Frontend

1. `packages/web/src/components/chat/tools/parse-tool-state.ts`
2. `packages/web/src/components/chat/tools/tool-info.ts`
3. `packages/web/src/components/chat/utils/message-utils.ts`
4. `packages/web/src/components/chat/tools/hidden-steps/index.tsx`
5. `packages/web/src/components/chat/tools/hidden-steps-presenters.ts`
6. `packages/web/src/components/chat/tools/tools.tsx`
7. New helper module for `parseToolUiMetadata(...)` if appropriate

## Ordered Execution Steps

Execute in this order. Do not skip ahead.

### Step 1: Update Tool Authoring Types

In `create-buddy-tool.ts`:

- add `ui?: ToolUiMetadata` to `BuddyToolDefinition`
- add `ui?: ToolUiMetadata` to the returned `BuddyTool`
- clone/preserve `ui` similarly to how `dynamic` is preserved today
- add `normalizeToolUiMetadata(...)`

Required outcome:

- every Buddy tool object can expose normalized `toolUi` metadata from authoring-time data

### Step 2: Carry `toolUi` Across Registration Boundary

In `register-buddy-tools.ts` and adapter `registry.ts`:

- stop registering runtime `Tool.Info` alone
- pass explicit normalized `toolUi` alongside the runtime tool info
- store preserved `toolUi` in an adapter-owned directory-scoped side table keyed with the same canonical directory logic as the current custom-tool registry
- clear that side-table entry on unregister

Do not:

- try to infer `toolUi` from `Tool.Info` inside `ToolRegistry.register(...)`
- use a global map that ignores directory scoping

Required outcome:

- adapter can resolve preserved `toolUi` by `directory + toolID`
- unregister removes both tool info and UI metadata

### Step 3: Patch Lifecycle Writes

Add a Buddy-owned adapter patch module.

Preferred seam:

- patch `SessionProcessor.create()` because pending/running/completed/error writes are centralized there

If needed, pair with a `SessionPrompt` patch for provider-history stripping.

Required lifecycle behavior:

- pending creation: attach `metadata.buddy.toolUi` on `part.metadata`
- running transition: preserve prior `buddy.toolUi`
- success rewrite: preserve prior `buddy.toolUi`
- error rewrite: preserve prior `buddy.toolUi`
- task/subtask parallel tool path: preserve `buddy.toolUi` there too if it bypasses the main processor helper path

Do not:

- attach pending UI metadata on `state.metadata`
- assume `createBuddyTool` success-path changes are enough for errors

Required outcome:

- every lifecycle stage keeps `buddy.toolUi`

### Step 4: Strip UI Metadata From Provider Replay

Because pending metadata lives on `part.metadata`, it will otherwise leak into model-facing history.

Add an explicit strip/filter seam so `metadata.buddy.toolUi` is removed before prior messages are converted into provider-facing tool call metadata.

Feasible seams to evaluate:

- Buddy-owned `SessionPrompt` patch before `MessageV2.toModelMessagesEffect(...)`
- Buddy-owned transform hook before model replay

Required outcome:

- provider history does not contain `providerOptions.buddy.toolUi`
- runtime/frontend still retain `buddy.toolUi`

### Step 5: Ensure Patch Installation Everywhere

Install the patch in:

- server bootstrap path via `packages/buddy/src/opencode-runtime/runtime.ts`
- direct `SessionPrompt.prompt(...)` adapter callers via `packages/opencode-adapter/src/session-prompt.ts`

Required outcome:

- interactive chat and direct prompt callers both get the same metadata behavior

### Step 6: Add Frontend Parser

Add `parseToolUiMetadata(...)` that:

- reads `metadata.buddy.toolUi`
- validates/narrows shape
- returns `ToolUiMetadata | undefined`

Do not spread raw nested metadata access through rendering code.

Required outcome:

- rendering code consumes only parsed UI metadata

### Step 7: Update Frontend Labeling

Update `tool-info.ts` so tool titles can come from `toolUi.labels` using current lifecycle state.

Required outcome:

- `running` label is used while pending/running
- `idle` label is used otherwise
- unknown tools no longer have to fall back to raw internal IDs if `toolUi` provides labels

### Step 8: Update Frontend Grouping

Update `message-utils.ts` so tools with `toolUi.presentation === "hidden-summary"` are abstracted even if the tool name is unknown.

Required outcome:

- metadata-marked tools become `abstracted` items
- they do not start follow-up visible sections

### Step 9: Add Hidden-Steps Fallback

Update `hidden-steps/index.tsx` so metadata-marked tools can render as hidden-step entries even when no renderer provides a `hiddenSteps` presenter.

Required outcome:

- unknown hidden-summary tools render safely inside hidden steps without dedicated renderer registration

### Step 10: Keep Explicit Search/Load Presentation

Update hidden-step presenters and tool registrations so:

- `learning_tool_search`
- `learning_tool_load`

have explicit hidden-step presenters.

Required outcome:

- search/load tools render with polished summaries rather than generic fallback labels

## Verification Requirements

### Backend Tests

Add focused tests that prove:

- normalization derives default UI metadata from `dynamic`
- registration preserves `toolUi` across the registration boundary
- lookup is directory-scoped
- unregister clears side-channel metadata
- first pending tool part carries `part.metadata.buddy.toolUi`
- running parts keep `buddy.toolUi`
- completed parts keep `buddy.toolUi`
- error parts keep `buddy.toolUi`
- provider-history replay strips `buddy.toolUi`

### Frontend Tests

Add focused tests that prove:

- `parseToolUiMetadata(...)` handles valid and invalid shapes
- metadata-marked tools become abstracted in `groupAssistantParts(...)`
- metadata-marked tools do not start follow-up sections
- unknown metadata-marked tools get the fallback hidden-step UX without renderer registration
- lifecycle-aware labels select `running` vs `idle` correctly

### Required Commands

Run focused tests only for changed areas, then run required repo checks.

Focused examples:

Run from `packages/buddy`:

```sh
bun test --preload ./test/preload.ts test/session/dynamic-tool-session-live-patch.test.ts
```

Run from `packages/web`:

```sh
bun test --preload ./happydom.ts test/hidden-steps-layout.test.tsx
```

Then run:

```sh
bun fmt
bun lint
bun typecheck
```

## Traps

- Do not attach pending UI metadata on `state.metadata`; the schema drops it.
- Do not store UI metadata only in `part.metadata` without stripping it before provider replay.
- Do not rely on `ToolRegistry.register(tool.toTool(...))` being able to infer authoring metadata.
- Do not forget direct `SessionPrompt.prompt(...)` callers.
- Do not assume metadata-based abstraction already exists in the current frontend.
- Do not regress existing known abstractable tools while adding metadata-based grouping.

## Completion Checklist

- backend authoring API updated
- registration boundary updated
- directory-scoped side channel added and cleaned up on unregister
- lifecycle patch implemented
- provider-history filtering implemented
- frontend parser implemented
- frontend grouping updated
- frontend fallback rendering updated
- explicit search/load presenters added
- focused tests added and passing
- `bun fmt` passing
- `bun lint` passing
- `bun typecheck` passing

## Final Acceptance Criteria

- dynamic tools are hidden-summary by default from the first visible lifecycle event
- static tools can opt into the same UI behavior with `ui`
- frontend does not inspect `dynamic` or backend semantic enums
- no tool-name conventions are required
- no manual tool-ID map is required
- pending attachment uses `part.metadata` correctly for the SDK/runtime shape
- `metadata.buddy.toolUi` does not leak back into provider history
- registration preserves `toolUi` across the `tool.toTool(...)` boundary explicitly
- `metadata.buddy.toolUi` survives pending, running, live emit, result, and error
- labels can differ by lifecycle state using `labels.idle` and `labels.running`
