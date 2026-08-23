# Phases 4+5: Consolidate Plugin + Split Prompt Orchestration

> **Branch:** `decoupling`
> **Pre-work:** Phase 1 ✅, Phase 2 ✅, Phase 3 (in progress)
> **Goal:** Merge the two plugins into one. Then replace proxy transport in prompt/command routes with SDK calls while keeping all Buddy state orchestration intact.

---

## Phase 4: Consolidate Plugins

### Current state

Two separate plugins loaded by the config overlay:

```
config overlay
  └─ plugin: [
       "file://.../plugins/buddy-system-prompt-guard.ts",   // system prompt filtering + capture
       "file://.../plugins/buddy-tools-plugin.ts"            // tool exports
     ]
```

Each is an independent file, independently loaded, with its own `PluginInput` and its own async init.

### Target state

One plugin with both responsibilities:

```
config overlay
  └─ plugin: [
       "file://.../plugins/buddy-runtime-plugin.ts"          // tools + system prompt guard
     ]
```

### Files to change

| Action | File |
|---|---|
| **Create** | `plugins/buddy-runtime-plugin.ts` — merged plugin |
| **Modify** | `buddy-tools-plugin.ts` — URL resolver now resolves the merged plugin |
| **Delete** | `system-prompt-guard-plugin.ts` — URL resolver, no longer needed |
| **Delete** | `plugins/buddy-system-prompt-guard.ts` — implementation moved into merged plugin |
| **Delete** | `plugins/buddy-tools-plugin.ts` — implementation moved into merged plugin |
| **Modify** | `opencode-runtime/index.ts` — remove old exports, add new |
| **Modify** | `overlay-builder.ts` — update imports + plugin array |
| **Modify** | `build-compiled-binary.ts` — remove system-prompt-capture copy (if captured via plugin now) |

### Step 4.1: Create the merged plugin

**File:** `packages/buddy/src/opencode-runtime/plugins/buddy-runtime-plugin.ts` (NEW)

