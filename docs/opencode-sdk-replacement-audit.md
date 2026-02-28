# Buddy OpenCode SDK Replacement Audit

Date: 2026-02-27

## Executive Summary

Buddy currently depends on vendored OpenCode in two very different ways:

1. Through the public OpenCode HTTP API, proxied in-process by the vendored server.
2. Through non-public OpenCode runtime internals, accessed via `@buddy/opencode-adapter`.

The first category is largely replaceable with `@opencode-ai/sdk/v2` today.
The second category is not.

In practical terms:

- The core chat/session loop, permission workflow, and most session lifecycle calls can move to the SDK.
- Buddy-specific prompt shaping can stay in Buddy and call the SDK underneath.
- Buddy-specific curriculum and teaching products cannot be reproduced with the SDK alone because they depend on dynamic tool registration, config overlays, and LSP internals that the SDK does not expose.
- If you want to remove vendored OpenCode entirely, the likely replacement for custom tools is the OpenCode plugin/custom-tools system, not the SDK.

The best target is `@opencode-ai/sdk/v2`, not the top-level v1 surface, because Buddy's current proxied routes line up most closely with the v2 method names and payloads.

## What This Audit Covers

This audit traces every Buddy-owned feature that currently depends on vendored OpenCode code, either:

- directly through `@buddy/opencode-adapter/*`, or
- indirectly through the in-process vendored OpenCode server (`Server.App()` + `app.fetch(...)`).

It also calls out adjacent product features that overlap with SDK capabilities even when the current implementation is already Buddy-owned, because those are relevant migration candidates.

Files inspected for this audit include:

- `packages/buddy/src/index.ts`
- `packages/buddy/src/opencode/runtime.ts`
- `packages/buddy/src/opencode/curriculum-tools.ts`
- `packages/buddy/src/teaching/teaching-tools.ts`
- `packages/buddy/src/teaching/teaching-service.ts`
- `packages/buddy/src/curriculum/curriculum-service.ts`
- `packages/buddy/src/agent/agent.ts`
- `packages/opencode-adapter/src/*`
- `packages/web/src/state/chat-actions.ts`
- `packages/web/src/state/chat-sync.ts`
- `packages/web/src/state/teaching-actions.ts`
- `packages/web/src/state/project-settings.ts`
- `vendor/opencode/packages/sdk/js/src/v2/*`
- `vendor/opencode/packages/sdk/js/src/server.ts`

## Replacement Labels Used Below

- `Direct`: The public SDK already exposes what Buddy needs. You can reimplement the feature with SDK calls plus ordinary Buddy application code.
- `Partial`: The SDK exposes part of the capability, but Buddy currently adds important behavior that you still need to keep or rebuild.
- `No`: The current feature depends on non-public OpenCode runtime internals that are not exposed by the SDK.

## 1. Current OpenCode Dependency Inventory

### 1.1 Adapter Modules That Buddy Actually Uses

