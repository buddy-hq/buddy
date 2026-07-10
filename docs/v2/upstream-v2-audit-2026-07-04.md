# Upstream OpenCode v2 audit — 2026-07-04

Research date: 2026-07-04
Method: read-only investigation against `~/code/opencode` (remote `upstream` = `github.com/anomalyco/opencode.git`), comparing Buddy's vendored copy and adapter against `upstream/dev` (tip `7a8e7c88f4`) and `upstream/v2` (tip `610e618bc5`). No Buddy git changes were made.

This report supersedes the branch/sync notes and H2/H3 findings in [buddy-opencode-v2-findings.md](./buddy-opencode-v2-findings.md) (2026-06-01), which are now stale.

---

## 1. Repo state and v2 trajectory

### v2 is not a gated branch — it is landing on dev continuously

The 2026-06-01 findings doc treated `upstream/v2` as the home of v2 and `upstream/dev` as v1. That is no longer accurate.

- `upstream/dev` and `upstream/v2` share a recent merge-base (2026-06-26, 8 days before this audit). The branches are kept in sync.
- dev has 268 commits since that base; v2 has 200. Both are actively pushed (44 commits on v2 today, 183 in the last 7 days).
- dev subjects are full of v2-flavored landings: "align subagent UI with v2", "v2 review panel overhaul", "route aggregate layers through nodes", "remove domain/infrastructure/session/tool layer exports", "build runtimes from layer nodes", "migrate session/llm/plugin/compaction tests to layer nodes".
- 240 commits touched `packages/core` on dev in the last 30 days.

`upstream/v2` is a fast-moving stabilization/integration branch, not the only home of v2. The architectural truth is on dev.

### v2 TODO status

The v2 TODO (`specs/v2/todo.md` on the v2 branch) opens with: *"we need to work towards a launch of v2 so we can get out of this rebuild phase."* There is no v2 tag, milestone, or published timeline.

**Done:**
- `SessionV2.create` and `SessionV2.prompt` are real `Effect.fn` implementations on both dev and v2 branch (no longer stubs — the 2026-06-01 H2/H3 blocker is resolved).
- First Effect-native local runner slice (`core/session/runner/llm.ts`) without bridging through legacy `SessionPrompt.loop`.
- Durable `EventV2` core service (persistence, pub/sub, replay, owner claims).
- Durable `session_input` inbox for prompt admission (steer/queue semantics).
- `PermissionV2` foundation + tool enforcement; `PermissionSaved` project-scoped persistence.
- HTTP server moved to Effect HttpApi backend.
- Layer-node architecture (aggregate layers routed through nodes, layer exports removed).

**Remaining (substantial):**
- Agent loop: eager local-tool settlement, per-step tool-call limits/truncation, remove public `@opencode-ai/llm` tool loop, batch streamed deltas, expose replayable Session cursors over HTTP/SDK, integrate Job service for background bash/agent, durable interruption/retries/stale-owner fencing.
- Plugin API: still being designed (hooks, immer drafts, `opencode.session.prompt()` style). Unowned ("James?").
- Config rework: unowned ("???"), old-config auto-conversion not done.
- Auth, Model Database, Provider-as-plugin, Hot-reload: all unowned/basic.
- Post-Hono cleanup: delete compat shims, shrink Zod surfaces.
- GUI/TUI cutover: TUI being migrated, but app GUI still consumes legacy `permission.asked` / `client.permission.respond`. No committed cutover timeline.
- Deferred hardening: SQLite migration locking across processes, cross-process tail wakes, ripgrep timeouts, hosted-tool continuation.

### The single biggest gate

The HTTP `POST /session/:id/message` endpoint still calls v1 `SessionPrompt.Service` on both dev and v2 branch. `SessionV2.prompt` is implemented and the v2 runner is mounted in the server layer graph, but the prompt route has not been cut over. This is the main switch between "v2 exists" and "v2 is the active path."

---

## 2. Module-wise v2 migration status

### Method

For each module the Buddy adapter (`packages/opencode-adapter/src/*.ts`) imports, checked whether the upstream module on `upstream/dev` and `upstream/v2`:
1. still exists (path),
2. has a v2 implementation in `packages/core/src/*`,
3. is wired into the active runtime path (v2 runner / HTTP route / layer graph).

Classification:
- **v2** = v2 implementation exists in core AND is wired into the v2 runtime path (runner/execution/projector), regardless of HTTP route cutover.
- **v1** = only v1 implementation, or v2 exists but is not wired.

### 3-row comparison

