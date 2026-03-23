# AGENTS.md

- Buddy is a Bun + TypeScript monorepo managed with Turborepo.
- Buddy is a single-OS-user, non-multi-tenant agent. It stores one active config/credential/session state per OS user home directory, and it does not provide built-in in-app accounts, profiles, or permissions for multiple human users.
- Buddy is a local-first system - when you run it normally, the primary agent loop usually runs in a local process on the host you launched. But it is not strictly a local-only system. It can expose server/client or remote-agent surfaces, and it may use the network for more than LLM calls, web search, MCP, and third-party APIs, including auth, remote config/admin policy, and remote subagent/client connections.

## Task Completion Requirements

- All of `bun fmt`, `bun lint`, and `bun typecheck` must pass before considering tasks completed.

## Breaking Changes & Backward Compatibility

- buddy is only being used by one user, on one machine ie. the current one.
- so if `breaking changes` lead to better apis, better design or cut out a lot of work, DO IT.
- that also means `backward compatibility` is NOT needed for anyting.
- when this changes, the user will remove this section from your instruction.

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
- `packages/desktop`: Tauri desktop app (wraps `packages/web`)
- `packages/ui`: shared UI (Buddy-owned design system built on shadcn primitives + Tailwind v4)
- `packages/sdk`: OpenAPI-generated client (hey-api/openapi-ts)
- `packages/opencode-adapter`: Buddy compatibility bridge over vendored OpenCode modules

## Tests

- NEVER run the full test suite, explitly run tests for packages you're working on.
- NEVER run the vendor tests directly.

## Vendor

- we vendor the core agent/runtime/server from `vendor/opencode`
- we use an adapter to make the vendor compatible with `package/opencode-adapter`
- we NEVER patch the `vendor` directly.

## OpenCode Reference (required)

Build Buddy core by executing vendored OpenCode core, not by re-implementing it.

- OpenCode is the default reference for architecture and implementation.
- Core runtime authority is vendored code under `vendor/opencode/packages/*`.
- `packages/buddy/src` should stay a thin compatibility/product layer.

### Architecture Guardrail (current)

- Core loop/agent/session/tool/permission behavior should execute from vendored OpenCode modules.
- Buddy-owned behavior should remain in Buddy modules (curriculum, UX-specific route shaping, compatibility headers).
- Do not edit files under `vendor/opencode/packages/opencode/**` unless the change is an intentional vendored patch that will be tracked for the next subtree refresh.

## Target Platforms: macos and windows

- the developer is testing this app on mac(arm64) but a good portion of the users of this app will be windows users: so when a developer asks you to implement something for the desktop - assume they mean for both platforms. they might not explicitly say or test it for now, but it's the agent's job to do it.

## UI tasks

refer to: `packages/ui/AGENTS.md`; it has instructions on:

- how to create components
- how to style them
- how to treat shadcn as a foundation, not an out-of-the-box theme/style contract

## Scripts/Commands

- if confused about how scripts or commands work for this project refer COMMANDS.AGENTS.md

### TypeScript

- Strict TS enabled; keep types sound, no casting.
- No `any`; use `unknown` + narrowing (zod, type guards, `in` checks).
- `import type { ... }` for type-only imports.
- Infer types for locals; annotate exports/public APIs explicitly.

## Working Style

- Name things by what they literally do. If a file or function name needs explanation, the name is wrong.
- Organize by feature ownership first. Keep prompts, agents, tools, and services with the feature that owns them unless there is a real runtime boundary.
- Use thin helpers only when they reduce cognitive load. If a helper only adds indirection, remove it.
- Keep side effects explicit. Prefer `register*` / `ensure*` entrypoints over hidden import-time behavior.
- Keep naming and exports easy to scan. Prefer clear `create*` / `register*` APIs and explicit bottom exports for helper modules.
- Use `git mv` for tracked moves so file history survives refactors.
- If a name needs explanation, change the name instead of adding more explanation.

## Generated / Do Not Edit

- `packages/web/src/routeTree.gen.ts` — TanStack Router (gitignored)
- `packages/sdk/src/gen/` — SDK generated output (`sdk.gen.ts`, `types.gen.ts`, `client/`, `core/`); gitignored
- Build artifacts ignored: `dist/`, `.turbo/`, `*.tsbuildinfo`, `*.log`

## Links

Root has a `links/` folder of local symlinks.

### HackDiary

`links/HackDiary` symlinks the user's programming journal. Use it to infer user intent ions and progression. "Diary" always means `HackDiary`.
