# Upstream Fetch Log

- Started: 2026-03-20 01:12:50 IST
- Branch: `main`
- Mode: live upstream sync and validation
- Operator note: no commits or pushes will be created

## Checkpoint 1 - Baseline

- Read algorithm from `docs/guides/upstream-fetch.algo.md`
- Captured baseline before any fetch or sync
- `git status --short` at start:

```text
?? docs/product/tools/buddy-resource-chunking-strategy.md
?? "docs/upstream fetch audit.md"
```

- Next: fetch `opencode-upstream/dev` and `local_opencode/dev`, compare vendor tree hashes, then decide whether a sync is needed

## Checkpoint 2 - Upstream delta verified

- Timestamp: 2026-03-20 01:13:40 IST
- Fetched `opencode-upstream/dev` in Buddy
- Fetched `local_opencode/dev` in Buddy
- Tree hashes after fetch:

```text
HEAD:vendor/opencode       3e54a9d8ba9c7cc91898ab4c2abc538f22bac3be
opencode-upstream/dev^{tree} 88fbd93eb2fc90ff73d92020f5f12f14a180f1de
local_opencode/dev^{tree}    e9221c5648ab74a52b19b5bfa4a9d55cabf7db30
```

- Result: Buddy vendor is behind upstream, and the local upstream clone is also behind the GitHub upstream mirror
- Version spot check confirms drift:
  - Buddy vendor `opencode` version: `1.2.17`
  - Local upstream clone `opencode` version: `1.2.24`
- Local clone state check:
  - branch `dev`
  - tracking `upstream/dev`
  - behind by 248 commits
  - untracked items present: `findings.md`, `notes/`

- Decision: align the local upstream clone to current `upstream/dev` with a non-destructive fast-forward so the later subtree pull can still use `local_opencode dev` as prescribed by the algorithm

## Checkpoint 3 - Local upstream clone aligned

- Timestamp: 2026-03-20 01:14:17 IST
- Fast-forwarded `/Users/prashantbhudwal/Code/opencode` branch `dev` from `9c585bb58` to `48a7f0fd9`
- Preserved local untracked files in the clone (`findings.md`, `notes/`)
- Refreshed Buddy remote `local_opencode/dev`
- Result: `opencode-upstream/dev` and `local_opencode/dev` now point at the same commit and are safe to use as equivalent sources for the vendor sync

- Next: create a temp worktree from Buddy HEAD, perform subtree sync there, then run the four validation checks before touching the real workspace

## Checkpoint 4 - Temp sync strategy adjusted

- Timestamp: 2026-03-20 01:17:15 IST
- First attempted `git subtree pull --prefix vendor/opencode local_opencode dev --squash` inside a temp worktree
- Result: conflict-heavy merge across many vendored paths, including documentation, app, desktop, UI, and core package files
- This was not a good validation vehicle for Buddy because the goal is to test Buddy against the latest upstream vendor tree, not to manually resolve a large historical subtree merge in an ephemeral dry-run branch
- Smart-path adjustment taken:
  - removed the conflicted temp worktree
  - created a fresh temp worktree from Buddy `HEAD`
  - copied `/Users/prashantbhudwal/Code/opencode/` into `vendor/opencode/` with `rsync -a --delete`
- New temp worktree:
  - path: `/private/tmp/buddy-vendor-check-mnxfHk`
  - branch: `codex/vendor-check-2026-03-20-rsync`

- Next: run `bun install`, then Buddy typecheck, Buddy contracts, Web contracts, and Buddy `build:single` in the temp worktree

## Checkpoint 5 - Temp validation blockers identified

- `bun install` initially failed in temp because Buddy root workspace catalog was missing upstream-required entries:
  - `@effect/platform-node`
  - `effect`
