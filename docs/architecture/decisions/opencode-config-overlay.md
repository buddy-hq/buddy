# ADR: OpenCode Runtime Config Overlay Provider

Status: Accepted
Date: 2026-06-05
Deciders: Buddy Core Architecture

## Context

Buddy owns `buddy.json`, `buddy.jsonc`, and global Buddy settings, compiling them into an OpenCode-compatible configuration overlay injected when OpenCode initializes a project runtime instance.

The initial implementation injected this per-directory overlay by setting `process.env.OPENCODE_CONFIG_CONTENT` before invoking OpenCode routes and synchronizing access with a process-wide mutex. While functional, this environment-variable approach had architectural limitations:
- `process.env` is process-global, creating hazards for concurrent requests across multiple project directories.
- Correctness depended on every OpenCode call path being wrapped in `withConfigOverlay()`.
- Writing OpenCode `config.json` directly into user project directories was rejected as unacceptable workspace pollution.

The overlay is not only a model-selection mechanism. The resolved per-directory config also feeds the default persona/agent, persona and subagent definitions and permissions, global and dynamic-tool deny rules, skill paths and visibility, providers/models, MCP servers, slash commands, external-directory permission rules, and instance disposal/reload after a config change. All of those consumers must observe the same resolved config.

## Decision

1. **Per-directory runtime overlay provider:** Replace process-wide `OPENCODE_CONFIG_CONTENT` manipulation with an explicit in-memory overlay provider keyed by a canonical directory path.
2. **Bootstrap-time merge:** OpenCode's instance bootstrap (`Config.loadInstanceState(ctx)`) queries the overlay provider for `ctx.directory` and parses it via `loadConfig` at the same precedence point where inline config content is merged.
3. **No filesystem pollution:** Buddy never writes `config.json`, `opencode.json`, or `opencode.jsonc` into user workspaces.
4. **Static vs. dynamic separation:** Static agent definitions, personas, baseline permission rules, provider configurations, MCP servers, and skill paths compile into the OpenCode overlay. Session-time delegation policies, dynamic tool grants, and persona access rules remain dynamic Buddy layers on top of sessions.

## Architecture Pipeline

```text
readProjectConfig(directory)
  -> buildOpenCodeConfigOverlay({ config, directory })
  -> canonicalDirectoryKey(directory)
  -> store { overlay, fingerprint } in adapter overlay store
  -> InstanceStore.load({ directory })
  -> Config.loadInstanceState(ctx) resolves overlay for ctx.directory
  -> loadConfig(JSON.stringify(overlay), { dir: ctx.directory })
  -> merge parsed overlay at env-content precedence
  -> dependent services (Agent, Skill, ToolRegistry, Provider, MCP) boot
```

## Key Invariants

- **Canonical directory keying:** Overlay storage, fingerprinting, sync locks, and instance disposal share one canonical directory normalization helper.
- **Strict precedence:** The overlay merges at the standard `OPENCODE_CONFIG_CONTENT` precedence point during config bootstrap, ensuring identical resolution for models, MCPs, and tools.
- **Config invalidation:** Updating project config updates the fingerprint and disposes cached instances, forcing a clean reload on the next access.
- **Tool and skill boundaries:** Dynamic tools remain denied by default in the overlay and are granted per session. Skill paths include Buddy-managed and bundled skills while suppressing unmanaged vendor roots.

## Binding policy constraints

The following constraints come from the architecture review that led to this ADR. The review is historical, but these invariants remain binding:

- `Config.get()` must return the already-resolved vendor config with the Buddy overlay applied **exactly once**.
- `Agent.defaultAgent()` must respect Buddy's `default_persona`, and `Agent.get()` / `Agent.list()` must expose Buddy personas and subagents with their expected permission maps.
- `ToolRegistry.tools()` may register the Buddy catalog once, but agent/session permissions must filter visibility; dynamic tools stay denied until a session-scoped load grants them.
- Delegated child sessions must inherit parent/persona-visible tools plus target-subagent extras, then apply persona `denyTools` and project `tools` toggles. This session-time policy is separate from static agent definitions.
- Skill paths must include bundled and Buddy-managed roots while vendor `.agents` / `.claude` roots stay off by default. OpenCode skill permissions are name-based, so separate per-workspace skill permissions are not an honest promise without upstream support.
- Provider/model, MCP, command, plugin, skill, agent, and tool-registry reads must see the same per-directory compiled config.
- Directory aliases and symlinks must not create a missing overlay, duplicate sync state, or stale instance; the canonical key helper is shared by storage, sync, fingerprints, locks, and disposal.
- No generated overlay is written to a user project, including through OpenCode's `Config.update()` or `PATCH /config` write path.

### Migration risks and rejected shortcuts

These are the failure modes to preserve while the provider is introduced:

| Shortcut | Failure | Required mitigation |
|---|---|---|
| Update only adapter `Instance.provide()` or Buddy request middleware | Direct vendor `InstanceStore.load()` and services such as provider, MCP, command, skill, plugin, agent, or registry can miss the overlay. | Resolve the provider below all load paths, in instance/config bootstrap. |
| Merge in `Config.get()` | Services may boot from one config while callers read another. | Merge once during `Config.loadInstanceState(ctx)`. |
| Raw-object merge | Bypasses `loadConfig` schema validation, normalization, plugin scoping, command/agent handling, and source-aware behavior. | Serialize the overlay through the existing `loadConfig` path. |
| Change overlay precedence | Models, MCPs, permissions, plugins, commands, and agents can resolve differently from the current contract. | Start at the current `OPENCODE_CONFIG_CONTENT` precedence point; treat a precedence change as a separate decision. |
| Route overlays through `Config.update()` / `PATCH /config` | OpenCode writes `config.json` into the project and reintroduces workspace pollution. | Keep overlays bootstrap-only and in memory. |
| Push all subagent policy into static config | Delegated children lose inherited parent visibility, user overrides, or persona-specific denies. | Keep static agent ownership and session-time forwarding as two layers. |

## Regression strategy

Focused tests should preserve the contract rather than only checking a happy-path prompt:

- isolate two projects with different overlays, including concurrent bootstrap and canonical/symlink access;
- verify no `config.json`, `opencode.json`, or `opencode.jsonc` is created during sync, provider, MCP, command, or prompt flows;
- verify `default_persona`, agent/subagent permissions, provider/default-model reads, MCP reads, command visibility, and skill paths after an overlay change;
- verify direct subagent tools, delegated inheritance plus specialized extras, persona denies, and project tool toggles;
- verify dynamic tools are denied by default, allowed only after session load, and denied again after release;
- verify Buddy-managed/bundled skills remain visible while suppressed vendor roots remain hidden unless explicitly enabled.
