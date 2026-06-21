# Bench Mode Design

> Historical note: this document records the pre-refactor Bench mode design history. The current post-refactor architecture is documented in `current-architecture.md`, and `bench-refactor.md` is the authoritative refactor plan. Keep the material below for context, but do not use stale references to `BenchAutoOpen`, transcript-driven presentation, transition classifiers, or legacy right-sidebar state as current implementation guidance.

## Objective

Bench mode is the first-class Buddy workspace for artifacts, files, reading, markdown editing, whiteboards, and other non-chat surfaces that benefit from more space than the transcript can provide.

The design goal is to make Bench predictable: opening a surface should have an explicit policy for where the artifact goes, where chat goes, how much space chat gets, and whether the user's current layout mode is preserved.

## Locked Vocabulary

The product and code vocabulary use the same terms:

| Term | Meaning |
| --- | --- |
| `docked` | Bench content is primary and chat is docked in a side panel. |
| `floating` | Bench content is primary and chat floats above the bench as a movable window. |
| `main chat` | Normal chat route with no Bench content visible. |
| `bench surface` | The content currently displayed in Bench. |

## Prior Implementation State

Bench opening was originally split across two concepts:

- `openBench(directory, target, options)` maps a target to a route and optionally adds `benchChat=floating`.
- `bench-open-policy.ts` decides auto-open candidates for whiteboard work and full-size HTML widgets.

That made layout policy partly centralized and partly caller-owned. The locked API below centralizes "how Bench opens" for user actions, deterministic UI opens, and auto-open behavior.

## Degrees Of Freedom

### Mode

Bench has two layout modes:

- `docked`
- `floating`

Locked:

- An explicit user dock/float action persists globally by surface family.
- When entering Bench from main chat, mode resolves from explicit request, then saved surface-family preference, then target default, then docked fallback.
- Agent actions, auto-open policy, route restoration, and responsive corrections do not overwrite the user's saved preference.

The exact default mode per target family is locked in decision 5.

### Docked Mode

Locked:

- Docked sizing uses semantic layout profiles: `balanced` and `bench-first`.
- `balanced` starts from `480px` chat width, `320px` min chat width, `55vw` max chat width, and `320px` min Bench width.
- `bench-first` starts from `380px` chat width, `320px` min chat width, `42vw` max chat width, and `480px` min Bench width.
- User-resized width is preserved only while the parent Bench route remains mounted.
- Docked width resets to the selected profile default after leaving Bench.

Locked API boundary:

- The target selects a semantic layout profile through centralized policy.
- The pixel-layout adapter converts that profile into the initial width and min/max constraints.
- Callers and agents do not provide width values or layout profile ids.

### Floating Mode

Locked:

- Floating sizing uses the same semantic profiles: `balanced` and `bench-first`.
- Floating position is lower-right biased and clamped inside the Bench container.
- User-moved/resized floating geometry is preserved only while the parent Bench route remains mounted.
- Floating geometry resets to the selected profile default after leaving Bench.
- Floating minimization is supported as a temporary user-only substate.
- Minimized means a small restore affordance, not composer-only chat.

Locked API boundary:

- The target selects a semantic layout profile through centralized policy.
- The pixel-layout adapter converts that profile into the initial floating rectangle and constraints.
- Callers and agents do not provide dimensions, coordinates, or layout profile ids.

### Mode Switching

Locked transition policy:

- Main chat -> docked
- Docked -> main chat
- Main chat -> floating
- Floating -> main chat
- Docked -> floating
- Floating -> docked

For each transition, decision 10 defines:

- Which element moves?
- Which element fades or scales?
- Does the main chat conversation animate into a docked panel or floating window?
- Does the bench surface animate in behind chat or replace the main content after chat moves?

The left-sidebar-specific choreography remains decision 11.

### Explorer

Locked facts:

- Explorer is normal chat-route chrome, not part of the mounted Bench route.
- Workspace panel file opens are currently queued through `workspace-file-panel-store` and become visible only when the chat route/right sidebar is mounted.
- Therefore, opening a file whose primary target is the workspace panel while Bench is open can create an invisible state change.

Locked:

- Explorer remains normal chat-route chrome, not a Bench surface.
- Concrete file opens while Bench is open must be visible immediately.
- When a file-open plan resolves to `workspace-panel` while Bench is open, Buddy opens the existing Bench `file` target instead of queuing an invisible Files-sidebar state.
- Explicit explorer/sidebar actions leave Bench and open main chat with the Files sidebar active.
- Buddy does not introduce a Bench-local explorer in this policy pass.

### Context

Locked:

- While Bench is open, Buddy receives a concise, deduped turn prelude derived from the current Bench snapshot.
- While Bench is closed, no Bench prelude is emitted.
- Full Bench content is read on demand through `bench_read_context`, not attached automatically to every prompt.
- User-selected context remains a prompt-chip concern and is separate from `bench_read_context`.
- Context should favor relevant model-readable dumps over deeply normalized surface-specific structures.

Out of scope for now:

- The central selection API and which surfaces support selection.

### Agent Control

Locked:

- Buddy knows when Bench is open through the turn prelude and can inspect it through `bench_read_context`.
- The agent-facing presentation tool is `bench_present`.
- `bench_present` can present workspace files, prepared reading resources/books, and the current whiteboard, or close Bench.
- `bench_present` does not accept routes, layout profiles, mode names, pixel geometry, transitions, animation values, suppression state, artifact ids, or user-preference writes.
- Bench control is presentation control, not a content creation API. Domain tools create or update files, artifacts, boards, slides, and other content; Bench may present stable targets produced or referenced by those tools through explicit policy.

Out of scope for now:

- Generated artifact presentation in decision 21: whether artifacts become agent-presentable through producer auto-open policy, explicit model-visible handles, or a later dedicated API.

## Additional Decisions To Track

- Keyboard shortcuts for opening, closing, docking, floating, and minimizing chat.
- Accessibility behavior for floating focus management and screen-reader order.
- Mobile behavior is moot for Bench v1. Narrow desktop windows use layout clamping only.
- Geometry and minimized-state persistence are route-runtime-only. Mode persistence is durable and locked separately.
- Multi-surface history: whether Bench has back/forward history independent of browser history.
- Error states: where load errors render when floating chat is minimized.
- Unsaved work: markdown edits, whiteboard edits, and file-preview state during navigation.
- Remote/client behavior: whether Bench layout is local UI state only or synced in any remote surface.
- Telemetry/debugging: how to inspect why a target opened in a particular mode.

## Locked Bench Policy API

The canonical policy boundary is:

```text
BenchOpenRequest
-> resolve target defaults
-> resolve open policy
-> BenchOpenDecision
-> navigation and pixel-layout adapters
-> mounted Bench runtime
```

Callers provide target identity and explicit intent. They do not provide target defaults, routes, pixel widths, floating coordinates, transition names, or animation values.

### Target Identity

```ts
type BenchArtifactKind =
  | "mermaid"
  | "html-widget"
  | "figure"
  | "freeform-figure"
  | "media-presentation"
  | "question-set"
  | "flashcard-deck"

type BenchTarget =
  | { type: "reading"; path: string; resourceID?: string }
  | { type: "whiteboard" }
  | { type: "markdown"; path: string }
  | { type: "file"; path: string }
  | {
      type: "artifact"
      kind: BenchArtifactKind
      artifactID: string
      itemID?: string
    }
```

This remains an exhaustive internal TypeScript union. Adding a new surface or artifact kind must produce compile-time work in target defaults, navigation, route rendering, and context-provider support. A dynamic registry is not required for the current architecture.

Target equality is also centralized:

```ts
function isSameBenchTarget(
  left: BenchTarget,
  right: BenchTarget,
): boolean
```

Equality rules are:

- whiteboard equals whiteboard;
- reading requires equal `path` and equal optional `resourceID`;
- markdown and file require equal `type` and `path`;
- artifacts require equal `kind`, `artifactID`, and optional `itemID`.

Directory is compared separately because the same workspace-relative path or artifact id in two directories is not the same Bench target.

### Open Request

```ts
type BenchMode = "docked" | "floating"
type BenchModeRequest = "policy" | BenchMode

type BenchAutoOpenPolicyID =
  | "whiteboard"
  | "fullscreen-html-widget"

type BenchAutoOpenIdentity = {
  policyID: BenchAutoOpenPolicyID
  eventKey: string
}

type BenchOpenRequest = {
  directory: string
  target: BenchTarget
  mode: BenchModeRequest
  autoOpen: BenchAutoOpenIdentity | null
}
```

Field semantics are exact:

- `directory` is required because callers can open a target in a directory other than the currently active directory.
- `target` identifies what Bench should display.
- `mode: "policy"` delegates mode selection to centralized policy.
- `mode: "docked" | "floating"` is an explicit semantic request. It is not a target default and does not contain pixels.
- `autoOpen: null` means the request is an ordinary deterministic open.
- Non-null `autoOpen` identifies an automatic event for authority, deduplication, and suppression. Both `policyID` and `eventKey` are required because current suppression is scoped by policy and event.
- Caller location such as chat, library, explorer, shortcut, or tool result is not part of this API because current behavior does not require it.
- Deep links and browser history restore route state; they do not manufacture a normal `BenchOpenRequest`.

Examples:

```ts
const openMarkdown: BenchOpenRequest = {
  directory,
  target: { type: "markdown", path },
  mode: "policy",
  autoOpen: null,
}

const autoOpenWhiteboard: BenchOpenRequest = {
  directory,
  target: { type: "whiteboard" },
  mode: "policy",
  autoOpen: {
    policyID: "whiteboard",
    eventKey: toolCallKey,
  },
}
```

### Persisted Mode Preference

An explicit user dock/float action persists globally by surface family. `BenchPresentationPreferences` is durable local application state: it survives Bench close/reopen, session changes, workspace changes, and application restarts. It is not stored per route, artifact id, session, board, or workspace.