- Added those catalog entries in the temp worktree only so validation could continue
- `bun install` then completed successfully in temp
- First `bun run --cwd packages/buddy typecheck` failure cluster shows Buddy-side integration drift, not a vendor copy failure
- Main breakpoints found so far:
  - adapter import moved: `opencode/permission/next` -> `opencode/permission/index`
  - adapter import moved: `opencode/tool/truncation` -> `opencode/tool/truncate`
  - runtime bootstrap drift: `Server.App()` no longer exists upstream
  - upstream branded ID types now require Buddy to construct `SessionID`, `MessageID`, `ProviderID`, `ModelID`, and `ProjectID` explicitly
  - a couple `Buffer` to web `Blob` / `BodyInit` conversions need `Uint8Array`

- Next: patch Buddy compatibility seams in the temp worktree, re-run typecheck, then continue through contracts and build

## Checkpoint 6 - Temp typecheck restored

- Patched the temp worktree compatibility layer primarily in `packages/opencode-adapter/`
- Main temp fixes applied:
  - restored compatibility wrappers for upstream server/session/provider/project/tool-registry seams
  - updated moved upstream module paths for permission and truncation exports
  - added adapter ID re-exports for branded OpenCode IDs
  - fixed Buddy test/runtime byte conversions to use `Uint8Array`
  - fixed test helper/tool-context branded session/message IDs
- Result: `bun run --cwd packages/buddy typecheck` now passes in the temp worktree

- Next: run Buddy contracts, Web contracts, then Buddy `build:single` in temp

## Checkpoint 7 - Temp validation passed

- Temp validation results after Buddy compatibility fixes:
  - `bun run --cwd packages/buddy typecheck` -> pass
  - `bun run --cwd packages/buddy test:contracts` -> pass
  - `bun run --cwd packages/web test:contracts` -> pass
  - `bun run --cwd packages/buddy build:single` -> pass
- Additional Buddy-side issue fixed during this phase:
  - config overlay keys needed path normalization because Buddy temp repos resolved as `/var/...` while OpenCode instance directories resolved as `/private/var/...`
- Additional Web contract adjustment applied in temp:
  - prompt placeholder parity test now matches the current intent-aware placeholder behavior

- Next: apply the validated vendor tree and Buddy-side fixes to the real workspace, then repeat install/typecheck/contracts/build there

## Checkpoint 8 - Real workspace synced and validated

- Applied upstream vendor tree to real workspace with `rsync -a --delete /Users/prashantbhudwal/Code/opencode/ -> vendor/opencode/`
- Applied the validated Buddy-side compatibility fixes from the temp worktree into the real workspace
- Root workspace updates applied to support the new vendor snapshot:
  - added missing workspace catalog entries for `@effect/platform-node` and `effect`
  - pinned root `@types/node` via `overrides` for deterministic installs
- Real workspace install work:
  - initial reinstall exposed stale dependency state in the main workspace
  - cleaned and rebuilt workspace `node_modules` fully, then reinstalled
  - this resolved the real-vs-temp typecheck mismatch

- Real validation results:
  - `bun run --cwd packages/buddy typecheck` -> pass
  - `bun run --cwd packages/buddy test:contracts` -> pass
  - `bun run --cwd packages/web test:contracts` -> pass
  - `bun run --cwd packages/buddy build:single` -> pass

- Vendor cleanliness checks:
  - `git diff --no-index -- vendor/opencode/packages/opencode/src/storage/db.ts /Users/prashantbhudwal/Code/opencode/packages/opencode/src/storage/db.ts` -> clean
  - `diff -qr --exclude .git --exclude node_modules --exclude .turbo --exclude dist /Users/prashantbhudwal/Code/opencode /Users/prashantbhudwal/Code/buddy/vendor/opencode` -> clean

- Next: clean up temp worktree artifacts, record final git status, and close out the log

## Checkpoint 9 - Cleanup and final state

- Timestamp: 2026-03-20 01:58:38 IST
- Removed temp worktree `/private/tmp/buddy-vendor-check-mnxfHk`
- Deleted temp branch `codex/vendor-check-2026-03-20-rsync`
- Removed local-clone-only artifacts from vendor copy:
  - `vendor/opencode/findings.md`
  - `vendor/opencode/notes/`
