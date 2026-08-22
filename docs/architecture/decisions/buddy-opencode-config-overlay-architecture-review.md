# Buddy OpenCode Config Overlay Architecture Review

Date: 2026-06-05

## User Query

The user asked for a consequential review of Buddy's config architecture, especially whether the current env-based overlay pipeline is still the right approach or an MVP-era workaround.

The supplied architecture summary described this stack:

```txt
Desktop app (Electron)
  -> Buddy backend Bun sidecar
    -> loadOpenCodeApp()
      -> one vendored OpenCode server in-process
        -> all projects selected by x-opencode-directory
```

The supplied summary also described this overlay pipeline:

```txt
buddy.json + global config
  -> buildOpenCodeConfigOverlay(directory)
  -> setConfigOverlay(directory, overlay)
  -> syncOpenCodeProjectConfig(directory)
  -> fetchOpenCodeApp(request)
  -> withConfigOverlay(directory, fn)
  -> process.env.OPENCODE_CONFIG_CONTENT
  -> vendored OpenCode instance bootstrap
  -> cached InstanceState config
```

The follow-up request was:

> Can you do a deep review of what happens if we go to this new architecture that we are proposing? My main concerns are this about sub-agents, like we have this... For example, our sub-agent tooling policy is very separate, like where we hand off all the sub-agent tools to its sub-agent and then add some extra tools. We also have some ability to turn tools on and off from the settings or the... so we have a lot of custom functionality around sub-agents, around tools, around dynamic tools. So do a deep review and see if a better architecture is possible without breaking the current things or current policies. Basically check whatever the current config layer touches and then do a deep review.

## Executive Summary

Buddy's product-level architecture is sound: Buddy owns `buddy.json` and global Buddy settings, compiles them into an OpenCode-shaped runtime config, and embeds vendored OpenCode as the execution kernel.

The weak part is the transport mechanism. Buddy currently delivers a per-directory config overlay through `process.env.OPENCODE_CONFIG_CONTENT`, which is process-wide. The recent mutex reduces leakage risk, but the architecture still depends on every OpenCode entry path going through the overlay wrapper at the right time.

The recommended target is to preserve Buddy's config compiler and policies, but replace env flipping with an explicit per-directory overlay provider that is consumed by OpenCode instance bootstrap.

## Final Conclusion

Do not make Buddy "more like vendor OpenCode" by writing OpenCode `config.json` into user projects. That would violate Buddy's user-facing config boundary and reintroduce project pollution.

Do replace env-based overlay injection with a first-class per-directory runtime overlay path that is consumed during vendor config bootstrap:

```txt
Buddy config compiler
  -> compiled OpenCode overlay + fingerprint
  -> overlay store keyed by one canonical directory key
  -> InstanceStore.load(directory)
  -> Config.loadInstanceState(ctx) resolves overlay for that directory
  -> OpenCode loadConfig parses/normalizes the overlay
  -> overlay merges at the current OPENCODE_CONFIG_CONTENT precedence point
  -> Agent, Skill, ToolRegistry, Provider, MCP boot from resolved config
```

Static agent/subagent definitions should remain in the compiled OpenCode overlay. Session-time delegation policy, dynamic tool loading, and persona runtime access should remain Buddy-owned logic layered on top of OpenCode sessions.

## Current Architecture

Buddy has two user-facing config sources:

- Global Buddy config under the Buddy home/config root.
- Per-project `buddy.json` or `buddy.jsonc`.

OpenCode does not read `buddy.json`. Buddy reads Buddy config, validates it, normalizes it, compiles it into an OpenCode-shaped partial config, stores that overlay in memory, and injects it when OpenCode boots a directory-scoped instance.

Current implementation:

- `packages/buddy/src/config/store/read-config.ts` merges global, project, env, tool toggles, and permission defaults.
- `packages/buddy/src/config/opencode/overlay-builder.ts` builds the OpenCode overlay.
- `packages/buddy/src/config/runtime/opencode-sync.ts` applies the overlay and disposes stale OpenCode instances.
- `packages/opencode-adapter/src/config.ts` stores overlays in a `Map` and uses `withConfigOverlay()`.
- `packages/buddy/src/opencode-runtime/fetch-with-overlay.ts` wraps in-process HTTP requests.
- `vendor/opencode/packages/opencode/src/config/config.ts` reads `OPENCODE_CONFIG_CONTENT` during config load and stores the resolved result in `InstanceState`.