```typescript
import type { Plugin } from "@opencode-ai/plugin"

// ---- System prompt guard (from buddy-system-prompt-guard.ts) ----

import os from "node:os"
import path from "node:path"
import { captureSessionSystemPrompt } from "../system-prompt-capture"

type SystemTransformInput = { sessionID?: string }
type SystemTransformOutput = { system: string[] }

function decodeAndResolvePath(value: string) {
  try { return path.resolve(decodeURIComponent(value)) }
  catch { return path.resolve(value) }
}

function normalizeForComparison(value: string) {
  const normalized = path.normalize(value)
  return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

function normalizeOptionalDirectory(directory: string | undefined) {
  if (!directory || !directory.trim() || directory === "/") return undefined
  const normalized = normalizeForComparison(decodeAndResolvePath(directory))
  const root = normalizeForComparison(path.parse(normalized).root)
  if (normalized === root) return undefined
  return normalized
}

function resolveBuddyGlobalAgentsPath() {
  const configured = process.env.BUDDY_GLOBAL_CONFIG_DIR?.trim()
  const home = process.env.BUDDY_TEST_HOME?.trim() || os.homedir()
  const configRoot = configured && configured !== "undefined"
    ? decodeAndResolvePath(configured)
    : path.join(home, ".buddy")
  return normalizeForComparison(path.join(configRoot, "AGENTS.md"))
}

function normalizeInstructionSourcePath(source: string) {
  const value = source.trim()
  if (!value) return undefined
  if (value.startsWith("http://") || value.startsWith("https://")) return undefined
  if (value.includes("://")) return undefined
  if (!path.isAbsolute(value)) return undefined
  return normalizeForComparison(path.resolve(value))
}

function isWithinDirectory(root: string | undefined, target: string) {
  if (!root) return false
  if (target === root) return true
  const relative = path.relative(root, target)
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
}

function shouldKeepInstructionSource(source: string, context: FilterContext) {
  const sourcePath = normalizeInstructionSourcePath(source)
  if (!sourcePath) return true
  const filename = path.basename(sourcePath).toLowerCase()
  if (filename === "claude.md" || filename === "context.md") return false
  if (filename !== "agents.md") return true
  if (sourcePath === context.buddyGlobalAgentsPath) return true
  if (isWithinDirectory(context.projectDirectory, sourcePath)) return true
  if (isWithinDirectory(context.projectWorktree, sourcePath)) return true
  return false
}

function filterInstructionBlocks(input: string, context: FilterContext) {
  const headerPattern = /^Instructions from:\s+(.+)$/gm
  const headers = Array.from(input.matchAll(headerPattern))
  if (headers.length === 0) return input

  let output = ""
  let cursor = 0
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]!
    const blockStart = header.index ?? 0
    const blockEnd = headers[i + 1]?.index ?? input.length
    const source = (header[1] ?? "").trim()
    output += input.slice(cursor, blockStart)
    if (shouldKeepInstructionSource(source, context)) {
      output += input.slice(blockStart, blockEnd)
    }
    cursor = blockEnd
  }
  output += input.slice(cursor)
  return output
    .split("\n")
    .reduce<string[]>((lines, line) => {
      const prev = lines[lines.length - 1]
      if (line.trim().length === 0 && prev?.trim().length === 0) return lines
      lines.push(line)
      return lines
    }, [])
    .join("\n")
    .trim()
}

type FilterContext = {
  buddyGlobalAgentsPath: string
  projectDirectory?: string
  projectWorktree?: string
}

function createSystemPromptGuard(input: { directory: string; worktree: string }) {
  const context: FilterContext = {
    buddyGlobalAgentsPath: resolveBuddyGlobalAgentsPath(),
    projectDirectory: normalizeOptionalDirectory(input.directory),
    projectWorktree: normalizeOptionalDirectory(input.worktree),
  }

  return {
    "experimental.chat.system.transform": async (
      hookInput: SystemTransformInput,
      output: SystemTransformOutput,
    ) => {
      const filtered = output.system
        .map((segment) => filterInstructionBlocks(segment, context))
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0)

      output.system.length = 0
      output.system.push(...filtered)

      if (!hookInput.sessionID) return
      const fullSystemPrompt = filtered.join("\n\n").trim()
      if (!fullSystemPrompt) return

      await captureSessionSystemPrompt({
        directory: input.directory,
        sessionID: hookInput.sessionID,
        fullSystemPrompt,
      })
    },
  }
}

// ---- Tool exports (from buddy-tools-plugin.ts) ----

const plugin: Plugin = async (input) => {
  const { allBuddyTools } = await import("../../learning/runtime/feature-registry")
  const { buddyToolToPluginTool } = await import("../buddy-tool-shim")

  const tools = allBuddyTools()
  const toolMap: Record<string, ReturnType<typeof buddyToolToPluginTool>> = {}

  for (const tool of tools) {
    toolMap[tool.id] = buddyToolToPluginTool(tool, input.directory)
  }

  return {
    tool: toolMap,
    ...createSystemPromptGuard({ directory: input.directory, worktree: input.worktree }),
  }
}

export default plugin
```

### Step 4.2: Update the URL resolver

**File:** `packages/buddy/src/opencode-runtime/buddy-tools-plugin.ts` — rename to something generic, or just change the constants:

Change:
```typescript
const PLUGIN_BASENAME = "buddy-tools-plugin"
```
To:
```typescript
const PLUGIN_BASENAME = "buddy-runtime-plugin"
```

And rename the export function from `resolveBuddyToolsPluginUrl` to `resolveBuddyRuntimePluginUrl`.

### Step 4.3: Update overlay-builder.ts

Change the import from `resolveBuddyToolsPluginUrl` to `resolveBuddyRuntimePluginUrl`. Remove the `resolveBuddySystemPromptGuardPluginUrl` import. Update the plugin array to just have the single URL.

### Step 4.4: Update opencode-runtime/index.ts

