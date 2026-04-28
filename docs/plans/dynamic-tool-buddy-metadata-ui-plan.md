# Dynamic Tool Buddy Metadata UI Plan

Implementation-ready two-phase plan for making dynamically loaded tools render as hidden summarized steps from the first visible lifecycle event, without relying on tool-name conventions or hand-maintained tool-ID maps.

This plan deliberately separates:

- Phase 1: full lifecycle metadata preservation
- Phase 2: optional Buddy-owned metadata contract layer

The intended sequencing is to execute Phase 1 first, evaluate how clean the result feels in real code, then decide whether Phase 2 is needed.

## Target End State

### Phase 1 End State

- Metadata attached to a tool is preserved across all visible lifecycle stages.
- A dynamic tool can be recognized from the first visible lifecycle event.
- The frontend does not rely on naming conventions.
- The frontend does not rely on a manual tool-ID map.
- Unknown future dynamic tools can be summarized without per-tool frontend registration.

### Phase 2 End State

Buddy-specific semantics move under a stable, namespaced contract inside the existing metadata channel:

```ts
metadata: {
  buddy: {
    dynamic: true,
    presentation: "hidden-summary",
  },
}
```

The frontend then depends on `metadata.buddy` for Buddy-owned behavior rather than looser preserved raw metadata.

## Why Two Phases

### Phase 1 solves transport

Phase 1 answers:

- can metadata survive pending, running, emit, result, and error writes
- can the UI see inferred metadata from the first visible step
- can future backend features send metadata without it being lost

Developer-experience view:

- strong infrastructure improvement
- useful beyond dynamic tools
- minimal product-contract design up front
- good first move if you want to learn from real usage before standardizing semantics

### Phase 2 solves contract clarity

Phase 2 answers:

- which metadata is intentionally Buddy-owned
- which fields frontend/runtime code should rely on long term
- where future Buddy-specific presentation/runtime hints should live

Developer-experience view:

- clearer ownership
- clearer frontend typing
- less risk of product code depending on accidental provider/runtime fields
- more explicit design work up front

## Non-Goals

- Do not introduce a hand-maintained map of dynamic tool IDs.
- Do not require a naming convention such as `_dynamic`.
- Do not add a second transport system outside the existing tool metadata channel.
- Do not use missing frontend renderers as the signal that a tool should be hidden.
- Do not patch files under `vendor/opencode/**` directly if the same behavior can be achieved through Buddy-owned adapter seams.

## Core Design Principles

### Source Of Truth

`createBuddyTool.dynamic` remains the source of truth for dynamic classification.

### Inference, Not Manual Mapping

Any metadata used to drive the UI should be inferred automatically from the tool definition and preserved by the runtime. No human-authored per-tool ID map should exist.

### Lifecycle Preservation

Tool metadata is rewritten during multiple lifecycle stages. The system must preserve metadata through each stage:

- `tool-input-start` / pending creation
- `tool-call` / running transition
- live `ctx.metadata(...)` emits
- final result
- final error

If any one of those writes drops metadata, the UI can lose the signal.

## Seams

### 1. Tool Authoring Seam

File:

- `packages/buddy/src/learning/tools/create-buddy-tool.ts`

This seam knows whether a tool is dynamic.

### 2. Adapter Registration Seam

File:

- `packages/opencode-adapter/src/registry.ts`

This seam is the right place to preserve inferred metadata from registered Buddy tools in a runtime-accessible way.

### 3. First-Frame Lifecycle Seam

Runtime path:

- pending part creation at `tool-input-start`

This is the first UI-visible event. If metadata is not attached here, the user cannot see the correct summarized behavior immediately.

### 4. Running Transition Seam

Runtime path:

- running transition at `tool-call`

This write must preserve previously attached metadata.

### 5. Live Emit Seam

Runtime path:

- `ctx.metadata(...)`

This write must preserve previously attached metadata.

### 6. Result / Error Seam

Runtime path:

- result completion
- error completion

These writes must preserve previously attached metadata.

### 7. Runtime Bootstrap Seam

File:

- `packages/buddy/src/opencode-runtime/runtime.ts`

Any new adapter patch for the prompt/processor lifecycle must be installed here.

## Phase 1: Full Lifecycle Metadata Preservation

### Goal

Make metadata preservation a runtime guarantee first.

### Exact End State

- A tool with inferred hidden-summary metadata is recognized from pending creation time.
- That metadata survives pending, running, live emit, result, and error.
- The frontend can key off preserved metadata using a typed helper.
- `learning_tool_search` and `learning_tool_load` still get explicit hidden-step presenters.

### Exact File Changes

#### `packages/buddy/src/learning/tools/create-buddy-tool.ts`

Add:

- helper to derive inferred metadata from the authoring definition
- helper to merge preserved metadata into emitted/result metadata

Change:

- `toTool()` should preserve inferred metadata for runtime use
- `ctx.metadata(...)` wrapper should merge preserved metadata forward
- final execute result should merge preserved metadata forward

Do not:

- require callsites to manually duplicate config
- mutate returned result objects in place if avoidable

#### `packages/opencode-adapter/src/registry.ts`

Add:

- registration record that preserves inferred metadata alongside custom tools
- runtime helper that resolves preserved metadata by tool ID

Change:

