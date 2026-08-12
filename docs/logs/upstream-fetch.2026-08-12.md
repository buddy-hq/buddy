# Upstream Fetch — 2026-08-12

## Checkpoint

- Started: `2026-08-12 18:52:17 +0530 (IST)`
- Original base: `main` at `9f2f229203b38c1f5bdea9d374af96cb0469aa6c`
- Working branch: `buddy-upstream-fetch-1_18_16`
- Normal worktree: `/Users/prashantbhudwal/Code/buddies/buddy-upstream-fetch-1_18_16`
- Scope: stable upstream sync plus the required stable/dev/v2 desktop-activation audit. Adopt v2 only for surfaces enabled by the selected stable vendor desktop.
- Main-worktree invariant: `/Users/prashantbhudwal/Code/buddy` was verified completely clean after this log moved to the named worktree; no upstream-sync operation runs there.
- Local upstream clone has untracked research files; the dry run will read the selected Git tag via `git archive`, so these files will not enter the vendor snapshot.

### Baseline `git status --short`

```text
(clean)
```

### Baseline `git branch --show-current`

```text
buddy-upstream-fetch-1_18_16
```

## Target selection

- Current vendored OpenCode: `1.17.18`.
- Selected latest stable tag: `v1.18.16` (`a3647eb025c7615159d417dcc49fc39fdaeba65b`, tag tree `60e7b8849a579c1373cb3488b1b8f16e9f36a66f`).
- Stable-tag date: `2026-08-10`.
- Forward-looking branch tips at audit time:
  - `upstream/dev`: `1f94d8a3c86b67f4f49a0e341de74e9188381b3a` (`2026-08-12T12:03:45+08:00`).
  - `upstream/v2`: `5fd28cffc574b9937421f477f3409bc02309b1f9` (`2026-08-12T12:53:24Z`).
- `git fetch opencode-upstream --tags` refreshed branch refs and new tags but returned exit 1 because this Buddy remote would clobber several older local tag names. Target tag identity was independently verified with the upstream clone and remote refs; no tag was force-rewritten.
- The local upstream clone contains untracked research files. The selected tag snapshot was produced by `git archive v1.18.16`, excluding all of them.

## V2 adoption decision

- Meaning of adoption for this run: Buddy follows only the v2 surfaces that the selected stable vendor desktop has made active by default.
- Stable `v1.18.16` desktop and current `upstream/dev` still choose the sidecar with `OPENCODE_SIDECAR_V2 === "1" ? "v2" : "v1"`; the default stable desktop remains v1.
- `upstream/v2` activates the v2 background service, so it is horizon evidence rather than a released migration mandate.
- Result: no stable-desktop v2 cutover is mandatory in this sync. Session, permission, plugin/tool, agent, config, skill, message, command, MCP, auth, and server v2 work remains deferred until a stable desktop call path activates it. No v2-to-v1 shim is added.

## Dry-run results

- Disposable worktree: `/private/tmp/buddy-vendor-check-mU1OSq` on `codex/vendor-check-2026-08-12`, based on the same Buddy commit as the named worktree.
- Raw vendor delta: 619 files, 150,640 insertions, 82,372 deletions.
- Root workspace changes required by the tag: catalog version alignment, `solid-sonner`, and upstream patch-map updates in `package.json` plus the regenerated `bun.lock`.
- Buddy/adapter source changes required: **zero**.
- `bun run vendor:sync-catalog`: pass.
- `bun install`: pass after the root patch map was aligned to the tag.
- Root `bun typecheck`: pass after generating fresh-worktree web/SDK artifacts with `bun run --cwd packages/web prepare:web`.
- `ALLOW_VENDOR_SYNC=1 bun lint`: pass with nine pre-existing warnings.
- Web contracts: 81/81 pass.
- Buddy contracts: 6 pass, 1 known baseline failure in prompt-definition parity; the same byte-for-byte failure reproduced on the pre-sync tree.
- Buddy backend build: pass.
- Electron build: pass.
- Electron backend utility smoke: pass.
- Focused compatibility regressions: 96/96 pass across the prompt/session, permission, write-runtime, dynamic-tool, overlay, provider/reasoning, SSE, runtime-root, and subagent surfaces.

## V2 capability audit

