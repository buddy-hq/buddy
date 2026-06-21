# Bench Refactor Review Remediation

Date: 2026-06-21

Status: additional session/reconnect/blocker follow-up complete

## Purpose

This document records the four verified review findings in the current uncommitted Bench refactor, distinguishes introduced regressions from a pre-existing acceptance gap, and fixes the implementation plan before code changes begin.

`bench-refactor.md` remains authoritative. When a prior implementation divergence conflicts with the remediation below, the original refactor invariants win unless this document explicitly preserves the divergence.

## Initial follow-up review candidates

The following reports were recorded before investigation, as requested. They are
unverified inputs rather than accepted findings. Duplicate reports about action
completion context and broker conflict handling are consolidated here.

1. Capture the route, projection, and Bench context when a client action command
   settles instead of reading context after waiting behind the publication queue.
2. Inspect the completion endpoint's semantic response and do not terminalize a
   client action when the broker reports `conflict` or `expired`.
3. Publish a closed Bench context before a visible directory workspace is disposed.
4. Preserve Web Streams backpressure while multiplexing the OpenCode SSE stream.
5. Bound the frontend workspace command-result history.
6. Bound backend per-session context idempotency and lease-sequence history.
7. Revalidate asynchronous surface snapshots before publishing them.
8. Ensure an already-open but parked target is revealed through the controller.
9. Preserve a close command's caller-supplied origin through leave arbitration.
10. Avoid constructing expensive Bench diagnostic details while diagnostics are
    disabled.

The classifications, evidence, chosen remediations, focused runtime coverage, and
implementation results now appear below.

## Follow-up verification and implementation plan

### Follow-up 1: action completion reads context after settlement

Classification: verified introduced regression, P2.

`completeClientAction` currently waits behind `#publishQueue` before calling
`#readPublishSnapshot`. The controller result already contains the settled route
and projection, so combining it later with a newly active target's context can
produce a completion the broker correctly rejects.

Chosen solution: capture the complete committed publication snapshot at
`completeClientAction` entry, before joining the serialized publication queue.
Build that snapshot from the completion's observed route, visibility, and drawer,
and select a registration by that observed target rather than by mutable current
projection. The queued network write consumes only the captured value.

Required test: hold an older ordinary publication in the queue, settle an action
for target A, switch current projection to target B, then verify the action request
still combines target A's route and context.

### Follow-up 2: semantic completion conflicts are reported as success

Classification: verified introduced regression, P2. The report's treatment of
`expired` as retryable is incorrect: expiry is a terminal broker state.

The typed completion response is `completed | already_completed | expired |
conflict`, but the lifecycle currently discards it and returns `true` for every
HTTP 200. Only `conflict` means the completion was not accepted. A reconnect can
replace the authoritative lease while the request is in flight, producing exactly
that response.

Chosen solution: inspect the typed response. Treat `completed`,
`already_completed`, and `expired` as terminal. Treat `conflict` as incomplete.
If the lifecycle lease changed while the conflicting request was in flight, retry
the same captured completion immediately with the new authoritative lease and its
sequence space. If the lease is unchanged, return incomplete so the bounded ledger
retains the completion for a later broker redelivery instead of terminalizing it.

Required tests: a same-lease conflict returns incomplete; a conflict caused by a
lease replacement retries with the new lease and completes; expired remains
terminal.

### Follow-up 3: directory disposal can leave model context open

Classification: verified introduced regression, P2.

The keyed directory root disposes the lifecycle and releases its lease without a
final closed publication. Clearing `activeSessionID` in
`BenchRouteContextProvider` cannot update the backend. Navigating outside a visible
Bench directory can therefore leave its last open snapshot resident.

Chosen solution: lifecycle disposal becomes an idempotent asynchronous operation.
It immediately rejects new work and unsubscribes registrations, then serializes a
final closed publication for the captured active session before releasing the
captured authoritative lease and clearing publication state. Root disposal starts
that operation after making the controller powerless.

Required test: disposing a visible lifecycle publishes closed with the current
lease before issuing lease release.

### Follow-up 4: SSE multiplexing drains upstream without demand

Classification: verified introduced regression, P2.

The multiplexer starts an unconditional `while`/`reader.read()` pump. That bypasses
the downstream stream's demand and can retain every transformed OpenCode chunk in
the Buddy process when a renderer is slow or paused.