- `ToolRegistry.register(...)` should infer and preserve metadata automatically from the registered tool object
- runtime must be able to look that metadata up later by tool ID

Do not:

- introduce a human-maintained map of tool IDs
- key any behavior from name patterns

#### New adapter patch module

Add a Buddy-owned adapter patch around the prompt/processor lifecycle.

Suggested naming:

- `packages/opencode-adapter/src/session-tool-metadata-live.ts`

Responsibilities:

- intercept pending tool-part creation
- attach preserved metadata immediately
- preserve metadata on running transition
- preserve metadata on later lifecycle rewrites if the runtime overwrites metadata fields

#### `packages/buddy/src/opencode-runtime/runtime.ts`

Change:

- install the new lifecycle metadata patch during runtime bootstrap

#### `packages/web/src/components/chat/tools/parse-tool-state.ts`

Keep:

- current merged metadata behavior

Add:

- support for a typed helper that reads preserved hidden-summary metadata

#### `packages/web/src/components/chat/tools/tool-info.ts`

Add:

- readable labels and summaries derived from preserved metadata where available

#### `packages/web/src/components/chat/utils/message-utils.ts`

Add:

- helper that checks preserved hidden-summary presentation metadata

Change:

- `groupAssistantParts()` should treat those tools as abstractable
- `assistantPartStartsFollowup()` should also treat them as abstracted steps

#### `packages/web/src/components/chat/tools/hidden-steps/index.tsx`

Add:

- generic fallback hidden-step presentation for tools marked with preserved hidden-summary metadata, even when the frontend has no dedicated renderer for the tool

#### `packages/web/src/components/chat/tools/hidden-steps-presenters.ts`

Add:

- `createToolSearchHiddenStepPresentation`
- `createToolLoadHiddenStepPresentation`
- generic hidden-summary fallback presenter if needed

#### `packages/web/src/components/chat/tools/tools.tsx`

Register:

- `learning_tool_search`
- `learning_tool_load`

with explicit hidden-step presenters.

#### `packages/web/src/components/chat/utils/constants.ts`

Keep:

- `learning_tool_search`
- `learning_tool_load`

explicitly abstractable.

Reason:

- they are hidden workflow steps
- they are not themselves dynamic tools

### Ordered Checklist

- [ ] Add an inferred metadata helper in `createBuddyTool`.
- [ ] Keep `createBuddyTool` public API unchanged in Phase 1.
- [ ] Make `dynamic` imply inferred hidden-summary metadata.
- [ ] Update adapter registry registration so inferred metadata is preserved automatically.
- [ ] Expose runtime lookup of preserved metadata by tool ID.
- [ ] Add a Buddy-owned prompt/processor lifecycle patch.
- [ ] Attach preserved metadata at pending creation time.
- [ ] Preserve metadata on running transition.
- [ ] Preserve metadata through live `ctx.metadata(...)` emits.
- [ ] Preserve metadata through result and error writes.
- [ ] Install the patch from runtime bootstrap.
- [ ] Add a frontend helper to read preserved hidden-summary metadata.
- [ ] Update `message-utils.ts` to key abstractability from preserved metadata.
- [ ] Add generic fallback hidden-step presentation for future hidden-summary tools.
- [ ] Add explicit presenters for `learning_tool_search` and `learning_tool_load`.
- [ ] Improve `tool-info.ts` using preserved metadata where available.
- [ ] Add backend tests for registration-time metadata preservation.
- [ ] Add lifecycle tests proving pending tool parts already include preserved metadata.
- [ ] Add frontend tests proving preserved hidden-summary tools are grouped correctly.
- [ ] Run `bun fmt`.
- [ ] Run `bun lint`.
- [ ] Run `bun typecheck`.

### Developer-Experience Notes

Pros:

- broad infrastructure improvement
- useful even if you later decide not to add a Buddy contract layer
- keeps the first step inference-first and low-ceremony

Cons:

- frontend semantics are still looser unless you later standardize them
- product logic can drift toward ad hoc metadata usage if not disciplined

### Phase 1 Required Tests

Backend / adapter:

- a Buddy tool with `dynamic` metadata produces inferred hidden-summary metadata automatically
- adapter registry preserves inferred metadata without any manual ID list
- pending tool parts already include preserved hidden-summary metadata
- running/live/result/error transitions preserve metadata

Frontend:

- tools with preserved hidden-summary metadata are grouped into hidden steps
- hidden-summary tools do not start follow-up visible sections
- unknown future hidden-summary tools render with the generic summary-only fallback
- `learning_tool_search` and `learning_tool_load` render with explicit summary presenters

### Phase 1 End-to-End Example

Author defines a new dynamic Buddy tool:

```ts
export const pedagogyReflectionTool = createBuddyTool({
  id: "pedagogy_reflection_v2",
  description: "Guides structured learner reflection.",
  dynamic: {
    title: "Reflection",
    useCase: "reflection",
    keywords: ["reflection", "metacognition"],
  },
  parameters: ...,
  async execute(args, ctx) {
    return {
      title: "Reflection",
      output: "...",
      metadata: {},
    }
  },
})
```

The author does not add:

- a naming convention
- a frontend tool-ID entry
- a manual backend map

At runtime:

- `createBuddyTool` infers hidden-summary metadata from `dynamic`
- adapter registry preserves that metadata for the tool ID
- pending part creation attaches it immediately
- running/live/result/error all preserve it

