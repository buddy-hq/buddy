# Gemini CLI Prompt Construction Analysis

## Executive Summary

Gemini CLI uses a **modular, composition-based approach** to prompt construction, distinct from both OpenCode's concatenated system strings and Codex's discrete context items. It features:

- **Snippet-based composition** with conditional section rendering
- **Model-aware prompt selection** (modern vs legacy snippets)
- **File-based override system** via `GEMINI_SYSTEM_MD` env var
- **Hierarchical memory integration** (global/extension/project)

---

## Architecture Comparison

### 1. Prompt Structure

| Aspect | Gemini CLI | OpenCode | Codex |
|--------|-----------|----------|-------|
| **Core Approach** | Modular composition via functions | Concatenated string array | Discrete context items |
| **Base Unit** | Snippets (typed functions) | Provider template files | Base instructions + dynamic items |
| **Assembly** | `getCoreSystemPrompt()` composes sections | `LLM.stream` joins parts | `build_initial_context()` pushes items |
| **Conditional Logic** | Section guards (`withSection`) | Template selection by model | Update items emitted on change |

### 2. Prompt Construction Flow

**Gemini CLI:**
```
PromptProvider.getCoreSystemPrompt()
  ├── Check GEMINI_SYSTEM_MD override
  ├── Gather context (skills, tools, mode, model)
  ├── Select snippet set (modern vs legacy)
  ├── Compose via getCoreSystemPrompt(options)
  │   ├── renderPreamble()
  │   ├── renderCoreMandates()
  │   ├── renderSubAgents()
  │   ├── renderAgentSkills()
  │   ├── renderPlanningWorkflow() OR renderPrimaryWorkflows()
  │   ├── renderOperationalGuidelines()
  │   └── ... (conditional sections)
  ├── Wrap with renderFinalShell()
  └── Sanitize & return
```

**OpenCode:**
```
LLM.stream()
  ├── system.push(agent.prompt OR provider(model))
  ├── system.push(...input.system)  // env + instructions
  ├── system.push(...input.user.system)
  ├── Plugin transform (optional)
  └── Return joined system string
```

**Codex:**
```
build_initial_context()
  ├── DeveloperInstructions::from_policy()
  ├── Optional developer_instructions
  ├── Optional memory_prompt
  ├── Optional collaboration_mode instructions
  ├── Optional personality_spec
  ├── Optional feature sections (apps, commit)
  ├── UserInstructions (AGENTS.md)
  └── EnvironmentContext (as user message)
```

---

## Key Differences

### 3. Modularity & Composition

**Gemini CLI: HIGH Modularity**
- Each section is a pure function (`renderXxx()`)
- Sections can be enabled/disabled via `withSection()` guards
- Clean separation of concerns: preamble, mandates, workflows, guidelines
- Easy to extend: add new `renderXxx()` function + option

**OpenCode: MEDIUM Modularity**
- Provider templates are monolithic files
- Some dynamic injection (env, instructions)
- Plugin system allows transforms but less structured

**Codex: LOW Modularity (by design)**
- Base instructions are mostly static
- Dynamic content emitted as separate "update items"
- Context changes tracked via diffing previous/next turn

### 4. Model-Aware Prompting

**Gemini CLI: Dual Snippet Sets**
```typescript
const isModernModel = supportsModernFeatures(desiredModel);
const activeSnippets = isModernModel ? snippets : legacySnippets;
```
- Modern models: Full feature set, hierarchical memory
- Legacy models: Reduced feature set, simpler prompts
- **Source:** `~/code/gemini-cli/packages/core/src/prompts/promptProvider.ts:65-66`

**OpenCode: Provider Templates**
```typescript
if (model.api.id.includes("gpt-5")) return [PROMPT_CODEX];
if (model.api.id.includes("gpt-")) return [PROMPT_BEAST];
if (model.api.id.includes("gemini-")) return [PROMPT_GEMINI];
```
- One template per provider/model family
- No fallback/legacy mode distinction

