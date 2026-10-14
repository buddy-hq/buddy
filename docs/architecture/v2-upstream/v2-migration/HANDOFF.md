# Handoff — Buddy → OpenCode v2 migration

## Current handoff (2026-10-08 ~12:00 IST) — supersedes "Where things stand" below

- All migration workstreams (phases 1–7) and both review waves are done. See `STATUS.md` for the phase board and `LOG.md` for every decision and fix.
- **Checks:**
  - Root `bun typecheck` passes 13/13; the focused Buddy sweep is 537/0.
  - Lint passes except the vendor guard. It fails on the uncommitted v1→v2 vendor swap, which must be committed as a vendor sync (`ALLOW_VENDOR_SYNC=1`) when the user asks for a commit.
- **Desktop dev app:** boots on v2 against isolated data (`BUDDY_DEV_USER_DATA_DIR`, a dev-only override added this run). The Node bundle now ships v2's tree-sitter and photon wasm.
- **Next step: the end-to-end computer-use run.** It follows `e2e-computer-use-spec.md` (setup, hard rules, cases, fix loop, kickoff prompt). The user is running it with Sol agents manually; only one agent may drive the dev app in this worktree at a time.
- **Known open:**
  - "Continue in background" is not built (needs a `session.background` route).
  - Command/skill lists are empty until a notebook's plugins load.
- **Deferred by the user:** the desktop (Node) v1→v2 session migration, which must be solved before any desktop build, and ChatGPT refresh single-flight.
- **Agent pool:** the user stopped all subagent use from the orchestrator at 11:45. Work from here is user-driven.

Read this first, then `STATUS.md` (current truth) and `LOG.md` (append-only facts, all with source paths). All three live in `docs/architecture/v2-upstream/v2-migration/`.

## The task (user's words, verbatim)

> upgrade buddy to work with opencode v2. this is an experimental worktree; i am smoke testing in general how the upgrade will go. v2 is on opencode v2 branch. you will face hurdles but your job is to preserve buddy behaviour in main places but in places like say permission where the whole thing is overhauled, or say in background subagents, you must adapt and overhaul buddy accordingly. try to decouple opencode and buddy as you migrate this. use sonnet subagent for tightly scoped small tasks, and haiku for minor, very minor edits, and opus subagents for complex edits. no more than 3 haikus and 2 sonnets or 1 opus at any time. try to stay in orchestrator mode and work through changes with subagents. you are responsible for review, seams and quality.

Added by the user mid-run:

- Maintain logs/migration status in md files so facts survive context compaction (that is what `STATUS.md` and `LOG.md` are; keep appending).
- Use subagents smartly: if Sonnet or especially Haiku output quality slips, pull the work back. Opus rarely fails.
- Where the old integration has bad code or poor separation, fix it in the new one. Same with tests. Same with security issues (concrete risks at real trust boundaries only, per `AGENTS.md`).

## Where things stand (historical, start of migration)

- Worktree: `/Users/prashantbhudwal/Code/buddies/v2-upgrade`, branch `v2-upgrade`, base `a99d5c41a3`. No code changed yet. Only new files are the three docs in this folder (uncommitted).
- Upstream remote `opencode` = `github.com/anomalyco/opencode`. Fetched into this repo: `refs/remotes/opencode/v2` (tip `cab7e2c242`, 2026-10-07) and tags `v2.0.0`…`v2.0.24`.
- Decision: vendor tag `v2.0.24` (`e7a34f09bf`, 2026-10-06), the latest release cut from the `v2` branch, not the unreleased tip (66 commits ahead).
- Current vendor is OpenCode `1.18.16` under `vendor/opencode` (plain subtree copy, not a submodule). Vendor commits need `ALLOW_VENDOR_SYNC=1` because of `.githooks` + `script/vendor-guard.ts`.
- Phase 0 (recon) is mostly done. Phases 1–8 in `STATUS.md` have not started.

## Reference copies (recreate in your own scratch dir; the previous session's scratchpad is not yours)

