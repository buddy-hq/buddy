# Upstream Fetch Log - 2026-06-08

## Final result

- Time: 2026-06-08 16:54 IST
- Branch: `main`
- Base HEAD: `3f428fdcd9`
- Target upstream tag: `v1.16.2`
- Vendored OpenCode version after sync: `1.16.2`
- Vendor source: local OpenCode clone `/Users/prashantbhudwal/Code/opencode` tag `v1.16.2` (`d6eca535886bdb7fa9c2861a3b58a991cc7808d2`)
- Main worktree changes are left uncommitted by request.

### Applied changes

- Synced `vendor/opencode/` to OpenCode `v1.16.2`.
- Ran `bun run vendor:sync-catalog` and `bun install`; catalog and lockfile now match the upstream package graph.
- Rewired `packages/opencode-adapter` around the upstream split into `@opencode-ai/core` for config, permission, project, session message, ID, and storage types.
- Replaced the removed upstream file service surface with a small Buddy adapter fallback for project file reads/lists.
- Updated Buddy runtime call sites for async project listing, stricter permission actions, message paging, dynamic-tool default-deny behavior, and upstream Effect instance context on the write tool.
- Added a first-class v2 session adapter (`@buddy/opencode-adapter/session-v2`) and exposed v2 SDK surfaces through Buddy's in-process client.
- Migrated learner-memory session extraction to the OpenCode v2 session projection where available.
- Made Mermaid repair model selection v2-first, with a legacy fallback only for tests/seeded legacy messages that do not have a v2 projection.
- Patched the Buddy adapter session seam to keep a live in-memory session object in sync with `Session.setPermission(...)`, so dynamic tool grants become visible within the same active run instead of after a later reload.
- Patched the Buddy adapter project seam to seed stable repo-local IDs for fresh no-remote git repos before vendored project fallback logic can collapse unrelated repos onto the same root-commit-derived ID.
- Fixed Buddy's skills refresh path to use Buddy-resolved OpenCode skill roots directly, so workspace `.agents/skills` roots remain visible after the upstream refactor.
- Fixed compiled sidecar skill-catalog lookup by resolving copied runtime assets next to `index.js` / `buddy-backend.js` instead of only beside the compiled virtual module path.
- Added a TypeScript path pin for `drizzle-orm` to keep Bun peer-context installs from producing duplicate Drizzle type identities.
- Updated `packages/buddy/script/smoke.ts` to treat missing session-status map entries as idle after the async runner has had a chance to publish status; OpenCode `v1.16.2` deletes idle entries from the status map.

### Validation

| Check | Result | Notes |
|-------|--------|-------|
| `bun install` | **PASS** | lockfile saved |
| `bun run vendor:check-catalog` | **PASS** | catalog already aligned |
| Vendor cleanliness grep | **PASS** | no `OPENCODE_MIGRATION_DIR` / `BUDDY_RUNTIME_ROOT` under vendored `packages/opencode/src` |
| `bun typecheck` | **PASS** | root Buddy typecheck scope |
| `bun run --filter @buddy/opencode-adapter typecheck` | **PASS** | adapter is outside root typecheck filter |
| `ALLOW_VENDOR_SYNC=1 bun lint` | **PASS** | vendor guard allowed 1660 vendor path changes |
| `bun test --preload ./test/preload.ts test/skills/library.test.ts test/skills/routes.test.ts` | **PASS** | 3 pass / 0 fail |
| `bun test --preload ./test/preload.ts test/session/route-regressions.test.ts test/session/project-scoped-routes.test.ts test/session/message-route.test.ts test/session/sse-event-compatibility.test.ts` | **PASS** | 17 pass / 0 fail |
| `bun test --preload ./test/preload.ts test/config/opencode-overlay-isolation.test.ts test/opencode-runtime-env.test.ts test/learning/lesson-workspace-write-without-prompt.test.ts` | **PASS** | 12 pass / 0 fail |
| `bun test --preload ./test/preload.ts test/opencode-runtime/session-live.test.ts` | **PASS** | dynamic-tool session-liveness regression |
| `bun test --preload ./test/preload.ts test/learning/dynamic-tool-end-to-end.test.ts test/learning/runtime-tool-registration.test.ts` | **PASS** | dynamic tool discovery/load/registration stays green |
| `bun test --preload ./test/preload.ts test/project-routes.test.ts` | **PASS** | 4 pass / 0 fail, includes identical-root-commit repo collision regression |
| `bun test --preload ./test/preload.ts test/mermaid/repair-routes.test.ts test/project-routes.test.ts test/open-project-routes.test.ts` | **PASS** | 24 pass / 0 fail mixed bundle that previously exposed project identity collapse |
| `bun run --cwd packages/buddy test:contracts` | **PASS** | 6 pass / 0 fail |
| `bun run --cwd packages/web test:contracts` | **PASS** | 91 pass / 0 fail |
| Focused Buddy regressions | **PASS** | 16 pass / 0 fail across project file editor, lesson write, runtime tool registration |
| `bun run --cwd packages/buddy build:single` | **PASS** | built desktop sidecar binary + runtime entry |
| `bun run build` | **PASS** | Turbo Buddy build scope, 6 tasks successful |
| `bun run --cwd packages/buddy smoke:compiled-sidecar -- --binary ... --entrypoint ...` | **PASS** | compiled sidecar smoke passed |
| Vendor tag-archive compare | **PASS** | `git archive v1.16.2 | tar -x` vs `vendor/opencode`, excluding vendored `node_modules`, produced no tracked-source diffs |

