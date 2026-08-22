# Tiered Decoupling Plan (Plugin + SDK First)

Research date: 2026-05-23  
Branch: `decoupling`  
Audience: engineers continuing OpenCode decoupling without re-reading full chat history.

## Objective

Use **official OpenCode surfaces** wherever they exist:

- **`@opencode-ai/plugin`** — tools, hooks triggered inside the agent loop
- **`@opencode-ai/sdk` (v1/v2)** — typed HTTP to the in-process OpenCode server
- **Config overlay** — agents, models, plugin URL, permission deny templates, skill paths

Keep **`@buddy/opencode-adapter`** only for capabilities with **no** equivalent plugin hook or SDK contract (in-process Effect services, monkey-patches, interceptors).

This is **not** “use less OpenCode.” It is **stop calling vendored internals from product code** except through a small, documented adapter boundary.

**North-star validation:** repeatable [upstream-fetch algorithm](../../guides/upstream-fetch.algo.md) on the branch after each tier.

---

## What “decoupling” means here

| In scope | Out of scope |
|----------|----------------|
| Plugin `tool` + triggered hooks | Rewriting Buddy without OpenCode |
| SDK for route transport | OpenCode v2 prompt / v2 message format |
| Session **permission rules** for tool visibility | `permission.ask` plugin hook (dead in vendor) |
| Consolidate adapter behind `opencode-runtime/` | Zero adapter patches without upstream hooks |

---

## Current branch state (as of 2026-05-23)

### Done

| Area | Evidence on branch |
|------|-------------------|
| HTTP proxy removed | Routes/session use `getOpenCodeClient()` — `packages/buddy/src/opencode-runtime/client.ts` |
| Buddy tools via plugin | `packages/buddy/src/opencode-runtime/plugins/buddy-runtime-plugin.ts` + `buddy-tool-shim.ts` (`tool.run()`, no `ToolRegistry.register` in production) |
| System prompt guard in plugin | `experimental.chat.system.transform` in `buddy-runtime-plugin.ts` |
| Tool visibility = permissions | `build-runtime-permissions.ts`, `runtime-session-permissions.ts`; tests in `runtime-tool-registration.test.ts` |
| Plugin execution path | `buddy-tool-shim.ts` calls `tool.run()` directly (no `initDeferredTool`) |
| Dead registration API removed | `ToolRegistry.register` / `unregister` removed from `packages/opencode-adapter/src/registry.ts`; tests use plugin path |
| **Tier 1 #1 — strip tool UI via plugin hook** | `experimental.chat.messages.transform` in plugin; shared `packages/opencode-adapter/src/tool-ui-strip.ts`; `Plugin.trigger` patch removed from `session-tool-ui.ts` |

### Still on adapter (expected)

| Module | File(s) | Why |
|--------|---------|-----|
| Subagent / task forwarding | `packages/buddy/src/opencode-runtime/subagent-forwarding.ts` | No `session.subagent.spawn` hook — see [UPSTREAM-HOOKS.md](../../../packages/buddy/src/opencode-runtime/UPSTREAM-HOOKS.md) |
| Skill visibility | `packages/buddy/src/opencode-runtime/skill-filtering.ts` | No `skill.visibility` hook |
| Session canonicalization | `packages/opencode-adapter/src/session-live.ts` | In-process cache; no hook |
| Tool UI inject on save | `packages/opencode-adapter/src/session-tool-ui.ts` (`Session.updatePart`) | No hook on `updatePart` |
| LLM stream strip (safety net) | `session-tool-ui.ts` (`LLM.stream`) | Title path skips `chat.messages.transform` — vendor `session/prompt.ts` title generation |
| Config overlay | `packages/opencode-adapter/src/config.ts`, `fetch-with-overlay.ts` | Plugin `config` hook is init-time only |
| Session permission **replace** | `Session.setPermission` via adapter | HTTP `PATCH /session/{id}` **merges** permission arrays, does not replace |
| Memory LLM | `packages/buddy/src/learning/features/memory/extractor.ts` | Direct in-process `LLM` stream |
| Boot patches | `packages/buddy/src/opencode-runtime/runtime.ts` | `session-live`, `session-tool-ui`, subagent, skill |

---

## Vendor ground truth: plugin hooks

