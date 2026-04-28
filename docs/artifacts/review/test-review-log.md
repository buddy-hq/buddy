# Test Review Log

## Scope

- Reviewed Buddy-owned tests under `packages/buddy/test` and `packages/web/e2e`.
- Kept `vendor/opencode` tests out of scope.

## Removed

- `packages/buddy/test/session/project-scoped-routes.test.ts`
  Removed `allows sibling repository directories under monorepo parent` because it depended on this repo's current parent-directory layout instead of Buddy's explicit allowed-root contract.

## Updated

- `packages/buddy/test/parity/openapi-doc.test.ts`
  Added missing documented routes and operations for live web-client calls: `session.command`, `session.teachingState`, and `skills.settings.patch`.
- `packages/web/e2e/faults-web/faults-web.spec.ts`
  Replaced a stale `buddy.chat.v4` fixture shape that used ignored legacy fields (`openProjects`, `directories`) with the current persisted fields used by `chat-store` merge.
- `packages/buddy/test/curriculum/goals-tools.test.ts`
  Replaced Tauri-era learning examples with current Electron desktop bridge examples.
- `packages/buddy/test/curriculum/goals-archive.test.ts`
  Replaced Tauri-era archived/current goal-set fixtures with current Electron desktop bridge examples.
- `packages/buddy/test/curriculum/goal-lint-template.test.ts`
  Replaced stale Tauri command examples with current desktop bridge examples while keeping the template and vague-verb assertions intact.
- `packages/buddy/test/prompts/compose-system-prompt-goals.test.ts`
  Updated the learner goal fixture from Tauri IPC to the Electron desktop bridge so the prompt snapshot reflects current Buddy product context.
- `packages/buddy/test/learning/learner-intent-view.test.ts`
  Updated workspace and goal fixtures away from Tauri-specific examples to current desktop app examples.
- `packages/buddy/test/learning/pedagogy-tools.test.ts`
  Updated the teaching topic fixture from Tauri commands to desktop bridge commands.

## Made Less Eager

- `packages/buddy/test/session/project-scoped-routes.test.ts`
  Renamed the suite from `multi-tenant` to `project-scoped` so the test name matches Buddy's current single-user architecture instead of an outdated tenancy model.
- `packages/buddy/test/session/system-prompt-smoke.test.ts`
  Kept the Buddy-owned AGENTS capture assertions, but removed assertions that pinned exact vendored prompt prose and prompt-section wording.
- `packages/web/e2e/core-web/core-web.spec.ts`
  Narrowed `/skills` coverage to its real contract: redirecting to `/settings?tab=skills`, instead of asserting unrelated notebook bootstrap state.
- `packages/web/e2e/smoke-web/smoke-web.spec.ts`
  Switched appearance persistence coverage from raw localStorage keys to the visible selected settings after reload.
- `packages/web/e2e/desktop-shell/desktop-shell.spec.ts`
  Switched desktop appearance persistence coverage from raw localStorage keys to the visible selected settings after relaunch.

## Verification

- `packages/buddy`: targeted backend tests passed.
  Command: `bun test --preload ./test/preload.ts test/parity/openapi-doc.test.ts test/session/project-scoped-routes.test.ts test/session/system-prompt-smoke.test.ts test/curriculum/goals-tools.test.ts test/curriculum/goals-archive.test.ts test/curriculum/goal-lint-template.test.ts test/prompts/compose-system-prompt-goals.test.ts test/learning/learner-intent-view.test.ts test/learning/pedagogy-tools.test.ts`
- `packages/web`: targeted Playwright checks passed.
  Commands: `bun x playwright test e2e/smoke-web/smoke-web.spec.ts --config ./playwright.config.ts --project smoke-web --grep "CFG-01"`, `bun x playwright test e2e/core-web/core-web.spec.ts --config ./playwright.config.ts --project core-web --grep "ENT-05"`, `bun x playwright test e2e/faults-web/faults-web.spec.ts --config ./playwright.config.ts --project faults-web --grep "SES-06"`, `BUDDY_E2E_DESKTOP_SHELL=1 bun x playwright test e2e/desktop-shell/desktop-shell.spec.ts --config ./playwright.config.ts --project desktop-shell --grep "DSK-03"`
- `bun fmt` passed.
- `bun typecheck` passed.
- `bun lint` completed with pre-existing repo warnings outside this review work.
  Current warnings are `oxc(no-map-spread)` in `packages/web/src/components/chat/tools/render/question-set/saved-question-set-tool.tsx`, `packages/web/src/components/chat/tools/render/task.tsx`, `packages/web/src/state/chat-actions.ts`, and `packages/web/test/question-dock-request-stability.test.tsx`.
