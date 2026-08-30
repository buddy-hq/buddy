# Dynamic Tool Runtime Permissions & Security Invariants

## Status

**Shipped** permission isolation for dynamic learning tools lives in `packages/buddy/src/learning/runtime/` (catalog, grants, per-ID denies) with plugin pre-registration. Session-object liveness after `learning_tool_load` is a separate adapter concern.

Related authorities:
- [OpenCode Decoupling Architecture](../decoupling/about.md) — plugin bootstrap; visibility via permissions, not register/unregister churn
- [Dynamic Tool Session Liveness](../../../packages/opencode-adapter/docs/dynamic-tools.md) — in-memory session cache so the active loop sees new allows
- [Upstream OpenCode Hooks Needed](../../../packages/buddy/src/opencode-runtime/UPSTREAM-HOOKS.md) — subagent spawn gap
- [Phase 3 Tool Semantics — Shipped](../decoupling/phase-3-tool-semantics-shipped.md) — register/unregister no longer hides tools

This ADR owns **permission and isolation invariants**. It does not replace the liveness note or the Phase 3 export table.

---

## 1. Context & Architecture

Buddy does not have Codex `tool_search_output`. Search must not both discover and expose tools.

**Shipped catalog IDs** (from feature tools, not a `learning_dynamic_*` prefix):

- `reflection_dynamic`
- `stepwise_solve_dynamic`
- `debug_attempt_dynamic`

These tools are **pre-registered** on the runtime plugin (`allBuddyTools()` + `learning_tool_search` / `learning_tool_load`). They stay hidden from the model until a session grant.

Shipped flow:

1. **Discovery (`learning_tool_search`):** Scores catalog metadata; returns candidate IDs; does not append allow rules.
2. **Exposure (`learning_tool_load`):** Appends **exact** session-scoped `allow` rules for selected IDs. The adapter liveness patch is what makes the same assistant turn observe the grant.

---

## 2. Critical Runtime Invariants

### 2.1 ToolRegistry presence vs model visibility

OpenCode's `ToolRegistry` is **directory-scoped**, not session-isolated. After plugin load, tool definitions exist for every session in that directory.

Model visibility is a separate filter:

```typescript
Permission.disabled(
  Object.keys(input.tools),
  Permission.merge(input.agent.permission, input.permission ?? [])
)
```

**Invariant:** Registry presence is not model visibility. Default-denied tools are dropped before the provider schema. Direct `tool.execute()` in tests bypasses this filter; visibility proofs must use the outbound LLM tool list.

### 2.2 Subagent deny inheritance gap

Child sessions (`practice-agent`, `assessment-agent`, `curriculum-orchestrator`) **do not inherit** primary-persona permission maps.

**Failure mode:** Denying dynamic tools only on `buddy` / `teaching-buddy` leaves subagents able to see directory-registered dynamic tools.

**Proposed (migration notes, not shipped):** one wildcard deny on a stable namespace, e.g. `learning_dynamic_*`, compiled onto every primary agent and subagent so new dynamic IDs could not drift off the deny list.

**Shipped:** `dynamicLearningToolDefaultDenyRules()` / `dynamicLearningToolAgentPermission()` emit **one exact deny per catalog ID** (`permission: <id>`, `pattern: "*"`, `action: "deny"`) from `allDynamicLearningToolIds()`. That set is applied across Buddy agents. Adding a dynamic tool requires it to appear in the catalog so a matching deny is generated; there is no prefix wildcard.

### 2.3 Permission merge: session allow overrides agent deny

Agent rules merge first, then session rules. **Last matching rule wins.**

**Proposed illustration used a namespace wildcard deny plus a namespaced allow.** Shipped rules are exact IDs:

```text
Merged = [ ...agent exact denies for reflection_dynamic, stepwise_solve_dynamic, debug_attempt_dynamic,
           ...session exact allows for IDs granted by learning_tool_load ]
```

A later session `allow` for `reflection_dynamic` overrides that agent's deny for that session only. Other sessions in the same directory stay denied. A **wildcard session allow** for a whole namespace would still defeat selection discipline and must not be used.

### 2.4 Search-candidate recording (required invariant)

`learning_tool_search` must record the exact candidate IDs for **that directory + session**. `learning_tool_load` may grant only IDs in that recorded set. Load without a prior search, or with IDs not in the set, must expose nothing (current load copy: call search first, then pass exact returned IDs).

Search does not register tools. Load does not grant the whole catalog.

Current search/load tools in `dynamic-tool-discovery.ts` follow this intersection; treat the **invariant** as the durable rule if the helper names change.

### 2.5 Lifecycle: permission clearing vs unregister

| Concern | Plan rationale (intent-removal notes) | Shipped behavior |
|---|---|---|
| How tools enter the registry | Load called `ToolRegistry.register`; idle sessions unregistered tools no other session still referenced | Plugin **pre-registers** all dynamic tools at instance boot. `registerBuddyTools` / `unregisterBuddyTools` are no-ops. |
| How the model sees a tool | Session exact allow after namespace deny | Same: session exact allow after per-ID deny |
| When grants end | Clear exact allows **before the next Buddy turn** in the same session | Grants persist for the session until archive/delete (`clearDynamicLearningToolsForEndedSession`) or an explicit grant clear. Tests assert tools **stay registered** while session permissions are cleared. Load output: available until the session ends or is explicitly cleared. |

Do not describe turn-boundary **unregister** as current policy. Clearing **session allow rules** is not the same as removing tool defs from `ToolRegistry`.

---

## 3. Rejected alternatives and still-valid gotchas

| Approach | Why rejected / why it still matters |
|---|---|
| Mid-session `ToolRegistry.register` / `unregister` to hide tools | Mutates directory-shared registry; races and cache invalidation. Visibility is session-permission dynamic. (Plan-era smoke tests did register on search; production must not.) |
| Wildcard session allow for all dynamic tools | Defeats selection; bloats the tool schema. |
| Persona denies only | Subagent leak. Shared deny compilation for every agent. |
| Direct `tool.execute()` as visibility proof | Bypasses `Permission.disabled`. |
| Putting dynamic-tool **search** guidance only inside a pedagogy skill | A skill can explain search only after it is loaded. Always-visible prompt text or skill **descriptions** must tell the model when to load pedagogy skills. |
| Folding dynamic IDs into `allLearningToolIds()` overlays without a dynamic policy | Static derivation can advertise load-gated tools. Omitting them from overlays can skip permission management. Dynamic denies/allows must stay a dedicated policy (`dynamic-tool-permissions.ts`), not accidental static allow. |

Keep learner free-text `"intent"` in chat distinct from the removed runtime `Intent` type.

---

## 4. Verification

Regression coverage: `packages/buddy/test/learning/runtime-tool-registration.test.ts`

1. Search returns candidates without exposing dynamic tools via permissions.
2. Load grants exact session allows only for IDs from the latest recorded search set.
3. Directory-visible dynamic tools stay denied without those grants.
4. Load without a valid session does not grant.
5. Subagents default-deny catalog dynamic tool IDs.
6. Clearing grants removes session allows while tools remain registered.
