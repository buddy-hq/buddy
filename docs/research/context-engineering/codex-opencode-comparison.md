# Codex vs OpenCode Prompt Architecture Comparison (Verified)

This is the narrative deep-dive. For compact row-by-row comparison, see `agent-storms/codex-vs-opencode-matrix.md`.

## Executive Summary

Both systems build prompts from a base template plus runtime context, but they differ in where they place context, how strongly model choice changes behavior, and where enforcement happens (prompt text vs runtime tool filtering).

- **Codex** behaves like a stable instruction core with explicit dynamic update items layered around it.
- **OpenCode** behaves like a routing system: selected prompt template + system assembly + tool/permission filtering.

## What Is Common

| Theme | Codex | OpenCode |
|---|---|---|
| Base instruction layer | Yes (`default.md`) | Yes (provider/agent templates) |
| Environment awareness | Yes | Yes |
| Project instruction ingestion | Yes | Yes |
| Permission-aware execution | Yes | Yes |
| Planning/workflow guidance | Yes | Yes (template-dependent) |

## Major Differences (with Why They Matter)

## 1) Environment Context Placement

### What each system does

- **Codex** serializes environment into `<environment_context>` and emits it as a **user-role message** (`ResponseItem::Message { role: "user" }`).
- **OpenCode** injects environment (`<env>`, `<directories>`) into the **system-side prompt content** via `SystemPrompt.environment(...)`.

### Why this matters

- In **Codex**, environment appears as conversational context, not permanent system header text.
- In **OpenCode**, environment is part of system prompt construction and naturally participates in system prompt caching/layout behavior.

## 2) Base Prompt Strategy

### What each system does

- **Codex** starts from a stable base instruction template (`default.md`) and adds runtime instruction items.
- **OpenCode** selects different prompt templates based on model id in `SystemPrompt.provider(...)`:
  - `gpt-5*` -> codex header
  - `gpt-*`, `o1`, `o3` -> beast
  - `gemini-*` -> gemini
  - `claude*` -> anthropic
  - `trinity*` -> trinity
  - fallback -> qwen

### Why this matters

- **Codex** has comparatively stable behavioral identity across models.
- **OpenCode** can shift behavior materially when model changes because template changes can be significant (for example, `beast` is much stricter about process).

## 3) Prompt Assembly Order and Ownership

### What each system does

- **Codex** assembles initial context in `build_initial_context(...)` with explicit ordered items: permissions, developer additions, memory, collaboration instructions, personality, optional feature sections, user instructions, then environment.
- **OpenCode** has a two-stage build:
  1. `SessionPrompt` builds `input.system` (env + instruction files + optional structured-output system instruction)
  2. `LLM.stream` merges header in order: `agent.prompt|provider`, `input.system`, `input.user.system`

### Why this matters

- **Codex** makes dynamic additions explicit as protocol items, easier to reason about as discrete context events.
- **OpenCode** concentrates final assembly in a stream step, making header composition predictable and middleware-friendly.

## 4) Permissions: Prompt Text vs Runtime Filter

### What each system does

- **Codex** injects permission semantics textually through `DeveloperInstructions::from_policy(...)` (sandbox mode, approvals, writable roots, allowed prefixes).
- **OpenCode** enforces by filtering tools via `PermissionNext` before model usage, in addition to instruction text.

### Why this matters

- **Codex** communicates rules very explicitly to the model.
- **OpenCode** reduces reliance on model compliance by constraining tool surface at runtime.

## 5) Project Instruction Discovery

### What each system does

- **Codex** project-doc flow is AGENTS-centric and hierarchical from git root to cwd; includes defaults such as `AGENTS.md` and local override/fallback support.
- **OpenCode** reads `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, global files, and optional URL instructions from config.

### Why this matters

- **Codex** favors deterministic in-repo instruction lineage.
- **OpenCode** favors broader configurability across local + global + remote instruction sources.

## 6) Structured Output and Finalization

### What each system does

- **Codex** primarily uses strong formatting instructions in base guidance.
- **OpenCode** supports explicit JSON-schema mode by injecting `STRUCTURED_OUTPUT_SYSTEM_PROMPT` and requiring a `StructuredOutput` tool call.

### Why this matters

- **OpenCode** is more explicit for machine-consumable outputs and API-like response contracts.
- **Codex** is excellent for human-facing response quality and consistency.

## 7) Runtime Adaptation Hooks

### What each system does

- **Codex** emits explicit update items for model-switch and personality changes.
- **OpenCode** supports plugin transforms (`experimental.chat.system.transform`) and system rejoin logic for caching-friendly shape.

### Why this matters

- **Codex** emphasizes explicit state transitions.
- **OpenCode** emphasizes pluggable prompt mutation and transport-level efficiency.

## Practical Design Takeaways for Buddy

If Buddy aims for reliability plus flexibility, a hybrid is strongest:

1. Keep **OpenCode-style runtime tool filtering** as the hard safety boundary.
2. Keep **Codex-style explicit dynamic update items** for clarity and debuggability.
3. Support **model-routed templates**, but isolate invariant policy in a stable core layer.
4. Keep structured output as an explicit mode with a dedicated finalization tool.
5. Separate environment strategy per provider (system-side vs user-context) behind one abstraction.

## Source of Truth (Checked)

### Codex

- `~/code/codex/codex-rs/protocol/src/prompts/base_instructions/default.md`
- `~/code/codex/codex-rs/protocol/src/models.rs`
- `~/code/codex/codex-rs/core/src/codex.rs`
- `~/code/codex/codex-rs/core/src/project_doc.rs`
- `~/code/codex/codex-rs/core/src/context_manager/updates.rs`
- `~/code/codex/codex-rs/core/src/memories/prompts.rs`
- `~/code/codex/codex-rs/core/src/environment_context.rs`

### OpenCode

- `~/code/opencode/packages/opencode/src/session/system.ts`
- `~/code/opencode/packages/opencode/src/session/instruction.ts`
- `~/code/opencode/packages/opencode/src/session/prompt.ts`
- `~/code/opencode/packages/opencode/src/session/llm.ts`
- `~/code/opencode/packages/opencode/src/session/prompt/beast.txt`
