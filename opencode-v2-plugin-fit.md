# OpenCode v2 plugin fit for Buddy

## Update: local v2 check on 2026-09-29

Compared Buddy's vendored OpenCode `v1.18.16` (synced on 2026-08-12) with the local `v2` checkout at [`a5b3802`](https://github.com/anomalyco/opencode/tree/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca), whose core package reports `2.0.5`. This is a check of those two snapshots, not a claim about later upstream commits. The 2026-08-22 review below is preserved as historical context; its beta status and some of its gap assessments are superseded here. [Vendored version](vendor/opencode/packages/opencode/package.json) · [v2 version](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/core/package.json)

### What changed beyond the vendored copy

The vendored copy already has early v2 work: a confined `execute` tool mainly for MCP, experimental background subagents, a v2 TUI package, scoped Effect plugin transforms, and an Effect-native `sdk-next`. Do not count these concepts themselves as new. [Vendored Code Mode](vendor/opencode/packages/opencode/src/tool/code-mode.ts) · [vendored subagent tool](vendor/opencode/packages/opencode/src/tool/task.ts) · [vendored plugin API](vendor/opencode/packages/plugin/src/v2/effect/README.md) · [vendored SDK](vendor/opencode/packages/sdk-next/README.md)

| Area | Additional capability in checked v2 branch | Reference |
| --- | --- | --- |
| Plugins | Public Promise and Effect APIs with scoped transforms for tools, MCP, providers, models, VCS, and web search; runtime session/tool/permission hooks; plugin storage, RPC, and TUI extension points. | [Promise plugin API](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/plugin/src/README.md), [plugin context](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/plugin/src/effect/plugin.ts) |
| Embedded SDK | `@opencode/sdk` hosts the same HTTP router in process, supports direct plugin registration, Promise and Effect callers, session-selected plugin instances, and Workerd. The instance key comes from Session metadata and is stable for that instance's lifetime. | [SDK guide](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/sdk/README.md) |
| Sessions | A generic durable inbox for user/synthetic inputs and controls, explicit steer/queue behavior, write-ahead recovery of claimed top-level execution, bounded retries, and chronological instruction changes. | [Session contract](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/specs/v2/session.md) |
| Tools and Code Mode | One validated tool result contract; eligible built-in, plugin, and MCP tools can enter Code Mode with namespaced discovery. Registration and tool outcomes are scoped and canonical. | [Tool contract](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/specs/v2/tools.md), [tool registry](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/core/src/tool.ts) |
| Subagents and interface | Background child work has completion/recovery handling and explicit model selection; the TUI adds more mature session, terminal, worktree, review, and plugin surfaces. | [Subagent tool](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/core/src/tool/plugin/subagent.ts), [subagent job](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/core/src/session/subagent-job.ts) |

Buddy should still own its **Feature** and persona definitions. Compile their runtime contributions into v2 plugins, and use the embedded SDK for Session operations. The SDK/plugin boundary does not itself provide Buddy's Bench, teaching policy, or UI. [Buddy feature model](AGENTS.md) · [v2 SDK guide](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/sdk/README.md)

### Corrected functional-parity check