```bash
mkdir -p "$SCRATCH/oc-v2" && git archive v2.0.24 | tar -x -C "$SCRATCH/oc-v2"
```

```bash
mkdir -p "$SCRATCH/oc-v1" && git archive HEAD vendor/opencode | tar -x -C "$SCRATCH/oc-v1"
```

`LOG.md` paths like `packages/sdk/src/promise.ts` are relative to the v2 tree.

## Two research reports may or may not exist

Two read-only Sonnet explorers were started in the previous session. If they finished, their reports are in this folder; if a file is missing or truncated, re-run that research.

1. `buddy-surface-inventory.md` — every Buddy dependency on OpenCode: each `packages/opencode-adapter/src/*` module (what it does, vendored internals it imports, Buddy callers, user-visible behaviour on it, classification patch/wrapper/logic/dead), runtime boot sequence, SSE/event path and `toolUi` decoration, how deep `packages/web` depends on v1 message/part shapes, bad separation noticed, and which tests cover each seam.
2. `v2-permissions-subagents-events.md` — on v2.0.24: PermissionV2 request/rule/reply/saved semantics and routes/events; per-session tool policy options; the `subagent` tool, Job service and background shell, child-session hook points; event stream and v2 message/part model; where the v2 app GUI consumes them.

Treat both as unverified until you spot-check key claims against code.

## Key findings so far (details and sources in LOG.md)

