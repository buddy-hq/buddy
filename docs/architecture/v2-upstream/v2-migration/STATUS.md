# OpenCode v2 migration — status

Experimental smoke-test of migrating Buddy onto OpenCode v2. Worktree: `/Users/prashantbhudwal/Code/buddies/v2-upgrade`, branch `v2-upgrade`, base `a99d5c41a3`.

This file is the current truth. `ORCHESTRATION.md` describes how agents are run (Sol/Luna launcher, briefs, ownership, review, handoff). `LOG.md` is the append-only diary of facts and decisions. `HANDOFF.md` is the starting brief for a new agent. If context compacts, read all three before acting.

## Target

- Upstream remote `opencode` (`github.com/anomalyco/opencode`). Default branch is now `v2`.
- Target snapshot: tag `v2.0.24` (`e7a34f09bf`, 2026-10-06), the latest release cut from the `v2` branch. The branch tip `cab7e2c242` is 66 commits ahead and unreleased.
- Research copy: `$SCRATCH/oc-v2` (git archive of `v2.0.24`), where `$SCRATCH` is this session's scratchpad.
- Previous vendor: OpenCode `1.18.16` (`ebf1bbd2f1`).

## Rules for this migration

- User goal: preserve Buddy behaviour in the main paths; where v2 overhauls a system (permissions, background subagents), redesign Buddy's side to match v2 instead of shimming v1 shapes.
- Decouple: Buddy talks to OpenCode through `@opencode/sdk` (in-process host), the v2 plugin API, and generated client types. Adapter monkey-patches of Effect internals should disappear wherever v2 offers a public seam.
- Agent pool (user, final): at most **6 OpenAI agents at once**: up to 3 Sol xhigh (`gpt-6.1-sol`, Opus-level, complex edits), 2 Sol high (Sonnet-level, scoped tasks), 3 Luna max (`gpt-6-luna`, Haiku-level minor edits). Run via `codex exec` on the three `coinit` accounts (`CODEX_HOME` = `~/.codex`, `~/.codex-t3/account-3`, `~/.codex-t3/nush`); use Sol for reviews too. Claude Opus (1) / Sonnet (2) / Haiku (3) only when Sol is not working well. Pull work back if quality slips. Launcher: `$SCRATCH/codex/run.sh <account 1|2|3> <name> <effort> <prompt-file> [model]`, outputs in `$SCRATCH/codex/runs/<name>/{meta,last.md,events.jsonl}`. If a run dies on a usage limit, it is not permanent: switch account or retry after that account's reset (as of 2026-10-08 ~02:00 IST all three had 93–96% of the 5h window and 98–99% of the 7d window left; 5h windows reset ~06:46–06:53 IST). Check `stderr.log`/`events.jsonl` for the limit error.
- Fix, don't port: where the old integration has bad code or poor separation, redesign it in the new one. Same for tests: rewrite weak or v1-shaped tests against the new contract instead of carrying them over. Same for security issues: fix concrete risks at deployed trust boundaries (no speculative machinery).
- Verification: `bun lint` then `bun typecheck` from root, never concurrently. Focused per-file tests only.
- Never touch real Buddy home / Electron userData / `.buddy` state.

## Target architecture (decided 2026-10-08, orchestrator)

```
packages/web ──@buddy/sdk──▶ packages/buddy routes (Hono, product logic)
     │                              │
     └──@buddy/transcript-contract◀─┤  Buddy-owned transcript/tool-presentation contract (no OpenCode imports)
                                    │
                                    ├─ src/opencode-runtime/   Buddy's v2 plugin (Plugin.define): tools, hooks,
                                    │                          per-chat tool policy, personas. Imports OpenCode
                                    │                          types/APIs only via @buddy/opencode-adapter.
                                    └─ @buddy/opencode-adapter  the ONLY package importing @opencode/*:
                                         host.ts     @opencode/sdk host lifecycle (db path, config, plugins, log, close)
                                         plugin.ts   re-exports of the @opencode/plugin promise API + schema types Buddy needs
                                         (later)     gateway: Buddy-facing session/message/event/permission port that maps
                                                     v2 shapes → @buddy/transcript-contract shapes
```

