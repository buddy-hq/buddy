# Database Architecture

Buddy uses **two separate SQLite databases**. This is intentional.

## Storage Ownership

Buddy currently uses:

- `opencode.db` for vendored engine/runtime data
- `buddy.db` for Buddy-owned relational data
- `~/.local/state/buddy/desktop-notebooks.json` for the curated open-project sidebar list

The curated open-project list is intentionally **not** stored in `buddy.db`.

## The Two Databases

### `opencode.db` — Chat Engine (managed by vendored OpenCode)

**Location**: `~/.local/share/buddy/opencode/opencode.db`
**Owner**: `vendor/opencode/packages/opencode/`
**Tables**: session, message, part, todo, permission, project, session_share, control_account

> **Do NOT create tables here.** OpenCode manages its own schema and migrations.
> Query this data only through the adapter (`@buddy/opencode-adapter/*`) or via HTTP proxy.

### `buddy.db` — Learning Layer (managed by Buddy)

**Location**: `~/.local/share/buddy/buddy.db`
**Owner**: `packages/buddy/`
**Tables**: Buddy-owned learning/product tables only

> New Buddy-specific relational features go here. Cross-reference OpenCode data by `project_id` where needed.

### `desktop-notebooks.json` — Curated Open-Projects Registry (managed by Buddy)

**Location**: `~/.local/state/buddy/desktop-notebooks.json`
**Owner**: `packages/buddy/`
**Format**: ordered JSON array of absolute directory strings

> This file is the canonical source of truth for sidebar notebook membership in the desktop product. The renderer must not own this list in local storage.

## Golden Rules

1. **Never duplicate OpenCode tables** in `buddy.db`. Sessions, messages, parts, permissions, and projects belong to OpenCode.
2. **Do not store curated open-project membership in the renderer.** It is backend-owned and file-backed in `desktop-notebooks.json`.
3. **Cross-reference by ID** when Buddy tables need to link to OpenCode data.
4. **Never query `opencode.db` directly** from Buddy code — use the adapter or HTTP proxy.
5. **Buddy migrations** live in `packages/buddy/migration/`. OpenCode migrations live in `vendor/opencode/packages/opencode/migration/`.

## Adding a New Buddy Table

1. Create a schema file: `src/<feature>/<feature>.sql.ts`
2. Export it from `src/storage/schema.ts`
3. Add a migration in `packages/buddy/migration/<timestamp>_<name>/migration.sql`
4. Use `Database.use()` from `src/storage/db.ts` to query
