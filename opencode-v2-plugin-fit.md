# OpenCode v2 plugin fit for Buddy

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
