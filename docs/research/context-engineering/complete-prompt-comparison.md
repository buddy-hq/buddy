# Complete Prompt Architecture Comparison: OpenCode vs Codex vs Gemini CLI

This document captures **ALL non-user content** injected into the conversation by each agent system at any point during a session. This includes:
- System messages
- Developer messages  
- Synthetic user messages (system-generated content injected as user role)
- Any per-turn or recurring context

This is NOT limited to just the "system prompt" — it covers everything the system adds that isn't directly from the user's typing.

---

## Quick Reference Table

| Aspect                     | OpenCode                                       | Codex                                   | Gemini CLI                        |
| -------------------------- | ---------------------------------------------- | --------------------------------------- | --------------------------------- |
| **System prompt (static)** | ✅ Provider template or agent.prompt            | ✅ Base instructions field               | ✅ Composed via snippet functions  |
| **Environment context**    | In system[0] (volatile)                        | As user message (stable)                | As first user message (stable)    |
| **Per-turn updates**       | ✅ Reminders injected into user message         | ✅ Update items (developer messages)     | ❌ No per-turn updates             |
| **Model switch handling**  | Template swap in system[0]                     | `<model_switch>` developer message      | Model-aware snippet selection     |
| **Plan/Build mode**        | `<system-reminder>` injected into user message | Collaboration mode developer messages   | Different snippet sections        |
| **Tool definitions**       | Passed structurally                            | Passed structurally                     | Passed structurally               |
| **Memory injection**       | ❌ Not in analyzed files                        | ✅ Memory summary developer instructions | ✅ Hierarchical memory (GEMINI.md) |

---

## OpenCode: Complete Content Injection

### 1. Initial System Prompt (Stable per session)

**Location:** `system[0]` in `LLM.stream`

**What goes in:**
```
1. agent.prompt OR SystemPrompt.provider(model)
   - Provider templates: beast.txt, anthropic.txt, gemini.txt, codex_header.txt, etc.
   - Selected based on model ID (gpt-5 → codex_header, gpt-* → beast, etc.)
   - OR custom agent.prompt if agent has one defined

2. input.system (joined)
   - Environment block (<env>, <directories>)
   - Instruction files (AGENTS.md, CLAUDE.md, CONTEXT.md)
   - Structured output system prompt (if json_schema mode)

3. input.user.system (turn-level custom)
```

**Source:** `~/code/opencode/packages/opencode/src/session/llm.ts:67-80`

### 2. Environment Context (In System Prompt)

**What's included:**
```xml
<env>
  Working directory: ${Instance.directory}
  Is directory a git repo: ${project.vcs === "git" ? "yes" : "no"}
  Platform: ${process.platform}
  Today's date: ${new Date().toDateString()}
</env>
<directories>
  (folder tree - currently disabled with "&& false")
</directories>
```

**Volatility:** HIGH — Changes when cwd changes, date changes (daily)

**Source:** `~/code/opencode/packages/opencode/src/session/system.ts:29-53`

### 3. Synthetic Reminders (Injected into User Message)

**What triggers them:**
- Switching from `plan` agent to `build` agent
- Plan mode enabled/disabled

**Example (your snippet - from OpenCode):**
```xml
<system-reminder>
Your operational mode has changed from plan to build.
You are no longer in read-only mode.
You are permitted to make file changes, run shell commands, and utilize your arsenal of tools as needed.
</system-reminder>
```

**Where injected:** Into the latest user message's `parts` array, marked as `synthetic: true`

**Source:** `~/code/opencode/packages/opencode/src/session/prompt.ts:1321-1369`

### 4. Tools

**How delivered:** Passed structurally (not as text in prompt)

**Source:** Tool registry filtered by `PermissionNext` before exposure to model

---

## Codex: Complete Content Injection

### 1. Base Instructions (Stable per session)

**Location:** `instructions` field in request payload

**What goes in:**
- `model_info.base_instructions` (from `default.md`)
- Plus optionally `APPLY_PATCH_TOOL_INSTRUCTIONS` if apply_patch tool is expected

**Volatility:** LOW — Changes only on session start/resume with different config

**Source:** `~/code/codex/codex-rs/core/src/codex.rs:5368-5377`

### 2. Developer Messages (Dynamic Updates)

These are emitted as `role: "developer"` messages in the `input` array.

**Types of developer messages:**

