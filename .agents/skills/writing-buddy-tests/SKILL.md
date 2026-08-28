---
name: writing-buddy-tests
description: "Write, review, refactor, or clean Buddy tests."
---

# Buddy tests worth keeping

## Gate

Before writing, keeping, or changing a test, answer:

1. **Regression:** What realistic failure does this catch that no existing test catches? Name path, input, wrong result. “Coverage,” “good practice,” and “the function exists” fail.
2. **Placement:** What is the nearest coverage? Extend or parameterize the same behavior at the same boundary. Add a test only for different setup, ownership, or missing coverage. Parameterization is not a speedup.

No concrete, distinct regression: no test.

## Reject

- Compile-time-only guarantees. Runtime parsing, IPC, environment, persistence, and untyped I/O still need coverage.
- Upstream internals. Cover Buddy adapters, wrappers, and fail-closed behavior.
- Self-derived oracles: values, schemas, or snapshots copied from production.
- Implementation choreography: private calls, order, source layout, export lists, classes, counts, wrappers.
- Source scraping. Use lint, shared data, or a real integration contract.
- Coverage chasing, huge snapshots, and tests for dead code. Treat code deletion as a production change; check callers.

Assert public behavior: result, state transition, persistence, event, HTTP contract, rendered/accessibility state, platform behavior.

## Boundary

```text
pure logic → state/store/component → API/filesystem → runtime → Electron/browser
```

- Use the cheapest truthful rung. Move matrices down; keep a narrow production-entry wiring guard.
- Hard to test cheaply signals tangled design. Extract useful production logic; no test-only exports.
- Integration tests prove integration or wiring. Never mock the boundary being proved.
- Live app driving is verification, not checked-in regression coverage.

## Trust

- Independent expected values; never reproduce the production algorithm.
- Mock true boundaries, not Buddy internals.
- Share immutable infrastructure; fresh mutable state per case; failure-safe disposal.
- No real home writes, external network, arbitrary sleeps, timeout inflation, retries, permanent quarantine, or `.only`.
- Pass alone, together, and reordered. Assert order only when contractual.
- Prefer events, deferred promises, injected clocks, semantic readiness. Bounded condition waits only for genuine eventual behavior; fail diagnostically.
- Injected clocks do not freeze filesystem time, native watchers, Electron, or child processes. Avoid wall-time-expiring dates and duration assertions.
- Assert failure shape, not truthiness. UI actions must produce asserted UI state.
- Platform-sensitive contracts must run on every claimed platform.
- Process isolation is default. Group only imports/runtime state proved hermetic alone, together, reordered. More files may mean more processes.

## Cleanup, flakes, cost

- Goal: same regressions, less cost—not fewer tests.
- Apply the gate to existing tests. Similar names/counts do not prove redundancy. Wiring guards do not duplicate lower-level matrices.
- Delete only in cleanup scope with a coverage account: named same-boundary replacement or explicit accepted loss. Never delete to turn red green. Check second-order effects.
- Flakes: reproduce first. Unbroken red is a regression. Fix, re-level, or delete valueless coverage. Product race means product fix. One green run proves nothing; repeat under failing neighbors/order/load/platform.
- Never mask flakes with sleeps, retries, weaker assertions, larger timeouts, or snapshot updates.
- Measure speed with the same scope and cold/warm state. Test time differs from suite wall time. Lines, rows, moved setup, and split files are not speedups. Never weaken coverage for speed.
- Load exhaustion, infrastructure failure, and below-Buddy teardown failures need integration, monitoring, or operations—not fake unit tests.

Use repository `AGENTS.md` for mechanics and verification.
