# Codex vs OpenCode Matrix (Verified)

| Dimension | Codex | OpenCode | Buddy Design Takeaway |
|---|---|---|---|
| Base prompt selection | Static base template (`default.md`) plus runtime items | Model-routed templates (`codex_header`, `beast`, `anthropic`, `gemini`, etc.) unless `agent.prompt` overrides | Make prompt strategy pluggable by model + mode, not one global blob |
| Assembly entrypoint | `build_initial_context(...)` composes response items | `SessionPrompt` builds `input.system`, then `LLM.stream` merges header | Keep a two-stage pipeline: gather context, then render model payload |
| Environment context placement | `<environment_context>` emitted as **user-role** message | `<env>` / `<directories>` inserted in **system-side** content | Support both strategies; choose per provider performance/caching behavior |
| Project instruction discovery | AGENTS-first hierarchical docs from git root to cwd; `AGENTS.override.md` + configured fallbacks | Searches `AGENTS.md`/`CLAUDE.md`/`CONTEXT.md`, global files, and URL instructions | Build multi-source instruction loader with deterministic precedence |
| Permissions modeling | Dynamic developer instructions from sandbox + approval policy (`from_policy`) | Tool exposure filtered via `PermissionNext` before model sees tools | Enforce permissions at tool registry boundary, not only in text prompts |
| Tool delivery to model | Tool behavior heavily specified in instructions; runtime policy text added | Tools provided structurally; prompt text supplements behavior | Treat tools as first-class schema; keep prompts for policy/intent, not mechanics |
| Structured output mode | Primarily prompt-guided formatting rules | Explicit `StructuredOutput` tool + forced system instruction in JSON schema mode | Add explicit "final response tool" for machine-consumable outputs |
| Model-switch handling | Explicit dynamic update item (`build_model_instructions_update_item`) | Template swap happens naturally by model route; additional system merges | Add model-switch hook to re-seed constraints/persona safely |
| Personality updates | Explicit personality update item when feature/model conditions match | Personality is mostly template/agent-prompt driven | Separate personality as runtime layer, not hardcoded in every template |
| Memory injection | Memory summary prompt injected when available + feature-enabled | No equivalent explicit memory-summary injection in analyzed files | Add memory gateway with relevance policy + token budget controls |
| Plugin/system transforms | Less centralized prompt transform step in analyzed path | `experimental.chat.system.transform` can mutate final system array | Add final "prompt middleware" stage for instrumentation and policy patches |
| Caching-aware prompt shape | Not explicit in analyzed paths | Rejoin logic in `LLM.stream` keeps cache-friendly two-part shape | Preserve stable header segments to improve cache hit rate |
| Research mandate | Depends on base instructions + task | `beast` strongly mandates `webfetch` and recursive research | Make research intensity profile-based (light/normal/deep), not universal |
| Todo/planning mechanics | `update_plan` guidance + quality constraints | Template/tool specific todo expectations (`[x]`, structured flows) | Standardize one internal planning protocol across templates |

## Source Anchors

### Codex
- `~/code/codex/codex-rs/protocol/src/prompts/base_instructions/default.md`
- `~/code/codex/codex-rs/core/src/codex.rs`
- `~/code/codex/codex-rs/core/src/environment_context.rs`
- `~/code/codex/codex-rs/core/src/project_doc.rs`
- `~/code/codex/codex-rs/protocol/src/models.rs`
- `~/code/codex/codex-rs/core/src/context_manager/updates.rs`
- `~/code/codex/codex-rs/core/src/memories/prompts.rs`

### OpenCode
- `~/code/opencode/packages/opencode/src/session/system.ts`
- `~/code/opencode/packages/opencode/src/session/prompt.ts`
- `~/code/opencode/packages/opencode/src/session/llm.ts`
- `~/code/opencode/packages/opencode/src/session/instruction.ts`
- `~/code/opencode/packages/opencode/src/session/prompt/beast.txt`
