# Buddy Hybrid OpenCode Architecture Plan

Date: 2026-02-28

Related audit: `docs/opencode-sdk-replacement-audit.md`

## Goal

Adopt `@opencode-ai/sdk/v2` for the parts of Buddy that map cleanly to OpenCode's public API, while intentionally keeping a small vendored/internal layer for the capabilities the SDK does not expose yet.

This sets a cleaner dependency boundary:

- public OpenCode API usage is guarded by the SDK contract,
- Buddy-specific product behavior stays in Buddy,
- only a narrow, explicit seam remains coupled to vendored OpenCode internals.

## Code-Backed Facts In This Repo

These statements are directly supported by the current codebase and are the basis for this plan.

### Fact 1: The repo already vendors `@opencode-ai/sdk` as a workspace package

Backed by:

- root workspace includes `vendor/opencode/packages/sdk/js` in `package.json`
- vendored SDK package declares `"name": "@opencode-ai/sdk"` in `vendor/opencode/packages/sdk/js/package.json`

What this means:

- Buddy does not need to fetch the SDK from npm to use the package source already present in this repo.
- However, `packages/buddy/package.json` does not currently declare `@opencode-ai/sdk`, so Buddy would still need a direct dependency entry before importing it.

### Fact 2: `createOpencodeServer()` starts a separate `opencode` process

Backed by:

- `vendor/opencode/packages/sdk/js/src/server.ts` calls `spawn("opencode", ...)`

What this means:

- Calling `createOpencodeServer()` is an explicit move to a child-process OpenCode runtime.
- It is not a wrapper around the embedded vendored `Server.App()` runtime.

### Fact 3: The SDK client already supports a custom `fetch`

Backed by:

- `vendor/opencode/packages/sdk/js/src/client.ts` accepts `config.fetch` and only installs a default fetch when one is not provided

What this means:

- Buddy can use the SDK client without starting a second server.
- The SDK client can be pointed at the existing embedded runtime through a custom fetch adapter.

### Fact 4: OpenCode itself already uses the SDK client against `Server.App().fetch(...)`

Backed by:

- `vendor/opencode/packages/opencode/src/plugin/index.ts`
- `vendor/opencode/packages/opencode/src/cli/cmd/run.ts`
- `vendor/opencode/packages/opencode/src/cli/cmd/tui/worker.ts`

In all three places, vendored OpenCode:

- creates an SDK client with `createOpencodeClient(...)`
- passes a custom `fetch`
- routes that fetch to `Server.App().fetch(...)`

What this means:

- A single-runtime, SDK-client-over-embedded-runtime design is not speculative.
- It already exists upstream inside the vendored OpenCode code you carry.

### Fact 5: Buddy currently embeds the vendored runtime in-process

Backed by:

- `packages/buddy/src/opencode/runtime.ts` calls `Server.App()`
- `packages/buddy/src/index.ts` uses `fetchOpenCode(...)` / `proxyToOpenCode(...)` to issue in-process requests against that app

What this means:

- Buddy's current backend is an embedded-runtime design today.

### Fact 6: If Buddy keeps the embedded runtime and also calls `createOpencodeServer()`, that creates two runtimes

Backed by the combination of:

- Fact 2 (`createOpencodeServer()` spawns a separate process)
- Fact 5 (Buddy already uses an embedded in-process runtime)

What this means:

- The first hybrid phase should not call `createOpencodeServer()`.
- The clean first step is a single-runtime design using the SDK client over the existing embedded runtime.

## Target Architecture

Buddy should become a 3-layer system:

1. `Buddy API Layer`
2. `OpenCode SDK Gateway`
3. `Vendored Extension Layer`

### 1. Buddy API Layer

This layer owns:

- Buddy's HTTP routes
- request auth
- directory allow-list enforcement
- payload normalization
- prompt shaping
- curriculum routes
- teaching routes
- compatibility behavior for the existing web app

This layer should not call vendored OpenCode APIs directly unless the feature is explicitly classified as vendored-only.

Primary file today:

- `packages/buddy/src/index.ts`

### 2. OpenCode SDK Gateway

This layer is the default integration path for OpenCode.

It should own:

- creating/configuring the SDK client
- all public OpenCode API calls
- translating Buddy inputs to SDK method calls
- translating SDK responses into Buddy's existing compatibility responses when needed

