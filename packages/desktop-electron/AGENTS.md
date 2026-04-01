# Desktop Electron package notes

- Renderer should only call `window.api` from `src/preload`.
- Main process IPC handlers are centralized in `src/main/ipc.ts`.
