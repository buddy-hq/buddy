# Phase 3 Tool Semantics — Shipped (Smoke-Tested)

**Status:** Implemented on `decoupling` branch, smoke-tested 2026-05-23.  
**Supersedes (for runtime behavior):** the “branch still filters plugin export like main” description in [tool-permissions-and-migration-faq.md](./tool-permissions-and-migration-faq.md) §2–3.

**Related:** [phase-3-implementation.md](./phase-3-implementation.md), [migration-plan.md](./migration-plan.md), [tool-permissions-and-migration-faq.md](./tool-permissions-and-migration-faq.md)

---

## What we shipped

Plan semantics (**Option A**): all Buddy learning tools are **pre-registered** via the runtime plugin; **session permissions** (and per-message `tools` overrides) control what the model can use. Register/unregister is no longer used to hide tools.

| Layer | Behavior now |
|-------|----------------|
| **Plugin load** (per project instance) | Exports **every** tool from `allBuddyTools()` plus `learning_tool_search` / `learning_tool_load` |
| **Config-off tools** | Stay in registry; **deny** via `buildBuddyRuntimeSessionPermissions` on each prompt |
| **Standards/calculator not ready** | Tools still exported; **deny** via runtime constraints in permission build (not omitted at plugin load) |
| **Dynamic pedagogy tools** | Always registered; default **deny**; `learning_tool_load` adds session **allow** only |
| **Proxy `registerOpenCodeTools`** | No-op |
| **`registerBuddyTools` / `unregisterBuddyTools`** | No-op |
| **`registerRuntimeTools`** | UI metadata only (`registerBuddyToolUi` / `unregisterBuddyToolUi`) |
| **Feature `ensure*ToolsRegistered`** | No-op (10 feature `tools/register.ts` helpers) |
| **Subagent / task forwarding** | Unchanged — still Buddy adapter patches + `withSubagentToolForwarding` |
| **Prompt transport** | SDK + in-process fetch (decoupling milestone; not part of this doc’s code delta) |

---

## What changed vs `main`

| Topic | `main` | After this work |
|-------|--------|-----------------|
| Tool in registry when config-off | **Removed** (`unregister` on proxy path) | **Present**, session `deny` |
| Standards tools when DB not ready at load | **Not registered** | **Registered**, session `deny` until runtime ready |
| Dynamic tool grant | Register + permission allow | Permission allow only |
| Per-request registry sync | `fetchOpenCode` → `registerRuntimeTools` | No-op; plugin already exported tools |
| Model visibility for `deny` | Hidden (not in registry) | Hidden (`Permission.disabled` in `llm.resolveTools`) |

**User-visible (smoke-tested):** standards toggle mid-chat, normal chat, dynamic load, subagent delegation — all OK.

**Still like main:** saving project config runs `syncOpenCodeProjectConfig` → disposes OpenCode instance → plugin reloads (good for overlay/fingerprint changes).

---

## What changed vs earlier `decoupling` (before Plan A pass)

| File / area | Before | After |
|-------------|--------|-------|
| `buddy-tool-shim.ts` `allBuddyPluginTools()` | `resolveEnabledBuddyTools(resolveFeatureRegistrationFlags())` — filtered export | `allBuddyTools()` + `dynamicToolSearchTools`, dedupe by id |
| `register-buddy-tools.ts` | Real `ToolRegistry.register` / `unregister` | No-op bodies |
| `http/proxy/registration.ts` | Called `registerRuntimeTools` | No-op `registerOpenCodeTools` |
| `register-tools.ts` | UI sync only (already) | Comment clarifies plugin-only registry |
| Feature `*/tools/register.ts` | Called `registerBuddyTools` | No-op `ensure*ToolsRegistered` |
| `runtime-tool-registration.test.ts` | Expected tools absent when config-off | Expects in registry + `deny` in permissions |

---

## How it works (one turn)