This should become the only place in Buddy that imports `@opencode-ai/sdk/v2` for backend runtime work.

Suggested new file:

- `packages/buddy/src/opencode/sdk-gateway.ts`

### 3. Vendored Extension Layer

This layer is the escape hatch for capabilities the SDK cannot replace yet.

It should be kept intentionally small and isolated.

This layer owns only:

- dynamic runtime tool registration
- in-memory config overlays / instance rebinding
- direct `Instance`-scoped runtime access
- LSP diagnostics internals
- any other true non-public OpenCode runtime hooks

Primary files today:

- `packages/buddy/src/opencode/runtime.ts`
- `packages/buddy/src/opencode/curriculum-tools.ts`
- `packages/buddy/src/teaching/teaching-tools.ts`
- `packages/buddy/src/teaching/teaching-service.ts`
- `packages/opencode-adapter/src/*`

## Hard Boundary Rules

To keep the hybrid clean, use these rules:

### Rule 1: Public OpenCode API means SDK only

If a feature can be expressed with a public OpenCode API method, Buddy route handlers should call the SDK gateway.

Route handlers should not call:

- `fetchOpenCode(...)`
- `proxyToOpenCode(...)`
- any `@buddy/opencode-adapter/*` runtime helper

Single-runtime exception:

- In the first hybrid phase, the SDK gateway itself may still be backed by `Server.App().fetch(...)` through a custom SDK `fetch`.
- That still satisfies the boundary, because route code depends on the SDK surface, not raw vendored transport helpers.

### Rule 2: Vendored internals require explicit justification

Any use of the vendored extension layer should be clearly justified in code comments as one of:

- SDK gap
- plugin gap
- temporary migration bridge

### Rule 3: Keep the frontend stable initially

Do not change the web app transport first.

The frontend should continue talking to Buddy's `/api` routes while the backend swaps internals behind those routes.

Primary frontend callers that should remain stable during the first migration:

- `packages/web/src/state/chat-actions.ts`
- `packages/web/src/state/chat-sync.ts`
- `packages/web/src/state/teaching-actions.ts`
- `packages/web/src/state/project-settings.ts`

## What Goes on the SDK

These should move first into the SDK gateway.

### Session Lifecycle

- session list
- session create
- session get
- session update
- session messages

Mapped SDK methods:

- `client.session.list(...)`
- `client.session.create(...)`
- `client.session.get(...)`
- `client.session.update(...)`
- `client.session.messages(...)`

### Prompt Transport

Buddy should keep building its own prompt payload, but the final transport should move to:

- `client.session.prompt(...)`

That means the SDK owns:

- request transport
- response handling
- OpenCode API compatibility

But Buddy still owns:

- `content` to `parts` normalization
- system prompt merging
- curriculum injection
- teaching policy injection
- busy-state normalization behavior

### Session Control

- session abort
- session status

Mapped SDK methods:

- `client.session.abort(...)`
- `client.session.status(...)`

### Permissions

- permission list
- permission reply

Mapped SDK methods:

- `client.permission.list(...)`
- `client.permission.reply(...)`

### Global Runtime APIs

- health
- global dispose
- event stream

Mapped SDK methods:

- `client.global.health()`
- `client.global.dispose()`
- `client.global.event()`

## What Stays Vendored

These remain in the vendored extension layer until a later replacement exists.

### Dynamic Tool Registration

Keep vendored for now:

- curriculum runtime tools
- teaching runtime tools

Current files:

- `packages/buddy/src/opencode/curriculum-tools.ts`
- `packages/buddy/src/teaching/teaching-tools.ts`

Reason:

- The SDK can inspect tools, but it cannot define or register them.

Likely future replacement:

- OpenCode plugin/custom-tools integration, not the SDK.

### Config Overlay and Runtime Rebinding

Keep vendored for now:

- per-directory config overlays
- hot disposal/rebootstrap of OpenCode runtime state

Current files:

- `packages/opencode-adapter/src/config.ts`
- `packages/opencode-adapter/src/instance.ts`
- portions of `packages/buddy/src/index.ts`

Reason:

- The SDK only exposes persistent config endpoints, not in-memory overlays.