| Adapter module | Where Buddy uses it | What Buddy is using it for | SDK equivalent | Replaceability |
| --- | --- | --- | --- | --- |
| `@buddy/opencode-adapter/server` | `packages/buddy/src/opencode/runtime.ts` | Calls `Server.App()` to embed the vendored OpenCode Hono app in-process and proxy raw `Request`/`Response` objects. | `createOpencodeServer()` only spawns the `opencode` CLI and returns `{ url, close }`. No in-process app handle. | `No` |
| `@buddy/opencode-adapter/config` | `packages/buddy/src/index.ts` | Calls `setConfigOverlay()` to monkey-patch vendored `Config.get()` with in-memory per-directory overlays. | Public SDK has `client.config.update()` / `client.global.config.update()`, which persist config. No overlay hook. | `No` |
| `@buddy/opencode-adapter/project` | `packages/buddy/src/index.ts` | Calls `Project.fromDirectory()` to eagerly initialize an OpenCode project before adding it to Buddy's notebook registry. | Closest public analog is `client.project.current({ directory })` or any other request scoped to that directory. No explicit "open project" API. | `Partial` |
| `@buddy/opencode-adapter/instance` | `packages/buddy/src/index.ts`, `curriculum-service.ts`, `curriculum-tools.ts`, `teaching-tools.ts`, `teaching-service.ts` | Uses `Instance.provide(...)`, `Instance.project.id`, and `Instance.dispose()` for runtime scoping, tool registration, project identity lookup, and hot rebootstrap. | No public SDK access to in-memory `Instance` state. | `No` |
| `@buddy/opencode-adapter/tool` | `packages/buddy/src/opencode/curriculum-tools.ts`, `packages/buddy/src/teaching/teaching-tools.ts`, `packages/buddy/src/opencode/vendor.ts`, `packages/buddy/src/agent/agent.ts` | Uses `Tool.define`, `WriteTool`, `EditTool`, `FileTime`, and `Truncate` to define custom tools, reuse vendor file mutation behavior, mark file reads, and reuse glob constants. | SDK exposes tool listing/introspection only. It does not define or register tools, and it does not expose `WriteTool`/`EditTool` helpers. | `No` |
| `@buddy/opencode-adapter/registry` | `packages/buddy/src/opencode/curriculum-tools.ts`, `packages/buddy/src/teaching/teaching-tools.ts` | Calls `ToolRegistry.register(...)` to inject Buddy-owned tools into the live OpenCode runtime. | No public SDK API for tool registration. | `No` |
| `@buddy/opencode-adapter/permission` | `packages/buddy/src/opencode/vendor.ts`, transitive use in `packages/buddy/src/agent/agent.ts` | Uses `PermissionNext` helpers for rule parsing, rule merging, reply validation, and permission request wiring. | SDK exposes permission endpoints and a `PermissionRuleset` type, but not `fromConfig()`/`merge()` helper logic. | `Partial` |
| `@buddy/opencode-adapter/lsp` | `packages/buddy/src/teaching/teaching-service.ts` | Uses `LSP.hasClients`, `LSP.touchFile`, and `LSP.diagnostics()` to power live teaching diagnostics. | SDK only exposes `client.lsp.status()`. No diagnostics API. | `No` |

### 1.2 Adapter Surface Present But Not Currently Used

These adapter files exist but are not currently used by Buddy-owned runtime code:

- `packages/opencode-adapter/src/agent.ts`
- `packages/opencode-adapter/src/provider-transform.ts`

That means they are not current migration blockers for Buddy's product surface.

### 1.3 Other Vendored Couplings Outside the Adapter

These are not public SDK calls, but they are still real vendored OpenCode dependencies:

- `packages/buddy/src/opencode/env.ts`: Buddy sets isolated XDG paths and `OPENCODE_CLIENT=web` to shape the embedded runtime environment.
- `packages/desktop/scripts/predev.ts`: Buddy copies `vendor/opencode/packages/opencode/migration` into the Tauri bundle. The SDK does not ship migrations, so this dependency is not removable via SDK adoption.

## 2. Feature-by-Feature Audit

This section focuses on features Buddy is actually using in the first-party app and backend, then classifies whether the SDK can replace the current vendored dependency.

### 2.1 Core Chat and Session Features

These are the strongest SDK migration candidates. Today Buddy proxies them by sending raw requests into the embedded vendored server via `loadOpenCodeApp()` / `fetchOpenCode()`. Nearly all of these map directly to `@opencode-ai/sdk/v2`.

#### 2.1.1 Session list and session selection

Current Buddy behavior:

- Web calls `loadSessions(directory)` from `packages/web/src/state/chat-actions.ts`.
- Backend proxies `GET /api/session` to vendored `GET /session`.
- Web sometimes calls `GET /api/session/:sessionID` when selecting or recovering a session by ID.

SDK mapping:

- `client.session.list({ directory })`
- `client.session.get({ sessionID, directory })`

Classification: `Direct`

Important caveat:

- Buddy adds one extra check in `GET /api/session/:sessionID`: it compares the returned session's project against the requested directory and returns `404` if the session belongs to a different project. That check currently relies on internal `OpenCodeInstance.project.id`.
- The SDK can still fetch the session, but Buddy must keep its own directory-to-session scoping rule if you want the exact current behavior.

#### 2.1.2 Session creation

Current Buddy behavior:

- Web calls `createSession(directory)` from `packages/web/src/state/chat-actions.ts`.
- Backend proxies `POST /api/session` to vendored `POST /session`.

SDK mapping:

- `client.session.create({ directory })`

Classification: `Direct`

Notes:

- This is one of the cleanest one-to-one mappings in the entire codebase.
- If you move this to the SDK, nothing about Buddy's user-visible behavior needs to change.

