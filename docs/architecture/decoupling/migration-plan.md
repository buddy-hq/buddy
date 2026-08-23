# OpenCode Plugin and SDK Migration Plan

Research date: 2026-05-23

## Verdict

The pasted analysis is directionally true, but it is not wholly true.

Moving Buddy toward an OpenCode plugin plus typed OpenCode SDK calls is a good direction. It would put more of Buddy's agent behavior on maintained OpenCode surfaces, reduce the custom Hono proxy surface, and make Buddy tools less dependent on OpenCode's internal Effect service shapes.

The caveat is scope. This does not remove all OpenCode adapter risk. It mainly moves tool registration, some prompt shaping, system prompt filtering, and route transport away from Buddy-specific internal wrappers. Subagent forwarding, task forwarding, skill filtering, config overlay behavior, session/tool UI shims, and some prompt orchestration still need adapter-level code unless OpenCode adds earlier and more specific hooks.

## What I Verified

Current Buddy tree:

- `packages/buddy/src/http/proxy.ts`
- `packages/buddy/src/http/proxy/body.ts`
- `packages/buddy/src/http/proxy/fetch.ts`
- `packages/buddy/src/http/proxy/registration.ts`
- `packages/buddy/src/session/orchestration/core-actions.ts`
- `packages/buddy/src/session/orchestration/interaction-actions.ts`
- `packages/buddy/src/session/orchestration/proxy-transform.ts`
- `packages/buddy/src/learning/runtime/create-buddy-tool.ts`
- `packages/buddy/src/learning/runtime/register-buddy-tools.ts`
- `packages/buddy/src/learning/runtime/register-tools.ts`
- `packages/buddy/src/learning/runtime/dynamic-tool-grants.ts`
- `packages/buddy/src/learning/agent-execution/transforms/message-transform-orchestration.ts`
- `packages/buddy/src/learning/prompt/message-prompt-pipeline.ts`
- `packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts`
- `packages/buddy/src/opencode-runtime/runtime.ts`
- `packages/buddy/src/opencode-runtime/session-prompt-tool-forwarding.ts`
- `packages/buddy/src/opencode-runtime/task-tool-forwarding.ts`
- `packages/buddy/src/opencode-runtime/skill-filtering.ts`
- `packages/buddy/src/opencode-runtime/plugins/buddy-system-prompt-guard.ts`
- `packages/buddy/src/config/opencode/overlay-builder.ts`
- `packages/opencode-adapter/src/config.ts`
- `packages/opencode-adapter/src/registry.ts`
- `packages/opencode-adapter/src/session-prompt.ts`
- `packages/opencode-adapter/src/session-live.ts`
- `packages/opencode-adapter/src/session-tool-ui.ts`
- `packages/opencode-adapter/src/skill-live.ts`

Vendored OpenCode 1.15.4:

- `vendor/opencode/packages/sdk/js/package.json`
- `vendor/opencode/packages/sdk/js/src/client.ts`
- `vendor/opencode/packages/sdk/js/src/v2/client.ts`
- `vendor/opencode/packages/sdk/js/src/v2/server.ts`
- `vendor/opencode/packages/plugin/src/index.ts`
- `vendor/opencode/packages/plugin/src/tool.ts`
- `vendor/opencode/packages/opencode/src/plugin/index.ts`
- `vendor/opencode/packages/opencode/src/tool/registry.ts`
- `vendor/opencode/packages/opencode/src/session/prompt.ts`
- `vendor/opencode/packages/opencode/src/session/llm.ts`
- `vendor/opencode/packages/opencode/src/session/compaction.ts`
- `vendor/opencode/packages/opencode/src/session/processor.ts`
- `vendor/opencode/packages/opencode/src/permission/index.ts`
- `vendor/opencode/packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts`
- `vendor/opencode/packages/opencode/src/server/routes/instance/httpapi/handlers/permission.ts`
- `vendor/opencode/packages/opencode/src/v2/session.ts`
- `vendor/opencode/packages/opencode/src/server/routes/instance/httpapi/handlers/v2/session.ts`

Local OpenCode dev checkout at `/Users/prashantbhudwal/Code/opencode`:

- SDK package version is `1.15.7`.
- Plugin hook names are effectively the same as vendored 1.15.4.
- v2 prompt, compact, and wait return `OperationUnavailableError` on dev.
- `permission.ask` is still defined in plugin types and still not triggered.
- Plugin tool `ask` is Promise-based on dev, while vendored 1.15.4 still exposes the older Effect-shaped plugin tool context.

## Findings

### True

OpenCode plugin hooks cover a meaningful part of Buddy's agent behavior:

- Static tool registration through plugin `tool` exports.
- Tool argument/result hooks with `tool.execute.before` and `tool.execute.after`.
- Tool definition shaping through `tool.definition`.
- User message mutation through `chat.message`.
- LLM params and headers through `chat.params` and `chat.headers`.
- System prompt transformation through `experimental.chat.system.transform`.
- Message history transformation through `experimental.chat.messages.transform`.
- Slash command mutation through `command.execute.before`.
- Shell environment injection through `shell.env`.
- Compaction hooks through `experimental.session.compacting` and `experimental.compaction.autocontinue`.
- Text completion post-processing through `experimental.text.complete`.

The OpenCode v1 SDK has the route surface Buddy currently needs for sessions, prompts, async prompts, commands, compaction, revert, permissions, questions, providers, MCP, config, files, and events.

OpenCode v2 is not ready for Buddy's prompt path yet. The dev checkout explicitly reports v2 prompt, compact, and wait as unavailable. Buddy should keep the v1 message format for now.

`permission.ask` is not a useful plugin hook today. The real permission flow is still session permission rules plus `permission.asked` events and HTTP replies.

### Partly True

The plugin approach can reduce the custom proxy layer, but `runSessionTransformProxy` cannot simply disappear. Today it does stateful orchestration before and after the OpenCode prompt call:

- normalizes Buddy-specific prompt fields,
- injects Buddy system/user prelude context,
- resolves persona/model targeting,
- syncs session permission rules,
- records teaching state,
- rolls teaching state back if OpenCode rejects the prompt,
- records learner evidence after accepted prompts,
- flattens workspace file reference parts for OpenCode runtime compatibility.

Some of that can move into plugin hooks, but not all of it can move cleanly today. In particular, `chat.message` runs after OpenCode has already resolved the agent/model enough to publish switch events, so it is not a clean replacement for Buddy's current pre-prompt targeting and permission orchestration.

The pasted "4 adapter patches" framing is too narrow. It is accurate only for a subset of Buddy's agent-behavior patches. The repo also has adapter shims for config overlay, session object canonicalization, tool UI metadata, provider/auth access, and runtime boot behavior. These are not all replaced by a plugin package.

### False Or Overstated

`tool.execute.before` does not replace Buddy's task forwarding patch. It can mutate task args, but it cannot replace the `promptOps.prompt()` wrapper Buddy uses to seed child-session teaching state, permissions, and tool overrides.

`tool.definition` does not implement dynamic tool security or runtime availability. It only affects descriptions and schemas sent to the model. Actual availability is controlled by permission rules and user-message tool overrides.

The migration does not mean "zero vendored internals hacking" unless upstream OpenCode adds hooks for child session creation, prompt input preprocessing, and skill visibility.

## Target Architecture

Keep Buddy's external API stable:

- The web app continues to call the generated `BuddyClient`.
- Buddy Hono remains the public backend.
- The OpenCode v1 message format remains the frontend contract.
- Existing authoring APIs such as `createBuddyTool`, `defineBuddyPersona`, `defineBuddyFeature`, and subagent definitions remain source-of-truth APIs.

Change the internal wiring:

- Buddy Hono calls OpenCode through the typed `@opencode-ai/sdk` client instead of raw proxy forwarding.
- OpenCode loads a single Buddy runtime plugin from the config overlay.
- `createBuddyTool` gains plugin-tool output wiring, or a sibling adapter converts existing `BuddyTool` definitions into OpenCode plugin `tool` exports.
- All Buddy learning tools are pre-registered through the plugin.
- Runtime visibility changes from register/unregister to permission toggling.
- Adapter patches remain only where OpenCode has no hook yet.

