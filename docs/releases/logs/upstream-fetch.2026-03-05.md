# Upstream Fetch Audit Log (2026-03-05)

## Scope
User request: verify whether anything used by Buddy has fundamentally changed upstream, then assess fetch risk and document full findings before fetch.

Date/time of audit: 2026-03-05 (Asia/Kolkata)

## Ground Rules Applied
- Did not trust helper scripts as source of truth.
- Performed independent verification with direct `git`/registry checks.
- Kept current working tree untouched (read-only checks in main tree, destructive checks only in isolated temp worktree).

## Initial Repository State
Checked from `/Users/prashantbhudwal/Code/buddy`:
- Working tree was already dirty before audit:
  - `M package.json`
  - untracked docs/agent-storms files
- This audit did not change or revert those.

## What Was Inspected
### Package and workspace manifests
Read:
- root `package.json`
- `packages/buddy/package.json`
- `packages/web/package.json`
- `packages/desktop/package.json`
- `packages/ui/package.json`
- `packages/sdk/package.json`
- `packages/opencode-adapter/package.json`
- `vendor/opencode/package.json`

### Vendor and upstream remotes
Verified remotes and vendor history:
- `opencode-upstream` points to `https://github.com/anomalyco/opencode.git`
- `local_opencode` points to local clone `/Users/prashantbhudwal/Code/opencode`

## Independent Upstream Verification (No Script Trust)
### Tree/hash verification
Direct tree comparisons:
- `opencode-upstream/dev` tree: `20d598de0a26607b2e7fba96209b9f0dc179fd39`
- current vendored tree (`HEAD:vendor/opencode`): `5e6cc76acf80b8efae863db7f7551f7dc7da9b6e`
- Result: **mismatch** (vendor behind upstream)

Also compared local clone:
- `local_opencode/dev` tree: `8fad0553634796987a1194f8f006a6a9030fae34`
- also not matching vendored tree.

### Version verification
Direct manifest check:
- local vendored OpenCode version: `1.2.14`
- upstream `opencode-upstream/dev` OpenCode version: `1.2.17`
- same for `@opencode-ai/sdk` vendored package: `1.2.14` -> `1.2.17` upstream

### Change volume and concentration
Compared `HEAD:vendor/opencode` vs `opencode-upstream/dev`:
- total changed files: `954`
- changed files in core vendored workspaces used by Buddy (`packages/opencode`, `util`, `plugin`, `sdk/js`, `script`): `81`
- API generated file changes in SDK gen (`packages/sdk/js/src/v2/gen`): `2`
- DB migrations added under OpenCode: `6` files (3 new migration directories with SQL+snapshots)

### Key upstream core changes identified
From direct diffs/logs between `v1.2.14..v1.2.17`:
- First-class workspace model introduced:
  - new workspace table/migrations
  - `session.workspace_id`
  - workspace routes under experimental API
  - workspace-aware request context/router middleware
  - SDK/client query params gain `workspace`
  - new workspace bus events (`workspace.ready`, `workspace.failed`)
- Process lifecycle changes:
  - SIGHUP handling and orphan process cleanup work
  - `OPENCODE_PID` usage introduced in core path
- Config/TUI refactor:
  - TUI config split out of `opencode` config into dedicated TUI config path/schema
  - migration helpers and path utilities added

## Dependency/Registry Verification (Independent)
Queried npm registry directly (`npm view <pkg> version`) for current latest versions.
Confirmed major-line jumps relative to repo pins/usages for several packages:
- `ai`: latest `6.0.116` (repo uses 5.x)
- `@ai-sdk/anthropic`: latest `3.0.58` (repo uses 2.x)
- `react`/`react-dom`: latest `19.2.4` (repo uses 18.x)
- `shiki`: latest `4.0.1` (repo uses 3.x)
- `zustand`: latest `5.0.11` (repo uses 4.x)
- `recharts`: latest `3.7.0` (repo uses 2.x)

Note: these are upgrade opportunities/risk indicators, not required for vendor sync.

