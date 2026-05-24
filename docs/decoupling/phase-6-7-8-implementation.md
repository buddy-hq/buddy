# Phases 6+7+8: Consolidate Patches + Delete Proxy Remnants + Validate

> **Branch:** `decoupling`
> **Pre-work:** Phase 1 ✅, 2 ✅, 3 ✅, 4+5 (in progress)
> **Goal:** Narrow remaining adapter patches. Replace session CRUD proxy calls with SDK. Run smoke validation. The branch becomes merge-ready.

---

## Phase 6: Narrow Adapter Patches

### Current state

Two forwarding patches with overlapping behavior:

```
session-prompt-tool-forwarding.ts (32 lines)
  → SessionPrompt.registerPromptInputInterceptor
  → intercepts direct persona delegate prompts
  → calls withSubagentToolForwarding()

task-tool-forwarding.ts (80 lines)
  → ToolRegistry.registerToolDefTransformer
  → intercepts task tool prompts (promptOps.prompt wrapper)
  → calls withSubagentToolForwarding()
```

Both do the same thing from different entry points: wrap `promptOps.prompt()` to inject `withSubagentToolForwarding()`. They can be one file.

### Step 6.1: Consolidate forwarding patches

**Create:** `packages/buddy/src/opencode-runtime/subagent-forwarding.ts` (NEW)

Merge both interceptors into one file with a single `ensureSubagentForwardingPatched()` call:

```typescript
import { Effect } from "effect"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { SessionPrompt } from "@buddy/opencode-adapter/session-prompt"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"

const TASK_TOOL_ID = "task" as const

let promptInterceptorRegistered = false
let taskTransformerRegistered = false

type ToolOverrides = Record<string, boolean>
type PromptInput = {
  agent: string
  model?: Parameters<typeof ToolRegistry.tools>[0]
  sessionID: string
  tools?: ToolOverrides
}

type PromptOps = {
  prompt: (input: PromptInput) => Effect.Effect<unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function hasPromptOps(value: unknown): value is PromptOps {
  return isRecord(value) && "prompt" in value && typeof value.prompt === "function"
}

function isTaskToolArgs(value: unknown): value is { subagent_type: string } {
  return (
    isRecord(value) &&
    "subagent_type" in value &&
    typeof value.subagent_type === "string" &&
    value.subagent_type.trim().length > 0
  )
}

/**
 * Ensures subagent forwarding is patched for both entry points:
 * 1. Direct persona delegate prompts (via SessionPrompt interceptor)
 * 2. Task tool child prompts (via ToolRegistry transformer)
 *
 * Both wrap promptOps.prompt() to inject withSubagentToolForwarding()
 * before the prompt reaches the agent loop.
 *
 * UPSTREAM HOOK NEEDED: OpenCode does not expose a "before child session
 * spawn" hook. When OpenCode adds session.subagent.spawn (or equivalent),
 * both interceptors can be replaced by a single plugin hook.
 */
export async function ensureSubagentForwardingPatched() {
  // Entry point 1: Direct persona delegate prompts
  if (!promptInterceptorRegistered) {
    promptInterceptorRegistered = true
    SessionPrompt.registerPromptInputInterceptor(async ({ promptInput, run }) => {
      if (typeof promptInput.agent !== "string") {
        return run(promptInput)
      }

      const { withSubagentToolForwarding } = await import(
        "./subagent-tool-forwarding-runtime"
      )
      return Effect.runPromise(
        withSubagentToolForwarding({
          directory: OpenCodeInstance.directory,
          promptInput,
          run: (nextInput) => Effect.promise(() => run(nextInput)),
        }),
      )
    })
  }

  // Entry point 2: Task tool child prompts
  if (!taskTransformerRegistered) {
    taskTransformerRegistered = true
    ToolRegistry.registerToolDefTransformer(({ directory, tool }) => {
      if (tool.id !== TASK_TOOL_ID) return tool

      return {
        ...tool,
        execute(args, ctx) {
          if (!isTaskToolArgs(args) || !hasPromptOps(ctx.extra?.promptOps)) {
            return tool.execute(args, ctx)
          }

          const promptOps = ctx.extra.promptOps

          return tool.execute(args, {
            ...ctx,
            extra: {
              ...ctx.extra,
              promptOps: {
                ...promptOps,
                prompt(input: PromptInput) {
                  return Effect.flatMap(
                    Effect.promise(() =>
                      import("./subagent-tool-forwarding-runtime"),
                    ),
                    ({ withSubagentToolForwarding }) =>
                      withSubagentToolForwarding({
                        directory,
                        promptInput: input,
                        run: (nextInput) => promptOps.prompt(nextInput),
                      }),
                  )
                },
              },
            },
          })
        },
      }
    })
  }
}
```