## What The Config Layer Touches

The overlay controls more than just default model selection.

It affects:

- Default persona/default agent.
- Persona and subagent agent definitions.
- Agent permission maps.
- Global permission rules.
- Dynamic-tool default denies.
- Tool toggles from settings or config.
- Skill paths and skill visibility.
- Provider and model configuration.
- MCP server configuration.
- Slash commands.
- External directory permission rules.
- Runtime disposal/reload behavior after config changes.

Because of that, the migration must preserve exact runtime behavior for `Agent.get()`, `Agent.list()`, `ToolRegistry.tools()`, `Skill.available()`, provider model lookup, MCP status, and session prompt execution.

## Related Files

Buddy config reading and writing:

- `packages/buddy/src/config/config.ts`
- `packages/buddy/src/config/store/read-config.ts`
- `packages/buddy/src/config/store/write-config.ts`
- `packages/buddy/src/config/store/permission-overrides.ts`
- `packages/buddy/src/config/store/config-paths.ts`
- `packages/buddy/src/config/contract/schema.ts`

OpenCode overlay compilation:

- `packages/buddy/src/config/opencode/overlay-builder.ts`
- `packages/buddy/src/config/opencode/agents.ts`
- `packages/buddy/src/config/opencode/skills.ts`
- `packages/buddy/src/config/opencode/fingerprint.ts`
- `packages/buddy/src/config/runtime/opencode-sync.ts`

Adapter overlay delivery:

- `packages/opencode-adapter/src/config.ts`
- `packages/buddy/src/opencode-runtime/fetch-with-overlay.ts`
- `packages/buddy/src/opencode-runtime/in-process-fetch.ts`
- `packages/buddy/src/opencode-runtime/client.ts`

Vendored OpenCode config and instance cache:

- `vendor/opencode/packages/opencode/src/config/config.ts`
- `vendor/opencode/packages/opencode/src/project/instance-store.ts`
- `vendor/opencode/packages/opencode/src/project/instance-context.ts`
- `vendor/opencode/packages/opencode/src/project/instance-runtime.ts`
- `vendor/opencode/packages/opencode/src/effect/instance-state.ts`
- `vendor/opencode/packages/opencode/src/server/routes/instance/httpapi/middleware/instance-context.ts`

Agents, subagents, and permissions:

- `packages/buddy/src/learning/agent-factories.ts`
- `packages/buddy/src/learning/runtime-subagents.ts`
- `packages/buddy/src/learning/runtime/define-buddy-subagent.ts`
- `packages/buddy/src/learning/personas/wiring/create-buddy-persona-agent.ts`
- `packages/buddy/src/learning/personas/wiring/define-buddy-persona.ts`
- `packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts`
- `packages/buddy/src/opencode-runtime/subagent-forwarding.ts`
- `packages/buddy/src/opencode-runtime/subagent-tool-forwarding-runtime.ts`

Tools and dynamic tools:

- `packages/buddy/src/learning/runtime/create-buddy-tool.ts`
- `packages/buddy/src/learning/runtime/feature-registry.ts`
- `packages/buddy/src/learning/runtime/tool-registry.ts`
- `packages/buddy/src/learning/runtime/tool-permission-compiler.ts`
- `packages/buddy/src/learning/runtime/dynamic-tool-search.ts`
- `packages/buddy/src/learning/runtime/dynamic-tool-discovery.ts`
- `packages/buddy/src/learning/runtime/dynamic-tool-grants.ts`
- `packages/buddy/src/learning/runtime/dynamic-tool-permissions.ts`
- `packages/opencode-adapter/src/registry.ts`
- `vendor/opencode/packages/opencode/src/tool/registry.ts`

Runtime plugin and tool registration:

- `packages/buddy/src/opencode-runtime/runtime.ts`
- `packages/buddy/src/opencode-runtime/plugins/buddy-runtime-plugin.ts`
- `packages/buddy/src/opencode-runtime/buddy-tool-shim.ts`
- `packages/opencode-adapter/src/plugin-live.ts`
- `packages/opencode-adapter/src/skill-live.ts`

Key regression tests:

- `packages/buddy/test/config/opencode-overlay-isolation.test.ts`
- `packages/buddy/test/config/pollution-regression.test.ts`
- `packages/buddy/test/opencode-runtime/buddy-runtime-plugin.test.ts`
- `packages/buddy/test/opencode-runtime/fetch-with-overlay.test.ts`
- `packages/buddy/test/learning/runtime-tool-registration.test.ts`
- `packages/buddy/test/learning/subagent-tool-forwarding.test.ts`
- `packages/buddy/test/learning/dynamic-tool-permission-toggle.test.ts`
- `packages/buddy/test/learning/dynamic-tool-end-to-end.test.ts`
- `packages/buddy/test/skills/tool-visibility.test.ts`

## Premises And Hypotheses

Premise: Buddy is the product owner for `buddy.json` and global Buddy settings.

Implication: The OpenCode config file format is an internal runtime target, not the user-facing source of truth.

Premise: Vendored OpenCode caches runtime state per directory through `InstanceStore` and `InstanceState`.

Implication: Per-directory isolation should be implemented at the instance/config boundary, not by spawning separate sidecars or writing per-project OpenCode config files.

Premise: `OPENCODE_CONFIG_CONTENT` is process-wide.

Implication: It can represent only one overlay at a time. It is safe only if every read/bootstrap path is serialized and wrapped correctly.

Hypothesis: The mutex and `AsyncLocalStorage` fix makes the current env-based model safer, but not architecturally clean.

Implication: It should be treated as a stabilization patch, not the final design.

Premise: Vendor `Config.update()` writes `config.json` into the active directory.

Implication: Buddy should keep avoiding `PATCH /config` or any vendor update path that pollutes user repositories.

Premise: Runtime plugin hooks already receive `{ directory, worktree }`.

Implication: Buddy's tool registration path is already close to the desired per-instance model.

Premise: Subagent policy is split between static agent config and session-time forwarding.

Implication: A config transport migration must not attempt to push all subagent behavior into static OpenCode config.

Premise: Dynamic tools are registered as possible plugin tools but denied by default.

Implication: Dynamic tool search/load behavior depends on session permission mutation, not only on initial config.

## Subagent Policy Review

Buddy subagents have two policy layers.

Static layer:

- `runtime-subagents.ts` compiles each Buddy subagent into an OpenCode agent.
- Subagent-owned tools are merged into the subagent permission map as `allow`.
- Dynamic tools are denied at agent level until loaded.
- Personas expose only configured delegate subagents through task permission rules.

Session-time layer:

- `subagent-tool-forwarding.ts` computes the effective tool set for a delegated subagent.
- It starts from the parent/persona-visible tools.
- It adds the target subagent's specialized tools.
- It applies persona `denyTools` policy.
- It applies project tool toggles from `buddy.json`.
- It writes session permissions and tool overrides.

This split should remain. Static config answers "what agents exist and what they own." Session-time Buddy logic answers "what should this delegated child inherit for this specific turn/session."

## Dynamic Tool Review

Dynamic tool behavior has these invariants:

- Buddy plugin hooks register the full Buddy tool catalog.
- Dynamic tools are denied by default in static and session permission rules.
- `learning_tool_search` returns loadable dynamic tool candidates.
- `learning_tool_load` grants exact dynamic tools for the current session.
- Project `tools` toggles can make a dynamic tool ineligible.
- Releasing dynamic tools removes session allow rules and restores default deny rules.

This policy does not require env injection. It requires that the OpenCode agent, tool registry, and session permission systems all boot from the same resolved per-directory config.

## Skill Policy Review

Buddy intentionally controls skill discovery and visibility:

- Bundled Buddy feature skills are resolved and injected through `skills.paths`.
- Managed Buddy skills and managed system skills are added to OpenCode skill paths.
- Vendor-style `.agents` and `.claude` skill roots are disabled by default.
- The UI may refresh local skill lists without forcing runtime teardown.
- Skill permissions are name-based in OpenCode, so Buddy cannot honestly provide separate per-workspace skill permissions without upstream support.

The new architecture should preserve Buddy's compiled skill paths and visibility filter. It should not simply let OpenCode discover all default external skill roots.

## Proposed Better Architecture

