# OpenCode Tools Audit

Comprehensive analysis of all tools available in the OpenCode agent system, including availability conditions, costs, and detailed descriptions.

---

## Always-Available Core Tools

These tools are available to all models and providers without restrictions:

### 1. **bash**

- **Purpose**: Execute shell commands in a persistent session
- **Parameters**: `command` (required), `description` (5-10 words), `workdir` (optional), `timeout` (optional, default 120000ms)
- **Availability**: All models/providers
- **Cost**: Free (uses local shell)
- **Notes**:
  - For terminal operations (git, npm, docker), NOT file operations
  - Commands run in project directory by default
  - Output auto-truncates at configured limits
  - Supports parallel execution for independent commands

### 2. **read**

- **Purpose**: Read files or directories from local filesystem
- **Parameters**: `filePath` (required, absolute), `offset` (1-indexed), `limit` (default 2000 lines)
- **Availability**: All models/providers
- **Cost**: Free (local filesystem)
- **Notes**:
  - Returns line numbers prefixed (`1: content`)
  - Can read images and PDFs as attachments
  - For directories, lists entries with trailing `/`
  - Lines >2000 chars are truncated

### 3. **write**

- **Purpose**: Write files to local filesystem
- **Parameters**: `filePath` (required, absolute), `content` (required)
- **Availability**: All models/providers (except GPT models use `apply_patch` instead)
- **Cost**: Free (local filesystem)
- **Notes**:
  - Overwrites existing files
  - Must `read` existing files before overwriting
  - Prefer editing over writing new files

### 4. **edit**

- **Purpose**: Perform exact string replacements in files
- **Parameters**: `filePath` (required), `oldString` (required), `newString` (required), `replaceAll` (optional)
- **Availability**: All models/providers (except GPT models - see `apply_patch`)
- **Cost**: Free (local filesystem)
- **Notes**:
  - Must `read` file before editing
  - Preserves exact indentation (watch line number prefixes)
  - Fails if `oldString` not found or found multiple times
  - Use `replaceAll` for renaming variables across file

### 5. **glob**

- **Purpose**: Fast file pattern matching
- **Parameters**: `pattern` (required, e.g., "\*_/_.ts"), `path` (optional)
- **Availability**: All models/providers
- **Cost**: Free (local filesystem)
- **Notes**:
  - Works with any codebase size
  - Returns paths sorted by modification time
  - Respects `.gitignore` patterns
  - Use for finding files by name patterns

### 6. **grep**

- **Purpose**: Content search using regular expressions
- **Parameters**: `pattern` (required, regex), `include` (file pattern, optional), `path` (optional)
- **Availability**: All models/providers
- **Cost**: Free (local filesystem, uses ripgrep)
- **Notes**:
  - Full regex support (e.g., `log.*Error`, `function\s+\w+`)
  - Returns file paths and line numbers
  - For counting matches, use `bash` with `rg` instead
  - Respects `.gitignore` patterns

### 7. **task**

- **Purpose**: Launch sub-agents for complex multistep tasks
- **Parameters**: `description` (3-5 words), `prompt` (detailed task), `subagent_type` (general/explore), `task_id` (optional, for resuming)
- **Availability**: All models/providers
- **Cost**: Free (local agent execution)
- **Notes**:
  - Agent types: `general` (multistep), `explore` (codebase exploration)
  - Launch multiple agents in parallel when possible
  - Agent outputs are not user-visible by default
  - Can resume sessions with `task_id`

### 8. **skill**

- **Purpose**: Load specialized skill instructions from SKILL.md files
- **Parameters**: `name` (skill name from available_skills)
- **Availability**: All models/providers
- **Cost**: Free (local files)
- **Notes**:
  - Dynamically lists available skills in description
  - Injects skill content as `<skill_content>` block
  - Includes bundled resources (scripts, templates)
  - Skills filtered by agent permissions

### 9. **webfetch**

- **Purpose**: Fetch content from URLs
- **Parameters**: `url` (required), `format` (markdown/text/html, default markdown)
- **Availability**: All models/providers
- **Cost**: Free (external HTTP requests)
- **Notes**:
  - HTTP auto-upgraded to HTTPS
  - Default format is markdown
  - Read-only, does not modify files
  - Results may be summarized if very large

### 10. **todowrite**