- v2 deleted `packages/opencode` and renamed the scope `@opencode-ai/*` → `@opencode/*`. Layers: schema → core/protocol → server; client depends only on schema/protocol; `sdk` composes client + core + server.
- `@opencode/sdk` `OpenCode.create({ app, database: { path }, config, plugins, instances, log })` is an official in-process host: it runs Server's router in memory, returns the generated client bound to an in-memory fetch, plus `plugin(p)` and `close()`. This replaces Buddy's `loadOpenCodeApp`/`fetchOpenCodeApp`/`app-node-builder-v1`/`run-service` coupling.
- The embedded host auto-mounts a v1→v2 data migration (legacy `session` → `session_v2`, messages/parts transformed); status via `client.migration.v1.status`. Point `database.path` at Buddy's existing OpenCode DB so user sessions survive. Verify this on a temp copy, never on real user state.
- Every seam Buddy monkey-patched in v1 now has a public v2 plugin hook (`@opencode/plugin` promise API, `Plugin.define({ id, setup(ctx) })`):
  - skill hiding → `ctx.skill.transform`
  - system/messages transforms → `ctx.session.hook("context")` (mutable `system`, `messages`, `options`, `tools`)
  - per-chat tool visibility → delete from `context.tools` (also enforced at execution) and/or `ctx.permission.hook("evaluate")`
  - Buddy tools → `ctx.tool.transform(editor => editor.add(...))` with `options.codemode: false` (otherwise tools land in CodeMode's `execute` catalog)
  - personas/subagents → `ctx.agent.transform`
  - provider overlays (Codex) → `ctx.provider.transform`
  - prompt rewriting → `ctx.session.hook("prompt")`
  - plugin KV → `ctx.storage`
- SDK plugins are set up again on every Location boot with `ctx.location.directory`, so Buddy's per-notebook behaviour belongs in plugin setup, not env/config mutation.
- v2 plugin tools have no `ask()`. Hosts can raise a permission request with `client.permission.create({ sessionID, action, resources, save?, ... })`.
- Previous coupling: 38 files in `packages/opencode-adapter`; `packages/buddy/src/opencode-runtime/*` (plugin, tool shim, `plugin-ask-compat`, Codex auth/provider plugins, client) plus `routes/mcp.ts`; `packages/web` imports `@opencode-ai/sdk/v2/client` in `lib/opencode-client.ts` and `lib/onboarding-flow.ts`.
- `script/check-import-contract.ts` hardcodes strings from the old `runtime.ts` (`await ensureToolInputDeltaBridgePatched()`, `const built = await Server.Default()`); update it when the runtime is rewritten.
- Older design docs worth knowing (all dated, re-verify): `docs/architecture/v2-upstream/*.md`, `docs/architecture/decoupling/about.md`, `packages/buddy/src/opencode-runtime/UPSTREAM-HOOKS.md`, `docs/guides/upstream-fetch.algo.md` (vendor-sync runbook; its "prefer stable tag" rule is why v2.0.24 was chosen).

## Proposed target architecture (draft, not yet validated against the inventory)

```
packages/web ──BuddyClient──▶ packages/buddy (Hono, product logic)
                                  │
                                  ├─ opencode-runtime/   Buddy plugin: tools, hooks, per-chat policy, personas
                                  │                      (written against @opencode/plugin public API)
                                  └─ @buddy/opencode-adapter   owns the @opencode/sdk host lifecycle
                                                               (database path, config, app info, close)
                                                               and re-exports the client/schema types Buddy uses
```

- Only `packages/opencode-adapter` and `packages/buddy/src/opencode-runtime/**` may import `@opencode/*`; enforce it in `script/check-import-contract.ts`. `packages/web` should reach OpenCode data only through Buddy routes / `BuddyClient`. Confirm what `web/src/lib/opencode-client.ts` is used for first.
- Delete adapter modules that patch Effect internals (plugin-live, skill-live, session-prompt/registry interceptors, tool-input-delta-live, config overlay, session-live cache, …) instead of porting them, once each one's hook replacement is in place.
- Permissions: adopt PermissionV2 end to end (action/resources/save, saved rules per project, `once|always|reject`). Do not rebuild v1 per-prompt session-permission replacement; per-chat tool grants move to the context hook. Follow the principles in `permission-v2-adoption-decision.md` §"Effect on future Buddy decisions".
- Subagents/background: redesign on v2's `subagent` tool + Job service. Buddy's child teaching-state seeding needs a hook point (candidates: `tool.hook("execute.before")` on `subagent`, `session.hook("prompt")` on the child, session metadata). The permissions/subagents report covers this.

## Next steps

1. Check the two research reports; spot-check them; fold confirmed facts into `LOG.md`.
2. Phase 1, vendor swap: `rsync -a --delete "$SCRATCH/oc-v2/" vendor/opencode/`; update root `package.json` workspaces (drop `vendor/opencode/packages/sdk/js`; v2 uses `packages/*`, `packages/console/*`, `packages/stats/*`, `services/*`; include only what installs cleanly), move `patchedDependencies` to the v2 patch files/versions (v2 has its own list in its root `package.json`: e.g. `solid-js@1.9.15`, `pacote@21.5.1`, `@tanstack/virtual-core@3.17.8`, `@ff-labs/fff-bun@0.10.5`, `vite@8.2.2`, `@modelcontextprotocol/client@2.0.0`, `ghostty-web`), run `bun run vendor:sync-catalog`, then `bun install`. Expect v2 overrides (`effect`, `solid-js`, `@opentui/*`, `bun-types`) to matter.
3. Phase 2: rewrite `@buddy/opencode-adapter` around the `@opencode/sdk` host (one Opus subagent; it is the core seam).
4. Then phases 3–8 per `STATUS.md`, keeping `STATUS.md` and `LOG.md` current after every finding or decision.

## Constraints to keep

- Repo rules in `AGENTS.md`: run `bun lint` then `bun typecheck` from root, never concurrently; focused per-file tests via package scripts only; never point tests or scripts at real Buddy home / Electron userData / `.buddy` state; don't edit generated files (`packages/sdk/src/gen/`, `routeTree.gen.ts`); stop only processes you started.
- Desktop changes must work on macOS and Windows.
- No code comments; match surrounding style.
- Subagent caps at any moment: ≤3 Haiku, ≤2 Sonnet, ≤1 Opus. Give parallel agents disjoint files. You run lint/typecheck once after they finish.