| | session-prompt | session-read | permission | plugin-hooks | config | tool | agent | provider | skill | project | message | command | mcp | auth | server | tool-stream |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Buddy** | v1 | v1 | v1 | v1 | v1 | v1 | v1 | v2 | v1 | v2 | v1 | v1 | v1 | v1 | v1 | v1 |
| **Vendor dev** | v2 | v1 | v2 | v1 | v1 | v2 | v2 | v2 | v1 | v2 | v1 | v1 | v1 | v1 | v1 | v2 |
| **Vendor v2 branch** | v2 | v1 | v2 | v2 | v1 | v1 | v2 | v2 | v1 | v2 | v1 | v1 | v1 | v1 | v1 | v2 |

**The only cell that differs between dev and v2 branch: plugin-hooks** (v1→v2). Everything else is identical.

### Classification basis

- **session-prompt = v2**: `SessionV2.create`/`prompt` real impls in core; `SessionV2.node` + `SessionExecutionLocal.node` mounted in HTTP server layer graph on both branches. HTTP route still calls v1 `SessionPrompt.Service`, but v2 is wired and available.
- **session-read = v1**: `opencode/session/session.ts` still uses `SessionV1` types/events throughout (25 v1 refs, 1 v2 ref). HTTP list/get handlers use v1 `Session.Service`.
- **permission = v2**: `PermissionV2` + `PermissionSaved` in core; v2 runner uses `PermissionV2`. App-facing `opencode/permission/index.ts` is still v1 (`PermissionV1`), used by legacy sessions.
- **plugin-hooks = v1 on dev, v2 on v2 branch**: see section 3 below.
- **config = v1**: `core/src/config.ts` exists but `opencode/config/config.ts` is v1 throughout (6 `ConfigV1` refs, 0 v2). TODO: "Config rework — ???" (unowned).
- **tool = v2**: `core/src/tool/*` full v2 surface; v2 runner uses `core/tool/registry` + `PermissionV2`. App-facing `opencode/tool/*` is v1 for the v1 loop.
- **agent = v2**: `AgentV2` (mode/hidden/permissions) in core; `opencode/agent/agent.ts` uses `AgentV2` model (still has `PermissionV1` for v1 loop).
- **provider = v2**: `ProviderV2`/`ModelV2` active in `opencode/provider/provider.ts`.
- **skill = v1**: `SkillV2` exists in core but `opencode/skill/index.ts` uses `core/plugin/skill`, not `SkillV2` end-to-end.
- **project = v2**: `ProjectV2` active in `opencode/project/project.ts`.
- **message = v1**: `opencode/session/message-v2.ts` is hybrid (v1 types + v2 SQL tables).
- **command = v1**: `CommandV2` exists in core but `opencode/command/index.ts` has no v2 imports.
- **mcp = v1**: no core v2 mcp; `opencode/mcp/index.ts` uses `ConfigMCPV1`.
- **auth = v1**: no core v2 auth; `opencode/auth/index.ts` is the only impl. TODO: "Auth — ???" (unowned).
- **server = v1**: no core v2 server; `opencode/server/server.ts` is the only impl (HttpApi backend, but no v2 server module).
- **tool-stream = v2**: core projector emits `session.next.tool.input.*` events; `core/src/session/message-updater.ts` exists. Buddy still bridges v1 via `tool-input-delta-live`.

### Buddy is behind vendor on

session-prompt, permission, plugin-hooks (v2 branch only), tool, agent, tool-stream — plus provider/project where Buddy is already v2.

### Broken import

`@opencode-ai/core/filesystem/ripgrep` (used by `adapter/file.ts`) is **gone on dev** — moved to `@opencode-ai/core/ripgrep`. Next vendor sync will fail typecheck unless repathed.

---

## 3. Plugin hooks — the v2 successor exists, on `upstream/v2` only

The 2026-06-01 findings doc H11 ("PluginV2 has no session/chat/spawn/skill hooks") is **stale for the v2 branch** but **still accurate for dev**.

### dev (current)

`packages/plugin/src/v2/effect/` has no `tool.ts`, no `runtime.ts`. `context.ts` exposes only: `agent`, `aisdk`, `catalog`, `command`, `integration`, `plugin`, `reference`, `skill`. **No `tool`, no `session`.**

PLAN.md lists "Tool execution hooks" and "Session prompt/context hooks as required" under section 6 (Migrate Runtime Hooks) — planned, not done.

### v2 branch

Two new files in `packages/plugin/src/v2/effect/`:

- **`tool.ts`** — full `ToolDomain`:
  - `ctx.tool.register({ name: tool })` — register tools from a plugin
  - `ctx.tool.hook("execute.before", (event) => ...)` — runs before tool execution, receives `{ tool, sessionID, agent, assistantMessageID, toolCallID, input }`, **`input` is mutable**
  - `ctx.tool.hook("execute.after", (event) => ...)` — runs after, receives `{ ...input, result, output, outputPaths }`
  - `ctx.tool.transform(...)` — replayable tool registry transforms
- **`runtime.ts`** — `SessionHooks` = `Pick<SessionApi, "create" | "get" | "prompt" | "command" | "interrupt">`. So `ctx.session.prompt(...)`, `ctx.session.create(...)`, etc. are exposed to plugins.

And in `packages/core/src/`:
- **`tool/hooks.ts`** — core-side `ToolHooks` service wiring `execute.before`/`execute.after` into the v2 runner, mounted via `ToolHooks.node` in the plugin layer graph.
- `core/src/plugin.ts` on v2 imports `ToolRegistry` and `ToolHooks` and mounts them.

### Buddy hook mapping

| Buddy v1 hook (`buddy-runtime-plugin`) | v2 successor | Where |
|----------------------------------------|--------------|-------|
| `experimental.chat.system.transform` | `ctx.session.prompt` + session prompt/context hooks (planned/`as required`) | v2 branch: partial (`SessionHooks` exposes prompt/create/get/command/interrupt); dev: not present |
| `experimental.chat.messages.transform` | session prompt/context hooks (planned/`as required`) | v2 branch: `SessionHooks` exists but no explicit messages-transform hook; dev: not present |
| teaching tools registered via v1 plugin tools | `ctx.tool.register(...)` + `ctx.tool.transform(...)` | v2 branch: implemented; dev: not present |
| `tool-input-delta-live` bridge | `ctx.tool.hook("execute.before"/"after")` with mutable input + v2 `session.next.tool.input.*` events | v2 branch: implemented; dev: not present |

When the v2 plugin tool/session hooks merge to dev, Buddy's `buddy-runtime-plugin` and `tool-input-delta-live` bridge finally have a native upstream replacement. Until then, they stay.

---

## 4. Tool changes — vendor (Buddy's pinned version) vs upstream

### Tools added (not in Buddy's vendor)

| Tool | On dev? | On v2 branch? | Notes |
|------|---------|---------------|-------|
| **`execute` (CodeMode)** | Yes (`opencode/src/tool/code-mode.ts`) | No | Executes JS/TS that orchestrates connected MCP tools inside a confined runtime (`@opencode-ai/codemode`). Gated behind `flags.experimentalCodeMode`. Dev-only experimental addition. |
| **`subagent`** (core v2) | No | Yes (`core/src/tool/subagent.ts`, 341 lines) | v2-native replacement for v1 `task`. Plugin-registered via `ctx.tool.register`. Uses session-aware Job service. Not on dev. |
| **`mcp`** (core v2) | No | Yes (`core/src/tool/mcp.ts`) | v2-native MCP tool registration/execution. Not on dev. |
| **`shell`** (core v2) | No | Yes (`core/src/tool/shell.ts`) | v2-native bash tool, plugin-registered, with background support. Not on dev. |

### Tools removed

None. All tools present in Buddy's vendor still exist on both dev and v2 branch.

### Tools with changed behavior (vendor → dev)

| Tool | Change | Impact |
|------|--------|--------|
| **`glob`** | `Ripgrep` import path moved (`core/filesystem/ripgrep` → `core/ripgrep`). **`Reference` service removed** — no more `reference.ensure()` / `reference.contains()` bypass. Results **no longer sorted by mtime**. Uses new `ripgrep.find()` API. | Behavior: glob results no longer mtime-sorted; reference-based cwd bypass gone. |
| **`grep`** | Same `Ripgrep` path + `Reference` removal. Uses `ripgrep.grep()` API. `MAX_LINE_LENGTH=2000` removed. Results no longer mtime-sorted. | Behavior: same as glob. |
| **`read`** | `Reference` service removed. `reference.ensure(filepath)` and `reference.contains()` bypass removed. `bypass` now only from `ctx.extra.bypassCwdCheck`. | Behavior: no more reference-based path bypass. |
| **`skill`** | `Ripgrep` path moved. Uses `ripgrep.find()` with `pattern: "!**/SKILL.md"` instead of streaming + manual filter. `pathToFileURL` removed. | Behavior: equivalent; internal API change. |
| **`task`** | `deriveSubagentSessionPermission` signature changed — no longer takes `parentAgent`; now computes `childPermission` + `childToolDenies` separately (denies `todowrite`, the task tool itself, `experimental.primary_tools`). Prompt text: "Do not poll" → "**DO NOT** sleep, poll...". | Behavior: subagent now gets explicit tool denies; stronger anti-polling prompt. |
| **`todo`** | Inlined `TodoItem` Schema.Struct instead of referencing `Todo.Info` (removes last zod dependency). | Behavior: identical; internal schema change. |
| **`shell`** | `description` field **removed** from tool input/params and permission requests. `title` now uses `input.command`. `Shell` import moved (`@/shell/shell` → `@opencode-ai/core/shell`). `Log` replaced with `Effect.logInfo`. | **Breaking**: `description` param gone from bash tool input. |

