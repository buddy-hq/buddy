# Learning Authoring Guardrails

This note captures architectural guardrails for persona, tool, and agent overlay authoring in Buddy.

Use this document as a short companion to:

- `docs/guides/persona-authoring-guide-v2.md`
- `docs/guides/tool-authoring-guide.md`

## Canonical Authoring Surfaces

- Persona defaults:
  - `packages/buddy/src/learning/personas/<persona-id>/agent.ts`
  - `packages/buddy/src/learning/personas/definitions.ts`
- Tool behavior and hard constraints:
  - tool module + `createBuddyTool(..., capability)`

Do not re-author the same policy in persona agent files, overlay merge files, or transport/proxy glue.

## Import-Cycle Guardrail

Avoid deriving learning-tool policy during persona/agent module initialization.

Reason:

- The global tool catalog imports concrete tool families.
- Some tools depend on services that eventually touch runtime capability resolution.
- Deriving permissions too early can trigger circular initialization crashes.

Current safe pattern:

- Derive static persona learning-tool permissions in:
  - `packages/buddy/src/config/opencode/agents.ts`
- Keep persona definition files raw and derive runtime agents in:
  - `packages/buddy/src/learning/personas/runtime-agents.ts`

## Registration Guardrail

Tool family registration behavior should come from tool-family descriptors and shared policy helpers, not handwritten literal objects in request transforms.

When adding a family:

1. Add the family descriptor in `packages/buddy/src/learning/tools/tool-catalog.ts`.
2. Keep family registration behavior driven by `register-runtime-tools.ts`.
3. Keep session-time family enablement driven by `tool-registration-policy.ts`.

## No Drift Guardrail

Before merging authoring changes, run:

```bash
bun fmt
bun lint
bun typecheck
```

And run focused tests for:

- persona/config guardrails
- tool permission compiler behavior
- agent parity
