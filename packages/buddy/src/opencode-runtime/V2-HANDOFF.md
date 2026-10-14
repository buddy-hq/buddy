# W-A continuation handoff

The owned host/plugin implementation is complete. Complete default feature-catalog activation is still blocked by the v1 `opencode/auth/index` import in `packages/opencode-adapter/src/auth.ts`. The failing `default-tools.test.ts` records that integration blocker; its loader is the production loader.

## Runtime contracts

- `createOpenCodeHost`, `OpenCodeHost`, existing host type exports, and `getOpenCodeClient(): Promise<OpenCodeHost>` remain stable.
- One lazy host coalesces startup, clears failed starts, and serializes close/restart. There is no listener, per-directory client, directory header, or basic-auth bridge.
- Global/Flock imports now use public `@opencode/util/global` and `/flock` exports. Added `@opencode/util: workspace:*` to the adapter manifest and linked the existing vendored workspace locally for verification. No `bun install` or lockfile update was run; the orchestrator must refresh the lockfile/install for a fresh checkout.
- All state paths come from Buddy's planner. The existing `<Buddy data>/opencode/opencode.db` remains the migration source. Legacy journal repair stays before host creation: v2 seeds named drizzle rows, so the known null-name events migration otherwise replays existing table creation. Desktop Node V1Migration remains deferred.
- `createBuddyOpenCodePlugins` is the separate plugin-list entry point for later Codex/provider work. No v1 Codex hooks or subagent forwarding boot patches are registered.
- `Plugin.define({ id: "buddy.runtime", setup(ctx) })` closes over `ctx.location.directory`. The shim preserves input normalization before author validation, JSON-safe metadata, progress, text/file content, titles under `metadata.buddy.title`, and authored output-policy bypass when output fits the policy.
- `ctx.messages` comes from paginated `client.message.list`, projected through the W-C1 gateway. History is chronological and assistant parent IDs are tracked across page boundaries. User context includes the currently selected session agent/model for existing feature tools.
- `ctx.extra` is not supplied. The old `subagent-forwarding.ts` promptOps path is retained but inactive; `ingest-full-text.ts` retains an optional model fallback, with selected-model information provided through history and its newer host lookup; `write-without-prompt.ts` extra forwarding was removed by its owning workstream. No feature or forwarding files were edited by W-A.

## Permission/UI contract

`ctx.ask({ permission, patterns, always, metadata })` creates `{ id, sessionID, action: permission, resources: patterns, save: always, metadata, source: { type: "tool", messageID, id: callID }, agent }`. Metadata is tool-authored JSON, without an added UI envelope. The helper subscribes before creation, waits for server.connected, then filters permission.replied by sessionID and requestID. Allow returns, deny fails, once/always resumes, reject interrupts the turn, and reject with a message becomes ToolError carrying the feedback so the model can continue. Aborting the wait replies reject to clear pending UI state.

Upstream reply events omit messages. `withBuddyToolPermissionReplies` decorates the Buddy host client's reply method and retains feedback in live per-request records, including siblings rejected in a batch. The UI must use the client returned by getOpenCodeClient, as the current gateway does. Raw plugin-domain permission replies have no feedback-preserving seam.

## Transcript/catalog contract

`getBuddyToolPresentationDescriptor(directory: string, toolName: string): ToolPresentationDescriptor | undefined` lives in buddy-tool-presentation-catalog.ts, has no adapter registry dependency, uses canonical directory keys, returns clones, and falls back to Buddy core descriptors.

Commands automatically pass through `withBuddyCommandDisplay` on both client.session and client.sessions. Per-session command/prompt admission prevents concurrent ordinary prompts consuming command markers. The prompt hook writes `metadata.buddy.command = { name, arguments, display }`, while prompt.text remains the complete expanded template. Persistence is verified. The gateway currently does not render this display metadata; W-C1/W-C2 must consume `metadata.buddy.command.display` when projecting user text. `runWithCommandInvocationDisplay` is available for other invocation paths.

System filtering, concise preference handling, prompt capture, skill removal, and execution-event Bench cleanup use public v2 hooks. V2 only discovers AGENTS.md by default, but the context hook also removes supplied CLAUDE.md/context.md blocks for POSIX, drive-letter, and UNC paths. Tool metadata is not sent as model-visible tool results, so the old strip path was deleted. OpenCode's app identity supplies its release UA.

## Retained modules and importers

### registry