This section incorporates the independent review result. The direction is sound only if the overlay provider is consumed inside vendored OpenCode config bootstrap, at the same semantic merge point currently used by `OPENCODE_CONFIG_CONTENT` in `vendor/opencode/packages/opencode/src/config/config.ts`.

Target shape:

```txt
readProjectConfig(directory)
  -> buildOpenCodeConfigOverlay({ config, directory })
  -> canonicalDirectoryKey(directory)
  -> store { overlay, fingerprint } by canonical directory key
  -> InstanceStore.load({ directory })
  -> Config.loadInstanceState(ctx) asks overlay provider for ctx.directory
  -> loadConfig(JSON.stringify(overlay), { dir: ctx.directory, source: buddy runtime source })
  -> merge parsed overlay once at the current env-content precedence point
  -> all dependent InstanceState services use the resolved config
```

The best integration point is vendored OpenCode config loading, at the same precedence location where `OPENCODE_CONFIG_CONTENT` currently merges. This is important because provider, MCP, command, skill, agent, plugin, and tool registry services all read from the resolved config cache. A wrapper-only change in Buddy request middleware or adapter `Instance.provide()` is insufficient.

The overlay provider must preserve three details:

- Canonical directory keying: overlay storage, config sync fingerprints, in-flight sync locks, and instance cache invalidation should agree on one directory normalization function.
- Existing config normalization: the overlay should flow through OpenCode's `loadConfig` path, not be directly object-merged, so schema validation, plugin scoping, command/agent normalization, variable substitution behavior, and merge semantics stay intact.
- Exact precedence: the overlay should merge where env content merges today, unless there is an explicit product decision to change precedence.

The provider approach is less invasive for vendor HTTP middleware, because `store.load({ directory })` can continue to work while `Config.loadInstanceState` resolves the overlay by directory.

## Required Invariants

The migration is acceptable only if these remain true:

- No Buddy path writes `config.json`, `opencode.json`, or `opencode.jsonc` into user project roots as a side effect.
- `Config.get()` returns the already-resolved vendor config, with the Buddy overlay applied exactly once.
- `Agent.defaultAgent()` respects `default_persona`.
- `Agent.get()` returns Buddy personas and Buddy subagents with expected permission maps.
- `ToolRegistry.tools()` exposes Buddy plugin tools but filters them by agent/session permissions.
- Direct subagent sessions still receive their specialized tools.
- Delegated subagents still inherit parent/persona tool visibility plus their own extras.
- Dynamic tools remain denied until session-scoped load.
- Project `tools` toggles still disable static and dynamic tools.
- Skill paths still include Buddy-managed and bundled skills.
- Vendor external skill roots remain disabled unless Buddy config enables them.
- Provider/model/MCP reads see the same per-directory compiled config as agent/tool reads.
- Config changes dispose or reload stale per-directory instances.
- Directory aliases, symlinks, and alternate path spellings do not create missing overlays or stale sync state.
- The generated Buddy overlay is not written to OpenCode project config files.

## Migration Risks

Risk: Only adapter `Instance.provide()` is updated.

Consequence: Vendor HTTP middleware and other direct `InstanceStore.load({ directory })` paths may miss the overlay.

Mitigation: Put overlay lookup below all load paths, either in `InstanceStore.load()` or `Config.loadInstanceState(ctx)`.

Risk: Only Buddy request middleware is updated.

Consequence: Direct vendor services such as provider, MCP, command, skill, plugin, agent, and tool registry may still read config independently and miss the overlay.

Mitigation: Consume the overlay in vendored config bootstrap, not at request edges.

Risk: Overlay is merged in `Config.get()` instead of bootstrap.

Consequence: Agent, skill, provider, and tool registries may have booted from one config while callers read another.

Mitigation: Merge once during config state initialization.

Risk: Overlay is merged as a raw object.

Consequence: The migration may bypass OpenCode's config parser, schema handling, plugin-origin scoping, command/agent normalization, and other source-aware behavior.

Mitigation: Feed the overlay through the same `loadConfig` path used by `OPENCODE_CONFIG_CONTENT`.

Risk: Overlay precedence changes.

Consequence: Providers, MCP, permissions, plugins, commands, and agents may resolve differently from today.

Mitigation: Merge at the current env-content precedence point first. Treat any precedence change as a separate product decision.

Risk: Directory keys are inconsistent.

