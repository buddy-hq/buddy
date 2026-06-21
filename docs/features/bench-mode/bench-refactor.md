Deadend Policy: The plan is meant to be exhaustive and complete but some deadends and hurdles can only be encountered while implementation; as map is not the territory. In such situation the agent is free to make a judgement call that preserves the intent and spirit of the plan. But it must document the divergences in bench-refactor.divergences.md.

Closing Policy: If plan is done, dispatch 2 paralel review subagents; one for faithfulness pass and another for review pass. for review use these instrucions added at /Users/prashantbhudwal/Code/buddy/docs/commands/review.md

user comment: as of 0215 local time; the right sidebar toggle does nto work. when calling the bench tool; the tool times out; check the latest taken screenshot on desktop; even after you latest typechecks this is broekn


# Bench Refactor: Problem Statement and Reviewed Plan

## Document purpose

This document is the complete handoff for replacing Buddy's Bench/right-workspace architecture. It contains the verified structural problems, the locked product behavior, the reviewed target architecture, and the execution and validation requirements. The implementer must not rely on chat history or earlier Bench design documents to fill gaps. When an older Bench document conflicts with this document, this document is authoritative for the refactor.

This is an architectural reliability refactor, not a UI or product redesign. Existing coherent behavior must remain intact except where this document explicitly replaces contradictory or undefined behavior.

## Problem statement

Bench is conceptually simple: it presents one file, object, resource, whiteboard, or other notebook-related target in the right workspace, under user or agent control. The current implementation makes that feature fragile because route state, workspace state, component-local state, persistence, lifecycle registries, animations, and streamed chat metadata can advance independently. Effects and timers then attempt to reconcile combinations that should never have been representable.

The problem is not React, Zustand, TanStack Router, or Motion individually. The problem is the absence of one explicit ownership model and one transactional command boundary across those systems.

### Current conflicting authorities

The current implementation distributes live Bench behavior across:

- The URL for target identity and docked/floating mode.
- A global persisted `rightSidebarOpen` value for workspace visibility.
- A per-directory `rightWorkspaceSurfaceByDirectory` value that incorrectly treats Bench, Explorer, and Library as mutually exclusive surfaces.
- Route-local React state that mirrors URL mode and owns layout geometry.
- Component-local selector and suppression state.
- Module-global prompt-flush, context-publication, leave-guard, and auto-open registries.
- Transcript-scanning effects that infer live client commands from completed or streaming tool parts.
- CSS transition events, DOM queries, and fallback timers that participate in navigation sequencing.

These are not equally important sources of truth, but their conflicting writable dimensions are sufficient to create invalid intermediate and persisted states.

## Verified failure modes

### 1. Bench and selectors use the wrong state algebra

`RightWorkspaceSurface = "bench" | "explorer" | "library"` models mutually exclusive surfaces, while the actual product model is orthogonal:

- The route may own one active Bench target.
- The docked workspace may be expanded or collapsed.
- Explorer or Library may be a temporary drawer over that target.
- A successful selection replaces or focuses the single target and closes the drawer.

Because the current type cannot express that relationship directly, components infer the intended result by reconciling route presence, sidebar visibility, active surface, and fallback selector state.

### 2. Invalid combinations are directly representable

The route target, global visibility, and per-directory active surface can be mutated independently. Legal store combinations therefore include an active Bench surface without a Bench route, a closed workspace with an active selector, a Bench route controlled by another directory's global visibility, or an expanded workspace with no intentional content. Consumers resolve these combinations differently, producing flicker and state drift.

### 3. Commands mutate UI state before navigation commits

Bench opening currently activates the workspace before awaiting route navigation. If the navigation is blocked, fails, or is superseded, the URL remains unchanged while Zustand already reports an active workspace. There is no transactional rollback, and fallback selector logic can expose unrelated content.

### 4. Leave protection can execute twice

Programmatic open, replace, and close paths manually invoke the Bench leave guard and then navigate through a route that installs its own router blocker. One semantic transition can therefore invoke the same autosave or dirty-state protection twice. The navigation layer must be the sole protection boundary.

### 5. Chat and Bench are sibling shells

`/$directory/chat` and `/$directory/_bench/*` each instantiate a chat shell. Entering or leaving Bench replaces the shell subtree rather than revealing a stable workspace within one shell. This remounts chat descendants, controller hooks, ref-based deduplication, registrations, and layout instances. Docked/floating branches also place the same Bench outlet at different React tree positions, risking target-local state loss.

### 6. URL mode is mirrored and changed optimistically

Docked/floating mode is derived from the URL, copied into local state, resynchronized by an effect, and also changed locally before navigation completes. Rendering can observe a mode the router has not committed, and moving between conditional layout branches can remount the target.

### 7. Animation participates in semantic correctness

Explicit close currently mutates Zustand, queries a DOM node, waits for a particular CSS property transition, falls back to a timer, and only then navigates. A newer command cannot reliably cancel the old continuation. Correctness consequently depends on CSS property names, duration constants, reduced-motion behavior, and DOM timing. Multiple overlapping Motion, CSS, resizable-panel, and Router View Transition systems further obscure ownership.

### 8. The transcript is used as a client-action bus

`BenchAutoOpen` rescans message parts, derives presentation commands, and uses component-local refs and sets for deduplication. Those dedupe records reset when sibling shells remount. Tool transcript metadata is a durable record, not a reliable live command transport: reconnects, remounts, historical hydration, and streaming updates can cause missed or repeated actions, and the agent can receive a successful tool result before the frontend has actually committed the requested presentation.

