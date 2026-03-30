All commands run from repo root.

## Canonical Commands

```bash
bun install
bun run dev
bun run dev:web
bun run typecheck
bun run build
bun run lint
bun run fmt
bun run test:contracts   # backend+web compatibility contract suites
bun run check:vendor     # recommended full gate for vendored OpenCode updates
bun run vendor:sync
bun run hooks:install    # install tracked git hooks from .githooks/
bun run sdk:generate
```

## Scoped Build/Typecheck (Turbo)

Use Turbo directly for package scoping. Do not rely on `bun run build -- --filter=...` or
`bun run typecheck -- --filter=...` because those root scripts already include filters.

```bash
bunx turbo run build --filter=@buddy/web --only
bunx turbo run build --filter=@buddy/backend --only
bunx turbo run typecheck --filter=@buddy/ui --only
```

## Lint Notes

- Lint is defined at repo root (`bun run lint`); most packages do not define their own `lint` script.
- To lint only specific files, pass paths through to oxlint:

```bash
bun run lint -- packages/web/src/components/chat/chat-transcript.tsx
```

## Direct Per-Package Commands

```bash
bun run --cwd packages/buddy dev
bun run --cwd packages/web dev
bun run --cwd packages/sdk generate
```

## Tests (Bun)

Bun is the test runner. Prefer package-scoped tests and contract suites; avoid running the full suite by default.

```bash
bun run test:contracts
bun test packages/buddy
bun test packages/web
```