## Non Goals

- Do not migrate Buddy to OpenCode v2 prompt or v2 message format yet.
- Do not rewrite frontend chat state or SSE handling for this migration.
- Do not patch `vendor/opencode` directly.
- Do not remove Buddy's config overlay in the first pass.
- Do not remove subagent/task forwarding until OpenCode has an upstream child-session hook or equivalent.

## Implementation Plan

### Phase 0: Baseline And Guardrails

1. Add focused characterization tests around the current behavior before changing wiring:
   - prompt transformation rollback on rejected prompt,
   - session permission sync after persona-targeted prompt,
   - dynamic tool grant/release behavior,
   - task subagent forwarding,
   - direct persona delegate prompt forwarding,
   - system prompt guard filtering,
   - tool UI metadata persistence and stripping.

2. Prefer syncing vendored OpenCode from 1.15.4 to 1.15.7 before plugin-tool migration, or explicitly normalize the 1.15.4 plugin `ToolContext.ask` shape.
   - Reason: dev OpenCode bridges plugin `ask` to a Promise. Vendored 1.15.4 still exposes the older Effect-shaped context in `@opencode-ai/plugin`.

3. Add a small backend helper for OpenCode SDK access:
   - likely location: `packages/buddy/src/opencode-runtime/client.ts`,
   - creates `createOpencodeClient({ directory, fetch, headers })`,
   - uses the in-process OpenCode app fetch from `loadOpenCodeApp()`,
   - preserves Basic auth header behavior from `packages/buddy/src/http/proxy/fetch.ts`,
   - centralizes SDK error unwrapping and Buddy error envelope normalization.

4. Keep `fetchOpenCode` and `proxyToOpenCode` during the migration. Delete them only after all callers are gone.

### Phase 1: Replace Low-Risk Proxy Routes With SDK Calls

Start with routes that do not need Buddy's prompt transform pipeline.

Candidate replacements:

- `packages/buddy/src/routes/provider.ts`
- `packages/buddy/src/routes/auth.ts`
- `packages/buddy/src/routes/mcp.ts`
- `packages/buddy/src/routes/permission.ts`
- `packages/buddy/src/routes/question.ts`
- `packages/buddy/src/routes/project.ts`
- `packages/buddy/src/routes/global.ts` for `/global/dispose`
- `packages/buddy/src/routes/config.ts` for `/config/providers`
- non-prompt session actions in `packages/buddy/src/session/orchestration/core-actions.ts`

Session route details:

- Keep Buddy-owned `getSessionById` and `listSessionMessages` if they still need additional project filtering or cursor compatibility.
- Replace `proxySessionCollection`, `getSessionStatus`, `patchSessionById`, `summarizeSessionById`, `revertSessionById`, and `unrevertSessionById` only after preserving their current Buddy-specific side effects.
- Preserve learner memory startup after session creation.
- Preserve dynamic tool cleanup after session archive.

Acceptance criteria:

- No frontend API changes.
- Existing route tests pass.
- `rg "proxyToOpenCode" packages/buddy/src/routes packages/buddy/src/session` shrinks after each step.

### Phase 2: Introduce The Buddy OpenCode Plugin

Create a single Buddy runtime plugin. The least disruptive location is inside `packages/buddy/src/opencode-runtime/plugins/` at first. A separate `packages/buddy-opencode-plugin` package can come later if packaging or dependency boundaries require it.

Plugin responsibilities:

- export all Buddy learning tools under `tool`,
- run the current system prompt guard through `experimental.chat.system.transform`,
- optionally capture system prompts there as today,
- implement `tool.definition` for model-facing descriptions and schema tweaks,
- implement `tool.execute.before` and `tool.execute.after` for shared learning-tool hooks,
- implement `chat.params` and `chat.headers` only where Buddy has concrete policy,
- implement `experimental.session.compacting` only after existing compaction behavior is characterized.

Preserve the existing authoring API:

- Keep `createBuddyTool`.
- Add `toPluginTool()` to `BuddyTool`, or add a separate `buddyToolToPluginTool(tool)` helper.
- Keep `BuddyToolContext` Promise-based.
- Bridge plugin context to `BuddyToolContext`:
  - pass `directory`, `sessionID`, `messageID`, `agent`, `abort`,
  - map `metadata` to OpenCode plugin metadata,
  - map `ask` to Promise regardless of vendored OpenCode version,
  - preserve attachments and Buddy tool UI metadata.

Tool export strategy:

- Use `allBuddyTools()` as the canonical list.
- Include dynamic catalog tools in the exported plugin tool map.
- Validate duplicate IDs at plugin construction time.
- Keep current Zod schemas as source of truth.

Acceptance criteria:

- Existing tool schema compatibility tests still pass.
- At least one static learning tool executes through the plugin path in an integration test.
- Tool UI metadata still renders in the current frontend.

### Phase 3: Change Dynamic Tools From Registration To Permission Toggling

Replace runtime register/unregister semantics with pre-registration plus permissions.

Current files to change:

- `packages/buddy/src/learning/runtime/dynamic-tool-grants.ts`
- `packages/buddy/src/learning/runtime/register-tools.ts`
- `packages/buddy/src/learning/runtime/register-buddy-tools.ts`
- `packages/buddy/src/learning/agent-execution/permissions/session-permissions.ts`
- `packages/buddy/src/learning/agent-execution/permissions/runtime-session-permissions.ts`

New behavior:

- All dynamic learning tools are available in the plugin tool export.
- Project config and persona runtime compile to session permission rules.
- Dynamic tools default to deny.
- Loading or granting a dynamic tool updates the session permission rules with exact allow rules.
- Ending or archiving a session removes dynamic allow rules, not tool definitions.
- `tool.definition` may blank or reduce descriptions for denied tools, but this is only model guidance. It is not the enforcement layer.

Use the OpenCode SDK where possible:

- `client.session.update({ path: { id }, body: { permission } })` can set session permission rules through the HTTP API.
- If current merge semantics are not sufficient for exact replacement, keep adapter `Session.setPermission` until a small SDK route or helper provides replace semantics.

Acceptance criteria:

- No calls to `ToolRegistry.register()` for per-session dynamic grants.
- Dynamic tools are denied by default in a fresh session.
- Granting a dynamic tool makes it callable in that session only.
- Archiving a session removes the grant without unregistering global tool definitions.

### Phase 4: Consolidate System Prompt Guard Into The Plugin

The current system prompt guard is already an OpenCode plugin loaded through the config overlay:

- resolver: `packages/buddy/src/opencode-runtime/system-prompt-guard-plugin.ts`
- implementation: `packages/buddy/src/opencode-runtime/plugins/buddy-system-prompt-guard.ts`
- config load: `packages/buddy/src/config/opencode/overlay-builder.ts`

Move that implementation into the single Buddy runtime plugin.

Acceptance criteria:

- `resolveBuddySystemPromptGuardPluginUrl()` is removed or replaced by the new plugin URL resolver.
- system prompt capture still writes the same state.
- external AGENTS/CLAUDE/CONTEXT filtering behavior is unchanged.

### Phase 5: Split Prompt Orchestration Carefully

Do not move the whole prompt pipeline into `chat.message` in one step.

Keep Hono-side pre-prompt orchestration for:

- persona target resolution,
- model defaulting,
- custom request field cleanup,
- teaching state writes and rollback,
- session permission sync,
- subagent forwarding seed creation,
- workspace file reference flattening,
- accepted-prompt learner evidence.

Only move safe pieces to plugin hooks after tests exist:

- append-only learner/user context parts that do not affect agent/model selection,
- message history transformations before LLM calls,
- compaction prompt context,
- slash command post-processing where the config command template is already resolved.

If a future OpenCode hook appears before `SessionPrompt.prompt()` constructs user message info, reevaluate moving more of `message-prompt-pipeline.ts` into the plugin.

Acceptance criteria:

- `runSessionTransformProxy` is renamed or replaced with an SDK-backed orchestrator, not deleted prematurely.
- prompt and prompt_async still have identical rollback behavior.
- model/agent switch events stay correct.
- Buddy-specific request fields do not leak into OpenCode message storage.