```ts
type BenchModePreferenceKey =
  | "reading"
  | "whiteboard"
  | "markdown"
  | "file"
  | `artifact:${BenchArtifactKind}`

type BenchPresentationPreferences = {
  modeBySurface: Partial<Record<BenchModePreferenceKey, BenchMode>>
}

type BenchPresentationPreferenceStore = {
  read(): BenchPresentationPreferences
  setMode(input: {
    target: BenchTarget
    mode: BenchMode
  }): void
}

function benchModePreferenceKey(
  target: BenchTarget,
): BenchModePreferenceKey
```

When Bench is closed, mode resolution order is locked:

```text
explicit request mode
-> saved user preference for the surface family
-> target default mode
-> docked system fallback
```

Only an explicit user mode change writes `modeBySurface`. Target defaults, auto-open behavior, responsive corrections, route restoration, and agent actions do not overwrite the user's persisted preference.

Concrete whiteboard behavior:

1. Assume decision 5 later assigns whiteboard a floating target default. The first whiteboard auto-open enters floating because no saved preference exists.
2. The user docks chat. `setMode({ origin: "user" })` writes `modeBySurface.whiteboard = "docked"`.
3. The user closes Bench.
4. A later whiteboard auto-open resolves the saved whiteboard preference before the target default, so it opens docked.

### Target Defaults And Layout Profiles

Target defaults are centralized and exhaustive:

```ts
type BenchLayoutProfileID =
  | "bench-first"
  | "balanced"

type BenchSurfaceDefaults = {
  mode: BenchMode
  layoutProfile: BenchLayoutProfileID
}

function resolveBenchSurfaceDefaults(
  target: BenchTarget,
): BenchSurfaceDefaults
```

The profile is semantic:

- `bench-first` reserves more initial space for the Bench surface and less for docked chat.
- `balanced` gives Bench and chat a more even initial allocation.

The exact surface-to-profile mapping and numeric values remain explicit pending decisions below. Callers and agents never provide profile ids.

Per-artifact metadata is not part of the generic open request. The current full-size HTML-widget detector already has viewport metadata and may identify the `fullscreen-html-widget` auto-open policy. Generic user opens and direct links use the artifact-kind default unless a future requirement justifies a centralized asynchronous descriptor lookup.

### Open Policy State And Decision

```ts
type BenchOpenPolicyState =
  | {
      status: "closed"
    }
  | {
      status: "open"
      directory: string
      target: BenchTarget
      mode: BenchMode
      layoutProfile: BenchLayoutProfileID
    }

type BenchGeometryDirective =
  | "preserve"
  | "use-profile"

type BenchIgnorePolicyID =
  | "already-open"
  | "auto-open-suppressed"
  | "auto-open-not-authorized"
  | "leave-guard-blocked"

type BenchResolvedOpenPolicyID =
  | "explicit-mode"
  | "saved-surface-mode"
  | "target-default-mode"
  | "docked-fallback"
  | "preserved-current-mode"

type BenchOpenDecision =
  | {
      action: "ignore"
      policyID: BenchIgnorePolicyID
    }
  | {
      action: "open"
      directory: string
      target: BenchTarget
      mode: BenchMode
      layoutProfile: BenchLayoutProfileID
      dockedWidth: BenchGeometryDirective
      floatingSize: BenchGeometryDirective
      floatingPosition: BenchGeometryDirective
      policyID: BenchResolvedOpenPolicyID
    }

type ResolveBenchOpenPolicyInput = {
  request: BenchOpenRequest
  current: BenchOpenPolicyState
  defaults: BenchSurfaceDefaults
  preferences: BenchPresentationPreferences
  autoOpenSuppressed: boolean
}

function resolveBenchOpenPolicy(
  input: ResolveBenchOpenPolicyInput,
): BenchOpenDecision
```

The resolver is pure. It decides:

- whether an automatic request is ignored;
- the semantic mode;
- the semantic layout profile; and
- whether existing docked width, floating size, and floating position are preserved or reset to the selected profile.

`policyID` records the branch that produced the decision. `"already-open"` is valid only when directory, target identity, resolved mode, and layout profile are unchanged and all geometry directives would preserve current state. `"preserved-current-mode"` is available to the API but its use remains part of decision 3.

It does not produce a route, pixels, coordinates, transition type, or animation configuration.

### Pixel Layout Adapter

Layout profiles are resolved against the actual container:

```ts
type BenchViewport = {
  widthPx: number
  heightPx: number
  safeTopPx: number
}

type BenchRect = {
  x: number
  y: number
  width: number
  height: number
}

type ResolvedBenchLayoutDefaults = {
  dockedChatWidthPx: number
  dockedChatMinWidthPx: number
  dockedChatMaxWidthPx: number
  benchMinWidthPx: number
  floatingRect: BenchRect
  floatingMinWidthPx: number
  floatingMinHeightPx: number
  floatingMarginPx: number
}

function resolveBenchLayoutDefaults(input: {
  profile: BenchLayoutProfileID
  viewport: BenchViewport
}): ResolvedBenchLayoutDefaults
```

This is where screen-based ratios, min/max constraints, titlebar safe area, clamping, and profile-specific initial width and placement are converted into pixels. The profile's concrete numbers are layout policy, not caller input and not agent-tool parameters.

### Navigation Adapter

Routing remains separate from policy:

```ts
function buildBenchNavigation(input: {
  directory: string
  target: BenchTarget
  mode: BenchMode
}): NavigateOptions
```

The adapter maps the target to its TanStack route and encodes the resolved mode in route search. The route is never returned by `resolveBenchOpenPolicy`.

The public frontend open API is:

```ts
type OpenBench = (
  request: BenchOpenRequest,
  options?: {
    origin: "user" | "agent" | "auto-open"
  },
) => Promise<BenchOpenDecision>

function useOpenBench(): OpenBench
```

`useOpenBench` obtains the current open policy state from the optional mounted Bench route context. When no Bench route context exists, current state is `{ status: "closed" }`. It reads persisted preferences, checks auto-open suppression, resolves defaults and policy, runs the leave guard for target replacement, builds navigation, and returns the decision.

`options.origin` is execution metadata for the leave guard only. It is not part of `BenchOpenRequest`, `ResolveBenchOpenPolicyInput`, target defaults, route construction, layout policy, or the agent-facing schema. Ordinary UI opens default to `"user"`; `bench_present` frontend presentation actions pass `"agent"`; auto-open requests still use `"auto-open"` because `request.autoOpen` is present.

### Transition And Motion Separation

Transition semantics are derived after policy by comparing states:

```ts
type BenchTransition =
  | "enter"
  | "exit"
  | "replace"
  | "change-mode"
  | "replace-and-change-mode"
  | "none"

function classifyBenchTransition(input: {
  previous: BenchOpenPolicyState
  next: BenchOpenPolicyState
}): BenchTransition
```

Motion durations, easing, transforms, opacity, view-transition names, and component styling remain UI implementation. They are not fields in `BenchOpenRequest`, `BenchOpenDecision`, or the agent-facing tool API.

### Locked Bench Route Ownership API

Bench is route-owned state. The parent Bench route is the lifecycle boundary and owns the state shared by every Bench surface:

- the current docked or floating mode;
- the one active surface registration;
- context-provider coordination; and
- publishing open or closed Bench context.

Each child Bench route owns its surface-specific state and registers it with the parent. There is no independent global Bench store. State that must outlive the parent Bench route belongs in an explicitly named persistence or backend registry, not in the live Bench runtime.

```ts
type BenchSetModeRequest = {
  mode: BenchMode
  origin: "user" | "agent"
}

type BenchFloatingChatState =
  | "open"
  | "minimized"

type BenchRuntimeState = {
  directory: string
  target: BenchTarget
  mode: BenchMode
  layoutProfile: BenchLayoutProfileID
  dockedChatWidthPx: number
  floatingRect: BenchRect
  floatingChatState: BenchFloatingChatState
}

type BenchRouteContextValue = {
  state: BenchRuntimeState

  setMode(input: BenchSetModeRequest): void

  setFloatingChatState(input: {
    state: BenchFloatingChatState
    origin: "user"
  }): void

  registerSurface(input: {
    target: BenchTarget
    contextProvider: BenchContextProvider
    leaveGuard?: (
      input: BenchLeaveGuardInput,
    ) => BenchLeaveGuardResult | Promise<BenchLeaveGuardResult>
  }): () => void

  flushContext(input: {
    sessionID: string
  }): Promise<void>

  publishCurrent(): Promise<void>
}
```

Mode-change semantics are exact:

- `origin: "user"` updates the live mode, replaces the route search value without adding history, and persists the surface-family preference.
- `origin: "agent"` updates the live mode and route search but does not write a user preference.
- Responsive corrections do not call `setMode` and do not write a preference.
- `BenchOpenRequest.mode` controls only that open operation and does not itself write a preference.
- `setMode({ mode: "docked" })` clears floating minimization back to `"open"`.
- `setFloatingChatState` is user-only, route-runtime-only state. It is not persisted, not read from target policy, and not exposed to the agent control tool.

Lifecycle rules:

- The parent Bench route creates and provides this value while any Bench child route is mounted.
- Exactly one child surface may be registered at a time, with an optional leave guard for dirty/conflict state.
- A child registers on mount and calls the returned cleanup function on unmount.
- Moving between Bench child routes replaces the active registration without publishing a closed state between them.
- Leaving the parent Bench route publishes `{ status: "closed" }`.
- `flushContext` reads the current provider and publishes its result for the target session before prompt submission.
- `publishCurrent` republishes the current provider for the active session when a surface needs to force a snapshot refresh after an internal state transition.
- The route runtime owns the current docked width and floating rectangle. Child surfaces do not set pixels.
- `useOpenBench` may consume the optional route context when Bench is already open, but ordinary callers do not mutate route runtime directly.
- Floating minimization is a temporary substate of floating mode. It exists so the learner can inspect the full Bench surface, especially fullscreen HTML widgets, without changing policy or durable preferences.

