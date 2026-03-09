# OpenCode Coupling Guardrails

Date: 2026-02-28

Related docs:

- `docs/opencode-sdk-replacement-audit.md`
- `docs/opencode-sdk-hybrid-plan.md`

## Purpose

This document is for future agents working in this repo.

Its job is simple:

- do not increase Buddy's coupling to vendored OpenCode internals,
- prefer the OpenCode SDK boundary when the feature maps to a public OpenCode API,
- keep vendored OpenCode usage isolated to the places where the SDK does not cover the required behavior.

This is a guardrail document, not a migration mandate. Feature work can continue without doing the full migration immediately.

## Current Repo Facts

These are true in the current codebase and should be treated as the baseline.

### Fact 1: Buddy currently uses an embedded vendored OpenCode runtime

Backed by:

- `packages/buddy/src/opencode/runtime.ts`

That file calls `Server.App()` and caches the embedded app instance.

### Fact 2: Buddy currently proxies many public OpenCode API calls through route-level helpers

Backed by:

- `packages/buddy/src/index.ts`

That file contains:

- `fetchOpenCode(...)`
- `proxyToOpenCode(...)`

Those helpers currently forward requests into the embedded vendored runtime.

### Fact 3: The repo already vendors the OpenCode SDK package

Backed by:

- root `package.json` includes `vendor/opencode/packages/sdk/js` in the workspace list
- `vendor/opencode/packages/sdk/js/package.json` declares `"name": "@opencode-ai/sdk"`

This means the SDK source already exists in the monorepo.

### Fact 4: `packages/buddy` does not currently declare `@opencode-ai/sdk`

Backed by:

- `packages/buddy/package.json`

If a future agent wants to import `@opencode-ai/sdk` inside `packages/buddy`, add a direct dependency entry first.

### Fact 5: The SDK client can be used without starting a second OpenCode server

Backed by:

- `vendor/opencode/packages/sdk/js/src/client.ts`

The SDK client accepts a custom `fetch`.

### Fact 6: `createOpencodeServer()` starts a separate `opencode` process

Backed by:

- `vendor/opencode/packages/sdk/js/src/server.ts`

That file calls `spawn("opencode", ...)`.

So:

- calling `createOpencodeServer()` while Buddy still uses the embedded runtime would create a second runtime,
- this should not be the default path for normal feature work.

### Fact 7: Vendored OpenCode already uses the SDK client over `Server.App().fetch(...)`

Backed by:

- `vendor/opencode/packages/opencode/src/plugin/index.ts`
- `vendor/opencode/packages/opencode/src/cli/cmd/run.ts`
- `vendor/opencode/packages/opencode/src/cli/cmd/tui/worker.ts`

This means a single-runtime, SDK-client-over-embedded-runtime pattern is already proven in code.

## Core Rule Set

Future agents should follow these rules.

### Rule 1: Do not add new route-level coupling to vendored transport helpers

Avoid introducing new uses of:

- `fetchOpenCode(...)`
- `proxyToOpenCode(...)`

inside new route logic when the feature maps to a public OpenCode API.

If a route needs a public OpenCode capability:

- prefer an SDK-backed wrapper/module,
- or, if that wrapper does not exist yet, create one in `packages/buddy/src/opencode/` instead of adding another direct proxy call inside `packages/buddy/src/index.ts`.

### Rule 2: Prefer the SDK boundary for public OpenCode API features

When a feature maps to a public OpenCode API, prefer the SDK boundary.

This applies to features such as:

- session list
- session create
- session get
- session update
- session messages
- session prompt transport
- session status
- session abort
- permission list
- permission reply
- global health
- global dispose
- global event subscription

For these features:

- do not add new `@buddy/opencode-adapter/*` usage,
- do not add new direct vendored runtime calls from route handlers,
- prefer an SDK-facing module boundary even if the SDK is temporarily backed by a custom `fetch` into `Server.App().fetch(...)`.

### Rule 3: Do not spread `@buddy/opencode-adapter/*` imports

Treat `@buddy/opencode-adapter/*` as an escape hatch, not a default integration path.

Do not add new adapter imports outside areas that are already vendored-only or clearly require internal runtime access.

Current vendored-only areas include:

- `packages/buddy/src/opencode/`
- `packages/buddy/src/teaching/`
- `packages/buddy/src/curriculum/` for project identity lookup

If a future change needs an adapter import, document why the SDK cannot cover it.

