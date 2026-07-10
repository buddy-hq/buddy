# AGENTS.md
- Buddy is a Bun + TypeScript monorepo managed with Turborepo.
- It is published as an Electron app for both mac and windows.
- It is single-user and single-machine by design: one OS user, one home-directory state, one active config/credential/session set, with no built-in multi-user accounts, profiles, or permissions.
- Buddy is local-first: the main agent loop usually runs locally on the host that launched it. It is not strictly local-only, and may expose server/client or remote-agent surfaces or use the network beyond LLM calls, web search, MCP, and third-party APIs, including for auth, remote config/admin policy, and remote subagent/client connections.

## Task Completion Requirements
- Both of `bun lint`, &  `bun typecheck` must pass before considering tasks completed. no typecheck: md-only edits
- Run `bun typecheck` only from the repository root for completion verification. Do not run package typechecks in parallel with root typecheck or with each other; the root command already covers all Buddy packages and uses a repository-wide lock to reject overlapping runs.
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

## Vendor
- Core agent/runtime/server code lives under `vendor/opencode/packages/*`. Buddy integrates it via `packages/opencode-adapter`, not by reimplementing it.
- `packages/buddy/src` is a thin compatibility/product layer. Core behavior (loop, agent, session, tools, permissions) runs from vendored modules; Buddy-specific logic (curriculum, UX routes, compatibility headers) stays in Buddy-owned modules.
- Do not patch `vendor` directly. Edits to `vendor/opencode/packages/opencode/**` are only allowed as tracked vendored patches for the next subtree refresh.

## Target Platforms
- Desktop work should support both macOS and Windows. Unless explicitly scoped otherwise, desktop changes should be implemented for both platforms.
- The developer devlops on macOS arm64; and has a windows laptop available for testing with this codebase and agent set up.

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
- **Bench**: Bench is Buddy's first-class workspace for non-chat surfaces — artifacts, files, reading, markdown editing, whiteboards, and HTML widgets — that need more room than the transcript offers. It lives in theright workspace of a directory, beside the conversation pane, and has two layout modes: docked (chat in a side panel) and floating (chat overlays the bench). The active Bench target is URL-owned; visibility, drawer, and layout are owned by the directory-scoped workspace store and routed through a single DirectoryWorkspaceController. The agent presents targets via bench_present; users open them via the Explorer,Library, or file opens. Bench is predictable by design: one owner per concept, one outlet, deterministicopens.
- All three capabilities (tools, skills, subagents) are first-class opencode runtime capabilities.

## Misc Rules
- Buddy uses `@hey-api/openapi-ts` to generate a type-safe SDK from its Hono backend. Always use the typed SDK (`BuddyClient`) for API interactions. Never use manual fetch or fetch helpers like `requestJson`.
- NEVER use magic strings and magic numbers.
- ALWAYS use types; NEVER interfaces.
- Run only tests for the packages you change. Never run vendor tests or the full suite.
- Use `git mv` for tracked moves.
- TypeScript
  - Strict and sound: no casts, no `any`. Prefer `unknown` plus narrowing (zod, type guards, `in`).
  - Use `import type { ... }` for type-only imports.
  - Infer local types; annotate exports and public APIs.
- Skip tests for behavior that is fully guaranteed by TypeScript inference alone. Only write tests when there is observable runtime behavior, explicit API contract behavior, or a type-level edge case not naturally covered by normal compilation.
- The developer will mostly talk to you via audio transcripts, account for transcrtiption errors.


## Current Focus: Launch, Launch, Launch.
<about>
- this section informs the agents about current WIP so they can be
    - more aware of user's current focus lanes
    - can work in independent lanes
    - don't trample on each other's work.
- one agent will own one lane and will not interfere with the other agent's lane.
</about>

- We are operating with a singular focus right now, launch buddy, and get everything ready for it.
- context in: /Users/prashantbhudwal/Code/buddy/docs/launch/critical-path.md

HARD CONSTRAINT: Don't let the developer drift into fixing things that don't fulfill this the objective of launching buddy on the 15th of July.

REMEMBER: remember 15th should not define the quality of solutions, only what we should tackle - if we are doing it we will do it well; or not do it at all. 