# Dynamic Tool Session-Live Patch Hypothesis

## Context

Buddy's production dynamic tool design assumes this same-turn sequence works:

1. model calls `learning_tool_search`
2. model calls `learning_tool_load`
3. Buddy appends an exact session-scoped allow for the selected dynamic tool
4. the next model loop sees that dynamic tool as callable
5. model calls the dynamic tool in the same assistant turn

The relevant production code is:

- `packages/buddy/src/learning/tools/dynamic-tool-search.ts`
- `packages/buddy/src/learning/tools/dynamic-learning-tool-grants.ts`
- `packages/buddy/src/learning/tools/dynamic-learning-tool-permissions.ts`

The dynamic-tool migration notes document this assumption:

- `docs/plans/intent-dynamic-tool-migration-notes.md`

## Hypothesis

The current implementation fails because the live OpenCode prompt loop captures one `session` object before entering its `while (true)` loop and keeps reusing that object for later tool-resolution passes in the same assistant turn.

If that `session` object does not update in place after `Session.setPermission(...)`, then:

- `learning_tool_load` can successfully persist the exact allow rule
- the dynamic tool can be present in the registry
- but the next loop iteration can still resolve tools against stale `session.permission`

This would explain why:

- registry-level and direct-execution smoke tests pass
- real search -> load -> call traces can still fail or loop

## No-Vendor Salvage Strategy

Do not edit vendored OpenCode files.

Instead, patch the live `Session.Service` instance from Buddy-owned code so that:

1. `get`, `create`, and `fork` return canonical cached `Session.Info` objects
2. `setPermission` mutates the canonical cached object in place after persisting the new ruleset

If the vendored prompt loop holds a reference to that canonical cached session object, then later loop iterations in the same assistant turn should observe the updated `session.permission` without requiring a vendor patch.

## Changes To Prove Or Disprove The Hypothesis

### Runtime Patch

Add a Buddy-owned `Session.Service` patch in `packages/opencode-adapter` that:

- grabs the live OpenCode `Session.Service` instance
- wraps `get`, `create`, and `fork`
- caches returned session objects by `session.id`
- wraps `setPermission`
- mutates the cached session object's `permission` field in place after the original persistence call succeeds

### Bootstrap Hook

Install the session patch before the OpenCode server is built, so the live server path and the Buddy-side session wrapper both use the patched service.

### Regression Tests

Add two focused tests:

1. a service-level test proving that `Session.setPermission(...)` mutates an already-returned session object in place
2. an end-to-end Buddy message-route test that drives the real same-turn flow:
   - model calls `learning_tool_search`
   - model calls `learning_tool_load`
   - the next model request must see `learning_dynamic_pedagogy_reflection` in its tool list
   - model calls that dynamic tool in the same assistant turn

## Expected Outcomes

### If The Hypothesis Is Correct

- the service-level test passes after the patch
- the end-to-end same-turn dynamic-tool test passes after the patch
- the current `search -> load -> call` architecture can be kept without touching vendored source files

### If The Hypothesis Is Wrong

One or both of these will still fail after the patch:

- the dynamic tool will remain absent from the next model-visible tool set
- the next loop will still fail to call the loaded dynamic tool in the same assistant turn

If that happens, the remaining options are:

- patch a different OpenCode runtime seam from Buddy-owned code
- accept a non-first-class dynamic execution path
- or patch vendored OpenCode directly

## Results

Focused validation passed.

What passed:

1. Service-level proof:
   - `Session.setPermission(...)` mutates an already-returned session object in place.
   - A later `Session.get(...)` returns the same canonical object reference.

2. Real same-turn message-route proof:
   - Buddy receives a user message through `/api/session/:id/message`
   - the mocked model calls `learning_tool_search`
   - then calls `learning_tool_load`
   - Buddy persists the exact allow rule for `learning_dynamic_pedagogy_reflection`
   - the next outbound provider request includes `learning_dynamic_pedagogy_reflection` in its tool list in the same assistant turn

What this means:

- the Buddy-owned session-live patch is sufficient to preserve the current `search -> load -> call` architecture without editing vendored OpenCode source
- the earlier production traces are more likely explained by model-contract / prompt ambiguity than by an unavoidable runtime limitation

Important testing note:

- the `/api/session/:id/message` route returns the final assistant message payload, not the full intermediate tool-call transcript for every loop step
- the correct place to verify same-turn dynamic exposure is the captured outbound provider request after `learning_tool_load`, not the final route JSON alone