### 9. Context publication depends on unstable identities

Bench fallback providers and policy objects can be recreated during ordinary parent renders. Publication effects depend on provider-object identity, so external context reads and writes may run when no semantic target, selector, visibility, session, or surface revision changed. Context publication must be keyed by explicit semantic revisions.

### 10. Lifecycle services live in module-global registries

Prompt flushing, context publishing, leave guards, and auto-open suppression use module-level maps keyed primarily by directory. Although existing identity checks prevent one known stale cleanup from deleting a newer registration, registration gaps and fallback windows still occur during remounts. These services belong to the mounted directory workspace instance and must select registrations by canonical target identity.

### 11. Legacy sidebar writers remain active after the UI moved

The page controller still constructs old right-sidebar props, and teaching/curriculum entrypoints still write legacy tab and visibility state even though the sidebar is no longer rendered. These invisible writers can interfere with the workspace. Teaching editor and curriculum sidebar presentation are intentionally deprecated for now; independently consumed teaching/runtime domain code remains. Diagnostic-only material belongs in Buddy DevTools.

### 12. Transition and policy machinery contains dead dimensions

Bench navigation classifies open, close, and swap transition types, but CSS does not consume those finer type distinctions. The classifier still affects whether a Router View Transition is requested, so it is not entirely inert, but the unused distinctions and geometry directives create misleading conceptual surface area. The final system must retain only modeled dimensions with active consumers.

### 13. Existing tests do not exercise orchestration

Current tests emphasize pure policy functions and isolated store actions. They cannot detect router blocking after optimistic store writes, duplicate guards, subtree remounts, hydration races, stale animation continuations, reconnect delivery, context/action acknowledgment races, or exact browser history behavior. The replacement requires integration tests using a real memory router, real scoped store, controller, broker, and lifecycle registrations.

## Corrected analysis boundaries

The implementer must not act on the following earlier overstatements:

- `BenchAutoOpen` is mounted on both Chat and Bench paths. Its defect is remount-sensitive transcript scanning and local deduplication, not absence from the Bench route.
- Existing registration cleanup compares registration identity and does not blindly clear a newer registration. The remaining problem is transient lifecycle ownership and canonical-target selection.
- Reading-resource linkage, raw preferences, and runtime registries add complexity but are not all equivalent live sources of Bench truth.
- The active selector/surface should not be made durable merely to preserve the old model. Persist only the last drawer and committed visibility as specified below.
- Bench presentation preferences are read on each open call today; their problem is fragmented ownership, not a permanently stale memoized read.
- `open | parked | closed` must not become another stored enum. Parked and visible states are derived from URL target/mode plus committed docked visibility.
- View-transition type classification currently controls transition eligibility even though its finer CSS type labels are unused.

## Required outcome

The refactor is successful only when:

1. Every semantic concept has exactly one owner.
2. Rendering cannot observe an uncommitted target or contradictory workspace projection.
3. Chat and the current Bench target preserve component identity across visibility and mode changes.
4. Every target replacement or exit is guarded exactly once.
5. Animation never authorizes or sequences semantic state.
6. Agent actions are typed, scoped, idempotent, reconnect-safe, and acknowledged only after UI and model context agree.
7. Context publication occurs only for semantic changes.
8. Legacy sidebar state, invisible writers, transcript command effects, and module-global Bench registries are removed.
9. Focused integration tests reproduce the original race classes and prove the replacement invariants.

---

# Bench Architecture Replacement — Reviewed End-to-End Plan

## Summary

Replace the existing Bench/right-sidebar implementation atomically. The final system will have one authority per concept:

- URL: Bench target and docked/floating mode.
- Scoped workspace store: committed visibility, active drawer, pending command, and transient layout.
- Scoped persistence: per-directory visibility and last drawer.
- Global workspace preferences: width and target-family mode preferences.
- Controller: all workspace commands and navigation coordination.
- Router blocker: the only leave-guard execution point.
- Backend broker: typed agent actions and acknowledgments.

The 30-second acknowledgment deadline is a server-side failure bound, not synchronization machinery. Normal synchronization is event-driven, idempotent, reconnect-safe, and contains no polling or UI timers.

## State, Routing, and Rendering

### Canonical model

```ts
type BenchRouteSnapshot =
  | { status: "closed" }
  | {
      status: "open"
      target: BenchTarget
      mode: "docked" | "floating"
    }

type DrawerKind = "explorer" | "library"

type DockedWorkspaceState =
  | { visibility: "collapsed"; drawer: null }
  | {
      visibility: "expanded"
      drawer: DrawerKind | null
    }

type PersistedDirectoryWorkspaceState = {
  visibility: "collapsed" | "expanded"
  lastDrawer: DrawerKind
}

type PendingWorkspaceIntent =
  | {
      kind: "navigation"
      commandID: string
      attemptID: string
      previousProjection: EffectiveWorkspaceProjection
      expectedRoute: BenchRouteSnapshot
      workspaceCommit: DockedWorkspaceState
    }
  | {
      kind: "workspace-only"
      commandID: string
      previousProjection: EffectiveWorkspaceProjection
      workspaceCommit: DockedWorkspaceState
    }
```

`targetKey` is not stored. Derive it from the complete `BenchTarget` through one shared `benchTargetKey(target)` function. Derive `parked`, effective drawer, Bench visibility, and rendered layout. Never store them independently.

Use a pure:

```ts
effectiveWorkspaceProjection(route, committedState, pendingIntent)
```

The projection must:

- Never invent a target or mode before the router commits it.
- Retain `previousProjection` while navigation is pending.
- Apply the pending visibility/drawer commit once the expected route appears.
- Prevent selector, collapsed-panel, and fallback-content flashes between route and store commits.
- Clear only the matching intent on success, failure, blocking, or supersession.
- Resolve a no-target expanded workspace as `drawer ?? lastDrawer ?? "explorer"` without writing that derived drawer back to state.

### Stable route ownership

Use the existing `/$directory` route as the common owner because its only children are Chat and Bench.

- Mount the directory controller, scoped store, blocker, chat shell, chat pane, and Bench host at `/$directory`.
- Render a nested `DirectoryWorkspaceRoot` keyed by the canonical decoded directory. TanStack may reuse the dynamic route component when the parameter changes; the key guarantees a new store, controller, action lease, and lifecycle scope.
- Remove the ineffective route-level `AnimatePresence`.
- Make `/chat` render no second shell.
- Reduce `/_bench` to route validation and its target outlet chain.
- Render that outlet exactly once at the stable Bench host.
- Key only the target boundary by the complete canonical target identity, including revision, item, and view. Exclude mode from the key.
- Implement docked/floating positioning through styling of the same mounted chat and Bench nodes.
- On keyed-root disposal, abort navigation attempts, settle or cancel queued commands, release the active client lease, unsubscribe surface registrations, flush persistence, and prevent every stale continuation from mutating the next directory instance.

### Locked transitions

- Entering Bench pushes one history entry.
- Target replacements and mode changes replace the current history entry.
- Explicit close replaces the Bench entry with `/chat`.
- Back leaves Bench rather than walking targets.
- Docked open/reveal commits expanded.
- Floating is visible regardless of stored docked visibility.
- Floating to docked commits expanded.
- Explicit close commits collapsed.
- Successful selector choice commits expanded with the drawer closed.
- Closing a drawer with a target leaves that target visible.
- Closing a drawer without a target collapses the workspace.
- Blocked navigation preserves the previous target, visibility, and drawer.
- A no-target expanded workspace shows the active drawer, otherwise the last drawer, otherwise Explorer.
- Parked targets remain mounted and leave-protected but publish model-closed context.
- Explicit `bench_present` reveals a parked target.
- Floating mode has no selector access.

## Store, Controller, and Guarding

- Create a vanilla Zustand store once per mounted directory and expose it through context.
- Persist only visibility and `lastDrawer` under a per-directory key.
- Keep drawer state, pending intent, command outcome, registrations, and geometry transient.
- Keep global width and target-family mode preferences in a separate typed preference store.
- Use narrow selectors and synchronous store actions; React effects may only connect external boundaries.

All UI, selector, model, titlebar, and file-opening commands go through one `DirectoryWorkspaceController`.

The controller accepts one discriminated command union:

```ts
type DirectoryWorkspaceCommand =
  | { type: "present"; target: BenchTarget; mode: BenchModeRequest }
  | { type: "close" }
  | { type: "set-mode"; mode: "docked" | "floating" }
  | { type: "reveal" }
  | { type: "collapse" }
  | { type: "open-drawer"; drawer: DrawerKind }
  | { type: "close-drawer" }
```

`reveal`, `collapse`, and drawer-only commands use a `workspace-only` intent and never navigate. `present`, `close`, and `set-mode` use a navigation intent when their canonical route must change. A same-target present may be workspace-only when it only reveals a parked target.

The controller will:

1. Allocate a command ID and capture the previous projection.
2. Allocate a distinct navigation attempt ID when routing is required.
3. Install the corresponding pending intent.
4. Navigate without optimistic target mutation.
5. Let the sole router blocker perform any required leave guard.
6. Verify the committed route postcondition.
7. Commit workspace state and clear the matching intent atomically.
8. Capture the final route/projection/context snapshot synchronously before resolving the command.
9. Return `committed`, `blocked`, `failed`, `inactive`, or `superseded`.

Newer commands supersede older commands. Async guard completion must recheck command identity before navigation can proceed.

The blocker:

- Runs once for target replacement and target exit.
- Does not run for mode-only changes or reveal/collapse.
- Assigns every navigation, including Back and direct navigation, a unique attempt ID. Controller navigations additionally carry their command ID through the controller's attempt registry rather than inferring ownership from the destination.
- Owns one deferred outcome per attempt and records `allowed`, `blocked`, `failed`, or `superseded` against that exact attempt.
- Handles Back and direct navigation through the same guard path.
- Rechecks the active attempt after every awaited guard. A stale guard may finish its save, but its navigation is denied and its deferred resolves `superseded`.
- Rejects and disposes stale attempts on controller replacement, directory change, unmount, and router failure.

Browser Back and Forward attempts have no command ID but still receive an attempt ID and use the same blocker. Mode-only attempts bypass the leave guard. Target replacement, whiteboard/session close, directory exit, and explicit close invoke it exactly once.

Before creating or selecting a different session, if the current target is the session-owned whiteboard, close it through this same guarded controller path. A blocked close leaves the selected session unchanged. For every allowed session change, publish closed context to the outgoing session before changing the selected session, then publish the current effective route context to the incoming session once that session is authoritative in frontend state. A session draft with no session ID publishes nothing until the real session exists. Do not mirror active chat-session truth into the backend action lease as a required-action delivery or completion authority.

Preserve reading-resource linkage: opening a linked resource may select its linked session first, and opening with the current-session preference updates that link. Reading linkage remains domain/session state and is not moved into the workspace store.

## Hardened Agent Action and Context Protocol

### Shared contract

Add a runtime-validated Bench-specific contract shared by Buddy backend and web:

```ts
type BenchClientActionV1 = {
  version: 1
  actionID: string
  directory: string
  sessionID: string
  messageID: string
  callID: string | null
  origin: "agent" | "auto-open"
  acknowledgement: "required" | "best-effort"
  expiresAt: number
  command:
    | { type: "present"; target: BenchTarget }
    | { type: "close" }
}

type BenchClientLease = {
  instanceID: string
  generation: number
  leaseEpoch: number
  directory: string
}
```

The action command is also its completion expectation:

- `present` succeeds only when the canonical route target equals `command.target` by `benchTargetKey`, the effective projection is visible, and synchronized context is open for that target. The agent does not choose layout, so completion deliberately does not validate docked/floating mode.
- `close` succeeds only when the canonical route is closed and synchronized context is closed.

Add a completion request:

```ts
type BenchClientActionCompletion =
  | {
      outcome: "committed"
      lease: Pick<BenchClientLease, "instanceID" | "generation" | "leaseEpoch">
      publicationSequence: number
      observedRoute: BenchRouteSnapshot
      observedVisibility: "visible" | "parked" | "closed"
      drawer: DrawerKind | null
      context: BenchReadContextOutput
      changed: boolean
    }
  | {
      outcome: "blocked" | "failed" | "inactive_session" | "superseded"
      lease: Pick<BenchClientLease, "instanceID" | "generation" | "leaseEpoch">
      reason:
        | "leave_guard_blocked"
        | "navigation_failed"
        | "context_sync_failed"
        | "session_inactive"
        | "newer_command"
    }
```

Define the exact context extension in the shared runtime and OpenAPI schemas:

```ts
type BenchDrawerContext = {
  kind: "explorer" | "library"
  presentation: "drawer"
}

type BenchReadContextOutput =
  | { status: "closed" }
  | {
      status: "open"
      target: BenchContextTarget
      drawer: BenchDrawerContext | null
      metadata: string[]
      content: string
      refs: BenchContextRef[]
      hints: string[]
    }
```

`drawer` is required and nullable on every open context. Closed context has no drawer. Prompt and `bench_read_context` wording must say the target remains loaded on Bench and explicitly state when Explorer or Library is open as a drawer over it; it must not claim the target is literally unobscured.

### Broker lifecycle

Implement a Buddy-owned in-memory broker with explicit states:

```ts
type ActionState =
  | "pending"
  | "delivered"
  | "completed"
  | "cancelled"
  | "expired"
```

- `bench_present` resolves and validates its target, enqueues the action, and emits it before its tool result can complete.
- Multiplex broker events into the existing `/api/event` SSE response without patching vendor code.
- Required actions remain pending until terminal completion, tool abort, or the named 30-second expiry.
- Unexpired required actions are redelivered after reconnect.
- Completed or expired actions are never replayed.
- Best-effort auto-open actions remain live-only and do not delay their producing tool.
- Establish one authoritative `BenchClientLease` per directory. A workspace instance owns a stable `instanceID`; every SSE reconnect increments `generation`. The server assigns a monotonically increasing directory `leaseEpoch` whenever it accepts a connection as authoritative and returns that lease in the initial Buddy SSE event. Latest accepted lease epoch wins across different instances; generation rejects stale reconnects from the same instance. Only the current epoch may claim or complete actions.
- The lease proves authoritative directory-client connection ownership only. It does not mirror active chat-session truth and must not be used as a required-action session gate.
- Deliver required actions to the authoritative directory lease regardless of the action's session ID. Stale/reconnecting consumers ignore them and cannot complete actions because completion validates the current lease identity.
- The frontend ledger checks `action.sessionID` against the actual current active session immediately before execution. If the active session is known and different, it completes `inactive_session`. If session state is not yet known because of hydration, reconnect, or session-selection churn, the required action remains queued until session state is known or the broker expires it.
- If no authoritative client is connected, retain the required action for reconnect until its deadline.
- Tool cancellation cancels the broker action through `ctx.abort`.
- Late and duplicate completions return stable `already_completed`, `expired`, or `conflict` responses.
- Store broker terminal tombstones for five minutes, capped at 512 entries per directory/session, and evict on broker activity without a recurring cleanup timer. Use an injectable clock in tests.

The frontend keeps a bounded action ledger:

- An unseen action executes once.
- A duplicate while executing does nothing.
- A duplicate terminal action resends the same completion safely.
- Scope mismatches never execute a command.
- Keep at most 512 terminal frontend ledger entries per directory using LRU eviction. Executing entries are never evicted.

### Atomic completion and context

Add one typed completion endpoint through the generated Buddy SDK.

The typed transport surface is:

- `GET /api/event` accepts the workspace instance ID and connection generation when establishing the SSE lease; its initial Buddy event returns the server-assigned lease epoch.
- `DELETE /api/bench/client-lease/:instanceID` releases the lease only when the supplied generation and epoch still own it.
- `PUT /api/bench/session/:sessionID/context` accepts `{ lease, publicationSequence, idempotencyKey, value }` instead of an unsequenced context body.
- `POST /api/bench/client-actions/:actionID/complete` accepts `BenchClientActionCompletion`.

Define all request, response, and SSE event schemas in Buddy-owned runtime schemas and expose HTTP calls only through regenerated `BuddyClient` methods.

Create one `BenchContextCoordinator` per canonical directory/session. Both ordinary context publication and action completion must enter its serialized write queue. Every frontend context write carries the authoritative lease, a monotonically increasing `publicationSequence`, and an idempotency key. Sequence numbers are scoped to directory/session/lease generation; a new authoritative generation starts at one, while the frontend retains the next sequence for every session revisited during the same generation. The coordinator stores the active lease generation, last accepted sequence/idempotency key, server revision, and snapshot.

