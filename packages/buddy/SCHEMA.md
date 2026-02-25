# Database Architecture

Buddy uses **two separate SQLite databases**. This is intentional.

## The Two Databases

### `opencode.db` — Chat Engine (managed by vendored OpenCode)

**Location**: `.buddy-runtime/xdg/data/opencode/opencode.db`
**Owner**: `vendor/opencode-core/`
**Tables**: session, message, part, todo, permission, project, session_share, control_account

> **Do NOT create tables here.** OpenCode manages its own schema and migrations.
> Query this data only through the adapter (`@buddy/opencode-adapter/*`) or via HTTP proxy.

### `buddy.db` — Learning Layer (managed by Buddy)

**Location**: `~/.local/share/buddy/buddy.db`
**Owner**: `packages/buddy/`
**Tables**: project (legacy), **curriculum**

> New Buddy-specific features go here. Cross-reference OpenCode data by `project_id`.

## Golden Rules

1. **Never duplicate OpenCode tables** in `buddy.db`. Sessions, messages, parts, permissions — all belong to OpenCode.
2. **Cross-reference by ID** — store `project_id` in Buddy tables to link to OpenCode's project data.
3. **Never query `opencode.db` directly** from Buddy code — use the adapter or HTTP proxy.
4. **Buddy migrations** live in `packages/buddy/migration/`. OpenCode migrations live in `vendor/opencode-core/migration/`.

## Adding a New Buddy Table

1. Create a schema file: `src/<feature>/<feature>.sql.ts`
2. Export it from `src/storage/schema.ts`
3. Add a migration in `packages/buddy/migration/<timestamp>_<name>/migration.sql`
4. Use `Database.use()` from `src/storage/db.ts` to query
