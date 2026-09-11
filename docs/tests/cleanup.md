# Test cleanup — durable lessons and Phase 5

Phases 1–4 of the 2026-08 test cleanup are done. Chronology, commit counts, and branch names are git history, not active procedure. Authoring rules also live in `.agents/skills/writing-buddy-tests/SKILL.md`.

## Durable lessons

- Require a realistic regression, observable behavior, or explicit runtime contract.
- Search for the nearest existing coverage before adding or retaining a test; extend or parameterize instead of duplicating.
- Prefer public behavior over implementation choreography. Skip behavior TypeScript already guarantees.
- Delete source-reading, self-derived, vacuous, redundant, and coverage-chasing tests.
- Use the cheapest boundary that still proves the behavior; keep a higher-level wiring guard when logic moves down.
- Preserve isolation and deterministic cleanup. Never fix flakes with sleeps, larger timeouts, retries, or weaker assertions.
- Measure the same command and scope before claiming a performance improvement.
- Use package test scripts with the required preload and isolation, not raw `bun test`.
- Do not run vendor tests or the full suite for ordinary changes.

## Phase 5: measured performance and flake work

Do not start with another broad deletion audit. Start with measurements.

1. Record baseline wall time and per-process/file time using the exact supported package commands.
2. Rank the slowest files and repeated setup costs; do not assume file length alone implies cost.
3. Reproduce any suspected flake in escalating conditions: isolated, repeated, normal neighbors, ordering, then CI-like contention.
4. Fix only demonstrated causes such as arbitrary waits, uncontrolled clocks, mutable global state, missing cleanup, or unnecessary process-heavy setup.
5. Re-run under the same reproduction conditions and then run the surrounding focused package scope.
6. Report before/after measurements honestly. Do not claim speedups from static inspection.

Likely areas to measure, not pre-judged fixes: the serial Web process runner; large directory-workspace, Bench renderer, media renderer, whiteboard program, and Bench presentation files.

Separate later initiatives (not Phase 5): macOS and Windows unit-test CI; an active Playwright/Electron E2E harness; coverage reporting; `act(...)` warnings that correspond to uncontrolled async behavior.