User-visible result:

```text
Steps
  Search Learning Tools: reflection metacognition
  Load Learning Tools: pedagogy_reflection_v2
  Reflection
```

The user does not see a raw generic card flash first and then collapse later.

## Phase 2: Optional Buddy Contract Layer

### Goal

If Phase 1 feels too loose, define a stable Buddy-owned metadata contract.

### Exact End State

Buddy-specific semantics live under:

```ts
metadata.buddy
```

Recommended initial shape:

```ts
type BuddyToolMetadataEnvelope = {
  dynamic?: boolean
  presentation?: "hidden-summary" | "default"
}
```

`dynamic` still remains the source of truth. The Buddy envelope is derived centrally, not authored manually per tool ID.

### Exact File Changes

#### `packages/buddy/src/learning/tools/create-buddy-tool.ts`

Optionally add:

- normalized Buddy envelope derivation helper
- optional future `buddy` authoring field only if a real second use case appears

Recommended first contract rule:

```ts
if (definition.dynamic) {
  metadata.buddy.dynamic = true
  metadata.buddy.presentation = "hidden-summary"
}
```

#### `packages/opencode-adapter/src/registry.ts`

Change:

- preserve Buddy-owned metadata as a dedicated stable layer instead of only looser preserved raw metadata

#### Adapter lifecycle patch

Change:

- standardize lifecycle attachment/preservation around `metadata.buddy`

#### Frontend parsing / rendering

Add:

- `readBuddyToolMetadata(...)`

Change:

- frontend rendering decisions should depend on `metadata.buddy.presentation`

### Ordered Checklist

- [ ] Decide whether Phase 2 is needed based on Phase 1 experience.
- [ ] Add a Buddy envelope type under a namespaced metadata object.
- [ ] Decide whether to keep the public API unchanged or add an optional public `buddy` authoring field.
- [ ] Add a normalized Buddy metadata derivation helper.
- [ ] Make `dynamic` imply `buddy.dynamic = true` and `buddy.presentation = "hidden-summary"`.
- [ ] Standardize lifecycle attachment/preservation around `metadata.buddy`.
- [ ] Add `readBuddyToolMetadata(...)` helper.
- [ ] Move frontend rendering checks to `metadata.buddy.presentation`.
- [ ] Add backend and frontend tests for the Buddy contract.
- [ ] Run `bun fmt`.
- [ ] Run `bun lint`.
- [ ] Run `bun typecheck`.

### Developer-Experience Notes

Pros:

- clearer ownership
- cleaner frontend code
- safer long-term semantics
- easier future Buddy-specific extensibility

Cons:

- more explicit design work
- slightly more ceremony than pure preservation

### Phase 2 Required Tests

- `metadata.buddy` is present and typed for Buddy-managed tools
- frontend rendering depends on `metadata.buddy.presentation`
- future Buddy-specific metadata can be added without colliding with provider/runtime metadata

### Phase 2 End-to-End Example

After Phase 2, the same runtime flow becomes explicitly Buddy-owned:

```ts
metadata: {
  buddy: {
    dynamic: true,
    presentation: "hidden-summary",
  },
}
```

The frontend then depends on `metadata.buddy.presentation` instead of looser preserved fields.

### Phase 2 Developer-Experience Example

Authoring a new dynamic tool after Phase 2 should feel like this:

```ts
export const pedagogyReflectionTool = createBuddyTool({
  id: "pedagogy_reflection_v2",
  description: "Guides structured learner reflection.",
  dynamic: {
    title: "Reflection",
    useCase: "reflection",
    keywords: ["reflection", "metacognition"],
  },
  parameters: ...,
  async execute(args, ctx) {
    return {
      title: "Reflection",
      output: "...",
      metadata: {},
    }
  },
})
```

What the developer gets automatically:

- `dynamic` still drives search/load behavior
- Buddy contract metadata is derived automatically
- no manual tool-ID registration map is needed
- no naming convention is needed
- frontend hidden-summary behavior works because it depends on `metadata.buddy.presentation`

What frontend code feels like after Phase 2:

```ts
const buddy = readBuddyToolMetadata(state.metadata)

if (buddy?.presentation === "hidden-summary") {
  // Treat as abstracted hidden step
}
```

Why this is nicer than Phase 1 from a DX perspective:

- frontend code reads one clear Buddy-owned contract
- product behavior is not coupled to ad hoc raw metadata shapes
- future Buddy-specific UI/runtime flags have an obvious home
- reviewers can immediately tell which metadata is intentional product API

## Acceptance Criteria

### Phase 1 Acceptance Criteria

- A newly authored dynamic Buddy tool needs no tool-name convention to render correctly.
- A newly authored dynamic Buddy tool needs no manual frontend ID registration to render as a summarized hidden step.
- The tool is visibly recognized as a hidden-summary step from pending creation time.
- The hidden-summary signal survives pending, running, live metadata, result, and error stages.
- `learning_tool_search` and `learning_tool_load` are summarized with explicit presenters.
- The frontend reads preserved metadata through a typed helper rather than scattered `unknown` access.
- No human-authored per-tool dynamic map exists.
- `bun fmt`, `bun lint`, and `bun typecheck` pass.

### Phase 2 Acceptance Criteria

