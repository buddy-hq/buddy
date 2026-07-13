# LAUNCH-02 — Electron renderer, preload, and native IPC authority

Audit date: 2026-07-13
Pass status: Discovery complete; verification pending
Baseline: Current workspace, evaluated as a clean release-candidate tree. Unrelated dirty-worktree changes were ignored.

This file records first-pass candidates. A candidate is not a final launch verdict until the verification pass either retains it under **Verified bugs** or moves it to **Rejected after verification**.

## Candidate bugs

### L02-C01 — P0/P1 — Model-authored raw HTML can navigate the privileged app window to a remote origin

- **Locations:** `packages/web/src/components/chat/parts/assistant-part/text-part.tsx:111`, `packages/web/src/components/markdown/markdown-parser.ts:452-463`, `packages/web/src/components/markdown/markdown-html-segment.tsx:57-62`, `packages/web/src/components/markdown/markdown-html-segment.tsx:410-412`, `packages/web/src/components/markdown/markdown-html-segment.tsx:612-626`, `packages/desktop-electron/src/renderer/index.tsx:149-159`, `packages/desktop-electron/src/main/windows.ts:106-153`, `packages/desktop-electron/src/preload/index.ts:78-181`
- **Trigger:** Assistant output contains a raw HTML HTTP(S) anchor without the renderer-added `external-link` class, and the user clicks it.
- **Expected:** Every external navigation is prevented in-app and opened through the OS browser; the privileged window remains on Buddy-owned content.
- **Observed in discovery:** Marked and DOMPurify retain the raw anchor. Both click handlers skip it, the BrowserWindow has no `will-navigate` or popup policy, and its preload exposes the full `window.api` bridge.
- **Impact:** Remote content can replace Buddy inside the privileged BrowserWindow and receive native IPC capabilities, including backend initialization data and filesystem/process-impacting operations.
- **Verification pending:** Exercise the link in a disposable packaged window, confirm final origin and preload availability, and test that a navigation guard blocks both same-window and popup paths.
- **First-pass confidence:** High.

### L02-C02 — P1 — Renderer-controlled store names escape Electron user data

- **Locations:** `packages/desktop-electron/src/preload/index.ts:98-103`, `packages/desktop-electron/src/main/ipc.ts:111-138`, `packages/desktop-electron/src/main/store.ts:4-11`
- **Trigger:** Renderer code supplies an absolute or parent-traversing `name` to a store IPC method.
- **Expected:** Store access is limited to a fixed allowlist of Buddy-owned namespaces below Electron `userData`.
- **Observed in discovery:** The name is forwarded to `electron-store` without validation. Its installed `conf` dependency resolves the name as a filesystem path, allowing absolute paths and `..` segments to escape the configured directory.
- **Impact:** A compromised renderer can enumerate, read, rewrite, delete, or clear arbitrary OS-user-readable JSON files. The remote-navigation candidate makes this directly reachable.
- **Verification pending:** Run a read-only Electron harness against a harmless JSON fixture outside `userData`, then add regression cases for absolute and traversing names.
- **First-pass confidence:** High.

### L02-C03 — P2 — Window ownership is a single stale pointer despite supporting New Window

- **Locations:** `packages/desktop-electron/src/main/menu.ts:61-65`, `packages/desktop-electron/src/main/index.ts:112`, `packages/desktop-electron/src/main/index.ts:215-235`, `packages/desktop-electron/src/main/index.ts:619-639`
- **Trigger:** Open **File → New Window**, focus the new window, close the original window, receive a deep link/update, or invoke a menu command.
- **Expected:** The app tracks all windows, routes focused-window commands to the sender/focused window, chooses a valid window for global events, and recreates a window after the last one closes when appropriate.
- **Observed in discovery:** New Window discards the returned BrowserWindow. Deep links, update progress, Reload, focus, and menu commands continue to address the original `mainWindow`; the pointer is not cleared on close and no activate/window-all-closed restoration policy is registered.
- **Impact:** Commands affect a hidden/background window, events disappear from the focused window, destroyed-webContents calls can throw, and a running app can become windowless and unrecoverable from a second launch or dock activation.
- **Verification pending:** Exercise two-window routing, close windows in both orders, send a deep link/update event, and relaunch the packaged app under the single-instance lock.
- **First-pass confidence:** High on routing mismatch; lifecycle consequences require packaged runtime confirmation.
- **Reassessment status:** Open. The hardening implementation was discarded.
- **Why reopened:** It introduced Buddy-specific window and deep-link registries even though vendored OpenCode's Electron desktop already owns window registration/restoration, last-focused routing, and deep-link buffering. Local unit tests did not justify a parallel lifecycle.
- **Later work:** Port or adapt the established flow in `vendor/opencode/packages/desktop/src/main/window-registry.ts`, `windows.ts`, and `index.ts`, then verify it in Buddy's packaged macOS and Windows apps. Do not design another independent registry.

## Verified bugs

Pending second-pass verification.

## Rejected after verification

None yet.

## Discovery coverage with no retained candidate

- Script/event-attribute sanitization itself; the retained Markdown issue is navigation, not direct DOM script execution.
- The sandboxed hidden PDF export window and PDF destination-path helper.
- `open-path` is recorded as impact amplification, not a standalone bug before verification.
- Exact-origin backend header injection did not show a separate cross-origin leak in this pass.