```
1. Project OpenCode instance boots (or reloads after config sync)
   → buddy-runtime-plugin loads allBuddyPluginTools()
   → ToolRegistry contains all Buddy tool ids

2. User sends message (Buddy Hono)
   → readProjectConfig()
   → message/command transform pipeline
   → syncBuddyRuntimeSessionPermissions(sessionRuntime)
        → buildBuddyRuntimeSessionPermissions (allow/deny per tool, subagent, skill)
        → Session.setPermission when changed
   → SDK prompt to OpenCode

3. OpenCode agent step
   → Build tools from registry
   → llm.resolveTools: drop tools with deny+* or user.tools[id]===false
   → Provider receives only allowed tool schemas

4. Dynamic load (optional)
   → learning_tool_load updates session allow rules only (no register)
```

---

## Key code locations

| Responsibility | Path |
|----------------|------|
| Full plugin export | `packages/buddy/src/opencode-runtime/buddy-tool-shim.ts` — `allBuddyPluginTools` |
| Plugin entry | `packages/buddy/src/opencode-runtime/plugins/buddy-runtime-plugin.ts` |
| Permission rules from persona/workspace/config | `packages/buddy/src/learning/access/build-runtime-permissions.ts` |
| Merge + sync to session | `packages/buddy/src/learning/agent-execution/permissions/session-permissions.ts`, `runtime-session-permissions.ts` |
| Dynamic grant/release | `packages/buddy/src/learning/runtime/dynamic-tool-grants.ts` |
| UI-only legacy sync | `packages/buddy/src/learning/runtime/register-tools.ts` |
| Export-time filter (still used for UI list only) | `packages/buddy/src/learning/runtime/enabled-buddy-tools.ts` |
| Model filter (vendor) | `vendor/opencode/packages/opencode/src/session/llm.ts` — `resolveTools` |
| Config → instance reload | `packages/buddy/src/config/runtime/opencode-sync.ts` |

---

## Tests run (green before smoke)

From `packages/buddy`:

- `test/learning/runtime-tool-registration.test.ts`
- `test/learning/dynamic-tool-end-to-end.test.ts`
- `test/learning/dynamic-tool-permission-toggle.test.ts`
- `test/learning/subagent-tool-forwarding.test.ts`
- `test/opencode-runtime/buddy-tool-shim.test.ts`
- `test/proxy-registration.test.ts`

Repo: `bun typecheck`, `bun lint`.

---

## Smoke test scenarios (validated)

| Scenario | Expected | Result |
|----------|----------|--------|
| Standards tools off in settings → message | Agent cannot use standards tools | Pass |
| Standards tools on → message | Agent can use standards (if runtime ready) | Pass |
| Normal Buddy chat | No regression | Pass |
| Dynamic tools via skill | search → load → use | Pass |
| Subagent delegation (e.g. flashcards) | Child gets authoring tools | Pass |
| Toggle tool setting mid-session → message | Permissions apply next message | Pass |

---

## What is **not** done yet (migration backlog)

These are still called out in [migration-plan.md](./migration-plan.md); not required for Plan A tool semantics.

- Delete proxy layer entirely (`proxyToOpenCode`, `prepareProxyBody`, …) — Phase 7
- Remove dead proxy registration flag helpers if nothing reads them
- Consolidate remaining adapter patches (skill filtering, upstream hooks doc)
- Optional: auto-dispose instance when standards DB becomes ready without settings save
- Broader buddy test suite: some tests still call `registerBuddyTools` directly and may need plugin bootstrap if run in isolation

---

## Operational notes for developers

1. **“Tool not in registry”** — Check plugin load / `syncOpenCodeProjectConfig`, not session permissions alone.
2. **“Tool denied”** — Check session permission rules and `buddy.jsonc` `tools` toggles; tool may still appear in `ToolRegistry.ids()`.
3. **Mid-chat settings change** — Permissions update on next prompt; registry reload happens when config sync disposes the instance (normal save path).
4. **Do not re-enable `registerBuddyTools` for visibility** — use `syncBuddyRuntimeSessionPermissions` or dynamic grants.

---

## FAQ doc alignment

[tool-permissions-and-migration-faq.md](./tool-permissions-and-migration-faq.md) remains the conceptual reference (main vs plan, registry timing, registration vs permissions). **This file** is the as-built record after implementation and smoke test.
