# Test cleanup

Last updated: 2026-08-29

Branch: `tests-refactor`

Base: `59c48553` (`origin/main` when the work started)

Cleanup implementation head: `12e7096f`

## Outcome so far

Four phases of the test cleanup are complete and committed through `12e7096f`. Across that implementation stack since the base:

- 15 commits were added;
- 198 files changed;
- 4,753 lines were added, mostly test infrastructure and safer fixtures;
- 5,085 lines were removed;
- 18 files were deleted and 27 were added;
- the net repository change is 332 fewer lines despite adding isolation, supervision, and verification infrastructure.

The final cleanup phase alone touched 114 files, deleted 17 files, added 670 lines, and removed 2,850 lines. Its net reduction was 2,180 lines.

The result is not just a smaller suite. Test execution now reports the suites it actually runs, process isolation is explicit, temporary state is disposable, external network access is blocked during tests, selected deterministic tests run at cheaper boundaries, and obvious change-detector or implementation-only tests have been removed.

## Principles used

The cleanup was grounded in a curated local collection at `~/code/test-skills`. Its provenance and imported revisions are recorded in that collection's `README.md`.

The principal sources were:

- PostHog's official `writing-tests`, `fixing-flaky-tests`, and `maintaining-python-tests` skills;
- PostHog's Playwright and Electron testing guidance, used only for transferable principles;
- Anthropic's official testing material where it passed the quality review;
- Vercel Labs' `find-skills` skill as a discovery and screening guide, not as evidence of quality by itself.

Only attributable, first-party production sources were retained. Community packs and unrelated skills were excluded. Stack-specific PostHog, Python, Jest, and pnpm commands were not copied into Buddy.

The working rules were:

- require a realistic regression, observable behavior, or explicit runtime contract;
- search for the nearest existing coverage before adding or retaining a test;
- extend or parameterize existing coverage instead of duplicating it;
- prefer public behavior over implementation choreography;
- skip behavior already guaranteed by TypeScript;
- delete source-reading, self-derived, vacuous, redundant, and coverage-chasing tests;
- use the cheapest boundary that still proves the behavior;
- keep a higher-level wiring guard when logic moves to a lower boundary;
- preserve isolation and deterministic cleanup;
- never fix flakes with sleeps, larger timeouts, retries, or weaker assertions;
- measure the same command and scope before claiming a performance improvement.

## Initial audit

The initial static audit found several concrete problems.

### Execution and CI

- The root `test` command manually ran only Browser Contract, Buddy, and Web tests.
- Desktop Electron, OpenCode adapter, root script, and package script tests were not consistently wired into the root command.
- The root script bypassed Turbo's declared test dependency graph.
- Buddy exposed a stale `test:architecture` command for a directory that no longer existed.
- Parity tests were executed once through a contract command and again through the full Buddy/Web discovery.
- Test files in several packages were outside their TypeScript project coverage.
- CI used a single Ubuntu job. macOS and Windows release jobs built and smoke-tested artifacts but did not run the unit-test suite.
- No active Playwright E2E harness, coverage threshold, coverage artifact, or coverage report was wired.

### Isolation and cleanup

- The Buddy preload created process-scoped temporary roots without removing them.
- Many tests created temporary directories without cleanup.
- Some tests mutated environment variables or process-global runtime state without failure-safe restoration.
- A media test wrote under the real OS home directory and could leave residue after interruption.
- Live external network access was not centrally rejected for every test runner.

### Cost and determinism

- Web tests launched one serial Bun process per file. That protects isolation but makes process startup a likely cost center.
- Several very large test files mixed pure behavior with integration setup.
- Arbitrary sleeps and polling appeared in backend and frontend tests.
- The Web runner used `--only-failures`, which changed output but did not reduce executed work.
- Some tests copied production algorithms, parsed source files, asserted their own constants, or pinned incidental DOM/CSS structure.

The audit distinguished proven gaps from hypotheses. Unwired suites, cleanup leaks, duplicate parity execution, and typecheck omissions were treated as definite. Performance, race, and platform-runtime concerns were left as hypotheses until measured.

## Phase 1: truthful execution and typechecking

Phase 1 made the repository's test commands describe and execute the real test topology.

### `a6782a44 refactor(desktop): Extract builder config`

- Extracted Electron Builder configuration into an importable, testable module.
- Kept the executable configuration wrapper small.
- Included the extracted configuration in the desktop TypeScript project.

### `cbb4e87b test(infra): Make test execution truthful`

- Added supervised root, package, and isolated test runners.
- Wired Browser Contract, Buddy, Web, Electron, OpenCode adapter, and script tests into explicit topology.
- Added per-package and root TypeScript configurations for tests that were previously outside typechecking.
- Added test-process supervision, timeout/signal propagation, sandbox allocation, and failure reporting.
- Converted the Web and Buddy runners to explicit discovery and isolated execution.
- Corrected package scripts and removed the misleading Turbo dependency relationship that the root command did not use.
- Repaired tests exposed by truthful execution instead of hiding those suites again.

