# W-G1 report: notebook configuration and skills on v2

Completed 2026-10-08 in the shared wave-2 worktree. No vendor, generated, dependency, or Git-history changes were made by W-G1.

## Design and status

| Goal | Status |
| --- | --- |
| Notebook controller and runtime registration | Implemented; runtime plugin calls `registerNotebookConfig` and awaits its cleanup. |
| Agents, permissions, commands, providers/models, MCP and skills | Implemented through public v2 domain transforms. |
| Global compaction projection | Implemented and tested; production host initialization needs the ownership-excluded wiring below. |
| Notebook compaction | Explicit diagnostic gap; persisted values remain accepted and unchanged. |
| Skill discovery and mutation refresh | Host `skill.list` and active Location reloads; no Instance/disposeAll. |
| Config storage and project config | Buddy-owned persisted schemas and explicit filesystem directories. |
| Test helpers and owned tests | Migrated; 162 tests pass across the owned 31 files. |
| Importer-free legacy adapters | Four deleted; remaining importers listed below. |

Buddy reads its existing files and compiles an in-memory notebook plan. Config/skill reads and real prompts do not write `$schema`, OpenCode config files, or `.opencode` directories. Explicit config writes retain JSONC comments, unknown fields, source substitutions, and existing file selection. Parse errors report locations without echoing credential-bearing document content.

The runtime plugin seeds the plan during setup, then the activation-gated `buddy.notebook-config.sync` RPC installs late transforms after upstream internal.post registrations. This gives Buddy precedence for owned fields while retaining unrelated raw commands/agents and respecting independent provider removals. MCP remains authoritative, including an empty Buddy MCP configuration.

Plans are keyed by realpath/canonical directory; each plugin context retains its own controller. Active aliases, workspace contexts, and subdirectories sharing a notebook config file receive updates through their captured scoped RPC. Per-directory queues serialize publications/reloads. Deleted directories are skipped during active refresh. Global edits and shared skill mutations fan out to active Locations without opening another host or disposing any Location. Referenced skill contents are rescanned at preflight. Ordered permission fingerprints retain last-match semantics, and RPC arguments contain a SHA-256 revision rather than config/credentials.

Domain fingerprints select integration/provider/model, agent, skill, command, or MCP reloads. A default-model-only edit reloads model state; a provider edit rebuilds its dependent domains. Explicit session agent/model choices survive config edits. Multi-domain reloads are awaited by Buddy preflight; the public v2 API does not offer an atomic multi-domain transaction.

Permission translation reuses `@buddy/transcript-contract/permission-rules` and the v2 permission gateway. Native `.env`/external-directory defaults remain, notes read/edit patterns work at nested/aliased Locations, and shell permissions retain their existing separate meaning. Persisted `maxSteps`, legacy tools, MCP OAuth/timeouts, provider options/models/variants, and retired Azure/Vertex provider IDs are projected without rewriting files.

## Integration seams

From `packages/buddy/src/config/runtime/opencode-sync.ts`:

```ts
registerNotebookConfig(ctx: PluginContext): Promise<() => Promise<void>>
syncNotebookRuntimeConfig(client: Pick<OpenCodeHost, "rpc">, directory: string, force?: boolean): Promise<void>
syncOpenCodeProjectConfig(directory: string, force?: boolean): Promise<void>
ensureOpenCodeProjectOverlay(directory: string): Promise<void>
refreshActiveNotebookConfigs(): Promise<void>
refreshActiveNotebookSkillCatalogs(): Promise<void>
readOpenCodeHostConfig(): Promise<{ content: string }>
```

The runtime registration is already wired in `buddy-runtime-plugin.ts`. Routes should retain the existing config preflight before dependent operations; raw native catalog calls do not wait for plugin activation. `ensureOpenCodeProjectOverlay` is a compatibility name for sync, with no v1 overlay or Instance behind it.

**W-A/orchestrator required:** in `packages/buddy/src/opencode-runtime/runtime.ts`, import `readOpenCodeHostConfig` and pass `config: await readOpenCodeHostConfig()` into the existing `createOpenCodeHost` call. Merge `content` with any concurrently introduced inline config rather than replacing unrelated host options. This file was excluded from W-G1 ownership. The test host already uses this exact seam and verifies native compaction entries.

**F1/C2 consumers:** `/config/agents` keeps `name` as the runnable stable agent ID; the native agent's display name is distinct. The existing route shape remains compatible. Consumers resolving explicit labels can continue using `resolveConfiguredAgentKey`.

**Adapter cleanup owners:** migrate the remaining importer list below before deleting its modules. `config.ts` is now only public v2 schema re-exports, intentionally retained as the schema boundary used by the plan/plugin. Its old `withConfigOverlay` export is gone; the remaining agent/registry callers belong to legacy paths awaiting their owners.

Test helpers retain `withSyncedOpenCodeConfig(directory, fn)`; `fn` now receives an explicit `OpenCodeHost`. `createNotebookTestHost(options?: { plugins?: readonly Plugin.Plugin[]; project?: boolean })` returns an async-disposable sandboxed host. No ambient Instance is installed.