### Phase 6: Retain And Narrow Adapter Patches

Keep these until upstream OpenCode exposes equivalent hooks:

- `packages/buddy/src/opencode-runtime/session-prompt-tool-forwarding.ts`
- `packages/buddy/src/opencode-runtime/task-tool-forwarding.ts`
- `packages/buddy/src/opencode-runtime/skill-filtering.ts`

Try to consolidate forwarding patches:

- Keep `withSubagentToolForwarding()` as the single implementation.
- Keep one adapter-level interception path for direct persona delegate prompts.
- Keep one adapter-level interception path for task tool child prompts.
- Remove any non-forwarding behavior from `task-tool-forwarding.ts`.

Do not remove skill filtering until one of these is true:

- OpenCode adds a skill visibility hook, or
- Buddy can express suppressed skills entirely through config without leaking them through `skill.available()` or `skill.get()`.

Acceptance criteria:

- Adapter patch count for agent behavior is lower, but explicit.
- Remaining patches each have a test and a comment explaining the missing upstream hook.

### Phase 7: Delete The Proxy Layer

Delete only after all proxy callers are gone:

- `packages/buddy/src/http/proxy.ts`
- `packages/buddy/src/http/proxy/body.ts`
- `packages/buddy/src/http/proxy/fetch.ts`
- `packages/buddy/src/http/proxy/registration.ts`
- `packages/buddy/src/http/proxy/types.ts`

Also remove:

- proxy registration flags,
- dynamic tool registration through proxy body transforms,
- direct `fetchOpenCode` usage outside the SDK helper.

Acceptance criteria:

- `rg "proxyToOpenCode|fetchOpenCode|prepareProxyBody" packages/buddy/src` returns no runtime callers.
- Buddy backend routes use typed SDK calls or Buddy-owned service functions.
- Error envelopes remain compatible with current frontend expectations.

### Phase 8: Validation

Run only package-relevant checks:

- `bun lint`
- `bun typecheck`
- targeted backend tests for session, config, permissions, dynamic tools, and learning tools,
- targeted web contract tests only if generated SDK output changes,
- no vendor tests.

Add migration-specific tests:

- plugin tool schema serialization,
- plugin tool execution with `metadata` and `ask`,
- denied dynamic tool cannot execute,
- granted dynamic tool can execute in one session and not another,
- system prompt guard output is unchanged,
- task subagent forwarding inherits expected tools and permissions,
- skill filtering hides suppressed OpenCode skills.

## Suggested Work Order

1. Characterization tests.
2. Vendor sync to OpenCode 1.15.7, or local compatibility bridge for plugin `ask`.
3. Internal OpenCode SDK client helper.
4. Low-risk route proxy replacements.
5. Buddy runtime plugin with one static tool.
6. Convert all static tools to plugin exports.
7. Pre-register dynamic tools and switch grants to permission toggling.
8. Fold system prompt guard into the runtime plugin.
9. Convert prompt transport from proxy to SDK while keeping Buddy orchestration.
10. Delete proxy code.
11. Consolidate remaining adapter forwarding patches.

## Open Upstream Hooks That Would Remove More Buddy Code

Ask upstream OpenCode for these hooks if the plugin direction proves stable:

- pre-prompt input transform before agent/model resolution,
- child session or subagent spawn hook with mutable permission and tool override output,
- skill visibility/filter hook,
- session permission replace API in SDK if merge semantics are insufficient,
- plugin-facing tool UI metadata support.

## Final Recommendation

Move in this direction incrementally.

The first milestone should not be "Buddy as a pure OpenCode plugin." The right first milestone is:

- OpenCode SDK replaces the Hono proxy for low-risk routes,
- Buddy tools can run as OpenCode plugin tools while preserving `createBuddyTool`,
- dynamic tool grants are permission-based,
- system prompt guard is consolidated into the Buddy plugin,
- prompt orchestration and subagent forwarding stay in Buddy-owned adapter code until upstream hooks exist.

That gives the maintainability win without pretending current OpenCode hooks cover behavior they do not cover.
