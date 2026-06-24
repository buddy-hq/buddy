# Node Utility Backend Cleanup

Created: 2026-06-24 04:04 IST

This document tracks production-hardening cleanup for the Node utility backend foundation. Memory optimization work is intentionally out of scope here except where a vendor-faithful or production-grade foundation directly affects startup, packaging, or runtime correctness.

## Current Read

The main architecture direction is sound:

- Electron Vite builds a thin `backend-utility.js` launcher.
- The backend/vendor graph is loaded from the built Buddy Node backend artifact at runtime.
- Buddy keeps its Hono API surface and calls OpenCode in-process through the adapter/vendor server app.
- The desktop main bundle no longer statically imports `@buddy/backend`, vendored OpenCode, `#sqlite`, or backend source.

The foundation is close, but not production-complete. The remaining concerns are mostly Electron-host smoke coverage and artifact relocatability.

## Verified Cleanup Items

### P1: CI Must Exercise the Production Host Path

Status: partially fixed

The current `smoke-node-backend` CI job runs on Linux and starts the artifact with system `node`. That validates the built Node artifact, but it does not validate:

- macOS artifact execution: fixed by staged artifact smoke in macOS package jobs
- Windows artifact execution: fixed by staged artifact smoke in the Windows package job
- target-native `node-pty` under runtime, not just file presence
- Electron `utilityProcess.fork`
- Electron’s embedded Node runtime and Electron-specific `http`/`tls` behavior

Fix direction:

- Add a desktop/Electron utility integration smoke that forks `out/main/backend-utility.js`, sends the `start` message, polls `/api/healthz` and `/api/health`, sends `stop`, and asserts clean shutdown.

### P1: Guard `node:sqlite` Availability in the Utility Runtime

Status: fixed

The backend uses `node:sqlite` in both Buddy’s Node SQLite wrapper and vendored OpenCode’s Node SQLite path. Local Electron 40 dev worked, but the utility process currently does not assert that `node:sqlite` is available before importing the backend artifact.

Resolution:

- `backend-utility.ts` now probes `node:sqlite` and `DatabaseSync` before importing the backend artifact.
- If the embedded Electron runtime cannot provide it, startup fails through the utility error message instead of failing later inside the backend graph.

### P1: Smoke the Node Artifact Before Packaging

Status: fixed

`prebuild.ts` and `predev.ts` build/stage the Node artifact, but `smoke:node` is only run in the Linux CI smoke job.

Resolution:

- `prebuild.ts` now runs `bun run --cwd ../buddy smoke:node` after `build:node`.
- macOS and Windows package jobs now smoke the staged `resources/backend-node/node.js` artifact after `prepare:release`.
- Consider leaving `predev.ts` lighter, because launching desktop dev already exercises the utility/backend path.

### P1: Make the Node Artifact Relocatable

Status: open

The built `packages/buddy/dist/node/node.js` contains absolute monorepo paths in runtime code, not only in the sourcemap. Verified examples include paths under:

- `node_modules/.bun/node-gyp`
- `node_modules/.bun/@npmcli+run-script`
- `node_modules/.bun/@npmcli+arborist`
- `node_modules/.bun/thread-stream`
- `node_modules/.bun/pino`
- `node_modules/.bun/@aws-sdk+core`

Why this matters:

- Packaged user machines will not have the developer monorepo path.
- Some paths may be dormant during basic startup, but plugin/npm install paths, logging worker paths, native build paths, or provider-specific CJS paths can fail later.

Fix direction:

- Add an artifact relocation audit that fails if `dist/node/node.js` contains repo absolute paths.
- Either externalize and copy the offending CJS packages into `dist/node/node_modules`, or move further toward a native Node artifact layout with packaged `node_modules` instead of bundling those modules into one file.
- Keep the relocated temporary-directory health smoke. It now passes, but absolute repo paths are still present in bundled runtime code and must be removed before this item is closed.

## Additional Reviewer Findings

### P2: Do Not Report the Disabled CLI Stub as Installed

Status: fixed

`packages/desktop-electron/src/main/cli.ts` currently installs a `buddy` script that always exits with status 1, but still resolves successfully with the destination path. The renderer can therefore tell users `CLI available at ...` for a command that is intentionally nonfunctional.

