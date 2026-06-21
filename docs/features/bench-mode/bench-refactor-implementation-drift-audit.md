# Bench Refactor Implementation Drift Audit

Date: 2026-06-21

Status: survey complete

## Purpose

This document audits the current Bench refactor implementation for drift from
`bench-refactor.md`, `bench-refactor-review-remediation.md`, and
`bench-refactor.divergences.md`.

The goal is not to fix code in this pass. The goal is to identify where the
current implementation still permits old architectural failure modes or partial
implementations, then define a focused hardening/refactor plan that can be done
after the current working state is committed.

Backward compatibility is not required for the follow-up work. The plan should
prefer deleting or renaming drift-prone compatibility surfaces over preserving
old APIs, state names, or adapters.

## Source Documents

- `docs/features/bench-mode/bench-refactor.md`
- `docs/features/bench-mode/bench-refactor-review-remediation.md`
- `docs/features/bench-mode/bench-refactor.divergences.md`
- `docs/features/bench-mode/current-architecture.md`

## Audit Criteria

Implementation drift means one of these is true:

- A semantic concept has more than one writable owner.
- A caller can infer command success before the controller returns a committed
  terminal result.
- A route, projection, context, or session snapshot can be read after an async
  boundary when the operation required the earlier observation.
- A React effect is used to repair semantic state that should be owned by the
  controller, lifecycle service, blocker, or backend broker.
- Old Bench/right-sidebar state, route ownership, transcript command delivery,
  or module-global lifecycle behavior remains active.
- Runtime behavior relies on unbounded maps, timers, DOM transitions, or
  retained histories that are not part of the final architecture.
- A documented divergence causes behavior outside the intent of
  `bench-refactor.md`.

## Current Read

The current implementation appears to have converged back toward the intended
architecture after the remediation passes. The major known failures were mostly
caused by implementation drift from the plan rather than by the two active
documented divergences.

The remaining concern is not that the target architecture is wrong. The concern
is that the implementation still depends on several hand-maintained boundaries
where future partial changes can easily reintroduce drift: command arbitration,
route observation, lifecycle publication ordering, session transitions, and
generic renderer boundaries.

## Findings

Findings were added incrementally during the audit.

### C1. No second live Bench command path found in the command survey

Status: current implementation aligned.

Evidence:

- `useOpenBench` delegates to `DirectoryWorkspaceController.executeOpen` and
  returns `inactive` when called outside a directory workspace.
- `DirectoryWorkspaceController` is the only production importer of
  `buildBenchNavigation`.
- Current UI entrypoints found by search use `workspace.controller.execute(...)`
  or `useOpenBench`, including titlebar toggles, drawer toggles, file opens, and
  agent client actions.
- `useOpenBench` no longer computes open policy itself; the controller computes
  the policy and only attaches the policy decision to committed open results.

Interpretation:

This fixes the class of drift where hooks and callers inferred success before
route/workspace commitment. The next refactor should preserve this boundary and
make it mechanically hard to add a second policy authority.

### C2. Legacy `rightSidebar*` naming remains, but it is mostly shell adapter debt

Status: naming drift, low direct correctness risk.

Evidence:

- `DirectoryChatShell`, `DesktopTitlebar`, and controller shell props still expose
  names such as `rightSidebarOpen`, `rightSidebarDisplayWidth`, and
  `onRightSidebarCollapse`.
- Those props are currently fed by workspace projection/controller callbacks, not
  by the old persisted `rightSidebarOpen` or `rightWorkspaceSurfaceByDirectory`
  state.
- The rendered legacy right sidebar content has been removed; the persistent
  Bench host is passed through `DirectoryChatRightWorkspace`.

Interpretation:

This is not the same bug as the old right-sidebar architecture, but it makes
review harder because old and new concepts share names. The next pass should
rename these shell-level props to `rightWorkspace*` after the current state is
committed, so searches for `rightSidebar` become diagnostic-only or deleted
translation debt.

### C3. Navigation arbitration is corrected but still fragile to partial edits

Status: aligned behavior with high future drift risk.

Evidence:

- Controller navigations now allocate command and attempt IDs, register the
  attempt with the blocker, clear attempt outcomes at settlement, and build the
  committed result projection from the verified `finalRoute`.
- A newer command calls `supersedeControllerAttempts()` before starting, and
  close/set-mode/open plan against a pending navigation expectation through
  `#routeForNextCommand()`.
- The implementation still relies on several mutable private fields:
  `#activeCommandID`, `#registeredAttempts`, `#controllerAttempts`,
  `#activeAttempts`, and `#outcomes`.

Interpretation:

The current behavior matches the remediation intent, but this area is easy to
break because the transaction model is spread across the controller, blocker,
store pending intent, and router callback. The next pass should add a small
command-attempt state machine or at least a more explicit internal type around
attempt lifecycle states so the valid transitions are visible in one place.

### L1. Lifecycle publication and action completion are now serialized through one service

Status: current implementation aligned.

Evidence:

- `DirectoryWorkspaceLifecycleService` owns surface registration, fallback
  provider selection, context publication, active-session transition, lease
  generation, action completion, and disposal closeout.
- Ordinary publication and client-action completion both enter `#publishQueue`.
- Committed action completion captures the observed route, visibility, drawer,
  and matching context snapshot before waiting behind the queue.
- Completion rechecks frontend-known active session immediately before HTTP
  submission and retries only when a conflict is caused by lease replacement.
- Disposal captures the current session and lease, publishes final closed context,
  then releases the captured lease.

Interpretation:

The current shape fixes the most important context/action race class. It should
not be replaced with React-effect repair logic or caller-side context reads. The
follow-up refactor can simplify this code, but should keep the single serialized
publication boundary.

### L2. Lifecycle service has too many responsibilities in one class

Status: maintainability drift, medium future risk.

Evidence:

- One class currently owns registration selection, leave guard delegation,
  active-session arbitration, lease lifecycle, publication dedupe, sequence
  allocation, action completion, and disposal cleanup.
- The responsibilities are internally coherent because they share ordering, but
  the class is now large enough that future edits can accidentally bypass the
  serialized queue or read mutable current projection in the wrong place.

Interpretation:

This is not a correctness bug in the current state. The next refactor should
split the lifecycle implementation internally while preserving one public
directory-owned lifecycle boundary. A reasonable split is:

- `BenchSurfaceRegistry`: registrations, newest matching target selection, leave
  guard lookup, route fallback.
- `BenchPublicationCoordinator`: queue, publication keys, sequence allocation,
  dedupe, snapshot publication.
- `BenchClientLeaseManager`: instance ID, generation, accepted lease, release.
- `BenchActionCompletionCoordinator`: completion capture, active-session recheck,
  conflict/retry handling.

The important rule is that callers still see one lifecycle service; the split is
for implementation clarity, not a new set of writable authorities.

### L3. Backend broker and context registry match the bounded protocol

Status: current implementation aligned.

Evidence:

- The broker keeps authoritative directory leases and validates completion lease
  identity.
- Required actions are retained until completion, cancellation, or expiry.
- Best-effort actions are live-only and do not create backend completions.
- Terminal broker tombstones are bounded and expire.
- Context idempotency and per-lease sequence histories are bounded.
- SSE multiplexing is pull-driven, so downstream demand controls upstream reads.

Interpretation:

This part does not point to a wrong architecture. It is the expected backend half
of the typed, at-least-once, idempotent client-action protocol.

### L4. The documented best-effort divergence is not the cause of the P1 required-action bugs

Status: divergence accepted for now.

Evidence:

- `bench-refactor.divergences.md` only changes how best-effort actions coalesce
  while active session is unknown.
- The recent visible timeout failures involved required `bench_present`
  completion: stale route projection and context target identity mismatch.
- The current client ledger treats best-effort actions as live-only and records
  no backend completion for them.

Interpretation:

The divergence may deserve a small focused test set, but it is not evidence that
the required-action architecture is wrong. If backward compatibility is not
required, this divergence can also be removed later by adding an explicit
best-effort coalescing field to the wire contract or by dropping hydration
coalescing for best-effort actions entirely if product behavior allows it.

### R1. Route and rendering ownership now match the stable-host requirement

Status: current implementation aligned.

Evidence:

- `/$directory` mounts `DirectoryWorkspaceProvider`, `DirectoryNotebookRouteProvider`,
  and `DirectoryWorkspaceRoot`.
- `/$directory/chat` renders `null`; it does not mount a second chat shell.
- `/$directory/_bench` validates the Bench search mode and renders only an
  outlet.
- `DirectoryWorkspaceRoot` renders one `DirectoryChatShell`, one
  `DirectoryChatBenchPageLayout`, one `DirectoryChatRightWorkspace`, and one
  target-keyed Bench outlet boundary.
- The target boundary key comes from `workspace.projection.bench.targetKey`, not
  docked/floating mode.

Interpretation:

This closes the old sibling-shell/remount architecture. The follow-up refactor
should preserve this shape and focus on simplifying names and internals rather
than moving route ownership again.

### R2. Generic renderer boundary is corrected, but should stay explicit

