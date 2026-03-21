# Major Refactor Summary

Date: 2026-03-21

This worktree reorganizes Buddy around a backend-owned open-project registry, thinner route entrypoints, and extracted feature modules in the web app.

## Backend

- Added `packages/buddy/src/project/open-project-registry.ts`.
  - Stores curated notebook membership in `desktop-notebooks.json` under Buddy state.
  - Normalizes paths, deduplicates entries, validates allowed roots, and serializes writes.
  - Supports list/open/close/reorder with a queue so updates stay ordered.
- Added `packages/buddy/src/routes/open-projects.ts` and mounted it from `packages/buddy/src/index.ts`.
  - `GET /api/open-projects` returns the ordered list.
  - `POST /api/open-projects` adds a notebook after validating it with vendored OpenCode.
  - `DELETE /api/open-projects` removes a notebook.
  - `PUT /api/open-projects/order` reorders the current set.
- Tightened project routes in `packages/buddy/src/routes/project.ts`.
  - `/api/project` is list-only now.
  - Updates stay on `PATCH /api/project/:projectID`.
  - The old open-project behavior moved out to the dedicated registry route.
- Updated `packages/buddy/SCHEMA.md` and `packages/buddy/AGENTS.md` to document the backend-owned registry and the current database boundaries.

## Web App

- `packages/web/src/state/chat-actions.ts`
  - Loads open projects from the backend.
  - Boots the current notebooks and preloads their sessions.
  - Uses backend routes for open, close, reorder, and session loading.
- `packages/web/src/state/chat-store.ts`
  - Persists only route/session handoff state.
  - `openProjects` is now backend-derived.
  - Added `pendingActiveDirectory` so a persisted notebook selection can be restored after the registry loads.
- `packages/web/src/routes/chat.tsx`
  - Simplified into the landing page that opens a notebook and redirects to `/$directory/chat`.
- `packages/web/src/routes/$directory.chat.tsx`
  - Now acts as the main notebook shell.
  - Wires together transcript rendering, prompt submission, permissions, MCPs, settings, teaching workspace, and the sidebars.
- `packages/web/src/routes/skills.tsx`
  - Reuses the same notebook/session/sidebar model instead of keeping separate flow logic.

## Feature Extraction

- Prompt composer moved into `packages/web/src/components/prompt/`.
  - `attachment-utils.ts` handles file reading and attachment IDs.
  - `editor-dom.ts` handles contenteditable cursor and fragment management.
  - `prompt-parts.ts` handles mention tokenization, serialization, and DOM rendering.
  - `prompt-history.ts` handles draft history navigation.
  - `mention-autocomplete.ts` and `slash-autocomplete.ts` handle matching and ranking.
  - `submit.ts` centralizes submit/abort key handling.
  - `use-prompt-composer-attachments.ts`, `use-prompt-composer-view-state.ts`, and `use-prompt-editor-sync.ts` split the composer behavior into hooks.
  - `prompt-composer.tsx` is now mostly composition and event wiring.
- MCP dialog moved into `packages/web/src/components/mcp-dialog/`.
  - Schema parsing, editor state, list rendering, and local/remote fields are separated.
- Settings moved into `packages/web/src/components/settings/`.
  - Reusable primitives live in `settings-primitives.tsx`.
  - Theme controls live in `theme-settings-section.tsx`.
  - Advanced math runtime state moved into a hook and a confirmation dialog.
- Sidebar and chat rendering were similarly split.
  - `chat-left-sidebar.tsx` now delegates grouping and thread helpers to extracted files.
  - `chat-transcript.tsx` uses shared utility helpers and more memoized render paths.
- Teaching panels and directory-chat orchestration were extracted into `packages/web/src/components/teaching/` and `packages/web/src/lib/directory-chat/`.
  - The route no longer owns the full teaching/workspace state machine.
  - The new hooks handle composer config, SSE sync, teaching workspace lifecycle, and prompt shaping.

## Theme Runtime