## Locked Agent Control And Context Invariant

Any deterministic Bench control or context API must be usable as an agent tool without redesign.

This applies in both directions:

- If the app exposes a semantic deterministic operation such as open, close, switch mode, or choose a named presentation state, the agent-facing API should be able to request that operation through function calling.
- Pointer-driven geometry is UI state, not automatically an agent capability. Raw widths, heights, and coordinates remain outside the agent API unless a later product requirement introduces a semantic geometry command.
- Temporary user-only presentation affordances, such as floating chat minimization, are excluded from the agent-control invariant unless they are later promoted to product policy.
- If the app can deterministically know what is on Bench, what is selected, what file/artifact is active, whether content is dirty, or what context is relevant, the agent-facing API should be able to request that context through function calling.

The canonical control and context shapes should be compatible with strict JSON-schema tool calling for both OpenAI and Anthropic. Deterministic UI code may wrap them in richer TypeScript helpers, but the durable semantic API must be expressible as strict tool schemas.

Concrete design constraints:

- Use a root object schema, not a root discriminated union.
- Prefer one command envelope with explicit enum fields over many shape variants.
- Use enums and object structure to make invalid states unrepresentable where possible.
- Keep nesting shallow and avoid deeply nested target-specific objects.
- Do not put user/private data in schema property names, enum values, const values, or regex patterns.
- Keep the agent-visible tool count small. Bench should probably be one control tool plus separate content-creation tools only when the domain truly needs them.
- Do not make the model fill values the app already knows. Directory, active session, current Bench target, and selected route state should usually come from runtime context, not tool parameters.
- Prefer explicit read tools over implicit prompt bloat. Bench context should be discoverable on demand, not automatically attached in full to every prompt.
- Context responses must be high-signal and stable. Return semantic identifiers, useful metadata, dirty/conflict state, and actionable refs alongside model-readable content.
- Return canonical textual context directly when it is useful, including the complete current Markdown editor snapshot. Do not add custom budgets, cursors, chunking protocols, or snapshot-file refs merely to pre-truncate tool output; normal OpenCode output limits own oversized results.
- Dynamic values belong in tool results, not schemas. Paths, artifact ids, headings, selections, and titles must be data, never generated enum values or schema property names.
- The frontend is authoritative for what the learner currently sees on Bench. Browser route state, unsaved markdown edits, current review state, and other live surface state must be published before a backend agent tool can read them.
- Synchronization failures are product failures. Backend enrichment must never silently replace missing frontend truth with an older or merely saved representation.

Provider mechanics that support this invariant:

- OpenAI and Anthropic both support strict tool inputs from JSON Schema.
- Provider strictness can enforce schema validity, but Buddy still needs runtime validation for cross-field rules such as `action: "present_file"` requiring `path` and `action: "present_resource"` requiring `resourceKey`.
- Provider schema constraints are an implementation guardrail, not the product API. The product API should stay simple enough that generated tool schemas naturally fit provider limits.

Implication for Bench:

The exact agent presentation tool is locked in decision 20. It is a strict-schema-compatible adapter over the locked internal open policy and route APIs, not a second policy system:

- `present_file` maps a workspace-relative path to the appropriate Bench file or markdown target;
- `present_resource` resolves a prepared reading resource id or alias, then maps it to a Bench reading target;
- `present_whiteboard` maps to the current session whiteboard target;
- `close` navigates out of the parent Bench route;
- runtime context supplies the active directory, session, current route state, mode policy, target defaults, layout profile, and user preferences;
- the agent never supplies a route, mode, layout profile, pixel width, floating rectangle, transition, animation, suppression state, artifact id, resource route state, or user-preference write;
- minimize and restore are user-only floating substates and are not exposed to the agent; and
- generated artifacts are not part of the v1 `bench_present` API unless a separate generated-artifact presentation decision adds explicit handles or producer auto-open policy.

The agent-facing context read API is current-only and takes no arguments. The model does not choose targets, paths, budgets, detail levels, or cursors. Its locked input and output contracts are defined in the `bench_read_context` section below.

## Current Context Dataflows

Existing context surfaces are not uniform:

| Surface | Current context source | Agent-read readiness |
| --- | --- | --- |
| Reading | Frontend `ActiveReadingResourceState`, sent with prompt body as `reading`, then rendered into a deduped user prelude. | Good for prompt-time context; not a standalone backend read API yet. |
| Reading selection | Frontend selection becomes a `selection-context` prompt part. | Good for explicit user-selected snippets. |
| Markdown | Editor state lives in `MarkdownBenchPage`; selection becomes `selection-context` with `source: "markdown"`. | Selection is ready; current dirty content and visible range are frontend-only unless snapshotted. |
| Markdown file content | Backend can read saved editable file content through project explorer APIs. | Saved content is readable; unsaved editor content is not. |
| Whiteboard | Backend-owned session board plus render reports; `whiteboard_read_context` already returns bounded context. | Ready as a dedicated tool, but separate from Bench. |
| Generic file | Backend can read metadata/raw bytes; Bench viewer classifies media locally. | Summary metadata is easy; text/visible context depends on file type and extraction support. |
| Mermaid | Artifact read returns source and render metadata. | Summary/source is readable. |
| HTML widget | Artifact read returns manifest/runtime/source URLs; source can be copied through a read helper. | Summary/source is readable, but runtime DOM state is not. |
| Figures | Artifact read returns metadata and raw SVG URL. | Summary/raw SVG is readable. |
| Media presentation | Artifact read returns item summaries and availability; raw bytes stay in source files. | Summary/item metadata is readable; media content is not. |
| Question set | Artifact read returns public questions and choices; attempts are separate. | Domain summary is readable. |
| Flashcards | Artifact read returns deck/review state through flashcard APIs. | Domain summary is readable. |

### Locked Context Execution Architecture

Bench context uses a hybrid execution architecture with frontend-authoritative snapshots:

- The active frontend surface owns the truth about what the learner currently sees.
- The frontend publishes that truth to a backend in-memory registry.
- The turn prelude and `bench_read_context` read the same stored snapshot.
- The backend may enrich the open snapshot with saved-file or artifact data, but must not replace missing live state with an older representation and claim that it is current.
- A synchronization failure is an error. Buddy must not silently return a stale snapshot.

Each active Bench surface registers one narrow provider through the parent Bench route:

```ts
type BenchContextProvider = {
  read(): BenchReadContextOpenOutput | Promise<BenchReadContextOpenOutput>
}

function publishClosedBenchContext(input: {
  directory: string
  sessionID: string
}): Promise<PublishBenchContextResponse>
```

Only one provider is active because Bench currently shows one surface at a time. Child-route replacement changes the active provider without marking Bench closed. The parent route, not each surface provider, owns publishing the closed state when the entire Bench route unmounts.

The internal HTTP API publishes the same canonical value returned by `bench_read_context`:

```ts
type PublishBenchContextRequest = BenchReadContextOutput

type PublishBenchContextResponse = {
  revision: number
}
```

```http
PUT /api/bench/session/:sessionID/context?directory=...
```

The backend registry API is:

```ts
type StoredBenchContextSnapshot = {
  revision: number
  value: BenchReadContextOutput
}

function publishBenchContext(input: {
  directory: string
  sessionID: string
  value: BenchReadContextOutput
}): Promise<StoredBenchContextSnapshot>

function readBenchContext(input: {
  directory: string
  sessionID: string
}): StoredBenchContextSnapshot
```

Registry and synchronization rules:

- Storage is in-memory and scoped by directory and session.
- Frontend publishes are serialized so later UI state cannot be overwritten by an earlier request completing late.
- The active surface republishes when it mounts, the active session changes, the frontend reconnects, prompt submission flushes context, or a surface explicitly signals a meaningful transition.
- Surface registration should be stable across normal render churn. Providers may keep live state in refs and return the latest snapshot from `read()`; changing editor text or transient review state must not re-register the surface or stream every render to the backend.
- Full-content snapshots are required at explicit boundaries: initial surface registration, active-session changes, prompt-time flush, route open/close, and explicit surface transitions. High-frequency edits should be coalesced or read lazily at flush time.
- Closing or unmounting the active Bench route explicitly publishes `{ status: "closed" }`; omission cannot clear the previous snapshot.
- Prompt submission resolves the target session, flushes the current provider to that session, and only then posts the prompt.
- The prompt prelude and later tool calls use the resulting stored revision.
- If the frontend prompt-time flush fails or no publisher is registered for the directory, prompt submission must not silently continue without current Bench truth.
- If no synchronized state is available during a tool call, the tool fails. Missing state is not interpreted as closed.
- Backend-only prompt construction cannot independently read browser state. If it is invoked without a frontend-published snapshot, the turn prelude may be absent; the frontend prompt path is responsible for publishing or failing before the request reaches backend prompt construction.
- `target.status: "unavailable"` is reserved for a surface that is visibly open but whose own context is unavailable. It is not used for transport or registry failures.

The current reading prompt flow can migrate to this registry separately. Until then, its existing deduped reading context satisfies Bench awareness for reading surfaces; Buddy should not emit a second generic Bench prelude for the same reading state.

### Locked Turn Prelude Policy

The turn prelude is a small, model-readable projection of the open snapshot. It is progressive disclosure, not a second context schema.

For example:

```md
<bench_turn_context>
The learner is editing "design.md" on Bench.
Path: docs/features/bench-mode/design.md
State: unsaved changes.
Use bench_read_context if the learner refers to its contents.
</bench_turn_context>
```

Rules:

- Emit the prelude only when `status` is `"open"`.
- Emit nothing for `{ status: "closed" }`; absence means Bench is not open.
- Include only relevant identity, location, and immediate live state already available in the open snapshot.
- Do not include the full `content`, JSON, workspace root, route, or refs list.
- Full context remains available through `bench_read_context`.
- Deduplicate unchanged preludes using the existing reading-context fingerprint pattern.

## Design Dead Ends

- A generic Bench provider cannot honestly promise visible text or selections for every surface. Some surfaces have no textual visible state; selections are a separate prompt-chip concern.
- A backend-only `bench_read_context` cannot see unsaved markdown edits, current review state, DOM selections, scroll position, or iframe runtime state.
- Replacing all reading prelude context with a read tool would be a behavioral change. Reading currently injects deduped context automatically, so this migration needs a separate decision.
- Making target IDs dynamic enum values is a dead end. Artifact IDs, paths, headings, and selections must stay ordinary data fields.
- Letting the agent choose low-level layout pixels is probably the wrong API. Deterministic code can own layout policy; agent tools should request semantic mode or preserve policy.

Provider references:

- OpenAI function calling: https://developers.openai.com/api/docs/guides/function-calling
- OpenAI Structured Outputs supported schemas: https://developers.openai.com/api/docs/guides/structured-outputs
- Anthropic define tools: https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools
- Anthropic strict tool use: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use
- Anthropic structured outputs and schema limits: https://platform.claude.com/docs/en/build-with-claude/structured-outputs

## Decision Status

Every entry contains its status and the concrete decision that is locked or still needs to be locked.

1. Product vocabulary

   **Status: Locked**

   **Locked decision:** Product language, TypeScript APIs, route state, and policy code use `docked`, `floating`, `main chat`, and `bench surface`. There are no separate product aliases for the two Bench chat modes.

2. Bench ownership model

   **Status: Locked**

   **Locked decision:** Bench is route-owned state. The parent Bench route is the lifecycle boundary and owns the canonical layout mode, active child registration, context-provider coordination, and open/closed lifecycle. Each child Bench route owns its surface-specific state and registers one target and context provider with the parent. Switching child routes replaces that registration without closing Bench; leaving the parent route closes Bench. No independent global Bench store owns live Bench state.

   **Locked API:** `BenchRouteContextValue` exposes `state`, `setMode`, `setFloatingChatState`, `registerSurface`, and `flushContext`. `state` contains the active directory, target, mode, semantic layout profile, docked chat width, floating rectangle, and floating chat substate. The parent route owns live geometry and minimization; durable preferences live outside the route runtime.

3. Mode persistence policy

   **Status: Locked**

   **Locked decision:** An explicit user mode change persists in durable local application settings, globally by surface family, using `BenchModePreferenceKey`. It survives Bench close/reopen, session and workspace changes, and application restarts. Reading, whiteboard, markdown, and generic file each have a key; every artifact kind has its own `artifact:<kind>` key. Entering Bench from main chat resolves mode in this order:
   - explicit request mode;
   - saved user preference for the target's surface family;
   - target default mode; then
   - docked system fallback.

   Agent actions, auto-open policy, route restoration, responsive corrections, and target defaults never overwrite the user's preference.

   **Locked API:** `BenchPresentationPreferenceStore.read()` returns the global preferences and `setMode({ target, mode })` writes the mode under the target's centralized `BenchModePreferenceKey`. Only `setMode({ origin: "user" })` invokes that write.

   When Bench is already open, `mode: "policy"` preserves the current live mode across target changes. Saved preferences and target defaults are not re-applied until Bench is entered from closed state. An explicit `mode: "docked" | "floating"` request may switch the live mode for that open operation, but it still does not write a user preference unless it came from `setMode({ origin: "user" })`.

   **Implementation status:** Implemented through the centralized open resolver. Route search stores only the resolved live mode; target changes through `mode: "policy"` preserve the current live mode while Bench remains open.

4. Open request API

   **Status: Locked**

   **Locked decision:** Every deterministic open uses:

   ```ts
   type BenchOpenRequest = {
     directory: string
     target: BenchTarget
     mode: "policy" | "docked" | "floating"
     autoOpen: BenchAutoOpenIdentity | null
   }
   ```

   `autoOpen: null` is an ordinary open. A non-null value contains the auto-open `policyID` and deduplication `eventKey`. Caller source and generic reason enums are excluded because current policy does not use them.

   The pure resolver returns `BenchOpenDecision`: ignore or open, semantic mode, layout profile, geometry preserve/reset directives, and a diagnostic policy id. Routes, pixel values, transitions, animations, and styling are handled by adapters after policy resolution.

5. Target-to-default-mode policy

   **Status: Locked**

   **Locked decision:** One exhaustive `resolveBenchSurfaceDefaults(target)` function maps every `BenchTarget` to a semantic default mode and one of the current layout profiles: `bench-first` or `balanced`. Callers and agents cannot supply a profile. Generic artifact opens use artifact-kind defaults. Artifact instance metadata is excluded from the generic request; the existing full-size HTML-widget detector may use viewport metadata only to produce the `fullscreen-html-widget` auto-open identity.

   **Locked default mapping:**

   ```ts
   const benchSurfaceDefaults = {
     reading: { mode: "docked", layoutProfile: "balanced" },
     markdown: { mode: "docked", layoutProfile: "bench-first" },
     file: { mode: "docked", layoutProfile: "bench-first" },
     whiteboard: { mode: "floating", layoutProfile: "bench-first" },
     "artifact:mermaid": { mode: "docked", layoutProfile: "bench-first" },
     "artifact:html-widget": { mode: "floating", layoutProfile: "bench-first" },
     "artifact:figure": { mode: "docked", layoutProfile: "bench-first" },
     "artifact:freeform-figure": { mode: "docked", layoutProfile: "bench-first" },
     "artifact:media-presentation": {
       mode: "floating",
       layoutProfile: "bench-first",
     },
     "artifact:question-set": { mode: "docked", layoutProfile: "balanced" },
     "artifact:flashcard-deck": { mode: "docked", layoutProfile: "balanced" },
   } satisfies Record<BenchModePreferenceKey, BenchSurfaceDefaults>
   ```

   Rationale: reading, question sets, and flashcards benefit from stable side-by-side chat. Markdown, generic files, diagrams, and figures need more Bench width but still work well with docked chat. Whiteboard, HTML widgets, and media presentations need maximum inspectable surface area and pair naturally with minimizable floating chat.

6. Auto-open authority

   **Status: Locked**

   **Locked decision:** Auto-open events enter the same `BenchOpenRequest` and `resolveBenchOpenPolicy` path as ordinary opens. Current policy identities are `whiteboard` and `fullscreen-html-widget`, each paired with a required `eventKey`. Suppression is checked before navigation. Auto-open detectors identify candidate events; they do not choose routes, pixels, layout profiles, transitions, or user-preference writes.

   Auto-open authority is conservative:
   - may open Bench from main chat or any closed Bench state;
   - must do nothing when the user has suppressed the same policy event;
   - must ignore when Bench already shows the same target;
   - must not replace a different active Bench target;
   - must not switch docked/floating mode while Bench is already open; and
   - when blocked by an active different target, may expose only a suggestion, unread marker, or tool-result affordance.

   This applies to whiteboard creation, full-size HTML widgets, and future auto-open producers.

   **Implementation status:** Implemented. `BenchAutoOpen` identifies candidates and sends them through `useOpenBench`; `resolveBenchOpenPolicy` owns replacement, suppression, and same-target behavior.

7. Docked sizing

   **Status: Locked**

   **Locked decision:** Initial docked sizing comes from the semantic layout profile selected by target policy. `resolveBenchLayoutDefaults({ profile, viewport })` converts the profile into initial docked chat width, chat min/max, and minimum remaining Bench width. Callers, agents, and child surfaces do not supply these values. User dragging updates live route-owned geometry without changing the target default.

   First-pass numeric defaults:
   - `balanced`: default chat width `480px`, min chat width `320px`, max chat width `55vw`, min Bench width `320px`;
   - `bench-first`: default chat width `380px`, min chat width `320px`, max chat width `42vw`, min Bench width `480px`;
   - if the viewport cannot satisfy both chat min and Bench min, the adapter clamps inside the available width without overflowing.

   Geometry persistence is route-runtime-only:
   - preserve user-resized docked width while the parent Bench route remains mounted;
   - preserve it across Bench target changes in the same visit;
   - preserve it when switching away from docked and then back during the same visit;
   - reset to the selected profile default after leaving Bench; and
   - do not persist docked width across app restarts.

   **Implementation status:** Implemented. Docked width is route-runtime state owned by the parent Bench route. The Bench layout path no longer persists docked geometry to `localStorage`.

8. Floating sizing and placement

   **Status: Locked**

   **Locked decision:** Initial floating size and position come from the same semantic layout profile selected by target policy. `resolveBenchLayoutDefaults({ profile, viewport })` returns the initial rectangle, minimum dimensions, safe-area handling, and viewport margin. Callers, agents, and child surfaces do not supply dimensions or coordinates. User dragging and resizing update live route-owned geometry.

   First-pass numeric defaults:
   - shared viewport margin: `24px`;
   - shared titlebar safe-top handling from the mounted Bench container;
   - `balanced`: width ratio `0.42`, height ratio `0.62`, preferred width `560px..700px`, preferred height `560px..720px`, min size `440px x 460px`, narrow fallback min `320px x 360px`;
   - `bench-first`: width ratio `0.34`, height ratio `0.54`, preferred width `440px..560px`, preferred height `460px..620px`, min size `360px x 380px`, narrow fallback min `300px x 320px`;
   - default position: lower-right biased, clamped inside the Bench container and below the titlebar safe area.

   Geometry persistence is route-runtime-only:
   - preserve user-moved and resized floating rectangle while the parent Bench route remains mounted;
   - preserve it across Bench target changes in the same visit;
   - preserve it when switching away from floating and then back during the same visit;
   - reset to the selected profile default after leaving Bench; and
   - do not persist floating geometry across app restarts.

   **Implementation status:** Implemented. Floating geometry is route-runtime state owned by the parent Bench route and is preserved across target changes while the parent route remains mounted.

