# AGENTS.md

## Backend Learnings (non-obvious)

- Runtime authority is vendored OpenCode (`vendor/opencode/packages/opencode`) mounted through `src/index.ts`; Buddy backend should remain a facade/adapter layer.
- Keep header compatibility (`x-buddy-directory` -> `x-opencode-directory`) in route handlers so web routing remains stable while core executes upstream code.
- Buddy-specific behavior belongs in extension seams only (learning domain tools, compatibility response shaping), not in reimplemented core loop logic.
- XDG bootstrap must verify directory writability (not only `mkdir` success); pre-existing read-only dirs can pass ensure and later fail DB init with `SQLITE_READONLY`.
- Test/runtime isolation should avoid shared persistent storage paths to prevent cross-run contamination and false failures.

## Architecture Overview

- **Routes**: Modular route files in `src/routes/*.ts` (auth, config, session, curriculum, teaching, etc.)
- **Config**: Split into `src/config/` with schema.ts, errors.ts, document.ts, and `src/config/opencode/` for OpenCode overlay logic
- **Agent Kit**: `src/agent-kit/` contains agent factories, buddy-agents registry, and registration helpers
- **Learning Domain**: `src/learning/` contains curriculum, teaching, and companion subsystems with modular tools

## Dual Database Architecture

- **Two databases**: `opencode.db` (chat engine, managed by vendored OpenCode) and `buddy.db` (learning layer, managed by Buddy). See `SCHEMA.md` for details.
- **Never duplicate OpenCode tables** in `buddy.db` — sessions, messages, permissions belong to OpenCode.
- **Never query `opencode.db` directly** — use the adapter (`@buddy/opencode-adapter/*`) or the HTTP proxy.
- **Cross-reference by `project_id`** when Buddy needs to associate its data with OpenCode projects.