- `packages/buddy/src/learning/agent-execution/transforms/command-transform.ts`
- `packages/buddy/src/learning/agent-execution/transforms/message-transform-orchestration.ts`
- `packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts`
- `packages/buddy/src/opencode-runtime/subagent-forwarding.ts`
- `packages/buddy/src/opencode-runtime/subagent-tool-forwarding-runtime.ts`
- `packages/buddy/test/curriculum/goals-archive.test.ts`
- `packages/buddy/test/curriculum/goals-tools.test.ts`
- `packages/buddy/test/figures/freeform-tools.test.ts`
- `packages/buddy/test/figures/tools.test.ts`
- `packages/buddy/test/flashcard/flashcard-tools-routes.test.ts`
- `packages/buddy/test/helpers/tools.ts`
- `packages/buddy/test/learning/ingest-full-text-plugin.test.ts`
- `packages/buddy/test/learning/knowledge-graph-tools.test.ts`
- `packages/buddy/test/learning/pedagogy-tools.test.ts`
- `packages/buddy/test/learning/runtime-tool-registration.test.ts`
- `packages/buddy/test/learning/subagent-tool-forwarding.test.ts`
- `packages/buddy/test/learning/tool-schema-compatibility.test.ts`
- `packages/buddy/test/media/present-media.test.ts`
- `packages/buddy/test/proxy-registration.test.ts`
- `packages/buddy/test/session/message-route.test.ts`
- `packages/buddy/test/skills/tool-visibility.test.ts`

### plugin-live

- `packages/buddy/test/config/opencode-overlay-isolation.test.ts`
- `packages/opencode-adapter/src/index.ts`

### config-overlay

- `packages/buddy/src/config/runtime/opencode-sync.ts`
- `packages/buddy/test/config/opencode-overlay-isolation.test.ts`
- `packages/buddy/test/helpers/opencode.ts`
- `packages/opencode-adapter/src/config.ts`

The old config overlay remains unported. Registry and plugin-live can be deleted after these importers migrate; skill-live and tool-input-delta-live were deleted with their owned tests/exports. No subagent files or Codex files were edited.

## Remaining old tests outside ownership

- test/opencode-runtime-env.test.ts asserts removed v1 fields.
- test/proxy-registration.test.ts references removed loadOpenCodeApp/fetchInProcessOpenCode.
- test/session/abort-tools.test.ts and test/learning/ingest-full-text-plugin.test.ts import deleted plugin-ask-compat.
- test/session/command-transcript.test.ts tests the removed v1 command hook.
- test/config/opencode-overlay-isolation.test.ts still imports plugin-live, preventing its deletion.

## Verification

From packages/buddy:

```
bun ../../script/run-test-command.ts -- bun test --preload ./test/preload.ts test/opencode-runtime/buddy-runtime-plugin.test.ts test/opencode-runtime/buddy-tool-shim.test.ts test/opencode-runtime/env.test.ts
bun ../../script/run-test-command.ts -- bun test --preload ./test/preload.ts test/opencode-runtime/runtime-host.test.ts
bun ../../script/run-test-command.ts -- bun test --preload ./test/preload.ts test/opencode-runtime/default-tools.test.ts
```

Results: 16 passing plugin/shim/env tests and one passing singleton lifecycle test. The complete default catalog test fails on the out-of-scope v1 auth import. Scripted real turns cover approval, rejection, feedback, sibling rejection, abort cleanup, progress, attachments, input normalization, metadata exclusion, context filtering/capture, concise state, command persistence/concurrency, hidden skills, state paths, and Bench capture cleanup.

Owned-file oxlint and git diff --check pass. `bun run --cwd packages/opencode-adapter typecheck` and then `bun run --cwd packages/buddy typecheck` still exit 2 on other workstreams' files, with no diagnostics in W-A's changed files. `bun ./script/check-import-contract.ts` has 10 findings, all outside W-A's editable scope (including excluded Codex files/tests). No root lint/typecheck, formatting, install, browser verification, vendor edits, or git mutations were run. Windows execution, complete production catalog activation, and an actual legacy-session migration remain unverified.

Root verification commands:

```
bun ./node_modules/oxlint/bin/oxlint --config ./.oxlintrc.json packages/opencode-adapter/src/{host,plugin,index}.ts packages/buddy/src/opencode-runtime/{env,runtime,client,index,buddy-tool-shim,buddy-tool-presentation-catalog,tool-permission,command-display,hidden-opencode-skills,legacy-migration-repair}.ts packages/buddy/src/opencode-runtime/plugins/{index,buddy-runtime-plugin}.ts packages/buddy/test/opencode-runtime/{buddy-runtime-plugin.test,buddy-tool-shim.test,default-tools.test,scripted-model,runtime-host.test,env.test}.ts packages/buddy/src/learning/runtime/create-buddy-tool.ts script/check-import-contract.ts
bun run --cwd packages/opencode-adapter typecheck
bun run --cwd packages/buddy typecheck
bun ./script/check-import-contract.ts
```