### Rule 4: Keep vendored-only behavior isolated

The following behaviors are currently internal-only and should stay isolated:

- dynamic tool registration
- config overlays / runtime rebinding
- `Instance`-scoped runtime access
- LSP diagnostics internals

This means:

- extend existing modules for those concerns,
- do not copy that logic into unrelated route handlers or product modules.

### Rule 5: Do not introduce a second OpenCode runtime by default

Do not call `createOpencodeServer()` as part of ordinary feature work while Buddy still uses the embedded runtime.

If a future change intentionally moves Buddy to a child-process OpenCode runtime, that is a separate architecture decision and should be treated as explicit migration work.

### Rule 6: Keep feature work moving; do not force migration work into unrelated changes

If you are building a product feature and the full SDK migration is not required to ship it:

- do not stop to rewrite the architecture,
- do not expand coupling while implementing the feature,
- leave the code in a migration-friendly shape.

This means:

- add narrow wrappers instead of new direct couplings,
- keep new OpenCode-facing behavior behind a small module boundary,
- avoid spreading vendored runtime access.

## Decision Guide

Use this checklist when touching OpenCode-facing code.

### Case A: The feature maps to a public OpenCode API

Examples:

- listing sessions
- sending a prompt
- replying to permissions
- loading message history

Do this:

- prefer an SDK-backed boundary,
- if no SDK wrapper exists yet, add one under `packages/buddy/src/opencode/`,
- keep route handlers thin.

Do not do this:

- add a new route-level `fetchOpenCode(...)` call,
- add a new `@buddy/opencode-adapter/*` import just for convenience.

### Case B: The feature needs an internal-only runtime capability

Examples:

- registering Buddy runtime tools
- touching LSP files and reading diagnostics
- applying config overlays without persisting OpenCode config

Do this:

- use the existing vendored/internal modules,
- keep the change local to the relevant vendored extension area,
- add a short comment explaining why the SDK is insufficient if the reason is not already obvious.

### Case C: The feature is Buddy-only and does not need OpenCode APIs directly

Examples:

- UI shaping
- curriculum storage
- Buddy-specific HTTP routes
- teaching workspace persistence

Do this:

- keep it in Buddy-owned modules,
- do not move it into vendored OpenCode code,
- do not create unnecessary OpenCode coupling.

## Recommended Working Pattern

For future agents, the safest default pattern is:

1. Keep the frontend talking to Buddy's `/api` routes unless there is an explicit transport change.
2. Keep Buddy product logic in Buddy modules.
3. If the backend needs a public OpenCode API call, route it through an SDK-oriented module boundary.
4. If the backend needs a vendored-only capability, keep that code in the existing vendored extension layer.

This keeps the codebase shippable now and easier to migrate later.

## Anti-Patterns

Avoid these unless the change is explicitly architecture work.

### Anti-Pattern 1: Expanding `fetchOpenCode(...)` usage

Do not add more direct route logic that depends on:

- internal request rewriting,
- raw vendored route forwarding,
- route-level manual proxy behavior,

when the SDK already models the same API.

### Anti-Pattern 2: Importing vendored runtime helpers into unrelated modules

Do not pull:

- `Instance`
- `ToolRegistry`
- `Tool`
- `LSP`
- config overlay helpers

into unrelated app code just because it is nearby or convenient.

### Anti-Pattern 3: Using `createOpencodeServer()` casually

Do not start a child-process OpenCode runtime just to use the SDK.

The SDK client can be used without that, and the repo already contains code demonstrating that pattern.

### Anti-Pattern 4: Editing vendored OpenCode for Buddy feature work

Do not put Buddy feature changes under:

- `vendor/opencode/packages/opencode/**`

unless the change is an intentional vendored patch.

Buddy feature work should stay in Buddy-owned code.

## Minimal Standard for New OpenCode-Facing Changes

If a future agent touches OpenCode-facing backend behavior, the minimum acceptable standard is:

- no new direct coupling to route-level vendored proxy helpers for SDK-covered APIs,
- no new adapter imports unless the feature is truly SDK-blocked,
- a small module boundary is introduced if none exists yet,
- the change does not introduce a second OpenCode runtime by accident.

## Short Version

Future agents should:

- keep building features,
- not force the full migration early,
- stop increasing coupling,
- use an SDK boundary when the feature maps to a public OpenCode API,
- use vendored internals only for the known SDK gaps,
- avoid spawning a second OpenCode runtime unless that migration is intentional.