- Buddy-owned semantics are standardized under `metadata.buddy`.
- Frontend rendering checks depend on `metadata.buddy.presentation`.
- Future Buddy-specific metadata has a clear, typed, namespaced home.
- Phase 1 transport-preservation guarantees remain intact.

## Decision Guidance

Recommended order:

1. execute Phase 1 first
2. evaluate real frontend/runtime pressure
3. adopt Phase 2 only if the extra explicitness is justified

Recommended Phase 1 implementation stance:

- keep `createBuddyTool` public API unchanged
- infer hidden-summary metadata from `dynamic`
- avoid adding a public `buddy` field until a real second use case appears

That keeps the first version minimal while preserving the long-term architecture.

## Iteration 1

Proposed API direction for the first implementation pass.

### API Goals

- backend authors mark only one thing: `dynamic`
- no separate metadata authoring step is required for correctness
- runtime derives hidden-summary behavior automatically
- frontend reads one typed parser/helper rather than inspecting tool names or raw metadata blobs

### Iteration 1 Type Shape

Backend authoring types:

```ts
type DynamicBuddyToolMetadata = {
  title: string
  useCase: "reflection" | "debugging" | "stepwise-solve"
  keywords: readonly string[]
  searchText?: string
  description?: string
  sideEffects?: readonly ("none" | "learner-state-read")[]
  mutatesLearnerState?: boolean
  renderer?: "generic"
}

type BuddyToolDefinition<Id extends string, Parameters extends z.ZodType, Metadata extends Record<string, unknown>> = {
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
}
```

Runtime-normalized metadata type for Iteration 1:

```ts
type BuddyPresentation = "hidden-summary" | "default"

type BuddyMetadata = {
  dynamic?: boolean
  presentation?: BuddyPresentation
  title?: string
}
```

Frontend parsed type for Iteration 1:

```ts
type ParsedBuddyMetadata = {
  dynamic: boolean
  presentation: BuddyPresentation | undefined
  title: string | undefined
}
```

### Where Presentation Comes From

Iteration 1 keeps backend authoring unchanged.

The backend does **not** ask authors to write `presentation` manually.
Instead, normalization derives it from the existing source of truth:

```ts
function normalizeBuddyMetadata(definition: BuddyToolDefinition<string, z.ZodType, Record<string, unknown>>): BuddyMetadata | undefined {
  if (!definition.dynamic) return undefined

  return {
    dynamic: true,
    presentation: "hidden-summary",
    title: definition.dynamic.title,
  }
}
```

So the answer to "how did presentation get normalized?" is:

- it is inferred centrally by runtime code from `definition.dynamic`
- it is not authored manually per tool
- this is what gives the guarantee and avoids forgetting

### Backend End-State Snippet

What backend defines:

```ts
export const pedagogyReflectionTool = createBuddyTool({
  id: "pedagogy_reflection_v2",
  description: "Guides structured learner reflection.",
  dynamic: {
    title: "Reflection",
    useCase: "reflection",
    keywords: ["reflection", "metacognition"],
    description: "Use when the learner should reflect on their reasoning.",
  },
  parameters: ReflectionParameters,
  async execute(args, ctx) {
    return {
      title: "Reflection",
      output: "Prompted learner reflection over the latest attempt.",
      metadata: {
        learnerTurnCount: 3,
      },
    }
  },
})
```

What the runtime guarantees from that single authoring input:

```ts
type BuddyMetadata = {
  dynamic?: boolean
  presentation?: "hidden-summary" | "default"
  title?: string
}

const normalized: BuddyMetadata = {
  dynamic: true,
  presentation: "hidden-summary",
  title: "Reflection",
}
```

Author does not provide:

- a tool-name convention
- a frontend registration entry for the tool ID
- a manual metadata map
- a separate `isDynamic` flag

### Frontend End-State Snippet

What frontend needs to do:

```ts
type BuddyPresentation = "hidden-summary" | "default"

type ParsedBuddyMetadata = {
  dynamic: boolean
  presentation: BuddyPresentation | undefined
  title: string | undefined
}

function parseBuddyMetadata(metadata: Record<string, unknown>): ParsedBuddyMetadata {
  const value = metadata.preservedTool
  if (!value || typeof value !== "object") {
    return {
      dynamic: false,
      presentation: undefined,
      title: undefined,
    }
  }

  const record = value as Record<string, unknown>
  return {
    dynamic: record.dynamic === true,
    presentation:
      record.presentation === "hidden-summary" || record.presentation === "default"
        ? record.presentation
        : undefined,
    title: typeof record.title === "string" ? record.title : undefined,
  }
}

function isHiddenSummaryTool(metadata: Record<string, unknown>): boolean {
  return parseBuddyMetadata(metadata).presentation === "hidden-summary"
}

function titleForTool(tool: string, metadata: Record<string, unknown>): string {
  const buddy = parseBuddyMetadata(metadata)
  if (buddy.title) return buddy.title
  return titleFromToolName(tool)
}
```

What this means in rendering code:

```ts
const state = parseToolState(part)
const buddy = parseBuddyMetadata(state.metadata)

if (buddy.presentation === "hidden-summary") {
  // Group inside HiddenSteps and use summary-only fallback if no custom renderer exists
}

const title = buddy.title ?? titleFromToolName(tool)
```

### Notes For Iteration 1