Resolution:

- `installCli()` now rejects with a clear unsupported message instead of writing a broken binary.
- The macOS menu item is disabled while no working Node-backed CLI exists.
- The menu click path catches and logs installer failures instead of creating an unhandled rejection.

### P2: Preserve Backend Process-Tree Shutdown

Status: fixed

The utility backend shutdown path sends a `stop` message and later kills only the utility process. `backend-utility.stop()` closes the HTTP listener and exits, but PTY shells or tool subprocesses created by the backend can survive app quit/restart. The old sidecar shutdown path used a process-tree kill.

Resolution:

- `CommandChild.kill()` now performs process-tree termination through `tree-kill`.
- The timeout fallback escalates the same tree to `SIGKILL` if it has not exited.
- Startup failure, relaunch, update install, IPC shutdown, and custom mac update install can now await the utility exit promise.
- The old POSIX-only negative-PID signal from `index.ts` was removed.

### P3: Make Git Timeout Force-Kill Effective

Status: fixed

`packages/buddy/src/learning/skill-management/service/github-fetcher.ts` checks `child.killed` before sending `SIGKILL`. In Node, `child.killed` becomes true as soon as `kill()` successfully sends the first signal, not when the process exits, so the grace timer never force-kills a stuck git process.

Resolution:

- Git process termination now tracks `close` separately.
- The grace timer sends `SIGKILL` when the child has not closed.

### P1: Package the Vendor File Watcher Native Binding

Status: fixed

`cli.ts` enables `OPENCODE_EXPERIMENTAL_FILEWATCHER=true`, while vendored watcher code dynamically requires `@parcel/watcher-${platform}-${arch}`. The Node artifact previously copied `jsonc-parser` and node-pty packages only.

Resolution:

- `build-node.ts` now copies the platform `@parcel/watcher-*` binding package beside the backend artifact.
- `smoke:node` now asserts the binding package is present and can be loaded by Node from the artifact directory.

### P1: Package Chonkie WASM Runtime Asset

Status: fixed

Resource chunking uses Chonkie’s recursive chunker. The built artifact references `pkg/chonkiejs_chunk_bg.wasm` relative to `node.js`, but the file was not copied into `backend-node`.

Resolution:

- `build-node.ts` now copies `chonkiejs_chunk_bg.wasm` into `dist/node/pkg/`.
- `smoke:node` now fails if the artifact is missing the WASM.

### P2: Backend Shutdown Force-Closes Active HTTP Connections

Status: partially fixed

Buddy’s Hono listener previously only called `server.close()`, which can wait indefinitely on active HTTP connections. Vendor `Server.listen()` has a force-close lifecycle for active HTTP/WebSocket connections.

Resolution:

- `listenNodeServer().stop(true)` now calls `server.closeAllConnections()` around `server.close()`.
- `backend-utility.ts` calls `listener.stop(true)` before exiting on a stop command.
- Direct Node CLI signal shutdown now calls `stop(true)` as well.
- An import-style smoke confirmed `listener.stop(true)` resolves, but the imported process still has remaining runtime handles afterward. Production utility shutdown still exits the process explicitly, so this is not a utility hang, but full vendor-style runtime disposal is not proven.

Remaining work:

- Decide whether Buddy needs an explicit adapter/runtime disposal hook beyond process exit.
- Add an Electron utility integration smoke that proves stop/relaunch behavior through the actual production host.

### P2: Cover Lazy Packaged Runtime Dependencies in Smoke

Status: partially fixed

The prior `smoke:node` only probed `/api/healthz` and `/api/health`, so missing lazy assets such as watcher bindings and Chonkie WASM survived health checks.

Resolution:

- `smoke:node` now checks Chonkie WASM presence.
- `smoke:node` now loads the platform watcher binding through Node from the artifact directory.
- A relocated temporary-directory artifact smoke now passes.

Remaining work:

- Add a minimal packaged resource-prep smoke so resource chunking is exercised through the public resource-pack path, not just by checking the WASM file.

### P3: Make Direct Entrypoint Detection Realpath-Safe