Remove exports for the old files:
```typescript
export { resolveBuddySystemPromptGuardPluginUrl } from "./system-prompt-guard-plugin"
export { resolveBuddyToolsPluginUrl } from "./buddy-tools-plugin"
```

Add:
```typescript
export { resolveBuddyRuntimePluginUrl } from "./buddy-tools-plugin"
```

Or rename `buddy-tools-plugin.ts` to `buddy-runtime-plugin-resolver.ts`.

### Step 4.5: Delete old files

- `packages/buddy/src/opencode-runtime/system-prompt-guard-plugin.ts`
- `packages/buddy/src/opencode-runtime/plugins/buddy-system-prompt-guard.ts`
- `packages/buddy/src/opencode-runtime/plugins/buddy-tools-plugin.ts`

### Step 4.6: Build script update

In `build-compiled-binary.ts`, the system prompt capture module was separately copied:
```typescript
if (existsSync(systemPromptCaptureModule)) {
  const bundledCaptureTarget = path.resolve(bundleOutdir, "system-prompt-capture.ts")
  copyFileSync(systemPromptCaptureModule, bundledCaptureTarget)
}
```

The plugin file now imports `system-prompt-capture` directly via `../system-prompt-capture`. The plugin directory copy already handles this since it copies the entire `plugins/` directory. The separate capture copy can be removed.

### Phase 4 verification

```bash
cd /Users/prashantbhudwal/Code/buddies/decoupling
bun typecheck
bun run --cwd packages/buddy test buddy-tool-shim     # tools still work
bun run --cwd packages/buddy test system-prompt-guard  # guard still works
ls packages/buddy/src/opencode-runtime/plugins/
# Expected: buddy-runtime-plugin.ts (only one plugin file)
```

---

## Phase 5: Split Prompt Orchestration

### Current state

Every prompt/command route flows through `runSessionTransformProxy`:

```
Browser
  → POST /api/session/{id}/message
    → postSessionPrompt(c)
      → withConfigSync → sessionID, directory
      → createSessionMessageTransform(context)
      → runSessionTransformProxy({
          c,
          targetPath: `/session/{id}/message`,
          onTransform: promptTransform.onTransform,    // Buddy prompt pipeline
          onAccepted: promptTransform.onAccepted,      // learner evidence
          rollbackState: promptTransform.rollbackState, // undo teaching state
          beforeProxy: () => assertSessionExists(...)   // session existence check
        })
          → prepareProxyBody(c, { transformJsonBody: onTransform })
            → validates JSON body
            → runs onTransform(body) → transforms the body
            → returns { body, headers, method }
          → fetchOpenCode({ directory, path, body, headers })
            → HTTP call to in-process OpenCode
          → normalizeErrorResponse(response)
            → if !ok → rollbackState()
            → if ok → onAccepted()
```

### Target state

The proxy transport is replaced with SDK calls. Everything else stays:

```
Browser
  → POST /api/session/{id}/message
    → postSessionPrompt(c)
      → withConfigSync → sessionID, directory
      → createSessionMessageTransform(context)
      → promptTransform.onTransform(body)       // Buddy prompt pipeline (unchanged)
      → build SDK request from transformed body
      → getOpenCodeClient(directory).session.prompt({ sessionID, body })
        → if !ok → promptTransform.rollbackState()
        → if ok → promptTransform.onAccepted()
```

### What moves vs what stays

| Component | Today | After Phase 5 |
|---|---|---|
| Directory resolution | `ensureAllowedDirectory(c)` | Same — unchanged |
| Config sync | `withConfigSync(c, ...)` | Same — unchanged |
| Prompt transform | `promptTransform.onTransform(body)` | Same — unchanged |
| Body preparation | `prepareProxyBody(c, input)` | **Gone** — we build the SDK request directly |
| Tool registration | `resolveFeatureRegistrationFlags()` inside proxy | **Gone** — tools pre-registered (Phase 2/3) |
| Session existence check | `assertSessionExistsInDirectory()` via fetchOpenCode | **Changed** — use `client.session.get()` |
| HTTP transport | `fetchOpenCode()` | **Replaced** — `client.session.prompt()` |
| Error normalization | `normalizeErrorResponse()` | **Replaced** — `respondWithSdkResult()` (Phase 1) |
| Rollback on failure | `promptTransform.rollbackState()` | Same — unchanged |
| Learner evidence | `promptTransform.onAccepted()` | Same — unchanged |
| Workspace file flattening | `flattenPromptPartsForRuntime()` | Same — unchanged |