- The `preservedTool` object name is only a proposal for iteration.
- In this iteration, the frontend reads preserved runtime metadata directly.
- If Phase 2 is adopted later, this can move under `metadata.buddy` without changing the overall flow.
- The important part of the API is not the exact object name yet. It is the shape of the responsibility:
- backend declares only `dynamic`
- runtime derives presentation metadata automatically
- frontend reads one typed parsed object

### Why Define A Type On The Frontend

Yes, this is normal.

Reason:

- transport arrives as `Record<string, unknown>`
- frontend should not spread `unknown` checks everywhere
- a parser narrows the unknown transport into a typed UI object once

So the frontend type is not duplicating the backend schema for fun.
It is the normal narrowing step from untyped transport data into typed UI state.

The right pattern is:

- transport stays flexible
- parser owns validation/narrowing
- rendering code consumes the typed parser result

## Iteration 2

This iteration supersedes Iteration 1 for API direction.

### Changes From Iteration 1

- frontend does not read or care about `dynamic`
- frontend does not know about backend `useCase`
- backend gains an explicit `ui` field for presentation concerns
- `dynamic` remains backend-only semantic/runtime wiring
- static tools can also opt into the same UI metadata later

### API Goals

- keep `dynamic` as backend-only behavior wiring
- make presentation a separate backend-owned concern
- let static and dynamic tools both use the same UI metadata channel
- keep frontend dependent only on typed presentation metadata

### Backend Type Shape

```ts
type ToolPresentation = "hidden-summary" | "default"

type BuddyToolUi = {
  presentation?: ToolPresentation
  title?: string
}

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
  ui?: BuddyToolUi
}
```

### Backend End-State Snippet

```ts
export const pedagogyReflectionTool = createBuddyTool({
  id: "pedagogy_reflection_v2",
  description: "Guides structured learner reflection.",
  dynamic: {
    title: "Reflection",
    useCase: "reflection",
    keywords: ["reflection", "metacognition"],
    description: "Use when the learner should reflect on their reasoning.",
  },
  parameters: ReflectionParameters,
  async execute(args, ctx) {
    return {
      title: "Reflection",
      output: "Prompted learner reflection over the latest attempt.",
      metadata: {
        learnerTurnCount: 3,
      },
    }
  },
})
```

Optional static-tool example later:

```ts
export const learnerSnapshotReadTool = createBuddyTool({
  id: "learner_snapshot_read",
  description: "Reads the learner snapshot.",
  ui: {
    presentation: "hidden-summary",
    title: "Learner Snapshot",
  },
  parameters: LearnerSnapshotParameters,
  async execute(args, ctx) {
    return {
      title: "Learner Snapshot",
      output: "Loaded learner snapshot.",
      metadata: {},
    }
  },
})
```

### Backend Normalization

```ts
type NormalizedBuddyUiMetadata = {
  presentation?: ToolPresentation
  title?: string
}

function normalizeBuddyUiMetadata(
  definition: BuddyToolDefinition<string, z.ZodType, Record<string, unknown>>,
): NormalizedBuddyUiMetadata | undefined {
  const presentation = definition.ui?.presentation ?? (definition.dynamic ? "hidden-summary" : undefined)
  const title = definition.ui?.title ?? definition.dynamic?.title

  if (!presentation && !title) return undefined
  return { presentation, title }
}
```

Meaning:

- dynamic tools get `presentation: "hidden-summary"` by default
- static tools can opt in with `ui.presentation`
- authors still do not manually author transport metadata

### Frontend Type Shape

```ts
type BuddyPresentation = "hidden-summary" | "default"

type ParsedBuddyMetadata = {
  presentation: BuddyPresentation | undefined
  title: string | undefined
}
```

### Frontend End-State Snippet

```ts
function parseBuddyMetadata(metadata: Record<string, unknown>): ParsedBuddyMetadata {
  const value = metadata.preservedTool
  if (!value || typeof value !== "object") {
    return {
      presentation: undefined,
      title: undefined,
    }
  }

  const record = value as Record<string, unknown>
  return {
    presentation:
      record.presentation === "hidden-summary" || record.presentation === "default"
        ? record.presentation
        : undefined,
    title: typeof record.title === "string" ? record.title : undefined,
  }
}

function shouldAbstractTool(metadata: Record<string, unknown>): boolean {
  return parseBuddyMetadata(metadata).presentation === "hidden-summary"
}

function titleForTool(tool: string, metadata: Record<string, unknown>): string {
  return parseBuddyMetadata(metadata).title ?? titleFromToolName(tool)
}
```

Rendering usage:

```ts
const state = parseToolState(part)
const buddy = parseBuddyMetadata(state.metadata)

if (buddy.presentation === "hidden-summary") {
  // Group into HiddenSteps and use summary fallback when needed
}

const title = buddy.title ?? titleFromToolName(tool)
```

### Why This API Is Better

- frontend depends only on UI metadata
- backend keeps semantic/runtime concerns separate from presentation concerns
- static and dynamic tools can share the same rendering path
- no frontend hard-coding of backend dynamic metadata enums
- no frontend dependence on `dynamic: true`

## Iteration 3

Current preferred direction.

### Idea

Add a shared tool UI layer used by both backend and frontend.

- backend owns and normalizes tool UI metadata
- runtime preserves that UI metadata across the full lifecycle
- frontend parses only the shared UI metadata

This makes it explicit what metadata is for.