9. Floating minimized behavior

   **Status: Locked**

   **Locked decision:** Floating chat supports minimization as a temporary substate of floating mode.

   Locked semantics:
   - minimization is available only when `mode` is `"floating"`;
   - minimized means the floating chat window is hidden and replaced by a small restore affordance, not composer-only chat;
   - the user can minimize and restore manually;
   - minimization is route-runtime state only;
   - minimization is not persisted, remembered, target-defaulted, auto-open-controlled, or agent-controlled;
   - minimization is preserved across target changes while the parent Bench route remains mounted;
   - leaving Bench resets it to `"open"`;
   - switching to docked clears minimization to `"open"`; and
   - Bench context and `bench_read_context` are unaffected by whether floating chat is minimized.

10. Transition model

    **Status: Locked**

    **Locked decision:** Transition semantics are derived after policy by `classifyBenchTransition({ previous, next })`, which returns `enter`, `exit`, `replace`, `change-mode`, `replace-and-change-mode`, or `none`. Transition type, motion, and styling are not fields in the open request or policy decision.

    **Locked transition behavior:**
    - main chat -> docked;
    - docked -> main chat;
    - main chat -> floating;
    - floating -> main chat;
    - docked -> floating; and
    - floating -> docked.

    - Main chat -> docked: chat conversation remains visually continuous and morphs into the docked chat panel; Bench surface enters as the new primary surface with a short fade/clip reveal. Sidebar exit is owned by decision 11.
    - Docked -> main chat: reverse the above; chat conversation expands back to main chat, Bench surface fades/clips out, and sidebar re-entry is owned by decision 11.
    - Main chat -> floating: Bench surface enters full width; chat conversation becomes the floating chat window with a short opacity/scale/translate entrance. Floating chrome may fade in with the window.
    - Floating -> main chat: floating chat resolves back to main chat; Bench surface exits. If exact visual continuity is too fragile, preserve continuity for the conversation content and let floating chrome fade/scale out.
    - Docked -> floating: in-route mode change; Bench expands to full width while chat detaches into the floating rectangle. Use transform/opacity motion, not route navigation.
    - Floating -> docked: in-route mode change; floating chat docks into the side panel and minimization clears to `open`.
    - Bench target replace without mode change: preserve chat geometry and replace only the Bench surface with a restrained crossfade/clip transition.

    Motion defaults: keep route transitions around `240ms`, use the existing cubic-bezier curve, prefer transform/opacity/clip over animating layout properties, and respect `prefers-reduced-motion` with near-instant movement.

    **Implementation status:** Implemented as a pure `classifyBenchTransition` semantic classifier plus a route view-transition adapter. Route enter, exit, and target replacement map to existing Bench view-transition names. In-route docked/floating mode changes are handled by the mounted Bench layout rather than by the route adapter.

11. Left sidebar behavior during Bench transitions

    **Status: Out of scope for now**

    **Locked fact from current routing:** The left chat/library sidebar is not part of the mounted Bench route. Normal chat renders `DirectoryChatShell` with `ChatLeftSidebar`; Bench renders `DirectoryChatBenchPageLayout` directly. Therefore the sidebar does not affect Bench geometry after the route transition completes.

    **Out of scope for now:** Dedicated sidebar transition choreography is motion polish, not a blocking Bench mode API decision. Implementation can use the current root transition behavior until the animation pass explicitly revisits:
    - when entering Bench from chat with the sidebar open, whether the sidebar gets its own view-transition name or remains part of the root transition;
    - whether it fades, clips, or translates out before/with the chat conversation morph;
    - whether the main chat conversation expands from the post-sidebar content column or from the full window;
    - whether the transition differs when the sidebar begins closed;
    - whether leaving Bench restores the sidebar to its previous open/closed state; and
    - how this synchronizes with `buddy-chat-conversation` and `buddy-bench-surface` transitions.

    **Implementation note:** Current transition CSS names `buddy-chat-conversation` and `buddy-bench-surface`, plus root. There is no dedicated sidebar transition name today, so the sidebar disappearance is not centrally controlled.

12. Explorer relationship

    **Status: Locked**

    **Locked fact from current code:** The project explorer is currently a normal chat right-sidebar panel via `ProjectFileExplorerPanel`, not a Bench child route. Generic file preview state is owned by `workspace-file-panel-store`. Bench also has a `file` target and route, but the current primary file-open plan sends supported generic files to the workspace panel, Markdown files to Markdown Bench, and reading-capable files to reading mode.

    **Locked decision:** Explorer remains chat-route chrome, not a Bench surface. Concrete file opens must never queue an invisible right-sidebar state while Bench is mounted.

    Exact behavior:
    - when Bench is open and a concrete file-open plan resolves to `workspace-panel`, route to the existing Bench `file` target;
    - Markdown files continue to route to Markdown Bench;
    - reading-capable resources continue to route to reading mode;
    - explicit explorer/sidebar actions leave Bench and open main chat with the Files sidebar active;
    - a generic file that can be shown by either the workspace panel or Bench file route uses Bench file route when Bench is already open, and workspace panel when the user is in main chat; and
    - Buddy does not add a Bench-local explorer in this policy pass.

13. Context execution architecture

    **Status: Locked**

    **Locked decision:** Active surfaces publish frontend-authoritative snapshots to an in-memory backend registry keyed by directory and session. The turn prelude and `bench_read_context` read the same snapshot. What is true to the learner must be true to the agent. Synchronization failures are product errors, not stale fallback states.

14. Agent-facing `bench_read_context` API

    **Status: Locked**

    **Locked decision:** The tool reads only the current Bench state and takes an empty object. The model does not provide a target, path, budget, detail level, or cursor.

    Closed Bench returns exactly:

    ```json
    { "status": "closed" }
    ```

    Open Bench returns `status`, `target`, model-readable `metadata`, `content`, actionable `refs`, and operational `hints`.

15. Per-surface context provider contract

    **Status: Locked**

    **Locked decision:** The common provider API is `read(): BenchReadContextOpenOutput`. Providers return useful model-readable dumps and essential identifiers rather than manually normalized block structures. Markdown returns the complete current editor snapshot, including unsaved edits. Whiteboard content remains owned by `whiteboard_read_context`.

    Each surface contract is locked in the `Surface-Specific Contracts` section below. Providers must follow those exact required target identifiers, metadata facts, content dump rules, actionable refs, and operational hints.

    Reading, Markdown, question set, and flashcard providers are frontend-snapshot providers because their useful context includes live UI state. Backend artifact/file reads may enrich snapshots, but they must not replace frontend-visible truth.

16. Reference and truncation policy

    **Status: Locked**

    **Locked decision:** `refs` contain only stable semantic references such as workspace paths, artifact ids, resource ids, URLs, and tool names. Bench does not create custom truncation files or expose model-controlled chunking APIs. Normal OpenCode tool-output limits and saved-output handling own oversized results.

17. Selection context API

    **Status: Out of scope for now**

    **Locked decision:** Selections are explicit prompt-chip context and remain outside `bench_read_context` and the function-calling API.

    **Out of scope for now:** Centralizing the prompt-chip selection API is not required to lock Bench mode or `bench_read_context`. A future selection design should define:
    - selected text or payload;
    - stable selection key;
    - source surface;
    - source identifiers such as path, resource id, or artifact id;
    - optional location metadata;
    - staging, replacement, removal, and prompt-submission behavior; and
    - how the chip is rendered in the composer and serialized to the backend.

18. Selection support by surface

    **Status: Out of scope for now**

    **Locked fact from current code:** Prompt-chip selection context currently supports only `source: "reading" | "markdown"`. Reading and Markdown selections are supported. Other Bench surfaces do not have prompt-chip selection support until they add explicit provider code.

    **Out of scope for now:** Selection support beyond current Reading and Markdown prompt chips is not part of Bench mode v1. A future selection design should decide what selection means for:
    - Mermaid source ranges, rendered labels, or semantic diagram entities;
    - HTML widget DOM text or widget-defined selection;
    - SVG figure labels or semantic regions;
    - generic files and native PDF viewer text;
    - image regions, media time ranges, or transcripts;
    - visible question and choice text;
    - visible flashcard front/back text; and
    - whiteboard elements through the whiteboard domain API.

    Explicitly define hidden-content rules for question results and unrevealed flashcard answers.

19. Context attachment policy

    **Status: Locked**

    **Locked decision:** While Bench is open, attach a concise, deduped prose projection containing relevant identity, location, and immediate live state. Emit no Bench prelude while closed. Full content remains callable through `bench_read_context`.

    The prelude is a progressive-disclosure summary of the same frontend-authoritative snapshot, not a separate context source or JSON payload.

