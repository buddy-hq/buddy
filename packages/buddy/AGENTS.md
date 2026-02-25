# AGENTS.md

## Backend Learnings (non-obvious)

- Runtime authority is vendored OpenCode (`vendor/opencode/packages/opencode`) mounted through `src/index.ts`; Buddy backend should remain a facade/adapter layer.
- Keep header compatibility (`x-buddy-directory` -> `x-opencode-directory`) in `src/index.ts` so web routing remains stable while core executes upstream code.
- Buddy-specific behavior belongs in extension seams only (curriculum routes/tools, compatibility response shaping), not in reimplemented core loop logic.
- XDG bootstrap must verify directory writability (not only `mkdir` success); pre-existing read-only dirs can pass ensure and later fail DB init with `SQLITE_READONLY`.
- In constrained/sandbox test runs, set `BUDDY_DATA_DIR` to a temp path to avoid false failures from shared or read-only default XDG DB locations.

## Dual Database Architecture

- **Two databases**: `opencode.db` (chat engine, managed by vendored OpenCode) and `buddy.db` (learning layer, managed by Buddy). See `SCHEMA.md` for details.
- **Never duplicate OpenCode tables** in `buddy.db` — sessions, messages, permissions belong to OpenCode.
- **Never query `opencode.db` directly** — use the adapter (`@buddy/opencode-adapter/*`) or the HTTP proxy.
- **Cross-reference by `project_id`** when Buddy needs to associate its data with OpenCode projects.
