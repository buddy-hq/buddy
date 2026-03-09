# What Changes the Top-Level System Prompt (Verified)

This note answers one precise question for both OpenCode and Codex:

"What changes the *top-level system prompt* (the instruction content injected before all messages)?"

It is intentionally not a list of *all* context changes, only the ones that change the top-level system/header layer.

## Definitions

- **OpenCode top-level system prompt**: the single `system[0]` string constructed in `LLM.stream`.
- **Codex top-level system prompt**: the `instructions` string field in the request payload (Responses API style), which is injected before the `input` messages array.

## OpenCode: What Changes the Top-Level System Prompt

OpenCode constructs `system[0]` as:

1. `agent.prompt` OR provider template (`SystemPrompt.provider(model)`)
2. `input.system` (environment + instruction files + optional structured-output instruction)
3. `input.user.system` (turn-level system text)

**Source of truth:**

- Assembly: `~/code/opencode/packages/opencode/src/session/llm.ts:67-80`
- Environment: `~/code/opencode/packages/opencode/src/session/system.ts:29-53`
- System list build: `~/code/opencode/packages/opencode/src/session/prompt.ts:651-655`

### Changes that mutate `system[0]`

1) **Model id changes**
- Changes provider template selection (`beast` vs `codex_header` etc.)
- `~/code/opencode/packages/opencode/src/session/system.ts:19-27`

2) **Agent changes (when the agent has `prompt` set)**
- If `agent.prompt` is present, it replaces provider template at the top
- `~/code/opencode/packages/opencode/src/session/llm.ts:72`
- Example: `explore` defines a prompt
  - `~/code/opencode/packages/opencode/src/agent/agent.ts:152`

3) **Environment changes (because env is in `input.system`)**
- Any of these changing will change `system[0]`:
  - `Working directory` (`Instance.directory`)
  - `Is directory a git repo`
  - `Platform`
  - `Today's date` (`new Date().toDateString()`)
- `~/code/opencode/packages/opencode/src/session/system.ts:33-40`

4) **Instruction sources change**
- Any change in what `InstructionPrompt.system()` loads (AGENTS/CLAUDE/CONTEXT/global/configured URL instructions) changes `input.system`, thus changes `system[0]`.
- `~/code/opencode/packages/opencode/src/session/prompt.ts:651`
- Loader implementation: `~/code/opencode/packages/opencode/src/session/instruction.ts`

5) **Structured output mode toggles (`json_schema`)**
- Adds/removes `STRUCTURED_OUTPUT_SYSTEM_PROMPT` inside `input.system`.
- `~/code/opencode/packages/opencode/src/session/prompt.ts:653-655`

6) **Turn-level system text (`input.user.system`)**
- Appended into `system[0]`.
- `~/code/opencode/packages/opencode/src/session/llm.ts:76`

7) **Plugins mutating system**
- Plugins can rewrite `system` via `experimental.chat.system.transform`.
- `~/code/opencode/packages/opencode/src/session/llm.ts:83-87`

### What does NOT change OpenCode top-level system prompt

Plan/build reminders are typically injected into the **user message stream**, not the system header.

**Source:** `~/code/opencode/packages/opencode/src/session/prompt.ts:1326-1347`

Example reminder text (`build-switch.txt`):

```xml
<system-reminder>
Your operational mode has changed from plan to build.
You are no longer in read-only mode.
You are permitted to make file changes, run shell commands, and utilize your arsenal of tools as needed.
</system-reminder>
```

**Source:** `~/code/opencode/packages/opencode/src/session/prompt/build-switch.txt:1-5`

This reminder affects overall prompt content (and therefore caching *after the insertion point*), but it is not a mutation of the top-level system header.

## Codex: What Changes the Top-Level System Prompt

In Codex, the top-level injected instruction string is the request field `instructions`.

Codex constructs request payloads where:

- `instructions` is derived from session `base_instructions` (and sometimes tool-instruction append behavior)
- messages live in the `input` array

**Source of truth:**

- Session base instruction resolution priority:
  - `~/code/codex/codex-rs/core/src/codex.rs:357-366`
