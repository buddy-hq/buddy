# Phase 1 Implementation Plan: SDK Client Helper + Low-Risk Route Replacement

> **Branch:** `decoupling` (created from `main`)
> **Worktree:** `/Users/prashantbhudwal/Code/buddies/decoupling`
> **Context docs:** `docs/architecture/decoupling/plugin-analysis.md`, `docs/architecture/decoupling/migration-plan.md`
> **Goal:** Add an OpenCode SDK client helper and replace low-risk proxy routes with direct SDK calls. Zero behavior changes. All existing tests must pass.

## Prerequisites

Before starting, verify the worktree is functional:

```bash
cd /Users/prashantbhudwal/Code/buddies/decoupling
bun install
bun typecheck          # must pass
bun lint               # must pass
bun run --cwd packages/buddy test:contracts  # must pass
bun run --cwd packages/web test:contracts    # must pass
```

## Architecture Context

Currently, Buddy's Hono server talks to vendored OpenCode through a proxy layer:

```
Buddy Hono route
    → proxyToOpenCode(c, { targetPath: "/provider" })
        → prepareProxyBody(c, input)       // JSON body handling + tool registration
        → fetchOpenCode({ directory, path }) // HTTP call to in-process OpenCode
            → loadOpenCodeApp().fetch()     // in-process Hono fetch
```

The goal is to replace proxy calls for low-risk routes with direct SDK calls, while keeping the proxy for prompt/command routes that need Buddy's transform pipeline.

## Step 1: Create the SDK Client Helper

### File: `packages/buddy/src/opencode-runtime/client.ts` (NEW)

This is a single helper that creates a typed OpenCode SDK client wired to the in-process vendored OpenCode server. It follows the exact pattern OpenCode's own plugin loader uses internally.

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"
import { loadOpenCodeApp } from "./runtime"

let clientPromise: Promise<ReturnType<typeof createOpencodeClient>> | undefined

export async function getOpenCodeClient(directory?: string) {
  if (!clientPromise) {
    clientPromise = (async () => {
      const app = await loadOpenCodeApp()
      return createOpencodeClient({
        baseUrl: "http://localhost:4096",
        ...(directory ? { directory } : {}),
        headers: directory
          ? { "x-opencode-directory": encodeURIComponent(directory) }
          : undefined,
        fetch: async (request: Request) => app.fetch(request),
      } as Parameters<typeof createOpencodeClient>[0])
    })()
  }
  return clientPromise
}

/**
 * Get a one-off client scoped to a specific directory.
 * Use for per-request clients where directory changes between calls.
 */
export async function getOpenCodeClientForDirectory(directory: string) {
  const app = await loadOpenCodeApp()
  return createOpencodeClient({
    baseUrl: "http://localhost:4096",
    directory,
    headers: { "x-opencode-directory": encodeURIComponent(directory) },
    fetch: async (request: Request) => app.fetch(request),
  } as Parameters<typeof createOpencodeClient>[0])
}
```

### Verification

After creating this file, verify it compiles:

```bash
bun typecheck
```

Then add a quick smoke test — create a new test file `packages/buddy/test/opencode-sdk-client.test.ts`:

```typescript
import { describe, expect, test } from "bun:test"
import { getOpenCodeClient } from "../src/opencode-runtime/client"
import { tmpdir } from "./helpers/tmpdir"