Chosen solution: replace the pump with a pull-driven underlying source. Each
downstream pull reads at most one upstream chunk; cancellation still unsubscribes
Buddy events and cancels the reader. Initial Buddy lease events remain a small,
bounded startup enqueue.

Required test: a non-reading downstream must not drain a many-chunk upstream.

### Follow-up 5: workspace command results grow without bound

Classification: verified introduced regression, P2.

No production consumer reads an individual `commandResults` entry. The field is
used only to count diagnostics, while every controller path copies the complete
record to append a unique command ID.

Chosen solution: remove `commandResults` and `recordCommandResult` entirely. A
controller command already returns its terminal result directly, and retaining a
second unconsumed history contradicts the plan's transient-command ownership.

Required test: existing controller terminal-result tests remain the contract; no
replacement history test is needed because TypeScript proves removal of the unused
store API.

### Follow-up 6: per-session context histories grow without bound

Classification: verified introduced regression, P2.

The outer context registry is capped, but a hot session remains LRU-current while
`acceptedWrites` grows per publication and `lastSequenceByLeaseKey` grows per
accepted reconnect.

Chosen solution: cap both insertion-ordered per-session histories at 512 entries,
evicting oldest entries on accepted context writes without a cleanup timer. This
retains bounded idempotency tombstones and recent lease monotonicity while the
authoritative broker lease remains the primary stale-lease gate.

Required tests: the oldest idempotency key and oldest lease sequence become
reusable only after each history exceeds its documented bound, while recent
entries retain conflict behavior.

### Follow-up 7: asynchronous snapshots can publish out of order

Classification: verified introduced regression, P2.

The implementation widened the reviewed synchronous `getSnapshot` contract to
allow promises and reads snapshots before queue insertion. A slow target A read can
therefore enqueue after target B and receive the higher publication sequence.
Every current surface provider is synchronous; only the lifecycle wrapper makes
the contract asynchronous.

Chosen solution: restore the plan's synchronous surface snapshot and fallback
contracts. Ordinary publication reads its snapshot inside the serialized queue,
and action completion captures its snapshot synchronously before entering that
queue. This removes the reorderable await rather than adding another generation
counter around it.

Required test: the public registration type and root typecheck reject asynchronous
snapshot providers; lifecycle ordering tests cover the runtime queue.

### Follow-up 8: already-open parked targets allegedly bypass the controller

Classification: not reproducible; stale report after the original remediation.

`useOpenBench` now unconditionally calls `workspace.controller.executeOpen`.
`#executePresentCommand` explicitly maps `already-open` plus docked `parked` to the
workspace-only `reveal` command. The reported action gate no longer exists.

Validation test: add direct coverage that opening the same parked target commits an
expanded visible projection without navigation.

### Follow-up 9: close commands drop their origin

Classification: verified introduced regression, P2.

`execute` forwards options to present and set-mode, but calls
`#executeCloseCommand(commandID)` and that method hardcodes `origin: "user"`.
Agent close actions consequently reach the sole leave guard with the wrong origin.

Chosen solution: pass `DirectoryWorkspaceCommandOptions` through the close branch
and use `options.origin` when registering its navigation attempt.

Required test: an agent close invokes the guard exactly once with `origin: "agent"`.

### Follow-up 10: disabled diagnostics eagerly build hot-path details

Classification: verified performance issue, P3 rather than P2.

The storage write is gated inside `diagnosticLog`, but JavaScript constructs every
details object first. Several command/store calls compute full projections and
store snapshots solely for disabled diagnostics.

Chosen solution: allow diagnostic details to be supplied as a thunk and expose the
channel enabled check to `logBenchToggleStep`. Convert projection/store-heavy hot
path calls to lazy details so disabled diagnostics do not execute those reads or
allocations. Event descriptions that must inspect DOM targets become lazy as well.

Required test: a disabled diagnostic thunk is not evaluated; enabling the channel
evaluates it once.

## Follow-up implementation order

1. Make lifecycle snapshots synchronous, capture action context at settlement, and
   handle semantic completion responses.
2. Publish closed context during lifecycle disposal.
3. Restore SSE backpressure.
4. Remove command-result retention and bound backend context histories.
5. Preserve close origin and lazily evaluate expensive diagnostics.
6. Add the focused web and Buddy runtime tests listed above.
7. Update architecture documentation and this document with implementation results.
8. Run changed-package tests, `bun lint`, and root `bun typecheck`.

## Finding 1: StrictMode can overwrite persisted workspace intent

Classification: introduced regression, P2.