### Step 6.2: Update runtime.ts

**File:** `packages/buddy/src/opencode-runtime/runtime.ts`

Replace two imports:
```typescript
import { ensureSessionPromptToolForwardingPatched } from "./session-prompt-tool-forwarding"
import { ensureTaskToolForwardingPatched } from "./task-tool-forwarding"
```

With one:
```typescript
import { ensureSubagentForwardingPatched } from "./subagent-forwarding"
```

Replace two calls:
```typescript
await ensureSessionPromptToolForwardingPatched()
ensureTaskToolForwardingPatched()
```

With one:
```typescript
await ensureSubagentForwardingPatched()
```

### Step 6.3: Delete old files

```bash
rm packages/buddy/src/opencode-runtime/session-prompt-tool-forwarding.ts
rm packages/buddy/src/opencode-runtime/task-tool-forwarding.ts
```

### Step 6.4: Document remaining upstream hooks

**File:** `packages/buddy/src/opencode-runtime/UPSTREAM-HOOKS.md` (NEW)

```markdown
# Upstream OpenCode Hooks Needed

This file documents OpenCode plugin hooks that Buddy currently patches
around because they don't exist. Each entry describes what Buddy needs
and what upstream hook would replace the current adapter patch.

## 1. Child session spawn hook

**Buddy need:** When OpenCode creates a child session (for subagents or
task delegation), Buddy must inject custom tool overrides, permission
rules, and teaching state before the child session processes its first
prompt.

**Current workaround:** `subagent-forwarding.ts` intercepts two points:
- `SessionPrompt.registerPromptInputInterceptor` for direct delegate prompts
- `ToolRegistry.registerToolDefTransformer` for task tool child prompts

Both wrap internal `promptOps.prompt()` to run `resolveSubagentToolForwarding()`
before the prompt reaches the agent loop.

**Desired upstream hook:**
```
"session.subagent.spawn"?: (
  input: { parentSessionID: string; childSessionID: string; agent: string },
  output: { tools: Record<string, boolean>; permission: PermissionRuleset }
) => Promise<void>
```

This hook would fire after the child session is created but before any
prompt processing begins. Buddy could set tools and permissions directly
without intercepting prompt internals.

**Status:** Not available. Watching OpenCode releases.

## 2. Skill visibility filter hook

**Buddy need:** Hide specific built-in OpenCode skills (e.g. customize-opencode)
from the skill list and agent available skills.

**Current workaround:** `skill-filtering.ts` calls `setSkillVisibilityFilter()`
on the `@buddy/opencode-adapter/skill-live` monkey-patch.

**Desired upstream hook:**
```
"skill.visibility"?: (
  input: { name: string; location: string },
  output: { visible: boolean }
) => Promise<void>
```

**Status:** Not available. Could potentially be replaced by config-level
skill path filtering without a hook.

## 3. Pre-prompt input transform hook

**Buddy need:** Modify prompt input (agent, model, tools, system prompt)
before the agent loop resolves agent/config. Currently Buddy does this
in `message-prompt-pipeline.ts` on the Hono side.

**Current workaround:** Buddy runs the prompt pipeline in Hono before
sending to OpenCode. Works but prevents the plugin from seeing the
transformed prompt.

**Desired upstream hook:**
```
"chat.prompt.transform"?: (
  input: { sessionID: string; body: PromptBody },
  output: { body: PromptBody }
) => Promise<void>
```

**Status:** Not available. Current Hono-side pipeline is functional.
```