1. **Permission prompts do not require a new upstream API.** The old review below incorrectly treats the missing `Tool.Context.ask` as a missing v2 permission capability. V2 has a centralized permission service and a public `session.permission.create` operation. It evaluates Session/agent/saved rules and returns `{ id, effect }`; an `ask` result emits a pending request and a later `permission.replied` event. Built-in tools explicitly call `Permission.assert`. The tool registry's `options.permission` only filters wholly denied definitions; it does not automatically ask when a plugin tool executes. Port Buddy's shared `ctx.ask` wrapper to create the v2 permission request, await the reply, and preserve deny, reject, cancellation, and saved-decision behavior. The plugin context narrows `ctx.permission` to list/get/reply, but the embedded SDK exposes the public create operation. [Buddy tool context](packages/buddy/src/learning/runtime/create-buddy-tool.ts) · [v2 permission route](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/protocol/src/groups/permission.ts) · [permission service](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/core/src/permission.ts) · [registry filtering](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/core/src/tool.ts) · [public event](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/schema/src/permission.ts)
2. **Buddy's rich tool context still needs an adapter.** Buddy tools read directory, abort signal, prior messages, model/extra context, and live title/metadata updates. V2's public tool context has only Session, agent, assistant message, call ID, and progress. Directory can come from the Location-scoped plugin context; message history can be fetched through the Session message API; Effect interruption and progress/result metadata can bridge the remaining behavior. These mappings need implementation and parity tests, but the missing fields alone do not prove an upstream patch is needed. [Buddy wrapper](packages/buddy/src/learning/runtime/create-buddy-tool.ts) · [v2 Tool.Context](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/schema/src/tool.ts) · [message API](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/protocol/src/groups/message.ts)
3. **Pre-prompt transforms, skill filtering, and tool-input streaming now have public seams.** `ctx.session.hook("prompt", ...)` runs before admission; `ctx.skill.transform` can remove or alter visible skills; and `session.tool.input.delta` is a public live-only event. Buddy can derive tool presentation in its own UI from input, progress, result metadata, and events instead of mutating stored OpenCode parts. This supersedes the old note's blanket claim that live input deltas require a new hook. [Prompt preparation](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/core/src/session/prompt.ts) · [skill editor](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/plugin/src/effect/skill.ts) · [tool input event](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/schema/src/session-event.ts) · [Buddy presentation projection](packages/opencode-adapter/src/session-tool-presentation.ts)
4. **Child-session teaching policy needs a port, not yet a proven upstream patch.** Buddy currently seeds child tool overrides, permissions, and teaching state before the first prompt. V2's prompt hook runs before admission and the public Session API can update permissions; these may support Buddy's forwarding policy, potentially with a Buddy-owned subagent tool. There is still no general child-spawn hook to map Buddy's existing interceptor one-for-one. Test direct delegation, resumed children, and background completion before claiming parity. [Buddy forwarding](packages/buddy/src/opencode-runtime/subagent-forwarding.ts) · [v2 prompt hook](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/core/src/session/prompt.ts) · [Session update](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/protocol/src/groups/session.ts)
5. **Direct tool visibility must be intentional.** V2 places plugin tools in Code Mode by default. Set `options: { codemode: false }` for a Buddy tool that must remain a direct model tool; v2's built-in `read` and `subagent` tools do this. This is a migration choice, not a missing feature. [Tool options](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/schema/src/tool.ts) · [registry partition](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/core/src/tool.ts)
6. **Remaining product-specific gaps:** Buddy's `command.execute.before` transcript rewrite has no matching general v2 command-execution hook, so display may need to move to Buddy's UI or Buddy-owned command definitions. V2 MCP OAuth still hardcodes OpenCode client metadata, leaving Buddy-branded login dependent on a new extension point or a small targeted patch. V2 also does not run LSP diagnostics: without a separate diagnostics provider, Buddy's lesson workspace will report no LSP diagnostics. [Buddy command hook](packages/buddy/src/opencode-runtime/plugins/buddy-runtime-plugin.ts) · [v2 command API](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/plugin/src/effect/command.ts) · [Buddy OAuth branding patch](packages/opencode-adapter/src/mcp-oauth-branding.ts) · [v2 OAuth metadata](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/packages/core/src/mcp/oauth.ts) · [Buddy diagnostics](packages/buddy/src/learning/features/lesson-workspace/service/diagnostics.ts) · [v2 migration guide](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/services/www/src/docs/content/migrate-v1.mdx)

V2 intentionally changes its plugin and server APIs. Its migration guide says supported v1 configuration and file-based definitions should generally continue to work, but Buddy's custom plugin/adapter code and persisted-session migration need explicit validation before cutover. Do not infer user-data compatibility solely from the SDK shape. [Migration guide](https://github.com/anomalyco/opencode/blob/a5b3802ca3fcb95331fb56f3532c2b28b293b7ca/services/www/src/docs/content/migrate-v1.mdx)

### Updated conclusion

A v2 integration need not remove Buddy's teaching features. The largest implementation task is translating Buddy's rich tool context and permission request flow into the public SDK, followed by child-session policy and persistence migration tests. The confirmed user-visible loss in this checked v2 snapshot is LSP diagnostics unless Buddy supplies another source. Exact command display and MCP OAuth branding need smaller redesigns or targeted upstream work. The old five-gap list below should not be used as the current migration gate.