- Replaced the old static preload script `packages/web/public/oc-theme-preload.js` with TypeScript modules under `packages/web/src/theme/`.
- `preload-runtime.ts` now applies theme state before React mounts.
- `context.tsx` owns theme selection, caching, preview, and cross-tab sync.
- `storage.ts`, `resolve.ts`, `color.ts`, `shadcn-mapper.ts`, and `types.ts` split the theme runtime into typed modules.
- `packages/web/index.html` now loads `/src/theme/preload.ts`.
- The tests were updated to cover legacy theme migration and cache invalidation.

## SDK And Generated Artifacts

- `packages/sdk/src/index.ts` now wraps the generated client in a Buddy-specific helper that always targets `/api` and injects `x-buddy-directory` when requested.
- `packages/sdk/package.json` exports were aligned with that wrapper.
- `bun.lock` picked up the dependency changes from the refactor.

## Tests And Docs

- Backend tests were expanded for the new open-project registry and the stricter project route behavior.
- Web tests were expanded for chat-store persistence, prompt actions, and theme preload behavior.
- The audit docs in `docs/outdated/tauri-opencode-parity-audit.md` and `docs/product/opencode-sdk-replacement-audit.md` were refreshed to match the new boundary layout.

## Net Effect

- Curated notebook membership is now backend-owned instead of browser-owned.
- The main chat route is thinner and delegates feature-specific behavior to smaller modules.
- The prompt, MCP, settings, teaching, and theme code paths are easier to navigate and test.
- The SDK wrapper and backend routes are more aligned with the `/api` surface Buddy exposes.


---
# Original plan
## Backend-Owned Open-Projects Registry, Vendor-Parity Project API, and Final Desktop Verification

### Summary

This is the final pre-launch architecture plan for fixing notebook/sidebar ownership.

Intent this plan must satisfy:

- Eliminate the recurring “notebooks disappear / wrong notebooks show up” class of bugs.
- Stop relying on renderer/Tauri/local-storage keys for notebook membership.
- Keep Buddy aligned with vendor where it matters:
  - vendor runtime/project catalog stays vendor-owned
  - Buddy owns only its curated sidebar/open-project registry
- Avoid unnecessary DB work:
  - no new Buddy DB table for this
  - no Buddy DB migration for this change
- Use the existing canonical backend state location that already exists on this machine:
  - `~/.buddy-runtime/xdg/state/buddy/desktop-notebooks.json`
- Make the plan executable by another agent after context loss.
- During implementation, use subagents for non-overlapping parallel work.
- End with a real desktop build and smoke test, not just unit tests.

Current verified state this plan is based on:

- Desktop sidecar already runs under a canonical XDG root from [`packages/desktop/src-tauri/src/lib.rs`](/Users/prashantbhudwal/Code/buddy/packages/desktop/src-tauri/src/lib.rs#L262).
- Buddy state paths resolve from [`packages/buddy/src/storage/global.ts`](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/storage/global.ts#L19).
- The live curated notebook list already exists as a plain JSON array in `desktop-notebooks.json`.
- The web app currently persists `openProjects` in [`packages/web/src/state/chat-store.ts`](/Users/prashantbhudwal/Code/buddy/packages/web/src/state/chat-store.ts) and tries to repair it with heuristics.
- Vendor uses two concepts:
  - backend/runtime `project` catalog
  - separate opened-project UI membership
- Buddy currently overloads [`packages/buddy/src/routes/project.ts`](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/routes/project.ts) with a Buddy-specific open behavior that should be removed.

### Architecture and API

Final ownership model:

- `opencode.db` remains the only engine/runtime catalog.
- Buddy owns one curated open-project registry.
- That registry is backend-owned and file-backed.
- Renderer state becomes an in-memory cache of backend state, not the authority.

Persistence contract:

- Canonical registry path: `path.join(Global.Path.state, "desktop-notebooks.json")`
- File format stays exactly:
  - ordered JSON array of absolute directory strings
- No wrapper object.
- No version field.
- No migration step.
- No import from renderer/Tauri stores.

Public API changes:

- Add `GET /api/open-projects`
  - `operationId: "openProjects.list"`
  - returns `{ directories: string[] }`

- Add `POST /api/open-projects`
  - `operationId: "openProjects.open"`
  - body `{ directory: string }`
  - returns `{ directory: string }`

- Add `DELETE /api/open-projects`
  - `operationId: "openProjects.close"`
  - query `directory`
  - returns `{ directory: string }`

- Add `PUT /api/open-projects/order`
  - `operationId: "openProjects.reorder"`
  - body `{ directories: string[] }`
  - returns `{ directories: string[] }`

- Remove `POST /api/project`
  - remove `operationId: "project.open"`
  - after this refactor, `/api/project` is vendor-parity only:
    - `GET /api/project`
    - `GET /api/project/current`
    - `PATCH /api/project/:projectID`

Behavior rules:

- Normalize all registry entries the same way everywhere:
  - trim
  - resolve to absolute path
  - strip trailing slash
  - reject empty and `/`
- `POST /api/open-projects` must:
  - resolve with existing backend directory helpers
  - validate allowed roots
  - call `OpenCodeProject.fromDirectory(resolved)` before persisting
  - prepend if missing
  - no-op if already present
- `GET /api/open-projects` must not call `fromDirectory()` or mutate vendor state.
- `DELETE /api/open-projects` is idempotent.
- `PUT /api/open-projects/order` must reorder only:
  - normalized request set must exactly match current registry set
  - mismatch returns `400`
- Do not auto-remove registry entries because preload/session requests fail. Only explicit close removes them.

### Implementation Changes

Backend:

- Add a dedicated open-project registry service in Buddy code, separate from vendor compatibility project code.
- Recommended shape:
  - `list(): Promise<string[]>`
  - `open(directory: string): Promise<string>`
  - `close(directory: string): Promise<string>`
  - `reorder(directories: string[]): Promise<string[]>`
- Read semantics:
  - missing file => `[]`
  - malformed JSON => `[]`
  - normalize and de-dupe while preserving order
- Write semantics:
  - `JSON.stringify(directories, null, 2) + "\n"`
  - temp file + rename
  - serialized writes in-process to avoid lost updates
- Mount new route in the Buddy API and include it in the OpenAPI doc.
- Keep vendor code untouched.

Web:

- Keep `openProjects` in `useChatStore`, but only as in-memory runtime state.
- In [`packages/web/src/state/chat-store.ts`](/Users/prashantbhudwal/Code/buddy/packages/web/src/state/chat-store.ts):
  - remove `openProjects` from persisted `merge`
  - remove `openProjects` from `partialize`
  - delete all recovery helpers and rehydrate repair logic
  - keep `activeDirectory` and `lastSessionByDirectory` persisted under the existing `buddy.chat.v4` key
  - do not introduce a new storage key
- In [`packages/web/src/state/chat-actions.ts`](/Users/prashantbhudwal/Code/buddy/packages/web/src/state/chat-actions.ts):
  - `loadOpenProjects()` calls `client.openProjects.list()`
  - `openProject()` calls `client.openProjects.open()`
  - add `closeOpenProject(directory)`
  - add `reorderOpenProjects(directories)`
  - add one shared bootstrap helper:
    - `loadOpenProjects()`
    - then `preloadProjectSessions(knownOpenProjects)`
- Routes:
  - `/chat`, `/$directory/chat`, and `/skills` must all use the shared bootstrap helper
  - this is required because `/skills` currently does not load open-project membership on its own
- Ordering:
  - backend registry order becomes the notebook order
  - remove notebook-order ownership from `useUiPreferences`
  - sidebar drag-reorder must call backend reorder action
- Keep local UI state local:
  - pinned/unread thread state
  - sidebar widths/open state
  - right sidebar tab
- Current temporary recovery-oriented local changes in `chat-store.ts` and `chat-actions.ts` should be deleted as part of this refactor, not preserved.

Docs and architecture notes:

- Update `packages/buddy/SCHEMA.md` to state that curated open-project membership is file-backed under Buddy state, not stored in `buddy.db`.
- Update docs that still describe `/api/project` as the notebook registry.
- Do not include cleanup of dead Buddy DB migration tables in this refactor.
- Do not add per-server registry scoping in this refactor; keep a single local curated registry behind the backend API.

### Parallel Execution Strategy

Use subagents during implementation for independent work.

Main agent owns:
- architecture decisions
- integration
- final SDK generation
- final verification
- final desktop build
- smoke testing

Subagent split:

1. Backend subagent
- Owns `packages/buddy`
- Implements open-project registry service and routes
- Updates backend tests and OpenAPI expectations
- Does not touch `packages/web`

2. Web subagent
- Owns `packages/web`
- Refactors `chat-store`, `chat-actions`, route bootstrap, and sidebar ordering
- Replaces local ordering/persistence ownership with backend API usage
- Does not touch `packages/buddy`

3. Optional docs subagent
- Owns `packages/buddy/SCHEMA.md` and relevant docs
- Only runs after backend route names and semantics are final

Integration order:

1. Backend subagent lands route/service/test changes.
2. Main agent regenerates SDK with `bun run sdk:generate`.
3. Web subagent finishes against the regenerated SDK surface.
4. Main agent integrates, runs targeted tests, then runs the full desktop installable build.
5. Main agent performs smoke testing against the built desktop app.

### Test Plan and Final Verification

Targeted automated tests:

- Backend:
  - missing `desktop-notebooks.json` => empty list
  - `POST /api/open-projects` resolves relative paths correctly
  - `POST /api/open-projects` rejects outside allowed roots
  - repeated `POST` is idempotent and preserves order
  - `DELETE` is idempotent
  - `PUT /order` persists order and rejects set mismatches
  - `GET /api/open-projects` is read-only and does not create vendor project rows
  - OpenAPI no longer exposes `project.open`

- Web:
  - `loadOpenProjects()` hydrates from backend
  - `openProject()` uses the new API
  - `closeOpenProject()` and `reorderOpenProjects()` update store state correctly
  - `openProjects` no longer survives solely through local persisted storage
  - polluted `buddy.chat.dat` no longer determines notebook membership
  - `/skills` bootstraps notebook membership correctly on direct load

SDK step:

- Run `bun run sdk:generate` from repo root after backend API changes land.

Required final build step:

- From repo root, run:
  - `bun run build:installable`
- Use this exact command.
- Do not use the stale README root command `build:desktop:installable`; the actual root script in `package.json` is `build:installable`.

Required smoke testing after the build:

- Launch the built desktop app produced by the installable build.
- Confirm the notebook list matches `~/.buddy-runtime/xdg/state/buddy/desktop-notebooks.json`.
- Confirm polluted or missing renderer store files do not change the notebook list.
- Add a notebook in the UI and confirm:
  - it appears immediately
  - `desktop-notebooks.json` updates
  - restart preserves it
- Reorder notebooks in the UI and confirm:
  - order persists after restart
  - order is read from the backend registry, not `buddy.ui.dat`
- Close a notebook and confirm:
  - it is removed from the UI
  - it is removed from `desktop-notebooks.json`
  - restart preserves the removal
- Open `/chat`, direct `/$directory/chat`, and `/skills` and confirm all three surfaces load the same notebook set.
- If practical, verify that switching between dev app and built installable app still shows the same notebook list because both use the same backend state file.

### Assumptions

- Single-user, single-machine Buddy desktop semantics are the target.
- No backward-compat import from renderer/Tauri store keys is required.
- `desktop-notebooks.json` is the only membership source we preserve.
- No Buddy DB schema changes are part of this refactor.
- No vendor code modifications are allowed.
