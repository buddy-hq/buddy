# Tool Permissions, Registry, and Migration FAQ

Research and review notes from the `decoupling` branch work (2026-05-23). Consolidates migration-plan intent, main vs branch behavior, OpenCode vendor mechanics, and common questions.

**As-built / smoke-tested (Phase 3 tool semantics):** [phase-3-tool-semantics-shipped.md](./phase-3-tool-semantics-shipped.md)

**Related docs:** [tiered-decoupling-plan.md](./tiered-decoupling-plan.md) (current work), [migration-plan.md](./migration-plan.md), [phase-3-implementation.md](./phase-3-implementation.md), [plugin-analysis.md](./plugin-analysis.md)

---

## 1. What the migration plan recommends (tools only)

The full plan is **not** “proxy → SDK with zero behavior change.” It explicitly changes **how tool visibility is enforced**.

### Full target (Phases 2–3)

| Keep the same | Change internally |
|---------------|-------------------|
| Buddy HTTP API, web `BuddyClient`, v1 messages, `createBuddyTool` / personas / features | Hono calls OpenCode via **typed SDK** instead of `fetchOpenCode` proxy |
| | Single **Buddy runtime plugin** exports learning tools |
| | **All** tools pre-registered at plugin load (`allBuddyTools()`) |
| | Visibility → **session permissions** (`allow` / `deny`), not register/unregister |
| | Dynamic tools: always in registry; grant/release = **permission rules only** |
| | **Keep** Buddy prompt orchestration, subagent/task forwarding, skill filtering (adapter patches) |

### First milestone (plan “Final recommendation”)

Ship incrementally:

- SDK replaces proxy on low-risk routes
- Tools run as plugin tools with `createBuddyTool`
- **Dynamic** grants are permission-based
- System prompt guard consolidated into one plugin
- **Do not** move full prompt pipeline into plugin hooks yet
- **Do not** remove subagent forwarding until upstream hooks exist

The first milestone does **not** require finishing `allBuddyTools()` unfiltered export or no-op `registerBuddyTools` before merge.

### Non-goals (tools context)

- No OpenCode v2 prompt path
- No removing config overlay in pass one
- No removing subagent/task forwarding without upstream hooks

---

## 2. Main vs plan vs decoupling branch

### Main (before decoupling)

- Every proxied OpenCode call could run `registerOpenCodeTools` → `registerRuntimeTools` → **register/unregister** tools in the adapter registry.
- Config-off tools → **unregistered** (absent from `ToolRegistry`).
- Standards/calculator not ready → feature flag false → standards tools **never registered**.
- Dynamic tools: grant = register + allow permission; release = unregister + remove permission.
- Session permissions also applied (defense in depth).
- Subagent forwarding: `withSubagentToolForwarding` via session-prompt + task tool patches (same core logic as today).

### Plan target

- Plugin exports full tool set once per instance boot.
- Config-off / runtime-not-ready → tool **stays registered**, session **`deny`** hides from model.
- Dynamic tools: permission grant/release only.
- Per-session toggles without global registry churn.

### Decoupling branch (after Phase 3 tool semantics — see [phase-3-tool-semantics-shipped.md](./phase-3-tool-semantics-shipped.md))

| Area | vs main | vs full plan |
|------|---------|--------------|
| Prompt transport | SDK instead of proxy on many paths | Aligned |
| Dynamic tools | Permission-only grants | Aligned |
| Subagent/task forwarding | Same behavior; files consolidated (`subagent-forwarding.ts`) | Aligned |
| Static tools plugin export | **All tools exported**; deny via permissions | Aligned |
| Config-off tools | In registry; session `deny` (not unregister) | Aligned |
| `registerBuddyTools` | No-op | Aligned |
| Mid-session standards DB ready | Permissions deny until ready; instance reload still needed if export set must change | Mostly aligned |

---

## 3. When is the tool registry built?

Three layers run at **different** times:

| Layer | When |
|-------|------|
| Buddy / OpenCode server process | Once per Buddy app start (`loadOpenCodeApp()`) |
| **Tool registry for a project** | When that project’s OpenCode **instance boots** — first use, or after `syncOpenCodeProjectConfig` **disposes** the instance. **Not** per session. **Not** per message. |
| **Plugin tool export** | When that instance loads the Buddy plugin (`allBuddyPluginTools()`). Same as instance boot. |
| **Session permissions** | **Every** Buddy prompt/command (`syncBuddyRuntimeSessionPermissions` after `readProjectConfig`) |
| **Model tool list** | **Every** agent step inside OpenCode — `llm.resolveTools` filters registry tools by permissions + `user.tools` before `streamText` |