describe("OpenCode SDK client helper", () => {
  test("creates a client that can call health endpoint", async () => {
    await using project = await tmpdir({ git: true })
    const client = await getOpenCodeClient(project.path)
    const result = await client.global.health()
    expect(result.data).toEqual({ healthy: true })
  })

  test("creates a client that can list sessions", async () => {
    await using project = await tmpdir({ git: true })
    const client = await getOpenCodeClient(project.path)
    const result = await client.session.list()
    expect(Array.isArray(result.data)).toBe(true)
  })
})
```

### Acceptance Criteria
- [ ] `bun typecheck` passes
- [ ] `bun run --cwd packages/buddy test opencode-sdk-client` passes
- [ ] No existing tests break

---

## Step 2: Replace Auth Routes

### File: `packages/buddy/src/routes/auth.ts`

**Current code:** Uses `proxyToOpenCode()` to forward PUT and DELETE to `/auth/{providerID}`.

**Change:** Replace with direct SDK calls.

The route currently looks like:

```typescript
.put("/:providerID", ..., async (c) => {
  return proxyToOpenCode(c, {
    targetPath: `/auth/${encodeURIComponent(c.req.valid("param").providerID)}`,
    directoryMode: "optional",
  })
})
```

Replace with:

```typescript
.put("/:providerID", ..., async (c) => {
  const providerID = c.req.valid("param").providerID
  const directory = resolveOptionalDirectory(c) // existing helper
  const client = await getOpenCodeClientForDirectory(directory)
  const body = await c.req.json()
  const result = await client.auth.set({ providerID, body })
  if (result.error) {
    return c.json({ error: result.error.message ?? "Auth failed" }, 400)
  }
  return c.json(result.data)
})
```

Do the same pattern for DELETE (`client.auth.remove()`).

**Before editing:** Read the existing file completely. Note how `directoryMode: "optional"` resolves. The existing `resolveOptionalDirectoryRequestContext(c)` helper handles this.

### Acceptance Criteria
- [ ] `PUT /api/auth/openai` still sets credentials
- [ ] `DELETE /api/auth/openai` still removes credentials
- [ ] Routes work without a directory parameter (optional mode)
- [ ] Error responses match current format (`{ error: string }`)

---

## Step 3: Replace Provider Routes

### File: `packages/buddy/src/routes/provider.ts`

**Current code:** All 4 routes proxy to OpenCode.

**Routes to replace:**
- `GET /` → `client.provider.list()`
- `GET /auth` → `client.provider.auth()`
- `POST /:providerID/oauth/authorize` → `client.provider.oauth.authorize()`
- `POST /:providerID/oauth/callback` → `client.provider.oauth.callback()`

**Key detail:** These routes use `directoryMode: "bootstrap"` which falls back to a bootstrap workspace directory if no directory is provided. You MUST preserve this behavior — use `ensureGlobalBootstrapWorkspaceDirectory()` (already imported in the project) as the fallback.

### Acceptance Criteria
- [ ] Provider list returns same format as today
- [ ] Provider auth methods return same format as today
- [ ] OAuth authorize still opens browser flow
- [ ] OAuth callback still completes flow
- [ ] Bootstrap workspace fallback still works (no directory param → uses bootstrap dir)

---

## Step 4: Replace MCP Routes

### File: `packages/buddy/src/routes/mcp.ts`

**Current code:** All MCP routes proxy to OpenCode. These are pure transport — no Buddy state mutation.

**Routes to replace:**
- `GET /` → `client.mcp.status()`
- `POST /` → `client.mcp.refresh()` (or call status again)
- `POST /:name/auth` → `client.mcp.auth.start()`
- `POST /:name/auth/callback` → `client.mcp.auth.callback()`
- `POST /:name/auth/authenticate` → `client.mcp.auth.authenticate()`
- `DELETE /:name/auth` → `client.mcp.auth.remove()`
- `POST /:name/connect` → `client.mcp.connect()`
- `POST /:name/disconnect` → `client.mcp.disconnect()`

**Key detail:** Check the SDK types for exact method names. The generated SDK may have slightly different method signatures. Read `packages/sdk/js/src/gen/sdk.gen.ts` (or the vendored equivalent) for the actual method names.

### Acceptance Criteria
- [ ] MCP status list returns correctly
- [ ] MCP connect/disconnect work
- [ ] MCP auth flow still works
- [ ] Error responses match current format

---

## Step 5: Replace Permission Routes

### File: `packages/buddy/src/routes/permission.ts`

**Routes:**
- `GET /` → `client.permission.list()`
- `POST /:requestID/reply` → `client.permission.reply()`

**Key detail:** The `reply` body has `{ reply: "once" | "always" | "reject", message?: string }`. Verify the SDK method accepts these exact fields.

### Acceptance Criteria
- [ ] Permission list returns pending requests
- [ ] Permission reply accepts/rejects correctly
- [ ] "always" reply persists across tool calls

---

## Step 6: Replace Question Routes

### File: `packages/buddy/src/routes/question.ts`

**Routes:**
- `GET /` → `client.question.list()`
- `POST /:requestID/reply` → `client.question.reply()`
- `POST /:requestID/reject` → `client.question.reject()`

### Acceptance Criteria
- [ ] Question list returns pending questions
- [ ] Question reply resolves the question
- [ ] Question reject dismisses the question

---

## Step 7: Replace Global Dispose

### File: `packages/buddy/src/routes/global.ts`

**Route:**
- `POST /global/dispose` → `client.global.dispose()`

This is a single route in the Global routes file. Do not touch other global routes.

### Acceptance Criteria
- [ ] Global dispose still works
- [ ] Other global routes unchanged

---

## Step 8: Replace Config Providers

### File: `packages/buddy/src/routes/config.ts`

**Route:**
- `GET /config/providers` → `client.provider.list()`

**Key detail:** The existing response format wraps provider info in `{ providers: [...], default: {...} }`. The SDK `provider.list()` returns the same shape. Verify the output matches the current `providerConfigResponseSchema`.

### Acceptance Criteria
- [ ] Provider config response format unchanged
- [ ] Default provider IDs still correct

---

## Step 9: Replace Project Routes (Partial)

### File: `packages/buddy/src/routes/project.ts`

Only replace routes that are pure proxy pass-through:

- `PATCH /:projectID` → `client.project.update()`

**Do NOT touch** routes that have Buddy-side logic (like `POST /` which calls `openProjectFromPayload()`).

### Acceptance Criteria
- [ ] Project update still works
- [ ] Response format unchanged

---

## What NOT to touch in Phase 1

These files/proxies stay unchanged:

| File | Reason |
|---|---|
| `routes/session.ts` | Prompt/command/compact/revert routes use the proxy transform pipeline |
| `routes/compatibility.ts` | Complex route with file operations, command catalog, file content |
| `routes/config.ts` (write paths) | Config writes have Buddy side effects (cache invalidation, MCP sync) |
| `routes/global.ts` (event stream) | SSE event stream |
| `routes/learner.ts` | Buddy-owned teaching routes, no proxy |
| `session/orchestration/core-actions.ts` | prompt/command orchestration with state management |
| `session/orchestration/interaction-actions.ts` | prompt transform pipeline |
| `session/orchestration/proxy-transform.ts` | `runSessionTransformProxy` |
| `session/orchestration/abort-actions.ts` | Session abort with state cleanup |
| `session/orchestration/lookup.ts` | Session existence checks |
| `http/proxy.ts` + `proxy/` | Keep until all callers are gone |

---

## General Rules for All Replacements

1. **Read the existing file completely before editing.** Understand the current behavior — headers, query params, error handling, response format.

2. **Preserve error format.** The frontend expects `{ error: string }`. If the SDK returns a different error shape, normalize it. The SDK client may throw — wrap in try/catch and return the Buddy error envelope.

3. **Preserve directory resolution.** Routes use `directoryMode: "required"`, `"optional"`, or `"bootstrap"`. The existing helpers (`resolveDirectoryRequestContext`, `ensureAllowedDirectory`, `ensureGlobalBootstrapWorkspaceDirectory`) handle these. Use them exactly as the existing code does.

4. **Preserve query parameters.** Some proxy calls forward query strings. The SDK methods accept typed parameters — pass them through.

5. **Don't change response schemas.** The OpenAPI route descriptors define response types. Keep them identical. If a schema becomes inaccurate, update the schema — not the response shape.

6. **Run tests after each route replacement.** `bun run --cwd packages/buddy test:contracts` should stay green.

7. **If a route replacement breaks, revert and move on.** Some routes may have hidden side effects not visible in the proxy call. If a replacement doesn't work cleanly, leave that route for a later phase.

---

## Verification Checklist (Run After All Replacements)

```bash
# Basic health
cd /Users/prashantbhudwal/Code/buddies/decoupling
bun typecheck
bun lint

# Buddy contract tests
bun run --cwd packages/buddy test:contracts

# Web contract tests
bun run --cwd packages/web test:contracts

# Specific route regression tests
bun run --cwd packages/buddy test -- --grep "auth"
bun run --cwd packages/buddy test -- --grep "provider"
bun run --cwd packages/buddy test -- --grep "mcp"
bun run --cwd packages/buddy test -- --grep "permission"
bun run --cwd packages/buddy test -- --grep "question"

# Verify proxy calls remaining (should only be session + compatibility routes)
rg "proxyToOpenCode|fetchOpenCode" packages/buddy/src/
```

---

## Deliverable

A branch `decoupling` with:
1. New file: `packages/buddy/src/opencode-runtime/client.ts`
2. New test: `packages/buddy/test/opencode-sdk-client.test.ts`
3. Modified routes: `auth.ts`, `provider.ts`, `mcp.ts`, `permission.ts`, `question.ts`, `global.ts` (dispose only), `config.ts` (providers only), `project.ts` (update only)
4. All existing tests passing
5. `rg "proxyToOpenCode" packages/buddy/src/` shows only session + compatibility routes remaining
