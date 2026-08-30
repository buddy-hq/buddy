# Code Persona Design

## Intent

The Code persona exists to make Buddy practical to dogfood during everyday development.

Most development time is spent coding. Adding a coding persona allows development to happen inside Buddy, naturally exercising chat, model selection, streaming, tools, permissions, subagents, attachments, session lifecycle, and workspace surfaces during real daily work rather than relying solely on deliberate test sessions.

This is a dogfooding mechanism, not a production persona.

## Goals

- Make local development builds useful for daily coding work.
- Increase sustained, realistic use of Buddy during internal development.
- Reuse OpenCode's coding behavior rather than recreating a separate agent.
- Keep Buddy's tools, skills, subagents, and surfaces available for dogfooding.
- Keep the persona hidden from beta and production user flows.

## Non-goals

- Shipping a general coding persona to production users.
- Replacing the Buddy or Teaching Buddy personas.
- Designing a separate coding-specific product surface.
- Adding coding instructions to the standard Buddy base prompt.
- Guaranteeing migration of development Code sessions into production.

## Architecture and channel hiding

### First-class persona registration

Code is registered as a normal Buddy persona (`code`). It participates in the standard persona registry, runtime-agent compilation, targeting, session state, and permissions:

- **Production personas**: `buddy`, `teaching-buddy`
- **Development personas**: `code`

### Prompt composition

The Code prompt is composed from:

1. OpenCode's GPT coding system prompt.
2. A short Buddy avatar overlay explaining that the agent runs inside Buddy with additional Buddy tools.

Code intentionally does not receive Buddy's base persona prompt. Prompt rendering is explicit at each persona definition: Buddy and Teaching Buddy render the Buddy base prompt, while Code supplies its complete OpenCode-derived prompt. This preserves OpenCode's coding behavior while explaining why Buddy capabilities are present.

### Buddy capabilities, context, and delegates

Code uses `BUDDY_SHARED_FEATURES`, so it can exercise the same shared tools, skills, surfaces, and delegated capabilities available through Buddy's feature system. Its context policy keeps learning-oriented state out of coding sessions:

- curriculum context (`attachCurriculum`): off
- learner progress (`attachProgress`): off
- teaching workspace context (`attachTeachingWorkspace`): off
- teaching policy (`attachTeachingPolicy`): off
- figure context (`attachFigureContext`): on

Its configured subagents are `general`, `question-set-author`, and `flashcard-author`.

### Channel-enforced visibility

The backend determines development persona availability from the compiled OpenCode installation channel (falling back to `BUDDY_CHANNEL`):

- **Development channel**: Code is available in the catalog.
- **Beta / Production channel**: Code is forced hidden. Explicit production requests targeting Code are rejected.

The availability pass runs after project persona overrides, so a `hidden: false` override cannot make Code visible in a beta or production catalog. The frontend independently checks development mode / dev channel to filter Code from production UI, but backend availability remains the authoritative runtime boundary.

### Persona selection

In a development build, the prompt composer shows a persona selector when multiple selectable personas are present. Choosing Code stores the selection for the current session scope; subsequent prompts send that persona through the normal Buddy prompt and session pipeline. This keeps switching lightweight while associating the choice with the active conversation.

## Why this approach

The design deliberately favors reuse:

- A persona is already Buddy's unit for prompts, features, tools, skills, subagents, context policy, and surfaces.
- OpenCode already supplies the coding prompt and runtime behavior.
- The existing prompt composer and session pipeline already support persona targeting.
- Channel-aware visibility keeps dogfooding out of normal production UX.

That is more useful for dogfooding than a debug-only chat mode with separate wiring.

## Expected dogfooding value

Using Code for daily development should expose failures that short manual test sessions often miss:

- long-running session and streaming behavior
- model and thinking-level changes
- prompt submission and steering
- tool permissions and failures
- subagent delegation
- attachment and native-resource handling
- reconnects, restarts, and persisted session state
- performance degradation during sustained use
- friction in Buddy's surrounding workspace UI

The success criterion is simple: Buddy remains open and useful during real development work, causing product problems to be encountered naturally and earlier.

## Known limitations

Non-blocking limitations are tracked in [known-issues.md](./known-issues.md), including persisted development session targeting and release-channel-dependent persona tests.