### Live prompt smoke notes

- Source backend manual smoke used latest desktop session `ses_1598f4504ffesiVMdXGQbL8ZXU` in `/Users/prashantbhudwal/Documents/Buddy/Inbox`, pinned to `opencode/nemotron-3-ultra-free`. It accepted the prompt, called `glob`, and completed with `SMOKE_OK_FREE 100`.
- Stress prompt was submitted with the user's `present_media` override. `present_media` was not called; the Desktop glob permission was rejected as requested. The run executed tool cards and was then aborted after the free model stalled in a zero-text post-tool generation step on the very large stress history.
- Rebuilt compiled sidecar was smoke-tested against the desktop runtime. A fresh compiled-sidecar session `ses_1595c6472ffetL9NgYnIXf7NVd` accepted the prompt, called `glob`, and completed with `COMPILED_FRESH_SMOKE_OK 100`.
- Dynamic tool curl smoke remained green after the adapter session-liveness patch:
  - `ses_1593c3848ffeDx27mHcCp3IeDG` completed `learning_tool_search` -> `learning_tool_load` -> `reflection_dynamic` and finished with `DYNAMIC_SMOKE_OK`.
  - `ses_1593ade34ffewqGXK16646oJcx` completed `learning_tool_search` -> `learning_tool_load` -> `stepwise_solve_dynamic` and finished with `STEPWISE_DYNAMIC_SMOKE_OK`.
- Fresh re-smoke on the current head used session `ses_1590a2bedffeV5WCO2ttGhQ3AM` in `/Users/prashantbhudwal/Code/buddy`. The first prompt attempt inherited the current unavailable global default model (`anthropic/route-global-only`) and failed before tool execution. Re-running the prompt with explicit prompt-level model override `{ "providerID": "opencode", "modelID": "deepseek-v4-flash-free" }` completed `learning_tool_search` -> `learning_tool_load` -> `stepwise_solve_dynamic` and finished with `STEPWISE_DYNAMIC_RESMOKE_OK`.

### Live HTTP route smokes

- `GET /api/healthz` on `127.0.0.1:3011`: **200**
- `GET /api/project/current?directory=<fresh repo>` on three separate fixed-date repos with identical initial commit timestamps: **200** for each, with distinct Buddy-local project IDs and canonical repo worktrees.
- `GET /api/project`: **200**, and included the target repo returned by `/api/project/current`.
- `PATCH /api/project/:projectID` on the target fresh repo: **200**, persisted `name: "HTTP smoke renamed"`.

### Vendor cleanliness

- `rg -n "OPENCODE_MIGRATION_DIR|BUDDY_RUNTIME_ROOT" vendor/opencode/packages/opencode/src`: no matches
- Exact tag comparison used the upstream `v1.16.2` archive rather than the working tree of `/Users/prashantbhudwal/Code/opencode`.
- `diff -qr` between the extracted `v1.16.2` archive and `vendor/opencode`, excluding vendored `node_modules`, returned no tracked-source differences.

No user-home config was edited during this fetch.

## Current run checkpoint

- Time: 2026-06-08 13:36:53 IST
- Branch: `main`
- HEAD: `3f428fdcd9`
- Target upstream tag: `v1.16.2`
- Current vendored OpenCode version at start: `1.15.10`
- Local upstream target tree: `d6eca535886bdb7fa9c2861a3b58a991cc7808d2`
- Note: `git fetch opencode-upstream --tags` reported existing tag clobber conflicts for old `v0.0.x` tags; `/Users/prashantbhudwal/Code/opencode` fetched cleanly and is used as the verified tag source.

## Current baseline `git status --short`

```text
 M docs/decoupling/README.md
?? docs/decisions/buddy-opencode-config-overlay-architecture-review.md
?? docs/decoupling/about.md
?? docs/logs/upstream-fetch.2026-06-08.md
```

## Historical dry-run notes from earlier agent

The sections below are retained as diagnostics only. This run re-verifies each conclusion before acting on it.

## Checkpoint

