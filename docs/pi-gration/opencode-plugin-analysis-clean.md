# OpenCode SDK v2 & Plugin System Analysis

> Research date: 2026-05-23
> Source repo: `~/code/opencode` (`anomalyco/opencode`, branch `dev`, 1.15.7)
> Vendored version in this project: 1.15.4 (3 patch versions behind, hooks identical)
> Assessed by: cross-referencing the hypothesis against multiple independent agents; this is the corrected, consensus-informed version.

## Table of Contents

1. [Summary & Revised Hypothesis](#summary--revised-hypothesis)
2. [Key Files Examined](#key-files-examined)
3. [SDK v1 vs v2](#sdk-v1-vs-v2)
4. [Plugin System — Hook-by-Hook Audit](#plugin-system--hook-by-hook-audit)
5. [Tool Registry](#tool-registry)
6. [HTTP Route Structure](#http-route-structure)
7. [Event / Streaming Model](#event--streaming-model)
8. [Message Formats Compared](#message-formats-compared)
9. [The Three Gaps — Deep Dive](#the-three-gaps--deep-dive)
10. [Buddy Migration Paths](#buddy-migration-paths)
11. [What Patches Get Replaced vs What Remains](#what-patches-get-replaced-vs-what-remains)
12. [Effort Estimate](#effort-estimate)
13. [Recommendation](#recommendation)
14. [Appendix A: Architecture Comparison](#appendix-a-architecture-comparison--what-moves-where)
15. [Appendix B: Upstream Sync Pain Assessment](#appendix-b-upstream-sync-pain-assessment)

---

## Summary & Revised Hypothesis

**Hypothesis:** OpenCode's plugin system + SDK HTTP API can implement the majority of Buddy's custom agent behavior (tools, system prompts, message transformation, slash commands, compaction hooks) via published, maintained plugin hooks. Three capabilities (permission evaluation, subagent forwarding, dynamic tool session grants) require either the SDK HTTP API, the config file system, or the existing adapter patches — none of which regress from the current architecture.

**Verdict:** Plausible with caveats. The plugin approach is a meaningful improvement over the current architecture, but the improvement is more modest than originally claimed.

- **1 of 4 adapter patches** becomes a clean plugin hook (`system-prompt-guard` → `experimental.chat.system.transform`)
- **2-3 patches remain** (subagent forwarding + task forwarding + skill filtering) because they monkey-patch internal OpenCode operations (promptOps wrapping, skill service filtering) that have no plugin hook equivalents
- **Zero frontend changes** — the v1 message format is preserved
- **Single runtime** — no second agent loop alongside OpenCode
- **Effort: ~2,000-3,000 lines** — realistic for the full migration

The real win is consolidating Buddy's agent behavior into published plugin hooks where possible, and reducing the number of internal OpenCode API surfaces that Buddy depends on. Incremental wins (removing patches one at a time as OpenCode adds hooks) can happen over time.

**Key caveats:**

- `permission.ask` is defined in the plugin type interface but **never triggered**. Permissions work through the SDK HTTP API — same as today.
- Subagent forwarding + task forwarding have **no plugin hook equivalents**. Both wrap internal prompt operations. They stay as adapter patches, potentially consolidated into one.
- Skill filtering has **no plugin hook equivalent**. It monkey-patches an adapter service. Could be approximated via config but not a clean hook replacement.
- Dynamic tool visibility requires a **session permission strategy** (pre-register all tools, toggle permission entries via SDK), not just `tool.definition`.
- The v2 prompt endpoint returns `OperationUnavailableError`. v1 prompt is sufficient.
- Effort: ~2,000-3,000 lines.

---

## Key Files Examined

### SDK Layer
| File | Lines | Purpose |
|---|---|---|
| `packages/sdk/js/src/client.ts` | 52 | v1 SDK client factory |
| `packages/sdk/js/src/v2/client.ts` | 89 | v2 SDK client factory (workspace support, version mismatch guard) |
| `packages/sdk/js/src/v2/index.ts` | 20 | v2 entry: `createOpencode()` (spawns server + creates client) |
| `packages/sdk/js/src/v2/server.ts` | 134 | `createOpencodeServer()` (spawns binary, parses URL from stdout) |
| `packages/sdk/js/src/gen/types.gen.ts` | 3,910 | v1 types: `Session`, `UserMessage`, `AssistantMessage`, 13 `Part` types |
| `packages/sdk/js/src/v2/gen/types.gen.ts` | 8,224 | v2 types: `Model`, `Provider`, `SessionV2Info`, all streaming events |
| `packages/sdk/js/src/gen/sdk.gen.ts` | 1,235 | v1 SDK methods |
| `packages/sdk/js/src/v2/gen/sdk.gen.ts` | 5,035 | v2 SDK methods |

### Plugin System
| File | Lines | Purpose |
|---|---|---|
| `packages/plugin/src/index.ts` | 230 | **Critical:** `Hooks` interface (19 hooks + `tool`), `PluginInput`, `AuthHook` |
| `packages/plugin/src/tool.ts` | 60 | `tool()` factory (Zod-based), `ToolContext`, `ToolResult` |
| `packages/opencode/src/plugin/index.ts` | 300 | Plugin loader, `INTERNAL_PLUGINS`, hook trigger, bus subscription |
| `packages/opencode/src/plugin/loader.ts` | 52 | External plugin npm install + dynamic import |
| `packages/opencode/src/plugin/codex.ts` | 67 | Example: Codex auth internal plugin |
| `packages/opencode/src/plugin/xai.ts` | 742 | Example: xAI provider plugin |

### Tool Registry
| File | Lines | Purpose |
|---|---|---|
| `packages/opencode/src/tool/registry.ts` | 482 | ToolRegistry: built-ins + file-based + plugin tools, `fromPlugin()` bridge |
| `packages/opencode/src/tool/tool.ts` | 31 | Tool base class, Effect-based execution |
| `packages/core/src/session-message.ts` | 138 | v2 `SessionMessage.Message` format (User, Assistant, Shell, Compaction, etc.) |
| `packages/core/src/session-event.ts` | 270 | All `session.next.*` streaming events |
| `packages/opencode/src/session/tools.ts` | 208 | Per-session tool resolution (permission + config filtering) |

### v2 Server (In Progress)
| File | Lines | Purpose |
|---|---|---|
| `packages/opencode/src/v2/session.ts` | 224 | SessionV2: create, get, list, messages, context, prompt (stub), compact (stub), wait (stub), subagent (working) |
| `packages/core/src/event.ts` | 78 | EventV2 infrastructure |
| `packages/core/src/agent.ts` | 140 | AgentV2 service |
| `packages/opencode/src/event-v2-bridge.ts` | 84 | Maps v2 events → legacy bus/sync format |
| `specs/v2/instructions.md` | 121 | v2 architecture direction: "core + plugins" |

### Server HTTP Routes
| File | Lines | Purpose |
|---|---|---|
| `packages/opencode/src/server/routes/instance/httpapi/handlers/v2/session.ts` | 208 | v2 session handlers |
| `packages/opencode/src/server/routes/instance/httpapi/handlers/v2/message.ts` | 62 | v2 message handlers (cursor-paginated) |

### Buddy Current Architecture (for comparison)
| File | Lines | Purpose |
|---|---|---|
| `packages/buddy/src/http/proxy.ts` | 83 | HTTP proxy to vendored OpenCode (would be deleted) |
| `packages/buddy/src/http/proxy/body.ts` | 132 | Proxy body preparation (would be deleted) |
| `packages/buddy/src/http/proxy/fetch.ts` | 49 | Proxy fetch to internal OpenCode server (would be deleted) |
| `packages/buddy/src/http/proxy/registration.ts` | 61 | Proxy tool registration flags (would be deleted) |
| `packages/buddy/src/opencode-runtime/session-prompt-tool-forwarding.ts` | 32 | Subagent forwarding adapter patch (WOULD BE RETAINED) |
| `packages/buddy/src/opencode-runtime/task-tool-forwarding.ts` | 80 | Task tool forwarding patch (replaced by `tool.execute.before`) |
| `packages/buddy/src/opencode-runtime/skill-filtering.ts` | 10 | Skill visibility filtering (replaced by plugin `skillsOverride`) |
| `packages/buddy/src/opencode-runtime/system-prompt-guard-plugin.ts` | 183 | System prompt guard (replaced by `experimental.chat.system.transform`) |
| `packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts` | 478 | Subagent tool forwarding logic |
| `packages/buddy/src/learning/runtime/create-buddy-tool.ts` | 409 | Buddy tool factory (tools become plugin `tool` exports) |

---

## SDK v1 vs v2

### Client Setup Pattern

Both versions use `@hey-api/openapi-ts` auto-generated clients. Both are HTTP clients — neither provides an embeddable runtime.

**v1:**
```ts
createOpencodeClient({ directory: "/path" })
// Adds x-opencode-directory header, rewrites to query param for GET/HEAD
```

**v2:**
```ts
createOpencodeClient({ directory: "/path", experimental_workspaceID: "..." })
// Adds workspace support + version mismatch HTML guard
```

### Session API — What's Working vs Not

| Operation | v1 route | v2 route | v2 status |
|---|---|---|---|
| List | `GET /session` → flat array | `GET /api/session` → `{ items, cursor }` | ✅ |
| Create | `POST /session` | `POST /session` (typed body) | ✅ |
| Get | `GET /session/{id}` | Same (v1 client) | ✅ |
| Delete | `DELETE /session/{id}` | Same (v1 client) | ✅ |
| Status | `GET /session/status` | Same | ✅ |
| Messages | `GET /session/{id}/message` → flat array | `GET /api/session/{id}/message` → `{ items, cursor }` | ✅ |
| **Prompt** | `POST /session/{id}/message` | `POST /api/session/{id}/prompt` | ❌ **v2 stub** (v1 works) |
| Prompt async | `POST /session/{id}/prompt_async` | Not present | N/A |
| Command | `POST /session/{id}/command` | Not present | N/A |
| **Compact** | `POST /session/{id}/summarize` | `POST /api/session/{id}/compact` | ❌ **v2 stub** (v1 works) |
| **Wait** | Not present | `POST /api/session/{id}/wait` | ❌ **v2 stub** |
| Context (post-compaction) | Not present | `GET /api/session/{id}/context` | ✅ |
| Revert/unrevert | `POST /session/{id}/revert`, `/unrevert` | Not present | N/A |

---

## Plugin System — Hook-by-Hook Audit

This is the most important section. Each hook is assessed for: **is it triggered by OpenCode?** and **does Buddy need it?**

### ✅ Hooks That Are Triggered AND Buddy Needs

| Hook | Triggered in | Buddy use |
|---|---|---|
| **`tool`** (static export) | Plugin loading (`tool/registry.ts:281-288`) | All Buddy learning tools (flashcard, question-set, figure rendering, ingest_full_text, etc.). Uses Zod (same as Buddy's `createBuddyTool`). |
| **`tool.execute.before`** | `session/tools.ts` (for every tool call) + `session/prompt.ts:582` (for task tool) | Intercept tool calls, validate args, modify behavior per teaching state. |
| **`tool.execute.after`** | `session/tools.ts` (for every tool result) + `session/prompt.ts:597` (for task tool) | Modify tool results, inject learning metadata, trigger teaching state updates. |
| **`tool.definition`** | `tool/registry.ts:336` (when building tool list for LLM) | Modify tool descriptions sent to the model. Can hide tools by clearing descriptions, add persona-specific instructions. |
| **`chat.message`** | `session/prompt.ts:1472` (after resolving prompt parts, before save) | Inject learner context (profile, goals, active reading state) into outgoing user messages. |
| **`chat.params`** | `session/llm.ts:161` (LLM parameter resolution) | Set temperature, max tokens, thinking level per persona and teaching workspace state. |
| **`chat.headers`** | `session/llm.ts:181` (LLM request building) | Inject custom headers for provider routing. |
| **`experimental.chat.system.transform`** | `agent/agent.ts:394` + `session/llm/request.ts:68` | Inject persona-specific system prompts. This replaces `buddy-system-prompt-guard-plugin.ts` (183 lines). |
| **`experimental.chat.messages.transform`** | `session/prompt.ts:1810` + `session/compaction.ts:405` | Transform full message history before sending to LLM. |
| **`command.execute.before`** | `session/prompt.ts:1985` (slash command execution) | Handle `/flashcard`, `/question-set`, and other Buddy slash commands. Modify parts before they become a prompt. |
| **`shell.env`** | `pty/index.ts:185` + `session/prompt.ts:1014` + `tool/shell.ts:413` | Inject environment variables into shell sessions. |
| **`experimental.session.compacting`** | `session/compaction.ts:398` | Customize compaction behavior, inject Buddy-specific compaction context. |
| **`experimental.compaction.autocontinue`** | `session/compaction.ts:509` | Control whether the agent auto-continues after compaction. |
| **`experimental.text.complete`** | `session/processor.ts:595` | Custom text completion for streaming text parts. |

### ⚠️ Hooks That Are Triggered But Buddy Has Limited Use For

| Hook | Buddy use |
|---|---|
| `event` | Subscribe to all bus events. Could be used for session lifecycle tracking, but Buddy already gets events via SSE. |
| `config` | Notification-only callback (`(input: Config) => Promise<void>`, no mutable output). Cannot mutate config. Useful for reacting to changes but not for registration. |
| `auth` | Custom auth providers. Buddy uses standard OpenAI/OpenCode auth — no custom provider needed. |
| `provider` | Custom model providers. Buddy uses standard providers. |

### ❌ Hooks That Are NOT Triggered (Defined But Dead Code)

| Hook | Status | Buddy impact |
|---|---|---|
| **`permission.ask`** | Defined in `packages/plugin/src/index.ts:260`. Zero calls to `plugin.trigger("permission.ask", ...)` anywhere in the repo. | **Does not block Buddy.** Permissions work through the SDK HTTP API (`GET /permission`, `POST /permission/{id}/reply`) + bus events (`permission.asked`, `permission.replied`). This is the same mechanism Buddy uses today. The hook being dead doesn't matter — the HTTP API is the actual permission surface. |

### The Hook Trigger List (verified from vendored code)

```
plugin.trigger("tool.execute.before", ...)      ← session/tools.ts, session/prompt.ts (multiple)
plugin.trigger("tool.execute.after", ...)       ← session/tools.ts, session/prompt.ts (multiple)
plugin.trigger("tool.definition", ...)          ← tool/registry.ts
plugin.trigger("chat.message", ...)             ← session/prompt.ts
plugin.trigger("chat.params", ...)              ← session/llm.ts
plugin.trigger("chat.headers", ...)             ← session/llm.ts
plugin.trigger("experimental.chat.system.transform", ...)  ← agent/agent.ts, session/llm/request.ts
plugin.trigger("experimental.chat.messages.transform", ...) ← session/prompt.ts, session/compaction.ts
plugin.trigger("command.execute.before", ...)   ← session/prompt.ts
plugin.trigger("shell.env", ...)                ← pty/index.ts, session/prompt.ts, tool/shell.ts
plugin.trigger("experimental.session.compacting", ...)     ← session/compaction.ts
plugin.trigger("experimental.compaction.autocontinue", ...) ← session/compaction.ts
plugin.trigger("experimental.text.complete", ...)          ← session/processor.ts
```

---

## Tool Registry

### Registration Order

```ts
// 1. Built-in tools (always loaded): ShellTool, ReadTool, GlobTool, GrepTool,
//    EditTool, WriteTool, TaskTool, TaskStatusTool, WebFetchTool, TodoWriteTool,
//    WebSearchTool, RepoCloneTool, RepoOverviewTool, SkillTool, ApplyPatchTool,
//    QuestionTool (conditional), LspTool (conditional), PlanExitTool (conditional)

// 2. File-based custom tools: scanned from {tool,tools}/*.{js,ts} in config dirs

// 3. Plugin-based tools: iterates plugin.list(), then p.tool entries
```

### Plugin Tool Bridge (`fromPlugin`)

Plugin tools use **Zod** schemas — same as Buddy's `createBuddyTool`. The registry bridges Zod → JSON Schema → Effect internally:

```ts
function fromPlugin(id: string, def: ToolDefinition): Tool.Def {
  const zodParams = z.object(def.args ?? {})
  const jsonSchema = zodToJsonSchema(zodParams)
  return {
    id,
    parameters: Schema.declare(u => zodParams.safeParse(u).success),
    jsonSchema,
    description: def.description,
    execute: (args, toolCtx) => Effect.gen(function* () {
      const pluginCtx = {
        ...toolCtx,
        ask: (req) => bridge.promise(toolCtx.ask(req)),
        directory, worktree,
      }
      const result = yield* Effect.promise(() => def.execute(args, pluginCtx))
      return { title, output, attachments, metadata: { ...metadata, truncated } }
    })
  }
}
```

Plugin `ToolContext` provides: `sessionID`, `messageID`, `agent`, `directory`, `worktree`, `abort: AbortSignal`, `metadata(input)` for progress updates, `ask(input)` for permission requests.

---

## HTTP Route Structure

### v1 Routes (all working today — sufficient for plugin approach)

```
/session                           [GET, POST]
/session/status                    [GET]
/session/{id}                      [GET, PATCH, DELETE]
/session/{id}/message              [GET, POST]
/session/{id}/prompt_async         [POST]
/session/{id}/command              [POST]
/session/{id}/summarize            [POST]
/session/{id}/revert               [POST]
/session/{id}/unrevert             [POST]
/session/{id}/children             [GET]
/session/{id}/abort                [POST]

/provider                          [GET]
/provider/auth                     [GET]
/provider/{id}/oauth/authorize     [POST]
/provider/{id}/oauth/callback      [POST]

/auth/{id}                         [PUT, DELETE]
/mcp                               [GET, POST]
/mcp/{name}/connect                [POST]
/mcp/{name}/disconnect             [POST]
/mcp/{name}/auth                   [POST, DELETE]
/mcp/{name}/auth/callback          [POST]
/mcp/{name}/auth/authenticate      [POST]

/permission                        [GET]
/permission/{id}/reply             [POST]

/question                          [GET]
/question/{id}/reply               [POST]
/question/{id}/reject              [POST]

/config                            [GET, PATCH]
/config/providers                  [GET]
/command                           [GET]
/file                              [GET]
/file/content                      [GET]
/file/{name}                       [GET, HEAD]
/find/file                         [GET]
/project                           [GET]
/project/current                   [GET]
/project/{id}                      [PATCH]
/global/health                     [GET]
/global/event                      [GET]  (SSE)
/global/dispose                    [POST]
/tool/ids                          [GET]
/tool/list                         [GET]
```

---

## Event / Streaming Model

### The Bridge Architecture

```
Agent Loop
    │  publishes session.next.* events
    ▼
EventV2.Service  (packages/core/src/event.ts)
    │
    ▼
EventV2Bridge  (packages/opencode/src/event-v2-bridge.ts)
    ├─→ SyncEvent.Service  (cross-client sync with seq numbers)
    └─→ Bus.Service        (in-process legacy consumers)
         │
         ▼
    SSE /api/global/event  (web clients like Buddy)
         │
         ▼
    message.updated / message.part.updated / message.part.delta
```

### v2 Streaming Events (already published)

```
session.next.agent.switched       session.next.model.switched
session.next.prompted             session.next.synthetic
session.next.shell.started        session.next.shell.ended
session.next.step.started         session.next.step.ended        session.next.step.failed
session.next.text.started         session.next.text.delta        session.next.text.ended
session.next.reasoning.started    session.next.reasoning.delta   session.next.reasoning.ended
session.next.tool.input.started   session.next.tool.input.delta  session.next.tool.input.ended
session.next.tool.called          session.next.tool.progress     session.next.tool.success
session.next.tool.failed
session.next.retried
session.next.compaction.started   session.next.compaction.delta  session.next.compaction.ended
```

---

## Message Formats Compared

| Format | Types | Streaming model | Frontend impact |
|---|---|---|---|
| **OpenCode v1** (`MessageV2.WithParts`) | 2 info roles + 13 part types in flat array | `message.updated` (full replace) + `message.part.delta` (field append) | Current format. Zero changes needed. |
| **OpenCode v2** (`SessionMessage.Message`) | 7 message types, 3 assistant content types | `session.next.*` delta events per content block | Future. Cleaner, but requires frontend SSE handler rewrite. |

**Key insight:** The plugin approach keeps the v1 message format. Zero frontend changes are needed — the existing message handling code continues to work unchanged.

---

## The Three Gaps — Deep Dive

### Gap 1: Permission Evaluation

**Claim:** The plugin system supports permissions via `permission.ask` hook.

**Reality:** The hook is defined but never triggered. Permission evaluation happens inside OpenCode's `Permission.ask()` method, which:
1. Evaluates against the merged ruleset (config + session + approved patterns)
2. If "deny", throws `Permission.DeniedError`
3. If "allow", returns immediately
4. If "ask", publishes `permission.asked` bus event and waits on a Deferred

Buddy's frontend receives `permission.asked` via SSE and replies via `POST /permission/{id}/reply`. This flow works entirely through the existing SDK HTTP API — no plugin hook needed.

**Buddy's permission model** (`session-permissions.ts`, `runtime-session-permissions.ts`) merges teaching session runtime, dynamic tool deny rules, subagent IDs, and skill names into a ruleset. On `main`, this ruleset is set on the session. On the plugin path, the same ruleset would be set via the SDK's session update API. The plugin itself doesn't need to intercept permission evaluation — the merged ruleset does the work.

**Impact:** No blocker. The HTTP API covers it. The `permission.ask` hook being dead code is irrelevant.

### Gap 2: Subagent Forwarding

**Claim:** Subagents are covered by the plugin system.

**Reality:** This is the deepest gap. Buddy's subagent forwarding (`subagent-tool-forwarding.ts`, 478 lines) does things no plugin hook can replicate:

1. **Persona visibility resolution** — determines which tools a persona can see, applies tool overrides from the parent user prompt
2. **Teaching state seeding** — when a subagent session is created, Buddy writes `TeachingSessionState` into the child session so it knows the persona, surface, workspace state, and focus goals
3. **Custom tool override maps** — builds `ToolOverrideMap` based on inherited tools minus subagent-denied tools plus specialized subagent tools
4. **Session permission wrapping** — modifies the child session's permission ruleset at spawn time based on forwarded tool visibility

None of these have plugin hook equivalents. The closest thing OpenCode has is `tool.execute.before` on the task tool, which lets you modify task tool args. That's not enough — you need to intercept the **session creation and permission setup** for the child session.

**On `main`, this works through two adapter patches:**
- `SessionPrompt.registerPromptInputInterceptor` — intercepts prompt inputs, runs subagent forwarding before the prompt hits the agent
- `ToolRegistry.registerToolDefTransformer` — patches the task tool to also run forwarding

**Plugin path:** These patches would be retained. The plugin cannot replace them. However, the plugin CAN handle other task tool concerns (via `tool.execute.before`), so the `ToolRegistry.registerToolDefTransformer` patch becomes simpler (just the forwarding logic, not the general interceptor).

**What would need to happen for full plugin coverage:** OpenCode would need to add:
- A `session.subagent.spawn` hook that fires before child session creation, with mutable output for tools, permissions, and state
- Or: a way to specify a "session factory" that plugins can provide

Neither exists today. Until they do, Buddy keeps the `SessionPrompt.registerPromptInputInterceptor` patch.

**Impact:** This is the one area where the plugin approach requires retaining a vendored OpenCode patch. This is not a regression from the current architecture — the current code already uses this patch. But it means the promise of "no vendored internals hacking" is not fully achievable today.

### Gap 3: Dynamic Tool Session Grants

**Claim:** `tool.definition` can handle dynamic tool visibility without re-registration.

**Reality:** `tool.definition` modifies the **description and parameters** sent to the LLM. It does not control **actual runtime availability**. Tool availability is determined by:
1. Agent permission ruleset
2. Session permission ruleset
3. `user.tools` map on the user message

The effective approach for dynamic tools under the plugin model:
1. **Pre-register all possible dynamic tools** (reflection, debug_attempt, question, etc.) as plugin tool exports
2. **Default to disabled** by setting their agent permission to `"deny"` with a distinctive pattern
3. **When a session needs them**, update the session's permission ruleset via the SDK HTTP API to `"allow"` for specific tools
4. **Use `tool.definition`** to modify their descriptions when they become available (helpful for the LLM, but not the actual gating mechanism)

This is a **different design** from what Buddy does today (register/unregister tools at runtime) but is functionally equivalent. It's actually more aligned with OpenCode's permission model. The downside: all tools must be known at plugin load time. New dynamic tools added later require plugin reload (instance disposal).

**Buddy's teaching session state** (`.buddy` files) would still track which tools are granted per session, but instead of calling `registerBuddyTools()` / `unregisterBuddyTools()`, it would call the SDK's session permission update API.

**Impact:** Workable, but requires a design change from register/unregister to permission toggling. Not a blocker.

---

## Buddy Migration Paths

### Path 1: Buddy as OpenCode Plugin (RECOMMENDED)

**Architecture:**
```
Browser → Buddy SDK → Buddy Hono server
                         │
                         ├─ /api/session/*   → createOpencodeClient().session.*    (direct SDK)
                         ├─ /api/provider/*   → createOpencodeClient().provider.*   (direct SDK)
                         ├─ /api/mcp/*       → createOpencodeClient().mcp.*        (direct SDK)
                         ├─ /api/permission/* → createOpencodeClient().permission.* (direct SDK)
                         ├─ /api/question/*   → createOpencodeClient().question.*   (direct SDK)
                         ├─ /api/learner/*   → Buddy teaching state (unchanged)
                         ├─ /api/config/*    → Buddy config + OpenCode config (unchanged)
                         └─ /api/global/*    → createOpencodeClient().global.*     (direct SDK)
                                │
                                ▼  HTTP (or in-process if vendored)
                         OpenCode server process
                            │
                            ├─ Buddy plugin (loaded at instance init)
                            │     ├─ tool: { save_flashcard_deck, ingest_full_text,
                            │     │          render_figure, render_mermaid, ... }
                            │     ├─ experimental.chat.system.transform → persona system prompts
                            │     ├─ chat.message → learner context injection
                            │     ├─ chat.params → model parameters per persona
                            │     ├─ command.execute.before → slash commands
                            │     ├─ tool.execute.before/after → learning tool hooks
                            │     ├─ tool.definition → dynamic tool description toggles
                            │     └─ experimental.session.compacting → compaction behavior
                            │
                            ├─ Adapter patches (RETAINED from main)
                            │     └─ SessionPrompt.registerPromptInputInterceptor → subagent forwarding
                            │
                            └─ Built-in tools (unchanged)
                                  bash, read, write, edit, grep, glob, apply_patch, ...
```

**What changes in Buddy:**

| Action | Files | Lines |
|---|---|---|
| Create plugin package | `packages/buddy-plugin/src/index.ts`, `packages/buddy-plugin/src/tools/*`, `packages/buddy-plugin/src/system-prompt.ts`, `packages/buddy-plugin/src/permissions.ts` | ~600-800 |
| Delete proxy layer | `http/proxy.ts` + `proxy/` directory (4 files) | -325 |
| Simplify routes to SDK calls | `routes/session.ts`, `routes/auth.ts`, `routes/provider.ts`, `routes/mcp.ts`, `routes/permission.ts`, `routes/question.ts`, `routes/compatibility.ts`, `routes/config.ts` | ~200 changes |
| Remove replaced patches | `opencode-runtime/system-prompt-guard-plugin.ts`, `opencode-runtime/task-tool-forwarding.ts`, `opencode-runtime/skill-filtering.ts` (3 files) | -273 |
| Retain subagent forwarding patch | `opencode-runtime/session-prompt-tool-forwarding.ts` (1 file) | 32 (unchanged) |
| No frontend changes | — | 0 |
| **Net** | | **~1,500-2,500 added, ~600 removed** |

**Pros:**
- System prompt guard (183 lines) becomes a published plugin hook — a clean win over the current architecture
- Partial win on other patches: 2 forwarding patches remain but could be consolidated into one
- Zero frontend changes (v1 message format preserved)
- Plugin gets full SDK client for API access

**Cons:**
- 2-3 of the 4 adapter patches remain (subagent forwarding + task forwarding + skill filtering)
- Subagent forwarding is the hardest remaining problem — no clean plugin hook equivalent exists
- Dynamic tools need design change to permission-toggling model
- v2 prompt not ready (v1 sufficient for all current use cases)
- Plugin must be loaded as npm-installed external plugin or registered as internal plugin
- The patch reduction is real but modest (1 of 4)

### Path 2: Continue vendored OpenCode + proxy (current architecture)

**Status:** Works. 325 lines of proxy code. All features working. 4 adapter patches in active use.

**Pros:** Zero migration risk. Battle-tested. All OpenCode tools available.

**Cons:** 4 vendored internals patches to maintain. Proxy layer is brittle. Every new feature requires understanding both Buddy's code and OpenCode's internals.

### Path 3: SDK alone (no internals, no plugin)

**Not viable.** The SDK has no APIs for custom tool registration, system prompt injection, runtime permission modification, subagent tool forwarding, or dynamic tool visibility.

---

## What Patches Get Replaced vs What Remains

### Current `main` Patches (4 total)

| Patch | Lines | Plugin equivalent |
|---|---|---|
| `system-prompt-guard-plugin.ts` | 183 | ✅ Replaced by `experimental.chat.system.transform` hook |
| `task-tool-forwarding.ts` | 80 | ❌ **NOT replaceable by `tool.execute.before`.** This patch wraps `promptOps.prompt()` — the internal prompt operation the task tool uses to spawn child sessions. `tool.execute.before` only mutates `{ args }` before execution; it cannot intercept internal prompt ops. Same class of patch as `session-prompt-tool-forwarding.ts`. The two could potentially be consolidated into a single adapter hook. |
| `skill-filtering.ts` | 10 | ❌ **NOT directly replaceable.** This calls `setSkillVisibilityFilter()` on the `@buddy/opencode-adapter/skill-live` monkey-patch. There is no OpenCode plugin hook for skill visibility filtering. Could be approximated via config `skills.paths` entries or agent permission rules, but not a drop-in plugin hook replacement. |
| `session-prompt-tool-forwarding.ts` | 32 | ❌ **RETAINED** — adapter `SessionPrompt.registerPromptInputInterceptor`. No plugin hook equivalent for subagent forwarding session spawn interception. |

**Net: 1 of 4 patches becomes a clean plugin hook. 2-3 are retained (or 2 if the two forwarding patches are consolidated into one adapter hook).**

---

## Effort Estimate

### The Plugin Approach (Path 1)

| Work item | LOC | Notes |
|---|---|---|
| Plugin entry point + tool exports | 400-500 | Port all Buddy tools to Zod-based `tool()` factory |
| System prompt hook implementation | 150-200 | Persona-specific prompts, learner context formatting |
| Message transform hook | 100-150 | Active reading context, workspace file references |
| Slash command hook | 80-120 | /flashcard, future commands |
| Permission integration (SDK API) | 100-150 | Call SDK permission APIs from Hono routes |
| Dynamic tool strategy | 150-200 | Session permission toggling, tool.definition mutator |
| Route simplification | 200-300 | Replace proxyToOpenCode() with SDK calls |
| Plugin packaging/config | 100-150 | npm package setup, registration mechanism |
| Remove proxy layer | -325 | Delete 4 files |
| Remove replaced patches | -273 | Delete 3 files |
| Test updates | ~200-300 | Updated tests for removed/replaced code |
| **Net new** | **~2,000-3,000** | |

---

## Recommendation

### Short term (now): Build Buddy as an OpenCode plugin

This is the lightest migration path and the most maintainable long-term architecture.

1. **Create the plugin package:**
   - Export all Buddy learning tools as `tool` definitions (Zod-based, same as current)
   - Implement `experimental.chat.system.transform` for persona system prompts
   - Implement `chat.message` for learner context injection
   - Implement `command.execute.before` for slash commands
   - Implement `tool.execute.before/after` for learning tool hooks
   - Implement `tool.definition` for dynamic tool descriptions

2. **Keep adapter patches** for subagent forwarding, task forwarding, and skill filtering. Watch for upstream OpenCode to add session spawn and skill visibility hooks.

3. **Simplify Hono routes** to direct SDK calls (remove proxy layer, 4 files).

4. **Use SDK HTTP API for permissions** — same mechanism as today.

5. **Pre-register all dynamic tools, toggle via session permissions** — design change but functionally equivalent.

### Medium term (when v2 prompt ships): Migrate to v2 SDK

When `SessionV2.prompt()` returns actual messages:
- Switch from v1 prompt to v2 prompt
- Adopt cursor-based pagination
- Use `wait()` for async prompt completion
- Adopt `SessionMessage.Message` format (cleaner, 7 types vs 13 parts)

No architecture change needed — just API call updates.

### Long term: Remove the last adapter patch

When OpenCode adds a session spawn hook (or equivalent), remove `session-prompt-tool-forwarding.ts`. At that point, Buddy has zero vendored OpenCode patches.

---

---

## Appendix A: Architecture Comparison — What Moves Where

### Today (main)

```
Buddy Hono ──proxy (325 lines)──▶ OpenCode server (vendored, in-process)
    │                                  │
    │                                  ├─ 4 adapter patches modify behavior
    │                                  │    ├─ plugins/buddy-system-prompt-guard.ts (183 lines, loaded via config overlay)
    │                                  │    ├─ task-tool-forwarding.ts (80 lines)
    │                                  │    ├─ session-prompt-tool-forwarding.ts (32 lines)
    │                                  │    └─ skill-filtering.ts (10 lines)
    │                                  │
    │                                  ├─ Buddy config overlay (setConfigOverlay)
    │                                  └─ Built-in tools (bash, read, write, edit, etc.)
    │
    └─ Buddy-owned routes (learner memory, teaching state, config, file serving)
```

### Plugin Approach

```
Buddy Hono ──SDK (HTTP)──▶ OpenCode server (vendored, in-process)
    │                           │
    │                           ├─ Buddy plugin (loaded at instance init)
    │                           │    ├─ tool: { all Buddy learning tools }         ← was registerBuddyTools() (vendored API)
    │                           │    ├─ experimental.chat.system.transform          ← was plugins/buddy-system-prompt-guard.ts (already a plugin, now consolidated)
    │                           │    ├─ chat.message                               ← was message-prompt-pipeline.ts (partially — prelude parts, learner context)
    │                           │    ├─ command.execute.before                     ← was session routes → OpenCode command path
    │                           │    ├─ tool.execute.before/after                   ← new capability (not in proxy today)
    │                           │    ├─ chat.params / chat.headers                 ← new capability (not in proxy today)
    │                           │    └─ tool.definition / compaction hooks          ← new capability
    │                           │
    │                           ├─ 2-3 adapter patches RETAINED
    │                           │    ├─ session-prompt-tool-forwarding.ts (32 lines)    ← SAME AS MAIN
    │                           │    ├─ task-tool-forwarding.ts (80 lines)              ← SAME AS MAIN
    │                           │    └─ skill-filtering.ts (10 lines)                   ← SAME AS MAIN
    │                           │
    │                           ├─ Buddy config overlay (setConfigOverlay)         ← SAME AS MAIN
    │                           └─ Built-in tools                                   ← SAME AS MAIN
    │
    └─ Buddy-owned routes                                                         ← SAME AS MAIN
```

**Key differences:**
- **Proxy layer (325 lines) is deleted** — transport + tool registration. Routes call the SDK directly.
- **1 patch consolidates** (`plugins/buddy-system-prompt-guard.ts` already WAS a plugin loaded via config overlay; now it's folded into the single Buddy plugin).
- **2-3 patches stay** because they wrap internal OpenCode operations (promptOps, skill service) that have no plugin hook equivalents.
- **Config overlay stays** for agents, models, providers, plugin registration.
- **Teaching state orchestration needs redesign.** `runSessionTransformProxy` today does: onTransform (writes teaching state) → proxy → rollback if fail → onAccepted. Replacing proxy transport with SDK calls doesn't absorb this orchestration. It must either stay in Buddy Hono or be redesigned to work within plugin hooks.
- **Built-in tools stay** (no second runtime needed).
- **Zero frontend changes** (v1 message format preserved).

**What moves where:**

| Buddy code | Today lives in | Plugin approach lives in |
|---|---|---|
| Proxy layer | `http/proxy.ts` (325 lines) | **Gone** — replaced by SDK calls |
| Tool definitions | `create-buddy-tool.ts` → `registerBuddyTools()` | Plugin `tool` export (Zod, same as today) |
| System prompt guard | `plugins/buddy-system-prompt-guard.ts` (183 lines, already loaded via config overlay as a plugin) | Plugin `experimental.chat.system.transform` hook (consolidated into Buddy plugin — already a plugin, now a single consolidated one) |
| Learner context / message pipeline | `message-prompt-pipeline.ts` + `message-transform-orchestration.ts` (teaching state, persona targeting, model defaults, tool overrides) | Plugin `chat.message` hook (partially — covers prelude parts and learner context; persona/model targeting and teaching state rollback likely stay in Buddy Hono) |
| Subagent forwarding | `session-prompt-tool-forwarding.ts` (32 lines, adapter patch) | **Same patch, still needed** |
| Task tool forwarding | `task-tool-forwarding.ts` (80 lines, adapter patch) | **Same patch, still needed** (could consolidate with above) |
| Skill filtering | `skill-filtering.ts` (10 lines, adapter patch) | **Same patch, still needed** (could replace with config-based approach) |

---

## Appendix B: Upstream Sync Pain Assessment

This analysis evaluates how the plugin approach affects the [upstream-fetch.algo.md](../../guides/upstream-fetch.algo.md) process — the repeatable 15-step ritual for syncing vendored OpenCode without breaking Buddy.

### The core question

**Does the plugin approach reduce the failure rate of vendor syncs?**

### Step 4: Compatibility hotspot analysis

The sync algo explicitly calls out 8 hotspots that must be manually verified after every vendor sync. Here is each hotspot assessed:

| # | Hotspot | Description | With plugin approach |
|---|---|---|---|
| 1 | **`ctx.ask()` / `ctx.metadata()` return types** | Upstream runtime methods silently switch from Promise to Effect without compile failures at Buddy call sites. | **Materially reduced.** Plugin tools use the published `ToolContext` interface (Promises, not Effect). The registry bridges Effect → Promise. Stable for plugin-defined tools. However, adapter patches (subagent forwarding, task forwarding) still sit on Effect internals and remain sync-sensitive. |
| 2 | **Buddy tools using raw `fs`** | Tools that bypass the upstream tool runtime path can break when upstream changes write/read internals. | **Eliminated** (if all tools become plugin tools). Plugin tools use `ToolContext`. No vendored runtime dependency for tool execution. |
| 3 | **Session prompt/command routes mutate state before session exists** | Ordering dependency on internal OpenCode session creation behavior. | **Reduced with migration work.** Plugin `chat.message` fires inside OpenCode after the session exists, which helps. But Buddy's Hono may still need to orchestrate teaching state mutations + rollback around SDK calls unless `runSessionTransformProxy` is deliberately redesigned. Not eliminated by deleting proxy alone. |
| 4 | **Runtime bootstrap order** | OpenCode internals touch Global storage before Buddy sets XDG/runtime-root env vars. | **Partially reduced.** Plugin loads after OpenCode bootstraps, which helps. But `loadOpenCodeApp()` still runs adapter patches (`ensureSessionServicePatched`, tool UI, forwarding, skill filtering) before the server serves. Env/XDG setup in `opencode-runtime/env.ts` still matters for vendored OpenCode's own boot sequence. |
| 5 | **Route-layer error normalization** | Buddy must verify its error envelope matches what vendored OpenCode returns for malformed JSON and schema failures. | **Partially reduced.** SDK client handles error normalization at the HTTP layer. But Buddy still owns its `{ error: string }` envelope contract and route-level validation. The SDK helps but doesn't eliminate the concern entirely. |
| 6 | **Tool registration/unregistration paths** | Buddy feature toggles call vendored `registerBuddyTools()` which calls vendored `ToolRegistry.register()`. API can shift. | **Reduced with migration work.** Tools become static plugin `tool` exports. Buddy toggles visibility via session permissions (SDK HTTP API). This is a behavior change from dynamic register/unregister — feasible but requires deliberate migration, not automatic from deleting proxy. |
| 7 | **Config/tool/permission overlay isolation** | `setConfigOverlay()` is a vendored API. Must verify overlay doesn't leak across directories after instance disposal. | **Reduced scope, not eliminated.** Overlay is still needed for agents, models, providers, plugin registration — just not for tool definitions and one system-prompt plugin. The overlay API itself remains sync-sensitive. (Note: Appendix B correctly states overlay stays as "SAME AS MAIN.") |
| 8 | **Desktop renderer asset paths** | Package moves break Electron/Vite publicDir paths. | **Unchanged.** This is independent of OpenCode — same in both approaches. |

**Result: ~3-4 hotspots materially reduced, 2-3 partially reduced, 1-2 unchanged. The original claim of "7 of 8 eliminated" was overly optimistic.**

### The process steps that change

| Step | Change with plugin approach? |
|---|---|
| 1. Checkpoint log | Same |
| 2. Capture baseline | Same |
| 3. Verify upstream delta | Same |
| 4. Temp worktree dry-run | **Same process, but fewer things to break.** Typecheck + contracts + build still required, but the 8 hotspot checks shrink: 1-2 eliminated, most reduced in scope. |
| 5. Ensure no Buddy patch in vendor/ | **Easier, not trivial.** No patches tracked in `vendor/opencode/`. Adapter patches live in `packages/buddy/src/` and `packages/opencode-adapter/src/`. If they compile against the new vendor, they're likely fine — but functionally they can still break. |
| 6. Apply changes to real tree | Same |
| 7. Re-link | Same |
| 8. Post-sync validations | Same commands, fewer probable regressions |
| 9. Vendor cleanliness verify | Same |
| 10. Remove compatibility shims | **Easier.** If a plugin hook signature changed, you fix that one hook. No rippling internal API changes across tool, message, permission, and config layers. But adapter patches may still need updates. |
| 11. Commit (vendor + Buddy) | Same ceremony |
| 12. Delta summary | Same |
| 13-15. Push, cleanup, log | Same |

### The honest bottom line

**The sync process still exists. It's still 15 steps.** The improvement is **modest, not dramatic.**

Today, every vendor sync is a dice roll. OpenCode can change an internal Effect type, rename a method, shift a bootstrap order — and Buddy breaks in ways typecheck alone won't catch. That's why the algo has 8 manual hotspot checks, a smoke checklist, and a known-traps section.

With the plugin approach:
- **2-3 adapter patches still need verification** (subagent forwarding, task forwarding, skill filtering). If OpenCode changes `SessionPrompt.registerPromptInputInterceptor` or `ToolRegistry.registerToolDefTransformer`, those break. Same class of pain as today — narrower scope but same sensitivity.
- **Config overlay still exists** for agents, models, providers, plugin registration. The `setConfigOverlay` API itself remains sync-sensitive.
- **Plugin hooks and SDK HTTP APIs are more stable surfaces** than vendored Effect internals, but not immune. Hook signatures can still change across OpenCode versions.
- **Several hotspots require deliberate redesign work** (teaching state orchestration, tool registration behavior change) — they aren't eliminated by deleting proxy alone.

For a solo developer, expect **modest improvement** in sync pain — not a transformation. The 15-step ritual shrinks in scope (fewer manual checks per sync) but doesn't fundamentally change. The difference is: fewer things CAN break per sync, but adapter patches still CAN break, and when they do, the debugging is the same.