20. Agent-facing `bench_present` API

    **Status: Locked**

    **Locked decision:** The agent-facing tool is `bench_present`. It presents stable targets the model can realistically identify: workspace files by path, prepared reading resources/books by resource id or alias, and the current session whiteboard. It can also close Bench. It does not expose latest-result lookup, generic artifact ids, chat mode control, route construction, layout profile selection, pixel geometry, transition policy, minimization, or user-preference writes.

    `bench_present` does not create or edit content. Domain tools create files, artifacts, boards, slides, and other content. This tool only asks Bench to show an existing target.

    **Locked strict-schema-compatible input:**

    ```ts
    type BenchPresentAction =
      | "present_file"
      | "present_resource"
      | "present_whiteboard"
      | "close"

    type BenchPresentInput = {
      action: BenchPresentAction
      path: string | null
      resourceKey: string | null
    }
    ```

    **Locked Zod input schema:**

    ```ts
    const BenchPresentInputSchema = z
      .object({
        action: z
          .enum(["present_file", "present_resource", "present_whiteboard", "close"])
          .describe(
            "What to show on Bench. Use present_file for a workspace file path, present_resource for a prepared reading resource/book by resource id or alias, present_whiteboard for the current session whiteboard, and close only when the user asks to close Bench.",
          ),
        path: z
          .string()
          .min(1)
          .nullable()
          .describe(
            "Workspace-relative file path. Required only for present_file. Must be null for every other action. Do not invent paths.",
          ),
        resourceKey: z
          .string()
          .min(1)
          .nullable()
          .describe(
            "Prepared reading resource id or alias, usually copied from prepare_resource output. Required only for present_resource. Must be null for every other action. Do not invent resource ids or aliases.",
          ),
      })
      .strict()
      .superRefine(validateBenchPresentInput)
    ```

    Cross-field rules:
    - `action: "present_file"` requires `path` and requires `resourceKey: null`;
    - `action: "present_resource"` requires `resourceKey` and requires `path: null`;
    - `action: "present_whiteboard"` requires `path: null` and `resourceKey: null`;
    - `action: "close"` requires `path: null` and `resourceKey: null`; and
    - unsupported field combinations fail validation before routing.

    Validation shape:

    ```ts
    function validateBenchPresentInput(
      input: BenchPresentInput,
      ctx: z.RefinementCtx,
    ): void {
      if (input.action === "present_file") {
        if (input.path === null) {
          ctx.addIssue({
            code: "custom",
            path: ["path"],
            message: "path is required when action is present_file.",
          })
        }
        if (input.resourceKey !== null) {
          ctx.addIssue({
            code: "custom",
            path: ["resourceKey"],
            message: "resourceKey must be null when action is present_file.",
          })
        }
        return
      }

      if (input.action === "present_resource") {
        if (input.resourceKey === null) {
          ctx.addIssue({
            code: "custom",
            path: ["resourceKey"],
            message: "resourceKey is required when action is present_resource.",
          })
        }
        if (input.path !== null) {
          ctx.addIssue({
            code: "custom",
            path: ["path"],
            message: "path must be null when action is present_resource.",
          })
        }
        return
      }

      if (input.path !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["path"],
          message: "path must be null unless action is present_file.",
        })
      }
      if (input.resourceKey !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["resourceKey"],
          message: "resourceKey must be null unless action is present_resource.",
        })
      }
    }
    ```

    Runtime mapping:
    - `present_file`: validate the workspace-relative path, then open `{ type: "markdown", path }` for editable Markdown paths or `{ type: "file", path }` for other supported file paths.
    - `present_resource`: resolve `resourceKey` with the resource registry. `resourceKey` may be the `resource_id` or `alias` from `prepare_resource` output. Open `{ type: "reading", path: resource.sourceRelpath, resourceID: resource.id }`.
    - `present_whiteboard`: open `{ type: "whiteboard" }` for the current session.
    - `close`: leave the parent Bench route without deleting content.

    Runtime rules:
    - directory, session, active route, current Bench state, target defaults, layout profile, user preferences, and route construction come from runtime context, not the model;
    - `bench_present` uses the same `BenchOpenRequest`, `resolveBenchOpenPolicy`, layout defaults, and unsaved-work/conflict gates as deterministic UI opens;
    - the model never supplies mode, route, artifact id, resource route state, item id, layout profile, pixel values, transition, animation, suppression state, or user-preference writes;
    - `bench_present` cannot dock, float, minimize, restore, resize, or reposition chat;
    - generated artifact presentation is intentionally excluded from this v1 tool; and
    - tool results report what happened using stable status and reason enums.

    **Locked output:**

    `output` is a JSON string because `createBuddyTool` returns `Tool.ExecuteResult`, whose model-facing `output` field is a string.

    ```ts
    type BenchPresentStatus =
      | "presented"
      | "already_presenting"
      | "closed"
      | "blocked"

    type BenchPresentReason =
      | "presented_file"
      | "presented_resource"
      | "presented_whiteboard"
      | "already_showing_target"
      | "closed_by_request"
      | "file_not_found"
      | "resource_not_found"
      | "unsupported_target"
      | "blocked_by_unsaved_work"
      | "sync_error"

    type BenchPresentOutput = {
      status: BenchPresentStatus
      reason: BenchPresentReason
      target: BenchContextTarget | null
      mode: "docked" | "floating" | null
      message: string
    }
    ```

    `target` is the same `BenchContextTarget` shape used by `bench_read_context`. It is `null` when Bench was closed or when presentation was blocked before a target could be resolved.

    **`createBuddyTool` shape:**

    ```ts
    export const benchPresentTool = createBuddyTool({
      id: "bench_present",
      description: BENCH_PRESENT_DESCRIPTION,
      parameters: BenchPresentInputSchema,
      ui: {
        presentation: "hidden-summary",
        labels: {
          running: "Presenting on Bench",
          idle: "Presented on Bench",
        },
      },
      async execute(params, ctx) {
        const result = await presentOnBench({
          directory: ctx.directory,
          sessionID: String(ctx.sessionID),
          action: params.action,
          path: params.path,
          resourceKey: params.resourceKey,
        })

        return {
          title: "Bench Presentation",
          output: JSON.stringify(result, null, 2),
          metadata: {
            status: result.status,
            reason: result.reason,
            surface: result.target?.type,
            artifactKind: result.target?.artifactKind,
            path: result.target?.path,
            resourceID: result.target?.resourceID,
          },
        }
      },
    })
    ```

21. Generated artifact presentation authority

    **Status: Out of scope for now**

    **Locked for v1:** Generated artifacts are not part of the `bench_present` input API. The model cannot pass generic artifact ids, item ids, "latest" selectors, or refs to `bench_present`.

    **Out of scope for now:** Generated artifact presentation beyond existing deterministic auto-open behavior is not required to lock Bench mode v1. A future design can decide how generated artifacts become presentable on Bench:

    Option A, producer auto-open policy:
    - artifact-producing tools decide whether to open Bench through deterministic policy after successful creation;
    - the model never calls `bench_present` for generated artifacts;
    - simplest model-facing API, but less direct agent control.

    Option B, explicit model-visible handles:
    - producer tools print a copyable `benchHandle` in model-visible output;
    - `bench_present` later adds `action: "present_handle"` plus `handle`;
    - supports older artifacts without requiring the model to know internal ids, but requires handle design and output migration.

    Option C, dedicated artifact-specific presentation tools:
    - each artifact family gets its own domain-aware present/update flow;
    - strongest validation per domain, but increases tool count.

    Do not add a vague `latest`, `ref`, raw `artifactID`, or raw `itemID` parameter unless Buddy first defines exactly how the model sees and copies that identifier.

22. Unsaved-work and conflict policy

    **Status: Locked**

    **Locked decision:** Bench close and target replacement must pass a centralized leave guard before navigation. The guard protects live user work; it does not block read-only previews merely because they are loading.

    ```ts
    type BenchLeaveIntent = "close" | "replace-target"
    type BenchLeaveOrigin = "user" | "agent" | "auto-open" | "route"

    type BenchLeaveGuardInput = {
      intent: BenchLeaveIntent
      origin: BenchLeaveOrigin
      current: BenchTarget
      next: BenchTarget | null
    }

    type BenchLeaveGuardResult =
      | { status: "allow" }
      | {
          status: "block"
          reason:
            | "dirty"
            | "saving"
            | "conflict"
            | "save_error"
            | "sync_error"
          message: string
        }
    ```

    The frontend leave guard uses route-level `BenchTarget`, not `BenchContextTarget`. Rich visible state such as dirty/conflict/save status stays owned by the registered surface guard. Backend `bench_present` separately preflights the synchronized `BenchContextTarget` snapshot before emitting a presentation result.

    Guard policy:
    - clean surfaces allow close and replacement;
    - read-only file, reading, Mermaid, HTML widget, figure, freeform figure, media presentation, question set, and flashcard surfaces allow close and replacement while loading unless their provider reports dirty, conflict, save error, or sync error;
    - dirty Markdown attempts one autosave before leaving;
    - Markdown already saving waits for the in-flight save to settle, then allows if clean;
    - Markdown save error or conflict blocks close and replacement until the user resolves it with the Markdown surface controls;
    - frontend snapshot synchronization failure blocks agent and auto-open replacement because Buddy cannot prove what the learner currently sees;
    - user-triggered direct navigation may render the current surface's visible error or resolution UI, but must not silently discard dirty content;
    - auto-open never overrides a blocked leave guard; it is ignored for that event and may be retried on a later event;
    - `bench_present` preflights the synchronized Bench snapshot and returns `status: "blocked"` with `reason: "blocked_by_unsaved_work"` plus a specific message when the current snapshot reports protected Markdown dirty, saving, conflict, save error, or sync error state;
    - the frontend leave guard remains the final authority immediately before navigation and can still block a presentation action if browser-owned autosave or conflict resolution fails after the backend tool result; and
    - forced discard/force close is not part of Bench mode v1.

23. Mobile and narrow-width behavior

    **Status: Moot for v1**

    **Decision:** Buddy does not support a mobile Bench product target in v1. There is no mobile-only stacked Bench mode, no mobile-specific agent/control API, and no mobile-specific context shape.

    Narrow desktop behavior is handled only by layout clamping and fallback minimum sizes from decisions 7 and 8. Context and control APIs expose the semantic desktop modes: `docked` and `floating`.