Source: `vendor/opencode/packages/plugin/src/index.ts` (`Hooks` interface) cross-checked with `rg 'plugin\.trigger'` under `vendor/opencode/packages/opencode`.

### Triggered via `plugin.trigger`

| Hook | Triggered at (vendor) | Buddy use |
|------|------------------------|-----------|
| `tool.definition` | `opencode/src/tool/registry.ts` (~336) | Optional: model-facing description only — **not** enforcement |
| `tool.execute.before` / `after` | `session/prompt.ts` (582, 597, 623, 641, 754, 833) | Optional: shared learning interceptors |
| `chat.message` | `session/prompt.ts` (~1472) | **Partial only** — runs after agent/model resolution |
| `experimental.chat.messages.transform` | `session/prompt.ts` (~1810), `compaction.ts` (~405) | **Done:** strip `buddy.toolUi` — `buddy-runtime-plugin.ts` |
| `command.execute.before` | `session/prompt.ts` (~1984) | Optional: slash command `parts` only |
| `experimental.chat.system.transform` | `session/llm.ts`, `agent/agent.ts` | **Done:** AGENTS.md filter + capture |
| `chat.params` / `chat.headers` | `session/llm.ts` | Optional |
| `experimental.session.compacting` / `autocontinue` | `session/compaction.ts` | Optional |
| `experimental.text.complete` | `session/processor.ts` | Optional |
| `shell.env` | `tool/shell.ts`, `session/prompt.ts`, `pty/index.ts` | Optional |

### Invoked without `plugin.trigger`

| Hook | Mechanism | Notes |
|------|-----------|-------|
| `tool` (map) | `tool/registry.ts` loads `hook.tool` → `fromPlugin()` | **Done** for all Buddy learning tools |
| `config` | Direct call after plugin load | Init-time; not per-directory overlay |
| `event` | Bus subscription | Async observer |
| `auth` / `provider` | Provider listing / OAuth | Only if Buddy adds custom providers |

### Defined but never triggered

| Hook | Evidence |
|------|----------|
| **`permission.ask`** | Declared in `plugin/src/index.ts`; zero `plugin.trigger("permission.ask")` in vendor. Permissions = `Permission` service + HTTP `permission.asked` / reply. |

---

## Vendor ground truth: SDK v1 gaps

Source: `vendor/opencode/packages/sdk/js/src/gen/sdk.gen.ts` vs Buddy `client-adapter.ts` / `fetchInProcessOpenCode` call sites.

| HTTP route Buddy needs | v1 typed SDK | Notes |
|------------------------|--------------|-------|
| `session.*`, `provider.*`, `mcp.*`, `find.*`, `file.*`, `command.list` | Yes | Already used via `getOpenCodeClient()` |
| `global.event` (SSE) | `global.event()` | Returns `{ stream }`, not raw `Response` — proxy route may keep custom bridge |
| `GET/POST /permission/*` | **No** | v2 gen has `permission.list` / `reply` |
| `GET/POST /question/*` | **No** | v2 gen has `question.*` |
| `GET /skill` | **No** | v2 gen has `app.skills` |
| `GET /global/health`, `POST /global/dispose` | **No** | v2 gen has `global.health` / `dispose` |
| `PUT /auth/{id}` | `auth.set` exists | Adapter sometimes uses raw `fetchSdkRoute` — use `raw.auth.set` |
| `DELETE /auth/{id}` (provider) | **Wrong on v1:** `auth.remove` → MCP path | Keep raw fetch or v2 `auth.remove` |

**Session permissions:** `session.update` body includes `permission` in server schema, but v1 **OpenAPI gen omits it**; HTTP handler **merges** rules (`Permission.merge` = concat). Buddy needs **replace** semantics → keep adapter `Session.setPermission`.

---

## Why `@buddy/opencode-adapter` still exists

The adapter is an **in-process Effect bridge** plus **monkey-patches**, not a duplicate of the plugin.

