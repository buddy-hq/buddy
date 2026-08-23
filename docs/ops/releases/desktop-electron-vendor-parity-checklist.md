# Desktop Electron Vendor-Parity Ship Checklist

## Scope
- Build and ship `@buddy/desktop-electron` with vendor-equivalent Electron shell architecture.
- Keep `packages/desktop` (Tauri) present for temporary coexistence.
- Remove OpenCode branding artifacts from Electron assets and UX.
- Reach release readiness with no temporary shortcuts.

## Checklist
- [x] Baseline parity audit complete (`vendor/opencode/packages/desktop-electron` vs `packages/desktop-electron`)
- [x] Copy-safe vendor utilities/configs synced using `cp` where applicable
- [x] Buddy-specific overrides applied cleanly (app IDs, names, URLs, sidecar contract)
- [x] OpenCode icon/branding artifacts removed from Electron package
- [x] Electron main/preload/renderer IPC contract verified end-to-end
- [x] Sidecar spawn/readiness/shutdown lifecycle verified for dev and packaged modes
- [x] Updater/menu/deep-link/single-instance behavior verified
- [x] Release wiring verified (root scripts, workflow, version/changelog/install scripts)
- [x] Local build/package smoke checks pass for desktop-electron + sidecar build path
- [x] Required repo gates pass: `bun fmt`, `bun lint`, `bun typecheck`

