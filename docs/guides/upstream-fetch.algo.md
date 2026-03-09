# Upstream Fetch Algorithm (Buddy + Vendored OpenCode)

This is the repeatable process to sync `vendor/opencode` while preserving local Buddy work and avoiding vendor patch drift.

## Inputs
- Buddy repo root: `/Users/prashantbhudwal/Code/buddy`
- Upstream mirror remote: `opencode-upstream` (GitHub)
- Local upstream clone remote: `local_opencode` (`/Users/prashantbhudwal/Code/opencode`)
- Upstream branch: `dev`

## Rules
1. Do not trust helper scripts as source of truth.
2. Assume working tree is dirty; do not reset/revert unrelated files.
3. Keep vendor clean; put Buddy-specific behavior in Buddy/adapter/build layer.
4. Validate with real commands before and after sync.

## Algorithm
1. Create a checkpoint log entry.
   - File: `docs/logs/upstream-fetch.<date>.md` (local, ignored by git).
   - Record current date/time, branch, and short `git status`.

2. Capture baseline and prove no destructive actions are needed.
   - `git status --short`
   - `git branch --show-current`
   - Keep this output in log.

3. Independently verify upstream delta (no script trust).
   - `git fetch opencode-upstream dev`
   - `git fetch local_opencode dev`
   - Compare trees:
     - `git rev-parse HEAD:vendor/opencode`
     - `git rev-parse opencode-upstream/dev^{tree}`
     - `git rev-parse local_opencode/dev^{tree}`
   - Compare key versions (for example `vendor/opencode/packages/opencode/package.json` vs upstream).
   - If trees match, stop (already current).

4. Run compatibility dry-run in a temporary worktree.
   - Create temp worktree from current HEAD:
     - `tmp=$(mktemp -d /tmp/buddy-vendor-check-XXXXXX)`
     - `git worktree add -b codex/vendor-check-<date> "$tmp" HEAD`
   - In temp worktree:
     - `git subtree pull --prefix vendor/opencode local_opencode dev --squash`
     - `bun install`
     - `bun run --cwd packages/buddy typecheck`
     - `bun run --cwd packages/buddy test:contracts`
     - `bun run --cwd packages/web test:contracts`
     - `bun run --cwd packages/buddy build:single`
   - If this fails, stop and fix before touching real tree.

5. Ensure no Buddy-only patch remains in vendor.
   - Check known historical patch point:
     - `vendor/opencode/packages/opencode/src/storage/db.ts`
   - Verify no `OPENCODE_MIGRATION_DIR` dependency in vendored OpenCode:
     - `rg -n "OPENCODE_MIGRATION_DIR" vendor/opencode/packages/opencode/src`
   - If needed, move behavior to Buddy build/runtime (not vendor) before sync.

6. Apply sync to the real (possibly dirty) workspace safely.
   - Use temp worktree as source of truth.
   - Copy only vendor directory back:
     - `rsync -a --delete "$tmp/vendor/opencode/" "vendor/opencode/"`
   - Do not touch unrelated paths.

7. Re-link dependencies in real workspace.
   - `bun install`
   - This prevents stale workspace link/module-resolution failures after large vendor updates.

8. Run post-sync validations in real workspace.
   - `bun run --cwd packages/buddy typecheck`
   - `bun run --cwd packages/buddy test:contracts`
   - `bun run --cwd packages/web test:contracts`
   - `bun run --cwd packages/buddy build:single`

9. Verify vendor cleanliness against local upstream clone.
   - Direct spot check:
     - `git diff --no-index -- vendor/opencode/packages/opencode/src/storage/db.ts /Users/prashantbhudwal/Code/opencode/packages/opencode/src/storage/db.ts`
   - Optional broad compare with excludes:
     - `diff -qr --exclude .git --exclude node_modules --exclude .turbo --exclude dist /Users/prashantbhudwal/Code/opencode vendor/opencode`
   - Accept local-clone-only artifacts; reject tracked source drift.

10. Commit in two clean batches.
   - Commit 1 (vendor sync only):
     - `git add vendor/opencode bun.lock`
     - `git commit -m "chore(vendor): sync opencode upstream to latest local dev"`
   - Commit 2 (Buddy adaptations only):
     - Stage only Buddy/desktop/runtime files.
     - `git commit -m "feat(buddy): embed migrations in sidecar and keep vendor clean"`
   - Leave unrelated pre-existing local edits unstaged.

11. Cleanup temp artifacts.
   - `git worktree remove "$tmp"`
   - `git branch -D codex/vendor-check-<date>` (if still present)

12. Record final state in log.
   - Commit hashes created
   - Validation results
   - Remaining uncommitted files (if any)

## Fast Path (if in a hurry)
1. Temp worktree subtree pull.
2. `bun install`.
3. Run 4 checks: Buddy typecheck + Buddy contracts + Web contracts + Buddy build:single.
4. Rsync vendor into real tree.
5. `bun install` again.
6. Re-run same 4 checks.
7. Commit vendor, then Buddy changes.