### FAQ: Long chat, user turns standards tools on in settings, sends another message

**Permissions** update on the next message. **Registry** does not rebuild unless the project instance reloads.

| Situation | Works on next message? |
|-----------|-------------------------|
| Toggle off → on; tool **already in registry** | **Yes** — permission sync reads new config |
| Toggle + normal settings save (`syncOpenCodeProjectConfig`) | **Yes** if standards runtime ready after reload |
| Standards DB became ready but instance **never** reloaded | **No** until config sync or app restart |
| Standards DB still not ready | **No** |

Saving project config runs `syncOpenCodeProjectConfig` → `OpenCodeInstance.dispose()` → next request rebuilds plugin export.

---

## 4. Registration vs permissions (from first principles)

### Terms

- **Register:** Tool id + schema + execute handler stored in OpenCode `ToolRegistry` (Buddy also patches adapter `register` / `unregister`).
- **Send to model:** Separate `tools` argument on the LLM API (name, description, JSON schema). **Not** the system-prompt text block.
- **Session permission:** Rules on the session — `allow`, `deny`, or `ask` for a tool name (pattern `*` for whole tool).

### What registration controls

- Whether the tool **exists** in the server at all.
- Whether `ToolRegistry.tools()` / `ids()` include it.
- Whether execute can be dispatched for that id.
- Plugin `tool.definition` hooks run for tools built in the inner prompt `resolveTools` loop (before LLM filter) — CPU work even if later denied.

### What permissions control (OpenCode)

**Before the LLM call** (`vendor/opencode/.../session/llm.ts`):

```typescript
function resolveTools(input) {
  const disabled = Permission.disabled(
    Object.keys(input.tools),
    Permission.merge(input.agent.permission, input.permission ?? []),
  )
  return Record.filter(input.tools, (_, k) => input.user.tools?.[k] !== false && !disabled.has(k))
}
```

- **`deny` + `pattern: "*"`** → tool **removed** from payload sent to the model.
- **`user.tools[id] === false`** on the user message → also removed.
- **`ask`** → tool **can still be sent** to the model; approval/deny may happen at **execute** time via `ctx.ask()`.

**Not** “register = always attached; deny = attached but fails at runtime” for wildcard `deny`.

### FAQ: If we have 100 registered tools and 10 allowed, does the model get 100?

**No** (for normal Buddy `deny` + `*` rules). Model gets ~10 tool schemas.

Caveats:

- Tools with **`ask`** may all appear; blocked when run.
- **Chat text** (e.g. `learning_tool_search` output) can mention tool names without them being in the API tool list.
- **`ToolRegistry.ids()`** lists registered tools, not “sent to model.”
- Inner loop may still build schemas for all registered tools before filter (CPU, not necessarily LLM tokens).

### FAQ: Are registration and permissions redundant?

**Only for one case:** hide tool from model via unregister vs `deny` + `*`.

**Not redundant because:**

| Need | Register/unregister | Permissions |
|------|---------------------|-------------|
| Per-session on/off without affecting other sessions | Poor (registry is process/project scoped) | **Session rules** |
| Dynamic tool for one session only | Register globally affects all | **Allow** on that session |
| `ask` — model sees tool, human approves run | Unregister hides from model | **`ask`** |
| Per-message `tools: { id: false }` | No | **Yes** |
| Pattern rules (e.g. `task` / subagent type) | No | **Yes** |
| Builtin path checks (`bash`, `read`, …) at execute | No | **`ctx.ask()`** |

**Why the plan uses permissions after plugin export:** Registry is stable at plugin load; per-chat and per-prompt visibility must change without unregistering globally.

---

## 5. Runtime blocking without writing config

Still possible on decoupling **without** editing `buddy.jsonc` at block time:

- `syncBuddyRuntimeSessionPermissions` each prompt (persona, features, teaching workspace, config **read** from disk)
- Dynamic `learning_tool_load` → `grantDynamicLearningToolsForSession`
- Subagent forwarding sets child session permissions + `tools` overrides
- Teaching workspace / persona state in `buildToolPermissions`

**Not** available anymore: per-request registry register/unregister via proxy `toolRegistrations` (removed on SDK prompt path).

**Boot-time / instance reload** still gates tools omitted from plugin export (standards/calculator when runtime not ready at load).

---

## 6. Subagent forwarding (e.g. reading-buddy → flashcard-author)

