# Bench Toggle StrictMode Postmortem

## Flow

1. Manual click reached the right titlebar toggle.
2. React delivered pointer, mouse, and click events to the button.
3. The titlebar called the shell callback.
4. The shell called the workspace-root callback.
5. The workspace root called `workspace.controller.execute({ type: "reveal" })`.
6. The controller returned `inactive` before mutating workspace state.

## Root Cause

The workspace controller and lifecycle are long-lived objects created by `DirectoryWorkspaceProvider`.
In dev, React StrictMode runs effect cleanup and then re-runs effects for the same mounted tree.
The provider cleanup disposed the controller/lifecycle during that StrictMode replay.
The UI stayed mounted, but its callbacks now pointed at a disposed controller, so manual toggles and frontend Bench actions reached the right code path and still did nothing.

The client-action ledger had the same disposal pattern, so required `bench_present` actions could also lose frontend state during StrictMode replay.

## Secondary Failure

After the disposal fix, prompt send exposed a Bench context publish conflict.
Forced context flushes before prompt can publish the same semantic context more than once.
The frontend was using the semantic snapshot key as the backend idempotency key while also incrementing `publicationSequence`.
The backend correctly rejected the same idempotency key with a different sequence.

## Fix

- Deferred real disposal by one microtask and skipped it if the same mounted provider/ledger effect was replayed by StrictMode.
- Kept real unmount disposal intact.
- Made Bench context publish idempotency keys include semantic publication key, lease identity, and publication sequence.
- Added reusable opt-in diagnostics for the Bench toggle path:
  - enable file logging with `localStorage.setItem("buddy.diagnostic-log.enabled.bench-toggle", "true")`
  - enable console echo with `localStorage.setItem("buddy.diagnostic-log.console", "true")`

## Verification

- Dev Electron manual expand works.
- Dev Electron manual collapse works.
- Prompt send works after the idempotency fix.
- Regression coverage:
  - StrictMode replay does not leave the controller disposed.
  - Forced repeated context publishes use distinct backend idempotency keys.