## Buddy Usage-Surface Audit
Mapped what Buddy actually imports from OpenCode through adapter (`packages/opencode-adapter/src/*`):
- `Server`, `Instance`, `Project`, `Config`, `Agent`, `PermissionNext`, `Tool` stack, `ToolRegistry`, `LSP`, `ProviderTransform`.

Checked direct diffs of these upstream source files (`project`, `instance`, `server`, `config`, `agent`, `permission`, `lsp`, `tool`, `provider-transform`):
- Most public signatures used by Buddy remained compatible.
- Material internal changes observed in `server.ts`, `config.ts`, `provider/transform.ts`.

## Controlled Compatibility Dry-Run (Isolated Worktree)
Created temp worktree:
- `/tmp/buddy-upstream-check-qUUVjN`
- branch: `codex/upstream-risk-check`

In that temp worktree:
1. Pulled upstream vendor via subtree.
2. Installed deps.
3. Ran typechecks/tests relevant to Buddy usage.

### Dry-run results
- `packages/opencode-adapter typecheck`: pass
- `packages/buddy typecheck`: pass
- `packages/buddy test:contracts`: pass (`15/15`)
- `packages/web test:contracts`: pass (`60/60`)

Additional observations:
- `packages/web typecheck` and `packages/desktop typecheck` in this isolated worktree reported pre-existing generation/build-order issues (`routeTree.gen`, missing built UI d.ts), not directly attributable to OpenCode vendor sync itself.

## High-Risk Finding: Local Vendor Patch Required
After subtree sync in temp worktree, compared vendored tree to upstream tree directly:
- exactly **one** remaining diff in vendor mirror:
  - `vendor/opencode/packages/opencode/src/storage/db.ts`

That file contains a local Buddy patch enabling:
- `OPENCODE_MIGRATION_DIR` runtime override when loading OpenCode migrations.

### Why this matters
Buddy desktop sidecar sets:
- `OPENCODE_MIGRATION_DIR` and `BUDDY_MIGRATION_DIR`
  - from `packages/desktop/src-tauri/src/lib.rs`
  - and runtime env setup in `packages/buddy/src/opencode-runtime/env.ts`

### Reproduction proving breakage without patch
In isolated environment, replaced patched `storage/db.ts` with exact upstream version and rebuilt sidecar.
Then started sidecar and called `POST /api/session`.
Observed hard failure:
- HTTP `500`
- error includes: `ENOENT: no such file or directory, scandir '/migration'`

Result: dropping that local patch can break startup/session creation in sidecar-style runtime where migration path is not naturally available at `/migration`.

## Secondary Runtime Observation
During isolated sidecar startup tests, plugin load emitted:
- `Cannot find module '@openauthjs/openauth/pkce'` while loading `opencode-anthropic-auth@0.0.13`
- session creation still succeeded in patched runs.

This appears orthogonal to vendor-sync compatibility and already present in tested runtime path.

## Risk Assessment for Fetch
### If fetch is done via subtree sync and local patch is preserved
- Risk for Buddy core/adapter path appears **low-to-moderate** based on passing Buddy typecheck + contracts + web contracts in synced dry-run.

### If manual overwrite replaces vendor with pure upstream and loses local patch
- Risk is **high** for desktop/sidecar startup/session path.
- Known break: migration directory resolution in OpenCode DB init.

## Cleanup Performed
Removed all temporary artifacts after audit:
- removed temp worktree `/tmp/buddy-upstream-check-qUUVjN`
- deleted temp branch `codex/upstream-risk-check`
- removed temp runtime/test directories under `/tmp/buddy-sidecar-*`

Current repo state returned to original dirty baseline (plus this log file only).

## Recommendation Before Fetch
- Proceed with fetch, but preserve/reapply local `OPENCODE_MIGRATION_DIR` patch in:
  - `vendor/opencode/packages/opencode/src/storage/db.ts`
- After fetch, run at least:
  - `bun run --cwd packages/buddy test:contracts`
  - `bun run --cwd packages/web test:contracts`

---

## Follow-up Implementation (Same Day): Remove Vendor Patch Requirement
User preference: keep vendor clean and avoid Buddy-specific vendor patching.