- **Purpose**: Create and manage structured todo lists
- **Parameters**: `todos` (array of {content, status, priority})
- **Availability**: All models/providers
- **Cost**: Free (local session storage)
- **Notes**:
  - Use for 3+ step tasks, complex tasks, or when user requests
  - Skip for trivial single-step tasks
  - Status: pending, in_progress, completed, cancelled
  - Only ONE task should be in_progress at a time

---

## Model-Specific Tools

### 11. **apply_patch** (GPT models only)

- **Purpose**: Edit files using patch format (alternative to edit/write)
- **Availability**: **RESTRICTED** - Only GPT models (excluding "oss" and "gpt-4" variants)
- **Replaces**: `edit` and `write` tools (these are hidden for GPT models)
- **Cost**: Free (local filesystem)
- **Format**:
  ```
  *** Begin Patch
  *** Add File: path
  +content
  *** Update File: path
  @@ context
  -old
  +new
  *** Delete File: path
  *** End Patch
  ```
- **Notes**: Designed for Codex compatibility

---

## Provider/Feature-Conditional Tools

### 12. **websearch**

- **Purpose**: Search the web using Exa AI
- **Parameters**: `query` (required), `numResults` (default 8), `livecrawl` (fallback/preferred), `type` (auto/fast/deep), `contextMaxCharacters` (default 10000)
- **Availability**: **RESTRICTED**
  - OpenCode provider (Zen) users: ✅ Automatic
  - Other providers: ✅ With `OPENCODE_ENABLE_EXA=1` or `OPENCODE_EXPERIMENTAL=1`
- **Cost**: **FREE** - No API key required, connects to `https://mcp.exa.ai/mcp`
- **Why restricted**: Cost control for OpenCode, opt-out capability for enterprise
- **Notes**:
  - Uses Exa AI's hosted MCP service
  - 25-second timeout
  - Real-time web search with live crawling options
  - Description includes current year dynamically

### 13. **codesearch**

- **Purpose**: Search and get code context using Exa Code API
- **Parameters**: `query` (required), `tokensNum` (1000-50000, default 5000)
- **Availability**: **RESTRICTED** (same as websearch)
  - OpenCode provider (Zen) users: ✅ Automatic
  - Other providers: ✅ With `OPENCODE_ENABLE_EXA=1` or `OPENCODE_EXPERIMENTAL=1`
- **Cost**: **FREE** - No API key required, connects to `https://mcp.exa.ai/mcp`
- **Why restricted**: Cost control for OpenCode, opt-out capability for enterprise
- **Notes**:
  - Optimized for libraries, SDKs, APIs
  - Returns code examples and documentation
  - 30-second timeout
  - Adjustable token count for focused vs comprehensive results

---

## Client/Environment-Conditional Tools

### 14. **question**

- **Purpose**: Ask user questions during execution
- **Parameters**: `questions` (array with header, question, options, multiple, custom)
- **Availability**: **RESTRICTED**
  - app/cli/desktop clients: ✅ Automatic
  - Other clients: ✅ With `OPENCODE_ENABLE_QUESTION_TOOL=1`
- **Cost**: Free (UI interaction)
- **Notes**:
  - Used for gathering preferences, clarifying ambiguity
  - Returns arrays of selected labels
  - Custom option available by default

---

## Experimental Tools (Feature Flags)

### 15. **lsp** (Language Server Protocol)

- **Purpose**: Code intelligence via LSP (goToDefinition, findReferences, hover, etc.)
- **Parameters**: `operation` (required), `filePath` (required), `line` (1-based), `character` (1-based)
- **Availability**: **RESTRICTED** - Only with `OPENCODE_EXPERIMENTAL_LSP_TOOL=1` or `OPENCODE_EXPERIMENTAL=1`
- **Operations**: goToDefinition, findReferences, hover, documentSymbol, workspaceSymbol, goToImplementation, prepareCallHierarchy, incomingCalls, outgoingCalls
- **Cost**: Free (local LSP servers)
- **Notes**:
  - Requires LSP servers configured for file type
  - Returns error if no LSP server available

### 16. **batch**

- **Purpose**: Execute multiple independent tool calls concurrently
- **Parameters**: JSON array of tool calls
- **Availability**: **RESTRICTED** - Only when `config.experimental.batch_tool === true` in `opencode.json`
- **Cost**: Free (local execution)
- **Notes**:
  - 1-25 tool calls per batch
  - 2-5x efficiency gain
  - Ordering not guaranteed
  - Partial failures don't stop other calls
  - Do not nest batch calls