---

## Phase 7: Replace Remaining Safe Proxy Calls

### What's left after Phase 5

After Phase 5 removes proxy from interaction-actions, the remaining proxy consumers are:

| File | Proxy call | Risk |
|---|---|---|
| `core-actions.ts` | Session CRUD (list, create, get, patch, summarize, revert, unrevert) | ✅ Safe — no prompt transforms |
| `compatibility.ts` | File ops, command catalog, file content | ⚠️ Leave — complex Buddy logic |
| `project.ts` | `GET /project/current` | ✅ Safe — no transforms |
| `discovery.ts` | Skill loading via `fetchOpenCode` | ⚠️ Leave — skill loading has own complexity |
| `proxy-transform.ts` | Mermaid repair orchestration | ⚠️ Leave — custom orchestration |

### Step 7.1: Replace session CRUD in core-actions.ts

**File:** `packages/buddy/src/session/orchestration/core-actions.ts`

The file has these functions that proxy to OpenCode:

| Function | OpenCode route | SDK replacement |
|---|---|---|
| `proxySessionCollection` | `GET/POST /session` | `client.session.list()` / `client.session.create()` |
| `getSessionStatus` | `GET /session/status` | `client.session.status()` |
| `getSessionById` | `GET /session/{id}` | `client.session.get()` |
| `patchSessionById` | `PATCH /session/{id}` | `client.session.update()` |
| `summarizeSessionById` | `POST /session/{id}/summarize` | `client.session.summarize()` |
| `revertSessionById` | `POST /session/{id}/revert` | **Keep for now** — revert has complex state management |
| `unrevertSessionById` | `POST /session/{id}/unrevert` | **Keep for now** — unrevert has complex state management |
| `listSessionMessages` | `GET /session/{id}/message` | `client.session.messages()` |

**Pattern for each replacement** (same as Phase 1 + 5):

```typescript
// Before:
export async function proxySessionCollection(c: Context): Promise<Response> {
  // ... config sync, directory resolution ...
  const response = await proxyToOpenCode(c, { targetPath: "/session" })
  // ... learner memory startup after session creation ...
  return response
}

// After:
export async function proxySessionCollection(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, { operation: "session list" })
  if (!syncResult.ok) return syncResult.response

  const client = await getOpenCodeClient(syncResult.value.directory)

  if (c.req.method === "POST") {
    const body = validatedJsonRecord(c) ?? {}
    const result = await client.session.create({ body })
    if (result.error) return respondWithSdkResult(c, result)

    // Keep learner memory startup (existing Buddy side effect)
    const session = result.data
    if (session?.id) {
      runLearnerMemoryStartupPipeline({
        directory: syncResult.value.directory,
        currentSessionID: session.id,
      }).catch((err) => console.warn("Learner memory startup pipeline failed:", err))
    }

    return respondWithSdkResult(c, result)
  }

  const result = await client.session.list()
  return respondWithSdkResult(c, result)
}
```

**Key detail for `patchSessionById`:** Keep the dynamic tool cleanup on archive. This is Buddy logic, not proxy logic:

```typescript
export async function patchSessionById(c: Context): Promise<Response> {
  // ... directory resolution ...
  const body = parseSessionPatchBody(validatedJsonRecord(c))
  const client = await getOpenCodeClient(directory)
  const result = await client.session.update({ sessionID, body })

  if (body?.time?.archived !== undefined && !result.error) {
    await clearDynamicLearningToolsForEndedSession({ directory, sessionID })
      .catch((err) => console.warn("Failed to clear dynamic tools after archiving:", err))
  }

  return respondWithSdkResult(c, result)
}
```

### Step 7.2: Replace project current

**File:** `packages/buddy/src/routes/project.ts`