#### 2.1.3 Session message history

Current Buddy behavior:

- Web calls `loadMessages(directory, sessionID)`.
- Backend proxies `GET /api/session/:sessionID/message` to vendored `GET /session/:sessionID/message`.

SDK mapping:

- `client.session.messages({ sessionID, directory })`

Classification: `Direct`

Notes:

- The Buddy frontend's transcript shape (`MessageWithParts`) already assumes the same OpenCode message/part model the SDK returns.

#### 2.1.4 Sending a prompt

Current Buddy behavior:

- Web calls `sendPrompt(directory, content, { agent, teaching })`.
- Backend handles `POST /api/session/:sessionID/message`.
- Before forwarding, Buddy:
  - rewrites `content` into the first text part,
  - rejects empty prompt payloads,
  - merges a Buddy-owned `system` prompt,
  - injects condensed curriculum context,
  - injects teaching workspace context and policy,
  - conditionally registers Buddy curriculum tools,
  - conditionally registers Buddy teaching tools when the `code-teacher` agent is selected,
  - normalizes "busy" errors to `409`.

SDK mapping:

- Base API call: `client.session.prompt({ sessionID, directory, agent, parts, system, ... })`

Classification: `Partial`

What the SDK covers:

- The transport and the OpenCode message API itself.
- Agent selection.
- Parts payloads.
- `system` prompt injection (if Buddy computes the string itself and passes it in).

What the SDK does not cover:

- Buddy's automatic `content` to `parts` rewrite.
- Buddy's curriculum condensation.
- Buddy's teaching context/policy injection.
- Buddy's dynamic runtime tool registration.
- Buddy's busy-error normalization.

Bottom line:

- The session prompt feature is SDK-backed at the transport layer.
- The exact Buddy prompt behavior still requires Buddy-owned middleware around the SDK call.

#### 2.1.5 Aborting a running prompt

Current Buddy behavior:

- Web calls `abortPrompt(directory)`.
- Backend first calls vendored `GET /session/status`.
- If the session is already idle, Buddy returns `false` without calling abort.
- Otherwise it proxies `POST /session/:sessionID/abort`.

SDK mapping:

- `client.session.status({ directory })`
- `client.session.abort({ sessionID, directory })`

Classification: `Direct`

Notes:

- The pre-check is Buddy logic, not a vendor-only dependency.
- You can preserve the current UX exactly by doing the same two SDK calls.

#### 2.1.6 Updating session metadata (rename/archive)

Current Buddy behavior:

- Web calls `updateSession({ directory, sessionID, title?, archivedAt? })`.
- Backend proxies `PATCH /api/session/:sessionID`.
- Buddy only uses this today for title updates and archive timestamps.

SDK mapping:

- `client.session.update({ sessionID, directory, title, time: { archived } })`

Classification: `Direct`

#### 2.1.7 Live global event stream

Current Buddy behavior:

- Web calls `startChatSync(...)`.
- It subscribes to `/api/event`.
- The frontend consumes standard OpenCode-style SSE payloads and coalesces:
  - `session.status`
  - `message.updated`
  - `message.part.updated`
  - `message.part.delta`

SDK mapping:

- `client.global.event(...)`

Classification: `Direct` for the event capability itself, `Partial` if you want to point the SDK directly at Buddy's current HTTP surface.

Important caveat:

- The SDK expects the OpenCode path `/global/event`.
- Buddy exposes `/api/event`, not `/api/global/event`.
- So the capability is public and SDK-backed, but Buddy's current compatibility route is not a path-for-path OpenCode SDK endpoint.

#### 2.1.8 Permission inbox and permission replies

Current Buddy behavior:

- Web calls:
  - `loadPermissions(directory)` -> `GET /api/permission`
  - `replyPermission({ requestID, reply, message })` -> `POST /api/permission/:requestID/reply`
- Backend proxies those to vendored `/permission` and `/permission/:requestID/reply`.

SDK mapping:

- `client.permission.list({ directory })`
- `client.permission.reply({ requestID, directory, reply, message })`

Classification: `Direct`

This is another strong one-to-one SDK replacement candidate.

#### 2.1.9 Health checks

Current Buddy behavior:

- Backend exposes `GET /api/health`, which proxies vendored `GET /global/health`.
- The first-party web app does not currently call it.

SDK mapping:

- `client.global.health()`

Classification: `Direct` for capability, `Partial` for current HTTP path compatibility.

Important caveat:

- The SDK expects `/global/health`.
- Buddy exposes `/api/health`, not `/api/global/health`.

### 2.2 Project and Directory Features

These are more mixed. Some overlap with the SDK, but Buddy's semantics are not the same as stock OpenCode.

#### 2.2.1 Buddy notebook registry (`/api/project`)

Current Buddy behavior:

- Web calls:
  - `loadProjects()`
  - `rememberProject(directory)`
  - project deletion through `DELETE /api/project?directory=...`
- Backend stores a curated notebook list in `desktop-notebooks.json`.
- `POST /api/project` also calls `OpenCodeProject.fromDirectory(directory)` before persisting the directory.

What this feature really is:

- It is not the stock OpenCode "project list" API.
- It is Buddy's own persisted notebook list plus an eager "open this directory" step.

SDK overlap:

- `client.project.list({ directory? })`
- `client.project.current({ directory? })`
- `client.project.update(...)`

Classification: `Partial`

Why it is not direct:

- The SDK does not expose a first-class "remember this directory in my notebook list" or "forget this directory" API.
- Buddy's POST side effect uses internal `Project.fromDirectory()`. There is no explicit SDK `project.open(...)`.
- You can approximate the eager-open step by making any SDK call scoped to the directory, but the notebook registry itself remains Buddy-owned.

#### 2.2.2 Directory scoping

Current Buddy behavior:

- Buddy accepts both `x-buddy-directory` and `x-opencode-directory`.
- It also accepts a `directory` query parameter on several routes.
- The first-party web app uses `x-buddy-directory`.

SDK overlap:

- `createOpencodeClient({ directory })` automatically sends `x-opencode-directory`.
- Many v2 methods also accept `directory` as a parameter.

Classification: `Direct`

Important implication:

- If you keep the Buddy backend, the SDK's directory header already works against Buddy for most routes because Buddy accepts `x-opencode-directory`.
- The main incompatibilities are route names, not directory transport.

### 2.3 Config and Agent Features

This is where the SDK overlaps functionally, but Buddy has deliberately diverged from stock OpenCode behavior.

#### 2.3.1 Project config (`/api/config`)

Current Buddy behavior:

- Web calls:
  - `loadProjectConfig(directory)`
  - `patchProjectConfig(directory, patch)`
- Backend reads and writes Buddy-owned config files (`buddy.json` / `buddy.jsonc`) using Buddy's custom parser/patcher.
- After a successful write, Buddy calls `syncOpenCodeProjectConfig(directory)`, which:
  - builds an in-memory overlay,
  - patches vendored `Config.get()` via `setConfigOverlay()`,
  - disposes the vendored OpenCode instance so it reboots with the new overlay.

Why Buddy does this:

- The code explicitly avoids calling vendored `PATCH /config` because stock OpenCode `Config.update()` writes `config.json` into the project root, which Buddy treats as config pollution.

SDK overlap:

- `client.config.get({ directory })`
- `client.config.update({ directory, config })`

Classification: `Partial` if you can accept stock OpenCode config semantics, `No` if you need Buddy's exact current behavior.

What is directly replaceable:

- Reading and writing OpenCode config over the public API.

What is not:

- Buddy's `buddy.json/jsonc` file format and merge behavior.
- The in-memory overlay patch.
- The "do not write OpenCode config into the repo root" guarantee.
- Hot rebootstrap by calling internal `Instance.dispose()`.

#### 2.3.2 Global config (`/api/global/config`)

Current Buddy behavior:

- Backend exposes global config get/patch.
- The first-party web app does not currently call it.
- Behavior mirrors Buddy's own config file system, not stock OpenCode's persistent config model.

SDK overlap:

- `client.global.config.get()`
- `client.global.config.update({ config })`

Classification: `Partial` for the same reason as project config.

#### 2.3.3 Global dispose (`/api/global/dispose`)

Current Buddy behavior:

- Backend exposes a disposal route.
- It is not currently called by the first-party web app.

SDK overlap:

- `client.global.dispose()`

Classification: `Direct`

#### 2.3.4 Agent catalog shown in project settings (`/api/config/agents`)

Current Buddy behavior:

- Web calls `loadAgentCatalog(directory)`.
- Backend returns Buddy's own agent catalog built in `packages/buddy/src/agent/agent.ts`.
- The catalog includes Buddy-owned primary and subagent identities:
  - `build`
  - `code-teacher`
  - `plan`
  - `general`
  - `curriculum-builder`
- Buddy uses `PermissionNext.fromConfig()` and `PermissionNext.merge()` to synthesize permission rules for these agents.

SDK overlap:

- `client.app.agents({ directory })` exists.

Classification: `Partial`

Why it is not direct:

- `client.app.agents()` returns the OpenCode runtime's agent list at `/agent`.
- Buddy's `/api/config/agents` is not the same thing. It is a Buddy-specific curated list, with Buddy-only prompts, hidden-state filtering, and Buddy-only permissions.
- The SDK does not build or merge Buddy's agent policy for you.

#### 2.3.5 Provider catalog shown in project settings (`/api/config/providers`)

Current Buddy behavior:

- Web calls `loadProviderCatalog(directory)`.
- Backend serves this from Buddy's own provider catalog code (`packages/buddy/src/provider/provider.ts`), not from the adapter.
- It merges `models.dev` metadata with Buddy config-defined models.

SDK overlap:

- `client.config.providers({ directory })`

Classification: `Direct` as a possible feature replacement, but not a current vendor-dependency reduction.

Why this is different from most items in this audit:

- This feature is already Buddy-owned. Replacing it with the SDK would be a product decision, not an "unvendor OpenCode internals" win.

### 2.4 Curriculum Features

Buddy's curriculum system is not just a plain HTTP endpoint. It is tied into the OpenCode runtime in multiple places.

#### 2.4.1 Curriculum sidebar CRUD

Current Buddy behavior:

- Web calls:
  - `loadCurriculum(directory)`
  - `saveCurriculum(directory, markdown)`
- Backend serves `GET/PUT /api/curriculum`.
- The actual curriculum document is stored in Buddy's database, with a file mirror for compatibility.

SDK overlap:

- No dedicated curriculum API exists in the OpenCode SDK.

Classification: `No` as an SDK feature. The storage itself is already Buddy-owned and can remain Buddy-owned without vendored OpenCode, but there is no SDK endpoint for it.

Important hidden dependency:

- `CurriculumService` scopes curriculum by OpenCode project identity, using internal `OpenCodeInstance.project.id`.
- This prevents non-git directories from colliding under the shared stock OpenCode `"global"` project ID.

Can that part move to the SDK?

- Yes, but only indirectly: you would need to fetch project info through the public project API and use the returned project ID, or define your own project-scope rule.
- That means the exact current implementation is not direct.

Classification of the scoping piece: `Partial`

#### 2.4.2 Curriculum-aware prompt injection

Current Buddy behavior:

- Before prompting the model, Buddy calls `CurriculumService.peek(directory)`.
- If a curriculum exists, Buddy condenses it and injects it into the `system` prompt.

SDK overlap:

- The SDK accepts a `system` string on `client.session.prompt(...)`.

Classification: `Partial`

What is replaceable:

- Passing a `system` string through the SDK.

What remains Buddy-owned:

- Reading curriculum.
- Condensing it.
- Deciding when to inject it.

#### 2.4.3 `curriculum-builder` runtime tools

Current Buddy behavior:

- Buddy defines and registers two runtime tools:
  - `curriculum_read`
  - `curriculum_update`
- These are injected per directory into the live OpenCode tool registry.
- They reuse vendored `WriteTool`, `EditTool`, and `FileTime`.

SDK overlap:

- The SDK can list tool IDs and tool schemas:
  - `client.tool.ids(...)`
  - `client.tool.list(...)`
- The SDK cannot define or register tools.

Classification: `No`

Important note:

- If you want to remove vendored tool internals, the likely upstream path is OpenCode's plugin/custom-tools system (`@opencode-ai/plugin`), not the SDK.

### 2.5 Teaching and Interactive Editor Features

This is the biggest non-SDK area in the codebase.

Buddy's teaching feature is a hybrid:

- The teaching workspace data model is Buddy-owned.
- The model behavior depends on Buddy-owned prompt shaping and tool injection.
- Live diagnostics depend on vendored OpenCode LSP internals.

#### 2.5.1 Teaching workspace CRUD

Current Buddy behavior:

- Web calls:
  - `ensureTeachingWorkspace(...)`
  - `loadTeachingWorkspace(...)`
  - `saveTeachingWorkspace(...)`
  - `checkpointTeachingWorkspace(...)`
  - `restoreTeachingWorkspace(...)`
  - `createTeachingWorkspaceFile(...)`
  - `activateTeachingWorkspaceFile(...)`
- Backend exposes Buddy-owned routes under `/api/teaching/...`.
- State is stored in Buddy-managed metadata files and workspace directories.
- Buddy enforces optimistic concurrency with `expectedRevision`.

SDK overlap:

- No teaching workspace API exists in the OpenCode SDK.

Classification: `No` as an SDK feature.

Important nuance:

- The teaching workspace persistence itself is already Buddy-owned. That code does not need to be vendored from OpenCode.
- What prevents full de-vendorization is not the CRUD layer itself; it is the surrounding runtime integrations below.

#### 2.5.2 Teaching LSP diagnostics

Current Buddy behavior:

- `TeachingService.readActiveDiagnostics(...)`:
  - warms the runtime by calling vendored `/agent`,
  - enters `OpenCodeInstance.provide(...)`,
  - checks `LSP.hasClients(filePath)`,
  - calls `LSP.touchFile(filePath, true)`,
  - reads `LSP.diagnostics()`,
  - normalizes diagnostics into Buddy's editor format.

SDK overlap:

- `client.lsp.status({ directory })` exists.

Classification: `No`

Why it is blocked:

- The SDK only tells you whether LSP is available at a coarse status level.
- It does not expose file-level diagnostics.
- It does not expose the "touch file" hook Buddy uses to refresh diagnostics.

This is a hard blocker for reproducing the current editor diagnostics UX using the SDK alone.

#### 2.5.3 Teaching-aware prompt injection

Current Buddy behavior:

- When the frontend starts an interactive lesson, it:
  - provisions the teaching workspace,
  - sends a follow-up chat prompt announcing that interactive tools are now available.
- On every subsequent prompt, the backend may inject:
  - session mode,
  - teaching workspace metadata,
  - checkpoint status,
  - tracked files,
  - teaching policy,
  - special handling for completion claims like "done" or "ready".

SDK overlap:

- The SDK accepts `system` on `client.session.prompt(...)`.

Classification: `Partial`

Same conclusion as curriculum injection:

- The SDK can carry the prompt.
- Buddy must still author the prompt.

#### 2.5.4 `code-teacher` runtime tools

Current Buddy behavior:

- Buddy defines and registers:
  - `teaching_start_lesson`
  - `teaching_checkpoint`
  - `teaching_add_file`
  - `teaching_set_lesson`
  - `teaching_restore_checkpoint`
- These tools are only registered for the selected directory.
- Their availability is further controlled by Buddy's config overlay and Buddy agent permissions.

SDK overlap:

- No tool definition/registration API exists.

Classification: `No`

Again, this is not an SDK migration path. It is a plugin/custom-tools migration path if you want to remove vendored internals.

### 2.6 Internal Runtime and Safety Features

These are not always obvious from the UI, but they are part of Buddy's current product behavior.

#### 2.6.1 In-process vendored OpenCode server

Current Buddy behavior:

- Buddy lazily loads the vendored OpenCode app once with `Server.App()`.
- It then calls `app.fetch(...)` directly for nearly all core OpenCode-backed routes.
- Startup is smoke-tested by making an internal `POST /session` call.

SDK overlap:

- `createOpencodeServer()` spawns an external `opencode` process.
- `createOpencodeClient()` talks to it over HTTP.

Classification: `No` as a drop-in replacement, `Direct` as a process-model replacement.

What changes if you move to the SDK:

- You lose the in-process `fetch(Request)` seam.
- You gain a public client/server boundary.
- You must either:
  - run a spawned `opencode` process from the Buddy backend, or
  - connect to an already-running upstream OpenCode server.

#### 2.6.2 Config hot-swap without touching the project root

Current Buddy behavior:

- Buddy computes a per-directory OpenCode overlay that:
  - denies teaching tools globally by default,
  - injects the `code-teacher` agent with the exact permissions Buddy expects.
- Buddy does not persist this through stock OpenCode config endpoints.
- Instead it patches vendored `Config.get()` and disposes the vendored instance.

SDK overlap:

- No public overlay primitive.

