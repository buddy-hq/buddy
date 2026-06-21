# Bench Context Target Identity Postmortem

Date: 2026-06-21

Status: ready for review

## Purpose

This document records the Bench required-action timeout bug where the UI opened
the requested book/resource, but the agent-facing `bench_present` action timed
out or conflicted on the first attempt and then succeeded on retry.

It explains:

- The user-visible failure.
- The exact implementation fragility that allowed the failure.
- Why the local fix works but is not the right long-term shape.
- A systemic refactor plan that aligns with `bench-refactor.md`.

This document is intentionally narrower than `bench-refactor.md`. It focuses on
the target identity and model-context publication boundary that caused this
specific bug.

## Source Documents

- `docs/features/bench-mode/bench-refactor.md`
- `docs/features/bench-mode/bench-refactor-implementation-drift-audit.md`
- `docs/features/bench-mode/bench-toggle-strictmode-postmortem.md`
- `packages/web/src/lib/directory-workspace-lifecycle.ts`
- `packages/web/src/components/bench/bench-route-context.tsx`
- `packages/web/src/components/bench/bench-context-utils.ts`
- `packages/web/src/components/directory-chat/directory-workspace-root.tsx`
- `packages/web/src/lib/directory-workspace-controller.ts`
- `packages/web/src/lib/directory-workspace-client-actions.ts`

## User-Visible Failure

The reproducible flow was:

1. Bench is currently showing a markdown file, image, SVG, or another file-like
   surface.
2. The user asks the model to open a book/resource on Bench.
3. The UI visibly opens the book/resource.
4. The Bench tool result reports that the client did not acknowledge the command
   in time, or the frontend reports a completion conflict.
5. The model retries the same `bench_present` action.
6. The second attempt succeeds because the UI and context state have caught up.

The important symptom is that the side effect happened on the first action, but
the action completion protocol could not accept the completion. That means the
bug was not simply "navigation failed." The frontend reached the requested route,
but the context snapshot submitted with the action did not match the route.

## What Was Ruled Out

### Not the StrictMode Disposal Bug

This was not the same class as
`bench-toggle-strictmode-postmortem.md`.

The StrictMode issue involved development-only mount/unmount replay clearing a
newer directory workspace owner or disposing live services. In this bug,
diagnostics showed the directory workspace services remained alive and the route
transition reached the requested book/resource. The conflict happened later,
when action completion attempted to publish a synchronized context snapshot.

The relevant failure was a route/context target mismatch, not lost ownership of
the workspace instance.

### Not Merely a Stale Route Ref

An earlier diagnosis suggested that completion used a stale route ref after
navigation. That can be a real class of bug, and the controller now returns the
verified `finalRoute` from navigation. However, the reproduced failure still
occurred after that fix.

The logs showed:

- `observedRoute` was already the requested object/resource route.
- The submitted `context.target` still described the previous workspace file.
- Backend completion rejected the action because route and context did not agree.

So the decisive bug was not "the controller returned the old route." It was
"the lifecycle service enriched the correct route with a stale surface
registration snapshot."

## Architecture Intent From `bench-refactor.md`

The relevant architectural rules from `bench-refactor.md` are:

- URL owns the Bench target and docked/floating mode.
- Context publication must be keyed by semantic target identity and semantic
  revision, not by provider object identity.
- Registration is an optimization over a route-derived fallback.
- A visible route must always be able to produce a synchronous loading context.
- Action completion must capture final route, effective projection, and
  synchronized context before reporting success.
- The agent may only be told `presented` after UI and model context agree.

The intended model is:

```text
canonical route target
  -> synchronous route fallback context
  -> optional richer surface registration if it proves the same target
  -> serialized publication/action completion
```

The implementation had most of this shape, but one invariant was missing:

```text
selected registration target key must match snapshot.context.target
```

Without that invariant, lifecycle could select a registration by one target and
publish context for another.

## Current Code Shape

### Canonical Route Target

`BenchTarget` is the canonical identity used by route, controller, action
commands, and projection:

```ts
type BenchTarget =
  | { type: "workspace-file"; path: string; viewer: "markdown" | "file" }
  | { type: "object"; ref: BenchObjectRef; viewID: string }
```

`benchTargetKey(target)` creates the canonical target key. It includes:

- file viewer and path for workspace files
- object kind
- object ID
- revision ID
- item ID
- view ID

This is the identity the controller and lifecycle are supposed to compare.

### Model Context Target

Published Bench context uses a richer target shape inside
`BenchReadContextOutput`:

```text
BenchReadContextOutput.status = "open"
BenchReadContextOutput.target = BenchContextTarget
```

That target includes model-facing and UI-facing fields:

- title
- workspace root
- route string
- status such as loading, ready, dirty, error
- file absolute path for workspace files
- object ref and view ID for objects

This shape is good for model context. It is not a canonical navigation identity.
It contains additional presentation/status data, and in the file case it does not
carry the `viewer` field that `BenchTarget` requires.

### Surface Registration API

The lifecycle registration API currently separates the registration target from
the snapshot payload:

```ts
type BenchSurfaceSnapshot = {
  semanticRevision: number
  context: BenchReadSurfaceContextOpenOutput
}

type BenchSurfaceRegistrationInput = {
  target: BenchTarget
  getSnapshot: () => BenchSurfaceSnapshot
  subscribe: (listener: () => void) => () => void
  guardLeave?: (...)
}
```

`DirectoryWorkspaceLifecycleService.registerSurface` stores
`targetKey: benchTargetKey(input.target)`. Later,
`#readPublishSnapshotForObservation` selects the newest registration by that
target key.

Before the local fix, selection by `registration.targetKey` was treated as proof
that `registration.getSnapshot().context.target` described the same target.

That proof was invalid.

### Registration Hook

`useRegisterBenchContextProvider` gets the canonical target from parent route
context:

```ts
const benchContext = useBenchRouteContext()
const target = benchContext.state.target
```

But the snapshot body comes from a provider supplied by the child surface:

```ts
const getSnapshot = useCallback(
  () => ({
    semanticRevision: semanticRevisionRef.current,
    context: providerRef.current.read(),
  }),
  [],
)
```

This means the registration identity and snapshot body are not produced by the
same source of truth.

During normal steady state, that is fine. During route/Outlet replacement, it can
temporarily combine:

```text
new parent route target + old child provider payload
```

That exact invalid pair caused the bug.

## Exact Failure Mechanism

The failing transition was file/image/SVG/markdown to book/resource.

The sequence was:

1. A required `bench_present` action arrived through the frontend client-action
   ledger.
2. The ledger called `DirectoryWorkspaceController.execute({ type: "present" })`.
3. The controller navigated to the object/resource route and returned a committed
   result with the correct `observedRoute`.
4. The ledger asked lifecycle to complete the action.
5. Lifecycle called `#readPublishSnapshotForObservation` using that observed
   route.
6. Lifecycle derived the expected object `targetKey` from `observedRoute.target`.
7. `#selectedRegistration(targetKey)` returned a registration whose stored
   target key matched the object target.
8. `registration.getSnapshot()` returned a context whose embedded target still
   described the previous workspace file.
9. Lifecycle submitted a completion body where:

```text
observedRoute.target = object/resource book
context.target = workspace-file AGENTS.md or previous file/image/SVG
```

10. Backend rejected the completion as a conflict because route and context were
    not synchronized.
11. The required action stayed pending until the broker timed out or until a
    retry arrived.
12. On retry, the surface registration and context provider had caught up, so
    the same logical command succeeded.

This explains the observed behavior:

- First tool call changes Bench but fails to acknowledge.
- Second tool call reports success because it is now reading a settled state.

## Why This Is Fragile

### 1. Two Identity Shapes Represent One Concept

The code has both:

- `BenchTarget`: canonical route/action identity.
- `BenchContextTarget`: model context target plus status/presentation fields.

