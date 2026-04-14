# Buddy Persona Authoring Guide

This guide explains exactly how `code-buddy` and `math-buddy` are built today, where they are wired, and what to change to add or configure any Buddy persona.

## What a Persona Is in Buddy

A persona in Buddy is not just a prompt file. It is the combination of:

1. A runtime agent definition (prompt + base permissions + subagents).
2. A persona profile (label, surfaces, default intent/surface, tool/subagent defaults, context policy).
3. Config schema support (`default_persona`, per-persona overrides).
4. Frontend wiring (persona selector, defaults, learner snapshot query typing).

`code-buddy` and `math-buddy` are implemented as full runtime personas with different defaults and capabilities.

## Current Source of Truth

These files are the core authority for persona behavior:

- `packages/buddy/src/learning/personas/registry.ts`
- `packages/buddy/src/learning/personas/code-buddy/agent.ts`
- `packages/buddy/src/learning/personas/math-buddy/agent.ts`
- `packages/buddy/src/learning/personas/code-buddy/overlay.p.md`
- `packages/buddy/src/learning/personas/math-buddy/overlay.p.md`
- `packages/buddy/src/learning/register-agents.ts`
- `packages/buddy/src/config/contract/schema.ts`
- `packages/web/src/state/chat-actions.ts`

Also relevant for persona-specific gating:

- `packages/buddy/src/learning/intents/practice/capabilities.ts`
- `packages/buddy/src/learning/intents/capabilities/tool-capabilities.ts`
- `packages/buddy/src/learning/intents/capabilities/skill-capabilities.ts`

## Where `code-buddy` and `math-buddy` Exist Today

Repo query used:

```bash
rg -l "code-buddy|math-buddy" packages/buddy/src packages/web/src | sort
```

Result (runtime + config + UI):

- `packages/buddy/src/config/contract/schema.ts`
- `packages/buddy/src/learning/intents/capabilities/skill-capabilities.ts`
- `packages/buddy/src/learning/intents/capabilities/tool-capabilities.ts`
- `packages/buddy/src/learning/intents/practice/capabilities.ts`
- `packages/buddy/src/learning/personas/code-buddy/agent.ts`
- `packages/buddy/src/learning/personas/code-buddy/overlay.p.md`
- `packages/buddy/src/learning/personas/math-buddy/agent.ts`
- `packages/buddy/src/learning/personas/math-buddy/overlay.p.md`
- `packages/buddy/src/learning/personas/registry.ts`
- `packages/buddy/src/learning/register-agents.ts`
- `packages/web/src/state/chat-actions.ts`

Pedagogy skill metadata also references persona IDs in frontmatter (`personas:`) under:

- `packages/buddy/src/learning/capabilities/pedagogy/skills/*/SKILL.md`

## Runtime Flow (How Persona Selection Actually Applies)

When a user selects `code-buddy`, `math-buddy`, or another persona:

1. Web composer sends `persona` with prompt/command payload.
   - File: `packages/web/src/state/chat-actions.ts`
2. Backend normalizes persona target and resolves mapped agent key.
   - File: `packages/buddy/src/learning/shared/targeting.ts`
3. Persona profile is loaded (`getBuddyPersona`) from registry + config overrides.
   - Files: `packages/buddy/src/learning/personas/catalog.ts`, `packages/buddy/src/learning/personas/registry.ts`
4. Capability profile is resolved by persona + intent + workspace state.
   - File: `packages/buddy/src/learning/resolve-capability-profile.ts`
5. System prompt is assembled with learner snapshot + runtime envelope.
   - File: `packages/buddy/src/learning/prompt/message-prompt-pipeline.ts`
6. Runtime session permissions are synced to the resolved capability envelope.
   - Files:
     - `packages/buddy/src/learning/agent-execution/permissions/session-permissions.ts`
     - `packages/buddy/src/learning/agent-execution/permissions/runtime-session-permissions.ts`
7. Request is proxied to vendored OpenCode with Buddy tools registered.
   - Files:
     - `packages/buddy/src/session/orchestration/proxy-transform.ts`
     - `packages/buddy/src/http/proxy/fetch.ts`

## Step-by-Step: Add a New Persona

Use this checklist in order.

### Minimal Expected Diff