## Progress Log
- 2026-04-01 19:20 IST: Created checklist and execution log file. Starting parity audit and asset branding cleanup.
- 2026-04-01 19:26 IST: Replaced `packages/desktop-electron/icons/{dev,prod,beta}` via direct `cp` from `packages/desktop/src-tauri/icons`, removed malformed nested icon folders, and added `dock.png` per channel for Electron dock icon usage.
- 2026-04-01 19:31 IST: Removed stale Tauri release secret gating from `script/cut-release.ts` and switched to Electron-oriented optional signing secret checks.
- 2026-04-01 19:32 IST: Updated installer script to Electron runtime binary path (`Contents/Resources/buddy-backend`) and removed obsolete CLI chmod target.
- 2026-04-01 19:36 IST: Restored vendor-parity IPC/preload surface (WSL config, display backend stubs, zoom, titlebar, clipboard, save dialog, window count), reintroduced WSL store config in main server wiring, copied vendor `apps.ts`/`markdown.ts` by `cp`, and hardened sidecar env bootstrap (shell env merge + OPENCODE auth env compatibility).
- 2026-04-01 19:40 IST: Fixed Electron packaging blocker by moving renderer-only workspace deps (`@buddy/web`, `@buddy/ui`, `react`, `react-dom`) to `devDependencies`; verified `bun run --cwd packages/desktop-electron package:mac` now completes and emits DMG/ZIP artifacts.
- 2026-04-01 19:45 IST: Fixed desktop startup regressions: (1) normalized Electron renderer initial route from `/index.html` to `/` to eliminate TanStack Router `404 Not Found`; (2) fixed sidecar compiled-binary runtime crash (`ReferenceError: undici is not defined`) by compiling from the patched bundled entry in `build-compiled-binary.ts`.
- 2026-04-01 19:53 IST: Rebuilt sidecar and Electron package successfully (`bun run --cwd packages/buddy build:desktop-sidecar`, `bun run --cwd packages/desktop-electron build`).
- 2026-04-01 19:57 IST: Completed installable packaging flow (`bun run --cwd packages/desktop-electron build:installable`) and confirmed signed macOS bundles copied to `packages/desktop-electron/dist/bundles`.
- 2026-04-01 19:59 IST: Required repo gates passed on current tree: `bun fmt`, `bun lint` (0 errors, 1 existing warning), `bun typecheck`.
- 2026-04-01 20:00 IST: Verified sidecar runtime readiness with live health smoke using Electron-style `serve --hostname --port` contract and auth (`/api/healthz` returned OK).
- 2026-04-01 20:12 IST: Fixed desktop message-send blockers: switched status polling to `/api/session/status` and removed stale-session carryover by forcing a draft reset when no valid session can be resolved during directory bootstrap.
- 2026-04-01 20:14 IST: Fixed Electron dev observability and shutdown behavior: sidecar stdout/stderr/error/termination are now mirrored in dev logs, and sidecar is no longer detached in dev mode so `Ctrl+C` can terminate the stack cleanly.
- 2026-04-01 20:15 IST: Fixed React Fast Refresh warning by moving `MODAL_EXPAND_SPRING` into a dedicated module and keeping component modules export-compatible (`mermaid-fullscreen-dialog.tsx` + `mermaid-diagram.tsx`).
- 2026-04-01 20:18 IST: Closed advanced-math parity gap with Tauri in Electron dev path: `predev` now runs `ensure:advanced-math-runtime`, and Electron sidecar env now injects `BUDDY_ADVANCED_MATH_LOCAL_ASSET_DIR` when local assets exist.
- 2026-04-01 20:19 IST: Validated `predev` end-to-end after changes (icons copied, advanced-math ensure/build invoked, sidecar rebuilt/copied to Electron resources).
- 2026-04-01 20:31 IST: Root-caused `Session not found` send failure path: session creation (`POST /api/session`) did not run config-sync, while prompt (`POST /api/session/:id/message`) did; first prompt could dispose/rebootstrap runtime and invalidate a just-created session.
- 2026-04-01 20:34 IST: Fixed backend ordering bug by running `withConfigSync` before `POST /api/session` in session collection handler (`core-actions.ts`), so runtime disposal happens before session creation, not between create and first prompt.
- 2026-04-01 20:37 IST: Hardened frontend session recovery: prompt/command now retry when session lookup confirms a 404 (not only when error text matches), refresh sessions after recovery, and avoid stale transcript reload attempts on missing-session failures.
- 2026-04-01 20:39 IST: Fixed concurrent bootstrap regression while preserving stale-session cleanup by keeping optimistic newly-created active session IDs when an in-flight session list response is temporarily empty (`chat-store.ts`).
- 2026-04-01 20:41 IST: Validated with package tests and runtime smoke: `packages/web` `chat-actions.test.ts` passes, `packages/web` + `packages/buddy` typecheck pass, and direct app-fetch flow confirms `POST /api/session` then `POST /api/session/:id/message` returns `200` (no session-not-found race).
- 2026-04-01 20:47 IST: Added regression coverage for 404 recovery when backend prompt error text is generic (`Not Found`) but session lookup confirms missing session; send path now retries correctly.
- 2026-04-01 20:49 IST: Re-ran required repo gates after fixes: `bun fmt` pass, `bun lint` pass (0 errors, 1 existing warning), `bun typecheck` pass.
- 2026-04-01 21:02 IST: Compared failing Electron send path against Tauri/vendor flow and found Buddy-only pre-proxy session existence checks were still short-circuiting prompt/command requests; removed pre-checks from message/command transforms to match vendor direct `/session/:id/message|command` execution path.
- 2026-04-01 21:05 IST: Hardened directory/session scope matching by allowing exact canonical directory matches before project-ID comparison (`http/session.ts`) to prevent false cross-project negatives from stale/legacy project IDs.
- 2026-04-01 21:07 IST: Rebuilt and recopied Electron sidecar (`bun run --cwd packages/desktop-electron predev`) and verified compiled binary behavior: prompt path now logs upstream `POST /session/:id/message` directly and returns `200` for create-then-send flow.
- 2026-04-01 21:12 IST: Re-validated advanced math runtime caching from backend path by running `bun run --cwd packages/buddy ensure:advanced-math-runtime` twice; both runs hit cache (`using cached local asset for aarch64-apple-darwin`).
- 2026-04-01 21:16 IST: Re-validated Electron release packaging path from current tree with `bun run --cwd packages/desktop-electron build:installable`; macOS ZIP/DMG + blockmaps generated and copied to `packages/desktop-electron/dist/bundles`.
- 2026-04-01 21:17 IST: Re-ran required repo gates for ship readiness on current tree: `bun fmt` pass, `bun lint` pass (0 errors, 1 existing warning), `bun typecheck` pass; re-ran `bun run --cwd packages/desktop-electron predev` to confirm advanced-math cache hit in Electron predev flow.
- 2026-04-01 21:19 IST: Ran live Electron sidecar prompt smoke with the packaged Electron sidecar binary (`packages/desktop-electron/resources/buddy-backend`): `POST /api/session` returned a session id, `GET /api/session/:id` returned `200`, and `POST /api/session/:id/message` returned `200` (session-not-found/404 regression not reproduced).
- 2026-04-01 21:30 IST: Fixed post-restart stale-session recovery in web state orchestration: session-list updates now ignore out-of-order stale responses, stale session selection falls back to draft cleanly (without keeping an error banner), and regression coverage was added in `packages/web/test/chat-actions.test.ts`.
- 2026-04-01 21:52 IST: Hardened Electron restart behavior by clearing volatile chat runtime state on desktop bootstrap while preserving persisted handoff data (`lastSessionByDirectory` and selected models), so a fresh sidecar cannot inherit stale in-memory sessions/transcripts from the previous runtime.
- 2026-04-01 21:53 IST: Hardened backend transcript lookup to trust the current directory-scoped session list before returning `Session not found`; this removes a false-404 path where lookup project validation rejected a session that the directory session collection still considered valid.
- 2026-04-01 21:54 IST: Added focused regression coverage for the new restart reset behavior (`packages/web/test/parity/state/chat-store-events.test.ts`) and expanded session route integration coverage for transcript reads from same-project subdirectories (`packages/buddy/test/session/multi-tenant-routes.test.ts`).
- 2026-04-01 22:08 IST: Fixed restart transcript recovery in web chat state: transcript loads now ignore stale out-of-order failures, and `Session not found` transcript reads are retried with backoff when the session still exists after sidecar restart (`packages/web/src/state/chat-actions.ts`).
- 2026-04-01 22:09 IST: Added focused regression coverage for transient transcript 404 recovery and stale transcript error suppression (`packages/web/test/chat-actions.test.ts`); re-ran `bun test --preload ./happydom.ts test/chat-actions.test.ts`, `bun fmt`, `bun lint`, and `bun typecheck` successfully.
- 2026-04-01 22:18 IST: Aligned transcript reload recovery with vendor-style retry semantics by copying the vendored retry utility into `packages/web/src/lib/retry.ts` and switching chat transcript loads to a longer exponential backoff window gated by selected-session validity (`packages/web/src/state/chat-actions.ts`).
- 2026-04-01 22:19 IST: Added development-sidecar cleanup before Electron spawns a local server so repeated `bun run dev:desktop:electron` runs do not accumulate orphaned `buddy-backend` processes against the same runtime root (`packages/desktop-electron/src/main/cli.ts`).
- 2026-04-01 22:20 IST: Re-ran `packages/web` focused regression tests plus required repo gates after retry + sidecar cleanup changes: `bun test --preload ./happydom.ts test/chat-actions.test.ts`, `bun fmt`, `bun lint`, and `bun typecheck` all passed.
- 2026-04-01 22:30 IST: Replaced Buddy session read proxying for `GET /api/session/:id` and `GET /api/session/:id/message` with direct vendored runtime execution (`OpenCodeInstance.provide` + `OpenCodeSession` / `MessageV2.page`) while preserving Buddy directory/project scoping; this removes the extra embedded-HTTP hop from transcript reads.
- 2026-04-01 22:32 IST: Added Buddy-owned session route regression coverage proving transcript reads survive runtime disposal and preserve vendor-style pagination headers (`packages/buddy/test/session/message-route.test.ts`).
- 2026-04-01 22:34 IST: Aligned Electron shell health probing closer to vendor shape by switching the readiness probe from Buddy-only `/api/healthz` to compatibility `/api/health` and matching the longer 3s probe timeout (`packages/desktop-electron/src/main/constants.ts`, `packages/desktop-electron/src/main/server.ts`).
- 2026-04-01 22:35 IST: Re-ran focused Buddy session route tests (`message-route.test.ts`, `multi-tenant-routes.test.ts`) and required repo gates. Results: tests pass, `bun typecheck` pass, `bun fmt` pass, `bun lint` pass (same existing 1 warning only).
- 2026-04-01 22:52 IST: Fixed vendor-parity retry handling for rate-limited sessions in the Electron/web chat path: preserved full session status objects (`idle|busy|retry`) instead of flattening `retry` to `busy`, rendered a retry notice with attempt/countdown in the transcript instead of endless `Thinking`, updated sidebar/debug consumers to treat retry as active work, and added focused web regressions covering retry-state storage and UI rendering.