Classification: `No`

This is the cleanest example of a true internal-only dependency.

#### 2.6.3 Permission ruleset synthesis for Buddy agents

Current Buddy behavior:

- Buddy builds agent permissions with:
  - `PermissionNext.fromConfig(...)`
  - `PermissionNext.merge(...)`
  - `Truncate.GLOB`

SDK overlap:

- The SDK gives you transport-level permission APIs.
- It does not give you rule-compiler helpers.

Classification: `Partial`

What migration would look like:

- Stop depending on `PermissionNext` internals.
- Reimplement the merge/normalization logic in Buddy.
- Keep using SDK endpoints for permission list/reply.

### 2.7 Is Buddy's Current `/api` Surface a Drop-In OpenCode SDK Target?

Short answer: no.

What works if you set the SDK base URL to Buddy's `/api` root:

- The specific session methods Buddy currently exposes with stock-compatible paths:
  - `session.list`
  - `session.create`
  - `session.get`
  - `session.update`
  - `session.messages`
  - `session.prompt`
  - `session.abort`
- Permission list/reply
- Project config and global config paths
- Global dispose

What does not line up exactly:

- `client.global.health()` expects `/global/health`, but Buddy exposes `/api/health`
- `client.global.event()` expects `/global/event`, but Buddy exposes `/api/event`
- `client.app.agents()` expects `/agent`, but Buddy exposes Buddy's different `/api/config/agents`
- `client.project.*` methods model OpenCode's project catalog, while Buddy's `/api/project` is a notebook registry with different semantics
- `client.session.status()` expects `/session/status`, but Buddy does not expose `/api/session/status`
- Many stock OpenCode session methods are not exposed by Buddy's compatibility layer at all, including delete, children, todo, init, fork, share, diff, summarize, and others
- There is no OpenCode SDK equivalent for Buddy's `/api/curriculum`
- There is no OpenCode SDK equivalent for Buddy's `/api/teaching/*`

So:

- Buddy can use the OpenCode SDK internally against a real OpenCode server.
- The existing Buddy HTTP compatibility layer should not be treated as a full, path-for-path OpenCode SDK server without additional route alignment.

## 3. Features That Are Direct SDK Wins Right Now

If your goal is to reduce vendored OpenCode runtime usage without changing Buddy's product behavior, these are the safest immediate migrations.

### 3.1 Public OpenCode calls currently proxied through `fetchOpenCode(...)`

These can move behind an internal `OpencodeClient` service:

- Session list
- Session create
- Session get
- Session update
- Session message history
- Session prompt transport
- Session status
- Session abort
- Permission list
- Permission reply
- Global dispose
- Global health
- Global event subscription

Suggested SDK methods:

- `client.session.list(...)`
- `client.session.create(...)`
- `client.session.get(...)`
- `client.session.update(...)`
- `client.session.messages(...)`
- `client.session.prompt(...)`
- `client.session.status(...)`
- `client.session.abort(...)`
- `client.permission.list(...)`
- `client.permission.reply(...)`
- `client.global.dispose()`
- `client.global.health()`
- `client.global.event()`

### 3.2 Prompt transport, but not prompt authorship

Buddy can keep all of its current prompt-shaping logic and simply swap the final transport call from:

- "send a raw internal `fetch` to vendored `/session/:id/message`"

to:

- `client.session.prompt({ sessionID, directory, parts, system, agent, ... })`

This is the cleanest way to move the core chat path onto the SDK without losing Buddy's curriculum/teaching behavior.

### 3.3 Session abort preflight

Buddy's current "only abort if busy" UX can remain exactly the same with:

- `client.session.status({ directory })`
- then `client.session.abort({ sessionID, directory })`

No behavior loss.

## 4. Features That Need Buddy Glue Even If You Move to the SDK

These features can use the SDK underneath, but they are not pure SDK features.

### 4.1 Prompt shaping

Buddy should keep owning:

- curriculum condensation
- teaching context injection
- teaching policy injection
- empty-prompt validation
- content-to-parts normalization
- busy-error normalization

The SDK should only replace the final transport call.

### 4.2 Session scoping by directory/project

Buddy currently uses internal project identity to avoid leaking a session from one project view into another.

If you remove `OpenCodeInstance.project.id`, you still need a replacement policy:

- fetch project info via the public project API and compare IDs, or
- store Buddy-side directory ownership for sessions.