- Re-verified vendor tree against local clone with extra excludes for those local artifacts:
  - `diff -qr --exclude .git --exclude node_modules --exclude .turbo --exclude dist --exclude findings.md --exclude notes /Users/prashantbhudwal/Code/opencode /Users/prashantbhudwal/Code/buddy/vendor/opencode` -> clean

- Final validation status in the real workspace:
  - Buddy typecheck: pass
  - Buddy contracts: pass
  - Web contracts: pass
  - Buddy build:single: pass

- Final git status summary:
  - expected tracked modifications for the vendor sync under `vendor/opencode/**`
  - expected tracked modifications for Buddy compatibility fixes under `package.json`, `bun.lock`, `packages/opencode-adapter/**`, `packages/buddy/**`, and `packages/web/**`
  - local log file added: `docs/logs/upstream-fetch.2026-03-20.md`
  - pre-existing unrelated untracked docs still present and untouched:
    - `docs/product/tools/buddy-resource-chunking-strategy.md`
    - `docs/upstream fetch audit.md`

- No commits were created.
- No pushes were made.

## Checkpoint 10 - Adapter role reduced after review

- Timestamp: 2026-03-20 10:58:25 IST
- Follow-up change made after reviewing the sync:
  - kept the adapter as a Buddy-owned seam
  - removed compatibility wrappers that were only converting Buddy string IDs into branded upstream IDs
  - migrated Buddy call sites to construct upstream IDs explicitly at the boundary instead

- Adapter simplification applied:
  - `packages/opencode-adapter/src/server.ts` now directly re-exports upstream `Server`
  - `packages/opencode-adapter/src/session.ts` now directly re-exports upstream `Session`
  - `packages/opencode-adapter/src/provider.ts` now directly re-exports upstream `Provider`
  - `packages/opencode-adapter/src/project.ts` now directly re-exports upstream `Project`
  - `packages/opencode-adapter/src/registry.ts` now directly re-exports upstream `ToolRegistry`
  - `packages/opencode-adapter/src/session-prompt.ts` now directly re-exports upstream `SessionPrompt`

- Buddy boundary migrations applied:
  - runtime bootstrap now calls upstream `Server.Default()` directly through the adapter re-export
  - runtime session permission sync now constructs `SessionID` before calling OpenCode session APIs
  - learner decision engine now constructs `SessionID`, `ProviderID`, and `ModelID` before calling session/provider/prompt APIs
  - full system prompt assembly now constructs `ProviderID` and `ModelID` before provider/auth lookups
  - project update orchestration now constructs `ProjectID` before calling upstream `Project.update`
  - Buddy tests that call `ToolRegistry.tools(...)` now pass branded provider/model IDs explicitly

- Validation after adapter reduction:
  - `bun run --cwd packages/opencode-adapter typecheck` -> pass
  - `bun run --cwd packages/buddy typecheck` -> pass
  - targeted Buddy tests -> pass
    - `test/session/abort-tools.test.ts`
    - `test/figures/freeform-tools.test.ts`
    - `test/figures/tools.test.ts`
    - `test/learning/python-calculator-runtime.test.ts`
    - `test/skills/tool-visibility.test.ts`
    - `test/curriculum/goals-tools.test.ts`
    - `test/curriculum/tools.test.ts`
    - `test/learning/activity-tools.test.ts`
    - `test/learning/learning-tool-contract.test.ts`
    - `test/curriculum/goal-lint-template.test.ts`
    - `test/curriculum/goals-archive.test.ts`

- Decision:
  - keeping adapter seams for Buddy-owned config/runtime behavior still makes sense
  - keeping adapter seams that only hide upstream branded types does not
  - future upstream syncs should prefer boundary migrations like this over rebuilding string-compatibility wrappers