| Trigger | When It Fires | XML Tag |
|---------|---------------|---------|
| Model switch | Different model selected mid-session | `<model_switch>` |
| Sandbox/approval policy | Permissions change | `<permissions instructions>` |
| Collaboration mode (Plan ↔ Default) | Mode changes | `<collaboration_mode>` |
| Personality change | User requests different personality | `<personality_spec>` |
| Memory enabled | Memory feature on, has content | (No XML wrapper, directly injected) |

---

#### Developer Message #1: Model Switch

**Trigger:** When model changes mid-session (different from session start)

**Content:**
```xml
<model_switch>
The user was previously using a different model. Please continue the conversation according to the following instructions:

{model_instructions}
</model_switch>
```

**Source:** `protocol/src/models.rs:291-295`

---

#### Developer Message #2: Permissions (Sandbox + Approval)

**Trigger:** When sandbox policy or approval mode changes

**Content Structure:**
```xml
<permissions instructions>
{sandbox_mode_text}

{approval_policy_text}

{writable_roots_text}
</permissions instructions>
```

**Sandbox Mode Text (varies by mode):**
- `read-only`: `Filesystem sandboxing defines which files can be read or written. sandbox_mode is read-only: The sandbox only permits reading files. Network access is {network_access}.`
- `workspace-write`: `Filesystem sandboxing defines which files can be read or written. sandbox_mode is workspace-write: The sandbox permits reading files, and editing files in cwd and writable_roots. Editing files in other directories requires approval. Network access is {network_access}.`
- `danger-full-access`: `Filesystem sandboxing defines which files can be read or written. sandbox_mode is danger-full-access: No filesystem sandboxing - all commands are permitted. Network access is {network_access}.`

**Approval Policy Text (varies by mode):**
- `never`: `Approval policy is currently never. Do not provide the sandbox_permissions for any reason, commands will be rejected.`
- `unless-trusted`: `Approvals are your mechanism to get user consent to run shell commands without the sandbox. approval_policy is unless-trusted: The harness will escalate most commands for user approval, apart from a limited allowlist of safe "read" commands.`
- `on-failure`: `Approvals are your mechanism to get user consent to run shell commands without the sandbox. approval_policy is on-failure: The harness will allow all commands to run in the sandbox (if enabled), and failures will be escalated to the user for approval to run again without the sandbox.`
- `on-request`: Full escalation rules (57 lines of detailed instructions about prefix rules, escalation requests, etc.) — see `protocol/src/prompts/permissions/approval_policy/on_request_rule.md`

**Source:** `protocol/src/models.rs:304-366` + `protocol/src/prompts/permissions/sandbox_mode/*.md` + `protocol/src/prompts/permissions/approval_policy/*.md`

---

#### Developer Message #3: Collaboration Mode (Plan ↔ Default)

**Trigger:** When switching between Plan mode and Default mode

**Plan Mode Example:**
```xml
<collaboration_mode>
# Plan Mode (Conversational)

You work in 3 phases, and you should *chat your way* to a great plan before finalizing it. A great plan is very detailed—intent- and implementation-wise—so that it can be handed to another engineer or agent to be implemented right away. It must be **decision complete**, where the implementer does not need to make any decisions.

## Mode rules (strict)

You are in **Plan Mode** until a developer message explicitly ends it.

Plan Mode is not changed by user intent, tone, or imperative language. If a user asks for execution while still in Plan Mode, treat it as a request to **plan the execution**, not perform it.

## Plan Mode vs update_plan tool

Plan Mode is a collaboration mode that can involve requesting user input and eventually issuing a `<proposed_plan>` block.

Separately, `update_plan` is a checklist/progress/TODOs tool; it does not enter or exit Plan Mode...

[...122 lines total - full content in core/templates/collaboration_mode/plan.md]
</collaboration_mode>
```

**Default Mode Example:**
```xml
<collaboration_mode>
# Collaboration Mode: Default

You are now in Default mode. Any previous instructions for other modes (e.g. Plan mode) are no longer active.

Your active mode changes only when new developer instructions with a different `<collaboration_mode>...</collaboration_mode>` change it; user requests or tool descriptions do not change mode by themselves. Known mode names are Plan and Default.

## request_user_input availability

The `request_user_input` tool is available in Default mode.

If a decision is necessary and cannot be discovered from local context, ask the user directly. However, in Default mode you should strongly prefer executing the user's request rather than stopping to ask questions.
</collaboration_mode>
```