**Unchanged in core logic** vs main; wiring consolidated into `subagent-forwarding.ts`.

On child prompt (`task` or direct delegate):

1. `resolveSubagentToolForwarding` — inherit parent effective tools + subagent extras + persona policy.
2. `Session.setPermission` on child session.
3. `tools` overrides on prompt input.

Primary session: `save_flashcard_deck` denied; `task` / `flashcard-author` allowed. Child session: gains `save_flashcard_deck` via forwarding.

Tests: `packages/buddy/test/learning/subagent-tool-forwarding.test.ts` (including task path with parent denials).

---

## 7. Original code-review findings (reframed)

| Finding | vs main (user-visible) | vs migration plan | Action if sticking with plan |
|---------|------------------------|-------------------|------------------------------|
| Plugin omits runtime-gated standards tools | Same as main (unregister) unless DB ready mid-session without reload | **Gap** — want registered + deny | Export `allBuddyTools()`; deny when runtime not ready |
| Config-disabled tools omitted from plugin | Same as main (unregister) | **Gap** — want registered + deny | Export all static tools; deny via `buildBuddyRuntimeSessionPermissions` |
| Use `allBuddyTools()` not filtered flags | Would **change** main if shipped | Required Phase 2 | Change `buddy-tool-shim.ts` |
| `registerBuddyTools` not no-op | Mostly internal | Phase 3 incomplete | No-op + stop feature `register.ts` real register |

**“Patch is incorrect”** is fair against **full Phase 2/3 acceptance**; **too strong** against **first milestone + main parity** for chat/subagents/dynamics.

---

## 8. Should you stick with the plan’s tool-permission model?

**Shipped on branch (smoke-tested):** see [phase-3-tool-semantics-shipped.md](./phase-3-tool-semantics-shipped.md).

| Goal | Status |
|------|--------|
| **Decoupling / maintainability** (SDK + plugin + per-session permissions) | Tool semantics done; proxy deletion still backlog |
| **Zero behavior change vs main** | Not a goal of Plan A — config-off and standards use register+deny now |
| **Full Phase 3 checklist** | Done for tool export + no-op register; Phase 7 proxy removal still open |

---

## 9. User FAQ index

| Question | Section |
|----------|---------|
| What does migration recommend for tools? | §1 |
| Main vs plan vs branch? | §2 |
| Registry built at session, message, or app? Standards toggle mid-chat? | §3 |
| Register = always in model request? Deny = sent but fails at run? 100 tools / 10 allowed? | §4 |
| Block tools at runtime without config write? | §5 |
| Subagent forwarding still work? | §6 |
| Are review findings regressions? | §7 |
| Stick with plan or not? What’s left? | §8 |

---

## 10. Key code references

| Topic | Path |
|-------|------|
| Plugin export (filtered today) | `packages/buddy/src/opencode-runtime/buddy-tool-shim.ts` |
| Enabled tools / config toggles at export | `packages/buddy/src/learning/runtime/enabled-buddy-tools.ts` |
| Session permission build | `packages/buddy/src/learning/agent-execution/permissions/session-permissions.ts` |
| Sync permissions each prompt | `packages/buddy/src/learning/agent-execution/permissions/runtime-session-permissions.ts` |
| Runtime allow/deny from persona/workspace/config | `packages/buddy/src/learning/access/build-runtime-permissions.ts` |
| Dynamic grant/release | `packages/buddy/src/learning/runtime/dynamic-tool-grants.ts` |
| Subagent forwarding | `packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts` |
| Subagent patch entry | `packages/buddy/src/opencode-runtime/subagent-forwarding.ts` |
| Config change → instance dispose | `packages/buddy/src/config/runtime/opencode-sync.ts` |
| Model tool filter (vendor) | `vendor/opencode/packages/opencode/src/session/llm.ts` (`resolveTools`) |
| Permission `disabled()` (vendor) | `vendor/opencode/packages/opencode/src/permission/index.ts` |
| Main register/unregister | `git show main:packages/buddy/src/learning/runtime/register-tools.ts` |

---

## 11. One-line summaries

- **Main:** “Is this tool in the registry **right now**?” (often updated each proxy request) plus permissions.
- **Plan:** “Are all tools in the registry; is this session **allowed** to use them?” plus SDK instead of proxy.
- **Model visibility:** Wildcard **`deny`** removes tools from the LLM **tools** payload; it does not rely on execute-time failure for Buddy `deny` rules.
- **Mid-chat settings toggle:** Works on next message if the tool is already registered; otherwise needs instance reload (settings save usually triggers that).
