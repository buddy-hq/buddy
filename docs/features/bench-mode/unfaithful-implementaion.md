# Bench Refactor Spike: Unfaithful Implementation Review

Date: 2026-06-21

## Verdict

The current implementation spike is materially unfaithful to `docs/features/bench-mode/bench-refactor.md`.

Do not continue by monkey-patching the observed UI/session failures. The failures are consistent with structural divergences from the plan, not isolated bugs. Treat the spike as disposable, or at most as a source of small reusable pieces such as the route snapshot/projection sketch and some shell-hosting experiments.

The recommended path is to reset the implementation and reimplement from the plan with the hard invariants in place before integrating UI call sites.

## Why this matters

The refactor plan was written to remove split authority, effect reconciliation, stale lifecycle ownership, and transcript/session race behavior. The spike reintroduced several of those same failure classes under new names. The current visible regressions are therefore expected symptoms:

- the titlebar/right-workspace toggle can be rendered from the wrong ownership path or without the correct workspace transaction;
- `bench_present` can report `client_inactive` even while the backend session is actively accepting messages;
- context/action success is not truly atomic, so the model can receive an outcome that does not correspond to committed UI and synchronized context.

## Major divergences from the plan

### 1. No real action/context coordinator

The plan requires one serialized coordinator for ordinary context publication and action completion. That coordinator must atomically validate route projection, publish model-visible context, settle the broker action, and make stale writes powerless.

The spike instead publishes context directly from React effects and action completion paths. There is no `BenchContextCoordinator`, no serialized critical section, no shared queue for ordinary publication plus completion, and no reliable retry behavior after partial success.

Representative files:

- `packages/web/src/components/bench/bench-route-context.tsx`
- `packages/web/src/lib/directory-workspace-client.ts`
- `packages/buddy/src/routes/bench.ts`

This violates the core invariant: `bench_present` may report success or failure based on a partially synchronized system.

### 2. Surface registration remains a single-slot lifecycle model

The plan requires registrations keyed by registration ID and canonical `targetKey`, with semantic revisions, subscriptions, and newest matching registration selection.

The spike still effectively keeps one active registration slot in React state. It does not model registration identity, target-key selection, semantic revisions, or equivalent-registration churn. This preserves the old class of registration races during remounts, target swaps, and fallback windows.

Representative file:

- `packages/web/src/components/bench/bench-route-context.tsx`

### 3. Controller and router blocker are not one transaction boundary

The plan requires every routed command to carry a command ID and navigation attempt ID through the controller/blocker path. The blocker must record terminal outcomes for the exact attempt and reject stale async guard completions.

The spike creates an `attemptID` inside the controller, but the blocker does not receive or coordinate with it. The blocker owns its own counter. This means command attempts, Back/Forward attempts, direct navigation, guard completion, and controller settlement are not unified.

Representative files:

- `packages/web/src/lib/directory-workspace-controller.ts`
- `packages/web/src/components/directory-chat/directory-workspace-context.tsx`

This misses one of the plan’s central reliability guarantees.

### 4. The session/lease contract is too brittle

The plan scopes actions to a session, but the implementation makes every `bench_present` depend on a separate frontend Bench lease having an exactly current `activeSessionID`.

That is too fragile. The backend being live and accepting a chat message proves the agent/session loop is active. A stale or null UI lease should not automatically mean Bench is unavailable. Session identity should correlate the action and context write; it should not be a repeated delivery preflight that can desynchronize from the real active conversation.

This explains the observed “session is not active in the app” behavior during an otherwise active chat session.

Representative files:

- `packages/web/src/lib/directory-workspace-client.ts`
- `packages/buddy/src/learning/features/bench/client-actions.ts`
- `packages/buddy/src/routes/compatibility.ts`

### 5. Direct navigation paths remain outside the controller

The plan requires all UI, selector, model, titlebar, and file-opening Bench commands to go through `DirectoryWorkspaceController`.

The spike still has direct navigation paths, including titlebar navigation back to chat. Those paths can bypass workspace commits such as “explicit close commits collapsed” and can bypass the same transaction semantics used by agent actions.

Representative file:

- `packages/web/src/components/layout/desktop-titlebar.tsx`

### 6. Persistence does not match the ownership model

The plan says per-directory persistence stores only durable visibility and `lastDrawer`. Width and target-family mode preferences belong in separate typed preference stores.

The spike persists `widthPx` in the directory workspace store. This is not the largest defect, but it is a clear sign that the implementation did not preserve the intended ownership boundaries.

Representative file:

- `packages/web/src/state/directory-workspace-store.ts`

### 7. Hydration and queued action semantics are incomplete

The plan requires:

- at most 64 queued commands while hydration is pending;
- required actions never silently dropped;
- required actions displaced by newer commands completing `superseded`;
- best-effort actions coalesced by policy/event key during hydration;
- directory/session/lease/action expiry rechecked before execution and completion.

The spike has a basic hydration queue, but it does not implement the full required-action and best-effort semantics. This leaves the original race classes under reconnect, hydration, and session changes insufficiently handled.

Representative files:

- `packages/web/src/lib/directory-workspace-controller.ts`
- `packages/web/src/lib/directory-workspace-client.ts`

### 8. Context publication is still effect-driven

The plan explicitly says context publication should be keyed by semantic changes: directory, session, target key, effective visibility, drawer, and semantic revision.

The spike still republishes from React effects that depend on provider identity, registration state, visibility, and lease callbacks. This preserves the old “effect-driven synchronization” failure mode.

Representative file:

- `packages/web/src/components/bench/bench-route-context.tsx`

### 9. Tests do not prove the plan’s invariants

The plan’s acceptance criteria require integration tests across router, scoped store, blocker, broker, context coordinator, hydration, lifecycle registration, and browser history.

The spike adds some useful unit tests, but it does not cover the main orchestration risks:

- exact Back/Forward behavior;
- one guard invocation per semantic transition;
- action completion and context publication atomicity;
- stale guard completion;
- reconnect redelivery and duplicate delivery;
- no-client vs inactive-session behavior;
- hydration race handling;
- registration overlap during target replacement;
- delayed ordinary context publication after action completion.

Without those tests, the implementation can pass while still failing the core refactor goal.

## Reusable pieces, if any

These parts may be worth referencing during a clean implementation, but should not be assumed correct as-is:

- the basic `BenchRouteSnapshot` and `DockedWorkspaceState` shape;
- the idea of an `effectiveWorkspaceProjection` pure helper;
- the single shell under `/$directory`;
- the removal direction for legacy `rightSidebar*` preferences;
- the typed action/completion schema sketch.

The controller, blocker, context publication, registration, lease/session, and action completion layers should be rebuilt against the plan rather than patched.

## Recommendation

Reset the implementation code and reimplement from `bench-refactor.md` in the documented order:

1. pure model and exhaustive projection tests;
2. stable route/shell ownership and mount-identity tests;
3. controller plus real blocker attempt registry;
4. directory-owned lifecycle services with target-keyed registrations;
5. broker, SSE lease, frontend ledger, and atomic context coordinator;
6. context schema/prompt migration;
7. hydration and persistence;
8. deletion of old paths;
9. integration tests and validation.

Do not leave old and new command paths active at the end of the cut. The plan’s purpose is to eliminate ambiguous ownership, not rename it.
