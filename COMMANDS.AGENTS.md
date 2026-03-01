All commands run from repo root.

```bash
bun install
bun run dev
bun run dev:web
bun run typecheck
bun run build
bun run lint
bun run test:contracts   # backend+web compatibility contract suites
bun run check:vendor     # recommended full gate for vendored OpenCode updates
bun run vendor:check-upstream
bun run vendor:sync
bun run sdk:generate
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

## Tests (Bun)

Bun is the default test runner. Backend and web both include committed tests, including contract/parity suites retained as regression guards.

```bash
bun test                                         # all tests
bun test packages/buddy                          # package (pattern)
bun test packages/web
bun test --coverage
```
