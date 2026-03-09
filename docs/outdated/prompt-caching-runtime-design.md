# Prompt Caching and Teaching Runtime

## Why this refactor exists

Buddy was rebuilding volatile teaching state into the per-turn system prompt. In OpenCode that dynamic `user.system` content is placed before the full chat history, which breaks prompt-prefix caching for every turn where learner state or routing output changes.

The new design keeps the teacher agent in control while preserving cache reuse:

- the stable Buddy header stays in `system`
- the volatile teaching packet moves into the current user message `parts`
- learner-facing sidebar suggestions stay advisory and do not silently route the agent

## Prompt shape

### Stable header

The stable header is persona-scoped and should only change when the effective teacher changes.

It contains:

- persona identity
- stable teaching principles
- stable tool/sub-agent usage guidance
- stable teaching-workspace policy when the persona supports editor lessons

It must not contain turn-local learner state, suggested next actions, or backend-owned routing decisions.

### Turn context packet

The turn context packet is appended to the current user message so it remains after the cached conversation prefix.

It contains:

- workspace/editor/figure state
- explicit user overrides such as intent and focus goals
- learner summary and progress summary
- teaching workspace snapshot when an editor lesson is active
- dynamic cautions such as completion-claim verification and checkpoint status

It must not contain hidden routing instructions derived from sidebar suggestions.

## Runtime control split

- Agent path: history + learner state + capability envelope + explicit user overrides
- Suggestion path: learner sequencing and curriculum heuristics for the right sidebar and prompt shortcuts
- Hard constraints: persona/environment/safety only

The backend no longer decides the next teaching maneuver. It compiles context and permissions; the teacher agent decides how to teach.