### Shared Type Shape

Shared contract:

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

Transport shape:

```ts
metadata: {
  toolUi?: ToolUiMetadata
}
```

### Backend API Shape

```ts
type BuddyToolUi = ToolUiMetadata

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
  ui?: BuddyToolUi
}
```

### Backend End-State Snippet

Dynamic tool:

```ts
export const pedagogyReflectionTool = createBuddyTool({
  id: "pedagogy_reflection_v2",
  description: "Guides structured learner reflection.",
  dynamic: {
    title: "Reflection",
    useCase: "reflection",
    keywords: ["reflection", "metacognition"],
    description: "Use when the learner should reflect on their reasoning.",
  },
  parameters: ReflectionParameters,
  async execute(args, ctx) {
    return {
      title: "Reflection",
      output: "Prompted learner reflection over the latest attempt.",
      metadata: {
        learnerTurnCount: 3,
      },
    }
  },
})
```

Static tool opting into the same UI layer:

```ts
export const learnerSnapshotReadTool = createBuddyTool({
  id: "learner_snapshot_read",
  description: "Reads the learner snapshot.",
  ui: {
    presentation: "hidden-summary",
    title: "Learner Snapshot",
  },
  parameters: LearnerSnapshotParameters,
  async execute(args, ctx) {
    return {
      title: "Learner Snapshot",
      output: "Loaded learner snapshot.",
      metadata: {},
    }
  },
})
```

### Backend Normalization

```ts
function normalizeToolUiMetadata(
  definition: BuddyToolDefinition<string, z.ZodType, Record<string, unknown>>,
): ToolUiMetadata | undefined {
  const presentation = definition.ui?.presentation ?? (definition.dynamic ? "hidden-summary" : undefined)
  const title = definition.ui?.title ?? definition.dynamic?.title

  if (!presentation && !title) return undefined
  return { presentation, title }
}
```

Meaning:

- `dynamic` still drives backend/runtime semantics
- `ui` is explicit presentation metadata
- dynamic tools get default UI metadata inferred automatically
- static tools can opt in explicitly

### Frontend API Shape

Frontend should use one parser entrypoint:

```ts
export type ParsedToolUiMetadata = ToolUiMetadata

export function parseToolUiMetadata(metadata: Record<string, unknown>): ParsedToolUiMetadata | undefined
```

### Frontend End-State Snippet

```ts
export function parseToolUiMetadata(metadata: Record<string, unknown>): ToolUiMetadata | undefined {
  const value = metadata.toolUi
  if (!value || typeof value !== "object") return undefined

  const record = value as Record<string, unknown>
  const presentation =
    record.presentation === "hidden-summary" || record.presentation === "default"
      ? record.presentation
      : undefined
  const title = typeof record.title === "string" ? record.title : undefined

  if (!presentation && !title) return undefined
  return { presentation, title }
}

const state = parseToolState(part)
const toolUi = parseToolUiMetadata(state.metadata)

if (toolUi?.presentation === "hidden-summary") {
  // Group into HiddenSteps and use summary fallback when needed
}

const title = toolUi?.title ?? titleFromToolName(tool)
```

### Why Iteration 3 Is Better

- explicit shared purpose: this metadata is for tool UI
- same shape on backend and frontend
- no frontend dependence on `dynamic` or `useCase`
- dynamic and static tools can use the same path
- easy to move under a stricter Buddy namespace later if needed

### Open Question Inside Iteration 3

The main remaining API choice is transport naming:

- `metadata.toolUi`
- `metadata.buddy.toolUi`

For Iteration 4, use `metadata.buddy.toolUi`.

## Iteration 4

This iteration separates backend/search semantics from frontend/UI semantics explicitly.

### Principle

- `dynamic` is for backend/search/runtime behavior
- `ui` is for frontend presentation behavior
- they may overlap in meaning sometimes, but they are intentionally separate concerns
- dynamic tools still default to hidden-summary UI behavior when `ui` is omitted

This means duplication is acceptable when both layers need similar information, because they serve different purposes.

### Backend API Shape

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
```

### Backend End-State Snippet

Dynamic tool with explicit UI override:

```ts
export const pedagogyReflectionTool = createBuddyTool({
  id: "pedagogy_reflection_v2",
  description: "Guides structured learner reflection.",
  dynamic: {
    title: "Reflection",
    useCase: "reflection",
    keywords: ["reflection", "metacognition"],
    description: "Use when the learner should reflect on their reasoning.",
  },
  ui: {
    presentation: "hidden-summary",
    labels: {
      idle: "Reflection",
      running: "Guiding reflection",
    },
  },
  parameters: ReflectionParameters,
  async execute(args, ctx) {
    return {
      title: "Reflection",
      output: "Prompted learner reflection over the latest attempt.",
      metadata: {
        learnerTurnCount: 3,
      },
    }
  },
})
```

Static tool using the same UI contract:

```ts
export const learnerSnapshotReadTool = createBuddyTool({
  id: "learner_snapshot_read",
  description: "Reads the learner snapshot.",
  ui: {
    presentation: "hidden-summary",
    labels: {
      idle: "Learner Snapshot",
      running: "Reading learner snapshot",
    },
  },
  parameters: LearnerSnapshotParameters,
  async execute(args, ctx) {
    return {
      title: "Learner Snapshot",
      output: "Loaded learner snapshot.",
      metadata: {},
    }
  },
})
```

### Backend Normalization

In this iteration, normalization should prefer `ui`, but still provide the default hidden-summary behavior for dynamic tools:

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
  return {
    presentation,
    labels,
  }
}
```

