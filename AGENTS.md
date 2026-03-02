# AGENTS.md

- Buddy is a Bun + TypeScript monorepo managed with Turborepo.
- Buddy is a single-OS-user, non-multi-tenant agent. It stores one active config/credential/session state per OS user home directory, and it does not provide built-in in-app accounts, profiles, or permissions for multiple human users.
- Buddy is a local-first system - when you run it normally, the primary agent loop usually runs in a local process on the host you launched. But it is not strictly a local-only system. It can expose server/client or remote-agent surfaces, and it may use the network for more than LLM calls, web search, MCP, and third-party APIs, including auth, remote config/admin policy, and remote subagent/client connections.

## Breaking Changes & Backward Compatibility

- buddy is only being used by one user, on one machine ie. the current one.
- so if `breaking changes` lead to better apis, better design or cut out a lot of work, DO IT.
- that also means `backward compatibility` is NOT needed for anyting.
- when this changes, the user will remove this section from your instruction.

## Packages:

- `packages/buddy`: backend (Bun + Hono + hono-openapi)
- `packages/web`: frontend (React + Vite + TanStack Router + TanStack Query)
- `packages/desktop`: Tauri desktop app (wraps `packages/web`)
- `packages/ui`: shared UI (shadcn/ui + Tailwind v4)
- `packages/sdk`: OpenAPI-generated client (hey-api/openapi-ts)
- `packages/opencode-adapter`: Buddy compatibility bridge over vendored OpenCode modules

## OpenCode Reference (required)

Build Buddy core by executing vendored OpenCode core, not by re-implementing it.

- OpenCode is the default reference for architecture and implementation.
- Core runtime authority is vendored code under `vendor/opencode/packages/*`.
- `packages/buddy/src` should stay a thin compatibility/product layer.

### Architecture Guardrail (current)

- Core loop/agent/session/tool/permission behavior should execute from vendored OpenCode modules.
- Buddy-owned behavior should remain in Buddy modules (curriculum, UX-specific route shaping, compatibility headers).
- Do not edit files under `vendor/opencode/packages/opencode/**` unless the change is an intentional vendored patch that will be tracked for the next subtree refresh.

## UI tasks

refer to: `packages/ui/AGENTS.md`; it has instructions on:

- how to create components
- how to style them

## Commands

- if confused about which commands to run refer COMMANDS.AGENTS.md

## Code Style

Follow existing code; avoid drive-by reformatting.

### TypeScript

- Strict TS enabled; keep types sound, no casting.
- No `any`; use `unknown` + narrowing (zod, type guards, `in` checks).
- `import type { ... }` for type-only imports.
- Infer types for locals; annotate exports/public APIs explicitly.

### Imports & Module Resolution

- ESM everywhere (`"type": "module"`); no `require`.
- Import order: external deps → workspace packages (`@buddy/*`) → relative.
- `packages/buddy` relative imports use `.js` extension (ESM emit).
- Path aliases:
  - `packages/ui`: `@/*` → `packages/ui/src/*`
  - `packages/web`: `@/*` → `packages/web/src/*` (also Vite rewrites UI-internal imports)
- Adding new `@/...` imports inside `packages/ui`: extend `packages/web/vite.config.ts` aliases or switch to relative paths.

### Formatting

- No repo-wide Prettier/ESLint/Biome; match each file's existing style.
- 2-space indentation; trailing commas on multiline objects/arrays/calls.
- Semicolons vary by package — do not normalize them.

### Naming & File Layout

- Components: PascalCase; hooks: `useX`; variables/functions: camelCase; constants: `UPPER_SNAKE_CASE`.
- TanStack Router: route files in `packages/web/src/routes/*`, each exporting `Route` via `createFileRoute`/`createRootRoute`.
- Hono: backend routes are modular in `packages/buddy/src/routes/*.ts` (auth, config, session, curriculum, teaching, etc.). Most `operationId` values are defined in `packages/buddy/src/openapi/compatibility-schemas.ts`. Format is `group[.subgroup].action` (for example `health.check`, `session.list`, `global.config.get`, `provider.oauth.authorize`).

## Working Style

- Name things by what they literally do. If a file or function name needs explanation, the name is wrong.
- Organize by feature ownership first. Keep prompts, agents, tools, and services with the feature that owns them unless there is a real runtime boundary.
- Use thin helpers only when they reduce cognitive load. If a helper only adds indirection, remove it.
- Keep side effects explicit. Prefer `register*` / `ensure*` entrypoints over hidden import-time behavior.
- Keep naming and exports easy to scan. Prefer clear `create*` / `register*` APIs and explicit bottom exports for helper modules.
- Use `git mv` for tracked moves so file history survives refactors.
- If a name needs explanation, change the name instead of adding more explanation.

### Error Handling

- Prefer early returns; keep happy-path left-aligned.
- Backend: validate with `validator(...)` + zod; return errors as `c.json({ error: "..." }, status)`. CORS is `origin: "*"` for dev — don't expand without reason.
- Frontend: check `res.ok` before parsing; throw from `queryFn`/`mutationFn` for React Query. Don't hardcode hosts; if adding `/api` prefix, align across `vite.config.ts` proxy, `sdk/scripts/generate.ts` `baseUrl`, and backend route mounting.

## Generated / Do Not Edit

- `packages/web/src/routeTree.gen.ts` — TanStack Router (gitignored)
- `packages/sdk/src/gen/` — SDK generated output (`sdk.gen.ts`, `types.gen.ts`, `client/`, `core/`); gitignored
- Build artifacts ignored: `dist/`, `.turbo/`, `*.tsbuildinfo`, `*.log`

## Links

Root has a `links/` folder of local symlinks.

### HackDiary

`links/HackDiary` symlinks the user's programming journal. Use it to infer user intentions and progression. "Diary" always means `HackDiary`.