### Evidence and cause

`DirectoryWorkspaceProvider` currently creates the scoped store with hydration already marked `ready`, starts an asynchronous persistence read, and flushes current state from the persistence effect cleanup. React StrictMode replays effect setup and cleanup in development. That cleanup therefore writes route defaults before the persistence read finishes. Electron's storage adapter exposes pending writes to subsequent reads, so the replayed read observes the defaults instead of the user's saved visibility and last drawer.

Production does not replay effects, but the same ordering remains possible when a directory root unmounts before a slow persistence read settles.

This defect was enabled by the documented `Non-Blocking Initial Workspace Hydration` divergence, but the divergence did not require unsafe writes. The original plan's pending hydration boundary would have prevented the overwrite.

### Chosen solution

Restore the authoritative hydration design:

- Create the directory store with hydration `pending`.
- Mount chat immediately while keeping workspace commands queued, workspace presentation suppressed, and model-visible Bench context closed.
- Read persistence once. On success, apply persisted state or documented route defaults and mark `ready`. On failure, apply defaults exactly once and mark `failed`.
- Drain the controller's bounded hydration queue only after a terminal hydration state.
- Do not persist while hydration is pending.
- Persistence subscription cleanup only unsubscribes. Final persistence flushing belongs to confirmed directory-root disposal, protected from StrictMode replay by deferred disposal ownership.

The `Non-Blocking Initial Workspace Hydration` divergence has been removed because this remediation intentionally returns to the original plan.

### Required tests

- A StrictMode replay cannot replace an existing persisted workspace value with route defaults.
- Commands remain queued while hydration is pending and drain after `ready` or `failed`.
- Direct Bench routes use expanded defaults only when no persisted record exists.
- Pending hydration publishes model-closed context.

## Finding 2: Chat and Bench still remount across layout transitions

Classification: pre-existing behavior and refactor acceptance gap, not an introduced regression.

### Evidence and cause

`HEAD` already selected `DirectoryChatBenchPageLayout` for floating mode and `DirectoryChatShell` for docked mode, placing the same route outlet under different parent trees. The current refactor preserves that switch and adds another branch for the closed route. React therefore remounts the chat subtree and Bench target when mode or route presentation changes.

The behavior remains user-visible even though some domain state is stored outside React. Markdown edits, flashcard review phase, question-set answers and current step, zoom/scroll state, widget reload state, registrations, and other interaction state are component-local.

This is a completion blocker because `bench-refactor.md` explicitly requires one stable chat node, one stable Bench host, and one outlet position.

### Chosen solution

- Keep one directory workspace layout mounted for closed, docked, parked, and floating projections.
- Render the chat shell/pane once.
- Render the Bench outlet exactly once inside one target boundary.
- Change docked, floating, parked, and closed presentation using layout props and styling on the same mounted nodes.
- Key only the Bench target boundary by the complete canonical `benchTargetKey`; mode and visibility never participate in the key.
- Keep hidden or parked surfaces mounted but inert, non-focusable, and excluded from accessibility navigation.

No incremental dual-layout solution is acceptable because it would preserve the remount on at least one locked transition.

### Concrete implementation composition

- `DirectoryWorkspaceRoot` returns one `DirectoryChatShell` for every ready directory route. It no longer returns separate closed, docked, and floating trees.
- The shell owns one stable content-layout slot. The existing Bench page layout supplies that slot and keeps one conversation host and one right-workspace host at fixed React positions.
- In docked and closed projections, styling places the conversation on the left and assigns the derived docked workspace width to the right-workspace host. In floating projection, the same right-workspace host fills the content viewport and the same conversation host uses the floating rectangle.
- The shell's titlebar and left-sidebar nodes stay mounted. Floating mode suppresses their grid tracks and interaction instead of selecting another shell.
- `DirectoryChatBenchConversationPane` is the single chat-pane component for every projection. Its optional Bench thread-browser chrome changes as a child; the chat main pane does not change component type.
- `DirectoryChatRightWorkspace` is the single outlet owner. Floating mode hides selector chrome because the original plan forbids selector access there; parked, closed, and hydration-pending states keep the host mounted but inert and visually suppressed.
- A target boundary immediately around the outlet is keyed by `projection.bench.targetKey`. The key changes only for a complete canonical target change or target exit, never for visibility, drawer, or mode.
- `BenchRouteContextProvider` lives inside that keyed target boundary. It therefore cannot remount the chat tree, and it retains identity for docked/floating and collapse/reveal transitions of the same target.