### 17. **plan_exit**

- **Purpose**: Exit plan mode and switch to build agent
- **Parameters**: None
- **Availability**: **RESTRICTED**
  - Only with `OPENCODE_EXPERIMENTAL_PLAN_MODE=1` or `OPENCODE_EXPERIMENTAL=1`
  - AND client must be `cli`
- **Cost**: Free
- **Notes**: Prompts user to confirm switching to build agent

---

## Disabled/Internal Tools

### 18. **todoread**

- **Purpose**: Read the todo list
- **Availability**: ❌ **DISABLED** - Present in code but commented out in registry
- **Notes**: Functionality merged into `todowrite` workflow

### 19. **invalid**

- **Purpose**: Internal error handling for invalid tool calls
- **Availability**: Always registered but not for direct use
- **Notes**: "Do not use" - handles malformed tool invocations

---

## Custom Tools

### Loading Mechanisms

Custom tools can be added via:

1. **Config Directory Tools**: Files matching `{tool,tools}/*.{js,ts}` in config directories
2. **Plugins**: Via `@opencode-ai/plugin` tool definitions

- **Availability**: All models/providers (if loaded)
- **Cost**: Depends on tool implementation
- **Notes**:
  - Custom tools take precedence (can override built-ins)
  - Registered at runtime from config directories
  - Plugin tools loaded from installed plugins

---

## Summary Table

| Tool        | Always Available | Conditional On                                     | Cost | Notes                              |
| ----------- | ---------------- | -------------------------------------------------- | ---- | ---------------------------------- |
| bash        | ✅               | -                                                  | Free | Shell execution                    |
| read        | ✅               | -                                                  | Free | File reading                       |
| write       | ✅\*             | -                                                  | Free | \*Hidden for GPT (use apply_patch) |
| edit        | ✅\*             | -                                                  | Free | \*Hidden for GPT (use apply_patch) |
| glob        | ✅               | -                                                  | Free | File pattern matching              |
| grep        | ✅               | -                                                  | Free | Content search                     |
| task        | ✅               | -                                                  | Free | Sub-agent launcher                 |
| skill       | ✅               | -                                                  | Free | Load SKILL.md                      |
| webfetch    | ✅               | -                                                  | Free | URL fetching                       |
| todowrite   | ✅               | -                                                  | Free | Todo management                    |
| apply_patch | ❌               | GPT models only                                    | Free | Codex-style patches                |
| websearch   | ❌               | opencode provider OR OPENCODE_ENABLE_EXA=1         | Free | Exa AI search                      |
| codesearch  | ❌               | opencode provider OR OPENCODE_ENABLE_EXA=1         | Free | Exa AI code search                 |
| question    | ❌               | app/cli/desktop OR OPENCODE_ENABLE_QUESTION_TOOL=1 | Free | User prompts                       |
| lsp         | ❌               | OPENCODE_EXPERIMENTAL_LSP_TOOL=1                   | Free | LSP operations                     |
| batch       | ❌               | config.experimental.batch_tool=true                | Free | Parallel execution                 |
| plan_exit   | ❌               | OPENCODE_EXPERIMENTAL_PLAN_MODE=1 AND cli client   | Free | Plan mode exit                     |
| todoread    | ❌               | Disabled                                           | -    | Commented out                      |

---

## Environment Variables Reference

| Variable                            | Effect                  | Tools Affected                               |
| ----------------------------------- | ----------------------- | -------------------------------------------- |
| `OPENCODE_ENABLE_EXA=1`             | Enable Exa tools        | websearch, codesearch                        |
| `OPENCODE_EXPERIMENTAL=1`           | Enable all experimental | lsp, batch, plan_exit, websearch, codesearch |
| `OPENCODE_EXPERIMENTAL_LSP_TOOL=1`  | Enable LSP tool         | lsp                                          |
| `OPENCODE_EXPERIMENTAL_PLAN_MODE=1` | Enable plan mode        | plan_exit                                    |
| `OPENCODE_ENABLE_QUESTION_TOOL=1`   | Enable question tool    | question                                     |
| `OPENCODE_CLIENT=cli/app/desktop`   | Auto-enable question    | question                                     |

