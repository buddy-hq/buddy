# Buddy Prompt Guide

This guide explains how the current Buddy prompt pipeline is organized, what each layer owns, and where to make changes.

## Goal

The prompt system is split into three Buddy-owned layers:

1. persona prompt
2. per-turn system context
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
- `packages/buddy/src/learning/personas/*.ts`
- `packages/buddy/src/learning/personas/wiring/define-buddy-persona.ts`
- `packages/buddy/src/learning/personas/wiring/persona.orchestration.ts`

What happens:

- `base.p.md` and the persona-specific prompt are merged in `define-buddy-persona.ts`.
- The merged result becomes the runtime agent prompt.

This is the agent-level instruction layer.

### 2. Buddy Prompt Compiler

Files:

- `packages/buddy/src/learning/prompt/buddy-prompt-compiler.ts`
- `packages/buddy/src/learning/prompt/resolve-buddy-prompt-context.ts`
- `packages/buddy/src/learning/prompt/contracts.ts`

What happens:

- `resolve-buddy-prompt-context.ts` gathers the Buddy-owned runtime inputs for one turn.
- `buildBuddyPromptEnvelope(ctx)` receives all Buddy runtime inputs for one turn.
- It returns:
  - `systemContext`
  - `userPreludeParts`
  - `changedSinceCheckpoint`

This is the only Buddy public entrypoint for turn-level prompt assembly.

### 3. System Context

File:

- `packages/buddy/src/learning/prompt/runtime-context.ts`

What it owns:

- `<student_intent>`
- `<buddy_runtime_context>`

Current runtime sections:

- `<workspace_state>`
- `<model_limits>` when model info exists
- `<calculator_runtime>` when `python_calculator` is allowed
- `<notebook_resources>`
- `<active_reading_resource>` when reading context exists
- `<learner_state>`
- `<learner_progress>`
- `<learner_feedback>`
- `<teaching_policy>` when the persona has editor surface access
- `<teaching_workspace>` when an interactive teaching workspace is active

Use this file when you need to change structured runtime context.

### 4. User Prelude

File:

- `packages/buddy/src/learning/prompt/user-prelude.ts`

What it owns:

- short synthetic reminder text inserted ahead of the user-authored parts

Current reminder types:

- teaching focus switch
- persona switch
- intent switch
- workspace switch
- unaccepted checkpoint changes

Use this file when you need to change short transition or reminder text.

### 5. Request Transform

File:

- `packages/buddy/src/learning/prompt/message-prompt-pipeline.ts`

What it owns:

- normalize prompt parts
- resolve target agent
- call `resolve-buddy-prompt-context.ts`
- call the compiler
- write transformed request fields

It should not own prompt content policy beyond wiring.

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

Edit:

- `packages/buddy/src/learning/personas/prompts/base.p.md`
- `packages/buddy/src/learning/personas/prompts/<persona>.p.md`

Do not edit the prompt pipeline for persona-only behavior.

### Change structured runtime context

Edit:

- `packages/buddy/src/learning/prompt/runtime-context.ts`

Examples:

- add a new runtime XML block
- change learner/resource/model context wording
- change when teaching policy is included

### Change transient turn reminders

Edit:

- `packages/buddy/src/learning/prompt/user-prelude.ts`

Examples:

- change switch messaging
- add a new reminder based on turn transitions
- remove noisy reminder text

### Change what data is available to prompt assembly

Edit:

- `packages/buddy/src/learning/prompt/contracts.ts`
- `packages/buddy/src/learning/prompt/resolve-buddy-prompt-context.ts`

Examples:

- new context field
- new resolved runtime input
- new model/resource/session metadata

### Change final vendor system merge

Edit only if absolutely necessary:

- `vendor/opencode/packages/opencode/src/session/llm.ts`

This should be rare. Most Buddy prompt changes should stay in Buddy-owned files.

## Common Tasks

### Add a new system context block

1. Add the data to `BuddyPromptBuildContext` if needed.
2. Resolve that data in `resolve-buddy-prompt-context.ts`.
3. Render the block in `runtime-context.ts`.
4. Update `PROMPT-PIPELINE.md` if the shape changed.

### Add a new reminder

1. Add the condition in `user-prelude.ts`.
2. Keep it short.
3. Do not move durable runtime policy into user prelude.

### Add a new persona

1. Add prompt file under `personas/prompts/`.
2. Add persona definition under `personas/`.
3. Register it in `registered-personas.ts`.

The prompt pipeline should not need changes for a normal new persona.

## Debugging Questions

When something looks wrong, ask these in order:

1. Is this supposed to be persona prompt, system context, or user prelude?
2. Is the data missing from `message-prompt-pipeline.ts`, or only rendered incorrectly?
3. Is the issue Buddy-owned, or is it in vendor final merge?

Fast mapping:

- wrong base behavior -> persona prompt
- wrong runtime state block -> runtime context
- wrong switch/reminder text -> user prelude
- wrong final position in conversation -> vendor merge or request transform

## Invariants

- `buddy-prompt-compiler.ts` is the only Buddy public prompt assembly entrypoint.
- `message-prompt-pipeline.ts` orchestrates; it should not become a prompt-content dump.
- `resolve-buddy-prompt-context.ts` gathers Buddy runtime inputs; keep data resolution there.
- Persona prompts own durable behavior.
- Runtime context owns structured state.
- User prelude owns short transient reminders.

If a change breaks those rules, the architecture is drifting again.
