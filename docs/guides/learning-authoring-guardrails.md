# Learning Authoring Guardrails

Architectural guardrails for persona, feature, and tool authoring. Companion to:

- [persona-authoring-guide-v2.md](./persona-authoring-guide-v2.md)
- [tool-authoring-guide.md](./tool-authoring-guide.md)

## Canonical Authoring Surfaces

- Persona defaults:
  - `packages/buddy/src/learning/personas/<persona-id>.ts`
  - `packages/buddy/src/learning/personas/registry.ts`
- Features (tools, skills, subagents, surfaces):
  - `packages/buddy/src/learning/runtime/define-buddy-feature.ts`
  - owning `packages/buddy/src/learning/features/<feature>/feature.ts`
- Tool behavior and hard constraints:
  - `createBuddyTool({ id, description, parameters, presentation, execute, constraints? })` in `packages/buddy/src/learning/runtime/create-buddy-tool.ts`

Do not re-author the same policy in overlay merge files, OpenCode agent permission maps, or transport/proxy glue.

## Import-Cycle Guardrail

Avoid deriving learning-tool policy during persona/agent module initialization.

Reason:

- Feature modules import concrete tools.
- Some tools depend on services that eventually touch runtime capability resolution.
- Deriving permissions too early can trigger circular initialization crashes.

Current safe pattern:

- Keep persona definition files raw (`defineBuddyPersona` only).
- Derive catalog `tools.static` / `tools.dynamic` later in `packages/buddy/src/learning/personas/wiring/persona-profiles.ts`.
- Derive runtime OpenCode agents in `packages/buddy/src/learning/personas/wiring/create-buddy-persona-agent.ts`.
- Merge static learning-tool permissions in `packages/buddy/src/config/opencode/agents.ts` via `deriveStaticPersonaToolPermissionsFromProfile`.

Do not import `config/opencode/agents.ts` from a persona definition file.

## Registration Guardrail

Tool membership comes from `defineBuddyFeature({ tools, ... })` and `ALL_BUDDY_FEATURES` in `packages/buddy/src/learning/features/index.ts`. Runtime registration walks `feature-registry.ts` → `tool-registry.ts`. Do not hand-write parallel tool lists in request transforms.

When adding a family:

1. Implement tools with `createBuddyTool` and export them from the feature module.
2. Attach them on `defineBuddyFeature`.
3. Ensure the feature is in `ALL_BUDDY_FEATURES` (and in a persona `features` list if personas should receive those tools).

## No Drift Guardrail

Before merging authoring changes, run focused tests for persona permissions, tool permission compiler behavior, and agent parity. Code changes still require root `bun lint` then root `bun typecheck`.