### Required tests

- Chat component identity survives enter, explicit close, Back, target visibility changes, and docked/floating changes.
- Bench target identity survives collapse/reveal and docked/floating changes.
- Only a complete target-key change remounts the Bench target.
- Parked and hidden surfaces cannot receive focus or pointer interaction.

## Finding 3: A superseded navigation can still commit

Classification: introduced regression, P2, mandatory for refactor completion.

### Evidence and cause

The controller checks `activeCommandID` only after `navigate()` resolves. A newer command can supersede the older command while an asynchronous file, Markdown, or object route loader is still running. If the newer command observes the old committed route, it may resolve as a workspace-only close or collapse. The older navigation can then commit its URL and only afterward return `superseded`.

The reproduced terminal state is an open parked Bench route even though close returned `committed` and present returned `superseded`. Parked Bench is valid only when intentionally derived from the winning command; it is not a valid stale-command side effect.

### Chosen solution

Implement command-scoped navigation arbitration:

- Every controller navigation owns a command ID, attempt ID, expected route, and terminal deferred outcome.
- The blocker/attempt registry tracks every controller and direct navigation attempt independently rather than using one replaceable registration slot.
- Starting a newer command marks every older controller attempt `superseded` before the older attempt can authorize or finalize navigation.
- A newer command plans against both the committed route and the pending navigation expectation. Closing while a presentation is pending must cancel or supersede that router transition; it cannot be treated as a completed workspace-only close merely because the old route is still committed.
- Every continuation validates controller lifetime, command identity, attempt identity, and committed route immediately before store mutation or resolution.
- Stale attempts never repair state after committing an obsolete route. The winning command alone establishes the final route and workspace commit.

### Required tests

- Present from closed followed by close while navigation is delayed ends closed; present resolves `superseded` and close resolves `committed`.
- Target replacement followed by another target replacement commits only the newest target.
- A superseded async leave guard cannot authorize navigation.
- Different same-destination attempts retain distinct outcomes.
- Disposal makes every pending continuation powerless.

## Finding 4: `useOpenBench` reports unsuccessful opens as successful

Classification: introduced regression, P2.

### Evidence and cause

`useOpenBench` computes an open policy before calling the controller, then translates only the controller's `blocked` outcome. `failed`, `inactive`, and `superseded` fall through to the original `action: "open"` decision. Callers consequently close drawers or report success even when the route did not commit.

The duplicated policy calculation also creates two decision authorities: the hook and the controller.

### Chosen solution

- Make `DirectoryWorkspaceController` the only open-policy and command authority.
- Replace `useOpenBench`'s policy-shaped success contract with a typed result mechanically derived from `DirectoryWorkspaceCommandResult` plus the controller's resolved open decision when needed by UI callers.
- Return an opened/focused result only for a committed controller outcome.
- Preserve explicit blocked, failed, inactive, and superseded outcomes; never collapse them into a successful open decision.
- Update all callers to handle the typed terminal result. Fire-and-forget callers may intentionally discard it, but no caller may infer success before commitment.

### Required tests

- Navigation failure is reported as failure and does not close the active drawer.
- Superseded and inactive opens are not reported as opened.
- Already-open and parked-target reveal behavior remain distinguishable and successful.
- Cross-directory committed opens continue to report success.

## Implementation order

1. Restore terminal hydration and StrictMode-safe persistence ownership.
2. Establish the stable directory layout and single Bench outlet host.
3. Replace navigation attempt arbitration and add pending-aware supersession.
4. Remove duplicate policy authority from `useOpenBench` and migrate callers.
5. Add focused integration tests for the four findings.
6. Update `bench-refactor.divergences.md` and `current-architecture.md` to describe the final implementation.
7. Run focused web tests, then `bun lint`, then root `bun typecheck`.

## Completion invariants

- Hydration replay cannot mutate persisted user intent.
- One chat subtree and one canonical Bench target survive every non-target transition.
- A superseded or disposed command cannot mutate the URL, workspace store, or model context.
- No API reports an open as successful before the controller has committed its route and workspace postcondition.

## Implementation result

- Hydration now starts pending, queues commands, suppresses the workspace and model context, and cannot persist route defaults during StrictMode replay.
- The directory root now contains one persistent shell, conversation pane, right-workspace host, and target-keyed outlet boundary across closed, parked, docked, and floating projections.
- Controller and direct navigation attempts have independent identities through terminal settlement. New commands supersede older attempts and plan against pending route expectations; delayed present followed by close ends on `/chat`.
- `useOpenBench` delegates policy and execution to the controller. Its public terminal union includes a policy decision only on `committed`; blocked, failed, inactive, and superseded outcomes cannot be interpreted as open success.

