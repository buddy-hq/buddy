# W-E1: native subagents and background runtime

2026-10-08. Packages A and B are implemented within W-E1 ownership. Integration still requires W-C2 to remove the obsolete forwarding consumers listed below. Package C remains W-E2 work.

## Design and status

| Responsibility | Result |
| --- | --- |
| Agent catalog | All seven Buddy roles compile into the existing W-G1 notebook runtime plan as native subagents. Build-style roles no longer become primaries; internal consolidator stays hidden despite a configured visibility override. Configured model/system and directory reload isolation are preserved. |
| Delegated policy | Extended W-D's `buildDelegatedChildSessionPermissions`, retaining its existing call shape. Ordered effective parent rules, author-owned eligible extras, configured restrictions, child-specific resource rules, role restrictions, dynamic exclusions and native tool permission actions compile into session permissions. Restrictive role envelopes cannot be widened by inherited parent blanket grants. |
| Child preparation | Native prompt admission prepares eligible children before the first request: update all session permissions, then publish an owned capsule. Execute-before validation rejects unrelated children and different-role continuation before upstream can switch the role. |
| Teaching lifecycle | Version 1 `metadata.buddyTeaching` stores only reconstruction fields and delegation policy. Context, compaction and generate hooks hydrate after cache eviction/restart. Ownership, role and actual root family are checked before hydration. |
| Recovery installation | Full `buddy.runtime` is installed through boot-time `instances`; locationless host catalog uses `buddy.catalog`. Both reuse W-G1's plan/config projection. Production host creation accepts and forwards `instances`. |
| Native jobs | Native blocking/background, same-role model override, cancellation, owner promotion and restart notification admission are used directly. No Buddy scheduler, task substitute or vendor patch was added. |
| Legacy removal | Forwarding runtime, resolver, v1 interception adapter and v1 test are deleted. Importer-free legacy adapter registry, agent and tool modules are also deleted. Out-of-scope forwarding consumers still require removal. |
| W-E2 | Metadata, completion-event findings, historical normalization and object/Bench behavior are documented in [`../handoff-w-e2.md`](../handoff-w-e2.md). |

Production keeps existing persona delegate lists and native depth 1. Authoring stays blocking unless the model explicitly requests background. Parent edits do not fan out; explicit continuation refreshes policy while retaining child teaching state. A different role requires a fresh child. Standalone internal memory work retains its explicit envelope and receives no persona capsule.

Tentative child state enters the cache from first-request hydration, after prompt admission. Successfully prepared durable policy/identity remains available if a later prompt hook rejects admission. This preserves retry behavior without leaving rejected tentative state in the cache. The capsule is published only after the permission update succeeds.

No second agent registration path or `buddy-agents.ts` was created. Only `config/opencode/agents.ts` required a subagent-specific compiler change; `config/runtime/notebook-runtime-plan.ts` is unchanged.

## File inventory

Created:

- `packages/buddy/src/opencode-runtime/plugins/buddy-subagents.ts`
- `packages/buddy/src/learning/agent-execution/state/teaching-session-metadata.ts`
- `packages/buddy/test/opencode-runtime/buddy-subagents.test.ts`
- `packages/buddy/test/opencode-runtime/subagent-scripted-model.ts`
- `packages/buddy/test/learning/delegated-session-permissions.test.ts`
- `docs/architecture/v2-upstream/v2-migration/handoff-w-e2.md`
- This report.

Changed:

- `packages/buddy/src/learning/runtime-subagents.ts`
- `packages/buddy/src/learning/agent-factories.ts`
- `packages/buddy/src/config/opencode/agents.ts` — role mode/internal visibility only.
- `packages/buddy/src/learning/agent-execution/permissions/delegated-permissions.ts`
- `packages/buddy/src/learning/agent-execution/permissions/runtime-session-permissions.ts`
- `packages/buddy/src/learning/features/assessment/subagents/assessment.ts`
- `packages/buddy/src/learning/features/practice/subagents/practice.ts`
- `packages/buddy/src/learning/features/curriculum-planning/subagents/goal-writer.ts`
- `packages/buddy/src/learning/features/curriculum/subagents/orchestrator.ts`
- `packages/buddy/src/learning/features/curriculum/subagents/orchestrator.md`
- `packages/buddy/src/learning/features/question-sets/subagents/question-set-author.ts`
- `packages/buddy/src/learning/features/flashcards/subagents/flashcard-author.ts`
- `packages/buddy/src/learning/features/memory/subagents/memory-consolidator.ts`
- `packages/buddy/src/opencode-runtime/plugins/buddy-runtime-plugin.ts` — subagent import/registration and runtime/catalog scope; concurrent W-C2 context wiring preserved.
- `packages/buddy/src/opencode-runtime/plugins/index.ts` — catalog scope and instances factory; Codex entry preserved.
- `packages/buddy/src/opencode-runtime/runtime.ts` — boot-time instances only.
- `packages/opencode-adapter/src/host.ts` — optional instances option/pass-through only.
- `packages/opencode-adapter/src/index.ts` — deleted tool module's export line only.
- `packages/opencode-adapter/package.json` — deleted modules' export lines only; no dependency change.
- `packages/buddy/test/learning/runtime-session-permissions.test.ts` — canonical native subagent action fixtures.
- `packages/buddy/test/learning/runtime-tool-registration.test.ts` — real host catalog coverage replaces v1 registry assertions.

