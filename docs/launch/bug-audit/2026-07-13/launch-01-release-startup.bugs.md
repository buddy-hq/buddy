# LAUNCH-01 — Release packaging, installation, and first startup

Audit date: 2026-07-13
Pass status: Discovery complete; verification pending
Baseline: Current workspace, evaluated as a clean release-candidate tree. Unrelated dirty-worktree changes were ignored.

This file records first-pass candidates. A candidate is not a final launch verdict until the verification pass either retains it under **Verified bugs** or moves it to **Rejected after verification**.

## Candidate bugs

### L01-C01 — P1 — Release artifacts are not platform-trusted

- **Locations:** `packages/desktop-electron/electron-builder.config.ts:62-81`, `.github/workflows/publish-shared.yml:193-196`, `.github/workflows/publish-shared.yml:274-277`, `.github/workflows/publish-shared.yml:355-358`, `script/cut-release.ts:178-211`
- **Trigger:** A user downloads and opens the production macOS app or Windows installer through the normal public release path.
- **Expected:** macOS artifacts are Developer ID signed and notarized; Windows installers are Authenticode signed.
- **Observed in discovery:** macOS explicitly sets `notarize: false`; platform-signing credentials are not supplied to release build steps; the release wizard permits unsigned output. The public shell installer works around macOS quarantine instead of producing a Gatekeeper-trusted app.
- **Impact:** Gatekeeper can reject a normal macOS launch, while Windows presents an unknown publisher and may trigger SmartScreen. The standard install journey is not launch-ready for nontechnical users.
- **Verification pending:** Inspect fresh CI artifacts with `codesign`, `spctl`, and `Get-AuthenticodeSignature`, then exercise browser-download installation on supported macOS and Windows versions.
- **First-pass confidence:** High.

### L01-C02 — P1/P2 — Startup feedback does not cover existing-database upgrades or early backend bootstrap

- **Locations:** `packages/desktop-electron/src/main/index.ts:290-363`, `packages/desktop-electron/src/main/server.ts:135-145`, `packages/desktop-electron/src/main/backend-utility.ts:71-96`, `vendor/opencode/packages/core/src/database/database.ts:25-34`
- **Trigger:** An existing database needs schema migrations, or cold backend import/listener startup takes noticeable time.
- **Expected:** A loading window becomes visible after a short threshold and remains until Buddy is usable.
- **Observed in discovery:** `needsMigration` is defined only as “SQLite file does not exist.” The loading window is therefore skipped for migrations against an existing database. Buddy also awaits the utility process's ready signal before it can create any window, while that signal follows Node SQLite validation, backend import, and listener creation.
- **Impact:** An upgrade or slow cold launch can show zero Buddy windows until health succeeds or the 30-second failure path appears. Users may relaunch or force-quit during migration.
- **Verification pending:** Launch a packaged build against a prior-release database with a controlled pending migration and measure first-window timing; separately delay backend import in an instrumented disposable build.
- **First-pass confidence:** High on control flow; observed severity depends on real startup and migration duration.

### L01-C03 — P2 — Backend port allocation releases the port before the backend binds

- **Locations:** `packages/desktop-electron/src/main/index.ts:293-306`, `packages/desktop-electron/src/main/index.ts:758-778`, `packages/desktop-electron/src/main/server.ts:79-145`
- **Trigger:** Another process claims the selected ephemeral port after the allocator closes its temporary socket and before the utility process binds.
- **Expected:** Buddy retains socket ownership through handoff, lets the backend bind port `0`, or retries `EADDRINUSE` with a new port.
- **Observed in discovery:** The allocator records a port, closes the only socket reserving it, and later gives that number to a separate process for a one-shot bind. No retry exists.
- **Impact:** Intermittent startup failure routes a healthy installation into recovery or quit.
- **Verification pending:** Use a deterministic harness that claims the released port before utility bind and assert whether Buddy retries or fails.
- **First-pass confidence:** High that the race exists; expected field frequency is low.

## Verified bugs

Pending second-pass verification.

## Rejected after verification

None yet.

## Discovery coverage with no retained candidate

- Packaged runtime resources and architecture-specific artifact naming.
- `node:sqlite` validation and backend utility termination paths.
- First-install directory creation and normal startup-failure dialogs.
- macOS prior-installer terminal failure reporting.