The stable desktop activation check is decisive for this run. In `v1.18.16`, `packages/desktop/src/main/index.ts:64` still selects `v1` unless `OPENCODE_SIDECAR_V2=1`. Current `upstream/dev` has the same selector. Current `upstream/v2` instead starts the v2 background service directly (`packages/desktop/src/main/index.ts:313-318`).

| Surface | Stable desktop | `upstream/v2` desktop | Decision for Buddy |
| --- | --- | --- | --- |
| Session create/prompt/read/context/events | v1 active | v2 sidecar active | Defer until stable activates v2; keep the complete Buddy path on v1. |
| Permission requests/replies/persistence/location | v1 active | v2 sidecar active | Defer as one connected contract; no v2-to-v1 translation. |
| Plugin hooks/tool registration | v1 active | v2 sidecar active | Keep Buddy-owned plugin/tool seams; no stable cutover to adopt. |
| Tool input/events and message streaming | v1 active | v2 sidecar active | Keep Buddy SSE decoration at the owned HTTP boundary. |
| Agents/config/skills | v1 active | v2 sidecar active | Keep personas, overlays, and dynamic capabilities on the stable contract. |
| Messages/commands/MCP/auth/server routes | v1 active | v2 sidecar active | Defer the connected SDK/backend/web migration until the vendor ships it in stable desktop. |

No stable product surface met the adoption gate, so this sync adds no hybrid protocol, dual path, or compatibility shim.

## Applied sync and coupling cost

- Applied the byte-exact `v1.18.16` archive to the named worktree, plus only the tag-required root `package.json` and `bun.lock` alignment.
- Broad `rsync -rlnic --delete` comparison against the verified tag snapshot reported zero content or symlink differences after the apply.
- Vendored runtime contains no `OPENCODE_MIGRATION_DIR` or `BUDDY_RUNTIME_ROOT` dependency.
- Production Buddy/backend/web/desktop/adapter source changes required: **zero**.
- Buddy-owned changes are six test files only: experimental learner-memory tests now opt into the feature they exercise; prompt parity asserts the two canonical persona prompts; a removed skill fixture now uses `teaching-models`; and three integration tests use 15-second timeouts so repository load does not masquerade as contract failure.
- Coupling verdict: **small**. The raw vendor churn is large, but adapter/Buddy production churn is zero. This is the intended direction for reducing the cost of each upstream sync.

### Vendor delta evidence

```text
619 tracked files changed, 150640 insertions(+), 82372 deletions(-)
287 new upstream files; 906 changed vendor paths in total

228 vendor/opencode/packages/app
 71 vendor/opencode/packages/ui
 58 vendor/opencode/packages/opencode
 47 vendor/opencode/packages/desktop
 42 vendor/opencode/packages/web
 40 vendor/opencode/packages/console
 33 vendor/opencode/packages/session-ui
 21 vendor/opencode/packages/stats
 15 vendor/opencode/packages/tui
 14 vendor/opencode/packages/core
```

Notable upstream themes include model/reasoning expansion (GPT-5.6 aliases and context, OpenAI pro reasoning, Claude adaptive thinking, and additional Azure/Kimi/Meta/MiniMax/Mistral/Muse discovery), retry/context-overflow hardening, chronological message behavior, orphan-compaction recovery, and session/tool-input fixes. The required root patch map adds the selected tag's AI SDK and DnD patches and moves the virtual-core patch to the tag's `3.17.3` version.

## Post-sync validation

- `bun run vendor:sync-catalog`: pass; catalog already aligned after apply.
- `bun install`: pass.
- Root `bun typecheck`: pass, 8/8 tasks.
- `ALLOW_VENDOR_SYNC=1 bun lint`: pass with nine pre-existing warnings; `script/user-command.ts` completed with no remaining command.
- Buddy contracts: 7/7 pass.
- Web contracts: 81/81 pass.
- Full Buddy suite: 828/828 pass across 148 files (3,185 expectations).
- Focused compatibility suite: 96/96 pass.
- Buddy Node backend build: pass.
- Electron build: pass.
- Electron backend utility smoke: pass.
- Packaged macOS arm64 build: pass, including the packaged-backend chemistry smoke and ad-hoc signing of `Buddy Dev.app`, zip, and DMG outputs.
- `git diff --check` for tracked paths present during validation: pass. Final staged validation later reported intentional trailing spaces inside the newly added upstream `@ai-sdk/mistral` patch; its blob hash exactly matches `v1.18.16`, and `git diff --cached --check` passes when that byte-exact upstream patch is excluded.