| Pattern | Adapter modules | Plugin/SDK replacement? |
|---------|-----------------|-------------------------|
| `Instance.provide` + `withCurrentInstance` | `instance`, `effect-runtime` | **No** — SDK is HTTP; tools/plugins still need instance for Effect |
| Session CRUD / messages / permissions | `session` | **SDK_PARTIAL** for reads/writes; **replace** permissions = adapter only |
| Subagent interceptors | `session-prompt` | **No** — no pre-prompt / spawn hook |
| Task tool wrap | `registry.registerToolDefTransformer` | **No** — needs `promptOps` wrap, not `tool.execute.before` alone |
| Skill filter | `skill-live` | **No** |
| Session cache | `session-live` | **No** |
| Tool UI inject + LLM strip fallback | `session-tool-ui` | **Partial** — strip moved to plugin; inject + LLM patch remain |
| Config overlay JSON | `config` | **Partial** — overlay per request, not plugin `config` hook |
| Buddy tool types / `Tool.define` | `tool` | Production execute = plugin `run()`; `toTool()` only if tests need Effect path |
| Types / utilities | `message`, `id`, `permission`, `wildcard` | Types can align with SDK gen over time |

**Buddy plugin today** (`packages/buddy/src/opencode-runtime/plugins/buddy-runtime-plugin.ts`):

- `tool` — all learning tools via `allBuddyPluginTools()`
- `experimental.chat.system.transform` — system prompt guard
- `experimental.chat.messages.transform` — strip tool UI before model

---

## Full tiered plan

Status key: **DONE** | **NEXT** | **LATER** | **BLOCKED**

### Tier 1 — Plugin swaps (low risk; vendor `plugin.trigger` proof)

| # | Task | Status | Files / notes |
|---|------|--------|----------------|
| **1** | Strip `buddy.toolUi` before LLM via `experimental.chat.messages.transform` | **DONE** | `tool-ui-strip.ts`, `buddy-runtime-plugin.ts`, tests `tool-ui-strip.test.ts`. Removed `ensurePluginPatched`. Kept `LLM.stream` strip (title path skips transform hook). Kept `Session.updatePart` inject. |
| **2** | Single system-prompt path in plugin only | **NEXT** | Confirm no duplicate guard URLs in overlay; only `resolveBuddyRuntimePluginUrl()` |
| **3** | Optional `tool.execute.before` / `after` | **LATER** | New capability; no production duplicate today |

### Tier 2 — SDK cleanup (typed HTTP; no behavior change)

| # | Task | Status | Files / notes |
|---|------|--------|----------------|
| **4** | v2 SDK (or documented fetch) for `/permission`, `/question`, `/skill`, `global.health` | **NEXT** | `client-adapter.ts`, `routes/permission.ts`, `question.ts`, `discovery.ts`, `compatibility.ts` |
| **5** | Use v1 `raw.auth.set` for provider auth PUT | **NEXT** | `routes/auth.ts` — do **not** use v1 `auth.remove` for provider DELETE (MCP URL bug) |
| **6** | Session permission writes | **BLOCKED** on SDK | Keep `Session.setPermission` in adapter until replace API exists |

### Tier 3 — Hono → plugin (partial; test heavily)

| # | Task | Status | Files / notes |
|---|------|--------|----------------|
| **7** | `command.execute.before` for slash command parts only | **LATER** | Keep `command-transform.ts` teaching state + permission sync in Hono |
| **8** | `chat.message` for append-only prelude / learner parts | **LATER** | Do **not** move persona targeting or permission sync — hook too late |

### Tier 4 — Optional / cosmetic

| # | Task | Status | Files / notes |
|---|------|--------|----------------|
| **9** | `tool.definition` for denied dynamic tools | **LATER** | Model hint only; enforcement stays session permissions |
| **10** | Compaction hooks | **LATER** | `experimental.session.compacting` / `autocontinue` |

---

## Cannot replace without upstream (do not pretend)

Documented in [UPSTREAM-HOOKS.md](../../../packages/buddy/src/opencode-runtime/UPSTREAM-HOOKS.md).