For a successful action, the coordinator will:

1. Validate action ID, directory, the stored action's session ownership, authoritative lease generation, target-only command expectation, observed projection, and completion sequence.
2. Reject a stale lease or sequence before it can modify context.
3. Publish the supplied context with the action ID as its idempotency key.
4. Record the next server revision and accepted publication sequence.
5. Settle the broker action in the same serialized critical section.
6. Resolve the waiting `bench_present` tool.

The context registry and broker share this coordinator for settlement. A retry after context publication but before broker settlement detects the stored action ID/revision and completes idempotently. A delayed ordinary publication with a lower sequence cannot overwrite the action's newer context; a genuinely later semantic change uses a higher sequence and may publish normally.

Failed or blocked outcomes settle without publishing a success context.

`bench_present` reports success only after committed UI and synchronized model context. The 30-second deadline is only the final safety boundary; there are no recurring timers, polling loops, DOM transition waits, or transcript-dependent completion conditions.

Capture the final route, effective projection, and surface context synchronously when the controller settles the command, before another command or session transition can change them. If no matching surface registration is ready, use the route-derived loading fallback described below; action completion never waits for a React registration effect.

Remove `readCurrentBenchContextForPresentation` and `blockedByCurrentBenchState` as preflight authorities. Target resolution remains backend-owned, but unsaved-work protection belongs solely to the frontend router blocker. Missing context no longer prevents action dispatch because successful completion publishes the synchronized context.

Map terminal outcomes to the existing tool contract exactly:

- Committed present with `changed: true` -> `status: "presented"` and the existing target-specific reason.
- Committed present with `changed: false` -> `status: "already_presenting"`, `reason: "already_showing_target"`.
- Committed close -> `status: "closed"`, `reason: "closed_by_request"`.
- Leave guard block -> `status: "blocked"`, `reason: "blocked_by_unsaved_work"`.
- Context completion failure -> `status: "blocked"`, `reason: "sync_error"`.
- Inactive session -> `status: "error"`, new reason `client_inactive`.
- No authoritative client observed before expiry -> `status: "error"`, new reason `client_unavailable`.
- Authoritative client observed but no terminal completion before expiry -> `status: "error"`, new reason `client_timeout`.
- Navigation failure -> `status: "error"`, new reason `client_navigation_error`.
- Superseded required action -> `status: "error"`, new reason `action_superseded`.

Give each new reason a direct model-facing message stating that Bench did not change. Never report “presented” for an accepted, queued, timed-out, blocked, or superseded action.

### Context ownership

Replace module-global registries with directory-controller services.

A surface registers:

```ts
type BenchSurfaceRegistration = {
  registrationID: string
  targetKey: string
  getSnapshot(): {
    semanticRevision: number
    context: BenchReadContextOutput
  }
  subscribe(listener: () => void): () => void
  guardLeave(): Promise<BenchLeaveResult>
}
```

- Keep registrations by ID with a monotonically increasing registration order. Select the newest live registration whose `targetKey` matches `benchTargetKey(canonicalRoute.target)`.
- Exiting animated targets cannot publish or clear context for the entering target.
- Cleanup removes only its exact registration ID. If the selected registration disappears, reselect the newest remaining canonical-target registration before considering fallback.
- Key publication by directory, session, target key, effective visibility, drawer, and `semanticRevision`—not registration ID or provider-object identity. Equivalent instance churn must not republish.
- Prompt flush reads the latest provider snapshot directly.
- Hydration-pending and parked workspaces publish closed.
- Provide a pure route-derived loading snapshot for every target type. It contains the canonical target, route, `status: "loading"`, empty bounded content/refs, and the effective drawer. Use it synchronously whenever no matching registration is ready.
- A visible target with a drawer publishes the exact `BenchDrawerContext` defined above.
- Update prompt wording and `bench_read_context` accordingly.

## Persistence, Transitions, and Cleanup

- Create new versioned workspace persistence and discard all legacy Bench/right-sidebar persisted state, including old visibility, surface, selector, width, and raw mode keys.
- Preserve unrelated UI preferences.
- New chat directories begin collapsed.
- A direct Bench URL with no new persistence record initializes expanded.
- Last drawer defaults to Explorer.
- Target-family mode behavior remains the same, but old stored values are discarded and current family defaults apply initially.
- Use `skipHydration` and an explicit `pending | ready | failed` hydration state. Mount chat immediately, but keep the workspace inert, visually suppressed, and model-closed until hydration reaches a terminal state.
- Queue at most 64 commands while hydration is pending. Preserve arrival order, but run them through the normal command coordinator after hydration so newer commands supersede older commands consistently.
- Required actions are never silently dropped: a required action displaced by a newer command completes `superseded`; one whose session is known by the frontend ledger to no longer be active completes `inactive_session`; one whose session state is temporarily unknown because of hydration, reconnect, or selection churn stays queued until session state is known or the broker expires it; one whose directory root is disposed completes `inactive_session` when the current authoritative frontend instance can still report it, otherwise the broker expires it.
- Keep only the newest pending best-effort action per policy/event key during hydration. Apply normal auto-open suppression when draining; drop expired or superseded best-effort actions without affecting their producing tools.
- If persistence hydration fails, record the error for diagnostics, initialize the documented defaults exactly once, mark hydration `failed`, and drain the queue. Hydration failure must not leave Bench permanently inert.
- Recheck directory, frontend-known active session, lease generation, and action expiry immediately before every queued command executes and again before required-action completion. Backend completion validates the action's stored session ownership, but not a mirrored active-session field on the lease.