24. Diagnostics

    **Status: Out of scope for now**

    **Locked fact:** Every `BenchOpenDecision` includes one typed diagnostic branch id from `BenchIgnorePolicyID` or `BenchResolvedOpenPolicyID`. Context diagnostics already have a stored snapshot revision and explicit synchronization failures.

    **Out of scope for now:** Diagnostics are not blocking for Bench mode v1 because they do not change product behavior, layout policy, context shape, or agent-facing tool inputs. A future developer-observability pass can define how developers inspect:
    - why Bench opened;
    - which target and mode were requested;
    - which policy id resolved the request;
    - the auto-open policy id and event key when present;
    - current versus default mode;
    - user overrides and suppression state;
    - snapshot revision and synchronization failures; and
    - the current provider and context status.

## Locked `bench_read_context` Tool API

This is the locked agent-facing API for reading Bench context. It supersedes the earlier candidate `detail`/`maxChars`/`cursor` shapes.

The tool should answer two questions:

1. What is the user currently looking at on Bench?
2. What content or context dump can the model use right now?

Selections remain separate. User-selected reading or markdown text should continue to flow through prompt chips, not through this function-calling API.

The selection API still needs its own central design. Today, reading and markdown selections are supported, but the behavior is scattered across reader/editor components and prompt-part helpers. Bench should eventually have a single selection contract that each surface opts into or explicitly rejects.

Open selection questions:

- Reading: keep current selected text plus location metadata.
- Markdown: keep current selected text plus path/version/heading metadata.
- Mermaid: decide whether selection means rendered diagram labels, source text, or no selection support.
- HTML widgets: decide whether selection can cross iframe boundaries, whether widget DOM selection is allowed, and whether widget-owned private state should be excluded.
- SVG figures: decide whether selectable labels should become prompt chips or whether figures remain inspectable only through artifact/source refs.
- Generic files/PDFs/media: decide whether browser/native viewer selection is observable enough to support reliably.
- Question sets and flashcards: decide whether selecting visible prompt/card text should create prompt chips, and whether hidden answers/results are excluded until visible.

Domain tools remain separate. For example, `bench_read_context` can say that the whiteboard is currently visible, but precise board state should still come from `whiteboard_read_context`.

### Agent-Facing Input

The model should not choose budgets, cursors, paths, or targets. The tool reads the current active Bench surface.

```ts
type BenchReadContextInput = Record<string, never>
```

```ts
const BenchReadContextInputSchema = z.object({}).strict()
```

### Agent-Facing Output

`output` is a JSON string because `createBuddyTool` returns `Tool.ExecuteResult`, whose model-facing `output` field is a string.

```ts
type BenchReadContextClosedOutput = {
  status: "closed"
}

type BenchReadContextOpenOutput = {
  status: "open"
  target: BenchContextTarget
  metadata: string[]
  content: string
  refs: BenchContextRef[]
  hints: string[]
}

type BenchReadContextOutput =
  | BenchReadContextClosedOutput
  | BenchReadContextOpenOutput
```

When Bench is closed, the complete tool result is exactly `{ "status": "closed" }`. It must not include a synthetic target, null identifiers, metadata, content, refs, or hints.

`metadata` is deliberately a list of model-readable facts instead of a highly normalized block tree. Examples: MIME type, file size, current page, artifact title, current question number, current card phase, widget viewport, saved-vs-dirty state.

`content` is the useful model-readable Bench dump. It can be complete markdown editor text, visible reading context, sanitized DOM, artifact source, or a plain statement that the content must be inspected through another file/tool. Bench does not pre-truncate this field through a model-controlled budget or cursor; native OpenCode tool-output limits handle oversized serialized results.

`refs` are actionable semantic references. They duplicate the most important machine identifiers in a model-friendly list so the agent can see which file, artifact, resource, URL, or tool to inspect next.

`hints` are short operational notes, such as "If the active model supports vision, use the read tool on this file" or "Use `whiteboard_read_context` for board elements and layout."

### Target Shape

```ts
type BenchContextSurfaceType =
  | "reading"
  | "markdown"
  | "file"
  | "whiteboard"
  | "artifact"

type BenchContextArtifactKind =
  | "none"
  | "mermaid"
  | "html-widget"
  | "figure"
  | "freeform-figure"
  | "media-presentation"
  | "question-set"
  | "flashcard-deck"

type BenchContextStatus =
  | "ready"
  | "loading"
  | "dirty"
  | "error"
  | "unavailable"

type BenchContextTarget = {
  type: BenchContextSurfaceType
  artifactKind: BenchContextArtifactKind
  title: string | null
  workspaceRoot: string
  path: string | null
  absolutePath: string | null
  resourceID: string | null
  artifactID: string | null
  itemID: string | null
  route: string
  status: BenchContextStatus
}
```

```ts
type BenchContextRefKind =
  | "file"
  | "artifact"
  | "resource"
  | "tool"
  | "url"

type BenchContextRef = {
  kind: BenchContextRefKind
  value: string
  note: string
}
```

Rules:

- `path` is workspace-relative when the Bench surface is backed by a workspace file.
- `absolutePath` is the machine path when the agent can inspect the underlying file.
- `artifactID` is set for artifact Bench surfaces.
- `artifactKind` is `"none"` for non-artifact surfaces.
- `itemID` is set only when the Bench surface has an active sub-item, such as a media-presentation item.
- `route` is informational and should not be treated as the only source of identity.
- `refs` must not include custom truncation or snapshot files. If tool output exceeds OpenCode limits, OpenCode injects its own saved-output path.
- `refs` should include only stable semantic references the model can act on: workspace files, artifact ids, resource ids, URLs, and existing tool names.

### Zod Output Schema

```ts
const BenchContextSurfaceTypeSchema = z.enum([
  "reading",
  "markdown",
  "file",
  "whiteboard",
  "artifact",
])

const BenchContextArtifactKindSchema = z.enum([
  "none",
  "mermaid",
  "html-widget",
  "figure",
  "freeform-figure",
  "media-presentation",
  "question-set",
  "flashcard-deck",
])

const BenchContextStatusSchema = z.enum([
  "ready",
  "loading",
  "dirty",
  "error",
  "unavailable",
])

const BenchContextTargetSchema = z.object({
  type: BenchContextSurfaceTypeSchema,
  artifactKind: BenchContextArtifactKindSchema,
  title: z.string().nullable(),
  workspaceRoot: z.string(),
  path: z.string().nullable(),
  absolutePath: z.string().nullable(),
  resourceID: z.string().nullable(),
  artifactID: z.string().nullable(),
  itemID: z.string().nullable(),
  route: z.string(),
  status: BenchContextStatusSchema,
}).strict()

const BenchContextRefSchema = z.object({
  kind: z.enum(["file", "artifact", "resource", "tool", "url"]),
  value: z.string(),
  note: z.string(),
}).strict()

const BenchReadContextClosedOutputSchema = z.object({
  status: z.literal("closed"),
}).strict()

const BenchReadContextOpenOutputSchema = z.object({
  status: z.literal("open"),
  target: BenchContextTargetSchema,
  metadata: z.array(z.string()),
  content: z.string(),
  refs: z.array(BenchContextRefSchema),
  hints: z.array(z.string()),
}).strict()

const BenchReadContextOutputSchema = z.union([
  BenchReadContextClosedOutputSchema,
  BenchReadContextOpenOutputSchema,
])
```

The union is an output-validation schema serialized inside the tool result. It is not the function-calling input schema, so it does not create the root-union compatibility problem described in the agent-tool constraints.

### Locked Output Semantics

Closed Bench has one exact representation:

```ts
const closedBenchContext = {
  status: "closed",
} as const
```

Open providers must fill the output using the same rules:

- `status` is `"open"`.
- `target` contains identity and location. This is the canonical machine-readable part.
- `metadata` contains concise facts in `key: value` lines. Prefer boring strings over nested structures.
- `content` contains the best currently available model-readable dump of what is on Bench.
- `refs` contains actionable references only. Do not put decorative labels, duplicate prose, or truncation files here.
- `hints` contains operational guidance for the agent.

Required `refs`:

- Workspace-backed surfaces must include a `file` ref with the workspace-relative path.
- Artifact surfaces must include an `artifact` ref with the artifact id.
- Reading surfaces should include a `resource` ref when a resource id is known.
- Whiteboard must include a `tool` ref for `whiteboard_read_context`.
- Media or iframe surfaces may include a `url` ref when that URL is already part of the artifact/view model.

### Surface-Specific Contracts

These contracts are locked by decision 15. `required` means the corresponding field in `BenchContextTarget` must be non-null for that surface. Fields not listed as required still exist on `BenchContextTarget`, but may be `null`.

Reading, Markdown, question set, and flashcard providers must be frontend-snapshot providers because their useful context includes live UI state. Backend artifact/file reads may enrich the snapshot, but must not replace frontend-visible truth.

```ts
const readingBenchContextContract = {
  status: "open",
  target: {
    type: "reading",
    artifactKind: "none",
    required: ["title", "path", "absolutePath", "route", "status"],
    optional: ["resourceID"],
  },
  metadata: [
    "resource_status: <status>",
    "resource_alias: <alias>",
    "reader_status: <loading|ready|error|unsupported|preparing>",
    "location_label: <label>",
    "page_label: <label>",
    "toc_label: <label>",
    "cfi: <cfi>",
    "index: <index>",
    "fraction: <fraction>",
  ],
  content:
    "Current visible reading context from the frontend snapshot: current passage, visible start/end, reading trail, and annotation summary. Do not dump the full book.",
  refs: [
    { kind: "file", value: "<workspace-relative-path>", note: "Reading file on Bench." },
    { kind: "resource", value: "<resource-id>", note: "Prepared reading resource id when known." },
  ],
  hints: ["Use resource or file tools for broader book context."],
}
```

