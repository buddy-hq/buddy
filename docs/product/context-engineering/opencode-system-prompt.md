# OpenCode Prompt Stack (Verified)

## Scope

This note describes how OpenCode assembles model-visible instructions, verified from source in `~/code/opencode/packages/opencode/src/session/`.

## 1) Base Template Selection

**Source:** `system.ts`, `prompt/*.txt`

- OpenCode chooses provider template by model id unless `agent.prompt` is set.
- Current routing in `SystemPrompt.provider(...)`:
  - `gpt-5*` -> `codex_header.txt`
  - `gpt-*`, `o1`, `o3` -> `beast.txt`
  - `gemini-*` -> `gemini.txt`
  - `claude*` -> `anthropic.txt`
  - `trinity*` -> `trinity.txt`
  - fallback -> `qwen.txt`
- `beast.txt` is strict (todo format, webfetch-heavy), but only for matching models.

## 2) Prompt Assembly Pipeline

**Sources:** `prompt.ts`, `llm.ts`

OpenCode builds prompt content in two stages.

### Stage A (`SessionPrompt`)

- `input.system` is built as:
  1. `SystemPrompt.environment(model)`
  2. `InstructionPrompt.system()`
  3. `STRUCTURED_OUTPUT_SYSTEM_PROMPT` when JSON schema output is requested

### Stage B (`LLM.stream`)

- Final system header merge order:
  1. `agent.prompt` or `SystemPrompt.provider(model)`
  2. `input.system`
  3. `input.user.system` (turn-level)
- This is sent as `role: "system"` messages before conversation history.

## 3) Environment Context

**Source:** `system.ts`

- Environment is inserted into system-side text using an XML-style block:
  - `<env>` with cwd, git repo flag, platform, date
  - `<directories>` block (tree currently disabled by a hardcoded `&& false` branch)

## 4) Project Instruction Sources

**Source:** `instruction.ts`

- Local/project files considered: `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`.
- Global sources include:
  - `OPENCODE_CONFIG_DIR/AGENTS.md` (if set)
  - global config path `AGENTS.md`
  - `~/.claude/CLAUDE.md` (unless disabled)
- `config.instructions` supports:
  - absolute paths
  - relative globs
  - URLs fetched over HTTP(S)

## 5) Tools and Permissions

**Sources:** `prompt.ts`, `llm.ts`

- Tools are registered structurally (not prompt text).
- `PermissionNext` filters disallowed tools before model exposure.
- MCP tools are included via `MCP.tools()` and wrapped with permission checks.
- JSON schema mode injects a required `StructuredOutput` tool and matching system instruction.

## 6) Dynamic Runtime Behavior

**Sources:** `llm.ts`, `prompt.ts`

- For OpenAI OAuth Codex sessions, provider prompt is skipped and passed via `options.instructions = SystemPrompt.instructions()`.
- System text can be transformed by plugin hooks (`experimental.chat.system.transform`).
- Rejoin logic preserves cache-friendly two-part structure when header is unchanged.

## 7) Side-by-Side Notes vs Codex

- OpenCode keeps environment in system-side content.
- Prompt personality/workflow is template-dependent by model id.
- Instruction ingestion spans AGENTS + CLAUDE + optional URL instructions.

## References

- `~/code/opencode/packages/opencode/src/session/system.ts`
- `~/code/opencode/packages/opencode/src/session/instruction.ts`
- `~/code/opencode/packages/opencode/src/session/prompt.ts`
- `~/code/opencode/packages/opencode/src/session/llm.ts`
- `~/code/opencode/packages/opencode/src/session/prompt/beast.txt`
