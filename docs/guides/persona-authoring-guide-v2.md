# Buddy Persona Authoring Guide

This is the canonical persona authoring guide. It matches the shipped
`defineBuddyPersona` API and file layout.

The core rule is:

- author a persona once in `packages/buddy/src/learning/personas/<persona-id>.ts`
- attach features; do not hand-author `tools.static` / `tools.dynamic` on the persona
- derive catalog entries, runtime agents, and OpenCode learning-tool permissions from that definition

## What A Persona Is

A Buddy persona combines:

1. Persona policy:
   - label
   - description
   - attached features (tools, skills, surfaces, delegatable subagents)
   - default surface
   - context policy
2. Runtime agent behavior:
   - prompt composition
   - primary vs build mode
   - optional local non-learning-tool permission tweaks
   - which feature subagents the persona may delegate

Those live together in one authoring file.

## Capability Model: Features, Skills, Tools, Subagents, Plugins

Features are the authoring boundary for persona capabilities. Within that boundary, keep the roles distinct:

- **Skills** are reusable procedures, teaching playbooks, and methodology.
- **Tools** do concrete work such as structured output, persistence, artifact generation, or workspace mutation.
- **Subagents** handle larger bounded specialist delegation.
- **Plugins** are runtime extensions: custom tool registration, runtime-wide hooks/transforms, instrumentation, or provider integration.

Plugins are **not** the activity model and should not represent everyday teaching activities. An activity may be assembled from a feature's skills, tools, and subagents; use a plugin only when the need is genuinely a runtime extension. Do not recreate the old router by hard-filtering skills or by turning plugin identity into a teaching-mode permission partition—the agent remains responsible for choosing the relevant procedure within the persona's capabilities.

## Canonical Files

- `packages/buddy/src/learning/personas/<persona-id>.ts` — author here (`buddy.ts`, `teaching-buddy.ts`, `code.ts`)
- `packages/buddy/src/learning/personas/shared-features.ts` — shared feature list most personas attach
- `packages/buddy/src/learning/personas/wiring/define-buddy-persona.ts` — `defineBuddyPersona`
- `packages/buddy/src/learning/personas/prompts/render-persona-prompt.ts` — composed persona documents
- `packages/buddy/src/learning/personas/registry.ts` — `REGISTERED_BUDDY_PERSONAS` via `registerPersona`
- `packages/buddy/src/learning/personas/wiring/persona-profiles.ts` — catalog + derived `tools.static` / `tools.dynamic`
- `packages/buddy/src/learning/personas/wiring/create-buddy-persona-agent.ts` — runtime OpenCode agent
- `packages/buddy/src/learning/personas/wiring/persona.orchestration.ts` — builtin persona agents
- `packages/buddy/src/learning/runtime/register-agents.ts` — persona agents + subagents
- `packages/buddy/src/config/opencode/agents.ts` — merges derived static learning-tool permissions
- `packages/buddy/src/learning/runtime/define-buddy-feature.ts` — feature owners for tools/skills/subagents

Treat `packages/buddy/src/learning/personas/registry.ts` as the registration list, not a second place to copy policy fields.

These paths do **not** exist and must not be authored:

- `packages/buddy/src/learning/personas/<persona-id>/agent.ts`
- `packages/buddy/src/learning/personas/definitions.ts`
- `packages/buddy/src/learning/personas/runtime-agents.ts`
- `packages/buddy/src/learning/personas/define-buddy-persona.ts` (the function lives under `wiring/`)

## Authoring Model

Each persona file exports one `defineBuddyPersona(...)` call.

That definition includes:

- `id`, `label`, `description`, `hidden`
- `features` — the only place tool/skill/surface membership is chosen
- `defaultSurface` — must be a surface derived from those features
- `context` — curriculum/progress/workspace/figure attachment
- `runtime` — `kind`, `prompt`, optional `permission`, optional `subagents`

The `features` list is the source of truth for capabilities. `context` is a delivery policy, not a second capability registry. A context flag that means “this persona can use feature X” (for example, figure context) should be derived from or validated against the attached feature set; do not add parallel persona-level switches that can drift from feature ownership. Context flags that only control whether already-authorized learner or workspace information is attached may remain explicit policy.

Shipped shape (from `packages/buddy/src/learning/personas/buddy.ts`):