### Implemented strategy
- Moved migration portability into Buddy build layer:
  - compiled sidecar now embeds both migration journals via build-time defines:
    - `BUDDY_MIGRATIONS`
    - `OPENCODE_MIGRATIONS`
- This uses adapter/build-layer changes only; no runtime dependence on `OPENCODE_MIGRATION_DIR`.

### Code changes made
- Added:
  - `packages/buddy/script/build-compiled-binary.ts`
  - `packages/buddy/script/build-single.ts`
- Updated:
  - `packages/buddy/script/build-sidecar.ts` to use embedded-migrations compiler helper
  - `packages/buddy/package.json` (`build:single` now uses script)
  - `packages/buddy/src/opencode-runtime/env.ts` (removed OpenCode migration env wiring)
  - `packages/buddy/test/opencode-runtime-env.test.ts` (updated assertions)
  - `packages/desktop/src-tauri/src/lib.rs` (removed `OPENCODE_MIGRATION_DIR` sidecar env)
  - `packages/desktop/scripts/utils.ts` (no longer bundles OpenCode migrations)
- Removed local vendor patch:
  - `vendor/opencode/packages/opencode/src/storage/db.ts` no longer reads `OPENCODE_MIGRATION_DIR`

### Validation run after changes
- `bun test --preload ./packages/buddy/test/preload.ts packages/buddy/test/opencode-runtime-env.test.ts` -> pass
- `bun run --cwd packages/buddy test:contracts` -> pass
- `bun run --cwd packages/buddy build:single` -> pass
  - output indicates embedded counts (Buddy + OpenCode migrations)
- Runtime proof from isolated temp folder with both migration env vars intentionally set to invalid paths:
  - sidecar booted successfully
  - `POST /api/session` returned `200`
  - logs showed OpenCode DB migrations in `mode=bundled`

### Updated conclusion
- Buddy can run without any vendor migration-dir patch.
- Vendor can stay clean for smoother upstream fetches.

---

## Pre-Fetch Checkpoint (2026-03-05, user-requested)
User requested vendor sync to latest local upstream clone while preserving all current working-tree changes.

Planned execution strategy:
1. Keep current working tree untouched.
2. Create a temporary clean worktree from current HEAD.
3. Run `git subtree pull --prefix vendor/opencode local_opencode dev --squash` in temp worktree.
4. Bring only `vendor/opencode` back to current workspace from temp branch.
5. Verify vendor matches synced branch and local upstream tree.
6. Remove temp worktree/branch.

Safety note:
- No destructive reset/checkout of unrelated files.
- Existing user modifications outside vendor remain untouched.

## Vendor Sync Execution Result (2026-03-05)
Executed per user request to sync to latest local upstream state while preserving current dirty changes.

### Commands/runbook applied
1. Confirmed local upstream pointers:
   - `local_opencode/dev` commit: `85ff05670a53079066fcbc0abc0271ea355585c1`
   - tree: `20d598de0a26607b2e7fba96209b9f0dc179fd39`
2. Created temp worktree from current HEAD:
   - branch: `codex/vendor-sync-20260305`
   - dir: `/tmp/buddy-vendor-sync-XNm9AR`
3. Ran subtree sync in temp worktree:
   - `git subtree pull --prefix vendor/opencode local_opencode dev --squash`
4. Normalized the historical local vendor-patch file in temp tree to exact upstream content:
   - `vendor/opencode/packages/opencode/src/storage/db.ts`
5. Copied synced vendor mirror back into current workspace via rsync:
   - source: temp worktree `vendor/opencode/`
   - destination: current workspace `vendor/opencode/`
6. Removed temp worktree and temp branch.

### Preservation guarantee outcome
- No destructive reset performed.
- Existing non-vendor local changes remained in place.
- Vendor mirror was updated in current workspace without discarding in-progress Buddy-side edits.

### Post-sync verification notes
- Filesystem-level diff against local clone showed only local untracked/build artifacts in the clone (`node_modules`, `.turbo`, etc.), and no tracked source-content drift in vendor mirror.
- Two key IDs used during sync:
  - previous vendor tree baseline: `5e6cc76acf80b8efae863db7f7551f7dc7da9b6e`
  - target upstream tree: `20d598de0a26607b2e7fba96209b9f0dc179fd39`