**Security handoff:** the pre-existing raw config/global config response routes are outside this ownership. Their owner must separately redact credential-bearing config fields before exposing them to web; runtime RPC and parse-error responses no longer echo those values.

## Decisions for the user

- Keep notebook compaction values stored. V2 has no public per-notebook compaction editor. Notebook `auto`, retention and buffer settings are diagnosed as unapplied; `prune` and `tail_turns` have no v2 equivalent. Global `auto`, `preserve_recent_tokens` → `keep.tokens`, and `reserved` → `buffer` are projected at host creation. Applying later global edits to an already-running host still lacks a public hot-update seam.
- `small_model` supplies the title agent default; an explicit title-agent model or disable setting wins. It does not set compaction or subagent models. Buddy helper-model configuration remains available to its existing consumers.
- Retain the recorded migration default for external `.claude`/`.agents` skills: accept v2 discovery. The stored external-root toggle still controls Buddy's additional root preparation; it cannot disable v2's native discovery.
- An enabled-only MCP entry now produces a clear validation error; a disabled-only entry is absent. Buddy does not borrow raw OpenCode MCP definitions implicitly.

## W-G1 file inventory

Created:

- `packages/buddy/src/config/contract/legacy-opencode.ts`
- `packages/buddy/src/config/store/directories.ts`
- `packages/buddy/src/config/runtime/notebook-runtime-plan.ts`
- `packages/buddy/src/config/runtime/notebook-config-plugin.ts`

Changed:

- `packages/buddy/src/config/contract/{schema,document,compatibility}.ts`
- `packages/buddy/src/config/store/{config-paths,write-config}.ts`
- `packages/buddy/src/config/opencode/{overlay-builder,skills,fingerprint,models}.ts`
- `packages/buddy/src/config/runtime/opencode-sync.ts`
- `packages/buddy/src/config/orchestration/project-config-service.ts`
- `packages/buddy/src/learning/skill-management/service/{discovery,library,mutations,system-installer}.ts`
- `packages/buddy/src/opencode-runtime/plugins/buddy-runtime-plugin.ts` — only import, registration and cleanup lines.
- `packages/opencode-adapter/src/config.ts` — public v2 schemas; all v1 patching removed.
- `packages/opencode-adapter/{package.json,src/index.ts}` — only export removal lines for deleted modules.
- `packages/buddy/test/helpers/opencode.ts`
- `packages/buddy/test/config/{agent-default,external-directory-permission,jsonc,opencode-overlay-isolation,pollution-regression,routes}.test.ts`
- `packages/buddy/test/skills/{routes,tool-visibility,upstream-skill-visibility}.test.ts`
- `packages/buddy/test/parity/{agent.test,helpers}.ts`
- `packages/buddy/test/opencode-runtime-env.test.ts`

Deleted:

- `packages/opencode-adapter/src/config-overlay.ts`
- `packages/opencode-adapter/src/plugin-live.ts`
- `packages/opencode-adapter/src/skill.ts`
- `packages/opencode-adapter/src/storage-db.ts`

Skill service `contracts.ts` and `permissions.ts`, and pre-existing edits to adapter `tool.ts`/`registry.ts`, were from other workstreams and were preserved.

Removed env-test assertions covered v1 bootstrap/bridge internals; current environment planning is covered by W-A's `test/opencode-runtime/env.test.ts`. Three fail-closed storage tests remain. Removed legacy agent/skill/overlay tests are replaced at the real v2 host boundary, including actual scripted prompt and skill-tool turns.

## Verification

From `packages/buddy`:

```sh
bun ../../script/run-test-command.ts -- bun test --preload ./test/preload.ts test/config test/skills test/parity test/opencode-runtime-env.test.ts
```

**162 pass, 0 fail, 31 files**, including JSONC persistence, project/global patch concurrency, real config/skill routes, two-notebook isolation, nested Location fanout, invalid-plan preservation, builtin skill hiding, provider policy and legacy projection, compaction host projection, notes permissions, real scripted prompt/skill-tool execution, and storage safety.

After the final title-default precedence fix, the same wrapper ran `test/config/opencode-overlay-isolation.test.ts`: **7 pass, 0 fail**.

Additional integration check with the same wrapper: `test/opencode-runtime/buddy-runtime-plugin.test.ts` — **12 pass, 0 fail**.

`bun run --cwd packages/buddy typecheck` and then, sequentially, `bun run --cwd packages/opencode-adapter typecheck` both exit 2 due to existing retained v1 modules and other migration/vendor errors. Filtered output contains no diagnostics in W-G1's new/migrated config or skill files, nor the rewritten adapter `config.ts`. The retained legacy adapter errors are enumerated by their importers below.