### LSP Diagnostics for Teaching

Keep vendored for now:

- `LSP.hasClients(...)`
- `LSP.touchFile(...)`
- `LSP.diagnostics()`

Current file:

- `packages/buddy/src/teaching/teaching-service.ts`

Reason:

- The SDK exposes only `lsp.status`, not file diagnostics.

### Desktop Runtime Packaging

Keep vendored for now:

- OpenCode migration copy step for the Tauri sidecar resources

Current file:

- `packages/desktop/scripts/predev.ts`

Reason:

- The SDK is not a replacement for OpenCode's database runtime assets.

## Recommended New Backend Modules

Add these modules to make the seam explicit.

### `packages/buddy/src/opencode/sdk-client.ts`

Purpose:

- instantiate and configure the OpenCode SDK client
- centralize the single-runtime SDK transport adapter first

Responsibilities:

- create a singleton client
- in the first hybrid phase, provide a custom `fetch` that routes requests to `Server.App().fetch(...)`
- set a synthetic base URL for SDK path construction (for example, an internal placeholder host)

Notes:

- This is code-backed by how vendored OpenCode already wires the SDK in:
  - `vendor/opencode/packages/opencode/src/plugin/index.ts`
  - `vendor/opencode/packages/opencode/src/cli/cmd/run.ts`
  - `vendor/opencode/packages/opencode/src/cli/cmd/tui/worker.ts`
- `createOpencodeServer()` should not be used in phase 1, because that would introduce a second OpenCode runtime while Buddy still uses the embedded one.
- If Buddy imports `@opencode-ai/sdk`, add it to `packages/buddy/package.json` as a direct dependency first. The package is already present in the monorepo workspace, but Buddy does not currently declare it.

### `packages/buddy/src/opencode/sdk-gateway.ts`

Purpose:

- wrap all SDK-backed OpenCode operations behind Buddy-friendly methods

Suggested methods:

- `listSessions(directory)`
- `createSession(directory, input?)`
- `getSession(directory, sessionID)`
- `updateSession(directory, sessionID, patch)`
- `listMessages(directory, sessionID)`
- `sendPrompt(directory, sessionID, payload)`
- `getSessionStatus(directory)`
- `abortSession(directory, sessionID)`
- `listPermissions(directory)`
- `replyPermission(directory, requestID, reply)`
- `getGlobalHealth()`
- `disposeGlobal()`
- `openGlobalEventStream(...)`

### `packages/buddy/src/opencode/prompt-orchestrator.ts`

Purpose:

- keep Buddy-owned prompt shaping out of route handlers

Responsibilities:

- normalize `content` into parts
- build Buddy system prompt
- inject curriculum context
- inject teaching workspace context
- inject teaching policy
- decide whether vendored-only tool registration is needed

### `packages/buddy/src/opencode/vendored-runtime.ts`

Purpose:

- centralize the remaining vendored hooks so they stop leaking across route code

Suggested responsibilities:

- `ensureCurriculumToolsRegistered(directory)`
- `ensureTeachingToolsRegistered(directory)`
- `syncOpenCodeProjectConfig(directory)`
- vendored runtime warm-up helpers
- any unavoidable `Instance.provide(...)` access

## What to Do with `packages/buddy/src/index.ts`

Right now, `index.ts` mixes:

- route definitions
- request validation
- prompt shaping
- vendored OpenCode proxy transport
- config sync
- Buddy-only behavior

That file should shrink into orchestration only.

### Desired end state for `index.ts`

It should mostly:

- validate request
- enforce directory policy
- call `prompt-orchestrator` when needed
- call `sdk-gateway` for SDK-backed operations
- call `vendored-runtime` only when a known SDK gap exists
- translate results to Buddy's HTTP responses

### Specifically, these should leave `index.ts`

Move out:

- raw OpenCode transport logic (`fetchOpenCode`, most `proxyToOpenCode`)
- SDK-backed session/permission/global behavior
- prompt construction details
- vendored runtime sync details

Keep in `index.ts`:

- route wiring
- compatibility response shaping
- Buddy auth/CORS/logger middleware
- route-specific error translation

## Migration Sequence

This is the safest order.

### Phase 1: Introduce the seam

Add:

- `sdk-client.ts`
- `sdk-gateway.ts`
- `prompt-orchestrator.ts`
- `vendored-runtime.ts`

Do not change the frontend yet.

Do not remove vendored code yet.

Do not call `createOpencodeServer()` in this phase.

Goal:

- make the architecture explicit before changing behavior.
- keep one OpenCode runtime
- move to an SDK client boundary without changing the runtime model

### Phase 2: Migrate session reads/writes

Move these routes to `sdk-gateway` first:

- `GET /api/session`
- `POST /api/session`
- `GET /api/session/:sessionID`
- `PATCH /api/session/:sessionID`
- `GET /api/session/:sessionID/message`

Why first:

- these routes already map to public session APIs
- these routes do not require teaching-specific tool registration or LSP diagnostics in the current code

### Phase 3: Migrate prompt transport

Keep Buddy prompt shaping, but move final send to:

- `sdk-gateway.sendPrompt(...)`

Keep vendored-only hooks in place temporarily:

- curriculum tool registration
- teaching tool registration
- config overlay sync

This is the key hybrid step:

- Buddy owns the prompt,
- SDK owns the transport.

### Phase 4: Migrate permission and session control

Move:

- permission list/reply
- session status
- session abort

These routes continue removing direct route-level use of `fetchOpenCode(...)`.

### Phase 5: Migrate global APIs

Move:

- global health
- global dispose
- event stream plumbing where feasible

Note:

- Buddy's `/api/event` route shape differs from stock `/global/event`, so keep the Buddy HTTP route even if the backend implementation is SDK-backed.

### Phase 6: Collapse residual raw proxy helpers

After the major public APIs are moved:

- delete or sharply narrow `fetchOpenCode(...)`
- delete or sharply narrow `proxyToOpenCode(...)`

By this point, those helpers should only exist for true vendored-only flows, if they still exist at all.

Important clarification:

- In the single-runtime phase, the SDK client may still internally use `Server.App().fetch(...)`.
- The goal here is to remove raw route-level proxying helpers, not to remove the embedded runtime yet.

## Long-Term Options for the Vendored Layer

Once the hybrid is stable, there are two realistic next steps.

### Option A: Keep a Minimal Vendored Core

Use the SDK for public APIs, and keep a tiny vendored/internal layer for:

- tool registration
- config overlays
- LSP diagnostics

This changes fewer subsystems:

- public API transport moves to the SDK boundary
- vendored-only extension features stay in place

### Option B: Replace Vendored-Only Features Incrementally

Replace the remaining internals with:

- Buddy-owned implementations, or
- OpenCode plugins/custom tools

This changes more subsystems:

- tool registration would move off vendored internals
- LSP-dependent teaching behavior would need a new implementation path
- config overlay behavior would need a new implementation path

## Practical Definition of "Guarded from Changes"

The hybrid only gives you protection if the seam is enforced.

The boundary is explicit when:

- route handlers do not import vendored runtime modules for public API calls
- vendored OpenCode internals are isolated to a short, auditable list of files
- SDK-backed code paths are the default, not the exception

The boundary is weak when:

- new route work keeps using `fetchOpenCode(...)`
- vendored imports continue to spread through unrelated modules
- the SDK and vendored runtime are mixed inside the same feature path without clear ownership

## Immediate Implementation Recommendation

Start with one disciplined boundary:

- build an SDK gateway
- route all session + permission + public transport through it
- keep curriculum/teaching internals vendored

This changes the highest-traffic public API paths first:

- session, prompt transport, and permission routes stop depending on raw route-level vendored proxy helpers
- curriculum and teaching internals remain unchanged in the first pass
- the remaining vendored dependency surface becomes easier to enumerate

## Success Criteria

The hybrid migration is successful when:

- Buddy's web app behavior does not change
- `packages/web/src/*` does not need a transport rewrite
- route handlers no longer call raw vendored OpenCode proxy helpers for SDK-covered operations
- the SDK gateway is the only place that issues SDK-covered OpenCode transport calls
- if Buddy is still in the single-runtime phase, any remaining `Server.App().fetch(...)` usage for SDK-covered operations is contained inside the SDK transport adapter
- vendored OpenCode imports are limited to the extension layer
- the remaining vendored dependencies are all there for explicit, documented SDK gaps