- Time: 2026-06-08 (dry run only — no main worktree vendor apply)
- Branch: `main`
- Target upstream tag: `v1.16.2`
- Current vendored OpenCode version at start: `1.15.10`

## Baseline `git status --short`

```text
 M packages/buddy/src/config/runtime/opencode-sync.ts
 M packages/buddy/src/opencode-runtime/runtime.ts
 M packages/buddy/test/config/opencode-overlay-isolation.test.ts
 M packages/buddy/test/config/pollution-regression.test.ts
 M packages/buddy/test/opencode-runtime/fetch-with-overlay.test.ts
 M packages/opencode-adapter/package.json
 M packages/opencode-adapter/src/config.ts
 M packages/web/scripts/create-foliate-pdf-vite-plugin.ts
?? docs/decisions/buddy-opencode-config-overlay-architecture-review.md
?? packages/opencode-adapter/src/config-overlay.ts
```

## Phase

- Phases A–C completed (discovery + temp worktree dry run + vendor cleanliness gate).
- Main `vendor/opencode/` left untouched (`1.15.10`).

## Temp worktree

- Path: `/tmp/buddy-vendor-check-6kR7OH`
- Branch: `codex/vendor-check-2026-06-08`
- Vendor source: `git -C ~/Code/opencode archive v1.16.2`
- `vendor:sync-catalog` updated 10 catalog entries (`effect` beta.66→beta.74, `@opentui/*` 0.2.15→0.3.2, added `sst`, etc.)
- `bun install`: success (~12s)

## Validation results (temp only)

| Check | Result | Notes |
|-------|--------|-------|
| `bun typecheck` | **FAIL** | `@buddy/backend#typecheck` fails; SDK passed after copying `packages/sdk/src/gen` from main |
| `ALLOW_VENDOR_SYNC=1 bun lint` | **PASS** | vendor-guard bypass expected for dry run |
| `packages/buddy test:contracts` | **FAIL** | cannot resolve `opencode/config/mcp` at import time |
| `packages/web test:contracts` | **PASS** | 91 pass / 0 fail |
| `packages/opencode-adapter typecheck` | **FAIL** | see breakage ledger below |
| `packages/buddy build:single` | **FAIL** | adapter import resolution (`opencode/file/index`, `opencode/storage/db`, etc.) |

## Vendor cleanliness (phase C)

- `rg OPENCODE_MIGRATION_DIR|BUDDY_RUNTIME_ROOT` under vendored `packages/opencode/src`: **no matches**
- Vendor tree delta vs main: ~1251 path differences (expected for 1.15.10 → 1.16.2)

## Buddy breakage ledger (v1.16.2)

### Config module moves (`packages/opencode-adapter/src/config.ts`)

| Import | In `opencode` v1.16.2? | Moved to |
|--------|------------------------|----------|
| `opencode/config/agent` | yes | — |
| `opencode/config/config` | yes (API changed: no `Info`) | `@opencode-ai/core/v1/config/config` |
| `opencode/config/mcp` | **no** | `@opencode-ai/core/v1/config/mcp` |
| `opencode/config/model-id` | **no** | removed / relocated (not found) |
| `opencode/config/permission` | **no** | `@opencode-ai/core/v1/config/permission` |
| `opencode/config/plugin` | yes | — |
| `opencode/config/provider` | **no** | `@opencode-ai/core/v1/config/provider` |
| `opencode/config/skills` | **no** | `@opencode-ai/core/v1/config/skills` |
| `opencode/config/parse` | yes | — |
| `opencode/config/variable` | yes | — |

### Other adapter import breaks

- `opencode/file/index` → missing
- `opencode/provider/schema`, `opencode/project/schema` → missing
- `opencode/storage/db` → split to `#db` import map (`db.bun.ts` / `db.node.ts`)
- `session/message-v2` types renamed: `WithParts`, `Part`, `ToolPart`, `Assistant`, `Info` no longer exported as before
- `project/project` API: `list` / `get` removed or moved
- `permission/index`: `Request` type missing

### Buddy backend fallout (via adapter + direct vendored types)

- Widespread `MessageV2.WithParts` usage in learning, routes, session orchestration, tests
- `permission.ts` route: `Permission.Request` missing
- `PermissionAction` typing stricter in skill permissions
- Drizzle duplicate-instance type errors in vendored `share-next.ts`, `worktree/index.ts` (likely catalog/install deduping issue to resolve with full `bun.lock` carry-over)

## Verdict

**Do not apply to main yet.** Dry run proves `v1.16.2` is a large boundary shift (config → `@opencode-ai/core`, session message types, storage paths). Adapter + Buddy routes need adaptation before vendor apply.

## Next step (not executed)

- Step 6 (`rsync` to main) blocked until Buddy-owned fixes are implemented and dry run is green.
- Temp worktree kept at `/tmp/buddy-vendor-check-6kR7OH` for continued fix iteration.
