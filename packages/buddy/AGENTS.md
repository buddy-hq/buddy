# AGENTS.md

## Backend Learnings (non-obvious)
- Runtime authority is vendored OpenCode (`vendor/opencode-core`) mounted through `src/index.ts`; Buddy backend should remain a facade/adapter layer.
- Keep header compatibility (`x-buddy-directory` -> `x-opencode-directory`) in `src/index.ts` so web routing remains stable while core executes upstream code.
- Config updates must be mirrored into OpenCode before prompt calls (`syncOpenCodeProjectConfig`) or provider/model resolution can fail at runtime.
- Buddy-specific behavior belongs in extension seams only (curriculum routes/tools, compatibility response shaping), not in reimplemented core loop logic.
- XDG bootstrap must verify directory writability (not only `mkdir` success); pre-existing read-only dirs can pass ensure and later fail DB init with `SQLITE_READONLY`.
- In constrained/sandbox test runs, set `BUDDY_DATA_DIR` to a temp path to avoid false failures from shared or read-only default XDG DB locations.