Consequence: Symlinks or alternate path spellings can produce missing overlays, stale cached instances, duplicate sync tasks, or incorrect invalidation.

Mitigation: Introduce one canonical directory key helper and use it in overlay storage, sync state, and tests.

Risk: Existing instance remains cached after overlay changes.

Consequence: Config changes do not affect running project state.

Mitigation: Keep `syncOpenCodeProjectConfig()` fingerprinting and disposal. Add a stale-overlay check if overlay provider can change independently.

Risk: Subagent forwarding is treated as static config.

Consequence: Child sessions lose inherited parent tool state, user tool overrides, and persona-specific `denyTools`.

Mitigation: Keep `subagent-tool-forwarding.ts` as Buddy session-time policy.

Risk: Dynamic tools are treated as normal always-visible tools.

Consequence: Search/load gating is bypassed.

Mitigation: Preserve default dynamic deny rules and session-scoped grant flow.

Risk: Skill discovery falls back to vendor defaults.

Consequence: Hidden or external vendor skills may appear unexpectedly.

Mitigation: Preserve Buddy skill path compilation and `skill-live` visibility filter.

Risk: The migration accidentally uses OpenCode's write path.

Consequence: OpenCode can write `config.json` into the project directory, reintroducing durable config pollution and confusing saved model/provider behavior.

Mitigation: Keep generated overlays bootstrap-only. Do not route them through OpenCode `Config.update()` or `PATCH /config`.

## Regression Strategy

Keep and extend focused tests rather than relying only on end-to-end prompt tests.

Minimum regression set:

- Overlay isolation between two projects.
- Concurrent project bootstrap with different overlays.
- No project config pollution.
- Agent default/persona override behavior.
- Subagent-owned tools visible in direct subagent sessions.
- Delegated subagents inherit parent visibility plus specialized tools.
- Dynamic tools denied by default, allowed after load, denied after release.
- Project tool toggles disable static and dynamic tools.
- Skill path and external vendor skill visibility behavior.
- Provider/default model reads after per-project overlay changes.
- MCP config reads after per-project overlay changes.
- Command and skill visibility after per-project overlay changes.
- Canonical path and symlink access for the same project.
- No generated `config.json`, `opencode.json`, or `opencode.jsonc` after sync, provider, MCP, command, and prompt flows.

## Decision

Proceed toward an explicit per-directory runtime overlay architecture.

Keep:

- Buddy-owned `buddy.json` and global config.
- `buildOpenCodeConfigOverlay()`.
- Per-directory OpenCode instance caching.
- Config fingerprint and disposal on change.
- Buddy session-time subagent forwarding.
- Dynamic tool search/load grants.
- Buddy-managed skill path compilation and filtering.

Replace:

- Process-wide env mutation as the normal per-project overlay transport.
- Wrapper-dependent correctness around `withConfigOverlay()`.

Do not replace:

- Buddy config with OpenCode project config files.
- Buddy session policies with static OpenCode config only.

## Concrete Implementation Plan

### Phase 1: Add The Runtime Overlay Provider

Files:

- `packages/opencode-adapter/src/config.ts`
- Possibly a new adapter module if keeping provider storage separate, for example `packages/opencode-adapter/src/config-overlay.ts`

Steps:

1. Add one exported canonical directory key function.
2. Store overlays as `{ overlay, fingerprint? }` keyed by that function.
3. Keep `setConfigOverlay(directory, overlay)` and `clearConfigOverlay(directory)` as compatibility APIs.
4. Add a read API for vendored config bootstrap, for example `getConfigOverlayForDirectory(directory)`.
5. Keep `withConfigOverlay()` temporarily, but make it a compatibility shim rather than the correctness boundary once bootstrap reads the provider.

### Phase 2: Consume Provider In Vendor Config Bootstrap

Files:

- `vendor/opencode/packages/opencode/src/config/config.ts`

Steps:

1. Import or bridge to the overlay provider in a way that does not create a circular runtime problem.
2. Inside `Config.loadInstanceState(ctx)`, at the same point where `OPENCODE_CONFIG_CONTENT` is currently handled, read the overlay for `ctx.directory`.
3. Convert the overlay to JSON and pass it through `loadConfig(...)`.
4. Merge the parsed result with source metadata equivalent to the current inline config source.
5. Leave `OPENCODE_CONFIG_CONTENT` support in place as fallback/CLI/test compatibility.
6. Do not call `Config.update()` or any write path.