Status: current implementation aligned with a useful guardrail.

Evidence:

- `useWorkspaceFileOpen` still calls `useOpenBench`, but `useOpenBench` now uses
  optional workspace context and returns a typed `inactive` result outside a
  directory workspace.
- Non-Bench actions such as copy, reveal, and default-app open do not require a
  directory workspace provider.

Interpretation:

This is the correct boundary for generic markdown/media renderers. The follow-up
refactor should keep the optional hook contract and add a naming hint such as
`useOptionalOpenBench` or an explicit result helper so future callers do not
assume render-time workspace context is mandatory.

### R3. Visual layout still owns some local DOM state, but not semantic Bench state

Status: acceptable visual state, low correctness risk.

Evidence:

- `DirectoryChatBenchPageLayout` owns floating chat rectangle, resize observation,
  pointer capture, and inert toggles.
- Semantic transitions still flow through controller props such as
  `onChatLayoutModeChange`, `onDockedBenchLayout.onCollapse`, and workspace
  projection.
- No semantic close/open waits on CSS transition events or DOM transition
  callbacks.

Interpretation:

This is consistent with the plan: animation visualizes state and layout controls
geometry. The next pass should avoid moving semantic state into this component.
If anything changes here, it should be naming cleanup and focused tests for
inert/focus behavior.

### S1. Old live sidebar state appears removed from active stores

Status: current implementation aligned.

Evidence:

- No active `rightWorkspaceSurfaceByDirectory`, `rightSidebarTab`, or old
  `BenchAutoOpen` component/state path was found under `packages/web/src`.
- `ui-preferences` no longer persists right-sidebar state.
- `directory-workspace-store` persists only `visibility` and `lastDrawer`, with a
  versioned payload.
- Tests explicitly verify legacy or mismatched workspace persistence is ignored.

Interpretation:

The old mutually exclusive surface algebra does not appear to be live anymore.
The remaining cleanup is naming and stale documentation, not a second writable
state source.

### S2. Stale names and historical docs can still mislead future work

Status: documentation/API drift, medium future risk.

Evidence:

- Active shell/titlebar props still use `rightSidebar*` names for the new right
  workspace.
- `packages/web/src/i18n/en.ts` still contains old `rightSidebar.*` strings for
  DevTools/historical diagnostic material.
- Historical docs still contain pre-refactor guidance for `BenchAutoOpen`,
  transcript-driven presentation, and old `useOpenBench` ownership, although
  some have warnings at the top.

Interpretation:

Because backward compatibility is not required, the next pass should rename or
delete these surfaces rather than preserve adapters. The goal is that a search
for `rightSidebar` or `BenchAutoOpen` only finds archived docs or nothing active.

### T1. Focused race coverage exists, but real Back/Forward coverage is still a gap

Status: acceptance coverage gap.

Evidence:

- Tests cover StrictMode hydration replay, titlebar right-toggle behavior,
  delayed navigation supersession, same-destination attempts, close origin,
  lifecycle completion capture, session transition ordering, reconnect sequence
  reset, stable layout identity, and SSE backpressure.
- The grep survey did not find a real `popstate`, browser `history.back`, or
  browser `history.forward` test for Bench blockers/history behavior.
- `bench-refactor.md` explicitly says not to claim Back coverage from TanStack
  memory history because its `go` path does not exercise blockers.

Interpretation:

This is not proof of a current bug, but it is a completion gap for the next
hardening/refactor pass. Back/Forward should be tested in a real browser harness
or an equivalent popstate-capable environment before the architecture is treated
as locked.

### T2. Remaining timers are not Bench orchestration timers, but should stay scoped

Status: acceptable with guardrails.

Evidence:

- The only Bench-related timers found in active source are the backend required
  action expiry timer, Markdown autosave/leave-guard waiting, Markdown save
  debounce, and local UI feedback delays such as flashcard leech warning.
- No close/open command path waits on `transitionend`, CSS duration, or DOM
  transition callbacks.

Interpretation:

These timers do not recreate the old animation-driven semantic sequencing. The
next refactor should keep this distinction explicit: timers may support local
surface behavior or the backend expiry circuit breaker, but not authorize or
sequence Bench route/workspace transitions.

## Final Refactor Plan

This should be a drift-hardening refactor, not another architecture replacement.
The current architecture is the right shape: stable directory root, one
controller command boundary, one lifecycle publication boundary, one backend
broker, and one rendered Bench outlet. The follow-up should make that shape
harder to partially violate.

Backward compatibility is not required, so prefer deletion and direct renames
over adapters.

### Phase 0: Commit the current working baseline

