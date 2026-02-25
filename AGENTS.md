# AGENTS.md

Bun + TypeScript monorepo managed with Turborepo.

**Packages:**

- `packages/buddy`: backend (Bun + Hono + hono-openapi)
- `packages/web`: frontend (React + Vite + TanStack Router + TanStack Query)
- `packages/ui`: shared UI (shadcn/ui + Tailwind v4)
- `packages/sdk`: OpenAPI-generated client (hey-api/openapi-ts)

## OpenCode Reference (required)

Build Buddy core by executing vendored OpenCode core, not by re-implementing it.

- OpenCode is the default reference for architecture and implementation.
- Core runtime authority is vendored code under `vendor/opencode/packages/*`.
- `packages/buddy/src` should stay a thin compatibility/product layer.
- Before implementing any core agent/runtime feature, find the OpenCode equivalent first and route through adapter seams.
- OpenCode location: `~/code/opencode` (fallback: `~/Code/opencode`).

### Architecture Guardrail (current)

- Core loop/agent/session/tool/permission behavior should execute from vendored OpenCode modules.
- Buddy-owned behavior should remain in Buddy modules (curriculum, UX-specific route shaping, compatibility headers).
- Do not edit files under `vendor/opencode/packages/opencode/**` unless the change is an intentional vendored patch that will be tracked for the next subtree refresh.

## Commands

All commands run from repo root.

```bash
bun install
bun run dev        # backend → http://localhost:3000 (PORT=... to override)
bun run dev:web    # web    → http://localhost:1420
bun run typecheck
bun run build
bun run lint       # wired to turbo; no workspace defines lint yet
bun run test:contracts   # backend+web compatibility contract suites
bun run check:vendor     # recommended full gate for vendored-core updates
bun run sdk:generate                            # requires backend running
API_URL="http://localhost:3000/doc" bun run sdk:generate
```

**Turbo filter:**

```bash
bun run build -- --filter=@buddy/backend
bun run build -- --filter=@buddy/web
bun run typecheck -- --filter=@buddy/ui
```

**Direct (per-package):**

```bash
bun run --cwd packages/buddy dev
bun run --cwd packages/web dev
bun run --cwd packages/sdk generate
```

## Ports & Endpoints

- Backend: `http://localhost:3000` (OpenAPI docs at `/doc`)
  - Primary compatibility routes are under `/api/*`:
  - `GET /api/health`, `GET /api/event`
  - `GET|PATCH /api/config`, `GET /api/config/providers`, `GET /api/config/agents`
  - `GET|POST /api/session`, `GET|PATCH /api/session/:sessionID`
  - `GET|POST /api/session/:sessionID/message`, `POST /api/session/:sessionID/abort`
  - `GET /api/permission`, `POST /api/permission/:requestID/reply`
  - `GET|PUT /api/curriculum`
- Web: `http://localhost:1420` (routes under `packages/web/src/routes/*`)

## Tests (Bun)

Bun is the default test runner. Backend and web both include committed tests, including contract/parity suites retained as regression guards.

```bash
bun test                                         # all tests
bun test packages/buddy                          # package (pattern)
bun test packages/web
bun test packages/buddy/src/routes/items.test.ts # single file
bun test -t "items\.create"                      # single test (regex)
bun test --coverage
```

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
- Hono: route modules in `packages/buddy/src/routes/*`, composed in `packages/buddy/src/index.ts`. `operationId` format: `group.action` (e.g. `health.check`, `items.list`).

### Error Handling

- Prefer early returns; keep happy-path left-aligned.
- Backend: validate with `validator(...)` + zod; return errors as `c.json({ error: "..." }, status)`; include those statuses in `describeRoute.responses`. CORS is `origin: "*"` for dev — don't expand without reason.
- Frontend: check `res.ok` before parsing; throw from `queryFn`/`mutationFn` for React Query. Don't hardcode hosts; if adding `/api` prefix, align across `vite.config.ts` proxy, `sdk/scripts/generate.ts` `baseUrl`, and backend route mounting.

### UI Conventions

- Shared components: `packages/ui/src/components/ui`; export from `packages/ui/src/index.ts`, consume via `@buddy/ui`.
- Tailwind v4 scanning enabled via `@source "./**/*.{ts,tsx}";` in `packages/ui/src/index.css` — do not remove.

## Generated / Do Not Edit

- `packages/web/src/routeTree.gen.ts` — TanStack Router (gitignored)
- `packages/sdk/src/client.gen.ts`, `packages/sdk/src/types.gen.ts` — SDK (gitignored)
- Build artifacts ignored: `dist/`, `.turbo/`, `*.tsbuildinfo`, `*.log`

## Session Learnings

- Root `.env` loading is tied to root `dev` script (`bun --env-file=.env run --cwd packages/buddy dev`); running backend directly from `packages/buddy` can miss `KIMI_API_KEY` unless env file is passed explicitly.
- `/api` pathing is a multi-package coupling: backend prefix, SDK generation, SDK client `baseUrl`, and web proxy must stay aligned or chat endpoints fail with misleading 404s.
- Multi-tenant chat couples: web directory route/state, SDK directory header, backend middleware, and instance-scoped stores — misalignment makes sends appear "stuck" while backend finishes normally.

## Links

Root has a `links/` folder of local symlinks.

### HackDiary

`links/HackDiary` symlinks the user's programming journal. Use it to infer user intentions and progression. "Diary" always means `HackDiary`.