They overlap but are not equivalent. The current patch had to add a helper that
converts `BenchContextTarget` back into `BenchTarget` for comparison. That is a
red flag.

Canonical identity should flow forward:

```text
BenchTarget -> BenchContextTarget
```

It should not be reconstructed backward:

```text
BenchContextTarget -> BenchTarget
```

Backward reconstruction is lossy. For workspace files, the context target has a
path but no `viewer`, so the helper infers markdown from `.md` and file
otherwise. That is a policy guess inside lifecycle.

### 2. Registration Identity and Snapshot Identity Can Diverge

The registration API says:

```text
this registration is for target A
```

The snapshot can still say:

```text
the live context target is B
```

TypeScript permits that pair because the snapshot does not carry canonical target
identity. Runtime code must manually detect the mismatch.

### 3. React Effect Timing Can Create Temporarily Invalid Pairs

The route target comes from a parent context. The provider payload comes from the
child route component. Route replacement, target-keyed boundaries, and effect
registration order can briefly disagree even when the final React tree is
correct.

This is normal React orchestration behavior. The architecture must make stale
children powerless, not assume they cannot exist.

### 4. Lifecycle Was Treating Registration As Authority

Per `bench-refactor.md`, registration is supposed to enrich route-derived truth.
It is not supposed to authorize target identity.

Before the fix, lifecycle effectively did:

```text
route target key matches registration target key
  -> trust registration snapshot
```

The correct rule is:

```text
route target key matches snapshot canonical target key
  -> trust registration snapshot
otherwise
  -> use route-derived fallback
```

### 5. Future Target Kinds Would Make This Worse

Adding new target kinds under the current shape requires at least three separate
places to stay aligned:

- route/action `BenchTarget`
- model context `BenchContextTarget`
- reverse comparison logic inside lifecycle

That is not extensible. Every new target kind risks another subtle
route/context mismatch unless lifecycle gets another manual conversion branch.

## Local Fix

The immediate fix added a runtime guard in
`DirectoryWorkspaceLifecycleService.#readPublishSnapshotForObservation`:

1. Select registration by expected route target key.
2. Read the registration snapshot.
3. Verify that `snapshot.context.target` semantically matches the route target.
4. If it matches, publish the registration context.
5. If it does not match, log
   `workspace-lifecycle-read-observed-snapshot-registration-target-mismatch` and
   use route-derived fallback context.

This fixed the live bug because the first completion no longer submits:

```text
observedRoute = object/resource
context.target = previous workspace file
```

Instead it submits:

```text
observedRoute = object/resource
context.target = object/resource loading fallback
```

That satisfies the action contract: UI route and model context agree on the same
canonical target, even if the rich surface provider has not finished mounting.

## Why The Local Fix Is Not The Systemic Solution

The local fix uses reverse mapping:

```text
BenchContextTarget -> BenchTarget -> benchTargetKey
```

That is defensive and useful for the current bug, but it leaves the architecture
with the wrong data flow.

Problems with keeping this as the final shape:

- Lifecycle still knows details of context target shapes.
- File viewer identity is inferred from file extension.
- New target kinds require lifecycle conversion work.
- The registration API still allows invalid identity/payload pairs.
- The invariant is enforced after the bad pair is produced, not made
  unrepresentable.

The durable fix is to make the registration snapshot carry canonical identity
directly.

## Systemic Refactor Plan

### Goal

Make this invariant mechanically enforced:

```text
Every published open Bench context has a canonical target identity that equals
the route/action target identity for the observation being published.
```

Registration may enrich context. Registration may never define target truth
separately from the route or snapshot canonical identity.

### Phase 1: Introduce Shared Canonical Context Identity Helpers

Create a shared module near the existing Bench target utilities, for example:

```text
packages/web/src/lib/bench-context-identity.ts
```

The module should own forward-only conversion and comparison:

```ts
type BenchContextIdentity = {
  target: BenchTarget
  targetKey: string
}

function benchContextIdentityFromTarget(target: BenchTarget): BenchContextIdentity

function benchContextTargetFromBenchTarget(input: {
  target: BenchTarget
  directory: string
  route: string
  status: BenchContextTargetStatus
  title?: string
}): BenchContextTarget

function benchContextRefsFromBenchTarget(target: BenchTarget): BenchContextRef[]
```

Move the existing forward builders from `bench-context-utils.ts` into this
module or make `bench-context-utils.ts` the single owner. The important rule is
that lifecycle must not reverse-parse `BenchContextTarget`.

Acceptance criteria:

- There is exactly one forward conversion path from `BenchTarget` to model
  context target/refs.
- There is no helper that reconstructs `BenchTarget` from `BenchContextTarget`
  in lifecycle.

### Phase 2: Keep The Hotfix Guard Until The Provider Contract Changes

Do not change lifecycle to trust `snapshot.targetKey` before changing the
provider API.

The current guard in `DirectoryWorkspaceLifecycleService` should stay in place
until route-bound providers can no longer produce the bad pair:

```text
snapshot.targetKey = object/resource
snapshot.context.target = workspace-file
```

This ordering matters. Adding `targetKey` to snapshots without changing provider
construction only moves the split identity from registration to snapshot. It
does not make stale `context.target` unrepresentable.

Acceptance criteria:

- The reverse-mapping guard remains active while the old provider API can return
  a full `BenchReadSurfaceContextOpenOutput`.
- No lifecycle branch treats `snapshot.targetKey` as sufficient proof until the
  hook constructs `targetKey` and `context.target` together.

### Phase 3: Make Route-Bound Provider Enrichment Mandatory

Route-owned Bench surfaces must not return full context targets. Providers should
return enrichment only. Each surface must bind its provider to the `BenchTarget`
represented by its own props/data, and the route context hook must register that
provider only while the bound target key matches the active route target key.

Using `benchContext.state.target` as both the registration target and snapshot
target is insufficient. During a route transition, an outgoing child can briefly
observe the incoming parent context. That produces a new route target combined
with the outgoing child's enrichment (for example, beta target identity with
alpha title/content). The surface-owned target binding makes that outgoing child
ineligible to register for the incoming route.

Replace this conceptual provider shape:

```ts
type BenchContextProvider = {
  read(): BenchReadSurfaceContextOpenOutput
}
```

with a route-bound enrichment shape:

```ts
type BenchSurfaceContextEnrichment = {
  targetStatus: BenchContextStatus
  title?: string
  metadata: string[]
  content: string
  refs?: BenchContextRef[]
  hints?: string[]
}

type BenchSurfaceContextProvider = {
  read(input: {
    target: BenchTarget
    directory: string
    route: string
  }): BenchSurfaceContextEnrichment
}

type BenchContextProviderRegistration = {
  target: BenchTarget
  provider: BenchSurfaceContextProvider
}
```

Then `useRegisterBenchContextProvider` or a shared builder constructs the full
snapshot:

```ts
const target = registration.target
const targetKey = benchTargetKey(target)
const routeTargetKey = benchTargetKey(benchContext.state.target)
if (targetKey !== routeTargetKey) return
const enrichment = provider.read({ target, directory, route })
const context = {
  status: "open",
  target: benchContextTargetFromBenchTarget({
    target,
    directory,
    route,
    status: enrichment.targetStatus,
    title: enrichment.title,
  }),
  metadata: enrichment.metadata,
  content: enrichment.content,
  refs: enrichment.refs ?? benchContextRefsFromBenchTarget(target),
  hints: enrichment.hints ?? [],
}
```

This makes the common route-owned provider path forward-only:

```text
BenchTarget -> targetKey
BenchTarget -> BenchContextTarget
provider -> metadata/content/refs/hints/status/title only
```

There should be no "Option A" for ordinary Bench surfaces. A provider that needs
to publish a different canonical target must be treated as an exceptional API
with a separate name and focused review. The default route-owned API must make
the invalid pair unrepresentable.

Acceptance criteria:

- Ordinary providers cannot return `context.target`.
- Ordinary providers cannot return `targetKey`.
- Ordinary providers are explicitly bound to the target owned by their surface.
- An outgoing provider is not registered under an incoming route target.
- `targetKey` and `context.target` are built together by one helper from one
  `BenchTarget`.
- Markdown, source-file, static artifact, and reading providers migrate to
  enrichment-only reads.
- No route-owned provider can publish workspace-file context while registered
  under an object route target.

### Phase 4: Change Surface Snapshots To Carry Derived Canonical Identity

After provider enrichment is mandatory, change the internal snapshot shape to
carry canonical identity derived by the hook/builder:

```ts
type BenchSurfaceSnapshot = {
  target: BenchTarget
  targetKey: string
  semanticRevision: number
  context: BenchReadSurfaceContextOpenOutput
}
```

This snapshot still contains both `targetKey` and a full `context`, but unlike
the first draft of this plan, providers do not supply those fields
independently. They are built together from one route `BenchTarget`.

`target` and `targetKey` are identity. `context.target` is model-facing payload
created from that same identity. Diagnostics may log all three, but lifecycle
must not infer identity from `context.target`.

Acceptance criteria:

- `BenchSurfaceSnapshot` is produced by one shared builder.
- The builder computes `targetKey` and `context.target` from the same
  `BenchTarget`.
- Lifecycle can compare `snapshot.targetKey` to
  `benchTargetKey(observedRoute.target)` directly.
- Lifecycle does not inspect `snapshot.context.target` to decide target identity.
- Diagnostics can still log canonical target, target key, and context target for
  drift investigation.

### Phase 5: Add Canonical Identity To The Backend/Wire Contract

The backend currently has the same reverse-identity smell as the frontend
hotfix. In `packages/buddy/src/learning/features/bench/client-actions.ts`,
`commandMatchesCommittedCompletion` reconstructs a `BenchTarget` from
`completion.context.target`, including the same `.md` viewer guess for workspace
files. In `packages/buddy/src/learning/features/bench/context.ts`, the published
context schema lacks `viewer`, `targetKey`, or another canonical identity field.

That means the backend cannot validate canonical identity without inference.
This must be fixed as part of the systemic plan.

Update the shared published open context schema to include canonical identity:

```ts
type BenchReadContextOpenOutput = {
  status: "open"
  targetKey: string
  target: BenchContextTarget
  drawer: BenchDrawerContext | null
  metadata: string[]
  content: string
  refs: BenchContextRef[]
  hints: string[]
}
```

The frontend should set `targetKey` from the same route `BenchTarget` used to
build `target`.

Backend completion validation should compare:

```text
benchTargetKey(action.command.target)
benchTargetKey(completion.observedRoute.target)
completion.context.targetKey
```

It should not reconstruct a `BenchTarget` from `completion.context.target`.

During migration, backend diagnostics may still log `context.target`, but it
should be treated as descriptive payload. Identity validation must use canonical
route/action target and context `targetKey`.

Acceptance criteria:

- The OpenAPI/runtime schema for open Bench context includes `targetKey`.
- The generated SDK reflects the schema change.
- Backend owns a canonical `benchTargetKey` helper that uses the same format as
  the frontend helper.
- Backend/frontend parity tests prove identical keys for workspace files,
  objects, null revision/item fields, encoded path/object IDs, and same-path
  markdown/file targets.
- Backend `bench_present` completion no longer infers file viewer from
  `context.target.path`.
- Backend validation distinguishes the same path opened as `viewer: "markdown"`
  from the same path opened as `viewer: "file"` through `targetKey`.
- Backend validation rejects or conflicts when `completion.context.targetKey`
  does not match the action target key.

### Phase 6: Make Lifecycle Registration Selection Snapshot-Based

Update lifecycle selection:

Current conceptual behavior:

```text
registration.targetKey matches observed route target key
  -> read snapshot
  -> publish snapshot context
```

New behavior:

```text
registration.targetKey is only an index hint
  -> read snapshot
  -> snapshot.targetKey must match observed route target key
  -> publish snapshot context
```

If the selected registration snapshot does not match, lifecycle should:

1. Log the mismatch through the existing diagnostic logger.
2. Try the next newest registration for that target key if one exists.
3. If none match, use the route-derived fallback context.

This is better than the current local fix because it does not require reverse
parsing context target. It also handles overlapping registrations more cleanly.

Acceptance criteria:

- Selection uses newest live registration whose snapshot target key matches the
  observed route target key.
- A stale newer registration cannot hide an older still-valid registration for
  the same target.
- If no registration snapshot matches, route fallback is used.

### Phase 7: Keep Route-Derived Fallback As The Correctness Floor

The fallback path is already aligned with the refactor plan:

```text
benchRouteFallbackContextFromTarget(route.target)
```

It should remain the guaranteed correctness floor for every target kind.

Required invariants:

- Every `BenchTarget` kind has a route-derived loading context.
- The fallback context uses the same canonical route target.
- Fallback context is acceptable for action completion.
- Rich surface registration is only an upgrade from fallback, never a
  prerequisite for correctness.

This is what prevents React registration timing from becoming protocol timing.

### Phase 8: Add Tests That Reproduce The Actual Race Class

Add focused tests at the lifecycle and route/provider boundary.

Required tests:

1. Lifecycle rejects a registration whose snapshot target key differs from the
   observed route target key.
2. Lifecycle falls back to route-derived loading context when the newest matching
   registration is stale.
3. Lifecycle tries an older valid registration if the newest registration for a
   target key returns a stale snapshot.
4. `useRegisterBenchContextProvider` cannot produce a snapshot whose `targetKey`
   and `context.target` are built from different canonical targets in normal
   use.
5. An outgoing surface bound to target A is not registered when the parent route
   context advances to target B.
6. Same-path `viewer: "markdown"` and `viewer: "file"` contexts validate through
   distinct canonical target keys.
7. Backend completion validation does not infer viewer from `.md`.
8. File/image/SVG/markdown to object/resource required action completes on the
   first attempt with route-derived fallback when the rich provider is not ready.
9. Object/resource to file/markdown transition has the same protection in the
   opposite direction.
10. A legacy/manual registration invalid-pair regression proves that an explicit
   stale `context.target` cannot be published even though normal providers can no
   longer create that pair.
11. Parked or hydration-pending Bench still publishes closed context as required
   by `bench-refactor.md`.

The key regression should model the exact invalid pair:

```text
registration.targetKey = object/resource target key
snapshot.context.target = workspace-file target
```

The expected completion context should be:

```text
context.target = object/resource loading fallback
```

### Phase 9: Delete Reverse Mapping Code

After provider enrichment is mandatory, snapshots are built by the shared
builder, and the backend contract validates `context.targetKey`, delete:

```text
benchTargetFromContextTarget
contextMatchesBenchTarget
```

Also delete the backend equivalent that reconstructs `BenchTarget` from
`BenchContextTarget`.

Keep diagnostics that log `context.target`, but only for debugging.

Final lifecycle rule:

```text
identity comparison uses BenchTarget/targetKey only
context target is payload, not authority
```

## Proposed Final API Shape

The final route-owned provider API should look conceptually like this:

```ts
type BenchSurfaceContextEnrichment = {
  targetStatus: BenchContextStatus
  title?: string
  metadata: string[]
  content: string
  refs?: BenchContextRef[]
  hints?: string[]
}

type BenchSurfaceContextProvider = {
  read(input: {
    target: BenchTarget
    directory: string
    route: string
  }): BenchSurfaceContextEnrichment
}

type BenchContextProviderRegistration = {
  target: BenchTarget
  provider: BenchSurfaceContextProvider
}
```

The internal snapshot can still carry the full derived result:

```ts
type BenchSurfaceSnapshot = {
  target: BenchTarget
  targetKey: string
  semanticRevision: number
  context: BenchReadSurfaceContextOpenOutput
}
```