---

## Post-Fetch Stabilization Log (2026-03-05, follow-up "do it")
Goal: validate the fetched state in the current working tree without discarding existing edits.

### 1) Baseline state check
- Ran: `git status --short`
- Result: workspace remained heavily dirty (expected), including:
  - existing Buddy-side edits
  - synced `vendor/opencode` changes
- No files were reverted or reset.

### 2) Contract test check before remediation
- Ran:
  - `bun run --cwd packages/buddy test:contracts`
  - `bun run --cwd packages/web test:contracts`
- Results:
  - `packages/web test:contracts` passed (`60/60`)
  - `packages/buddy test:contracts` failed (`0/6`), with immediate module-resolution errors from vendored OpenCode imports, for example:
    - `Cannot find package 'zod' from .../vendor/opencode/packages/opencode/src/...`

### 3) Root-cause verification
- Verified dependency visibility:
  - `packages/buddy/node_modules/zod` existed.
  - `vendor/opencode/packages/opencode/node_modules` did not exist.
- Interpretation:
  - vendored OpenCode source was being executed/resolved, but workspace links were stale after sync in this tree.
  - this matched earlier dry-run behavior where install had been executed before validations.

### 4) Remediation applied
- Ran: `bun install` at repo root.
- Result:
  - install completed successfully
  - lockfile refreshed (`Saved lockfile`)
  - packages relinked in current workspace

### 5) Re-validation after install
- Ran:
  - `bun run --cwd packages/buddy typecheck`
  - `bun run --cwd packages/buddy test:contracts`
  - `bun run --cwd packages/web test:contracts`
  - `bun run --cwd packages/buddy build:single`
- Results:
  - `packages/buddy typecheck`: pass
  - `packages/buddy test:contracts`: pass (`15/15`)
  - `packages/web test:contracts`: pass (`60/60`)
  - `packages/buddy build:single`: pass
    - built binary: `packages/buddy/dist/desktop-sidecar/bin/buddy-backend`
    - migration embed counts: `buddy=2`, `opencode=6`

### 6) Vendor cleanliness check (no migration patch drift)
- Ran:
  - `rg -n "OPENCODE_MIGRATION_DIR" vendor/opencode/packages/opencode/src`
  - direct file diff against local upstream clone:
    - `vendor/opencode/packages/opencode/src/storage/db.ts`
    - `/Users/prashantbhudwal/Code/opencode/packages/opencode/src/storage/db.ts`
- Results:
  - no `OPENCODE_MIGRATION_DIR` references in vendored OpenCode source
  - `storage/db.ts` diff was empty (exact match)
  - broad tree compare (`diff -qr` with build/cache excludes) showed only local-clone-only artifacts (`.DS_Store`, local notes, local cache/build files), and no tracked source drift attributable to Buddy vendor mirror content

### Final status after stabilization
- Fetched vendor is in latest synced state.
- Existing dirty changes were preserved.
- Buddy app validation gates requested in this follow-up are passing again after dependency relink.
- Vendor remains clean with respect to the previously removed migration-dir patch.

## Commit Actions on `main` (2026-03-05)
User approved committing directly on `main`.

Created commits:
1. `723b27bdc`
   - message: `chore(vendor): sync opencode upstream to latest local dev`
   - scope: `vendor/opencode/**` + root `bun.lock`
2. `6b900966b`
   - message: `feat(buddy): embed migrations in sidecar and keep vendor clean`
   - scope:
     - `packages/buddy/package.json`
     - `packages/buddy/script/build-sidecar.ts`
     - `packages/buddy/script/build-compiled-binary.ts`
     - `packages/buddy/script/build-single.ts`
     - `packages/buddy/src/opencode-runtime/env.ts`
     - `packages/buddy/test/opencode-runtime-env.test.ts`
     - `packages/desktop/scripts/utils.ts`
     - `packages/desktop/src-tauri/src/lib.rs`

Uncommitted files intentionally left untouched:
- `AGENTS.md`
- root `package.json`
- untracked `agent-storms/*`
- untracked `docs/*` notes