Status: fixed

`isEntrypoint()` compared resolved paths directly. On macOS temp copies, `/var` and `/private/var` can refer to the same file with different string paths, causing the CLI smoke to exit without serving.

Resolution:

- `isEntrypoint()` now compares realpaths and falls back to resolved paths if realpath lookup fails.
- Relocated temporary-directory smoke passed.

### P3: Remove Stale SQLite Migration Progress Wait

Status: fixed

Desktop startup waited for `sqlite-migration:` stdout events, but the current Node backend does not emit that prefix.

Resolution:

- Backend stdout/stderr are now treated as logs only.
- Desktop initialization no longer waits for SQLite progress events or logs a missing progress signal.
- The preload event API is left in place for compatibility, but no current main-process path emits it.

### P2: Guard Local Cross-Target Packaging

Status: fixed

Local `package:mac` and `package:win` commands could package whatever stale `resources/backend-node` artifact happened to exist. The Node artifact contains platform-specific native packages, so a mac-built artifact could be copied into a Windows package if the local resource directory was stale.

Resolution:

- Added a shared backend-node artifact validator for required runtime files and native packages.
- Added a desktop packaging preflight script that validates `resources/backend-node` before `electron-builder`.
- Local package scripts now fail when the requested package target does not match the host platform/arch.
- CI package jobs use the same validator for macOS arm64, macOS x64, and Windows x64 staged artifacts.

### P2: Isolate the Node Artifact Smoke From Repo `node_modules`

Status: fixed

The smoke harness previously ran the artifact in place under the monorepo. Node resolution could climb from `dist/node` or `resources/backend-node` to repo-root `node_modules`, masking missing copied externals.

Resolution:

- `smoke:node` now copies the complete artifact to a temporary directory outside the repo before launch.
- The smoke environment clears `NODE_PATH`.
- Runtime asset validation checks required native packages and WASM inside the copied artifact.
- The watcher native binding probe asserts the resolved module entrypoint lives under the copied artifact directory.

### P3: Avoid Duplicate Runtime Resources in Packaged Apps

Status: fixed

Electron Builder included `resources/**/*` in `files` and also copied the same runtime resources through `extraResources`. Runtime lookup uses `process.resourcesPath`, so the app bundle copy was redundant.

Resolution:

- Electron Builder `files` now includes only `out/**/*`.
- Runtime resources remain under `extraResources`, which is the path used by packaged runtime lookup.

### P3: Remove Active Sidecar Naming From Electron/Web Runtime API

Status: fixed

The utility backend still exposed active APIs named `killSidecar`, `"kill-sidecar"`, and `isSidecar`. That made the new utility-process architecture harder to reason about.

Resolution:

- Preload API renamed to `killBackendUtility`.
- IPC channel renamed to `"kill-backend-utility"`.
- Server ready/runtime connection state renamed from `isSidecar` to `isEmbeddedBackend`.
- Renderer and web resource URL handling were updated to the new field name while preserving behavior.

## Resolution Plan

After the current findings are fixed:

1. Deduplicate overlapping findings as new reviews arrive.
2. Sort by production risk: startup failure, packaged failure, release/CI blind spot, then cleanup.
3. Fix in cohesive passes, keeping the Electron/backend boundary intact.
4. Verify with:
   - `bun run --cwd packages/buddy build:node`
   - `bun run --cwd packages/buddy smoke:node`
   - relocated artifact smoke
   - Electron utility integration smoke
   - `bun run --cwd packages/desktop-electron build`
   - `bun run --cwd packages/desktop-electron dev`
   - touched package tests
   - root `bun lint`
   - root `bun typecheck`

## Foundation Done Criteria

The Node foundation is complete when:

- Electron Vite still bundles only the launcher/main/preload, not the backend/vendor graph.
- The built backend artifact can run from a relocated directory.
- The artifact has no developer-machine absolute paths in runtime code.
- CI executes the built artifact on each release target OS/architecture.
- CI or a local smoke executes the Electron utility-process host path.
- Startup errors for missing runtime capabilities, especially `node:sqlite`, are explicit.
- Desktop dev and build paths both stage and validate the runtime resources before use.
