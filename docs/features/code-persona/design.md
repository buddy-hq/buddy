# Code Persona Design

## Intent

The Code persona exists to make Buddy practical to dogfood during everyday development.

The original problem was simple: most development time was spent coding outside Buddy, which made
it difficult to keep a local Buddy build running and exercise the product continuously. Adding a
coding persona makes Buddy itself useful for that work. Development can happen inside Buddy while
the same activity naturally tests the app's chat, model selection, streaming, tools, permissions,
subagents, attachments, session lifecycle, and workspace surfaces.

This is a dogfooding mechanism, not a new production persona. Its value comes from increasing the
amount of real work performed in a local development build rather than relying only on deliberate
test sessions.

## Goals

- Make the local development build useful for normal coding work.
- Increase sustained, realistic use of Buddy while Buddy is being developed.
- Reuse OpenCode's coding behavior instead of recreating a separate coding agent.
- Keep Buddy's tools, skills, subagents, and surfaces available so coding work exercises Buddy's
  integrations.
- Keep the persona out of beta and production user flows.

## Non-goals

- Shipping a general coding persona to production users.
- Replacing the Buddy or Teaching Buddy personas.
- Designing a separate coding-specific product surface.
- Adding coding instructions to the normal Buddy base prompt.
- Guaranteeing that development Code sessions can be migrated into production.

## Current design

### First-class persona

Code is registered as a normal Buddy persona with the ID `code`. It participates in the same
persona registry, runtime-agent compilation, targeting, session state, permissions, and catalog
machinery as the production personas.

The shared vocabulary separates personas into two groups:

- Production personas: `buddy` and `teaching-buddy`
- Development personas: `code`

Using the existing persona architecture keeps the dogfooding path representative of the product
instead of introducing a parallel development-only agent system.

### Prompt composition

The Code runtime prompt is composed from:

1. OpenCode's GPT coding system prompt.
2. A short Buddy avatar overlay explaining that the agent is running inside Buddy and may have
   additional Buddy tools.

Code intentionally does not receive Buddy's normal base persona prompt. To support that distinction,
prompt rendering now happens explicitly at each persona definition: Buddy and Teaching Buddy render
the Buddy base prompt, while Code supplies its complete OpenCode-derived prompt.

This preserves OpenCode's coding behavior while giving the model enough context to understand why
Buddy-specific capabilities are present.

### Buddy capabilities and context

Code uses `BUDDY_SHARED_FEATURES`, so it can exercise the same shared tools, skills, surfaces, and
delegated capabilities available through Buddy's feature system.

Its context policy intentionally avoids attaching learning-oriented state:

- curriculum context: off
- learner progress: off
- teaching workspace context: off
- teaching policy: off
- figure context: on

Its configured subagents are:

- `general`
- `question-set-author`
- `flashcard-author`

The coding prompt remains focused while the broader Buddy capability graph stays available for
dogfooding.

### Development-only availability

The backend decides whether development personas are available from the compiled OpenCode
installation channel, with `BUDDY_CHANNEL` as the fallback for an unbundled local backend:

- development channel: Code is available
- beta or production channel: Code is forced hidden

Forcing the profile hidden after applying project overrides prevents configuration from making Code
visible in production catalogs. Explicit production requests targeting a hidden Code persona are
also rejected.

The frontend independently enables development UI when Vite is running in development or the
packaged Buddy channel is `dev`. It also filters Code from selectable persona options outside that
mode. These frontend checks are a presentation guard; backend availability remains the authoritative
runtime boundary.

### Persona selection

In a development build, the prompt composer shows a persona selector when multiple selectable
personas are present. Choosing Code stores the selection for the current session scope. Subsequent
prompts send that persona through the normal Buddy prompt and session pipeline.

This makes switching between Buddy, Teaching Buddy, and Code lightweight while keeping the selected
persona associated with the active conversation.

## Why this approach

The design deliberately favors reuse:

- A persona is already Buddy's unit for prompts, features, tools, skills, subagents, context policy,
  and surfaces.
- OpenCode already supplies the coding prompt and runtime behavior.
- The existing prompt composer and session pipeline already support persona targeting.
- Channel-aware visibility keeps the dogfooding feature out of normal production UX.

The result is a relatively small development-only addition that exercises the real product path.
That is more useful for dogfooding than a debug-only chat mode with separate wiring.

## Expected dogfooding value

Using Code for daily development should expose failures that short manual test sessions often miss,
including:

- long-running session and streaming behavior
- model and thinking-level changes
- prompt submission and steering
- tool permissions and failures
- subagent delegation
- attachment and native-resource handling
- reconnects, restarts, and persisted session state
- performance degradation during sustained use
- friction in Buddy's surrounding workspace UI

The primary success criterion is simple: Buddy remains open and useful during real development work,
causing product problems to be encountered naturally and earlier.

## Known limitations

The current non-blocking limitations are tracked in
[known-issues.md](./known-issues.md), including persisted development session targeting and
release-channel-dependent persona tests.
