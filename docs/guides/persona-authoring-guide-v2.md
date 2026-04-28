# Buddy Persona Authoring Guide v2

This guide explains the current persona model after the persona authoring refactor.

The core rule is:

- author a persona once in `packages/buddy/src/learning/personas/<persona-id>/agent.ts`
- derive the persona catalog, runtime agent registration, config schema ids, and frontend selection behavior from that definition
- do not hand-maintain the same persona policy in multiple files

## What A Persona Is

A Buddy persona combines:

1. Persona policy:
   - label
   - description
   - domain
   - supported surfaces
   - default surface
   - default tools
   - default subagents
   - context policy
2. Runtime agent behavior:
   - prompt composition
   - primary vs build mode
   - local non-learning-tool permission tweaks

Those now live together in one authoring file.

## Canonical Files

These files define the current model:

- `packages/buddy/src/learning/personas/<persona-id>/agent.ts`
- `packages/buddy/src/learning/personas/define-buddy-persona.ts`
- `packages/buddy/src/learning/personas/definitions.ts`
- `packages/buddy/src/learning/personas/runtime-agents.ts`
- `packages/buddy/src/learning/personas/catalog.ts`
- `packages/buddy/src/config/opencode/agents.ts`
- `packages/web/src/state/chat-actions.ts`

Compatibility wrappers still exist:

- `packages/buddy/src/learning/personas/registry.ts`

Treat that file as derived compatibility output, not as the primary place to author personas.

## Authoring Model

Each persona file exports one `defineBuddyPersona(...)` call.

That definition includes:

- all persona policy fields
- one `runtime` block describing how to build the OpenCode agent entry

Example shape:

```ts
import BUDDY_BASE_PROMPT from "../buddy/buddy.p.md"
import SCIENCE_BUDDY_OVERLAY from "./overlay.p.md"
import { composePersonaPrompt, defineBuddyPersona } from "../define-buddy-persona"

export const SCIENCE_BUDDY = defineBuddyPersona({
  id: "science-buddy",
  label: "Science Buddy",
  description: "Science-focused Buddy persona for concept building and guided practice.",
  domain: "general",
  surfaces: ["curriculum", "question-set"],
  defaultSurface: "curriculum",
  hidden: false,
  tools: {
    static: {
      learner_snapshot_read: "allow",
      render_saved_question_set: "allow",
    },
    dynamic: {},
  },
  skills: {},
  subagents: {
    "question-set-author": "prefer",
  },
  context: {
    attachCurriculum: true,
    attachProgress: true,
    attachTeachingWorkspace: false,
    attachTeachingPolicy: false,
    attachFigureContext: false,
  },
  runtime: {
    kind: "primary",
    prompt: composePersonaPrompt(BUDDY_BASE_PROMPT, SCIENCE_BUDDY_OVERLAY),
  },
})
```

What you should not author by hand:

- learning-tool permission envelopes in persona runtime config
- duplicated persona descriptions in separate registry and agent files
- manual persona registration in `register-agents.ts`
- manual config schema keys for persona overrides
- frontend learner persona allowlists

## Runtime Flow

This is the current path from persona definition to a live turn:

1. Persona ids and surfaces are derived from `personas/definitions.ts`.
2. Project config schema uses those derived ids.
3. Persona catalog entries are built from those definitions plus config overrides.
4. Runtime capability resolution combines:
   - persona `tools.static`
   - persona `tools.dynamic`
   - persona `subagents`
   - tool metadata constraints
   - runtime readiness
   - config tool toggles
5. OpenCode persona agents are derived from the same persona definitions.
6. Static learning-tool permissions are merged later in `config/opencode/agents.ts`.

Important detail:

Shared vocabulary files must be able to import persona definitions without loading OpenCode config.

That is why persona files export raw definitions, while `personas/runtime-agents.ts` performs the runtime-agent derivation separately.

## Add A New Persona

For a normal new persona, the expected diff is:

- `packages/buddy/src/learning/personas/<persona-id>/agent.ts`
- `packages/buddy/src/learning/personas/<persona-id>/overlay.p.md`
- `packages/buddy/src/learning/personas/definitions.ts`
- focused tests in `packages/buddy/test/**`
- if frontend behavior changed, focused tests in `packages/web/test/**`

You should not need to edit:

- `packages/buddy/src/learning/register-agents.ts`
- `packages/buddy/src/config/contract/schema.ts`
- `packages/web/src/state/chat-actions.ts`

### Step 1: Create The Persona File

Create:

- `packages/buddy/src/learning/personas/<persona-id>/agent.ts`
- `packages/buddy/src/learning/personas/<persona-id>/overlay.p.md`

Use `defineBuddyPersona(...)`.

Choose:

- `id`
- `label`
- `description`
- `domain`
- `surfaces`
- `defaultSurface`
- `tools.static`
- `tools.dynamic`
- `skills`
- `subagents`
- `context`
- `runtime.kind`
- `runtime.prompt`
- any local runtime permission deltas

### Step 2: Add It To The Persona Manifest

Edit:

- `packages/buddy/src/learning/personas/definitions.ts`

Add the new exported definition to `BUILTIN_BUDDY_PERSONA_DEFINITIONS`.

That single manifest drives:

- canonical persona ids
- catalog order
- derived registry data
- runtime persona agent registration

### Step 3: Add Focused Tests

At minimum, cover:

- persona guardrails
- agent parity
- runtime capability profile behavior if tool or subagent defaults changed
- frontend default resolution if persona ordering or visibility changed

Good references:

- `packages/buddy/test/learning/persona-authoring-guardrails.test.ts`
- `packages/buddy/test/parity/agent.test.ts`
- `packages/web/test/persona-default-order.test.ts`

## Guardrails

- Keep persona descriptions single-sourced unless there is a concrete reason to diverge.
- Only reference real registered subagents in `subagents`.
- Only mention tools or subagents in prompt prose if they are actually available to that persona.
- Prefer catalog order from the backend over frontend hardcoded persona fallback lists.

## Validation

Run after persona changes:

```bash
bun fmt
bun lint
bun typecheck
```

Run focused tests for the packages you changed. Do not run the full suite.