### `89612749 docs: Document isolated test commands`

- Corrected developer commands so Web tests use their required Happy DOM preload and isolated runner.
- Documented the supported focused-test entry points.

## Phase 2: isolation and failure-safe fixtures

Phase 2 removed filesystem, environment, home-directory, and network leakage.

### `c80bcc2f test(infra): Add disposable test fixtures`

- Added async-disposable temporary-directory and temporary-environment helpers.
- Added direct tests for cleanup and restoration behavior.

### `35672dc9 fix(media): Respect Buddy home override`

- Fixed media path handling to respect Buddy's configured/test home rather than the real OS home.
- Removed the test path that could write into the developer's home directory.

This was a necessary production correction discovered by the test isolation work.

### `2c76afc3 test(infra): Make fixtures failure-safe`

- Migrated a broad set of Buddy and adapter tests to disposable repositories, directories, environments, and runtimes.
- Made cleanup happen through structured disposal even when assertions or setup fail.
- Removed accumulated temporary-directory and global-state leaks across configuration, routes, skills, media, and runtime tests.

### `304a0795 test(infra): Block external test network`

- Added a shared test-network guard.
- Installed the guard in root/backend and Web preloads.
- Added focused tests proving external requests are rejected while intentional local traffic remains available.

## Phase 3: deterministic boundaries and safe batching

Phase 3 reduced expensive setup and timer dependence without weakening coverage.

### `5a340efc test(backend): Re-level runtime tests`

- Extracted deterministic OpenCode environment planning from process bootstrap.
- Moved path/default matrices to the pure planning boundary.
- Retained process-boundary guards for actual initialization behavior.
- Replaced timer-based abort coordination with explicit synchronization.

### `b9396685 test(web): Make timing tests deterministic`

- Injected reader scheduling so debounce and cancellation tests can advance explicitly.
- Retained one production-timer wiring guard.
- Prevented stale reader relocations after source changes.
- Replaced brittle exact floating-point timing assertions with behaviorally meaningful tolerance.

### `558337d0 test(infra): Batch reviewed pure tests`

- Kept process isolation as the default.
- Added explicit allowlisted groups only for files reviewed as hermetic and process-safe.
- Shared path normalization and group validation between Buddy and Web runners.
- Preserved signal and failure propagation.
- Converted the Web runner from untyped JavaScript to typechecked TypeScript.

An important conclusion from this phase was that splitting a large test file does not automatically make the suite faster. With the isolated runner, an extra file can mean an extra process. Files are grouped only when their imports and state are genuinely safe to share.

## Phase 4: delete bad tests and test-only code

Phase 4 applied the curated rules directly: delete obvious bad coverage, retain named observable regressions, and check second-order effects.

### `8fdbe35e refactor(backend): Prune low-value tests`

- Removed 555 net lines across 21 Buddy files.
- Deleted a disconnected dynamic-tool "end-to-end" test that never executed the tool and duplicated stronger registration/permission coverage.
- Removed stale plugin-path, registry, generated SDK surface, source-inspection, schema-shape, arbitrary responsiveness, and duplicate resource tests.
- Replaced a copied tree-hash implementation with a fixed golden vector.
- Reworked persona prompt coverage to assert rendered persona behavior instead of parsing source templates.
- Kept direct and integration coverage for hidden built-in skills, including a reviewed catalog wiring guard.
- Folded the "not an external file plugin" assertion into an existing concurrency test.
- Removed the dead `hiddenOpenCodeSkillNames` API.
- Kept the Bench presentation tests with their integration file after review showed that importing the tool was not process-pure.

### `c32fc60b refactor(platform): Prune low-value tests`

- Removed 157 net lines across Electron and OpenCode adapter tests.
- Deleted unused test-only APIs for development XDG paths, explicit prerelease lookup, and the core presentation catalog.
- Replaced self-derived URL assertions with independent expected URLs.
- Kept SDK freshness composition coverage after review showed it was a real wiring contract.
- Preserved theme identity shape without pinning vendor-specific color snapshots.

### `d96ef63b refactor(web): Prune brittle test contracts`

- Removed 1,703 net lines across 72 Web and documentation files.
- Deleted unused onboarding, sidebar, prompt-dock, and layout modules that existed only for tests or had no production callers.
- Deleted their parity and change-detector tests.
- Removed tests for CSS class names, exact DOM counts, source layout, test-only aliases, self-derived constants, and TypeScript-guaranteed shapes.
- Preserved behavior-level renderer assertions for media identity, file actions, post-load PDF actions, and store outcomes.
- Added independent POSIX/Windows workspace path coverage against the real production function.
- Restored narrow floating-chat bounds against the shared layout policy rather than a test-only wrapper.
- Preserved the full observable store state when a draft promotion targets an existing chat.
- Moved Bench viewer math into a reviewed pure test file.
- Removed a dead legacy full-text helper left behind by a deleted test.