For a straightforward new persona, the expected code changes are usually limited to:

- `packages/buddy/src/learning/personas/<persona-id>/agent.ts`
- `packages/buddy/src/learning/personas/<persona-id>/overlay.p.md`
- `packages/buddy/src/learning/personas/registry.ts`
- `packages/buddy/src/learning/register-agents.ts`
- `packages/buddy/src/config/contract/schema.ts`
- `packages/web/src/state/chat-actions.ts`
- focused tests in `packages/buddy/test/**` and, if frontend behavior changed, `packages/web/test/**`

If a persona add requires edits outside that area, stop and confirm why. A plain persona addition should not require unrelated package config changes, TypeScript project wiring changes, or random typecheck workarounds in other features.

### Step 1: Choose the Persona Contract

Decide these values first:

- `id`: kebab-case stable runtime key (example: `science-buddy`).
- `label`: UI label.
- `description`: short persona summary.
- `domain`: currently typed as `"general" | "coding" | "math"`.
- `defaultIntent`: one of `learn | practice | assess | auto`.
- `surfaces`: subset of `curriculum | editor | figure | question-set`.
- `defaultSurface`: must be included in `surfaces`.

If you need a new domain literal, update:

- `packages/buddy/src/learning/shared/runtime-types.ts`

### Step 2: Create Persona Prompt/Agent Files

Create a new folder:

- `packages/buddy/src/learning/personas/<persona-id>/`

Add files:

1. `agent.ts`
2. `overlay.p.md` (or a full prompt if this persona should not reuse Buddy base prompt)

Pattern to follow:

- `packages/buddy/src/learning/personas/code-buddy/agent.ts`
- `packages/buddy/src/learning/personas/math-buddy/agent.ts`

Your `agent.ts` must call `registerBuddyAgent({ key: "<persona-id>", agent: ... })`.

Before finishing the prompt overlay, verify that every named tool or subagent in the prose is real and actually available to that persona. Do not write generic instructions like "use the X tool" unless there is a concrete allowed tool with that exact behavior. If question-set creation is delegated through `question-set-author`, say that explicitly instead of implying the primary persona can call `save_question_set` directly.

### Step 3: Register Persona Profile in Registry

Edit:

- `packages/buddy/src/learning/personas/registry.ts`

Add the new entry to `BUILTIN_BUDDY_PERSONAS` with complete `PersonaDefinition` fields:

- `id`, `label`, `description`, `domain`
- `defaultIntent`
- `surfaces`, `defaultSurface`
- `hidden`
- `toolDefaults`
- `subagentDefaults`
- `contextPolicy`

Important: also update `builtinBuddyPersonas()` in the same file. It currently clones each persona explicitly (manual keys), so adding only `BUILTIN_BUDDY_PERSONAS` is not enough.

### Step 4: Import Persona Agent for Runtime Registration

Edit:

- `packages/buddy/src/learning/register-agents.ts`

Add side-effect import for your agent module:

```ts
import "./personas/<persona-id>/agent.js"
```

Without this import, the persona agent is never registered into Buddy's agent map.

### Step 5: Enable Persona Overrides in Config Schema

Edit:

- `packages/buddy/src/config/contract/schema.ts`

Add the new persona key under `ConfigSchema.Personas`:

```ts
export const Personas = z
  .object({
    buddy: PersonaOverride.optional(),
    "code-buddy": PersonaOverride.optional(),
    "math-buddy": PersonaOverride.optional(),
    "<persona-id>": PersonaOverride.optional(),
  })
  .strict()
```

If you skip this, `buddy.jsonc` cannot override/hide the new persona.

### Step 6: Update Frontend Hardcoded Persona Lists

Edit:

- `packages/web/src/state/chat-actions.ts`

Update all three:

1. `BUDDY_PERSONA_DEFAULT_ORDER`
2. `type LearnerPersona`
3. `LEARNER_PERSONAS`

Why this is required:

- `toLearnerPersona()` filters persona values for learner snapshot endpoints.
- If the new ID is missing here, some learner/capability requests drop the persona and fallback silently.

You do not need to hand-edit backend route enums such as `PERSONAS` in API schemas. Those derive from `registry.ts` through `teaching-vocabulary.ts`. The frontend list in `chat-actions.ts` is the main remaining hardcoded persona list.

