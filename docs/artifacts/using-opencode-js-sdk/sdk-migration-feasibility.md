# OpenCode SDK Migration — Feasibility Assessment

**Date**: 2026-02-26
**Scope**: Verify whether migrating Buddy from vendored OpenCode internals to the OpenCode JS SDK + plugin/tool extensions is feasible.

---

## Verdict: Feasible, with two critical gaps to close first

The migration is **feasible** but **not straightforward**. The SDK + plugin surface covers ~70% of what Buddy needs today. Two structural gaps require workarounds or upstream contributions before a full cutover is possible.

---

## Assumption Verification

### ✅ Assumption 1: SDK is a typed client + server launcher, not embedded runtime

**Verified.** [server.ts](file:///Users/prashantbhudwal/Code/buddy/vendor/opencode/packages/sdk/js/src/server.ts) confirms `createOpencodeServer()` spawns `opencode` as a child process:

```typescript
const proc = spawn(`opencode`, args, {
  env: {
    ...process.env,
    OPENCODE_CONFIG_CONTENT: JSON.stringify(options.config ?? {}),
  },
})
```

[client.ts](file:///Users/prashantbhudwal/Code/buddy/vendor/opencode/packages/sdk/js/src/client.ts) confirms it's a typed HTTP client.

> [!WARNING]
> **Critical difference**: Buddy currently runs OpenCode **in-process** via `Server.App()` (Hono fetch), not as a separate process. The SDK forces a **process boundary**. This is the single largest architectural delta.

### ✅ Assumption 2: Directory-scoped file access works in SDK mode

**Verified.** [client.ts:21-26](file:///Users/prashantbhudwal/Code/buddy/vendor/opencode/packages/sdk/js/src/client.ts#L21-L26) sets `x-opencode-directory` header. [server.ts:195-211](file:///Users/prashantbhudwal/Code/buddy/vendor/opencode/packages/opencode/src/server/server.ts#L195-L211) resolves it via `Instance.provide()`.

### ✅ Assumption 3: Custom tools and plugins are first-class

**Verified.** [registry.ts:36-62](file:///Users/prashantbhudwal/Code/buddy/vendor/opencode/packages/opencode/src/tool/registry.ts#L36-L62) loads custom tools from:

1. Config directories via `{tool,tools}/*.{js,ts}` glob scan
2. Plugins via `Plugin.list()` → `plugin.tool` entries

The [plugin tool contract](file:///Users/prashantbhudwal/Code/buddy/vendor/opencode/packages/plugin/src/tool.ts) provides `ToolContext` with `directory`, `worktree`, `sessionID`, `ask()`, and `metadata()`.

### ✅ Assumption 4: Sub-agents supported via config + prompt selection

**Verified.** `SessionPromptData.body.agent?: string` in [types.gen.ts:2592](file:///Users/prashantbhudwal/Code/buddy/vendor/opencode/packages/sdk/js/src/gen/types.gen.ts#L2592) allows agent selection per prompt. Agent config supports `mode: "subagent" | "primary" | "all"` in [config.ts:699](file:///Users/prashantbhudwal/Code/buddy/vendor/opencode/packages/opencode/src/config/config.ts#L699).

### ✅ Assumption 5: `OPENCODE_CONFIG_DIR` avoids `.opencode` in user repos

**Verified.** [config.ts:155-157](file:///Users/prashantbhudwal/Code/buddy/vendor/opencode/packages/opencode/src/config/config.ts#L155-L157) pushes `Flag.OPENCODE_CONFIG_DIR` into the directories array. All config loaders (`loadAgent`, `loadPlugin`, `loadCommand`, `loadMode`) scan this directory.

---

## Current Buddy Internal Coupling Surface

Here is the complete catalog of what Buddy imports from OpenCode internals, mapped to SDK/plugin equivalents:

| Buddy File                                                                                                                | Internal Import                             | What It Does                             | SDK/Plugin Equivalent                              |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| [runtime.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/opencode/runtime.ts)                             | `Server.App()`                              | Loads OpenCode Hono app **in-process**   | `createOpencodeServer()` (process spawn)           |
| [curriculum-tools.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/opencode/curriculum-tools.ts)           | `ToolRegistry.register()`                   | Registers curriculum tools at runtime    | Plugin `tool` exports or `{tool,tools}/*.ts` files |
| [curriculum-tools.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/opencode/curriculum-tools.ts)           | `Tool.define()`                             | Creates tool definitions                 | `@opencode-ai/plugin` `tool()` function            |
| [curriculum-tools.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/opencode/curriculum-tools.ts)           | `Instance.provide()`                        | Scopes tool registration to a directory  | Plugin gets `directory` in `ToolContext`           |
| [index.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/index.ts#L259-L265)                                | `Instance.provide()` + `Instance.dispose()` | Forces config re-bootstrap per directory | `POST /instance/dispose` via SDK                   |
| [index.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/index.ts#L366-L371)                                | `Agent.list()` via `Instance.provide()`     | Lists available agents                   | `GET /agent` via SDK                               |
| [vendor.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/opencode/vendor.ts)                               | `PermissionNext`, `Tool`, `Truncate`        | Type re-exports                          | `@opencode-ai/plugin` types                        |
| [provider-transform.ts](file:///Users/prashantbhudwal/Code/buddy/packages/opencode-adapter/src/provider-transform.ts)     | `ProviderTransform.message()`               | Message format transformation            | ⚠️ **No SDK/plugin equivalent**                    |
| [curriculum-service.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/curriculum/curriculum-service.ts#L37) | `Instance.provide()`                        | Directory-scoped curriculum reads        | Buddy can handle this without OpenCode context     |

---

## Critical Gaps

### Gap 1: In-Process → Child Process (Severity: HIGH)

**Current**: Buddy calls `Server.App().fetch(request)` — zero-latency, in-process Hono call.
**SDK**: `createOpencodeServer()` spawns a new `opencode` process, requiring HTTP over network.

**Impact**:

- Every API call gains network latency (localhost, but still ms-level overhead per call)
- Process lifecycle management (startup, health check, graceful shutdown, crash recovery)
- Buddy's `fetchOpenCode()` function (used ~15 times in `index.ts`) currently builds `Request` objects and calls `app.fetch()` directly — all of this would need to change

**Mitigation**: The SDK client already handles this. The `fetchOpenCode()` / `proxyToOpenCode()` abstraction in [index.ts](file:///Users/prashantbhudwal/Code/buddy/packages/buddy/src/index.ts) provides a clean seam. Replace the internal `loadOpenCodeApp()` with an SDK client instance.

### Gap 2: ProviderTransform has no SDK/plugin equivalent (Severity: MEDIUM)

[provider-transform.ts](file:///Users/prashantbhudwal/Code/buddy/packages/opencode-adapter/src/provider-transform.ts) imports `ProviderTransform` from `opencode/provider/transform` to call `ProviderTransform.message()` for model-specific message format adjustments (interleaved reasoning, modality filtering). This is not exposed via SDK or plugin hooks.

**Impact**: Without this, Buddy's session provider layer can't transform messages per-model.

**Mitigation**: The plugin `Hooks` interface includes `"chat.message"` and `"experimental.chat.messages.transform"` hooks. These may be sufficient depending on what exactly the transform does. Otherwise, this function could remain as a thin vendored import (keep a narrow internal dependency) or be upstreamed.

### Gap 3: Runtime tool registration is statically loaded in plugin model (Severity: MEDIUM)

**Current**: `ensureCurriculumToolsRegistered()` dynamically registers tools per-directory at request time via `ToolRegistry.register()`.
**Plugin model**: Tools are loaded once at startup from `{tool,tools}/*.ts` in config directories.

**Impact**: If curriculum tools need to vary per-directory (they close over `directory` in their `execute` function), the plugin model needs to handle this differently — tools would receive `directory` via `ToolContext` instead of being created per-directory.

**Mitigation**: **This is actually solvable.** The `ToolContext` already provides `directory` and `worktree`. Refactoring curriculum tools to read directory from context rather than closure is straightforward and arguably cleaner.

---

## What Works Without Gaps

| Capability                                           | Status                                          |
| ---------------------------------------------------- | ----------------------------------------------- |
| Session create / list / get                          | ✅ Direct SDK methods                           |
| Session prompt with agent selection                  | ✅ `body.agent` field                           |
| Session abort                                        | ✅ SDK method                                   |
| System prompt injection                              | ✅ `body.system` field on prompt                |
| Event subscription (SSE)                             | ✅ SDK `global.event()`                         |
| Config get/update                                    | ✅ SDK `config.get()` / `config.update()`       |
| Agent listing                                        | ✅ SDK or `GET /agent`                          |
| File read/list/find                                  | ✅ Built-in tools respect directory context     |
| Permission management                                | ✅ SDK permission routes                        |
| Custom tool loading from config dirs                 | ✅ `{tool,tools}/*.ts` in `OPENCODE_CONFIG_DIR` |
| Plugin hooks (event, chat.message, system transform) | ✅ Rich `Hooks` interface                       |
| Instance dispose (config reload)                     | ✅ `POST /instance/dispose`                     |
| DB separation (buddy.db / opencode.db)               | ✅ Already separated, SDK doesn't change this   |

---

## Feasibility Matrix by Migration Phase

| Phase                                   | Feasible?      | Blockers                                                    |
| --------------------------------------- | -------------- | ----------------------------------------------------------- |
| Phase 0: Baseline + feature flag        | ✅ Yes         | None                                                        |
| Phase 1: Runtime abstraction seam       | ✅ Yes         | Need to define interface covering both paths                |
| Phase 2: SDK process bootstrap          | ✅ Yes         | Need `opencode` binary available; startup/shutdown handling |
| Phase 3: Port tools to plugin contracts | ✅ Yes         | Refactor closure-based tools to use `ToolContext.directory` |
| Phase 4: Agent/sub-agent migration      | ✅ Yes         | Agent config files in `OPENCODE_CONFIG_DIR`                 |
| Phase 5: Shadow traffic / parity        | ✅ Yes         | Need to compare in-process vs SDK responses                 |
| Phase 6: Cutover                        | ⚠️ Conditional | Depends on resolving `ProviderTransform` gap                |
| Phase 7: Cleanup                        | ⚠️ Conditional | Can't fully remove vendored imports until all gaps closed   |

---

## Hard Blockers for Full Migration

1. **`ProviderTransform.message()`** — No SDK/plugin equivalent exists today. Options:
   - Keep as a narrow vendored import (acceptable, low churn surface)
   - Check if `chat.message` plugin hook covers the same transform
   - Upstream a plugin hook for provider message transforms

2. **`opencode` binary availability** — SDK spawns `opencode` as a process. Buddy would need to either:
   - Bundle the `opencode` binary
   - Require it on `PATH`
   - Continue the in-process approach (which defeats the purpose)

---

## Concrete Recommendation

> [!IMPORTANT]
> The migration is feasible as a **hybrid approach**, not as a full SDK cutover.

**What to do now:**

1. **Refactor curriculum tools** to use `ToolContext.directory` instead of closure-captured directory — this is beneficial regardless of migration
2. **Ship new tools/agents via plugin/tool files** in a Buddy-managed config dir — stop adding new `ToolRegistry.register()` calls
3. **Keep `Server.App()` in-process execution** as the primary runtime until the SDK process model proves stable for Buddy's use case
4. **Investigate `chat.message` / `chat.messages.transform` plugin hooks** as `ProviderTransform` replacement

**What NOT to do:**

- Don't switch to SDK process spawn without solving `opencode` binary distribution
- Don't try to eliminate the adapter package entirely — keep it as a thin seam even post-migration
- Don't migrate the system prompt injection (`transformJsonBody`) to a plugin hook yet — the current approach of injecting at Buddy's API layer is cleaner for Buddy's product concerns
