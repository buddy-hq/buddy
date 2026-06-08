# Dynamic Tool Session-Liveness Note

## Context

Buddy dynamic learning tools are pre-registered plugin tools that are hidden by default.

The intended runtime flow is:

1. `learning_tool_search` returns candidate dynamic tool IDs.
2. `learning_tool_load` grants exact session-scoped permission for selected IDs.
3. The newly granted dynamic tool becomes callable in the same ongoing session flow.

Examples:

- `reflection_dynamic`
- `stepwise_solve_dynamic`

## Bug We Hit

During the OpenCode `v1.16.2` fetch, dynamic tool loading appeared to succeed, but the tool could still be unavailable immediately after load.

Observed symptom:

- `learning_tool_load` returned success and reported the tool as exposed.
- The next model step still saw the tool as unavailable.
- This was especially visible with `stepwise_solve_dynamic`.

The issue was not the catalog entry or the permission rule itself. The issue was session liveness.

## Root Cause

OpenCode's loop keeps a session object in memory while the run is active.

`learning_tool_load` updates session permissions through `Session.setPermission(...)`, which writes the new allow rule to storage. But the loop can keep using the older in-memory session object when rebuilding tool availability for the next step.

That means:

- storage had the new allow rule
- the active loop still filtered tools against stale `session.permission`

So Buddy could report "tool loaded" while the tool-use layer still excluded that tool for the next step.

## What We Did

We fixed this in the adapter layer instead of patching vendor code directly.

Implementation location:

- [session-live.ts](../src/session-live.ts)

What the adapter now does:

1. Maintains an identity-stable live session cache for the vendored `Session.Service`.
2. Patches the vendored session service methods used by the runtime:
   - `create`
   - `list`
   - `fork`
   - `get`
   - `setTitle`
   - `setArchived`
   - `setPermission`
   - `children`
   - `remove`
3. Ensures `setPermission(...)` mutates the cached live session object in place.
4. Keeps the public adapter-facing `canonicalizeSession(...)` path cloned so external callers do not accidentally mutate the cache.

Bootstrap wiring:

- [runtime.ts](../../buddy/src/opencode-runtime/runtime.ts)

The practical effect is that when `learning_tool_load` grants a dynamic tool, the currently running session loop sees the updated permission state on the next step instead of continuing with stale permission data.

## Why This Works

The dynamic tool registry was already correct: the tools were present and pre-registered.

The missing piece was making the active session observe permission changes quickly enough for the same prompt/run cycle.

This patch gives the vendored runtime a live session object while preserving cloned read behavior for normal adapter consumers.

## Trade-Offs

### 1. Adapter-level monkey patching

This depends on the shape and behavior of the vendored `Session.Service`.

If upstream changes that service surface or how session state is threaded through the run loop, this patch may need revision.

### 2. Shared mutable state inside the runtime path

The vendored runtime now sees identity-stable live session objects.

That is intentional, but it means some code can observe in-place updates instead of receiving a fresh immutable snapshot.

The public adapter path still returns clones, but the internal/public distinction is now important.

### 3. Partial method coverage

We patched the session methods relevant to this failure mode.

If a future runtime path depends on another session mutation method becoming immediately visible in-memory, we may need to extend the patch.

### 4. Process-local consistency only

This solves the active-process problem.

It does not create cross-process coherence. If another process modifies the same session row, this in-memory object does not automatically refresh.

Given Buddy's single-user, single-machine assumption, this is acceptable for now.

### 5. This is still not the deepest fix

The cleaner upstream design would be for the active loop to refresh session state before rebuilding tools, or to avoid holding stale session state across steps.

We did not patch vendor code for that.

## What To Recheck On The Next Upstream Fetch

When fetching upstream again, verify these points before trusting dynamic tools:

1. Confirm the vendored session loop still holds a long-lived session object.
2. Confirm `Session.setPermission(...)` still does not automatically refresh that object.
3. Run a real HTTP smoke, not just unit tests:
   - create a real session
   - prompt the model to call `learning_tool_search`
   - then `learning_tool_load`
   - then call `reflection_dynamic`
   - repeat with `stepwise_solve_dynamic`
4. If upstream fixes session liveness directly, remove this adapter patch rather than layering another one on top.

## Known Good Smoke Shape

A known-good smoke is a single real prompt run where the model does all of the following successfully:

1. `learning_tool_search`
2. `learning_tool_load`
3. dynamic tool execution
4. final assistant text

This was explicitly verified over Buddy's HTTP API with `curl` for both:

- `reflection_dynamic`
- `stepwise_solve_dynamic`

If either of those falls back to "loaded but unavailable", inspect `session-live.ts` first.
