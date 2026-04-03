# Buddy Home Rollout Checklist

Last updated: 2026-04-03 18:22:23 IST

## Scope
- Implement Buddy Home + Inbox + frictionless notebook creation.
- Keep `Open Existing Folder` available.
- Exclude memory-system changes.
- Electron-only implementation path (no Tauri maintenance changes).

## Checklist
- [x] Stop all spawned subagents and continue solo.
- [x] Reconcile backend naming/export mismatches (`buddy-home.ts`, `managed-notebook.ts`, route imports).
- [x] Finalize backend routes:
- [x] `GET/PUT /api/global/notebook-home`
- [x] `POST /api/open-projects/create`
- [x] Finalize backend config key (single source of truth for notebook home).
- [x] Finalize backend tests for notebook home + managed notebook create.
- [x] Add web action-layer APIs for notebook home and managed notebook creation.
- [x] Regenerate SDK (`packages/sdk`) for new OpenAPI routes.
- [x] Update onboarding flow (auth -> buddy home -> inbox).
- [x] Update desktop onboarding guard behavior to match new completion model.
- [x] Update sidebar create UX:
- [x] Quick Chat
- [x] New Notebook
- [x] Open Existing Folder
- [x] Update chat entry empty-state flow.
- [x] Update settings route wiring to new sidebar action contract.
- [x] Add/adjust i18n strings for new UX copy.
- [x] Run scoped fmt/lint/typecheck/tests for touched files and fix errors.
- [x] Final validation pass and handoff notes.
- [x] Enforce notebook-scoped file access posture (`external_directory` ask-by-default) in Buddy runtime overlay.
- [x] Add coverage proving project config cannot widen `external_directory` to allow-all.
- [x] Remove Electron startup wildcard root (`*`) and replace with tight default roots.
- [x] Allow opened notebooks as runtime directory roots via open-project registry.
- [x] Fix sidecar `/api/health` startup 403 under tightened roots.

## Work Log
- 2026-04-03 16:54:35 IST: Created rollout checklist + log. Continuing implementation against this file.
- 2026-04-03 16:57:34 IST: Wired sidebar create menu to support Quick Chat, New Notebook modal, and Open Existing Folder fallback.
- 2026-04-03 17:00:12 IST: Wired directory chat controller actions to create/open Inbox and managed notebooks, then navigate and start fresh thread drafts.
- 2026-04-03 17:03:26 IST: Reworked `/chat` empty-state to be quick-chat first, added managed notebook creation dialog, and retained open-folder fallback/input behavior.
- 2026-04-03 17:05:41 IST: Reworked onboarding notebook step to choose Buddy Home default/custom and auto-start in Inbox.
- 2026-04-03 17:06:48 IST: Updated onboarding helper signatures/tests and i18n copy for Buddy Home + Inbox model.
- 2026-04-03 17:08:05 IST: Validation complete on touched scope: web typecheck, onboarding tests, scoped oxfmt/oxlint, buddy typecheck, backend route tests.
- 2026-04-03 17:09:38 IST: Added Inbox-specific first-thread empty-state guidance to reinforce quick-chat mental model.
- 2026-04-03 17:10:31 IST: Ensured “Use default home” explicitly persists default Buddy Home before creating/opening Inbox.
- 2026-04-03 18:02:57 IST: Enforced Buddy overlay `external_directory: ask` and added regression test ensuring project-level `permission.external_directory: allow` is overridden back to ask.
- 2026-04-03 18:14:09 IST: Replaced desktop wildcard allowed roots with default Notebook Home + runtime roots, removed backend root-gating from explicit open-folder flow, and allowed API directory access when path is inside the open-project registry.
- 2026-04-03 18:22:23 IST: Fixed startup regression where `/api/health` resolved to home (outside tightened roots) by setting `BUDDY_DIRECTORY_BASE` default to `~/Documents/Buddy` in desktop sidecar environment.