Changed-file Oxlint using `bun ./node_modules/oxlint/bin/oxlint --config ./.oxlintrc.json <owned files>` passes. `bun ./script/check-import-contract.ts` exits 1 with one excluded finding: `packages/buddy/test/learning/ingest-full-text-plugin.test.ts` imports `@opencode-ai/plugin`; no findings in W-G1 files.

No root lint/typecheck, full suite, vendor tests, browser/computer verification, install, or formatter ran. Windows path semantics are covered using `path.win32`/Windows permission evaluation; this run was on macOS, so an actual Windows host and live mid-turn MCP replacement remain unverified.

## Retained adapter importers

Snapshot taken at report generation; other agents may remove these afterward. Package export declarations are retained for these live importers.

### `packages/opencode-adapter/src/config.ts`

- `packages/opencode-adapter/src/index.ts:5`
- `packages/opencode-adapter/src/registry.ts:11`
- `packages/opencode-adapter/src/agent.ts:5`
- `packages/buddy/src/config/runtime/notebook-runtime-plan.ts:5`
- `packages/buddy/src/config/runtime/notebook-config-plugin.ts:6`

### `packages/opencode-adapter/src/agent.ts`

- `packages/opencode-adapter/src/registry.ts:10`
- `packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts:1`
- `packages/buddy/test/learning/runtime-tool-registration.test.ts:2`

### `packages/opencode-adapter/src/tool.ts`

- `packages/opencode-adapter/src/index.ts:4`
- `packages/buddy/src/opencode-runtime/subagent-forwarding.ts:6`
- `packages/buddy/test/helpers/tools.ts:4`
- `packages/buddy/test/learning/tool-schema-compatibility.test.ts:4`

### `packages/opencode-adapter/src/registry.ts`

- `packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts:6`
- `packages/buddy/src/opencode-runtime/subagent-forwarding.ts:5`
- `packages/buddy/src/opencode-runtime/subagent-tool-forwarding-runtime.ts:17`
- `packages/buddy/src/opencode-runtime/subagent-tool-forwarding-runtime.ts:26`
- `packages/buddy/test/media/present-media.test.ts:6`
- `packages/buddy/test/helpers/tools.ts:2`
- `packages/buddy/test/proxy-registration.test.ts:3`
- `packages/buddy/test/curriculum/goals-tools.test.ts:2`
- `packages/buddy/test/curriculum/goals-archive.test.ts:2`
- `packages/buddy/test/learning/pedagogy-tools.test.ts:4`
- `packages/buddy/test/learning/runtime-tool-registration.test.ts:5`
- `packages/buddy/test/learning/subagent-tool-forwarding.test.ts:6`
- `packages/buddy/test/learning/tool-schema-compatibility.test.ts:3`
- `packages/buddy/test/learning/ingest-full-text-plugin.test.ts:7`
- `packages/buddy/test/learning/knowledge-graph-tools.test.ts:6`
- `packages/buddy/test/flashcard/flashcard-tools-routes.test.ts:6`
- `packages/buddy/test/figures/freeform-tools.test.ts:4`
- `packages/buddy/test/figures/tools.test.ts:4`

### `packages/opencode-adapter/src/instance.ts`

- `packages/opencode-adapter/src/registry.ts:13`
- `packages/opencode-adapter/src/agent.ts:6`
- `packages/opencode-adapter/src/effect-runtime.ts:4`
- `packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts:3`
- `packages/buddy/src/opencode-runtime/subagent-forwarding.ts:3`
- `packages/buddy/src/opencode-runtime/subagent-tool-forwarding-runtime.ts:3`
- `packages/buddy/test/media/present-media.test.ts:5`
- `packages/buddy/test/proxy-registration.test.ts:2`
- `packages/buddy/test/curriculum/goals-tools.test.ts:3`
- `packages/buddy/test/curriculum/goals-archive.test.ts:3`
- `packages/buddy/test/mermaid/inline-objects.test.ts:2`
- `packages/buddy/test/learning/external-file-tool-permissions.test.ts:4`
- `packages/buddy/test/learning/pedagogy-tools.test.ts:5`
- `packages/buddy/test/learning/runtime-tool-registration.test.ts:3`
- `packages/buddy/test/learning/subagent-tool-forwarding.test.ts:4`
- `packages/buddy/test/learning/tool-schema-compatibility.test.ts:2`
- `packages/buddy/test/learning/ingest-full-text-plugin.test.ts:6`
- `packages/buddy/test/learning/knowledge-graph-tools.test.ts:5`
- `packages/buddy/test/flashcard/flashcard-tools-routes.test.ts:5`
- `packages/buddy/test/figures/freeform-tools.test.ts:3`
- `packages/buddy/test/figures/tools.test.ts:3`

### `packages/opencode-adapter/src/effect-runtime.ts`

- `packages/opencode-adapter/src/registry.ts:12`
- `packages/opencode-adapter/src/session-live.ts:5`
- `packages/opencode-adapter/src/session.ts:4`
- `packages/opencode-adapter/src/agent.ts:4`
- `packages/opencode-adapter/src/session-prompt.ts:5`
