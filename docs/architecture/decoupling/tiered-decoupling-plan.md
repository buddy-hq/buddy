# Tiered Decoupling Plan & Adapter Map

> **Status:** Dated decoupling snapshot (May–June 2026), **not** a live sprint board.
> **Later shipped (do not undo):** HTTP proxy gone ([about.md](./about.md)); Stage 4 tool UI reattached on Buddy HTTP/SSE instead of `Session.updatePart` / `LLM.stream` patches ([upstream-fetch-reduction-plan.md](./upstream-fetch-reduction-plan.md)).
> **Still current:** `auth.remove` MCP URL bug warning; “Cannot replace without upstream” matrix; [UPSTREAM-HOOKS.md](../../../packages/buddy/src/opencode-runtime/UPSTREAM-HOOKS.md) for blocked gaps.
> **Pre-requisite / Context:** `about.md`, `UPSTREAM-HOOKS.md`

This document explains why `@buddy/opencode-adapter` remains necessary until upstream OpenCode adds equivalent extension points. Re-verify any **NEXT** cell against code before treating it as open work.

---

## Why `@buddy/opencode-adapter` Still Exists

The adapter is an **in-process Effect bridge** plus **monkey-patches**, not a duplicate of the plugin.

| Pattern | Adapter modules | Plugin/SDK replacement? |
|---|---|---|
| `Instance.provide` + `withCurrentInstance` | `instance`, `effect-runtime` | **No** — SDK is HTTP; tools/plugins still need instance for Effect |
| Session CRUD / messages / permissions | `session` | **SDK_PARTIAL** for reads/writes; **replace** permissions = adapter only |
| Subagent interceptors | `session-prompt` | **No** — no pre-prompt / spawn hook |
| Task tool wrap | `registry.registerToolDefTransformer` | **No** — needs `promptOps` wrap, not `tool.execute.before` alone |
| Skill filter | `skill-live` | **No** |
| Session cache | `session-live` | **No** |
| Tool UI presentation | `session-tool-ui` (historical name) | **Landed (Stage 4)** — strip via plugin `experimental.chat.messages.transform`; presentation reattached on Buddy HTTP/SSE (`opencode-event-stream.ts`). Do not restore `Session.updatePart` / `LLM.stream` tool-UI patches. |
| Config overlay JSON | `config` | **Partial** — overlay per request, not plugin `config` hook |
| Buddy tool types / `Tool.define` | `tool` | Production execute = plugin `run()`; `toTool()` only if tests need Effect path |
| Types / utilities | `message`, `id`, `permission`, `wildcard` | Types can align with SDK gen over time |

**Buddy plugin today** (`packages/buddy/src/opencode-runtime/plugins/buddy-runtime-plugin.ts`):
- `tool` — all learning tools via `allBuddyPluginTools()`
- `experimental.chat.system.transform` — system prompt guard
- `experimental.chat.messages.transform` — strip tool UI before model

---

## Full Tiered Plan

Status key: **DONE** | **NEXT** | **LATER** | **BLOCKED**

### Tier 1 — Plugin swaps (low risk; vendor `plugin.trigger` proof)

| # | Task | Status | Files / notes |
|---|---|---|---|
| **1** | Strip `buddy.toolUi` before LLM via `experimental.chat.messages.transform` | **DONE** | Plugin strip shipped. Follow-on Stage 4 removed the remaining `LLM.stream` / `Session.updatePart` tool-UI patches (see reduction plan). |
| **2** | Single system-prompt path in plugin only | **NEXT in snapshot — re-verify** | Confirm no duplicate guard URLs in overlay; only `resolveBuddyRuntimePluginUrl()` |
| **3** | Optional `tool.execute.before` / `after` | **LATER** | New capability; no production duplicate today |

### Tier 2 — SDK cleanup (typed HTTP; no behavior change)

