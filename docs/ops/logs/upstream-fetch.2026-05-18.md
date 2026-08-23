# Upstream Fetch Log - 2026-05-18

## Checkpoint
- Date/time: 2026-05-18 18:31:03 IST
- Branch: main

### Baseline Status (`git status --short`)
M  packages/buddy/src/learning/features/memory/consolidation.ts
M  packages/buddy/src/learning/features/memory/extractor.ts
M  packages/buddy/src/learning/features/memory/models.ts
M  packages/buddy/src/learning/features/memory/session-extraction.ts
 M packages/desktop-electron/src/main/cli.ts
 M packages/web/src/components/layout/chat-left-sidebar.tsx
 M packages/web/src/components/layout/chat-left-sidebar/directory-list.tsx
 M packages/web/src/components/layout/desktop-titlebar.tsx
 M packages/web/src/components/layout/sidebar-items.tsx
 M packages/web/src/components/settings/settings-advanced.tsx
 M packages/web/src/components/settings/settings-appearance.tsx
 M packages/web/src/components/settings/settings-attribution.tsx
 M packages/web/src/components/settings/settings-general.tsx
 M packages/web/src/components/settings/settings-learner-memory.tsx
 M packages/web/src/components/settings/settings-mcps.tsx
 M packages/web/src/components/settings/settings-personalization.tsx
 M packages/web/src/components/settings/settings-primitives.tsx
 M packages/web/src/components/settings/settings-providers.tsx
 M packages/web/src/components/settings/settings-tools.tsx
 M packages/web/src/i18n/en.ts
 M packages/web/src/lib/directory-chat/use-directory-chat-state.ts
 M packages/web/src/routes/__root.tsx
 M packages/web/src/routes/settings.tsx
?? packages/web/src/lib/session-title.ts

## Upstream Delta Check
- `HEAD:vendor/opencode` tree: `f55cd1426c2bb62d37cbcd50147cdd5300098bfd`
- `opencode-upstream/dev^{tree}`: `efe0cc275fd9326a0db32f83d1f80d3f9216bca6`
- `local_opencode/dev^{tree}` before refresh: `a000e2f725640819ef3267b4e06a60719a27882c`
- `local_opencode/dev` after refresh: `efe0cc275fd9326a0db32f83d1f80d3f9216bca6`

## Local Upstream Clone Refresh
- Fast-forwarded `/Users/prashantbhudwal/Code/opencode` `dev` from `b5aed287c` to `e56999fd3`.
- Preserved untracked local-clone files (`findings.md`, `notes/`, `packages/opencode/src/provider/models-snapshot.ts`).

## Temp Compatibility Dry-Run
- Temp worktree: `/tmp/buddy-vendor-check-lV4Fce`
- Branch: `codex/vendor-check-20260518-1833`
- Applied temp-only root metadata fixes needed to install against new vendor snapshot:
  - remove stale workspace `vendor/opencode/packages/shared`
  - widen vendored workspace globs
  - add missing vendor catalog keys
- `bun install`: passed in temp
- `bun run --cwd packages/buddy typecheck`: failed with widespread Buddy/opencode-adapter compatibility errors against new upstream API/types

## Result
- Sync **not** applied to real workspace.
- Real `vendor/opencode` remains unchanged.
- Next phase required: Buddy + opencode-adapter compatibility migration for upstream `e56999fd3` before vendor rsync into real tree.

## Tag Sync Attempt ()
- Date/time: 2026-05-18 18:47:12 IST
- Branch: main
- Target tag: `v1.15.4`
- Target commit: `2b92c5677e830e95d34fc3d5664a69297d2d0b51`

### Baseline Status (?? docs/ops/logs/)
?? docs/ops/logs/
