# LAUNCH-05 — Desktop update, signature, install, and recovery lifecycle

Audit date: 2026-07-13
Pass status: Discovery complete; verification pending
Baseline: Current workspace, evaluated as a clean release-candidate tree. Unrelated dirty-worktree changes were ignored.

This file records first-pass candidates. A candidate is not a final launch verdict until the verification pass either retains it under **Verified bugs** or moves it to **Rejected after verification**.

## Candidate bugs

### L05-C01 — P1 — macOS update replacement deletes the working app before replacement succeeds

- **Locations:** `packages/desktop-electron/resources/mac-install-update.sh:35-48`, `packages/desktop-electron/resources/mac-install-update.sh:75-103`, `packages/desktop-electron/resources/mac-install-update.sh:154-185`
- **Trigger:** Disk full, power loss, interrupted `ditto`, or a failed/cancelled privilege fallback after deletion.
- **Expected:** Stage and verify beside the destination, atomically swap, and retain a rollback copy until the new app relaunches.
- **Observed in discovery:** Both install paths run `rm -rf "$APP_PATH"` before copying the new bundle. Failure recovery can relaunch only if a valid destination still exists.
- **Impact:** A failed self-update can remove the only working Buddy installation and require manual reinstall.
- **Verification pending:** Install into a temporary fake app destination, inject failure after deletion, and assert the original remains byte-identical and runnable.
- **First-pass confidence:** High.

### L05-C02 — P1 — Helper process creation is mistaken for installer readiness

- **Locations:** `packages/desktop-electron/src/main/custom-mac-updater.ts:196-239`, `packages/desktop-electron/resources/mac-install-update.sh:154-162`, `packages/desktop-electron/src/main/index.ts:519-550`
- **Trigger:** `/bin/bash` starts but the helper script is absent, unreadable, malformed, or exits before writing its running result.
- **Expected:** The helper acknowledges that it loaded its script and durable result/log paths before Buddy stops the backend and quits.
- **Observed in discovery:** `waitForInstallerLaunch` resolves on the child's OS-level `spawn` event. Buddy then stops the backend and exits even if bash immediately fails; no result exists for the next launch to report.
- **Impact:** The app disappears, the update is not installed, no automatic relaunch occurs, and the user receives no failure explanation.
- **Verification pending:** Substitute an immediate-exit helper and assert Buddy does not stop/quit without a readiness acknowledgement.
- **First-pass confidence:** High.

### L05-C03 — P1 — Startup recovery can become an invisible, unbounded check/download

- **Locations:** `packages/desktop-electron/src/main/index.ts:229-235`, `packages/desktop-electron/src/main/index.ts:374-475`, `packages/desktop-electron/src/main/update-common.ts:139-150`, `packages/desktop-electron/src/main/update-common.ts:204-239`, `packages/desktop-electron/src/main/custom-mac-updater.ts:153-185`, `packages/desktop-electron/src/main/custom-mac-updater.ts:377-404`
- **Trigger:** Backend startup fails, the user chooses **Check for Update**, and GitHub or the update body is slow/stalled.
- **Expected:** A visible, cancellable recovery surface reports check/download progress and enforces an application deadline.
- **Observed in discovery:** The startup overlay and first dialog close before the full update check/download. Progress is sent only to `mainWindow`, which does not exist, targeted mac recovery omits its progress callback, and updater fetches have no AbortSignal/deadline.
- **Impact:** Buddy can show no UI for the entire large download or indefinitely on a stalled request, looking like a second crash during its only built-in recovery path.
- **Verification pending:** Use throttled and never-resolving fetch fixtures after a forced startup failure; assert persistent progress, cancel, timeout, and manual-download fallbacks.
- **First-pass confidence:** High.

### L05-C04 — P2 — macOS updater buffers multiple full copies of the release archive

- **Locations:** `packages/desktop-electron/src/main/custom-mac-updater.ts:407-457`, `packages/desktop-electron/src/main/custom-mac-updater.ts:476-486`
- **Trigger:** Normal macOS update check against Buddy's large ZIP artifact.
- **Expected:** Stream to a temporary file while incrementally hashing, then atomically promote the verified file.
- **Observed in discovery:** The updater retains all response chunks, copies chunks into Buffers, concatenates another complete archive, hashes that buffer, and later validates cached archives by reading the whole file again.
- **Impact:** Peak memory grows to multiple times artifact size in Electron's main process, risking severe pressure or OOM on constrained machines.
- **Verification pending:** Measure RSS/heap/external memory while downloading representative ARM64/x64 artifacts and compare with a streaming-file baseline.
- **First-pass confidence:** High on allocation behavior; failure threshold requires measurement.

### L05-C05 — P2 — Install failure leaves authoritative update state stuck at `installing`

- **Locations:** `packages/desktop-electron/src/main/index.ts:1223-1249`, `packages/web/src/lib/desktop-updates.ts:33-54`, `packages/web/src/components/settings/settings-updates.tsx:26-31`, `packages/web/src/components/settings/settings-updates.tsx:98`, `packages/web/src/components/settings/settings-updates.tsx:191-223`
- **Trigger:** Helper spawn, backend shutdown, or `quitAndInstall` fails after install starts.
- **Expected:** Main state transitions to `error` with stage `install` or back to `ready`, enabling retry.
- **Observed in discovery:** Main sets `installing` and has no error transition around platform installation. Renderer catches the IPC rejection and shows a toast, but the authoritative snapshot remains busy and disables update controls.
- **Impact:** The user cannot retry or change ring without restarting Buddy, and status contradicts the shown failure.
- **Verification pending:** Inject failures at each install step and assert an error progress event plus enabled retry controls.
- **First-pass confidence:** High.