Transitions become visual consequences:

- Workspace layout owns dock/floating/open/collapse animation.
- A target-keyed transition owns target replacement.
- The drawer owns selector animation.
- Remove DOM queries, `transitionend` sequencing, close timers, route-local animation phases, unused transition-type distinctions, and dead geometry directives.
- Preserve existing easing, duration, geometry, and reduced-motion behavior.

Delete:

- `BenchAutoOpen` and transcript-scanning effects.
- Mutually exclusive Bench/Explorer/Library surface state.
- Mirrored route mode and reconciliation effects.
- Manual duplicate leave-guard calls.
- Module-global Bench registries.
- Legacy right-sidebar tabs, components, prop construction, and invisible writers.
- Dead teaching-editor and curriculum sidebar entrypoints.
- Backend context-based unsaved-work and missing-context preflights in `bench_present`; the sole router blocker replaces them.
- Raw Bench preference helpers, unused transition classifiers/type labels, unused geometry directives, and close-transition DOM/timer helpers once their consumers are migrated.

Preserve independently consumed teaching/runtime domain code. Diagnostic-only content remains in Buddy DevTools; no replacement product sidebar or new diagnostic surface is introduced.

The legacy deletion inventory must explicitly account for `rightSidebarOpen`, `rightWorkspaceSurfaceByDirectory`, `rightSidebarTab`, obsolete sidebar widths/tabs, `rightSidebarProps`, old right-sidebar components/panel builders, `BenchAutoOpen`, manual Bench leave-guard registries/callers, raw Bench local-storage keys, and teaching/curriculum presentation writers. Do not delete reading-resource linkage, whiteboard domain state, context history needed by the model, or DevTools-owned diagnostics merely because they were adjacent to the old sidebar.

Rewrite Bench documentation around the final ownership model, transition table, action protocol, and invariants.

## Test and Acceptance Plan

- Exhaustive pure tests for route/store/pending-intent projections and illegal states.
- Real memory-router plus real scoped-store tests for enter, replace, close, mode changes, direct navigation, blocking, failure, and supersession.
- Browser-history or equivalent real `popstate` tests for Back/Forward blocking and history mutation. Do not claim Back coverage from TanStack memory history because its `go` path does not exercise blockers.
- Assert no intermediate selector, parked, or expanded flash during route/store commits.
- Assert chat identity survives every Bench transition.
- Assert target identity survives collapse/reveal and dock/floating changes.
- Assert only target replacement remounts the target.
- Test async leave guards superseded before resolution and exactly one guard invocation.
- Test overlapping same-destination commands with distinct attempt IDs, direct navigation during a command guard, and disposal while a guard is awaiting.
- Test hydration racing with UI commands and required agent actions.
- Test hydration queue ordering, required-action terminal outcomes, best-effort coalescing, hydration failure defaults, and directory/session changes before drain.
- Test persistence defaults and confirm legacy Bench state is ignored.
- Test broker emission before tool completion, no client, reconnect redelivery, duplicate delivery, authoritative-lease replacement, stale consumers, abort, expiry, tombstone eviction, late completion, completion/timeout races, and conflicting acknowledgments with an injected clock.
- Test frontend-ledger inactive-session completion when the actual active session is known and different, and test that required actions are queued rather than falsely failed while active session state is unknown during hydration or reconnect.
- Test atomic context publication and action settlement, including retry after partial completion and an older ordinary publication arriving after a newer action completion.
- Test registration overlap where an exiting target cleans up after the new target registers.
- Test visible, parked, drawer-covered, route-derived loading fallback, no-registration completion, semantic revision changes, equivalent registration churn, and context-publication-failure states.
- Test existing auto-open suppression and live-only behavior.
- Test guarded whiteboard close before selecting or creating a session, no session mutation when blocked, required-action session changes, and linked-reading session behavior.
- Test that `bench_present` no longer performs its own unsaved-work preflight and that the router blocker is invoked exactly once.
- Test exact history stacks after enter, target replace, mode replace, Back, and explicit close.
- Test route loader/navigation failure after an action is delivered and verify the tool receives `client_navigation_error` rather than success.
- Test reduced motion without relying on transition events.
- Regenerate the SDK through normal code generation; never edit generated files manually.
- Run only focused tests for changed packages, followed by `bun lint` and root `bun typecheck`.
- Exclude Storybook cleanup and unrelated dirty-tree changes.
- Run `bun fmt` only after implementation is complete and accepted.

## Execution handoff

### Implementation order

Implement this as one atomic final cut, but use the following internal order so each layer can be tested before old integrations are deleted:

1. Add the canonical route snapshot, scoped store types, pending-intent projection, command result types, and exhaustive pure tests.
2. Move shell ownership to `/$directory`, establish the single Bench host, and prove chat/target mount identity.
3. Introduce the controller and sole router blocker, migrate every user-initiated open/close/mode/selector call site, and add navigation/history tests.
4. Replace global lifecycle registries with directory-owned registration, leave-guard, prompt-flush, and context-publication services.
5. Add the Bench client-action contract, backend broker, SSE multiplexing, atomic completion endpoint, SDK generation, frontend ledger, and required/best-effort action integrations.
6. Migrate context schema and prompt wording, then remove transcript-scanning command behavior.
7. Add new persistence with hydration gating, discard only legacy Bench/right-sidebar persistence, and preserve unrelated UI preferences.
8. Remove legacy sidebar UI and writers, obsolete transition machinery, duplicate state/effects, and dead policy dimensions.
9. Update the remaining Bench documentation and complete all focused tests and repository validation.