### Step 5.1: Replace `postSessionPrompt` (sync prompt)

**File:** `packages/buddy/src/session/orchestration/interaction-actions.ts`

**Current code pattern:**
```typescript
export async function postSessionPrompt(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, { operation: "session prompt" })
  if (!syncResult.ok) return syncResult.response

  const sessionID = c.req.param("sessionID")
  const transformContext: SessionTransformContext = {
    directory: syncResult.value.directory,
    sessionID,
    request: c.req.raw,
  }
  const promptTransform = createSessionMessageTransform({ context: transformContext })

  try {
    return await runSessionTransformProxy({
      c,
      targetPath: `/session/${encodeURIComponent(sessionID)}/message`,
      onAccepted: promptTransform.onAccepted,
      rollbackState: promptTransform.rollbackState,
      onTransform: promptTransform.onTransform,
      beforeProxy: () => assertSessionExistsInDirectory({
        directory: syncResult.value.directory,
        sessionID,
        request: c.req.raw,
      }),
    })
  } catch (error) {
    promptTransform.rollbackState?.()
    const response = mapSessionTransformError(c, error)
    if (response) return response
    throw error
  }
}
```

**Replace with:**
```typescript
export async function postSessionPrompt(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, { operation: "session prompt" })
  if (!syncResult.ok) return syncResult.response

  const body = validatedJsonRecord(c)
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 })

  const sessionID = c.req.param("sessionID")
  const directory = syncResult.value.directory

  const promptTransform = createSessionMessageTransform({
    context: { directory, sessionID, request: c.req.raw },
  })

  try {
    const transformed = await promptTransform.onTransform(body)

    // Build runtime-safe body (flatten workspace file references)
    const runtimeSafeBody = Array.isArray(transformed.parts)
      ? { ...transformed, parts: flattenPromptPartsForRuntime(transformed.parts) }
      : transformed

    // Check session exists before sending
    const client = await getOpenCodeClient(directory)
    const sessionCheck = await client.session.get({ sessionID })
    if (sessionCheck.error) {
      promptTransform.rollbackState?.()
      return respondWithSdkResult(c, sessionCheck)
    }

    // Send prompt via SDK
    const result = await client.session.prompt({
      sessionID,
      body: runtimeSafeBody,
    })

    if (result.error) {
      promptTransform.rollbackState?.()
      return respondWithSdkResult(c, result)
    }

    // Record learner evidence on success
    await promptTransform.onAccepted?.().catch((err) => {
      console.warn("Failed to record learner evidence after accepted prompt:", err)
    })

    return respondWithSdkResult(c, result)
  } catch (error) {
    promptTransform.rollbackState?.()
    const response = mapSessionTransformError(c, error)
    if (response) return response
    throw error
  }
}
```

**Key changes:**
1. `validatedJsonRecord(c)` replaces `prepareProxyBody` — just parses JSON, no proxy body wrapping
2. `client.session.get({ sessionID })` replaces `assertSessionExistsInDirectory` — direct SDK call instead of separate HTTP round-trip
3. `client.session.prompt({ sessionID, body })` replaces `fetchOpenCode` — typed SDK call instead of raw HTTP
4. Error handling uses `respondWithSdkResult` (already built in Phase 1)
5. `onTransform`, `rollbackState`, `onAccepted` — unchanged

### Step 5.2: Replace `postSessionPromptAsync`

**File:** `packages/buddy/src/session/orchestration/interaction-actions.ts`

