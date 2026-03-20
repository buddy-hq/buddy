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
   - File: `docs/logs/upstream-fetch.<date>.md`.
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
   - If `local_opencode/dev` is behind `opencode-upstream/dev`, fast-forward `/Users/prashantbhudwal/Code/opencode` branch `dev` to `upstream/dev`, preserve any untracked local-clone files, refresh `local_opencode/dev`, then compare again.
   - Compare key versions (for example `vendor/opencode/packages/opencode/package.json` vs upstream).
   - If trees match, stop (already current).

4. Run compatibility dry-run in a temporary worktree.
   - Create temp worktree from current HEAD:
     - `tmp=$(mktemp -d /tmp/buddy-vendor-check-XXXXXX)`
     - `git worktree add -b codex/vendor-check-<date> "$tmp" HEAD`
   - In temp worktree:
     - Prefer copying the verified local upstream clone into place:
       - `rsync -a --delete "/Users/prashantbhudwal/Code/opencode/" "$tmp/vendor/opencode/"`
     - Use `git subtree pull --prefix vendor/opencode local_opencode dev --squash` only if you explicitly need to inspect subtree-merge behavior; do not make conflict resolution in temp the default validation path.
     - `bun install`
     - If install fails because the root workspace is missing dependencies or overrides required by the new upstream snapshot, patch those root files in temp too before judging the sync.
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

6. Apply validated changes to the real (possibly dirty) workspace safely.
   - Use temp worktree as source of truth.
   - Copy validated vendor directory back:
     - `rsync -a --delete "$tmp/vendor/opencode/" "vendor/opencode/"`
   - Carry over any validated root-workspace changes required for the snapshot to install and link correctly (for example `package.json`, `bun.lock`).
   - Carry over only the Buddy-side fixes proven in temp; do not touch unrelated paths.

7. Re-link dependencies in real workspace.
   - `bun install`
   - If the real workspace behaves differently from temp because of stale links or modules, clean the affected workspace `node_modules` state and reinstall before debugging code changes.
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
     - `diff -qr --exclude .git --exclude node_modules --exclude .turbo --exclude dist --exclude findings.md --exclude notes /Users/prashantbhudwal/Code/opencode vendor/opencode`
   - Accept local-clone-only artifacts; reject tracked source drift.

10. Shrink temporary compatibility shims before finalizing.
   - If the first green pass used adapter wrappers to absorb upstream API churn, remove the wrappers that only preserve Buddy's old calling conventions.
   - Prefer migrating Buddy boundary call sites to upstream types and entrypoints when that reduces future sync cost (for example branded IDs, renamed server entrypoints).
   - Keep the adapter only for Buddy-owned config/runtime seams.

11. Commit in two clean batches.
   - Commit 1 (vendor sync plus required root install metadata):
     - `git add vendor/opencode package.json bun.lock`
     - `git commit -m "chore(vendor): sync opencode upstream to latest dev"`
   - Commit 2 (Buddy adaptations only):
     - Stage only Buddy/adapter/runtime/test files, plus the sync log if you are versioning it.
     - `git commit -m "refactor(buddy): adapt buddy to new opencode runtime"`
   - Leave unrelated pre-existing local edits unstaged.
   - If a local hook blocks an intentional, validated vendor sync, bypass it with `--no-verify` rather than reshaping the commit just to satisfy the hook.

12. Cleanup temp artifacts.
   - `git worktree remove "$tmp"`
   - `git branch -D codex/vendor-check-<date>` (if still present)

13. Record final state in log.
   - Commit hashes created
   - Validation results
   - Remaining uncommitted files (if any)

## Fast Path (if in a hurry)
1. Refresh `local_opencode/dev` if it is behind `opencode-upstream/dev`.
2. Temp worktree `rsync` of `/Users/prashantbhudwal/Code/opencode/` into `vendor/opencode/`.
3. `bun install`.
4. Run 4 checks: Buddy typecheck + Buddy contracts + Web contracts + Buddy build:single.
5. Rsync vendor into real tree and carry over required root metadata changes.
6. `bun install` again.
7. Re-run same 4 checks.
8. Shrink throwaway adapter shims if upstream API migration is clearly better.
9. Commit vendor, then Buddy changes.