Do not leave old and new command paths active simultaneously in the final tree. Temporary adapters used during implementation must be removed before completion.

### Repository constraints

- Follow the root, `packages/web`, `packages/web/src/state`, and any touched package `AGENTS.md` files.
- Use types, never interfaces; do not introduce `any`, unsound casts, magic strings, or magic numbers.
- Use the typed `BuddyClient` for HTTP calls. Do not add manual fetch helpers.
- Do not patch `vendor/opencode`; shared OpenCode-facing contracts belong in Buddy-owned or adapter code.
- Do not manually edit `packages/web/src/routeTree.gen.ts` or `packages/sdk/src/gen/**`.
- Regenerate route and SDK output only through the repository's normal generators.
- Breaking internal changes are allowed; backward compatibility and dual-write compatibility are not required.
- Do not preserve dead presentation components through comments or unreachable exports. Retain only independently consumed domain/runtime code.

### Scope boundaries

- The concurrent Storybook deletion is unrelated user work. Do not restore, modify, validate, or include Storybook files as part of this refactor.
- Do not redesign Bench visuals, introduce tabs/history, restore teaching/curriculum sidebar surfaces, or add a replacement diagnostic sidebar.
- Do not add a generalized client-action framework beyond the Bench-specific contract unless an existing second consumer is discovered during implementation.
- The 30-second required-action deadline is a single backend expiry boundary. It must not be implemented as frontend polling, recurring retries, DOM timers, or periodic synchronization.

### Completion gate

- Run only focused runtime tests for the changed packages; never run vendor tests or the entire repository test suite.
- Run `bun lint` and then root `bun typecheck` before considering implementation complete.
- Do not run package typechecks concurrently with root typecheck.
- Run `bun fmt` only after the implementation is complete and the user is satisfied.

## Architectural heuristics and decision rationale

These rules explain why the plan has its shape. They are constraints for implementation and review, not optional style preferences.

### Model independent product dimensions independently

Target, URL mode, docked visibility, and drawer are separate facts. Combining them into a single “surface” enum hides valid states and creates impossible ones. Use orthogonal canonical values, then derive named projections such as visible or parked.

### One concept gets one writable owner

The URL owns target and mode. The scoped store owns committed workspace UI state. Persistence stores only the durable subset of that store. The broker owns pending agent actions. The context coordinator owns model-visible context revisions. Never mirror one owner's state into another writable field and repair it with effects.

### Derived state is computed, not synchronized

`targetKey`, effective drawer, parked state, visibility, and layout projection are pure derivations. If a value can be calculated from canonical inputs during render or inside a selector, storing it creates another failure mode. React effects are reserved for external boundaries such as SSE, persistence hydration, observers, and HTTP publication.

### Pending intent bridges commits; it is not optimistic truth

Router and store commits cannot be physically atomic, so `PendingWorkspaceIntent` preserves a coherent projection across that gap. It may retain the previous projection or apply workspace state after the expected route commits, but it may never invent an uncommitted target or mode. This avoids both corruption and visual flashes.

### Commands are transactions with identities and terminal outcomes

Every operation goes through the controller, receives a command ID, and—when routing—an attempt ID. Async continuations recheck those identities before committing. “Fire and forget” is unacceptable for semantic transitions because blocked, failed, disposed, or superseded work must settle explicitly.

### Stale async work must become powerless

Directory changes, session changes, reconnects, newer commands, and unmounts are normal. Cleanup alone is insufficient because an awaited promise can resolve later. Every guard, navigation, context write, and action completion validates its current directory, frontend-known session state where applicable, lease generation, command ID, and attempt ID immediately before mutation. Backend action completion validates the stored action/session relationship, not a mirrored active-session field on the lease.

### Guard the semantic transition exactly once

Dirty-state protection belongs at the router/navigation boundary because it covers user commands, agent commands, Back, Forward, and direct navigation. Backend context preflights and manual callers create duplicate, stale guards. Target-independent mode and drawer changes do not leave the surface and therefore do not run the guard.

### Preserve React identity through stable ownership and position

Chat and the Bench host live under one directory-keyed root. Collapse and mode changes alter layout, not ownership or tree position. Only a complete target identity change changes the target key. This preserves scroll, selection, drafts, registrations, and dedupe state for the transitions that promise continuity.

### Animation visualizes committed state

No semantic transition waits for `transitionend`, an animation callback, a CSS property, or a DOM query. Reduced motion, interrupted animation, and rapid commands must produce the same state result. Animation owners are local to layout, target replacement, and drawer presentation.

### Live commands use an at-least-once, idempotent protocol

SSE reconnects can duplicate delivery, while disconnections can delay it. Required actions therefore remain pending, may be redelivered, and execute once by action ID. Frontend ledger entries, broker tombstones, completion endpoints, and context idempotency keys make retries safe. Completed transcript history is never interpreted as a fresh command.

### A timeout is a circuit breaker, not synchronization

The 30-second deadline bounds a failed required action. Normal completion is driven by delivery, controller settlement, and atomic context publication. Do not add polling, periodic reconciliation, sleeps, or UI timers to make the protocol “eventually” agree.

### One active lease arbitrates consumers

Reconnects, Strict Mode, stale trees, or multiple windows can temporarily create overlapping event consumers. Only the authoritative directory lease generation may execute or complete an action. A stale consumer must ignore delivery. `inactive_session` is reported only by the current authoritative frontend ledger after checking actual active frontend session state, not by backend lease/session mirroring.