### Phase 3: Canonicalize Sync And Invalidation

Files:

- `packages/buddy/src/config/runtime/opencode-sync.ts`
- `packages/opencode-adapter/src/config.ts`

Steps:

1. Use the same canonical directory key for overlay storage, `configFingerprintByDirectory`, and `configSyncTaskByDirectory`.
2. Keep `buildAndApplyProjectOverlay(directory)` runtime-only.
3. Keep the installed system skills fingerprint in the sync fingerprint.
4. Keep disposal/reload on changed fingerprint.
5. Add a targeted stale-overlay guard only if overlays can change without going through `syncOpenCodeProjectConfig()`.

### Phase 4: Prove Direct Consumers See The Overlay

Files/tests:

- `packages/buddy/test/config/opencode-overlay-isolation.test.ts`
- `packages/buddy/test/opencode-runtime/fetch-with-overlay.test.ts`
- `packages/buddy/test/config/pollution-regression.test.ts`
- Add or extend provider/model route tests.
- Add or extend MCP route tests.
- Add or extend command/skill visibility tests.

Assertions:

1. Two projects with different overlays resolve different default agents and permissions.
2. Concurrent project bootstrap does not leak overlays.
3. The same project accessed through symlink/alternate path spelling uses the same overlay.
4. Provider/default model reads see the per-project overlay.
5. MCP config reads see the per-project overlay.
6. Commands and skill paths from the overlay are visible.
7. No generated `config.json`, `opencode.json`, or `opencode.jsonc` appears after sync, provider, MCP, command, or prompt flows.

### Phase 5: Preserve Runtime Policies

Files/tests:

- `packages/buddy/test/learning/subagent-tool-forwarding.test.ts`
- `packages/buddy/test/learning/runtime-tool-registration.test.ts`
- `packages/buddy/test/learning/dynamic-tool-permission-toggle.test.ts`
- `packages/buddy/test/learning/dynamic-tool-end-to-end.test.ts`
- `packages/buddy/test/skills/tool-visibility.test.ts`

Assertions:

1. Direct subagent sessions still expose their owned tools.
2. Delegated subagents inherit parent/persona-visible tools plus specialized extras.
3. Persona `denyTools` policy still applies.
4. Project `tools` toggles still disable static and dynamic tools.
5. Dynamic tools remain denied until session-scoped load.
6. Dynamic tool release restores deny rules.
7. Buddy-managed and bundled skills remain visible; suppressed/vendor external skills remain hidden unless enabled.

### Phase 6: Remove Wrapper Dependence

Files:

- `packages/buddy/src/opencode-runtime/fetch-with-overlay.ts`
- `packages/opencode-adapter/src/agent.ts`
- `packages/opencode-adapter/src/skill.ts`
- `packages/opencode-adapter/src/registry.ts`
- `packages/opencode-adapter/src/config.ts`

Steps:

1. After bootstrap-level tests pass, simplify `fetchOpenCodeApp()` so it no longer needs env mutation.
2. Remove or no-op `withConfigOverlay()` around `Agent`, `Skill`, and `ToolRegistry` reads.
3. Keep compatibility only where needed for external env-based OpenCode behavior.
4. Delete or rewrite tests that assert env mutation serialization, replacing them with provider-level concurrency tests.

### Phase 7: Verification Commands

Run package-scoped validation for changed packages:

```sh
bun test packages/buddy/test/config/opencode-overlay-isolation.test.ts
bun test packages/buddy/test/config/pollution-regression.test.ts
bun test packages/buddy/test/opencode-runtime/fetch-with-overlay.test.ts
bun test packages/buddy/test/learning/subagent-tool-forwarding.test.ts
bun test packages/buddy/test/learning/runtime-tool-registration.test.ts
bun test packages/buddy/test/learning/dynamic-tool-permission-toggle.test.ts
bun test packages/buddy/test/learning/dynamic-tool-end-to-end.test.ts
bun test packages/buddy/test/skills/tool-visibility.test.ts
bun lint
bun typecheck
```

Per repo instructions, do not run vendor tests or the full suite unless the scope changes.
