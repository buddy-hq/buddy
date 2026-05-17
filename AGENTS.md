# AGENTS.md
- Buddy is a Bun + TypeScript monorepo managed with Turborepo.
- It is published as an Electron app for both mac and windows.
- It is single-user and single-machine by design: one OS user, one home-directory state, one active config/credential/session set, with no built-in multi-user accounts, profiles, or permissions.
- Buddy is local-first: the main agent loop usually runs locally on the host that launched it. It is not strictly local-only, and may expose server/client or remote-agent surfaces or use the network beyond LLM calls, web search, MCP, and third-party APIs, including for auth, remote config/admin policy, and remote subagent/client connections.

## Task Completion Requirements
- Both of `bun lint`, &  `bun typecheck` must pass before considering tasks completed. no typecheck: md-only edits
- Run `bun fmt` only when the task is complete and user is satisfied.

## Breaking Changes ALLOWED & Backward Compatibility NOT REQUIRED
- Buddy is single-user, single-machine. Backward compatibility is not required.This section will be removed when that assumption changes.
- Until then, Prefer better APIs and reduced complexity over preserving old behavior.

## Core Priorities
Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).
4. If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Packages:
- `packages/buddy`: backend (Bun + Hono + hono-openapi)
- `packages/web`: frontend (React + Vite + TanStack Router + TanStack Query)
- `packages/desktop-electron`: Electron desktop app wrapping `packages/web`
- `packages/ui`: shared UI system built on shadcn primitives + Tailwind v4
  - For UI work, follow `packages/ui/AGENTS.md`.
  - It defines component creation, styling, and how shadcn should be treated as a foundation rather than a finished theme.
- `packages/sdk`: OpenAPI-generated client via hey-api/openapi-ts
- `packages/opencode-adapter`: Buddy compatibility bridge over vendored OpenCode modules
- `packages/storybook`: storybook setup

## Vendor
- Core agent/runtime/server code lives under `vendor/opencode/packages/*`. Buddy integrates it via `packages/opencode-adapter`, not by reimplementing it.
- `packages/buddy/src` is a thin compatibility/product layer. Core behavior (loop, agent, session, tools, permissions) runs from vendored modules; Buddy-specific logic (curriculum, UX routes, compatibility headers) stays in Buddy-owned modules.
- Do not patch `vendor` directly. Edits to `vendor/opencode/packages/opencode/**` are only allowed as tracked vendored patches for the next subtree refresh.

## Target Platforms
- Desktop work should support both macOS and Windows. Unless explicitly scoped otherwise, desktop changes should be implemented for both platforms.
- The developer tests on macOS arm64, but many users will be on Windows.

## Generated / Do Not Edit
- `packages/web/src/routeTree.gen.ts` (TanStack Router)
- `packages/sdk/src/gen/` (OpenAPI SDK: `sdk.gen.ts`, `types.gen.ts`, `client/`, `core/`)
- Build artifacts: `dist/`, `.turbo/`, `*.tsbuildinfo`, `*.log`

## Buddy Architectural Concepts
- Core vocabulary lives in `packages/buddy/src/learning/shared/teaching-vocabulary.ts`.
- **Persona**: the core Buddy agent. Personas enable **features**
- **Feature**: the only authoring and access grouping unit. A feature owns:
    - **Tools**: runtime tools gated by constraints (e.g., teaching workspace active, runtime readiness). 
      - Some tools are dynamic — discoverable via features but requiring an on-demand load flow.
    - **Skills**: a reusable, versioned bundle of files that gives an agent a specific capability or workflow. 
    - **Subagents**: specialized internal agents a persona can delegate to. Subagents carry their own tools, skills, and subagents as object references.
    - **Surfaces**: UI surfaces unlocked by the feature (curriculum, figure, flashcard, editor, question-set).
- All three capabilities (tools, skills, subagents) are first-class opencode runtime capabilities.

## Misc Rules
- Buddy uses `@hey-api/openapi-ts` to generate a type-safe SDK from its Hono backend. Always use the typed SDK (`BuddyClient`) for API interactions. Never use manual fetch or fetch helpers like `requestJson`.
- NEVER use magic strings and magic numbers.
- ALWAYS use types; NEVER interfaces.
- Don't use subagents to delegate any work, unless the user explicitly asks for subagent invocation.
- Run only tests for the packages you change. Never run vendor tests or the full suite.
- Use `git mv` for tracked moves.
- TypeScript
  - Strict and sound: no casts, no `any`. Prefer `unknown` plus narrowing (zod, type guards, `in`).
  - Use `import type { ... }` for type-only imports.
  - Infer local types; annotate exports and public APIs.