### Model-visible context is an ordered session stream

Ordinary publication and action completion write through the same per-directory/session coordinator. Lease generation and publication sequence prevent an older request from overwriting newer truth. Server revision provides the read-side order. Action success includes context settlement because the agent must not be told “presented” while its next context read still describes the previous target.

### Registration is an optimization over a route-derived fallback

React registration occurs after commit and may overlap during animation. Correctness cannot wait for that effect. The canonical route always supplies a synchronous loading context; the newest matching surface registration enriches it when ready. Registration instance identity is not semantic state and must not itself trigger publication.

### Persistence stores durable intent, not runtime machinery

Persist visibility, last drawer, width, and target-family preferences only where specified. Do not persist active drawers, action ledgers, commands, attempts, registrations, hydration status, or animation state. Hydration is a one-time boundary with explicit queuing and failure defaults, not an ongoing source of truth.

### Session-owned and domain state remain domain-owned

Whiteboards belong to sessions, so session changes guard and close the current session's whiteboard before mutating selection. Reading-resource linkage remains in chat/domain state because it determines which session owns reading context; it is not right-workspace presentation state. Architectural cleanup must not erase domain semantics merely because old UI code touched them.

### The transcript records outcomes; it does not cause UI behavior

Tool parts remain useful for rendering history and explaining what happened. They are not a command channel because hydration, replay, remount, and streaming updates make effect-based consumption ambiguous. Live client actions travel through the typed broker protocol.

### Prefer deletion over compatibility layers in this cut

Buddy permits breaking internal changes. Dual writes, legacy adapters, commented-out panels, and dormant state writers would preserve the same ambiguity under new names. Once all call sites use the new controller and protocol, remove the old path completely while preserving unrelated domain/runtime code.

### Test transitions and races, not only helpers

Pure model tests prove the algebra; they do not prove orchestration. Integration tests must cross router, store, blocker, broker, context coordinator, hydration, and lifecycle boundaries. Each async test should control ordering deliberately and assert that stale work cannot commit. Browser history behavior requires a real popstate-capable harness.

### Generalize only after a second real consumer exists

The protocol is Bench-specific because its completion condition includes route projection and Bench context. Do not create a generic client-action framework speculatively. Extract a general protocol later only when another implemented feature demonstrates the same contract.

---

## Archive: Backend Active-Session Lease Gating

This design was part of the reviewed plan but is no longer on the critical path. It is archived, not deleted, to preserve the rationale and avoid information loss.

The archived design made the backend lease mirror active chat-session truth and used that mirrored session as a required-action delivery and completion gate. Implementation review against the actual code showed that this makes `bench_present` brittle: the frontend already owns the real router/store/session state at execution time, while the backend lease can only observe `activeSessionID` through SSE connect query data or a later lease update. That mirror can be stale, null, or temporarily wrong during render, reconnect, route changes, hydration, or session-selection churn. Treating it as a hard backend authority can falsely settle a required action as `inactive_session` before the authoritative frontend ledger has a chance to execute or reject it.

The active design keeps the lease as authoritative directory-client connection identity only. Required actions are delivered to the authoritative directory lease. The frontend ledger checks `action.sessionID` against the actual current active session before execution and reports `inactive_session` only when that frontend state is known to be different. If frontend session state is temporarily unknown, required actions remain queued until session state is known or the broker expires them.

Archived session-change rule:

> Before creating or selecting a different session, if the current target is the session-owned whiteboard, close it through this same guarded controller path. A blocked close leaves the selected session unchanged. For every allowed session change, publish closed context to the outgoing session before changing the authoritative lease, update the selected session and lease together, then publish the current effective route context to the incoming session. A session draft with no session ID keeps the lease session null and publishes nothing until the real session exists.

Archived lease contract:

```ts
type BenchClientLease = {
  instanceID: string
  generation: number
  leaseEpoch: number
  directory: string
  activeSessionID: string | null
}
```

Archived broker lifecycle requirements:

- Update the lease through a typed endpoint whenever the active session changes. Broker delivery and completion both validate the current lease and active session.
- Deliver required actions only to the authoritative lease. Stale/reconnecting consumers ignore them and cannot report `inactive_session`.
- If an authoritative connected lease exists for another active session, settle the required action immediately as `inactive_session`. If no authoritative client is connected, retain the action for reconnect until its deadline.

Archived typed transport surface:

- `GET /api/event` accepts the workspace instance ID, connection generation, and active session when establishing the SSE lease; its initial Buddy event returns the server-assigned lease epoch.
- `PUT /api/bench/client-lease/:instanceID` updates the authoritative epoch's active session without reconnecting.

Archived coordinator validation language:

> Validate action ID, directory, active session, authoritative lease generation, target-only command expectation, observed projection, and completion sequence.

Archived persistence/hydration action rule:

> Required actions are never silently dropped: a required action displaced by a newer command completes `superseded`; one whose session is no longer active completes `inactive_session`; one whose directory root is disposed completes `inactive_session` when the lease is still valid, otherwise the broker expires it.

Archived stale-work heuristic:

> Every guard, navigation, context write, and action completion validates its current directory, session, lease generation, command ID, and attempt ID immediately before mutation.

Archived lease arbitration heuristic:

> Reconnects, Strict Mode, stale trees, or multiple windows can temporarily create overlapping event consumers. Only the authoritative directory lease generation may execute or complete an action. A stale consumer must ignore delivery rather than falsely declaring the scoped session inactive.