- Import rule (to enforce in `script/check-import-contract.ts`): only `packages/opencode-adapter/**` may import `@opencode/*` or `vendor/opencode/**`. `packages/web` imports neither `@opencode/*` nor `@buddy/opencode-adapter` except the vendor-UI theme/provider-icon wrappers (`theme`, `provider-icon`), which stay in the adapter for now.
- One host per Buddy process, created lazily by `packages/buddy/src/opencode-runtime/runtime.ts`. `database.path` = Buddy's existing OpenCode DB path from the env plan, so v2's built-in V1Migration carries old sessions forward. Directory scoping is per call (`location: { directory }`), not per client or env mutation.
- Buddy's per-directory behaviour lives in plugin `setup(ctx)` keyed on `ctx.location.directory`.
- Adapter modules that patch Effect internals are deleted, not ported, once their public-hook replacement exists.
- Workstream split so far: **W-A (Opus, running)** host + Buddy plugin on v2 API; **W-B (Sonnet, DONE)** extract `@buddy/transcript-contract` from the adapter's pure-Buddy modules (`tool-presentation`, `core-tool-presentations`, `tool-presentation-strip`, `message-visibility`, `session-title`, `parse-external`, `file-watcher`). Later: W-C gateway + routes + web on transcript contract (Phase 4), W-D permissions (5), W-E subagents/background (6), W-F Codex/providers/auth/MCP/config (7).

## Phase board

| Phase | State |
|---|---|
| 0. Recon: Buddy coupling surface, v2 architecture | done |
| 1. Vendor swap to v2.0.24 + workspace/catalog/install | done (lockfile refreshed; `@types/node` → catalog 24.12.2). Vendor swap uncommitted: vendor guard fails until committed as a vendor sync |
| 2. Embedding seam: `@opencode/sdk` host | done (W-A/W-A2) |
| 3. Plugin seam: Buddy tools + hooks on v2 plugin API | done (W-A2; config transforms W-G1; subagent hooks W-E1) |
| 4. Sessions/messages/events | done (W-C1 read, W-C2 write, fx-review2b) |
| 5. Permissions on PermissionV2 | done (W-D; containment fix fx-review1; child delegation W-E1) |
| 6. Subagents/background jobs on v2 `subagent` + jobs | done (W-E1 runtime, W-E2 transcript/running-work UI/Bench). Not built: "Continue in background" (needs a `session.background` route) |
| 7. Config/providers/auth/MCP/skills | done (W-G1, W-F1, W-F2, fx-review2a, compaction live toggle). Sidebar and Settings MCP Connect disabled while pending (verified live in isolated E2E) |
| 8. Lint, typecheck, focused tests, smoke | package typechecks 0 (buddy, adapter, contract, web); lint steps pass except the vendor guard; focused sweep 537/0; desktop dev app boots on v2 (Node wasm asset fix); headless Node-bundle smoke with a real free model 12/12 (`reports/headless-node-smoke.md`). computer-use E2E completed: **36 PASS, 0 FAIL, 0 BLOCKED, 1 conditional NOT RUN**; question runtime lookup fixed; 2 question integration + 13 running-subagent tests pass; root typecheck 13/13; report `reports/e2e-computer-use-20261008-1230.md` |

User 2026-10-08 11:45: no more subagents; orchestrator works directly.

**Next:** Review the completed computer-use report. Remaining release blocker: deferred desktop Node v1→v2 migration. Vendor guard still requires the existing vendor swap to be committed as a vendor sync.

## Autonomous mode

From 2026-10-08 ~02:00 IST the user is asleep and not monitoring. Make reasonable engineering calls; anything that is genuinely the user's decision (product behaviour changes, vendor patches, touching real user state, irreversible actions) goes to "Deferred decisions" below instead of being guessed.

## Deferred decisions

- Desktop (Node) v1→v2 migration approach (see Open blockers). User 2026-10-08 (second ask): still defer.
- External skills: v2 always loads `~/.claude/skills`, `~/.agents/skills`, project `.claude`/`.agents` skills; no off switch like v1's `OPENCODE_DISABLE_EXTERNAL_SKILLS`. DECIDED by user 2026-10-08: accept v2 behaviour.
- ~~Buddy-tool "deny with feedback"~~ resolved by W-A2: Buddy's client wrapper retains reply feedback for Buddy tools (replies must go through `getOpenCodeClient()`).

- OpenAI/ChatGPT token refresh single-flight: Buddy's own credential consumers (account, usage, images) share one refresh guard, but native v2 model requests and built-in listeners refresh through v2's own path, so concurrent refreshes across both are not coordinated. Full single-flight needs a vendor patch or new public seam. Default: accept v2 native refresh plus the Buddy guard for Buddy consumers (W-F1). User 2026-10-08: still defer.
- Notebook compaction: DECIDED by user 2026-10-08 — global-only. Per-notebook compaction overrides stop applying (kept in file, diagnostics); `small_model` → title-agent default; the Settings Auto-compaction toggle must apply live without an app restart (fix dispatched to Claude Opus).

## Open blockers

- **Desktop (Node) v1→v2 session migration is a no-op** (`#v1-migration` → noop under `node`). User decision 2026-10-08: defer; smoke test is dev-only (Bun). Options recorded in LOG.md. Must be resolved before any desktop build.