- Request prompt uses session `base_instructions`:
  - `~/code/codex/codex-rs/core/src/codex.rs:5368-5377`
  - `~/code/codex/codex-rs/core/src/codex.rs:1584-1588`
- `instructions` asserted in request-shape tests:
  - `~/code/codex/codex-rs/core/tests/suite/prompt_caching.rs:161-171`

### Changes that mutate `instructions`

1) **Starting a new session with different resolved base instructions**
Base instructions for the session are resolved in this priority order:

- `config.base_instructions` override
- conversation history `session_meta.base_instructions`
- current model base instructions (`model_info.get_model_instructions(...)`)

So `instructions` changes if that resolution changes.

**Source:** `~/code/codex/codex-rs/core/src/codex.rs:357-366`

2) **Tool-instruction appending behavior flips**
Codex tests show `instructions` can be either:

- `base_instructions`
or
- `base_instructions + APPLY_PATCH_TOOL_INSTRUCTIONS`

depending on tool expectations.

**Source:** `~/code/codex/codex-rs/core/tests/suite/prompt_caching.rs:155-164`

### What does NOT (usually) change `instructions`: model switching mid-session

If you change model *mid-session* (per-turn override / resume model differs), Codex typically keeps `instructions` stable and injects a `<model_switch>` **developer message** into the messages array.

- `<model_switch>` message builder: `~/code/codex/codex-rs/protocol/src/models.rs:291-295`
- Verified in request-shape test: model override adds `<model_switch>` as a developer message:
  - `~/code/codex/codex-rs/core/tests/suite/prompt_caching.rs:675-685`
- Verified model switch preserves `instructions` on resume:
  - `~/code/codex/codex-rs/core/tests/suite/resume.rs:254-268`

## Caching Implication (One Sentence)

For OpenAI prompt caching (exact prefix match): changing anything that appears early in the payload (especially OpenCode `system[0]` / Codex `instructions`) shortens the reusable cached prefix dramatically; changes late (like user-side reminders) shorten caching only from their insertion point.

---

## Summary Table: What Changes the Top-Level System Prompt

| Trigger | OpenCode | Codex | Notes |
|---------|----------|-------|-------|
| **Model ID change** | ✅ Yes | ❌ No | OpenCode switches template; Codex keeps `instructions` stable |
| **Agent switch (with `agent.prompt`)** | ✅ Yes | ❌ No | OpenCode: prompt replaces template; Codex: no effect |
| **Agent switch (plan/build)** | ❌ No | ❌ No | Both inject reminder as message, not top-level system |
| **Environment change** | ✅ Yes | ❌ No | OpenCode: cwd/date/git changes mutate `system[0]`; Codex: env is separate message |
| **Instruction file edits (AGENTS/CLAUDE/CONTEXT)** | ✅ Yes | ⚠️ Session | OpenCode: immediate; Codex: requires new session |
| **Date change** | ✅ Yes | ❌ No | OpenCode: date is in `system[0]`; Codex: date in user message |
| **Structured output mode** | ✅ Yes | ❌ No | OpenCode: adds schema to system; Codex: unchanged |
| **Turn-level system text** | ✅ Yes | ❌ No | OpenCode: `input.user.system` appends; Codex: no equivalent |
| **Plugin transform** | ✅ Yes | ❌ No | OpenCode: `experimental.chat.system.transform`; Codex: no plugins |
| **New session start** | ✅ Yes | ✅ Yes | Both can change top-level if resolved base instructions differ |
| **Tool-instruction append** | ❌ No | ⚠️ Yes | Codex: may append `APPLY_PATCH_TOOL_INSTRUCTIONS` to `instructions` |
| **Per-turn model override** | ✅ Yes | ❌ No | OpenCode: switches template; Codex: injects `<model_switch>` message |

### Legend
- ✅ **Yes**: Changes the top-level system prompt
- ❌ **No**: Does not change the top-level system prompt
- ⚠️ **Session**: Only changes on new session (Codex caches base_instructions in session config)