```ts
import { BUDDY_SHARED_FEATURES } from "./shared-features"
import { PERSONA_PROMPT_ID, renderBuddyPersonaPrompt } from "./prompts/render-persona-prompt"
import { defineBuddyPersona } from "./wiring/define-buddy-persona"

export const BUDDY = defineBuddyPersona({
  id: "buddy",
  label: "Buddy",
  description: "The default Buddy persona for learning conversations and project help.",
  features: BUDDY_SHARED_FEATURES,
  defaultSurface: "curriculum",
  hidden: false,
  context: {
    attachCurriculum: true,
    attachProgress: true,
    attachTeachingWorkspace: false,
    attachTeachingPolicy: false,
    attachFigureContext: true,
  },
  runtime: {
    kind: "build",
    prompt: renderBuddyPersonaPrompt(PERSONA_PROMPT_ID.learningCompanion),
    subagents: {
      "question-set-author": true,
      "flashcard-author": true,
      general: true,
    },
  },
})
```

`persona-profiles.ts` derives catalog tools from attached features:

- non-dynamic feature tools → `tools.static` allow
- `tool.dynamic` tools → `tools.dynamic` allow
- feature skills → `skills` allow
- `runtime.subagents` keys → catalog `subagents` allow (else every delegatable feature subagent)

Do not author `tools: { static, dynamic }` on the persona. That field is not on `defineBuddyPersona`.

What you should not author by hand:

- learning-tool permission envelopes in persona runtime config (OpenCode maps are derived in `config/opencode/agents.ts`)
- duplicated persona descriptions in a separate registry object
- manual persona registration outside `registry.ts`
- frontend learner persona allowlists

## Runtime Flow

1. Persona modules export raw `defineBuddyPersona` objects. They must not import OpenCode config.
2. `registry.ts` registers the builtin list (`buddy`, `teaching-buddy`, `code`).
3. `persona-profiles.ts` derives catalog entries and `PersonaDefinition` tool maps from `features`.
4. `create-buddy-persona-agent.ts` builds the OpenCode agent; dynamic tools are denied on the persona agent until loaded.
5. `register-agents.ts` combines persona agents with feature subagents.
6. `config/opencode/agents.ts` merges `deriveStaticPersonaToolPermissionsFromProfile(getBuddyPersona(name))` into persona agent permissions.

Shared vocabulary and persona definition files must import without loading OpenCode config. That is why definitions stay raw and agent derivation lives in `wiring/`.

## Add A New Persona

Expected diff:

- `packages/buddy/src/learning/personas/<persona-id>.ts`
- prompt composition via `render-persona-prompt.ts` and/or `packages/buddy/src/learning/personas/prompts/*.p.md`
- `packages/buddy/src/learning/personas/registry.ts` (`REGISTERED_BUDDY_PERSONAS`)
- focused tests in `packages/buddy/test/**`
- if frontend default order or visibility changed, focused tests in `packages/web/test/**`

You should not need to edit:

- `packages/buddy/src/config/contract/schema.ts` for a normal builtin persona
- a hardcoded frontend persona allowlist

### Step 1: Create The Persona File

Use `defineBuddyPersona(...)`. Choose `id`, `label`, `description`, `features`, `defaultSurface`, `context`, `runtime.kind`, `runtime.prompt`, and which delegatable subagents the runtime may call.

### Step 2: Register It

Add the export to `REGISTERED_BUDDY_PERSONAS` in `registry.ts`. That list drives catalog order, derived profiles, and runtime persona agent registration (`BUILTIN_BUDDY_PERSONA_DEFINITIONS` is that same list).

### Step 3: Add Focused Tests

At minimum, cover persona permissions/parity and frontend default resolution if ordering or visibility changed.

References:

- `packages/buddy/test/learning/persona-tool-permissions.test.ts`
- `packages/buddy/test/parity/agent.test.ts`
- `packages/web/test/persona-default-order.test.ts`

## Guardrails

- Keep persona descriptions single-sourced unless there is a concrete reason to diverge.
- Only list real delegatable feature subagents in `runtime.subagents`. Internal (non-delegatable) subagents throw in `defineBuddyPersona`.
- Only mention tools or subagents in prompt prose if attached features actually provide them.
- Prefer catalog order from `personaCatalogEntries` over frontend hardcoded fallback lists.

## Validation

Run focused tests for the packages you changed. Do not run the full suite. Repo completion still requires root `bun lint` then root `bun typecheck` when this is a code change.