### `ee86907e test(infra): Align checks with test boundaries`

- Moved architectural import/wiring invariants out of Bun source-reading tests and into the repository lint contract.
- Covered active-chat transition ownership, Bench navigation boundaries, subagent session wiring, and bridge installation order.
- Updated the related architecture documentation.
- Removed the brittle exact pure-group membership snapshot while retaining runner validation for stale, duplicate, overlapping, invalid, and non-local entries.
- Added the lint contract script to root test TypeScript coverage.

### `12e7096f refactor(release): Share required gate plan`

- Extracted the local release gate sequence into `script/release-required-gates.ts`.
- Made `cut-release.ts` consume that plan.
- Replaced line-oriented workflow source parsing with structured YAML assertions.
- Ensured the no-artifact-transfer invariant scans every workflow job.
- Added a contract keeping CI artifact gates aligned with the local gate plan, with formatting intentionally remaining local-only.
- Added the shared gate module to desktop script typechecking.

## Independent review and delegation

Mechanical exploration and bounded cleanup work was delegated during the session, but every returned patch and finding was verified against the repository before acceptance.

- Luna Max was used for broad, cheap candidate discovery and mechanical batches where requested.
- Agents were assigned non-overlapping scopes and were not asked to make judgment calls about what coverage should survive.
- The main review checked diffs, call sites, second-order effects, and focused tests before retaining delegated work.
- A non-priority GPT-5.6 Sol xhigh review was used at the requested checkpoint before Phase 4.
- The final Phase 4 review used four parallel Cursor Grok 4.6 xhigh sessions split across Buddy, Web, platform/adapter, and scripts/docs.

The final Cursor review produced both valid findings and suggestions that conflicted with the testing rules.

Accepted and fixed findings included:

- restoring a real Buddy catalog wiring guard for suppressed built-in skills;
- moving Bench presentation coverage back out of the pure group because its import graph has process-global side effects;
- retaining the overlay's in-process plugin contract in an existing test;
- retaining SDK freshness composition coverage;
- retaining theme identity token shape without vendor color snapshots;
- restoring Windows/POSIX path behavior at the production helper boundary;
- restoring full observable store-state and narrow-layout behavior;
- keeping local and CI release gates aligned;
- checking artifact-transfer actions across every workflow job;
- typechecking the architecture lint contract;
- removing a stale current documentation reference.

Rejected suggestions included:

- restoring exact gallery image counts;
- restoring a Tailwind `max-w-3xl` class assertion;
- restoring root-state identity as an implementation assertion instead of checking observable state;
- source-scraping `cut-release.ts` to prove it loops over the plan;
- adding more string-based checks for internal bridge implementation choreography.

The five Phase 4 commits were executed by a fresh Cursor Grok session from an exact path-by-path plan. The resulting staging boundaries and commit contents were independently verified afterward.

## Verification

The final review fixes passed these focused suites:

- Buddy: 36 tests across skill visibility, runtime plugin, and Bench presentation;
- Web: 79 tests across path handling, workspace state, layout policy, full-text rendering, and media rendering;
- Desktop Electron: 5 SDK freshness tests;
- OpenCode adapter: 3 theme tests;
- root scripts: 15 release and runner-plan tests.

Final repository gates passed:

- `bun lint`;
- root `bun typecheck`;
- `git diff --check`.

The full suite was not run. Repository policy requires focused tests for changed packages rather than the full suite. Web media tests still emit existing React `act(...)` and KaTeX quirks-mode warnings while passing; those warnings were not hidden or treated as proof of failure.

## Current repository state

All Phase 1-4 implementation work is committed through `12e7096f`.

The repository also contains these project-local delegation skills. They are development tooling and are not part of the test runtime:

- `.agents/skills/use-agy/`;
- `.agents/skills/use-cursor/`;
- `.agents/skills/use-luna/`.

## Phase 5: measured performance and flake work

Phase 5 should not begin with another broad deletion audit. It should begin with measurements.

1. Record baseline wall time and per-process/file time using the exact supported package commands.
2. Rank the slowest files and repeated setup costs; do not assume file length alone implies cost.
3. Reproduce any suspected flake in escalating conditions: isolated, repeated, normal neighbors, ordering, then CI-like contention.
4. Fix only demonstrated causes such as arbitrary waits, uncontrolled clocks, mutable global state, missing cleanup, or unnecessary process-heavy setup.
5. Re-run under the same reproduction conditions and then run the surrounding focused package scope.
6. Report before/after measurements honestly. Do not claim speedups from static inspection.

Likely areas to measure, not pre-judged fixes, include the serial Web process runner and the large directory-workspace, Bench renderer, media renderer, whiteboard program, and Bench presentation files.

Separate future initiatives remain available after measured cleanup:

- macOS and Windows unit-test CI coverage rather than build/smoke coverage only;
- an active Playwright/Electron E2E harness;
- coverage reporting and thresholds;
- cleanup of existing React `act(...)` warnings where they correspond to uncontrolled async behavior.