**Source:** `core/templates/collaboration_mode/plan.md` + `core/templates/collaboration_mode/default.md`

---

#### Developer Message #4: Personality Spec

**Trigger:** When user requests a different communication style

**Content:**
```xml
<personality_spec> The user has requested a new communication style. Future messages should adhere to the following personality: 
{spec} </personality_spec>
```

**Source:** `protocol/src/models.rs:297-302`

---

#### Developer Message #5: Memory Tool Instructions

**Trigger:** When memory feature is enabled and `memory_summary.md` exists

**Content:**
```xml
## Memory

You have access to a memory folder with guidance from prior runs. It can save time and help you stay consistent. Use it whenever it is likely to help.

Decision boundary: should you use memory for a new user query?

- Skip memory ONLY when the request is clearly self-contained and does not need workspace history, conventions, or prior decisions.
- Hard skip examples: current time/date, simple translation, simple sentence rewrite, one-line shell command, trivial formatting.
- Use memory by default when ANY of these are true: [...]

[... full 99-line memory guide in core/templates/memories/read_path.md ...]

========= MEMORY_SUMMARY BEGINS =========
{memory_summary_content}
========= MEMORY_SUMMARY ENDS =========
```

**Source:** `core/src/memories/prompts.rs` + `core/templates/memories/read_path.md`

---

### 3. User Instructions (AGENTS.md)

**Location:** `UserInstructions` item in input array

**What:**
- Contents of `AGENTS.md` files found from git root to cwd
- Loaded once at session start
- NOT refreshed on cwd change (known limitation per test)

**Source:** `~/code/codex/codex-rs/core/src/project_doc.rs`

### 4. Environment Context (As User Message)

**Location:** First `role: "user"` message in input array

**What:**
```xml
<environment_context>
  <cwd>/path/to/dir</cwd>
  <shell>bash</shell>
</environment_context>
```

**Volatility:** Changes on environment updates (but separate from system instructions)

**Source:** `~/code/codex/codex-rs/core/src/environment_context.rs`

### 5. Tools

**How delivered:** Passed structurally with tool definitions

---

## Gemini CLI: Complete Content Injection

### 1. System Prompt (Composed via Snippets)

**Location:** `systemPrompt` in model request

**What goes in (composed via functions):**
```
renderPreamble()           // "You are Gemini CLI..."
renderCoreMandates()       // Security, context efficiency, engineering standards
renderSubAgents()          // Available sub-agents
renderAgentSkills()        // Available skills
renderPrimaryWorkflows()   // OR renderPlanningWorkflow() (mutually exclusive)
renderOperationalGuidelines() // Tone, style, security rules
renderSandbox()            // Only if SANDBOX env var set
renderGitRepo()            // Only if in git repository
renderHookContext()        // Only if hooks enabled
```

**Volatility:** LOW — Only changes if section flags change or model switches (which selects modern vs legacy snippet set)

**Source:** `~/code/gemini-cli/packages/core/src/prompts/snippets.ts:95-121`

### 2. Environment Context (First User Message)

**Location:** First message in `history` array, role: `user`

**What:**
```xml
<session_context>
This is the Gemini CLI. We are setting up the context for our chat.
Today's date is ${today} (formatted according to the user's locale).
My operating system is: ${platform}
The project's temporary directory is: ${tempDir}
${directoryContext}    // Optional: folder structure if enabled
${environmentMemory}  // Optional: custom environment memory
</session_context>
```

**Volatility:** Medium — Date changes daily, directory context if enabled

**Source:** `~/code/gemini-cli/packages/core/src/utils/environmentContext.ts:48-76`

### 3. Hierarchical Memory (GEMINI.md files)

**What:**
- Global memory: `~/.gemini/settings/instructions.md`
- Extension memory: `~/.gemini/extensions/*/instructions.md`  
- Project memory: `<workspace>/GEMINI.md`

**Where injected:** Wrapped via `renderFinalShell()` after system prompt

**Source:** `~/code/gemini-cli/packages/core/src/prompts/snippets.ts:126-136`

### 4. Tools

**How delivered:** Passed structurally

---

## Detailed Comparison: Where Each Type of Content Goes

### Environment Information