Important consequence:

- a dynamic tool is hidden-summary by default even when `ui` is omitted
- `ui` is how authors refine or override the default UI behavior
- changing dynamic/search behavior later does not force UI changes
- changing UI behavior later does not force search/backend changes

### Frontend API Shape

```ts
export type ParsedToolUiMetadata = ToolUiMetadata

export function parseToolUiMetadata(metadata: Record<string, unknown>): ParsedToolUiMetadata | undefined
```

### Frontend End-State Snippet

```ts
export function parseToolUiMetadata(metadata: Record<string, unknown>): ToolUiMetadata | undefined {
  const buddy = metadata.buddy
  if (!buddy || typeof buddy !== "object") return undefined

  const value = (buddy as Record<string, unknown>).toolUi
  if (!value || typeof value !== "object") return undefined

  const record = value as Record<string, unknown>
  const presentation =
    record.presentation === "hidden-summary" || record.presentation === "default"
      ? record.presentation
      : undefined
  const rawLabels = record.labels
  const labels =
    rawLabels && typeof rawLabels === "object"
      ? {
          idle:
            typeof (rawLabels as Record<string, unknown>).idle === "string"
              ? ((rawLabels as Record<string, unknown>).idle as string)
              : undefined,
          running:
            typeof (rawLabels as Record<string, unknown>).running === "string"
              ? ((rawLabels as Record<string, unknown>).running as string)
              : undefined,
        }
      : undefined

  if (!presentation && !labels?.idle && !labels?.running) return undefined
  return { presentation, labels }
}

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

### Why Iteration 4 Is Better

- search/runtime semantics and UI semantics are decoupled
- frontend depends on an explicit UI contract only
- backend authors can evolve dynamic search behavior without changing UI logic
- backend authors can change UI behavior without changing dynamic search semantics
- static and dynamic tools share one explicit UI layer
- dynamic tools still get the default hidden-summary behavior without extra authoring
- transport lives under `metadata.buddy.toolUi`, so the ownership is explicit
- lifecycle-aware labels fit how the current language layer already renders tools

### Cost Of Iteration 4

- authors of dynamic tools set `ui` only when they want to refine or override the default UI behavior
- this still allows explicit duplication across concerns when that is desirable

## Final Plan

Single-phase implementation plan based on the converged API decisions.

### Final Design

- `dynamic` remains backend/search/runtime metadata only
- `ui` is the explicit frontend/presentation authoring field
- transport key is `metadata.buddy.toolUi`
- dynamic tools default to hidden-summary UI behavior even when `ui` is omitted
- `ui` is used to refine or override the default UI behavior
- frontend depends only on parsed `toolUi` metadata, not on `dynamic` or backend `useCase`
- persisted pending-stage UI metadata must not leak back into provider history
- the `tool.toTool(...)` boundary must explicitly preserve normalized `toolUi` metadata for adapter/runtime lookup

### Final Shared Types

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

### Final Backend API Shape

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

### Final Backend Normalization Rule

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
  return {
    presentation,
    labels,
  }
}
```

### Final Runtime Transport Shape

```ts
// Pending parts must attach this on part.metadata, not state.metadata
metadata: {
  buddy?: {
    toolUi?: ToolUiMetadata
  }
}
```

Important transport note:

- pending parts have no schema-valid `state.metadata`
- pending UI metadata therefore must live on `part.metadata`
- but `part.metadata` is replayed into provider history today unless filtered
- implementation must add an explicit provider-history stripping step for `metadata.buddy.toolUi`

### Final Frontend Parser Contract

```ts
export type ParsedToolUiMetadata = ToolUiMetadata

export function parseToolUiMetadata(metadata: Record<string, unknown>): ParsedToolUiMetadata | undefined
```

### Final Frontend Usage

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

### Exact Implementation Changes

#### Backend / Runtime

`packages/buddy/src/learning/tools/create-buddy-tool.ts`

- add `ui?: ToolUiMetadata` to the authoring API
- add `ui?: ToolUiMetadata` to the returned `BuddyTool` object as well
- add `normalizeToolUiMetadata(...)`
- preserve normalized UI metadata for runtime use
- merge preserved UI metadata into live `ctx.metadata(...)` emits
- merge preserved UI metadata into final execute result metadata

`packages/opencode-adapter/src/registry.ts`

- preserve normalized `toolUi` metadata alongside registered custom tools
- expose runtime lookup by tool ID without a manual authored map
- implement this as adapter-owned stored records or an equivalent side channel, because the current registry stores only raw custom tool info
- keep the side channel directory-scoped using the same canonical `key(directory)` logic as the existing custom tool registry
- clear the side channel on unregister so metadata cannot leak across unloads or directories

`packages/buddy/src/learning/tools/register-buddy-tools.ts`

- stop calling `ToolRegistry.register(tool.toTool(directory))` with runtime info alone
- carry normalized `toolUi` across the registration boundary explicitly
- viable shapes include:
- `ToolRegistry.register({ info: tool.toTool(directory), toolUi: tool.ui ?? normalizedDefault })`
- or `ToolRegistry.register(tool.toTool(directory), { toolUi: tool.ui ?? normalizedDefault })`
- do not rely on `ToolRegistry.register(...)` being able to infer UI metadata from the runtime `Tool.Info` object, because `toTool(...)` drops authoring-only fields

