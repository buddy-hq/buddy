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

## Risk Assessment (Current)

This cutover removes the previous split-SHA subtree workflow and unblocks feature work, but it does not remove all risk. The main remaining risks are operational and integration-related.

| Risk | Severity | Why it matters | Mitigation / Control |
| --- | --- | --- | --- |
| **Upstream internal import churn** (`opencode/*` deep paths) | 🟠 Medium | Buddy adapter imports target internal OpenCode modules; upstream refactors can break compile/runtime on sync. | Keep all OpenCode usage behind `@buddy/opencode-adapter`; run `bun run typecheck` + `bun run test:contracts` after every `vendor:sync`; pin to known-good mirror commit per release. |
| **Large subtree sync blast radius** | 🟠 Medium | `vendor/opencode` updates can touch thousands of files, making regressions easy to miss in review. | Treat each sync as its own PR/commit batch; diff focus on `vendor/opencode/packages/opencode/src/server/routes`, migrations, and adapter compile surface. |
| **API/contract drift between web and backend** | 🟠 Medium | Frontend behavior depends on `/api/*` compatibility semantics (SSE lifecycle, busy state, message shape). | Keep contract tests mandatory (`bun run test:contracts`); regenerate SDK after sync and verify no `/api/api` path regressions. |
| **Dual project metadata divergence** (`buddy.db` vs `opencode.db`) | 🟡 Low | Project identity exists in both domains today; accidental divergence can cause routing/state confusion. | Keep Buddy data linked by `project_id`; avoid direct writes to OpenCode project tables; plan eventual project-source-of-truth consolidation. |
| **Vendor patch drift** (editing `vendor/opencode/**`) | 🟡 Low | Local vendor edits are hard to preserve and reconcile with future upstream pulls. | Do not patch vendor runtime unless intentional and documented; prefer Buddy-side adapters and compatibility wrappers. |
| **Runtime environment coupling** (XDG, ports, plugin bootstrap) | 🟡 Low | Misconfigured runtime dirs/ports can fail startup in ways that look like app regressions. | Keep XDG override bootstrap in place; use explicit `PORT` and root `.env`; keep startup smoke checks in release workflow. |

### Dead-End Check

There is no current architectural dead end for building Buddy logic on top of this mirror model. The cost is disciplined sync/review hygiene, not inability to extend.

## Upgrading Vendored OpenCode

```bash
# Optional: confirm whether upstream has moved
bun run vendor:check-upstream

# Pull latest from upstream mirror
bun run vendor:sync

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