Deleted:

- `packages/buddy/src/opencode-runtime/subagent-forwarding.ts`
- `packages/buddy/src/opencode-runtime/subagent-tool-forwarding-runtime.ts`
- `packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts`
- `packages/buddy/test/learning/subagent-tool-forwarding.test.ts`
- `packages/opencode-adapter/src/session-prompt.ts`
- `packages/opencode-adapter/src/registry.ts`
- `packages/opencode-adapter/src/agent.ts`
- `packages/opencode-adapter/src/tool.ts`

`registry.ts` had no consumer after the other workstreams' conversions; deleting it removed `agent.ts`'s final importer. `tool.ts` had only the removed barrel export. `session-prompt.ts` had no importer after the forwarding deletions. Searches included packages, tests and web. No vendor, generated, other config, skill-management or web files were edited by W-E1.

## Public seams and integration

The exported lifecycle functions are:

```ts
registerBuddySubagentHooks(ctx: PluginContext): Promise<void>
readBuddyTeachingSnapshot<T>(metadata: T): BuddyTeachingSnapshot | undefined
persistBuddyTeachingSnapshot(input: {
  session: TeachingSessionPort; sessionID: string; snapshot: BuddyTeachingSnapshot
}): Promise<void>
hydrateBuddyTeachingState(input: {
  session: TeachingSessionPort; directory: string; sessionID: string
}): Promise<TeachingSessionState | undefined>
publishBuddyDelegationSource(input: {
  ctx: {
    session: TeachingSessionPort
    agent: Pick<PluginContext["agent"], "get">
    location: { directory: string }
  }
  sessionID: string
  state?: TeachingSessionState
  persist?: boolean
}): Promise<BuddyTeachingSnapshot>
withBuddyTeachingSessionUpdate<T>(sessionID: string, run: () => Promise<T>): Promise<T>
buddyTeachingPolicyRevision<T>(value: T): string
```

`TeachingSessionPort` is `Pick<PluginContext["session"], "get" | "update">`. Metadata writes merge unrelated session metadata. Callers publishing/updating policy use the shared mutation lock; directory-scoped agent calls explicitly pass `location: { directory }`.

`buildDelegatedChildSessionPermissions` retains W-D's inputs and adds optional `source`, `extraTools`, `rolePermissions`, `toolActions` and `priorSource`; it returns `SessionPermissionRuleset`. It is also re-exported by `runtime-session-permissions.ts`. `syncBuddyRuntimeSessionPermissions({ directory, sessionID, sessionRuntime?, client? }): Promise<void>` accepts an optional `Pick<OpenCodeHost, "session" | "sessions" | "agent">` and preserves already prepared delegated policies even if a caller supplies root runtime defaults.

`createBuddyRuntimePlugin(options: BuddyRuntimePluginOptions, scope?: "runtime" | "catalog"): Plugin.Plugin` defaults to runtime behavior. `createBuddyOpenCodePlugins(options): Plugin.Plugin[]` returns the catalog projection plus the existing Codex plugin. `createBuddyOpenCodeInstances(options)` returns the native instances configuration with stable key `buddy.runtime.v1` and the full runtime plugin. `OpenCodeHostOptions.instances?: OpenCode.CreateOptions["instances"]` is passed through by the unchanged `createOpenCodeHost` export. Recovery configuration does not require an already returned host; any later prompt-context client access awaits the existing host readiness promise.

W-G1's `registerNotebookConfig` remains the only notebook agent registration path. No dependency additions are required.

### W-C2 removal points

Line numbers were re-read from the shared worktree after implementation; search names if concurrent edits move them:

| File | Remove |
| --- | --- |
| `packages/buddy/src/learning/prompt/message-prompt-pipeline.ts` | Line 13 resolver import; line 30 `subagentSessionPermission` result field; lines 124–137 forwarding resolution/tool overrides/state seed; lines 152–154 conditional session-permission result spread. |
| `packages/buddy/src/learning/agent-execution/transforms/command-transform.ts` | Line 18 resolver import; lines 132–162 forwarding resolution, child state seeding, tool overrides and delegated permission update. Retain surrounding ordinary teaching state/concise bookkeeping where still used. |
| `packages/buddy/src/learning/agent-execution/transforms/message-transform-orchestration.ts` | Lines 193–196 `pipelineResult.subagentSessionPermission` update block. |

Remove imports made unused by those deletions. The two resolver imports currently cause TS2307. W-E1 deliberately did not edit these W-C2-owned files. Native child preparation replaces the entire responsibility; do not add a stub resolver or reconstruct `promptOps`.

Two legacy wrappers remain because importers still exist:

- `packages/opencode-adapter/src/effect-runtime.ts`: imported by `src/session.ts:4` and `src/session-live.ts:5`.
- `packages/opencode-adapter/src/instance.ts`: imported by `src/effect-runtime.ts:4`.

Their exports remain. Conversion/deletion belongs with the remaining session adapter cleanup; W-E1 stops importing them.

### W-E2 event correction

Real live and recovered native completions arrive through `session.inbox.enqueued` (`data.item.type === "synthetic"`, metadata under `item.payload.metadata`) and `session.inbox.delivered`. Relying on the declared `session.synthetic` event alone misses these completions. Session log replay is empty under the default event-persistence configuration. Subscribe before authoritative message/inbox reads to close reconnect races. The full metadata/status/reused-child correlation contract is in the handoff.

## Replacement coverage

The real-host tests use the existing scripted-model infrastructure, native AISDK hook, isolated sandbox roots and a temporary SQLite database. Provider transport uses `@ai-sdk/perplexity` for the scripted provider because the openai-compatible native transport bypasses the AISDK language hook. Tests import public Buddy adapter APIs, never vendor services.

| Removed v1 coverage | Native replacement |
| --- | --- |
| Already-seeded and default-persona direct author | Direct prompt tests assert actual request tools, minimal state and durable capsule. |
| Parent effective tool inheritance | Both author first requests assert inherited websearch deny, role extras/isolation and no nested spawn. Continuation tests assert refreshed parent rules and preserved child resource restrictions. |
| SDK interception and task/named execution | Direct native session admission plus real `subagent` tool execution; no fake prompt operations, bypass flags or v1 message tools. |
| Standalone internal memory envelope | Explicit permissions remain unchanged, no teaching capsule/cache, unrelated author tools absent; repeated after host restart. |
| Flashcard ingest/save and question save | First requests contain the proper tool; real saved manifests attribute objects to the native child ID. |
| Role catalog/tool ownership | Seven roles, internal visibility, configured system/model, primary separation and directory reload isolation. |

Additional scenarios cover configured/project tool offs, disabled memory feature excluding owned extras, order-sensitive rules, role blanket deny, native tool-action mapping, dynamic grant/exclusion, POSIX/Windows resource patterns, skill/spawn restrictions, minimal teaching state/surface/configured concise preference, no live parent fan-out, cache eviction, different-role rejection including parallel calls, independent simultaneous authors, unknown/primary/unrelated child errors, admission failure/retry, invalid auxiliary preparation, native depth rejection and a test-only narrow depth-2 orchestrator.

Cancellation exercises blocking-owner interrupt, detached worker surviving owner interrupt, explicit child interrupt with a cancelled native notice, owner promotion to background and preserved previously saved objects. Recovery exercises an unfinished worker on the same database with empty caches, completed notification deduplication across another restart, missing/corrupt capsule, missing/unrelated actual family links and delayed host catalog registration before the recovered child's first request. Graceful task-host close while a scripted request is held produces the required unfinished persisted state, so a hard-crash process fixture was unnecessary.

## Decisions for the user

None. All specified defaults are retained. Native v2 shares the `edit` permission action across edit/write/patch tools; memory consolidation uses that shared action with its service-provided resource envelope. Duplicate v1 aliases and unavailable v1 todo permissions were removed from role definitions.

## Verification

Focused tests, from `packages/buddy`:

```sh
bun ../../script/run-test-command.ts -- bun test --preload ./test/preload.ts \
  test/opencode-runtime/buddy-subagents.test.ts \
  test/learning/delegated-session-permissions.test.ts \
  test/learning/runtime-tool-registration.test.ts \
  test/learning/runtime-session-permissions.test.ts \
  test/permission/delegated-permissions.test.ts \
  test/opencode-runtime/buddy-runtime-plugin.test.ts \
  test/opencode-runtime/runtime-host.test.ts \
  test/opencode-runtime/default-tools.test.ts
```

Result: **50 pass, 0 fail, 273 expectations across 8 files**. The focused set was rerun after policy/recovery changes; prior full focused runs also passed. Temporary roots are supplied by the standard preload/test sandbox and fixture helpers; no developer Buddy home, Electron userData or real notebook state was used.

Changed-file Oxlint used `bun ./node_modules/oxlint/bin/oxlint --config ./.oxlintrc.json` with every W-E1 TypeScript file listed above. Import contract used `bun ./script/check-import-contract.ts`. Both pass.

Sequential package typechecks used `bun run --cwd packages/opencode-adapter typecheck` and `bun run --cwd packages/buddy typecheck`. Both exit 2 on remaining out-of-scope legacy session adapters/vendor Node typing issues and the W-C2 resolver imports. Filtering to W-E1's retained/created files yields no diagnostics. Full package/root typecheck is not green; root lint/typecheck is reserved for the integration orchestrator as requested.

Native host execution was verified on macOS. Windows path policy cases pass, but native Windows host execution is unverified. No browser, full-suite/vendor tests, formatter, dependency installation or git mutation was run. No hard-process-crash recovery claim is made.