## Follow-up implementation result

- Nine follow-up candidates were confirmed and fixed. The parked already-open
  report was stale: controller delegation and reveal behavior were already present;
  a regression test now locks that behavior.
- Required-action completion captures the matching route/projection/context before
  entering the publication queue. Surface and fallback snapshot contracts are
  synchronous, and ordinary reads occur inside the serialized queue.
- Completion responses are interpreted semantically. Lease-replacement conflicts
  retry against the new lease, same-lease conflicts remain incomplete, and expiry
  remains terminal.
- Directory disposal publishes closed context for the last active session before
  releasing its authoritative lease, even when child cleanup clears active-session
  state first.
- SSE multiplexing is pull-driven and preserves downstream backpressure.
- The unused Zustand command-result record was removed. Backend per-session
  idempotency and lease-sequence histories are each capped at 512 entries.
- Close commands preserve their caller-supplied origin through the router blocker.
- Projection/store-heavy diagnostics use lazy details and do no work while their
  channel is disabled.
- Focused web and Buddy runtime tests cover settlement capture, conflict/reconnect
  handling, disposal ordering, backpressure, history eviction, parked reveal,
  close origin, and lazy diagnostics: 68 web tests and 19 Buddy backend tests pass.
  Repository lint and root typecheck pass.

## Additional session, reconnect, and blocker findings

These four reports are verified implementation regressions. None is authorized by
`bench-refactor.divergences.md`; that document only covers the best-effort
hydration coalescing key and the direct-review closeout process.

### Additional finding 1: recheck active session at completion submission

Classification: verified introduced regression, P1.

The ledger checks the active session before calling the lifecycle, but completion
can then wait behind older context writes. The lifecycle currently validates only
disposal and lease identity before submitting. This violates the plan's explicit
requirement to recheck frontend-known active session immediately before required
completion and can acknowledge a committed action for an inactive session.

Chosen solution: distinguish synchronously requested frontend session from the
session whose context transition has serialized. Immediately before each HTTP
completion attempt, require the submitted completion to agree with current session
arbitration: the action's original completion is valid only while its session is
still requested; otherwise only `inactive_session` is valid. The ledger retries
arbitration immediately when the session changed during a queued attempt and
records the completion actually accepted by the broker.

### Additional finding 2: close outgoing context before session adoption

Classification: verified introduced regression, P2.

`setActiveSessionID` currently replaces the field synchronously and the React
effect separately publishes the new session. It never serializes a closed snapshot
for the outgoing session. This directly contradicts the locked session transition
rule in `bench-refactor.md`.

Chosen solution: make session changes lifecycle-owned queued transitions. Record
the requested session synchronously for action arbitration, then in the publication
queue publish closed for the outgoing session, adopt the still-current requested
session, and publish its effective context. Superseded intermediate session
requests never become authoritative.

### Additional finding 3: invalidate semantic dedupe on a new lease

Classification: verified introduced regression, P2.

`beginEventStreamLease` resets publication sequences but retains semantic
deduplication keys. The first publication under a new generation can therefore be
skipped even though the server context registry may have restarted or been
replaced. This violates reconnect-safe delivery and the plan's per-generation
sequence ownership.

Chosen solution: clear per-session publication dedupe state together with sequence
state when beginning a new lease. Lease acceptance then queues synchronization of
the authoritative active session under the new generation.

### Additional finding 4: blocker outcomes remain retained forever

Classification: verified introduced regression, P2.

Controller outcomes are read during command settlement but
`finishControllerAttempt` does not remove them. Direct-navigation outcomes have no
reader. Both paths append unique IDs to a directory-lifetime map.

Chosen solution: delete a controller outcome when its attempt finishes and never
store direct-navigation outcomes. Controller outcomes remain available only for
the interval between blocker arbitration and controller settlement.

### Additional required tests

- A session change while committed completion waits behind publication submits
  `inactive_session`, never the captured committed body.
- A transition from session A to B publishes A closed before publishing B open.
- A superseded intermediate session request is never adopted or published.
- A new lease republishes unchanged semantic context with sequence one.
- Settled controller attempts remove their outcomes and repeated direct navigation
  retains no outcomes.