Same pattern — replace `fetchOpenCode` with `client.session.promptAsync()`:

```typescript
export async function postSessionPromptAsync(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, { operation: "async prompt" })
  if (!syncResult.ok) return syncResult.response

  const body = validatedJsonRecord(c)
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 })

  const sessionID = c.req.param("sessionID")
  const directory = syncResult.value.directory

  const promptTransform = createSessionMessageTransform({
    context: { directory, sessionID, request: c.req.raw },
  })

  try {
    const transformed = await promptTransform.onTransform(body)
    const runtimeSafeBody = Array.isArray(transformed.parts)
      ? { ...transformed, parts: flattenPromptPartsForRuntime(transformed.parts) }
      : transformed

    const client = await getOpenCodeClient(directory)
    const result = await client.session.promptAsync({
      sessionID,
      body: runtimeSafeBody,
    })

    if (result.error) {
      promptTransform.rollbackState?.()
      return respondWithSdkResult(c, result)
    }

    await promptTransform.onAccepted?.().catch((err) => {
      console.warn("Failed to record learner evidence after accepted prompt:", err)
    })

    // promptAsync returns 204 No Content on success
    return new Response(null, { status: 204 })
  } catch (error) {
    promptTransform.rollbackState?.()
    const response = mapSessionTransformError(c, error)
    if (response) return response
    throw error
  }
}
```

### Step 5.3: Replace `postSessionCommand`

**File:** `packages/buddy/src/session/orchestration/interaction-actions.ts`

Same pattern — replace `fetchOpenCode` with `client.session.command()`:

```typescript
export async function postSessionCommand(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, { operation: "session command" })
  if (!syncResult.ok) return syncResult.response

  const body = validatedJsonRecord(c)
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 })

  const sessionID = c.req.param("sessionID")
  const directory = syncResult.value.directory

  const commandTransform = createSessionCommandTransform({
    context: { directory, sessionID, request: c.req.raw },
  })

  try {
    const transformed = await commandTransform.onTransform(body)

    const client = await getOpenCodeClient(directory)
    const result = await client.session.command({
      sessionID,
      body: transformed,
    })

    if (result.error) {
      commandTransform.rollbackState?.()
      return respondWithSdkResult(c, result)
    }

    // Commands are async — 204 No Content
    return new Response(null, { status: 204 })
  } catch (error) {
    commandTransform.rollbackState?.()
    const response = mapSessionTransformError(c, error)
    if (response) return response
    throw error
  }
}
```

### Step 5.4: Replace session existence check

**File:** `packages/buddy/src/session/orchestration/lookup.ts`

The lookup file currently uses `fetchOpenCode` to check session existence. Replace with SDK:

```typescript
import { getOpenCodeClient } from "../../opencode-runtime/client"
import { PiSessionNotFoundError } from "../../pi-backend/runtime" // ← remove this if pi-backend gone

const SESSION_NOT_FOUND_ERROR = "Session not found"

export function isSessionNotFoundError(error: unknown): boolean {
  // Check for both SDK error shapes
  if (error instanceof Error) {
    return error.message.startsWith("Session not found")
  }
  if (typeof error === "object" && error !== null) {
    const payload = error as { _tag?: string; message?: string; name?: string }
    if (payload._tag === "SessionNotFoundError") return true
    if (payload.name === "NotFoundError") return true
  }
  return false
}

export async function ensureSessionExistsInDirectory(input: {
  directory: string
  sessionID: string
  request: Request
}): Promise<Response | undefined> {
  try {
    const client = await getOpenCodeClient(input.directory)
    const result = await client.session.get({ sessionID: input.sessionID })
    if (result.error) {
      if (isSessionNotFoundError(result.error)) {
        return Response.json({ error: SESSION_NOT_FOUND_ERROR }, { status: 404 })
      }
      return Response.json(
        { error: typeof result.error === "string" ? result.error : "Request failed" },
        { status: 400 },
      )
    }
    return undefined // session exists, no error response needed
  } catch (error) {
    if (isSessionNotFoundError(error)) {
      return Response.json({ error: SESSION_NOT_FOUND_ERROR }, { status: 404 })
    }
    throw error
  }
}

export async function assertSessionExistsInDirectory(input: {
  directory: string
  sessionID: string
  request: Request
}): Promise<Response | undefined> {
  return ensureSessionExistsInDirectory(input)
}
```

