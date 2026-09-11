# Tool Permissions & Migration FAQ

> **Status:** Conceptual reference for tool registration vs session permissions, including registry-vs-permission **timing**. Shipped runtime behavior: [phase-3-tool-semantics-shipped.md](./phase-3-tool-semantics-shipped.md).
> **Related:** [phase-3-tool-semantics-shipped.md](./phase-3-tool-semantics-shipped.md), [about.md](./about.md)

---

## 1. What does the decoupling plan recommend for tools?

Pre-register all Buddy tools once in the runtime plugin, and toggle tool visibility per session using **session permissions** (`deny` with `pattern: "*"` or `allow`), rather than registering and unregistering tools dynamically in `ToolRegistry`.

---

## 2. Tool Registration vs. Session Permissions in OpenCode

- **Tool registration:** Server-wide / instance-scoped definition in `ToolRegistry`.
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
|---|---|---|
| Per-session on/off without affecting other sessions | Poor (registry is process/project scoped) | **Session rules** |
| Dynamic tool for one session only | Register globally affects all | **Allow** on that session |
| `ask` — model sees tool, human approves run | Unregister hides from model | **`ask`** |
| Per-message `tools: { id: false }` | No | **Yes** |
| Pattern rules (e.g. `task` / subagent type) | No | **Yes** |
| Builtin path checks (`bash`, `read`, …) at execute | No | **`ctx.ask()`** |

**Why the plan uses permissions after plugin export:** Registry is stable at plugin load; per-chat and per-prompt visibility must change without unregistering globally.

---

## 3. When is the tool registry built?

Three layers run at **different** times. This is the shipped (Phase 3) timing model.

| Layer | When |
|-------|------|
| Buddy / OpenCode server process | Once per Buddy app start (`loadOpenCodeApp()`) |
| **Tool registry for a project** | When that project’s OpenCode **instance boots** — first use, or after `syncOpenCodeProjectConfig` **disposes** the instance. **Not** per session. **Not** per message. |
| **Plugin tool export** | When that instance loads the Buddy plugin (`allBuddyPluginTools()`). Same as instance boot. **All** Buddy learning tools are exported, including config-off and standards/calculator-not-ready tools. |
| **Session permissions** | **Every** Buddy prompt/command (`syncBuddyRuntimeSessionPermissions` after `readProjectConfig`) |
| **Model tool list** | **Every** agent step inside OpenCode — `llm.resolveTools` filters registry tools by permissions + `user.tools` before `streamText` |

Do **not** omit standards/calculator tools from plugin export when the runtime is not ready. They stay registered; `buildBuddyRuntimeSessionPermissions` **deny**s them until ready. See [phase-3-tool-semantics-shipped.md](./phase-3-tool-semantics-shipped.md).

### FAQ: Long chat, user turns standards tools on in settings, sends another message

**Permissions** update on the next message. **Registry** does not rebuild unless the project instance reloads.

| Situation | Works on next message? |
|-----------|-------------------------|
| Toggle off → on; tool **already in registry** (true for static/standards tools after Phase 3) | **Yes** — permission sync reads new config |
| Toggle + normal settings save (`syncOpenCodeProjectConfig`) | **Yes** if standards runtime is ready after reload |
| Standards DB became ready but instance **never** reloaded | **Yes** for model visibility if permission build sees runtime-ready — no omit-at-export. Instance reload is only required if the **export set** itself must change. |
| Standards DB still not ready | **No** — session `deny`, tool still in `ToolRegistry.ids()` |

Saving project config runs `syncOpenCodeProjectConfig` → `OpenCodeInstance.dispose()` → next request rebuilds plugin export (needed for overlay/fingerprint changes, not for ordinary deny/allow).

---

## 4. Runtime blocking without writing config

Possible **without** editing `buddy.jsonc` at block time:

- `syncBuddyRuntimeSessionPermissions` each prompt (persona, features, teaching workspace, config **read** from disk)
- Dynamic `learning_tool_load` → `grantDynamicLearningToolsForSession`
- Subagent forwarding sets child session permissions + `tools` overrides
- Teaching workspace / persona state in `buildToolPermissions`

**Not** available anymore: per-request registry register/unregister via proxy `toolRegistrations` (removed on SDK prompt path).

---

## 5. Subagent forwarding (e.g. reading-buddy → flashcard-author)

**Unchanged in core logic** vs main; wiring consolidated into `subagent-forwarding.ts`.

On child prompt (`task` or direct delegate):

1. `resolveSubagentToolForwarding` — inherit parent effective tools + subagent extras + persona policy.
2. `Session.setPermission` on child session.
3. `tools` overrides on prompt input.

Primary session: `save_flashcard_deck` denied; `task` / `flashcard-author` allowed. Child session: gains `save_flashcard_deck` via forwarding.

Tests: `packages/buddy/test/learning/subagent-tool-forwarding.test.ts` (including task path with parent denials).

---

## 6. Key code references

| Topic | Path |
|---|---|
| Plugin export | `packages/buddy/src/opencode-runtime/buddy-tool-shim.ts` |
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

---

## 7. One-line summaries

- **Registration:** “Is this tool in the registry **right now**?” (stable at boot).
- **Permissions:** “Is this session **allowed** to use it?” (updated each prompt).
- **Model visibility:** Wildcard **`deny`** removes tools from the LLM **tools** payload; it does not rely on execute-time failure for Buddy `deny` rules.
- **Mid-chat settings toggle:** Works on next message if the tool is already registered; otherwise needs instance reload (settings save triggers that).
