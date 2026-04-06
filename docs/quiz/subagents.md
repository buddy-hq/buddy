# Agents vs Subagents: Capabilities Comparison

## Can a Custom Subagent Do Everything a Primary Agent Can?

**YES.** If you create a custom subagent with `mode: "subagent"` and give it the same permissions as a primary agent, it can do everything a primary agent can do.

The `mode` field is just a label for UI behavior — it doesn't inherently restrict capabilities. Restrictions come from permissions, not mode.

## Hard-Coded Restrictions (Only 3)

### 1. Cannot be set as default agent
Location: `vendor/opencode/packages/opencode/src/agent/agent.ts:302`
```typescript
if (agent.mode === "subagent") throw new Error(`default agent "${c.default_agent}" is a subagent`)
```

### 2. Not shown in agent switcher (Tab cycling)
Location: `vendor/opencode/packages/opencode/src/cli/cmd/tui/context/local.tsx:38`
```typescript
const agents = createMemo(() => sync.data.agent.filter((x) => x.mode !== "subagent" && !x.hidden))
```
Subagents are filtered out from the cycle-able agent list.

### 3. Only invocable via `@` or Task tool
Location: `vendor/opencode/packages/opencode/src/tool/task.ts:29`
```typescript
const agents = await Agent.list().then((x) => x.filter((a) => a.mode !== "primary"))
```
The Task tool only shows non-primary agents (subagents + `mode: "all"`).

## Built-in vs Custom Subagents

Built-in subagents have restricted permissions by design:

| Agent | `todowrite` | `edit`/`write` | Why |
|---|---|---|---|
| `general` (built-in) | deny | allow | To prevent it managing parent's todos |
| `explore` (built-in) | deny | deny | To make it read-only for codebase exploration |

But these are **permission choices**, not inherent to the `mode: subagent` type.

## Example: Identical Capabilities

If you create this custom subagent:
```json
{
  "agent": {
    "my-subagent": {
      "mode": "subagent",
      "permission": {
        "todowrite": "allow",
        "edit": "allow",
        "write": "allow",
        "bash": "allow"
      }
    }
  }
}
```

It can do everything the `build` agent can, except:
- Cannot be selected via Tab key
- Cannot be set as default agent
- Must be invoked via `@my-subagent` or Task tool

## Summary: Mode Is Just a Label

| Aspect | Primary Agents | Custom Subagents |
|---|---|---|
| **Tool access** | Determined by permissions | Determined by permissions — SAME |
| **Can write files** | If permission allows | If permission allows — SAME |
| **Can run bash** | If permission allows | If permission allows — SAME |
| **Can invoke other agents** | If `task` permission allows | If `task` permission allows — SAME |
| **Tab switchable** | Yes | No — hard-coded UI filter |
| **Can be default** | Yes | No — hard-coded check |
| **Invoked via** | Tab key or direct selection | `@` mention or Task tool |

The built-in subagents (`general`, `explore`) have restrictions, but that's their specific configuration — not a rule about all subagents.