### Tools unchanged (vendor == dev)

`edit`, `write`, `webfetch`, `websearch`, `question`, `apply_patch`, `plan`, `lsp` — source identical.

### v2 branch core tool architecture

The v2 branch has a completely different tool architecture in `packages/core/src/tool/`:
- `Tool.make({ description, input, output, execute, toModelOutput })` — opaque canonical tool value
- `Tools.Service.register({ [name]: tool })` — Location-scoped registration
- `ToolRegistry.Service` — Location-scoped registry, no `PermissionV2` dependency (permissions checked at execution, not registration)
- Built-ins (read, edit, write, glob, grep, webfetch, websearch, todowrite, question, apply-patch, skill, shell, subagent, mcp) each self-register via `Tools.Service.register`
- `ToolHooks` (`execute.before`/`execute.after`) wired into the runner
- No `builtins.ts`/`application-tools.ts` on v2 branch (those are dev-only)

---

## 5. Subagent tools, background agents, and terminals

### Background agents (subagents)

| | Buddy vendor | upstream dev | upstream v2 branch |
|---|---|---|---|
| **`task` tool `background` param** | Yes (gated: `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`) | Yes (gated, same flag) | — |
| **`subagent` tool (v2 core)** | No | No | **Yes** — new `core/src/tool/subagent.ts` |
| **Background job service** | `core/background-job.ts` (basic: start/wait/promote/cancel) | Same + `LayerNode` wrapper | **New `core/job.ts`** — session-aware (`blockingSessions`, `backgrounded` deferred, `block`/`background`/`backgroundAll`) |
| **Background notification** | `injectBackgroundResult` into parent session | Same | `notifyWhenDone` → `injectCompletion` (completed/error/cancelled) via `runtime.session.prompt` |

**`task` tool on dev** — background subagents still gated behind `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`. Prompt text strengthened. `deriveSubagentSessionPermission` now injects explicit tool denies. Otherwise same as vendor.

**v2 branch `subagent` tool** — v2-native replacement for `task`:
- Plugin-registered (`ctx.tool.register`) via `PluginContext`, not a hardcoded builtin
- Uses `runtime.job.block`/`runtime.job.background` instead of `BackgroundJob.Service` directly
- Session-aware blocking: `block({ id, sessionID })` returns `{ type: "finished" }` or `{ type: "backgrounded" }` — the calling session can be backgrounded mid-block
- `backgroundAll` API to background all active jobs for a session
- Completion injection via `runtime.session.prompt` (v2 prompt API), not v1 message injection
- Output schema: `{ sessionID, status: "completed"|"running", output }`

**v2 branch `Job` service** (`core/src/job.ts`, 304 lines) — replaces `core/background-job.ts`. Session-integrated:
- `blockingSessions: Map<SessionID, count>` — tracks which sessions are waiting on each job
- `backgrounded: Deferred` — separate from `done`, so a job can be backgrounded after starting
- `block({ id, sessionID })` → `BlockResult` — either finishes or auto-backgrounds
- `background(id)` / `backgroundAll({ sessionID })` — explicit backgrounding
- Foundation for v2 `subagent` and `shell` background execution

### Background terminals (shell)