### Step 7: Add Persona-Specific Capability Rules (Optional)

Only if the persona needs specialized behavior.

Possible files:

- `packages/buddy/src/learning/intents/practice/capabilities.ts`
- `packages/buddy/src/learning/intents/capabilities/tool-capabilities.ts`
- `packages/buddy/src/learning/intents/capabilities/skill-capabilities.ts`

Use persona filters (`personas: ["<persona-id>"]`) when a tool/skill should be gated to a subset.

### Step 8: Update Skill Frontmatter Persona Metadata (Optional but Recommended)

If your pedagogy skills declare `personas:` frontmatter, keep it aligned in:

- `packages/buddy/src/learning/capabilities/pedagogy/skills/*/SKILL.md`

### Step 9: Add/Update Tests

Find existing persona-dependent tests with:

```bash
rg -l "code-buddy|math-buddy" packages/buddy/test packages/web/test | sort
```

At minimum, update/add tests for:

- config validation and default persona behavior
- persona routing/targeting
- runtime capability profile and permissions
- frontend default ordering/type filtering

Treat this as required work, not cleanup. A persona change is incomplete if the relevant tests were not added or updated.

## Configuring Persona Behavior (No Code Changes)

Project config files are resolved from:

- `<workspace>/buddy.jsonc` (preferred)
- `<workspace>/buddy.json`

(see `packages/buddy/src/config/store/config-paths.ts`)

### Example: Make Code Buddy the Default

```jsonc
{
  "default_persona": "code-buddy",
  "default_intent": "practice"
}
```

### Example: Rename/Hide Personas and Adjust Surfaces

```jsonc
{
  "personas": {
    "code-buddy": {
      "label": "Code Coach",
      "description": "Hands-on coding coach",
      "surfaces": ["curriculum", "editor", "question-set"],
      "defaultSurface": "editor"
    },
    "math-buddy": {
      "hidden": true
    }
  }
}
```

### Example: Override Persona Agent Config

```jsonc
{
  "agent": {
    "code-buddy": {
      "description": "Code Buddy tuned for interview practice",
      "model": "openai/gpt-5.4-mini",
      "variant": "low",
      "permission": {
        "render_mermaid": "allow"
      }
    }
  }
}
```

Notes:

- `agent.<persona-id>` overlays Buddy defaults, it does not replace them entirely.
- Persona IDs map to agent keys using `resolveConfiguredAgentKey()`.

## Existing Persona Differences (Quick Reference)

### `code-buddy`

- Default intent: `practice`
- Surfaces: includes `editor`
- Prompt overlay emphasizes teaching workspace tools and checkpoint flow
- Enables teaching workspace tool defaults in registry and agent permissions

Primary files:

- `packages/buddy/src/learning/personas/code-buddy/agent.ts`
- `packages/buddy/src/learning/personas/code-buddy/overlay.p.md`
- `packages/buddy/src/learning/personas/registry.ts`

### `math-buddy`

- Default intent: `learn`
- Surfaces: includes `figure`
- Prompt overlay emphasizes math explanation + figure protocols + calculator usage
- Enables figure/math tooling; denies teaching workspace tools

Primary files:

- `packages/buddy/src/learning/personas/math-buddy/agent.ts`
- `packages/buddy/src/learning/personas/math-buddy/overlay.p.md`
- `packages/buddy/src/learning/personas/registry.ts`

## Gotchas

1. Default persona fallback order is not centralized.
   - Backend fallback uses derived `PERSONAS` order from registry keys.
   - Frontend fallback uses `BUDDY_PERSONA_DEFAULT_ORDER` in `chat-actions.ts`.
   - If you add a new ID, update frontend order deliberately.
2. `registry.ts` has two places to update for a new persona.
   - `BUILTIN_BUDDY_PERSONAS`
   - `builtinBuddyPersonas()` manual clone map
3. Config overrides are schema-locked.
   - New persona IDs must be added to `ConfigSchema.Personas`.
4. Generated files are not authoring points.
   - Do not edit generated SDK/router outputs for persona work.

## Validation Commands

Run after persona changes:

```bash
bun fmt
bun lint
bun typecheck
```

Run targeted tests for modified packages (do not run full suite per repo rules).