## Additional implementation result

- Required completions now carry a live active-session accessor into the lifecycle.
  The lifecycle revalidates immediately before every submission, and the ledger
  re-arbitrates to `inactive_session` when a queued attempt observes a session
  change.
- Active-session changes are lifecycle-owned serialized transitions. The outgoing
  session receives closed context before the still-current requested session is
  adopted and published; superseded intermediate requests are skipped.
- Starting a connection generation clears both publication sequences and semantic
  dedupe state. Lease acceptance republishes unchanged active context at sequence
  one and flushes any pending outgoing-session tombstones first.
- Controller navigation outcomes are deleted at settlement and disposal. Direct
  route attempts never enter the retained outcome map.
- Focused lifecycle, client-action, and controller coverage passes: 33 tests and
  90 assertions. Repository lint and root typecheck pass.

## Emergency follow-up findings: generic renderers and visible-but-unacknowledged Bench

These two reports were verified after the additional remediation pass. They are
not authorized by `bench-refactor.divergences.md`.

### Emergency finding 1: generic file renderers require directory workspace context

Classification: verified introduced regression, P1.

`useWorkspaceFileOpen` is used by generic markdown and media renderers that can
render outside `DirectoryWorkspaceProvider`. It unconditionally calls
`useOpenBench`, and `useOpenBench` unconditionally called
`useDirectoryWorkspace`, so non-Bench render tests crashed at render time even
when the user never invoked a Bench action.

Chosen solution: make the Bench-open hook optional at this boundary. Inside a
directory workspace, it still delegates to the controller. Outside a directory
workspace, a requested Bench open returns the existing typed inactive terminal
result instead of throwing. Non-Bench file actions such as copy, reveal, and
default-app open remain renderable without a workspace.

Required test: rendering and invoking `useOpenBench` outside
`DirectoryWorkspaceProvider` returns `inactive` rather than throwing.

### Emergency finding 2: reading context loses the route target identity before completion

Classification: verified introduced regression, P1.

The frontend could receive and execute a required `bench_present` action, open the
book/resource on Bench, and still never settle the backend action. The reading
surface rebuilt its published context target from resource records and active
reading state, forcing resource `revisionID` and `itemID` to `null`. When the
backend action target included a concrete resource revision from the object
manifest, the broker correctly rejected the committed completion as `conflict`
because the synchronized context target no longer matched the requested command
target. The UI therefore changed, but the model waited until the 30-second action
timeout.

This is the simpler active design, not the archived backend active-session lease
gating design. The lease still only proves authoritative directory-client
ownership; the failure was in the committed context identity supplied by the
frontend.

Chosen solution: make `DirectoryChatReadingPage` publish the actual Bench route
target from `BenchRouteContextProvider` through the shared
`benchContextTargetFromBenchTarget` helper. That preserves object kind, object ID,
revision ID, item ID, and view ID exactly as the controller route/action observed
them. The reading page still uses resource metadata for title, content, status,
and refs, but the model-visible target identity now remains canonical.

Required tests:

- The shared context-target helper preserves object revision identity.
- The backend broker rejects a resource completion whose context drops the
  requested revision and resolves the tool-side completion when the context
  preserves it.

### Emergency finding 3: first navigation settlement can acknowledge the previous route

Classification: verified introduced regression, P1.

The visible failure reproduced specifically when Bench changed from an existing
file/image/svg target to a book/resource target. The first `bench_present` opened
the book in the UI but timed out; a second identical call then succeeded because
the book was already the committed route.

The controller awaited `navigate()`, verified the returned location matched the
expected destination, committed the workspace state, and then built its terminal
projection from `#currentProjection()`. In the React provider, that projection
reads `routeRef.current`, which can still contain the previous route until the
route render following navigation updates the ref. The first transition could
therefore complete with a stale md/image/svg route and context even though the
browser URL and UI had moved to the book. The backend correctly rejected that
committed completion as a command/context mismatch, leaving the action pending
until timeout. On the second call, `routeRef.current` had already caught up to
the book route, so completion succeeded.

Chosen solution: after a navigation returns and the controller verifies the
destination route, build the terminal committed projection from that verified
`finalRoute` instead of from the mutable current route ref. Store commit still
uses the normal pending-intent path; only the result snapshot used for action
completion is forced to the verified destination route.

Required test: a target replacement whose navigation returns the new location
while the provider route ref still reads the old route must resolve with a
committed projection for the verified destination target.
