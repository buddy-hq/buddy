# OpenCode subagent runtime semantics

Status: canonical runtime reference

This is the root-doc authority for the subagent-mode semantics formerly
recorded in the quiz library. It describes runtime boundaries and the
capability model; an agent's effective permission configuration remains the
source of truth for which tools it can actually use.

## Mode and capability model

`mode: "subagent"` is a runtime classification with UI and invocation
consequences. It does not inherently remove tools, file-write access, Bash
access, or the ability to invoke other agents. Those capabilities come from
the agent's permission map. A custom subagent with the same permissions as a
primary agent can therefore perform the same work, subject to the three
hard-coded mode boundaries below.

## Three hard-coded mode boundaries

1. A subagent cannot be configured as the default agent.
2. A subagent is excluded from the visible Tab-cyclable agent switcher.
3. A subagent is invoked through an `@` mention or the Task tool, rather than
   being selected as a primary Tab agent.

These are mode/runtime rules, not a universal read-only policy.

## Built-in versus custom permissions

Built-in subagents may have narrower permissions by deliberate configuration:

| Agent | `todowrite` | `edit`/`write` | Reason |
|---|---|---|---|
| `general` | deny | allow | It must not manage the parent agent's todos. |
| `explore` | deny | deny | It is intended for read-only codebase exploration. |

Those restrictions belong to the built-in permission choices. They are not
implied by `mode: "subagent"` and must not be generalized to custom subagents.

For example, a custom subagent may be granted the same working capabilities as
a build-oriented primary agent:

```json
{
  "agent": {
    "my-subagent": {
      "mode": "subagent",
      "permission": {
        "todowrite": "allow",
        "edit": "allow",
        "write": "allow",
        "bash": "allow",
        "task": "allow"
      }
    }
  }
}
```

With those permissions it can use the same tools, write files, run Bash, and
invoke other agents as the primary. It still cannot be the default, cannot be
Tab-selected, and must be invoked with `@my-subagent` or Task.

| Aspect | Primary agent | Custom subagent |
|---|---|---|
| Tool access | Determined by permissions | Determined by permissions — same model |
| File writes | If permission allows | If permission allows — same model |
| Bash | If permission allows | If permission allows — same model |
| Invoke other agents | If `task` permission allows | If `task` permission allows — same model |
| Tab switchable | Yes | No — hard-coded UI filter |
| Can be default | Yes | No — hard-coded check |
| Invocation | Tab/direct primary selection | `@` mention or Task tool |

The runtime mode is therefore a label plus three boundary rules; permissions,
not the label, determine the rest of the capability surface.