| Capability | Current workaround | Why plugin/SDK fails |
|------------|-------------------|----------------------|
| Child session tool overrides + permissions + teaching seed | `subagent-forwarding.ts` (`SessionPrompt` + task `ToolRegistry` transformer) | No spawn hook; `tool.execute.before` cannot wrap `promptOps.prompt()` |
| Hide built-in skills | `skill-filtering.ts` + `skill-live` patch | No `skill.visibility` hook |
| Pre-prompt agent/model/tools targeting | `message-prompt-pipeline.ts` (Hono) + SDK prompt | No `chat.prompt.transform`; `chat.message` too late |
| Replace session permission ruleset | `Session.setPermission` | HTTP PATCH merges; `permission.ask` hook unused |
| Per-directory config overlay | `setConfigOverlay` / `OPENCODE_CONFIG_CONTENT` | Plugin `config` is init-time |
| Ad-hoc structured LLM (memory extract) | `LLM` adapter | No plugin surface |
| LSP touch / diagnostics | `lsp` adapter | SDK lacks touch/diagnostics |

---

## Recommended PR / work order

One merge-ready pass:

1. **DONE:** Tier 1 #1 (tool UI strip in plugin)
2. **NEXT:** Tier 1 #2 + Tier 2 #4 + #5 (cleanup, no semantic change)
3. **Validate:** upstream-fetch dry-run + `docs/ops/logs/upstream-fetch.<date>.md`
4. **LATER:** Tier 3 #7–8 only if product wants more logic in plugin
5. **BLOCKED items:** track upstream; do not expand adapter patches

Suggested smoke after Tier 1 #1:

- Buddy tool with `toolUi` labels still renders in UI
- Model context does not include `buddy.toolUi` blobs
- Subagent + permission + dynamic tool grant flows unchanged

---

## File map (implementation)

| Concern | Primary files |
|---------|----------------|
| Plugin entry | `packages/buddy/src/opencode-runtime/plugins/buddy-runtime-plugin.ts` |
| Tool shim | `packages/buddy/src/opencode-runtime/buddy-tool-shim.ts` |
| Tool authoring | `packages/buddy/src/learning/runtime/create-buddy-tool.ts` |
| Permissions | `packages/buddy/src/learning/access/build-runtime-permissions.ts`, `learning/agent-execution/permissions/*` |
| SDK client | `packages/buddy/src/opencode-runtime/client.ts`, `client-adapter.ts`, `fetch-with-overlay.ts` |
| Adapter registry (task transformer only) | `packages/opencode-adapter/src/registry.ts` |
| Adapter patches | `session-tool-ui.ts`, `session-live.ts`, `skill-live.ts`, `session-prompt.ts` |
| Upstream gaps | `packages/buddy/src/opencode-runtime/UPSTREAM-HOOKS.md` |
| Tests | `packages/buddy/test/opencode-runtime/*`, `test/learning/runtime-tool-registration.test.ts` |

---

## Verification commands

```bash
bun run --cwd packages/buddy typecheck
bun run --cwd packages/buddy lint
bun test packages/buddy/test/opencode-runtime/tool-ui-strip.test.ts
bun test packages/buddy/test/opencode-runtime/buddy-runtime-plugin.test.ts
bun test packages/buddy/test/learning/runtime-tool-registration.test.ts
bun test packages/buddy/test/session/abort-tools.test.ts
```

Package-specific only; do not run full vendor suite.

---

## Related documents

| Doc | Role |
|-----|------|
| [migration-plan.md](./migration-plan.md) | Original phased migration (0–8); historical |
| [plugin-analysis.md](./plugin-analysis.md) | OpenCode plugin + SDK research write-up |
| [tool-permissions-and-migration-faq.md](./tool-permissions-and-migration-faq.md) | Permissions vs registry FAQ |
| [phase-3-tool-semantics-shipped.md](./phase-3-tool-semantics-shipped.md) | Shipped tool permission semantics |
| [phase-*-implementation.md](./phase-1-implementation.md) | Step-by-step phase notes |
| [../guides/upstream-fetch.algo.md](../../guides/upstream-fetch.algo.md) | Vendor sync ritual |

---

## Audit provenance

This plan consolidates **vendor-only** subagent audits (2026-05-23) and branch implementation reviews:

- Plugin hook inventory (`plugin.trigger` grep vs `Hooks` interface)
- Buddy `@buddy/opencode-adapter` consumer matrix
- SDK v1 vs raw HTTP gap analysis
- Plugin vs registry execution path (post-`tool.run()` refactor)
- Tier 1 #1 implementation (tool UI strip in plugin)

Do not treat phase docs as the source of truth for **remaining** work; use **this file’s tier table + UPSTREAM-HOOKS** for what is left.
