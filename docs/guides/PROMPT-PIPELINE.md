# Buddy Prompt Pipeline

This is the current Buddy-owned prompt path from persona authoring to final runtime merge.

## 1. Persona Prompt Authoring

- Persona prompt files live in `packages/buddy/src/learning/personas/prompts/*.p.md`.
- Persona definitions live in `packages/buddy/src/learning/personas/*.ts`.
- Persona registration lives in `packages/buddy/src/learning/personas/registered-personas.ts`.
- Base prompt + persona prompt are merged in `packages/buddy/src/learning/personas/wiring/define-buddy-persona.ts`.
- Final agent prompt is exposed through `packages/buddy/src/learning/personas/wiring/persona.orchestration.ts`.

## 2. Buddy Prompt Compiler

- Single Buddy-owned entrypoint:
  - `packages/buddy/src/learning/prompt/buddy-prompt-compiler.ts`
- Buddy runtime input resolver:
  - `packages/buddy/src/learning/prompt/resolve-buddy-prompt-context.ts`
- Shared prompt types:
  - `packages/buddy/src/learning/prompt/contracts.ts`

`buildBuddyPromptEnvelope(ctx)` returns:

- `systemContext`
- `userPreludeParts`
- `changedSinceCheckpoint`

## 3. Buddy System Context

Built in `packages/buddy/src/learning/prompt/runtime-context.ts`.

Output shape:

- `<buddy_runtime_context>` containing:
  - `<workspace_state>`
  - `<model_limits>` when model info exists
  - `<calculator_runtime>` when `python_calculator` is allowed
  - `<notebook_resources>`
  - `<active_reading_resource>` when active reading context exists
  - `<learner_state>`
  - `<learner_progress>`
  - `<learner_feedback>`
  - `<teaching_policy>` when the persona has editor surface access
  - `<teaching_workspace>` when an interactive teaching workspace is active

The teaching workspace policy prompt file is now wired here:

- `packages/buddy/src/learning/prompt/teaching-workspace-policy.p.md`

## 4. Buddy User Prelude

Built in `packages/buddy/src/learning/prompt/user-prelude.ts`.

This is user-message prelude text, not system text.

Possible reminder lines:

- teaching focus switch
- persona switch
- workspace switch
- unaccepted checkpoint changes

It is emitted as synthetic user text parts.

## 5. Request Transform

- HTTP entrypoint:
  - `packages/buddy/src/session/orchestration/interaction-actions.ts`
- Learning transform orchestration:
  - `packages/buddy/src/learning/agent-execution/transforms/message-transform-orchestration.ts`
- Core request transform:
  - `packages/buddy/src/learning/prompt/message-prompt-pipeline.ts`

`message-prompt-pipeline.ts` now does orchestration only:

- normalize prompt parts
- resolve prompt runtime inputs through `resolve-buddy-prompt-context.ts`
- call `buildBuddyPromptEnvelope(ctx)`
- write:
  - `transformed.system = existing system + Buddy systemContext`
  - `transformed.parts = userPreludeParts + user parts`
  - `transformed.agent = resolved agent`

## 6. Vendor Runtime Merge

OpenCode performs the final merge in:

- `vendor/opencode/packages/opencode/src/session/prompt.ts`
- `vendor/opencode/packages/opencode/src/session/llm.ts`

Final instruction order remains:

1. agent prompt
2. runtime system segments
3. Buddy per-turn system context

The Buddy user prelude stays in the conversation as user content before the user-authored parts.