## Live HTTP smoke

The server was started from the named worktree on `127.0.0.1:3011` with an isolated `BUDDY_RUNTIME_ROOT`. These real requests were executed:

```text
GET  /api/healthz                                                     -> 200 {"healthy":true}
GET  /api/health                                                      -> 200 {"healthy":true,"version":"local"}
POST /api/session?directory=<named-worktree>                          -> 200 ses_009b13374ffe0ienDeMDzwiBeq
GET  /api/session/ses_009b13374ffe0ienDeMDzwiBeq                     -> 200
POST /api/session/ses_009b13374ffe0ienDeMDzwiBeq/prompt_async body { -> 400 {"error":"Invalid JSON body"}
POST /api/session/ses_missing/prompt_async                            -> 404 {"error":"Session not found"}
GET  /api/event?directory=<named-worktree> (curl --max-time 2 -N)     -> 200 server.connected event; client timeout 28 was intentional
```

No Buddy-owned production route changed in this sync; the smoke covers health, session create/read, malformed prompt normalization, missing-session handling, and the SSE connection boundary.

## Computer-use end-to-end verification

- Launched the packaged `file:` renderer from this worktree and visually verified the desktop shell, chat, sidebar, Bench, and multi-page PDF assets.
- Started and logged an independent `bun run dev:desktop` from this worktree; verified the exact worktree bundle ID and `http://localhost:5173` renderer rather than relying on an existing Buddy process.
- Created a new chat, submitted a real prompt, selected newly surfaced GPT-5.6 Terra, observed its reasoning state, and received a model response. A free Nemotron request stalled and was stopped cleanly before the configured OpenAI model completed normally.
- Exercised an upstream write through chat, verified the exact file contents, inspected the transcript's applied-edit activity, and removed the temporary file.
- Triggered the external-directory permission path for `/tmp/buddy-upstream-permission-smoke.txt`; verified the permission dock showed `Reject`, `Allow always`, and `Allow once`, selected `Allow once`, verified the exact written contents, and removed the file.
- Opened Settings > Skills, toggled Analogies off, verified the visible state changed, toggled it back on, and confirmed the original setting was restored.
- Cold-restarted the owned dev app and confirmed the same session, model, response, and Bench target rehydrated.
- Owned dev logs contained no unhandled errors and no HTTP 5xx responses. The only warning was an optional released system-skill artifact refresh returning 404 in development; installed local skills still loaded and toggled correctly.

## Buddy risk ledger and unlocks

- Confirmed regression: stale test assumptions around learner-memory feature gating, persona prompt equality, and the removed `explain` fixture. Tests were repaired to express current product contracts; no production change was needed.
- Rejected false alarm: three default five-second timeouts occurred only under sustained machine load above 20. The affected integration tests pass with their explicit 15-second budgets, and the complete 828-test run passed with a 20-second runner ceiling.
- Rejected false alarm: the dry-run prompt-parity failure reproduced byte-for-byte on the pre-sync tree and reflected an obsolete equality assertion, not upstream runtime drift.
- Known non-blocking warning: the development-only system skill-pack refresh endpoint returned 404; local skill discovery and enable/disable behavior were green.
- Unlocks: Buddy receives the stable model/reasoning, retry, compaction, chronological-message, session, and tool-input fixes without adding adapter debt. The stable desktop has not yet adopted v2, so there is no premature migration cost in this batch.

## Pre-commit main integration

- Fast-forwarded `buddy-upstream-fetch-1_18_16` from the original base to current `main` at `854137a6ee` before creating the sync commits.
- The five incoming `main` commits had no path overlap with the vendor sync, root install metadata, Buddy test adaptations, or this log; the fast-forward completed without conflicts.
- Post-fast-forward root `bun typecheck` passed (8/8 tasks).
- Post-fast-forward `ALLOW_VENDOR_SYNC=1 bun lint` passed with the same nine pre-existing warnings.
- No push was performed; the branch is intended to remain a local commit stack ready to move onto `main`.

## Commit state

- Vendor snapshot and root install metadata: `9a21a66194` (`chore(vendor): sync opencode upstream to v1.18.16`).
- Buddy compatibility tests and this run log: the commit containing this document (`test(buddy): align compatibility coverage with OpenCode 1.18.16`).
- Expected remaining uncommitted paths after the second commit: none.