### 4.3 Notebook registry

Buddy's "remember this directory" feature is separate from OpenCode's own project catalog.

Even if you use SDK project calls, Buddy still needs to own:

- notebook persistence,
- add/remove behavior,
- any UX around recent notebooks.

### 4.4 Agent catalog

Buddy can keep showing:

- `build`
- `code-teacher`
- `plan`
- `general`
- `curriculum-builder`

But the catalog logic must stay Buddy-owned if you want the current semantics.

The SDK can tell you what stock OpenCode agents exist, but it will not generate Buddy's product-specific catalog.

## 5. Features the SDK Cannot Replace by Itself

These are the hard "still need something else" items.

### 5.1 Dynamic runtime tool registration

Blocked current features:

- `curriculum_read`
- `curriculum_update`
- `teaching_start_lesson`
- `teaching_checkpoint`
- `teaching_add_file`
- `teaching_set_lesson`
- `teaching_restore_checkpoint`

Why blocked:

- No SDK method defines or registers tools.
- The SDK only inspects tools, and only through experimental listing endpoints.

Likely upstream replacement:

- OpenCode custom tools / plugin system, not the SDK.

### 5.2 Live LSP diagnostics in the teaching editor

Blocked current features:

- file-level error overlays in the teaching editor
- attaching current LSP errors to tool outputs

Why blocked:

- No diagnostics API.
- No "touch file" API.
- Only coarse `lsp.status` is public.

### 5.3 In-memory config overlays and instance disposal

Blocked current features:

- default deny for teaching tools outside the `code-teacher` flow
- injected `code-teacher` agent config without persisting stock OpenCode config
- hot rebootstrap after Buddy config changes without writing OpenCode config files

Why blocked:

- No public overlay hook.
- No public "dispose just this runtime instance and rebuild with new in-memory config" hook.

### 5.4 Vendored migrations bundled into the desktop app

Blocked current feature:

- shipping OpenCode schema migrations with the Tauri sidecar resources

Why blocked:

- The SDK is client/server transport only.
- It does not ship the OpenCode database runtime or migrations.

## 6. Recommended Migration Order

If the goal is "use the official SDK everywhere it makes sense, without breaking Buddy-only product features," the most pragmatic order is:

1. Create a Buddy-owned OpenCode gateway module backed by `@opencode-ai/sdk/v2`.
   - Instantiate `createOpencodeClient(...)` once.
   - Optionally start upstream OpenCode with `createOpencodeServer(...)` if you want Buddy to keep managing the lifecycle.
   - Note: `createOpencodeServer()` requires an `opencode` executable on `PATH`; it is a child-process wrapper, not an embedded app.

2. Move all public OpenCode route proxy calls to the SDK.
   - Replace raw internal `fetch` calls for session, permission, and global APIs.
   - Keep Buddy's existing HTTP surface for the web app if you want zero frontend churn.

3. Keep Buddy-owned middleware and product layers unchanged.
   - Keep notebook registry.
   - Keep curriculum storage.
   - Keep teaching workspace storage.
   - Keep prompt shaping.
   - Keep directory safety checks.

4. Isolate the true non-SDK blockers behind explicit boundaries.
   - Tool injection
   - LSP diagnostics
   - config overlays
   - runtime instance disposal

5. Decide separately whether to migrate those blockers to upstream plugin/custom-tool mechanisms.
   - That is a second project.
   - It is not the same as "adopt the SDK."

## 7. Bottom Line

If you adopt the OpenCode SDK aggressively, you can stop vendoring the OpenCode runtime for the majority of Buddy's core chat transport:

- sessions
- prompts
- permissions
- abort
- event streaming
- global lifecycle calls

You cannot use the SDK alone to replace the parts of Buddy that currently make Buddy unique:

- curriculum runtime tools
- teaching runtime tools
- live teaching diagnostics
- Buddy's in-memory OpenCode config overlay model
- Buddy's exact agent permission synthesis

So the accurate architectural answer is:

- `@opencode-ai/sdk/v2` can replace most of Buddy's OpenCode API transport layer.
- It cannot replace Buddy's current non-public runtime integrations.
- To remove those remaining vendored dependencies, you will need either:
  - new Buddy-owned implementations, or
  - OpenCode's plugin/custom-tools extension system,
  but not the SDK by itself.
