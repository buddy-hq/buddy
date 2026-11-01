# Desktop Electron package notes

- Renderer should only call `window.api` from `src/preload`.
- Main process IPC handlers are centralized in `src/main/ipc.ts`.

- Packaged backend: launch the host-native Bun-compiled `resources/buddy-backend` (`.exe` on Windows) with `serve`. Development launches `packages/buddy/src/index.ts` with Bun and the branding preload; source changes restart it without a Node build.
- Backend lifecycle belongs to Electron: pipe stdin, set `BUDDY_EXIT_WITH_PARENT=1`, and await child `close` on shutdown. Keep both macOS and Windows process-tree cleanup.
- Build with `build:backend`; verify isolated `smoke:backend` and signed `smoke:packaged-backend`. All runtime tests must isolate HOME, XDG, Buddy, and notebook roots.
- Process model and memory tradeoff: [Bun sidecar ADR](../../docs/architecture/decisions/bun-sidecar-backend.md).