Commit the current state before starting this pass. The current implementation
works and already contains the important remediation fixes. The next pass should
be reviewable as cleanup/hardening on top of a known-good baseline.

### Phase 1: Lock behavior with missing tests first

Add or strengthen tests before renaming internals:

- Real Back/Forward/popstate coverage for Bench target exit/replacement and
  blocker behavior.
- Direct route navigation during an async controller attempt.
- Directory disposal while a route guard or action completion is awaiting.
- Inert/focus behavior for parked and hidden Bench hosts.
- A small best-effort hydration coalescing test for the current documented
  divergence, or delete the divergence and test the replacement behavior.

Do this before structural cleanup so regressions are caught while moving code.

### Phase 2: Delete or rename legacy presentation surfaces

Because compatibility is not required:

- Rename active `rightSidebar*` shell/titlebar props to `rightWorkspace*`.
- Rename data attributes and test selectors where they refer to the new
  workspace, except where an external UI selector must intentionally stay.
- Delete unused `rightSidebar.*` i18n strings unless DevTools still consumes
  them; if DevTools consumes them, rename them to DevTools-specific keys.
- Move stale historical Bench docs under an archived folder or add stronger
  "historical only" headers where they must remain.
- Make `rg "rightWorkspaceSurfaceByDirectory|BenchAutoOpen|rightSidebarOpen"`
  a useful audit command by ensuring active matches are either gone or clearly
  intentional.

### Phase 3: Make command/navigation arbitration explicit

Keep `DirectoryWorkspaceController` as the public command boundary, but reduce
the chance of future stale-command bugs:

- Introduce an internal `NavigationAttemptState` union for registered, guarding,
  allowed, blocked, failed, superseded, and settled states.
- Move attempt lifecycle transitions into one helper module or nested class.
- Keep route/store pending intent as the projection bridge, but make the
  controller result path always accept an explicit observed route instead of
  defaulting to `#currentProjection()` after async boundaries.
- Add assertions or exhaustive switches around command terminal outcomes.
- Keep `useOpenBench` as a thin optional boundary; no caller may compute open
  policy.

### Phase 4: Split lifecycle internals without splitting authority

Keep one public `DirectoryWorkspaceLifecycleService`, but split private
responsibilities:

- `BenchSurfaceRegistry` for registrations, newest matching target lookup,
  fallback context, and leave guard selection.
- `BenchPublicationCoordinator` for queueing, dedupe keys, sequence allocation,
  and publication writes.
- `BenchLeaseManager` for instance ID, generation, accepted lease, and release.
- `BenchActionCompletionCoordinator` for captured completion snapshots,
  active-session rechecks, conflict retry, and terminal interpretation.

The split must not expose new writable owners to React components. React effects
may call lifecycle methods, but they should not repair semantic state directly.

### Phase 5: Decide the best-effort divergence

Pick one of these and document it:

- Keep the current frontend-derived coalescing key and add focused coverage.
- Add an explicit best-effort coalescing key to the shared action contract.
- Drop best-effort hydration coalescing if product behavior does not need it.

Since backward compatibility is not required, do not keep the current divergence
just to avoid a protocol change.

### Phase 6: Refresh docs around the actual architecture

After code cleanup:

- Update `current-architecture.md` to use the final names.
- Keep `bench-refactor.md` as historical architecture intent if useful, but mark
  the current hardening doc as the implementation audit/cleanup plan.
- Remove or archive stale implementation logs that still describe transcript
  auto-open or old route ownership as current behavior.
- Keep `bench-refactor.divergences.md` short; every remaining divergence should
  be intentional and tested.

### Phase 7: Verification

For code changes:

- Run the focused web tests touched by command, lifecycle, rendering, and
  persistence changes.
- Run focused Buddy backend tests touched by broker/context/event stream changes.
- Run `bun lint`.
- Run root `bun typecheck`.

For markdown-only updates, no root typecheck is required.

## Size Assessment

This is a medium cleanup/hardening refactor, not a full architecture rewrite.

The risky parts are test harness work for real Back/Forward behavior and the
controller/lifecycle internal splits. The product behavior and ownership model
should remain the same. The fact that backward compatibility is not required
should make the cleanup smaller because old prop names, stale i18n keys, and
historical adapters can be deleted or renamed directly.

## Bottom Line

The bugs fixed after `bench-refactor.md` were mostly caused by implementation
drift at async boundaries, not by a bad target architecture. The follow-up should
therefore make the architecture enforceable: fewer misleading names, fewer large
classes with hidden state transitions, stronger tests around real navigation and
session/reconnect races, and no compatibility layer for the old right-sidebar
model.