| # | Task | Status | Files / notes |
|---|---|---|---|
| **4** | v2 SDK (or documented fetch) for `/permission`, `/question`, `/skill`, `global.health` | **NEXT in snapshot — re-verify** | `client-adapter.ts`, `routes/permission.ts`, `question.ts`, `discovery.ts`, `compatibility.ts` |
| **5** | Use v1 `raw.auth.set` for provider auth PUT | **NEXT in snapshot — re-verify** | `routes/auth.ts` — do **not** use v1 `auth.remove` for provider DELETE (MCP URL bug) |
| **6** | Session permission writes | **BLOCKED** on SDK | Keep `Session.setPermission` in adapter until replace API exists |

### Tier 3 — Hono → plugin (partial; test heavily)

| # | Task | Status | Files / notes |
|---|---|---|---|
| **7** | `command.execute.before` for slash command parts only | **LATER** | Keep `command-transform.ts` teaching state + permission sync in Hono |
| **8** | `chat.message` for append-only prelude / learner parts | **LATER** | Do **not** move persona targeting or permission sync — hook too late |

### Tier 4 — Optional / cosmetic

| # | Task | Status | Files / notes |
|---|---|---|---|
| **9** | `tool.definition` for denied dynamic tools | **LATER** | Model hint only; enforcement stays session permissions |
| **10** | Compaction hooks | **LATER** | `experimental.session.compacting` / `autocontinue` |

---

## Cannot Replace Without Upstream (Do Not Pretend)

Documented in [UPSTREAM-HOOKS.md](../../../packages/buddy/src/opencode-runtime/UPSTREAM-HOOKS.md).

| Capability | Current workaround | Why plugin/SDK fails |
|---|---|---|
| Child session tool overrides + permissions + teaching seed | `subagent-forwarding.ts` (`SessionPrompt` + task `ToolRegistry` transformer) | No spawn hook; `tool.execute.before` cannot wrap `promptOps.prompt()` |
| Hide built-in skills | `skill-filtering.ts` + `skill-live` patch | No `skill.visibility` hook |
| Pre-prompt agent/model/tools targeting | `message-prompt-pipeline.ts` (Hono) + SDK prompt | No `chat.prompt.transform`; `chat.message` too late |
| Replace session permission ruleset | `Session.setPermission` | HTTP PATCH merges; `permission.ask` hook unused |
| Per-directory config overlay | `setConfigOverlay` / `OPENCODE_CONFIG_CONTENT` | Plugin `config` is init-time |
| Ad-hoc structured LLM (memory extract) | `LLM` adapter | No plugin surface |
| LSP touch / diagnostics | `lsp` adapter | SDK lacks touch/diagnostics |

---

## Recommended PR / Work Order (snapshot)

1. **DONE (this snapshot + later):** Tier 1 #1 plugin strip; Stage 4 HTTP/SSE tool UI; proxy deletion.
2. **Was NEXT in this snapshot (re-verify before acting):** Tier 1 #2 + Tier 2 #4 + #5. Not an automatic current backlog.
3. **Validate:** upstream-fetch dry-run + `docs/ops/logs/upstream-fetch.<date>.md` when bumping vendor.
4. **LATER:** Tier 3 #7–8 only if product wants more logic in plugin
5. **BLOCKED items:** track upstream; do not expand adapter patches

---

## File Map (Implementation)

| Concern | Primary files |
|---|---|
| Plugin entry | `packages/buddy/src/opencode-runtime/plugins/buddy-runtime-plugin.ts` |
| Tool shim | `packages/buddy/src/opencode-runtime/buddy-tool-shim.ts` |
| Tool authoring | `packages/buddy/src/learning/runtime/create-buddy-tool.ts` |
| Permissions | `packages/buddy/src/learning/access/build-runtime-permissions.ts`, `learning/agent-execution/permissions/*` |
| SDK client | `packages/buddy/src/opencode-runtime/client.ts`, `client-adapter.ts`, `fetch-with-overlay.ts` |
| Adapter registry (task transformer only) | `packages/opencode-adapter/src/registry.ts` |
| Adapter patches | `session-tool-ui.ts`, `session-live.ts`, `skill-live.ts`, `session-prompt.ts` |
| Upstream gaps | `packages/buddy/src/opencode-runtime/UPSTREAM-HOOKS.md` |