| System | Where | Message Type | Cache Impact |
|--------|-------|--------------|--------------|
| **OpenCode** | In system[0] | N/A (system content) | HIGH — any env change invalidates prefix |
| **Codex** | Separate user message | `role: "user"` | MEDIUM — base system stable, but first message changes |
| **Gemini CLI** | First user message | `role: "user"` | MEDIUM — base system stable |

### Mode Transitions (Plan ↔ Build)

| System | Where | Message Type | Cache Impact |
|--------|-------|--------------|--------------|
| **OpenCode** | Latest user message parts | `synthetic: true` text | LOW — only affects messages after injection |
| **Codex** | Developer message | `role: "developer"` | LOW — appended, not prefix |
| **Gemini CLI** | Different snippet sections | System prompt sections | MEDIUM — different workflow sections |

### Model Switches

| System | Where | Message Type | Cache Impact |
|--------|-------|--------------|--------------|
| **OpenCode** | system[0] template swap | System | HIGH — completely new template |
| **Codex** | Developer message | `role: "developer"` with `<model_switch>` | LOW — base instructions stay same |
| **Gemini CLI** | Snippet selection | System (modern vs legacy) | MEDIUM — different snippet set |

### Instruction Files (AGENTS/GEMINI)

| System | Where | When Loaded | Refreshes? |
|--------|-------|-------------|------------|
| **OpenCode** | input.system | Every turn (re-reads) | Yes (immediate) |
| **Codex** | User instructions item | Session start only | No (known limitation) |
| **Gemini CLI** | renderFinalShell() | Session start | No (memory-based) |

---

## Cache Friendliness Ranking

**Best to Worst for Prompt Caching:**

1. **Gemini CLI** 🏆
   - System prompt is purely instructional, no env baked in
   - Environment is first user message (stable across turns within session)
   - No per-turn updates injected
   - Date only changes daily

2. **Codex** 🥈
   - Base instructions stable
   - Environment is user message (not system)
   - Developer message updates are append-only, not prefix changes
   - Known issue: AGENTS.md doesn't refresh mid-session

3. **OpenCode** 🥉
   - Environment directly in system[0] — any change hits cache hard
   - Date/cwd in system prompt — daily/folder changes = cache miss
   - Plan/build reminders injected into user messages (less bad than system changes)

---

## Markup Languages Used

| System | System Prompt | User/Dev Messages |
|--------|--------------|-------------------|
| **OpenCode** | Markdown + XML tags (`<examples>`, `<env>`, `<system-reminder>`) | XML tags in user message parts |
| **Codex** | Pure Markdown | XML tags in messages (`<environment_context>`, `<model_switch>`) |
| **Gemini CLI** | Pure Markdown | XML tags in user message (`<session_context>`, `<hook_context>`) |

---

## Recommendations for Buddy

Based on this analysis, for maximum cache efficiency:

1. **Keep environment OUT of system prompt** — Use Gemini CLI's approach (first user message) or Codex's approach (separate user message)

2. **Use append-only developer messages for updates** — Like Codex's update items, not OpenCode's system[0] concatenation

3. **Make plan/build mode a section swap, not a reminder injection** — Gemini CLI does this well

4. **Don't re-read instruction files every turn** — Cache the AGENTS.md content at session start like Codex (or fix Codex's limitation)

5. **Separate volatile from stable content:**
   - Stable: Core instructions, tool policies, workflow definitions
   - Volatile: Environment, date, mode reminders

---

## Source Files

### OpenCode
- `~/code/opencode/packages/opencode/src/session/llm.ts` — System prompt assembly
- `~/code/opencode/packages/opencode/src/session/system.ts` — Environment construction
- `~/code/opencode/packages/opencode/src/session/prompt.ts` — Reminder injection
- `~/code/opencode/packages/opencode/src/session/prompt/build-switch.txt` — Plan/build reminder text

### Codex
- `~/code/codex/codex-rs/core/src/codex.rs` — Prompt assembly
- `~/code/codex/codex-rs/core/src/context_manager/updates.rs` — Developer message types
- `~/code/codex/codex-rs/core/src/environment_context.rs` — Environment context
- `~/code/codex/codex-rs/protocol/src/prompts/base_instructions/default.md` — Base instructions

### Gemini CLI
- `~/code/gemini-cli/packages/core/src/prompts/promptProvider.ts` — Main orchestration
- `~/code/gemini-cli/packages/core/src/prompts/snippets.ts` — Snippet composition
- `~/code/gemini-cli/packages/core/src/utils/environmentContext.ts` — Environment context
