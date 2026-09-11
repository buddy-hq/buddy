# Buddy Prompt Guide

This guide explains how the current Buddy prompt pipeline is organized, what each layer owns, and where to make changes.

Stacking, cache-prefix rules, and FCI placement also live in `packages/buddy/src/learning/prompt/AGENTS.md`. This file is the authoring/debugging map.

## Goal

The prompt system is split into three Buddy-owned layers:

1. persona prompt
2. per-turn system context (`<buddy_runtime_context>`)
3. per-turn user prelude

Those layers are assembled by one Buddy entrypoint:

- `packages/buddy/src/learning/prompt/buddy-prompt-compiler.ts`

## Mental Model

Use this rule:

- Long-lived behavior belongs in the persona prompt.
- Structured runtime state belongs in system context.
- Short transient steering belongs in user prelude.

If you keep those boundaries clean, the pipeline stays understandable.

## Current Flow

### 1. Persona Prompt

Files:

- `packages/buddy/src/learning/personas/prompts/*.p.md`
- `packages/buddy/src/learning/personas/prompts/render-persona-prompt.ts`
- `packages/buddy/src/learning/personas/*.ts`
- `packages/buddy/src/learning/personas/wiring/define-buddy-persona.ts`
- `packages/buddy/src/learning/personas/wiring/persona.orchestration.ts`

What happens:

- Persona documents are composed with `renderBuddyPersonaPrompt(...)` (section includes under `prompts/sections/`).
- `defineBuddyPersona` stores the resulting string on `runtime.prompt`.
- That string becomes the OpenCode agent prompt.

This is the agent-level instruction layer. There is no `base.p.md` merge inside `define-buddy-persona.ts`.

### 2. Buddy Prompt Compiler

Files:

- `packages/buddy/src/learning/prompt/buddy-prompt-compiler.ts`
- `packages/buddy/src/learning/prompt/context.ts` (`PromptContext`, `createPromptContext`)

What happens:

- `createPromptContext` gathers Buddy-owned runtime inputs for one turn.
- `buildBuddyPromptEnvelope(input)` returns:
  - `systemContext`
  - `userPreludeParts`
  - `changedSinceCheckpoint`
  - turn-context delivery fingerprints
  - optional `deliveredLearnerContext`

This is the only Buddy public entrypoint for turn-level prompt assembly.

These files do **not** exist: `resolve-buddy-prompt-context.ts`, `contracts.ts`.

### 3. System Context

Directory:

- `packages/buddy/src/learning/prompt/runtime-context/` (`buildBuddyRuntimeContext` in `index.ts`)

What it owns:

- `<buddy_runtime_context>` wrapping the rendered sections

Shipped section modules (see `RUNTIME_SECTIONS` in `runtime-context/index.ts`):

- feature instructions
- `<workspace_state>`
- `<model_limits>`
- `<personalization>`
- `<calculator_runtime>` when the calculator path is in play
- `<active_reading_resource>` / `<notebook_resources>` / `<about_resources>`
- teaching policy / `<teaching_workspace>` when editor/workspace context applies

Learner state/progress/feedback templates still exist under `runtime-context/learner-context/`, but turn-time learner delivery is decided in the compiler and emitted with the prelude, not as a duplicate runtime-context dump. Follow `AGENTS.md` for FCI vs prefix placement.

### 4. User Prelude

Directory:

- `packages/buddy/src/learning/prompt/user-prelude/` (`buildBuddyUserPrelude` in `index.ts`)

What it owns:

- short synthetic reminder text inserted ahead of the user-authored parts
- reading / teaching / bench turn-context blocks and unchanged refs
- checkpoint and learner-memory reminders
- concise-response / turn-transition reminders

### 5. Request Transform

File:

- `packages/buddy/src/learning/prompt/message-prompt-pipeline.ts`

What it owns:

- normalize prompt parts
- resolve target agent
- call `createPromptContext` then the compiler
- write transformed request fields

HTTP/orchestration wiring also includes:

- `packages/buddy/src/session/orchestration/interaction-actions.ts`
- `packages/buddy/src/learning/agent-execution/transforms/message-transform-orchestration.ts`

The pipeline should not own prompt content policy beyond wiring.

### 6. Vendor Merge

Files:

- `vendor/opencode/packages/opencode/src/session/prompt.ts`
- `vendor/opencode/packages/opencode/src/session/llm.ts`

Final merge order remains:

1. agent prompt
2. runtime system segments
3. Buddy per-turn system context

The Buddy user prelude stays in the conversation as user message content.

## Where To Change Things

### Change persona behavior

Edit persona prompt documents and `render-persona-prompt.ts`, then the persona module's `runtime.prompt`. See [persona-authoring-guide-v2.md](./persona-authoring-guide-v2.md).

Do not edit the prompt pipeline for persona-only behavior.

### Change structured runtime context

Edit the matching module under `packages/buddy/src/learning/prompt/runtime-context/` and `index.t.md` if the wrapper changes.

### Change transient turn reminders

Edit `packages/buddy/src/learning/prompt/user-prelude/`.

### Change what data is available to prompt assembly

Edit `packages/buddy/src/learning/prompt/context.ts` (and callers of `createPromptContext`).

### Change final vendor system merge

Edit only if absolutely necessary:

- `vendor/opencode/packages/opencode/src/session/llm.ts`

This should be rare. Most Buddy prompt changes should stay in Buddy-owned files.

## Common Tasks

### Add a new system context block

1. Add the data to `PromptContext` in `context.ts` if needed.
2. Resolve that data in `createPromptContext`.
3. Add a section module under `runtime-context/` and register it in `RUNTIME_SECTIONS`.

### Add a new reminder

1. Add the condition in `user-prelude/`.
2. Keep it short.
3. Do not move durable runtime policy into user prelude.

### Add a new persona

Follow [persona-authoring-guide-v2.md](./persona-authoring-guide-v2.md). There is no `registered-personas.ts`.

The prompt pipeline should not need changes for a normal new persona.

## Debugging Questions

When something looks wrong, ask these in order:

1. Is this supposed to be persona prompt, system context, or user prelude?
2. Is the data missing from `createPromptContext` / `message-prompt-pipeline.ts`, or only rendered incorrectly?
3. Is the issue Buddy-owned, or is it in vendor final merge?

Fast mapping:

- wrong base behavior -> persona prompt
- wrong runtime state block -> runtime context
- wrong switch/reminder text -> user prelude
- wrong final position in conversation -> vendor merge or request transform

## Invariants

- `buddy-prompt-compiler.ts` is the only Buddy public prompt assembly entrypoint.
- `message-prompt-pipeline.ts` orchestrates; it should not become a prompt-content dump.
- `context.ts` / `createPromptContext` gathers Buddy runtime inputs; keep data resolution there.
- Persona prompts own durable behavior.
- Runtime context owns structured state that is safe for the cache prefix.
- User prelude owns short transient reminders and change-only turn context.

If a change breaks those rules, the architecture is drifting again.