---

## Historical review: 2026-08-22

Reviewed OpenCode `v2` at commit [`85f32fa`](https://github.com/anomalyco/opencode/tree/85f32fa0da6643bbce96c5c9650c1ff0397c2132) on 2026-08-22.

## Current progress and release status

As of 2026-08-22, OpenCode v2 is in public beta but has no announced GA/stable release date or public milestone:

- Stable OpenCode is [`v1.18.21`](https://github.com/anomalyco/opencode/releases/tag/v1.18.21).
- V2 is distributed separately as `opencode2`; the current beta is [`v0.0.0-beta-17898`](https://github.com/anomalyco/opencode-beta/releases/tag/v0.0.0-beta-17898).
- The `beta` branch was six commits behind `v2` when checked, so beta is following active v2 development closely. See the [branch comparison](https://github.com/anomalyco/opencode/compare/beta...v2).
- The repository has no published v2 milestone or due date. Buddy should treat the stable cutover date as unknown.

The remaining work includes some explicit pre-GA concerns and some parity/reliability work that may or may not block GA:

- Durable schema and event names still require a review "before GA": [#34922](https://github.com/anomalyco/opencode/issues/34922).
- Beta and stable storage/database isolation remains open: [#34831](https://github.com/anomalyco/opencode/issues/34831).
- V1-to-v2 history migration still has failure and hidden-history cases: [#42671](https://github.com/anomalyco/opencode/issues/42671).
- Pending permission requests and questions do not survive server restarts: [#36347](https://github.com/anomalyco/opencode/issues/36347).
- LSP and formatter services still need complete v2 ports: [#38528](https://github.com/anomalyco/opencode/issues/38528).
- The V1 event/compatibility surface is intentionally retained until after cutover: [#35054](https://github.com/anomalyco/opencode/issues/35054).
- Session-specific tool availability is not complete: [#35647](https://github.com/anomalyco/opencode/issues/35647).
- Plugins still lack complete persisted-session history access: [#43517](https://github.com/anomalyco/opencode/issues/43517).
- Subagent resume and steering remain behind V1 behavior: [#36423](https://github.com/anomalyco/opencode/issues/36423).
- Third-party clients still report missing v2 API capabilities: [#41828](https://github.com/anomalyco/opencode/issues/41828).

For Buddy, v2 is ready for a disposable compatibility spike and upstream API feedback, but not for a scheduled production cutover. Migration should remain gated on data migration safety, restart reliability, and the plugin seams listed below.

## Verdict

OpenCode v2 fits Buddy materially better than the current runtime. Its plugin system is the right runtime extension boundary for Buddy's agents, tools, skills, provider/auth behavior, prompt transforms, and events. It should reduce Buddy's dependence on OpenCode internals substantially.

It should not replace Buddy's **Feature** abstraction. A Buddy Feature is a product/authoring unit: it owns tools, skills, subagents, prompt instructions, surfaces, release gates, and enablement policy. An OpenCode plugin is a runtime contribution and lifecycle unit. The clean mapping is:

```text
Buddy Feature ──compiles to──> OpenCode plugin contributions
     │                         agents / tools / skills / hooks
     └──remains Buddy-owned──> surfaces / release gates / persona composition / UX policy
```

Personas should remain Buddy-owned compositions of Features. Their runtime agent definitions can be installed through `ctx.agent.transform`.

## Why it fits

- V2 makes built-in agents, commands, skills, providers, tools, config projections, and system prompts use the same plugin mechanism as external extensions. See OpenCode's [internal plugin generation](https://github.com/anomalyco/opencode/blob/85f32fa0da6643bbce96c5c9650c1ff0397c2132/packages/core/src/plugin/internal.ts).
- Plugins contribute replayable, ordered transforms for agents, tools, skills, commands, integrations, references, MCP, and catalogs. Runtime hooks cover sessions, tools, models, HTTP, AI SDK, shell, and events. See the [v2 plugin API](https://github.com/anomalyco/opencode/blob/85f32fa0da6643bbce96c5c9650c1ff0397c2132/packages/plugin/src/effect/README.md).
- Plugin registrations are scope-owned and automatically removed, and domain rebuilds are deterministic. This is a better lifecycle model than Buddy's current global maps and service monkeypatches.
- The embedded SDK has first-class plugin registration, so Buddy no longer needs to patch OpenCode's plugin loader to inject its runtime plugin. See the [embedded SDK](https://github.com/anomalyco/opencode/blob/85f32fa0da6643bbce96c5c9650c1ff0397c2132/packages/sdk/src/opencode.ts).
- SDK plugins run before OpenCode's post/config transforms. Buddy can install persona and feature defaults while still allowing user config to override them.

## Can all adapter hotpatching disappear?

**Not with the current v2 public contracts.** A large and important portion can disappear, but Buddy would still be hacky at a few runtime seams unless OpenCode adds capabilities or Buddy redesigns the affected behavior.

### Hotpatches that should disappear

- Runtime plugin injection (`plugin-live.ts`) → embedded SDK plugin registration.
- Agent/persona config overlay for runtime definitions → `ctx.agent.transform`.
- Tool registration and definition rewriting → `ctx.tool.transform` and tool hooks.
- Skill registration/filtering → `ctx.skill.transform` plus agent/session policy.
- Provider and Codex auth integration → integration/catalog/AI SDK/session request hooks.
- System/message prompt transforms → `ctx.session.hook("context", ...)`.
- Most event interception → typed `ctx.event.subscribe(...)`.

### Remaining gaps

1. **Tool execution context is too small.** V2 exposes session ID, agent ID, message ID, call ID, and progress. It does not expose Buddy's required location/directory, abort signal, permission `ask`, message history, model/extra context, or rich metadata updates. See the current [v2 Tool context](https://github.com/anomalyco/opencode/blob/85f32fa0da6643bbce96c5c9650c1ff0397c2132/packages/schema/src/tool.ts). Buddy tools use these capabilities throughout Bench, reading, image generation, standards, lesson workspace, and rendering.
2. **No command-execution lifecycle hook.** Buddy currently rewrites command transcript parts before execution. V2 can transform command definitions but does not publicly expose that execution boundary.
3. **Tool presentation and live input deltas are not first-class plugin contracts.** Buddy currently enriches persisted tool parts and forwards streaming input for interactive surfaces. Either OpenCode needs presentation/input-delta hooks or Buddy must redesign this so the UI derives presentation without mutating runtime services/messages.
4. **Caller-dependent subagent policy is not modeled.** Static agent transforms cover most subagent registration, but Buddy can vary delegated tool access by calling persona. V2 needs a subagent/session creation hook, or Buddy must compile separate agent variants.
5. **MCP OAuth branding is not exposed.** MCP config transforms exist, but OAuth client metadata/branding is still below the public plugin API.
6. **Some session semantics remain Buddy-specific.** Fork-title lineage, live canonical session caching, and a few mutation-side behaviors may move to a typed SDK/application wrapper, but they are not all expressible as plugins today.

## Recommended direction

1. Adopt v2 as the target architecture, but do not rename Buddy Features to plugins.
2. Add a thin compiler from `DefinedBuddyFeature`/persona definitions to v2 plugin transforms. Register Buddy plugins through the embedded SDK only.
3. Keep the adapter as a normal typed compatibility boundary. Set a rule that it must not patch service methods or import unexported OpenCode modules.
4. Before migration, upstream or agree on public contracts for:
   - complete tool execution context, especially permission requests and cancellation;
   - command execution hooks;
   - tool presentation and input-delta events;
   - subagent creation/prompt policy;
   - MCP OAuth client metadata.
5. Track every surviving patch against one explicit upstream issue or one documented Buddy-side redesign. Do not carry silent monkeypatches into v2.

## Bottom line

V2 is a much better architectural match and can turn the adapter from an invasive patch layer into a small translation layer. It cannot eliminate hotpatching completely **today** without losing Buddy behavior. The migration should be gated on the five public extension seams above; once they exist—or Buddy deliberately redesigns those behaviors—a no-monkeypatch v2 adapter is realistic.
