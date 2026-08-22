# Upstream Fetch Log - 2026-04-01

## Checkpoint
- Timestamp: 2026-04-01 17:42:40 IST
- Branch: `main`
- Baseline `git status --short`:

```text
(clean)
```

## Baseline Commands
```bash
git status --short
git branch --show-current
```

## Upstream Delta Verification

### Commands
```bash
git fetch opencode-upstream dev
git fetch local_opencode dev
git rev-parse HEAD:vendor/opencode
git rev-parse opencode-upstream/dev^{tree}
git rev-parse local_opencode/dev^{tree}
git rev-list --left-right --count local_opencode/dev...opencode-upstream/dev
```

### Before local clone fast-forward
- `HEAD:vendor/opencode` tree: `5dadc45bb4c620f5e16a928572166a2704088d2d`
- `opencode-upstream/dev^{tree}`: `71b3c3d7144f7c38eb73d7e173852858313fc4bf`
- `local_opencode/dev^{tree}`: `88fbd93eb2fc90ff73d92020f5f12f14a180f1de`
- Divergence (`local_opencode/dev...opencode-upstream/dev`): `0 360`

### Local clone fast-forward
- Repo: `/Users/prashantbhudwal/Code/opencode`
- Branch: `dev`
- Untracked preserved: `findings.md`, `notes/`
- Fast-forwarded to: `a3a6cf1c0`

### After local clone fast-forward and refetch
- `HEAD:vendor/opencode` tree: `5dadc45bb4c620f5e16a928572166a2704088d2d`
- `opencode-upstream/dev^{tree}`: `71b3c3d7144f7c38eb73d7e173852858313fc4bf`
- `local_opencode/dev^{tree}`: `71b3c3d7144f7c38eb73d7e173852858313fc4bf`
- Divergence (`local_opencode/dev...opencode-upstream/dev`): `0 0`

### Key Version Check
- `vendor/opencode/packages/opencode/package.json` version: `1.2.27`
- `local_opencode/dev:packages/opencode/package.json` version: `1.3.13`

## Dry-Run Worktree Validation

### First attempt (subagent)
- Temp worktree: `/tmp/buddy-vendor-check-2026-04-01-qOqOnT/worktree`
- Branch: `codex/vendor-check-2026-04-01-174239`
- `rsync -a --delete` failed with exit `23` (`open (2)` on removed paths).
- Validation commands were not run.

### Second attempt (main agent)
- Temp worktree: `/tmp/buddy-vendor-check-V5RwQc`
- Branch: `codex/vendor-check-2026-04-01-174712-main`
- `rsync -a --delete /Users/prashantbhudwal/Code/opencode/ /tmp/buddy-vendor-check-V5RwQc/vendor/opencode/` passed.
- `bun install` passed.

### Dry-Run Compatibility Fixes Applied in Temp
- Root workspace alignment for upstream snapshot:
  - `package.json` catalog updates: `ai -> 6.0.138`, `effect -> 4.0.0-beta.42`, `@effect/platform-node -> 4.0.0-beta.42`, `@pierre/diffs -> 1.1.0-beta.18`, `@types/bun -> 1.3.11`
  - Added `patchedDependencies` entries:
    - `solid-js@1.9.10`
    - `@ai-sdk/provider-utils@4.0.21`
    - `@ai-sdk/anthropic@3.0.64`
  - Added root `patches/` files for the above.
- Buddy/adapter compatibility updates:
  - Session create API migration (`createNext` fallback removal).
  - Tool registry unregister path updated for removed `ToolRegistry.state` API.
  - Project update schema moved to `OpenCodeProject.UpdateInput`.
  - Auth validator switched to `OpenCodeAuth.Info.zod`.
  - Permission adapter migrated from removed `PermissionNext` export to `Permission` aliasing.
  - Config overlay adapter updated so overlays apply through `Instance.provide`/`reload` using `OPENCODE_CONFIG_CONTENT` for new `Config.Service` runtime.

### Dry-Run Validation Results (final temp pass)
- `bun run --cwd packages/buddy typecheck`: pass
- `bun run --cwd packages/buddy test:contracts`: pass
- `bun run --cwd packages/web test:contracts`: pass
- `bun run --cwd packages/buddy build:single`: pass

## Applied to Real Workspace
- Copied validated `vendor/opencode/` snapshot from temp worktree.
- Carried required root metadata:
  - `package.json`
  - `bun.lock`
  - `patches/`
- Carried validated Buddy-side adaptations:
  - `packages/buddy/src/e2e/seed.ts`
  - `packages/buddy/src/learning/tools/register-buddy-tools.ts`
  - `packages/buddy/src/project/orchestration/project-operations.ts`
  - `packages/buddy/src/routes/auth.ts`
  - `packages/buddy/src/routes/project.ts`
  - `packages/buddy/test/learning/custom-permission-contract.test.ts`
  - `packages/opencode-adapter/src/config.ts`
  - `packages/opencode-adapter/src/permission.ts`

## Real Workspace Validation Results
- `bun install`: pass
- `bun run --cwd packages/buddy typecheck`: pass
- `bun run --cwd packages/buddy test:contracts`: pass
- `bun run --cwd packages/web test:contracts`: pass
- `bun run --cwd packages/buddy build:single`: pass

## Task Completion Gates (AGENTS.md)
- `bun fmt`: pass
- `bun lint`: pass (1 warning, 0 errors)
- `bun typecheck`: pass

## Vendor Cleanliness Checks
- `rg -n "OPENCODE_MIGRATION_DIR" vendor/opencode/packages/opencode/src`: no matches
- `git diff --no-index -- vendor/opencode/packages/opencode/src/storage/db.ts /Users/prashantbhudwal/Code/opencode/packages/opencode/src/storage/db.ts`: no diff
- `diff -qr ... /Users/prashantbhudwal/Code/opencode vendor/opencode`: no file-content diffs reported (only symlink directory-loop notices)
