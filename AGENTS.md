# AGENTS.md
- Buddy is a Bun + TypeScript monorepo managed with Turborepo.
- It is single-user and single-machine by design: one OS user, one home-directory state, one active config/credential/session set, with no built-in multi-user accounts, profiles, or permissions.
- Buddy is local-first: the main agent loop usually runs locally on the host that launched it. It is not strictly local-only, and may expose server/client or remote-agent surfaces or use the network beyond LLM calls, web search, MCP, and third-party APIs, including for auth, remote config/admin policy, and remote subagent/client connections.
## Task Completion Requirements
- All of `bun fmt`, `bun lint`, and `bun typecheck` must pass before considering tasks completed.
## Breaking Changes & Backward Compatibility
- Buddy currently serves one user on one machine: the current one.    
- Prefer better APIs, cleaner design, and reduced complexity over preserving old behavior.
- Backward compatibility is not required.
- When that assumption changes, this section will be removed.
## Core Priorities
1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).
If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability
Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Packages:
- `packages/buddy`: backend (Bun + Hono + hono-openapi)
- `packages/web`: frontend (React + Vite + TanStack Router + TanStack Query)
- `packages/desktop`: Tauri desktop app wrapping `packages/web`    
- `packages/ui`: shared UI system built on shadcn primitives + Tailwind v4
- `packages/sdk`: OpenAPI-generated client via hey-api/openapi-ts
- `packages/opencode-adapter`: Buddy compatibility bridge over vendored OpenCode modules
- `packages/storybook`: storybook setup
## Tests
- Never run the full test suite.
- Run only tests for the packages you are changing.
- Never run vendor tests directly.
## Vendor
- Core agent/runtime/server code is vendored from `vendor/opencode`.
- Compatibility with that vendor code is handled through `packages/opencode-adapter`.
- Do not patch `vendor` directly.

### OpenCode Reference
Build Buddy core by executing vendored OpenCode core, not by re-implementing it.
- OpenCode is the default architectural and implementation reference.    
- Runtime authority lives under `vendor/opencode/packages/*`.
- `packages/buddy/src` should remain a thin compatibility and product layer.

#### Architecture Guardrail
- Core loop, agent, session, tool, and permission behavior should run from vendored OpenCode modules.
- Buddy-specific behavior should stay in Buddy-owned modules, such as curriculum, UX-specific route shaping, and compatibility headers.
- Do not edit `vendor/opencode/packages/opencode/**` unless it is an intentional vendored patch tracked for the next subtree refresh.

### Target Platforms
- Desktop work should support both macOS and Windows.
- The current developer tests on macOS arm64, but many users will be on Windows.
- Unless explicitly scoped otherwise, desktop changes should be implemented for both platforms.

### UI Tasks
- For UI work, follow `packages/ui/AGENTS.md`.
- It defines component creation, styling, and how shadcn should be treated as a foundation rather than a finished theme.

### Scripts and Commands
- If command behavior is unclear, refer to `COMMANDS.AGENTS.md`.
### TypeScript
- Use strict TypeScript and keep types sound.
- Do not use casts.
- Do not use `any`; prefer `unknown` plus narrowing with zod, type guards, or `in` checks.
- Use `import type { ... }` for type-only imports.
- Infer local types where appropriate, and annotate exports and public APIs explicitly.

## Working Style

- Name things by what they literally do. If a file or function name needs explanation, the name is wrong.
- Organize by feature ownership first. Keep prompts, agents, tools, and services with the feature that owns them unless there is a real runtime boundary.
- Use thin helpers only when they reduce cognitive load. If a helper only adds indirection, remove it.
- Keep side effects explicit. Prefer `register*` / `ensure*` entrypoints over hidden import-time behavior.
- Keep naming and exports easy to scan. Prefer clear `create*` / `register*` APIs and explicit bottom exports for helper modules.
- Use `git mv` for tracked moves so file history survives refactors
- If a name needs explanation, change the name instead of adding more explanation.
## Generated / Do Not Edit
- `packages/web/src/routeTree.gen.ts`: TanStack Router output (gitignored)
- `packages/sdk/src/gen/`: generated SDK output including `sdk.gen.ts`, `types.gen.ts`, `client/`, and `core/` (gitignored)
- Ignored build artifacts: `dist/`, `.turbo/`, `*.tsbuildinfo`, `*.log`

## Buddy Architectural Concepts
- Core vocabulary lives in `buddy/packages/buddy/src/learning/shared/teaching-vocabulary.ts`.
- **Persona**: the core Buddy agent.
- **Intent**: selects a persona’s capabilities for a single turn (for teaching, e.g. `learn`, `assess`, `practice`, `auto`).
- Capabilities come in three forms:
    - **Tools**: runtime tools gated by intent.
    - **Skills**: a reusable, versioned bundle of files that gives an agent a specific capability or workflow.
    - **Subagents**: specialized internal agents a persona can delegate to.
- All three capabilities are first-class opencode runtime capabilities.
- Capabilities may also be constrained by context:
    - **Surface**: tools are available only on enabled surfaces such as chat, curriculum, editor, figure, or quiz.
    - **Workspace state**: some teaching tools require an interactive session.