| | Buddy vendor | upstream dev | upstream v2 branch |
|---|---|---|---|
| **`shell` tool `background` param** | No | **No** | **Yes** (v2 core `shell.ts` only) |
| **`description` param** | Yes | **Removed** | — (v2 core shell doesn't have it) |
| **Background shell notification** | No | No | **Yes** — `notifyWhenDone` via `runtime.job.wait` |

**dev `shell` tool** — `description` param removed (breaking). No background support.

**v2 branch `core/src/tool/shell.ts`** — new v2-native shell tool with:
- `background: Schema.Boolean` param
- Uses `runtime.job.start`/`background`/`block` — same Job service as subagent
- `notifyWhenDone` injects completion into the calling session
- Explicit TODOs: "Persist job status and define restart recovery before exposing remote observation" and "Add HTTP job observation only after durable status, restart recovery, and authorization are defined" — background shell is **not yet durable/recoverable**

**v2 branch `core/src/shell/select.ts`** — new, not on dev. Shell selection logic.

**v2 branch migration** `core/src/database/migration/20260703190000_reset_v2_shell_event_payloads.ts` — resets v2 shell event payloads, indicating the v2 shell event schema is being iterated on.

### What's genuinely new

| Capability | Status |
|---|---|
| Background subagents | Vendor & dev: yes (experimental flag). v2 branch: redesigned with session-aware Job service. |
| Background shells | **New on v2 branch only** — `background=true` param on v2 core shell tool. Not on dev, not in vendor. |
| Session-aware job blocking | **New on v2 branch** — `block` returns `finished` or `backgrounded`, `backgroundAll` for a session. Not on dev. |
| `subagent` v2 tool | **New on v2 branch** — plugin-registered replacement for `task`. Not on dev. |
| Job durability/recovery | **Not yet** — explicit TODOs on v2 branch. Background jobs are process-local, not crash-recoverable. |
| HTTP job observation | **Not yet** — explicit TODO on v2 branch. No remote API to observe background jobs. |
| `shell` `description` param | **Removed on dev** (breaking). v2 core shell never had it. |

---

## 6. Effect on Buddy adoption decisions

### What changed since the 2026-06-01 findings

1. **H2/H3 blocker resolved**: `SessionV2.create`/`prompt` are no longer stubs on dev. The v2 session runtime is built and mounted.
2. **Plugin hooks successor exists** (on v2 branch): `ctx.tool.hook` + `ctx.session.*` are implemented and wired into the v2 runner. H11 is stale for the v2 branch.
3. **v2 is landing on dev continuously**, not gated behind a big-bang merge.
4. **Tool behavior changes** on dev require vendor sync attention: `Reference` removal, `shell` `description` removal, `ripgrep` path move.
5. **Background shells** are a new capability on the v2 branch (not on dev yet).

### What did not change

1. **HTTP prompt route cutover** has not happened — still v1 `SessionPrompt.Service` on both branches.
2. **`buddy-runtime-plugin` v1 hooks** have no v2 successor on dev (only on v2 branch).
3. **Config/Auth/MCP/Server** have no v2 on either branch.
4. **Permission adoption** guidance in [permission-v2-adoption-decision.md](./permission-v2-adoption-decision.md) still holds — stay on v1 runtime until end-to-end v2 cutover.
5. **Buddy teaching/subagent policy** (`subagent-tool-forwarding.ts`) remains substantial; upstream task/subagent tool only covers generic subagent permissions.

### Vendor sync checklist (next sync)

- [ ] Repath `@opencode-ai/core/filesystem/ripgrep` → `@opencode-ai/core/ripgrep` in `adapter/file.ts` and vendor `glob`/`grep`/`skill` tools.
- [ ] Handle `Reference` service removal in `glob`/`grep`/`read` — if Buddy relies on reference-based cwd bypass, that's gone.
- [ ] Handle `shell` tool `description` param removal — breaking for any prompt/code passing `description` to bash.
- [ ] Review `task` tool `deriveSubagentSessionPermission` signature change and `childToolDenies` injection.
- [ ] Evaluate `execute` (CodeMode) tool — decide whether Buddy wants to expose it.
- [ ] Update this doc and [buddy-opencode-v2-findings.md](./buddy-opencode-v2-findings.md) H2/H3/H11 with resolved status.

### Adoption gate

Buddy can adopt v2 session/prompt meaningfully only when:
1. The HTTP prompt route cuts over from v1 `SessionPrompt.Service` to `SessionV2.prompt` on dev.
2. Plugin tool/session hooks (`ctx.tool.hook`, `ctx.session.*`) merge from v2 branch to dev.
3. GUI/TUI cutover lands (app GUI still consumes legacy permission/session events).
4. Buddy teaching seed/subagent policy has a v2 hook point (`session.subagent.spawn` or `session.metadata`-based, or `ctx.tool.hook`).

Until then, stay on vendored v1 runtime + presentation-only permission UI, per [permission-v2-adoption-decision.md](./permission-v2-adoption-decision.md).