```ts
const markdownBenchContextContract = {
  status: "open",
  target: {
    type: "markdown",
    artifactKind: "none",
    required: ["title", "path", "absolutePath", "route", "status"],
  },
  metadata: [
    "dirty: <true|false>",
    "version: <version>",
    "save_state: <ready|saving|error|conflict>",
    "theme_mode: <light|dark|print>",
    "font_scale: <number>",
  ],
  content: "Current editor snapshot, including unsaved edits.",
  refs: [
    { kind: "file", value: "<workspace-relative-path>", note: "Markdown file on Bench." },
  ],
  hints: ["Content may differ from the saved file when status is dirty."],
}
```

```ts
const fileBenchContextContract = {
  status: "open",
  target: {
    type: "file",
    artifactKind: "none",
    required: ["title", "path", "absolutePath", "route", "status"],
  },
  metadata: [
    "mime_type: <mime>",
    "size_bytes: <bytes>",
    "render_mode: <image|audio|video|pdf|file>",
  ],
  content: "Plain statement of the visible file preview. Do not inline binary or media bytes.",
  refs: [
    { kind: "file", value: "<workspace-relative-path>", note: "File currently visible on Bench." },
    { kind: "url", value: "<raw-url>", note: "Raw file URL when available." },
  ],
  hints: [
    "Use file/read/PDF/image-capable tools to inspect actual file content.",
  ],
}
```

```ts
const whiteboardBenchContextContract = {
  status: "open",
  target: {
    type: "whiteboard",
    artifactKind: "none",
    required: ["route", "status"],
  },
  metadata: ["surface: whiteboard"],
  content:
    "State that the whiteboard is visible on Bench. Do not include board elements here.",
  refs: [
    {
      kind: "tool",
      value: "whiteboard_read_context",
      note: "Reads precise board elements, layout, visible text, and learner edits.",
    },
  ],
  hints: ["Whiteboard board state is domain context, not generic Bench context."],
}
```

```ts
const mermaidBenchContextContract = {
  status: "open",
  target: {
    type: "artifact",
    artifactKind: "mermaid",
    required: ["title", "artifactID", "route", "status"],
  },
  metadata: [
    "diagram_type: <type>",
    "alt: <alt>",
    "source_hash: <hash>",
    "render_status: <rendered|failed|missing>",
    "auto_repair_status: <status>",
  ],
  content: "Mermaid source plus render or error summary when available.",
  refs: [
    { kind: "artifact", value: "<artifact-id>", note: "Mermaid artifact on Bench." },
  ],
  hints: ["Mermaid source is the canonical inspectable content."],
}
```

```ts
const htmlWidgetBenchContextContract = {
  status: "open",
  target: {
    type: "artifact",
    artifactKind: "html-widget",
    required: ["title", "artifactID", "route", "status"],
  },
  metadata: [
    "viewport: <viewport>",
    "source_hash: <hash>",
    "source_path: <path>",
    "warnings: <count-or-summary>",
    "runtime_url: <url>",
    "source_url: <url>",
  ],
  content:
    "Widget title, description, warnings, and source HTML when available from artifact source. Do not promise live iframe DOM.",
  refs: [
    { kind: "artifact", value: "<artifact-id>", note: "HTML widget artifact on Bench." },
    { kind: "url", value: "<runtime-url>", note: "Widget runtime URL." },
    { kind: "url", value: "<source-url>", note: "Widget source URL." },
  ],
  hints: ["Live iframe state is unavailable unless a future frontend DOM snapshot provider is added."],
}
```

```ts
const figureBenchContextContract = {
  status: "open",
  target: {
    type: "artifact",
    artifactKind: "figure",
    required: ["title", "artifactID", "route", "status"],
  },
  metadata: [
    "mime_type: image/svg+xml",
    "alt: <alt>",
    "caption: <caption>",
    "raw_url: <url>",
  ],
  content: "Figure title, description, alt, and caption. Do not inline SVG by default.",
  refs: [
    { kind: "artifact", value: "<artifact-id>", note: "Figure artifact on Bench." },
    { kind: "url", value: "<raw-svg-url>", note: "Raw SVG URL when known." },
  ],
  hints: ["Use the raw SVG URL or artifact read path when exact visual source is needed."],
}
```

```ts
const freeformFigureBenchContextContract = {
  status: "open",
  target: {
    type: "artifact",
    artifactKind: "freeform-figure",
    required: ["title", "artifactID", "route", "status"],
  },
  metadata: [
    "mime_type: image/svg+xml",
    "alt: <alt>",
    "caption: <caption>",
    "raw_url: <url>",
  ],
  content:
    "Freeform figure title, description, alt, and caption. Do not inline SVG by default.",
  refs: [
    { kind: "artifact", value: "<artifact-id>", note: "Freeform figure artifact on Bench." },
    { kind: "url", value: "<raw-svg-url>", note: "Raw SVG URL when known." },
  ],
  hints: ["Use the raw SVG URL or artifact read path when exact visual source is needed."],
}
```

```ts
const mediaPresentationBenchContextContract = {
  status: "open",
  target: {
    type: "artifact",
    artifactKind: "media-presentation",
    required: ["title", "artifactID", "itemID", "route", "status"],
  },
  metadata: [
    "layout: <single|gallery|deck|list>",
    "item_filename: <filename>",
    "media_kind: <image|pdf|presentation|document|spreadsheet|video|audio|archive|other>",
    "render_mode: <image|audio|video|pdf|file>",
    "mime_type: <mime>",
    "availability: <available|missing|error>",
    "size_bytes: <bytes>",
    "modified_at: <timestamp>",
  ],
  content: "Visible media item summary only. Do not inline image, audio, video, or PDF bytes.",
  refs: [
    { kind: "artifact", value: "<artifact-id>", note: "Media presentation artifact on Bench." },
    { kind: "file", value: "<workspace-relative-path>", note: "Visible media item path when known." },
    { kind: "url", value: "<raw-url>", note: "Raw visible media item URL." },
  ],
  hints: ["Use file/read/PDF/image-capable tools to inspect the visible media item."],
}
```

```ts
const questionSetBenchContextContract = {
  status: "open",
  target: {
    type: "artifact",
    artifactKind: "question-set",
    required: ["title", "artifactID", "route", "status"],
  },
  metadata: [
    "group_type: <type>",
    "question_count: <count>",
    "view_mode: <wizard|list>",
    "current_step: <step>",
    "result_state: <not-submitted|submitted|error>",
  ],
  content:
    "Only what the learner can see: visible prompt(s), visible choices, selected choices, and submitted result, explanations, and rationales only after they are visible in UI.",
  refs: [
    { kind: "artifact", value: "<artifact-id>", note: "Question set artifact on Bench." },
  ],
  hints: ["Do not expose correctness, rationales, or explanations before submission visibility."],
}
```

```ts
const flashcardDeckBenchContextContract = {
  status: "open",
  target: {
    type: "artifact",
    artifactKind: "flashcard-deck",
    required: ["title", "artifactID", "route", "status"],
  },
  metadata: [
    "review_phase: <loading|card|complete|no-due|error>",
    "revealed: <true|false>",
    "cards_reviewed: <count>",
    "card_id: <card-id>",
    "note_id: <note-id>",
    "template_idx: <index>",
  ],
  content:
    "Only current visible review state. Before reveal: front text or cloze-with-blank. After reveal: visible back or revealed cloze. Loading, no-due, complete, and error phases return that state.",
  refs: [
    { kind: "artifact", value: "<artifact-id>", note: "Flashcard deck artifact on Bench." },
  ],
  hints: ["Do not include hidden answer text until it is revealed."],
}
```

### Provider Shape

Each Bench surface can implement its own provider, but the provider contract should stay narrow.

```ts
type BenchContextProvider = {
  read(): BenchReadContextOpenOutput | Promise<BenchReadContextOpenOutput>
}
```

Examples:

- Reading provider: target identity plus current reading dump already available to the prompt pipeline.
- Markdown provider: target identity plus the current editor snapshot, including unsaved edits.
- File provider: target identity plus MIME/media metadata and a hint to inspect the file path.
- Artifact provider: target identity plus artifact id/kind/item id and source/content when cheap.
- Whiteboard provider: target identity plus a hint to call `whiteboard_read_context` for board state.

### `createBuddyTool` Shape

```ts
export const benchReadContextTool = createBuddyTool({
  id: "bench_read_context",
  description:
    "Read what the learner is currently seeing on Bench. Returns status closed when Bench is closed; otherwise returns the active target, machine refs, metadata, and a model-readable context dump.",
  parameters: BenchReadContextInputSchema,
  ui: {
    presentation: "hidden-summary",
    labels: {
      running: "Reading Bench",
      idle: "Read Bench",
    },
  },
  async execute(_params, ctx) {
    const result = BenchReadContextOutputSchema.parse(
      await readCurrentBenchContext({
        directory: ctx.directory,
        sessionID: String(ctx.sessionID),
      }),
    )

    if (result.status === "closed") {
      return {
        title: "Read Bench",
        output: JSON.stringify(result),
        metadata: {
          benchStatus: "closed",
        },
      }
    }

    return {
      title: "Read Bench",
      output: JSON.stringify(result, null, 2),
      metadata: {
        benchStatus: "open",
        surface: result.target.type,
        artifactKind: result.target.artifactKind,
        path: result.target.path,
        artifactID: result.target.artifactID,
        resourceID: result.target.resourceID,
        surfaceStatus: result.target.status,
      },
    }
  },
})
```

Do not set `metadata.truncated` in this tool. OpenCode wraps native tool output with hard output limits when `metadata.truncated` is absent. If the JSON dump exceeds those limits, OpenCode writes the full output to its truncation file and injects the saved-path hint.

`ingest_full_text` is the exception pattern, not the default Bench pattern. It registers a large output policy because the product wants unusually large tool output to remain inline when possible. `bench_read_context` should not need that behavior unless we later decide Bench snapshots should intentionally bypass normal tool-output limits.