### L05-C06 — P2 — Interrupted installer `running` state is ignored indefinitely

- **Locations:** `packages/desktop-electron/resources/mac-install-update.sh:154-162`, `packages/desktop-electron/src/main/index.ts:488-550`
- **Trigger:** Reboot, power loss, or process kill after the helper writes `running` but before its EXIT trap records success/failure.
- **Expected:** Next launch detects a stale attempt using time/PID ownership, reports it once, and offers recovery or manual reinstall.
- **Observed in discovery:** Every startup returns early for `status: "running"` without clearing, ageing, or reporting the marker.
- **Impact:** A genuinely interrupted update is silently forgotten forever, even when partial replacement requires user action.
- **Verification pending:** Seed a stale running result with no live helper and confirm current startup behavior over repeated launches.
- **First-pass confidence:** High.

### L05-C07 — P1/P2 — Standard release workflow cannot publish a non-empty recovery policy

- **Locations:** `packages/desktop-electron/scripts/finalize-recovery-policy.ts:38-54`, `.github/workflows/publish-shared.yml:3-44`, `.github/workflows/publish-shared.yml:764-773`
- **Trigger:** A promoted bad release requires a signed roll-forward target, block, or rollback policy.
- **Expected:** The supported release workflow accepts an reviewed recovery-policy input and publishes it through the signed artifact path.
- **Observed in discovery:** Finalization defaults to `badVersions: []`; the reusable workflow exposes and passes neither supported policy environment variable.
- **Impact:** Incident response cannot use the documented signed recovery mechanism through the normal release workflow and may require risky out-of-band asset replacement.
- **Verification pending:** Trace the documented incident procedure end-to-end in dry-run and determine whether any supported caller injects a non-empty policy.
- **First-pass confidence:** High on current workflow wiring; operational severity depends on the intended incident procedure.

### L05-C08 — P1 — Windows quits before asynchronous NSIS launch failure is knowable

- **Locations:** `packages/desktop-electron/src/main/index.ts:794-817`, `packages/desktop-electron/src/main/index.ts:1223-1249`, installed `electron-updater` `BaseUpdater.js:13-26` and `NsisUpdater.js:101-149`
- **Trigger:** The downloaded NSIS installer later fails to spawn, elevate, or survive antivirus handling after `quitAndInstall()` begins.
- **Expected:** Buddy observes a successful installer handoff before quitting, or records a durable failure that the next launch reports.
- **Observed in discovery:** Buddy registers download progress only, then invokes fire-and-forget `quitAndInstall`. The installed updater starts NSIS asynchronously and reports later failure after returning the value that causes app quit. Buddy has no updater error listener or Windows installer-result marker.
- **Impact:** Buddy disappears without installing the update; startup-recovery users remain on the broken version with no explanation.
- **Verification pending:** On Windows, inject spawn/elevation/AV failures after download and record app lifetime, updater events, installed version, and next-launch UI.
- **First-pass confidence:** High on control flow; Windows runtime reproduction pending.

### L05-C09 — P1/P2 — Backend shutdown has no terminal failure path during install

- **Locations:** `packages/desktop-electron/src/main/index.ts:684-690`, `packages/desktop-electron/src/main/index.ts:1241-1248`, `packages/desktop-electron/src/main/server.ts:146-173`, `packages/desktop-electron/src/main/server.ts:329-336`
- **Trigger:** Backend graceful stop and subsequent process-tree termination both fail or never yield an exit event, including Windows access-denied/antivirus cases.
- **Expected:** Install shutdown has a final deadline and either proceeds under a documented policy or restores retryable error state while retaining the child handle.
- **Observed in discovery:** `killBackendUtility` clears the only handle before awaiting `exit.promise`. Signal escalation schedules stronger kills, but no final timer rejects or resolves when the process never exits. Installation waits forever.
- **Impact:** Update state remains `installing`, the installer never starts, and retry cannot address the original utility through the cleared handle.
- **Verification pending:** Fault-inject failed tree-kill calls and a child that never emits exit; assert bounded failure, retained cleanup authority, and retryable UI.
- **First-pass confidence:** High on the missing terminal path; platform failure frequency pending.

## Verified bugs

Pending second-pass verification.

## Rejected after verification

None yet.

## Discovery coverage with no retained candidate

- Minisign verification, target-version checks, and signed Windows loopback-feed handoff.
- Normal update checks are serialized and ready updates are bound to their update ring.
- Recovery downgrade requires an explicit target and `rollbackSafe` policy.
- Terminal macOS installer failures are consumed and shown with their log path.

## Discovery candidate intentionally not promoted

- The verified macOS ZIP path can theoretically be replaced between main-process verification and helper extraction. This was not promoted because Buddy is explicitly single-user/single-machine and a same-user malicious process can already rewrite the installed application; the audit will revisit it only if the launch threat model includes hostile same-user processes.