New adapter lifecycle patch module

- patch `SessionProcessor` or `SessionPrompt` explicitly from Buddy-owned adapter code
- preferred seam: patch `SessionProcessor.create()` because pending/running/completed/error writes are centralized there
- attach `metadata.buddy.toolUi` at pending tool-part creation using `part.metadata`
- preserve it at running transition
- preserve it through result rewrites
- preserve it through error rewrites
- preserve it for task/subtask tool paths too if they bypass the main processor helper path
- add an explicit provider-history filtering seam so `metadata.buddy.toolUi` is removed before prior messages are converted back into model-facing tool-call metadata
- feasible seams to evaluate are:
- a Buddy-owned `SessionPrompt` patch before `MessageV2.toModelMessagesEffect(...)`
- or a Buddy-owned plugin hook at `experimental.chat.messages.transform`
- whichever seam is used must work for all prompt callers, not only the server app bootstrap path

`packages/buddy/src/opencode-runtime/runtime.ts`

- install the lifecycle metadata patch during bootstrap

`packages/opencode-adapter/src/session-prompt.ts`

- ensure the same patch is installed for direct `SessionPrompt.prompt(...)` callers, not only the server runtime bootstrap path
- this is required because Buddy also calls `SessionPrompt.prompt(...)` directly outside the server app path

#### Frontend

`packages/web/src/components/chat/tools/parse-tool-state.ts`

- keep merged metadata behavior

`packages/web/src/components/chat/tools/tool-info.ts`

- consume parsed tool UI metadata for lifecycle-aware labels

`packages/web/src/components/chat/utils/message-utils.ts`

- treat `toolUi.presentation === "hidden-summary"` as abstractable
- stop relying only on the manual tool-name set for this case

`packages/web/src/components/chat/tools/hidden-steps/index.tsx`

- synthesize generic hidden-step fallback presentation for tools marked hidden-summary even when no registered renderer provides `hiddenSteps`

`packages/web/src/components/chat/tools/hidden-steps-presenters.ts`

- add explicit presenters for `learning_tool_search` and `learning_tool_load`

`packages/web/src/components/chat/tools/tools.tsx`

- register `learning_tool_search` and `learning_tool_load` with hidden-step presenters

`packages/web/src/components/chat/tools/` new helper if needed

- add `parseToolUiMetadata(...)`

### Final Checklist

- [ ] Add `ui?: ToolUiMetadata` to `createBuddyTool`
- [ ] Add `ui?: ToolUiMetadata` to returned `BuddyTool` objects too
- [ ] Implement `normalizeToolUiMetadata(...)`
- [ ] Preserve normalized UI metadata in adapter registry
- [ ] Add runtime lookup of preserved `toolUi` by tool ID
- [ ] Carry `toolUi` across the `registerBuddyTools(...) -> ToolRegistry.register(...)` boundary explicitly
- [ ] Make preserved metadata storage directory-scoped and unregister-safe
- [ ] Add explicit `SessionProcessor`/`SessionPrompt` lifecycle patch for pending/running/result/error preservation
- [ ] Attach pending metadata on `part.metadata`, not `state.metadata`
- [ ] Preserve metadata on the error path explicitly
- [ ] Preserve metadata on task/subtask tool paths if they use parallel lifecycle writes
- [ ] Add explicit stripping of `metadata.buddy.toolUi` before provider-history replay
- [ ] Install lifecycle patch from runtime bootstrap
- [ ] Install the same patch path for direct `SessionPrompt` adapter callers
- [ ] Implement `parseToolUiMetadata(...)`
- [ ] Update `getToolInfo()` to use lifecycle-aware UI labels
- [ ] Update message grouping to key off `toolUi.presentation`
- [ ] Add generic hidden-step fallback for hidden-summary tools even without registered renderers
- [ ] Add search/load presenters
- [ ] Add backend tests for normalization and lifecycle preservation
- [ ] Add backend tests proving pending `part.metadata` carries `buddy.toolUi`
- [ ] Add backend tests proving provider-history replay strips `buddy.toolUi`
- [ ] Add backend tests proving unregister clears the directory-scoped `toolUi` side channel
- [ ] Add frontend tests for hidden-summary grouping and label selection
- [ ] Add frontend tests proving metadata-marked unknown tools become abstracted even without renderer registration
- [ ] Run `bun fmt`
- [ ] Run `bun lint`
- [ ] Run `bun typecheck`

### Final Acceptance Criteria

- Dynamic tools are hidden-summary by default from the first visible lifecycle event.
- Static tools can opt into the same UI behavior with `ui`.
- Frontend does not inspect `dynamic` or backend semantic enums.
- No tool-name conventions are required.
- No manual tool-ID map is required.
- Pending attachment uses `part.metadata` correctly for the SDK/runtime shape.
- `metadata.buddy.toolUi` does not leak back into provider history.
- Registration preserves `toolUi` across the `tool.toTool(...)` boundary explicitly.
- `metadata.buddy.toolUi` survives pending, running, live emit, result, and error.
- Labels can differ by lifecycle state using `labels.idle` and `labels.running`.
