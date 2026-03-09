# Desktop Plugin Audit

Current desktop plugin audit for Buddy, compared against vendored OpenCode.

## Used in Buddy

These plugins are installed and currently wired into Buddy's desktop runtime.

- `@tauri-apps/plugin-dialog`
  - Buddy usage:
    - Native directory picker via `platform.openDirectoryPickerDialog()`
  - Files:
    - `/Users/prashantbhudwal/Code/buddy/packages/desktop/src/platform.ts`
    - `/Users/prashantbhudwal/Code/buddy/packages/desktop/src-tauri/src/lib.rs`

- `@tauri-apps/plugin-http`
  - Buddy usage:
    - Desktop HTTP transport via `platform.fetch`
    - Used for authenticated fetch-based API and SSE requests
  - Files:
    - `/Users/prashantbhudwal/Code/buddy/packages/desktop/src/platform.ts`
    - `/Users/prashantbhudwal/Code/buddy/packages/desktop/src-tauri/src/lib.rs`

- `@tauri-apps/plugin-process`
  - Buddy usage:
    - App restart / relaunch via `platform.restart()`
  - Files:
    - `/Users/prashantbhudwal/Code/buddy/packages/desktop/src/platform.ts`
    - `/Users/prashantbhudwal/Code/buddy/packages/desktop/src-tauri/src/lib.rs`

- `@tauri-apps/plugin-store`
  - Buddy usage:
    - Persistent desktop storage for Zustand-backed UI state
    - Debounced writes with flush-on-hide/pagehide
  - Files:
    - `/Users/prashantbhudwal/Code/buddy/packages/desktop/src/platform.ts`
    - `/Users/prashantbhudwal/Code/buddy/packages/desktop/src-tauri/src/lib.rs`

- `@tauri-apps/plugin-shell`
  - Buddy usage:
    - External link opening via `platform.openLink()`
  - Files:
    - `/Users/prashantbhudwal/Code/buddy/packages/desktop/src/platform.ts`
    - `/Users/prashantbhudwal/Code/buddy/packages/desktop/src-tauri/src/lib.rs`

- `@tauri-apps/plugin-notification`
  - Buddy usage:
    - Desktop notification permission check/request
    - Notification display only when window is not focused
  - Files:
    - `/Users/prashantbhudwal/Code/buddy/packages/desktop/src/platform.ts`
    - `/Users/prashantbhudwal/Code/buddy/packages/desktop/src-tauri/src/lib.rs`

- `@tauri-apps/plugin-os`
  - Buddy usage:
    - Desktop OS detection exposed as `platform.os`
  - Files:
    - `/Users/prashantbhudwal/Code/buddy/packages/desktop/src/platform.ts`
    - `/Users/prashantbhudwal/Code/buddy/packages/desktop/src-tauri/src/lib.rs`

- `@tauri-apps/plugin-window-state`
  - Buddy usage:
    - Registered in the desktop host so window state can persist
  - Files:
    - `/Users/prashantbhudwal/Code/buddy/packages/desktop/src-tauri/src/lib.rs`

## Installed But Currently Unused in Buddy

These plugins are installed because they are part of the OpenCode desktop plugin set, but Buddy does not yet have the corresponding product feature wired.

- `@tauri-apps/plugin-clipboard-manager`
  - OpenCode usage:
    - Reads image data from the clipboard for pasted image attachments
  - Why unused in Buddy:
    - Buddy does not yet have pasted-image attachment handling in the prompt composer

- `@tauri-apps/plugin-deep-link`
  - OpenCode usage:
    - Handles custom protocol URLs at startup and while the app is running
  - Why unused in Buddy:
    - Buddy does not yet have a desktop deep-link protocol or a route/event consumer for it

- `@tauri-apps/plugin-opener`
  - OpenCode usage:
    - Opens local paths/files in native apps
    - Used for path opening flows and some menu actions
  - Why unused in Buddy:
    - Buddy does not yet have a real `platform.openPath()` feature wired in the UI

- `@tauri-apps/plugin-updater`
  - OpenCode usage:
    - Checks, downloads, and installs desktop app updates
  - Why unused in Buddy:
    - Buddy does not yet have a desktop updater flow or release/update wiring

## Vendor Reference

Vendored OpenCode files used for comparison:

- `/Users/prashantbhudwal/Code/buddy/vendor/opencode/packages/desktop/package.json`
- `/Users/prashantbhudwal/Code/buddy/vendor/opencode/packages/desktop/src/index.tsx`
- `/Users/prashantbhudwal/Code/buddy/vendor/opencode/packages/desktop/src-tauri/src/lib.rs`
- `/Users/prashantbhudwal/Code/buddy/vendor/opencode/packages/desktop/src-tauri/capabilities/default.json`

## Notes

- The earlier desktop bugs around migration paths, Windows sidecar lookup, and fetch-SSE abort handling were not caused by missing plugins.
- Those were implementation bugs in Buddy's desktop host and fetch path, not plugin selection issues.