---

## Cost Analysis

**Zero-cost tools (local only)**:

- All filesystem tools (read, write, edit, glob, grep)
- All shell tools (bash)
- All agent tools (task, skill)
- All UI tools (question, todowrite)
- All experimental tools (lsp, batch, plan_exit)

**Free but external API**:

- websearch (Exa AI MCP service)
- codesearch (Exa AI MCP service)
- webfetch (General HTTP)

**No user-facing costs**: OpenCode handles Exa AI integration without requiring user API keys. The restrictions are for usage control, not billing.

---

## Architectural Notes

1. **Provider-agnostic design**: Core tools work with any LLM provider (Claude, OpenAI, local models, etc.)

2. **Model-specific adaptations**: Only `apply_patch` vs `edit/write` varies by model (Codex compatibility)

3. **Zen premium features**: `websearch` and `codesearch` are effectively "Zen" features, available free to OpenCode provider users or via opt-in flag

4. **Enterprise considerations**: The `OPENCODE_ENABLE_EXA` flag allows enterprise/self-hosted users to:
   - Opt-out of external API calls (data privacy)
   - Control costs (prevent accidental Exa usage)
   - Comply with security policies

5. **Experimental gatekeeping**: Experimental tools require explicit flags to prevent accidental usage of unstable features

6. **Plugin extensibility**: Tool registry supports dynamic loading without code changes

---

_Generated from OpenCode source analysis - vendor/opencode/packages/opencode/src/tool/_

---

## Sources

The following files were read to compile this audit:

### Tool Definitions

- `vendor/opencode/packages/opencode/src/tool/registry.ts` - Tool registry and availability logic
- `vendor/opencode/packages/opencode/src/tool/tool.ts` - Base tool type definitions
- `vendor/opencode/packages/opencode/src/tool/invalid.ts` - Invalid tool handler

### Core Tool Implementations

- `vendor/opencode/packages/opencode/src/tool/bash.ts` + `bash.txt` - Shell execution tool
- `vendor/opencode/packages/opencode/src/tool/read.ts` + `read.txt` - File reading tool
- `vendor/opencode/packages/opencode/src/tool/write.ts` + `write.txt` - File writing tool
- `vendor/opencode/packages/opencode/src/tool/edit.ts` + `edit.txt` - File editing tool
- `vendor/opencode/packages/opencode/src/tool/glob.ts` + `glob.txt` - File pattern matching tool
- `vendor/opencode/packages/opencode/src/tool/grep.ts` + `grep.txt` - Content search tool
- `vendor/opencode/packages/opencode/src/tool/task.ts` + `task.txt` - Sub-agent launcher
- `vendor/opencode/packages/opencode/src/tool/webfetch.ts` + `webfetch.txt` - URL fetching tool
- `vendor/opencode/packages/opencode/src/tool/skill.ts` - Skill loading tool

### Conditional/Restricted Tools

- `vendor/opencode/packages/opencode/src/tool/websearch.ts` + `websearch.txt` - Web search tool (Exa AI)
- `vendor/opencode/packages/opencode/src/tool/codesearch.ts` + `codesearch.txt` - Code search tool (Exa AI)
- `vendor/opencode/packages/opencode/src/tool/apply_patch.ts` + `apply_patch.txt` - Patch-based editing (GPT models)
- `vendor/opencode/packages/opencode/src/tool/question.ts` + `question.txt` - User question tool
- `vendor/opencode/packages/opencode/src/tool/lsp.ts` + `lsp.txt` - LSP operations tool
- `vendor/opencode/packages/opencode/src/tool/batch.ts` + `batch.txt` - Batch execution tool
- `vendor/opencode/packages/opencode/src/tool/plan.ts` + `plan-exit.txt` - Plan mode exit tool
- `vendor/opencode/packages/opencode/src/tool/todo.ts` + `todowrite.txt` - Todo management tool

### Configuration & Flags

- `vendor/opencode/packages/opencode/src/flag/flag.ts` - Environment flags (OPENCODE_ENABLE_EXA, etc.)

### Documentation

- `vendor/opencode/packages/web/src/content/docs/tools.mdx` - Official tool documentation
- `vendor/opencode/packages/web/src/content/docs/cli.mdx` - CLI environment variables documentation