**Codex: Personality + Base Instructions**
- Base instructions per model (`model_info.base_instructions`)
- Optional personality overlay
- Model switch emits `<model_switch>` message (doesn't change base)

### 5. Environment Context

**Gemini CLI: NO environment in system prompt**
- No cwd, date, platform injected into prompt text
- Relies on tool context and conversation history
- Sandbox mode rendered as text section if enabled

**OpenCode: Environment IN system prompt**
```typescript
`<env>
  Working directory: ${Instance.directory}
  Is directory a git repo: ${project.vcs === "git" ? "yes" : "no"}
  Platform: ${process.platform}
  Today's date: ${new Date().toDateString()}
</env>`
```
- All env vars injected into `input.system`
- Changes to cwd/date invalidate cache

**Codex: Environment as USER message**
- `<environment_context>` emitted as `role: "user"` message
- Not part of base system instructions
- Changes emit diff update items

### 6. Instruction File Discovery

**Gemini CLI: Hierarchical Memory System**
- `GEMINI.md` files (not AGENTS.md)
- Three tiers: global, extension, project
- Explicit context filenames tracked
- **Source:** `~/code/gemini-cli/packages/core/src/tools/memoryTool.ts`

**OpenCode: Multi-source**
- `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`
- Global files + configured URLs
- Fetched at runtime

**Codex: AGENTS.md Only**
- Hierarchical from git root to cwd
- Loaded once at session start
- TODO: Dynamic refresh not implemented

### 7. Override Mechanisms

**Gemini CLI: File-based Override**
```typescript
const systemMdResolution = resolvePathFromEnv(process.env['GEMINI_SYSTEM_MD']);
if (systemMdResolution.value && !systemMdResolution.isDisabled) {
  basePrompt = fs.readFileSync(systemMdPath, 'utf8');
  // Apply substitutions, skip standard composition
}
```
- `GEMINI_SYSTEM_MD=path/to/custom.md` completely replaces prompt
- `GEMINI_WRITE_SYSTEM_MD` dumps generated prompt to file
- **Source:** `~/code/gemini-cli/packages/core/src/prompts/promptProvider.ts:94-115`

**OpenCode: No direct override**
- Must modify agent.prompt or provider templates
- Plugin transforms available but complex

**Codex: Config override**
```typescript
let base_instructions = config
  .base_instructions
  .clone()
  .or_else(|| conversation_history.get_base_instructions().map(|s| s.text))
  .unwrap_or_else(|| model_info.get_model_instructions(config.personality));
```
- `config.base_instructions` takes precedence
- Also respects conversation history

### 8. Plan/Build Mode Handling

**Gemini CLI: Conditional Section Swapping**
```typescript
planningWorkflow: isPlanMode ? renderPlanningWorkflow() : undefined,
primaryWorkflows: !isPlanMode ? renderPrimaryWorkflows() : undefined,
```
- Completely different prompt sections for plan vs build
- Plan mode lists allowed tools explicitly

**OpenCode: Reminder Injection**
- Plan/build reminders injected as user message parts
- Same base prompt, mode signaled via `<system-reminder>`

**Codex: Collaboration Mode Items**
- Emits `DeveloperInstructions::from_collaboration_mode()`
- Separate context item, not base instructions change

---

## Format & Markup

### 9. Markup Language

**Gemini CLI: Markdown with semantic sections**
- Uses markdown headers (`##`, `###`)
- No XML tags in base prompt
- Tool references use backticks + plain text

**OpenCode: Markdown + Heavy XML**
- `<examples>`, `<example>`, `<system-reminder>`, `<env>`
- XML tags for structure and examples

**Codex: Plain Markdown**
- No XML tags found in base instructions
- Standard markdown formatting

---

## Practical Implications

### 10. Cache Friendliness

| System | Cache Strategy | Volatility |
|--------|---------------|------------|
| **Gemini CLI** | Stable base composition, env external | Low (no date/cwd in prompt) |
| **OpenCode** | Env embedded, changes frequently | High (date/cwd in system[0]) |
| **Codex** | Base instructions stable, updates as messages | Medium (base stable, updates appended) |

### 11. Extensibility

| System | Adding New Behavior | Complexity |
|--------|-------------------|------------|
| **Gemini CLI** | Add option + render function | Low (typed, modular) |
| **OpenCode** | Modify provider template or agent | Medium (file-based) |
| **Codex** | Add context item type | Medium (protocol-level) |

### 12. Debuggability

**Gemini CLI:**
- `GEMINI_WRITE_SYSTEM_MD` dumps full prompt
- Clear section boundaries in code
- Conditional logic explicit via `withSection()`

**OpenCode:**
- Plugin transforms can mutate arbitrarily
- Harder to trace final prompt composition

**Codex:**
- Rollout files show all context items
- Explicit update items logged

---

## Recommendations for Buddy

Based on this three-way comparison:

1. **Adopt Gemini CLI's snippet composition** for modularity
2. **Use Codex's discrete context items** for dynamic updates (not concatenation)
3. **Avoid OpenCode's env-in-system approach** for cache efficiency
4. **Implement file-based override** like Gemini's `GEMINI_SYSTEM_MD`
5. **Support model-aware snippet sets** (modern vs legacy)
6. **Keep environment separate** from system prompt (Codex style)

---

## Source Files Verified

### Gemini CLI
- `~/code/gemini-cli/packages/core/src/prompts/promptProvider.ts`
- `~/code/gemini-cli/packages/core/src/prompts/snippets.ts`
- `~/code/gemini-cli/packages/core/src/prompts/snippets.legacy.ts`
- `~/code/gemini-cli/packages/core/src/tools/memoryTool.ts`

### OpenCode
- `~/code/opencode/packages/opencode/src/session/llm.ts`
- `~/code/opencode/packages/opencode/src/session/system.ts`
- `~/code/opencode/packages/opencode/src/session/prompt.ts`

### Codex
- `~/code/codex/codex-rs/core/src/codex.rs`
- `~/code/codex/codex-rs/core/src/context_manager/updates.rs`
- `~/code/codex/codex-rs/protocol/src/prompts/base_instructions/default.md`
