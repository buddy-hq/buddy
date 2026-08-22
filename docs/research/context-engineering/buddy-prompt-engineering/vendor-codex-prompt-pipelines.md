# Vendor OpenCode and Codex Prompt Pipelines

This document compares two prompt-construction pipelines:

1. Vendored OpenCode in this repo (`vendor/opencode`)
2. The local Codex codebase at `~/Code/codex`

The goal is to understand how each pipeline handles the prompt-quality problems identified earlier:

- flat prompt concatenation
- weak separation between static identity and runtime context
- control-plane instructions delivered in the wrong role
- drift between runtime truth and prompt truth
- repeated full-context injection on every turn

## Summary

OpenCode uses a mostly flat system-prompt pipeline:

- agent prompt
- plus custom system text
- plus per-message system text
- optionally rewritten by plugins

Codex uses a layered Responses API pipeline:

- top-level `instructions` for stable base instructions
- typed `developer` messages for operational constraints and mode updates
- typed `user` messages for contextual user fragments such as `AGENTS.md`, skills, and environment context
- incremental update items instead of re-sending one giant rebuilt prompt every turn

From an agent-quality perspective, Codex is the stronger design. It gives the model cleaner role separation, better prompt stability, and more explicit handling of changing runtime state.

## 1. Vendored OpenCode Pipeline

### Core request shape

OpenCode accepts a user message with:

- `agent`
- optional `system`
- message `parts`

Relevant files:

- `vendor/opencode/packages/opencode/src/session/prompt.ts`
- `vendor/opencode/packages/opencode/src/session/message-v2.ts`
- `vendor/opencode/packages/opencode/src/session/llm.ts`

Buddy then writes additional teaching/runtime context into the outbound `system` string before handing the request to OpenCode.

Relevant Buddy files:

- `packages/buddy/src/learning/prompt/message-prompt-pipeline.ts`
- `packages/buddy/src/learning/prompt/system-prompt.ts`
- `packages/buddy/src/learning/prompt/turn-prompt.ts`

### OpenCode system assembly flow

Flow:

1. The selected agent is resolved.
2. OpenCode starts a `system: string[]`.
3. It concatenates:
   - `input.agent.prompt`
   - any `input.system`
   - any `input.user.system`
4. It pushes that joined string as the main system block.
5. Plugins may transform `system[]` through `experimental.chat.system.transform`.
6. The final `system[]` entries become `role: "system"` messages sent to the model.

Key implementation:

- `vendor/opencode/packages/opencode/src/session/llm.ts`
  - agent prompt is included first
  - `input.system` is appended
  - `input.user.system` is appended
  - plugin hook runs after assembly

### Concrete OpenCode pipeline

```text
PromptInput
  -> resolve agent
  -> build system[] from:
       agent.prompt
       + input.system
       + input.user.system
  -> plugin transforms system[]
  -> emit system role messages
  -> append conversation messages
  -> send to provider
```

### How Buddy extends this pipeline

Buddy adds a per-turn system string before OpenCode sees the request:

1. Resolve persona, intent, workspace state, resources, learner snapshot, and capability profile.
2. Build a Buddy runtime system block containing:
   - `<student_intent>`
   - `<buddy_runtime_context>`
3. Merge that with any existing request `system`.
4. Set the selected `agent`.
5. Insert a turn reminder as a synthetic user text part, not as system text.

Relevant files:

- `packages/buddy/src/learning/prompt/message-prompt-pipeline.ts`
- `packages/buddy/src/learning/prompt/learning-prompt.ts`
- `packages/buddy/src/learning/prompt/system-prompt.ts`
- `packages/buddy/src/learning/prompt/turn-prompt.ts`

### What OpenCode solves well

- It has a simple, easy-to-follow system pipeline.
- It supports plugin-time rewriting of system content.
- It can preserve a small two-part structure for caching after plugin transforms.

### What OpenCode does not solve well

- It still collapses multiple instruction sources into plain concatenated system text.
- There is no strong typed separation between:
  - static agent identity
  - runtime operating constraints
  - per-turn updates
  - user-supplied system text
- The model mostly receives a single flat instruction surface.
- Runtime truth can diverge from prompt prose because capability resolution happens elsewhere.
- Role choice is weak: important turn-control instructions can end up as synthetic user content instead of system-level control.

### Assessment against the earlier problems

Problem: flat concatenation  
Result: mostly not solved

Problem: static identity mixed with runtime context  
Result: mostly not solved

Problem: control-plane instructions in the wrong role  
Result: not solved by OpenCode itself; Buddy currently contributes to this by placing turn reminders in user parts

Problem: runtime truth vs prompt truth drift  
Result: not solved; runtime enforcement and prompt authoring are separate

Problem: prompt bloat from repeated rebuilding  
Result: partly mitigated by caching behavior, but the logical prompt still rebuilds as large flat text

## 2. Codex Pipeline

### Core request shape

Codex uses the Responses API request shape:

- top-level `instructions: String`
- `input: Vec<ResponseItem>`
- `tools`

Relevant files:

- `~/Code/codex/codex-rs/codex-api/src/common.rs`
- `~/Code/codex/codex-rs/core/src/client_common.rs`
- `~/Code/codex/codex-rs/core/src/client.rs`

This is the key structural difference from OpenCode. Codex does not flatten everything into one system string.

### Base instructions resolution

Codex resolves stable base instructions once at session configuration time with explicit precedence:

1. `config.base_instructions`
2. saved conversation/session base instructions
3. model default instructions

Relevant file:

- `~/Code/codex/codex-rs/core/src/codex.rs`

This becomes `session_configuration.base_instructions`.

### Developer and contextual-user layering

For each turn, Codex builds initial context as typed message items, not one giant string.