```typescript
// Before:
async (c) => proxyToOpenCode(c, { targetPath: "/project/current" })

// After:
async (c) =>
  withDirectoryRoute(c, async (context) => {
    const client = await getOpenCodeClient(context.directory)
    const result = await client.project.current({ directory: context.directory })
    return respondWithSdkResult(c, result)
  })
```

### Step 7.3: Verify remaining proxy consumers

```bash
cd /Users/prashantbhudwal/Code/buddies/decoupling
rg "proxyToOpenCode|fetchOpenCode" packages/buddy/src/ --no-heading | grep -v ".test." | grep -v "index.ts" | grep -v "proxy.ts"
```

Expected output (only these remain):
```
compatibility.ts:  file operations, command catalog, file content, SSE
discovery.ts:      skill loading
proxy-transform.ts: mermaid repair orchestration
```

---

## Phase 8: Validation + Smoke

### Step 8.1: Automated checks

```bash
cd /Users/prashantbhudwal/Code/buddies/decoupling

bun typecheck
bun lint
bun run --cwd packages/buddy test:contracts
bun run --cwd packages/web test:contracts
```

### Step 8.2: Migration-specific regression tests

```bash
# Plugin shim
bun run --cwd packages/buddy test buddy-tool-shim

# Dynamic tools
bun run --cwd packages/buddy test dynamic-tool-permission-toggle
bun run --cwd packages/buddy test dynamic-tool-end-to-end

# SDK client
bun run --cwd packages/buddy test opencode-sdk-client

# Subagent forwarding
bun run --cwd packages/buddy test subagent-tool-forwarding

# Session routes
bun run --cwd packages/buddy test session/route-regressions
bun run --cwd packages/buddy test session/prompt-preflight-regression
```

### Step 8.3: Manual smoke checklist (from upstream-fetch.algo.md)

| # | Test | How |
|---|---|---|
| 1 | Send a prompt to an existing session | Normal chat UX — verify response streams, tools execute |
| 2 | Send a prompt to a missing session | Verify clean 404, no teaching state mutation |
| 3 | Trigger a permission-asking tool | Verify permission dialog appears, approve/deny works |
| 4 | Exercise a Buddy write path | Verify file written through vendored write runtime |
| 5 | Toggle a tool group off | Verify tool surface shrinks after disable |
| 6 | Dynamic tool lifecycle | Grant via `learning_tool_load` → callable → release → denied |
| 7 | Subagent delegation | `/flashcard` or task tool → child session inherits correct tools |
| 8 | Desktop assets | Dev Electron — loading screen, chat empty-state render correctly |

### Step 8.4: Final inventory

```bash
echo "=== New files ==="
git diff --name-status main | grep "^A"

echo "=== Modified files ==="
git diff --name-status main | grep "^M"

echo "=== Deleted files ==="
git diff --name-status main | grep "^D"

echo "=== Remaining proxy consumers ==="
rg "proxyToOpenCode|fetchOpenCode" packages/buddy/src/ --no-heading | grep -v ".test."
```

---

## Deliverable

Branch `decoupling` with:

**Phase 6:**
- New: `opencode-runtime/subagent-forwarding.ts` — consolidated forwarding (both entry points in one file)
- New: `opencode-runtime/UPSTREAM-HOOKS.md` — documented hooks wanted from OpenCode
- Modified: `opencode-runtime/runtime.ts` — single `ensureSubagentForwardingPatched()` call
- Deleted: `session-prompt-tool-forwarding.ts`, `task-tool-forwarding.ts`

**Phase 7:**
- Modified: `core-actions.ts` — session CRUD on SDK (list, create, get, patch, summarize, messages)
- Modified: `project.ts` — project current on SDK
- `revertSessionById` and `unrevertSessionById` kept with proxy (complex state management — future phase)

**Phase 8:**
- All typecheck/lint/contracts pass
- Migration-specific tests pass
- Smoke checklist verified
- Remaining proxy consumers: compatibility.ts, discovery.ts, proxy-transform.ts (documented, not blocking)
- Branch is merge-ready: strict improvement over main with no regressions