### Step 5.5: Replace `abortSessionRun`

**File:** `packages/buddy/src/session/orchestration/abort-actions.ts`

```typescript
import type { Context } from "hono"
import { getOpenCodeClient } from "../../opencode-runtime/client"

export async function abortSessionRun(c: Context): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c)
  if (!directoryResult.ok) return directoryResult.response

  const sessionID = c.req.param("sessionID")
  const client = await getOpenCodeClient(directoryResult.directory)
  const result = await client.session.abort({ sessionID })

  if (result.error) {
    return Response.json({ error: "Abort failed" }, { status: 400 })
  }
  return Response.json(true)
}
```

### Step 5.6: Remove `queueSessionPromptAsync` from proxy-transform

**File:** `packages/buddy/src/session/orchestration/proxy-transform.ts`

The `queueSessionPromptAsync` function currently in `interaction-actions.ts` uses `fetchOpenCode` internally. After Steps 5.2, this function uses the SDK directly. The `runSessionTransformProxy` function in `proxy-transform.ts` is no longer called by prompt routes. It may still be called by mermaid repair routes — leave it for now, mark with a deprecation comment.

### Verification

```bash
cd /Users/prashantbhudwal/Code/buddies/decoupling
bun typecheck
bun run --cwd packages/buddy test:contracts

# Verify proxy calls remaining:
rg "proxyToOpenCode|fetchOpenCode" packages/buddy/src/ --no-heading | grep -v ".test."
# Expected: only compatibility.ts, project.ts, discovery.ts, proxy-transform.ts (mermaid repair), proxy.ts (definition)

# Verify prompt routes use SDK:
rg "client.session.prompt|client.session.promptAsync|client.session.command" packages/buddy/src/session/
# Expected: hits in interaction-actions.ts
```

### Acceptance criteria

- [ ] `POST /api/session/{id}/message` — prompt works, response format unchanged
- [ ] `POST /api/session/{id}/prompt_async` — async prompt works
- [ ] `POST /api/session/{id}/command` — `/flashcard` works
- [ ] Teaching state rollback on failed prompt — unchanged
- [ ] Learner evidence recording on accepted prompt — unchanged
- [ ] Session existence check — returns 404 for missing sessions
- [ ] Session abort — still works
- [ ] Model/agent switch events — still correct
- [ ] Buddy-specific request fields — not leaked to OpenCode message storage
- [ ] `rg "proxyToOpenCode" packages/buddy/src/session/orchestration/interaction-actions.ts` — zero results

---

## Deliverable

Branch `decoupling` with:

**Phase 4:**
- New: `plugins/buddy-runtime-plugin.ts` — merged plugin (tools + system prompt guard)
- Renamed: `buddy-tools-plugin.ts` → now resolves the merged plugin URL
- Deleted: `system-prompt-guard-plugin.ts`, `plugins/buddy-system-prompt-guard.ts`, `plugins/buddy-tools-plugin.ts`
- Modified: `overlay-builder.ts` — single plugin URL
- Modified: `opencode-runtime/index.ts` — updated exports

**Phase 5:**
- Modified: `interaction-actions.ts` — `postSessionPrompt`, `postSessionPromptAsync`, `postSessionCommand` use SDK
- Modified: `lookup.ts` — session existence check uses SDK
- Modified: `abort-actions.ts` — abort uses SDK
- Modified: `proxy-transform.ts` — `runSessionTransformProxy` deprecated, kept for mermaid repair
- Zero `proxyToOpenCode` or `fetchOpenCode` in session orchestration files
- All existing tests passing
