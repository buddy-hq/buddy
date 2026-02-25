# Migration: Copy-Based → Vendored OpenCode Architecture

## Overview

Buddy migrated from **copying** OpenCode source files into its own package to **vendoring** the OpenCode monorepo mirror at `vendor/opencode/` (runtime under `vendor/opencode/packages/opencode/`). Buddy is now a thin product layer that wraps the vendored runtime via an HTTP proxy and adapter modules.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Web Frontend                       │
│          (React + TanStack, @buddy/sdk)               │
└──────────────┬───────────────────────────────────────┘
               │ HTTP /api/*
┌──────────────▼───────────────────────────────────────┐
│               Buddy Backend (index.ts)                │
│                                                       │
│  ┌─────────────────┐  ┌──────────────────────────┐   │
│  │ Buddy-owned      │  │ Proxy to OpenCode         │  │
│  │ • Curriculum CRUD│  │ • Sessions & messages     │  │
│  │ • Config read    │  │ • Permissions             │  │
│  │ • System prompt  │  │ • SSE events              │  │
│  │ • Directory auth │  │ • Agent list              │  │
│  │ • Provider list  │  │ • Health + abort          │  │
│  └────────┬────────┘  └────────────┬─────────────┘   │
│           │                        │                  │
│  ┌────────▼────────┐  ┌───────────▼──────────────┐   │
│  │ buddy.db         │  │ @buddy/opencode-adapter   │  │
│  │ (curriculum,     │  │ (server, instance, agent, │  │
│  │  project)        │  │  tool, registry, etc.)    │  │
│  └─────────────────┘  └───────────┬──────────────┘   │
│                                   │                   │
│                       ┌───────────▼──────────────┐   │
│                       │ vendor/opencode/          │   │
│                       │ (full runtime,            │   │
│                       │  opencode.db)             │   │
│                       └──────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

## What Buddy Owns vs. What OpenCode Owns

| Domain                     | Owner                     | Where                                        |
| -------------------------- | ------------------------- | -------------------------------------------- |
| Sessions, messages, parts  | OpenCode                  | `opencode.db` via vendor runtime             |
| Permissions                | OpenCode                  | `opencode.db`, served via proxy              |
| Projects, git resolution   | Both (legacy duplication) | `buddy.db` + `opencode.db`                   |
| Curriculum                 | Buddy                     | `buddy.db`                                   |
| System prompt (behavioral) | Buddy                     | `session/system-prompt.ts`                   |
| Config (buddy.json)        | Buddy                     | `config/config.ts`                           |
| Provider/model list        | Buddy                     | `provider/provider.ts`                       |
| Tools (LLM-facing)         | OpenCode                  | vendor runtime, curriculum tools via adapter |
| Event bus / SSE            | OpenCode                  | vendor runtime, proxied at `/api/event`      |

## Databases

Two separate SQLite databases with distinct domains (see `packages/buddy/SCHEMA.md`):

- **`opencode.db`** at `.buddy-runtime/xdg/data/opencode/` — managed by vendored OpenCode. Contains session, message, part, todo, permission, project, session_share, control_account tables.
- **`buddy.db`** at `~/.local/share/buddy/` — managed by Buddy. Contains project (legacy) and curriculum tables.

**Golden rule**: never duplicate OpenCode tables in `buddy.db`. Cross-reference by `project_id`.

## Adapter Layer

`@buddy/opencode-adapter` (at `packages/opencode-adapter/`) bridges Buddy code to vendored OpenCode modules:

| Adapter Module       | Exposes             | Used By                                            |
| -------------------- | ------------------- | -------------------------------------------------- |
| `server`             | `Server.App()`      | `runtime.ts` — starts the vendored Hono app        |
| `instance`           | `Instance`          | `index.ts`, `curriculum-tools.ts`                  |
| `agent`              | `Agent`             | `index.ts` — lists agents                          |
| `tool`               | `Tool`              | `curriculum-tools.ts` — registers curriculum tools |
| `registry`           | `ToolRegistry`      | `curriculum-tools.ts`                              |
| `permission`         | `PermissionNext`    | Tests, config                                      |
| `provider-transform` | `ProviderTransform` | Provider model transforms                          |

## Environment Isolation

`env.ts` overrides XDG environment variables before OpenCode initializes:

```
XDG_DATA_HOME  → .buddy-runtime/xdg/data
XDG_CACHE_HOME → .buddy-runtime/xdg/cache
XDG_CONFIG_HOME → .buddy-runtime/xdg/config
XDG_STATE_HOME → .buddy-runtime/xdg/state
OPENCODE_CLIENT → web
```

This ensures vendored OpenCode doesn't collide with a standalone OpenCode install on the same machine.

## Risk Assessment (Final)

### No Fatal Risks

After comprehensive audit, there are **zero dead-end risks** in this architecture. Every identified concern has a viable mitigation path.

### Remaining Risks (all manageable)

| Risk                                                                             | Severity | Mitigation                                                                                                        |
| -------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| **Project table duplication** — both `buddy.db` and `opencode.db` track projects | 🟡 Low   | Schemas are identical today. Can be unified by routing through adapter in a future refactor.                      |
| **Upstream schema migration** — OpenCode may change table schemas                | 🟡 Low   | Buddy doesn't query OpenCode's DB directly. Dual-DB architecture isolates them. SCHEMA.md documents the boundary. |
| **Flag system** — OpenCode flags frozen at import time                           | 🟢 None  | Separate `BUDDY_*` / `OPENCODE_*` namespaces. Dynamic flags use `defineProperty`.                                 |
| **Upstream API contract change** — OpenCode may change response shapes           | 🟡 Low   | SDK types are auto-generated from runtime OpenAPI spec. Regenerate after pulling upstream.                        |

### What Would Be Fatal (and why it won't happen)

1. **OpenCode removes the HTTP server** → Won't happen; it's a core feature of OpenCode.
2. **OpenCode removes `Instance.provide()`** → Won't happen; it's the foundation of their multi-project model.
3. **OpenCode stops being importable as a library** → Won't happen; their architecture is already modular.

## Upgrading Vendored OpenCode

```bash
# Pull latest from upstream
git subtree pull --prefix vendor/opencode opencode-upstream dev --squash

# Check for breaking changes
git diff HEAD~1 vendor/opencode/packages/opencode/migration/            # new migrations?
git diff HEAD~1 vendor/opencode/packages/opencode/src/server/routes/    # API changes?

# Regenerate SDK and verify
cd packages/sdk && bun run generate
bun run typecheck
bun run test:contracts
```

## Completed Migration Steps

- [x] Vendored OpenCode monorepo mirror at `vendor/opencode/`
- [x] Created `@buddy/opencode-adapter` with 8 bridge modules
- [x] Eliminated all `eval()` dynamic imports (6 total)
- [x] Fixed config pollution (replaced PATCH /config with Instance.dispose())
- [x] Deleted 16 dead files from pre-vendoring era
- [x] Established dual-database architecture with curriculum table
- [x] Documented architecture in SCHEMA.md and AGENTS.md
- [x] SDK regeneration verified (zero diffs — API contract unchanged)
- [x] Full monorepo typecheck passes (6/6 packages)
- [x] All 30 backend tests pass

## Remaining Work (Non-Blocking)

- [ ] Unify project tracking (eliminate Buddy's duplicate Project module)
- [ ] Smoke-test agent loop manually
- [ ] Commit in logical batches per MIGRATION_TODO.md Phase 5
- [ ] Add vendor refresh runbook