But `BenchSurfaceSnapshot` should be produced by a shared builder, not by
surface components directly:

```ts
function buildBenchSurfaceSnapshot(input: {
  target: BenchTarget
  directory: string
  route: string
  semanticRevision: number
  enrichment: BenchSurfaceContextEnrichment
}): BenchSurfaceSnapshot
```

That builder is the only place that creates both `targetKey` and
`context.target` for route-owned surfaces.

The lifecycle publication code should look conceptually like:

```ts
const expectedTargetKey = benchTargetKey(input.route.target)
const snapshot = registry.readNewestMatchingSnapshot(expectedTargetKey)

if (snapshot) {
  return openSnapshotFromSurface(snapshot)
}

return openSnapshotFromRouteFallback(input.route)
```

Where `readNewestMatchingSnapshot` only returns a snapshot if:

```ts
snapshot.targetKey === expectedTargetKey
```

It may log, skip, or evict stale registrations, but it must not publish them.

## Relationship To The Existing Local Fix

The local fix should be treated as a guardrail, not the final architecture.

Keep it until all of these are true:

- Route-bound providers return enrichment only.
- The shared builder creates `targetKey` and `context.target` from the same
  `BenchTarget`.
- The published context wire schema carries `targetKey`.
- Backend completion validation uses `context.targetKey` instead of
  reconstructing `BenchTarget` from `context.target`.
- Lifecycle selection uses snapshot canonical identity and falls back when no
  snapshot matches.

Only then should the reverse-mapping guard be removed.

The final implementation should not need to answer:

```text
"Can I infer BenchTarget from BenchContextTarget?"
```

It should only answer:

```text
"Does this snapshot explicitly say it is for the same target key as the observed
route?"
```

## Review Checklist

Use this checklist during review of the systemic refactor:

- `BenchTarget` remains the only canonical target identity.
- `BenchContextTarget` is model context payload, not identity authority.
- Ordinary route-bound providers return enrichment only.
- Ordinary providers cannot return `context.target`.
- Ordinary providers cannot return `targetKey`.
- One shared builder constructs `targetKey` and `context.target` from the same
  surface-owned `BenchTarget`, after verifying it matches the route target key.
- Lifecycle does not infer file viewer from file extension.
- Lifecycle does not reverse-parse context target into route target.
- Backend does not infer file viewer from `completion.context.target.path`.
- Published open context includes canonical `targetKey`.
- Backend completion validates action target, observed route target, and context
  `targetKey` without reconstructing identity from `BenchContextTarget`.
- Same-path `viewer: "markdown"` and `viewer: "file"` are distinct in completion
  validation.
- The current hotfix guard stays until the provider and backend contracts are
  migrated.
- Surface snapshots include canonical target identity derived by the shared
  builder.
- Registration target key is an index hint, not sufficient proof.
- Route-derived fallback exists for every target kind.
- Action completion can succeed with fallback context when rich provider is not
  ready.
- Stale child providers cannot publish context for a new route target.
- Diagnostics use the existing Bench diagnostic logger.
- Tests cover file/image/SVG/markdown to object/resource and reverse transitions.
- Tests cover newest-stale and older-valid registration selection.
- Tests cover backend same-path markdown/file ambiguity.
- The fix is not dependent on StrictMode behavior.
- The fix does not add polling, sleeps, DOM timers, or transcript scanning.

## Bottom Line

The bug was caused by a partial implementation of the intended architecture:
route/action identity had become canonical, but surface context registration
could still publish a stale embedded target under a matching registration key.

The local fix correctly prevents bad completions by detecting route/context
target mismatch and falling back to route-derived context. The systemic fix is
to make canonical target identity flow forward into every surface snapshot and
published context payload so that neither frontend lifecycle nor backend broker
validation has to reconstruct identity from model context fields.

Once that is done, registration becomes what `bench-refactor.md` intended: an
optional enrichment over route truth, not a second authority for target identity.