It accumulates `developer_sections` for:

- model-switch updates
- permission/sandbox instructions
- developer instructions from config
- memory-tool instructions
- collaboration-mode instructions
- realtime updates
- personality updates
- apps section
- skills section
- plugins section
- commit trailer instructions

It accumulates `contextual_user_sections` for:

- `AGENTS.md` project instructions
- environment context
- subagent context

Relevant file:

- `~/Code/codex/codex-rs/core/src/codex.rs`

Then it emits:

- one `developer` message containing aggregated developer sections
- one `user` message containing contextual user sections

Relevant helper:

- `~/Code/codex/codex-rs/core/src/context_manager/updates.rs`

### Contextual user fragments

Codex treats certain injected user messages as structured contextual fragments, not ordinary conversation:

- `AGENTS.md`
- skills
- environment context
- shell command wrappers
- turn-aborted notices
- subagent notifications

Relevant files:

- `~/Code/codex/codex-rs/instructions/src/fragment.rs`
- `~/Code/codex/codex-rs/instructions/src/user_instructions.rs`
- `~/Code/codex/codex-rs/core/src/contextual_user_message.rs`

Notable design choice:

- `AGENTS.md` and skill payloads are excluded from memory-generation inputs because they are prompt scaffolding, not actual conversation content.

That is a strong prompt-hygiene decision.

### Incremental updates

Codex also has update-item builders for later turns:

- environment diffs
- permission diffs
- collaboration mode diffs
- realtime diffs
- personality diffs
- model-switch diffs

Relevant file:

- `~/Code/codex/codex-rs/core/src/context_manager/updates.rs`

This means Codex does not need to fully restate every instruction layer every turn. It can emit updates when state changes.

### Concrete Codex pipeline

```text
Session start / resume
  -> derive config
  -> resolve base instructions precedence
  -> store session configuration

Turn start
  -> build initial or diff context items
     -> developer role items for operational policy
     -> user role items for contextual fragments
  -> build Prompt {
       base_instructions,
       input ResponseItems,
       model-visible tools
     }
  -> convert to ResponsesApiRequest:
       instructions = base_instructions.text
       input = formatted ResponseItems
       tools = model-visible tools
  -> send to model
```

### How Codex solves the earlier problems

Problem: flat concatenation  
Result: mostly solved

- Stable base instructions live in top-level `instructions`.
- Runtime and operational context live in typed `ResponseItem`s.
- Context is not reduced to a single concatenated system string.

Problem: static identity mixed with runtime context  
Result: mostly solved

- Base instructions are separated from per-turn developer updates.
- Contextual repo and environment information is not mixed into the same top-level instruction string.

Problem: control-plane instructions in the wrong role  
Result: mostly solved

- Operational policy changes are emitted as `developer` messages.
- Contextual scaffolding such as `AGENTS.md` is emitted as a special user fragment.
- This is a more defensible role split than injecting operational turn deltas as user text.

Problem: runtime truth vs prompt truth drift  
Result: partially solved

- Codex still contains authored instruction prose.
- But it reduces drift by generating many runtime-specific updates from structured turn state rather than relying only on hand-written prompt overlays.

Problem: prompt bloat from repeated rebuilding  
Result: better solved

- Codex has explicit diff/update machinery for model-visible context changes.
- It does not need to fully restate all operational instructions every turn.

## 3. Direct Comparison

### OpenCode / Buddy shape

```text
agent prompt
+ runtime system string
+ optional extra system strings
+ plugin rewrite
= final system prompt
```

Strength:

- simple

Weakness:

- too flat

### Codex shape

```text
base instructions
+ developer messages
+ contextual user messages
+ normal user message
+ typed tool/result history
= final request
```

Strengths:

- explicit layering
- role separation
- incremental updates
- contextual fragments are typed and recognizable
- prompt scaffolding can be excluded from memory stages

Weakness:

- more moving parts
- more state-management complexity

## 4. What Buddy Should Borrow

If Buddy wants higher agent quality, the most useful ideas to borrow are from Codex, not from raw OpenCode.

### Improvements Buddy should copy first

1. Separate stable base instructions from per-turn runtime context.
   - Keep persona identity in the static agent prompt.
   - Move turn/runtime updates into separately generated structured sections or separate model-visible messages.

2. Put operational control in the developer/system layer.
   - Persona switches, intent switches, workspace switches, and checkpoint warnings should not be synthetic user text.

3. Introduce a generated runtime-capability section from actual resolved capability state.
   - Surfaces
   - allowed/preferred subagents
   - important tools
   - runtime availability such as calculator readiness

4. Add explicit contextual-fragment handling.
   - Reading-resource context
   - teaching-workspace context
   - repo/project instructions
   should be marked as structured context rather than mixed into arbitrary prose.

5. Move toward update/diff injection instead of full prompt rebuilds.
   - Only emit changed runtime instructions when state changes.

### Improvements Buddy does not need to copy directly

- Codex's exact Responses API object model
- Codex's full collaboration-mode system
- Codex's full memory and plugin architecture

Buddy does not need all of Codex's machinery. But it should copy the prompt-layering principles.

## 5. Bottom Line

OpenCode provides a straightforward agent-prompt plus system-prompt pipeline, but it does not meaningfully solve the prompt-quality problems caused by flat concatenation.

Codex solves these problems better because it:

- separates stable base instructions from dynamic runtime context
- uses typed `developer` and contextual `user` messages
- injects structured contextual fragments with markers
- updates prompt-visible runtime state incrementally
- keeps some prompt scaffolding out of later memory generation

If Buddy wants better prompt quality, the practical direction is:

- less flat text concatenation
- more typed runtime/context layers
- better role discipline
- more generated truth from runtime state
- fewer prose-only capability claims
