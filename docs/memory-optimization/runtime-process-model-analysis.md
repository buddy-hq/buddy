# Runtime Process Model Analysis

**Created:** Tue Jun 23 2026
**Purpose:** Ground the question of whether Buddy can run its backend more like the vendored desktop app, without changing provider/runtime semantics.

## Current Buddy Process Model

Buddy Desktop currently starts a separate backend sidecar process from Electron main.

Code path:

- `packages/desktop-electron/src/main/index.ts` calls `spawnLocalServer(hostname, port, password)` during app initialization.
- `packages/desktop-electron/src/main/server.ts` implements `spawnLocalServer()` and waits for `/api/health`.
- `packages/desktop-electron/src/main/server.ts` delegates process launch to `serve()`.
- `packages/desktop-electron/src/main/cli.ts` implements `serve()`.

In packaged mode, `serve()` uses:

```text
command = getSidecarPath()
args = ["run", bundledBackendEntrypoint, "serve", "--hostname", hostname, "--port", port]
```

That means packaged Buddy runs:

```text
Electron main
  -> resources/buddy-backend.exe
  -> run resources/backend/buddy-backend.js serve --hostname ... --port ...
  -> Hono backend
```

Relevant files:

- `packages/desktop-electron/src/main/constants.ts`
  - Defines `SIDECAR_BINARY_NAME = "buddy-backend"`.
- `packages/desktop-electron/src/main/cli.ts`
  - `getSidecarPath()` resolves the packaged binary from Electron resources.
  - `getBundledBackendEntrypointPath()` resolves `resources/backend/buddy-backend.js`.
  - `serve()` chooses `getSidecarPath()` in packaged mode and passes the bundled backend JS entrypoint as an argument.
- `packages/desktop-electron/scripts/prepare.ts`
  - Copies the built sidecar binary into resources.
  - Copies backend runtime resources into `resources/backend`.
- `packages/buddy/script/build-compiled-binary.ts`
  - Builds the bundled backend JS.
  - Compiles the Bun executable with `Bun.build({ compile: { outfile } })`.

## Important Seam

Buddy already separates:

- the backend JavaScript entrypoint: `resources/backend/buddy-backend.js`
- the runner executable: `resources/buddy-backend.exe`
- the Electron lifecycle and health-check wrapper

So the process model is not hard-wired into backend behavior. The runner is currently Bun-compiled, but the backend server is still a JS entrypoint that can theoretically be run by another process model.

## Feasibility

Based on the current code, Buddy can likely test a vendor-like runtime process model without losing functionality, because the Electron main process already provides all required runtime inputs through environment variables and arguments.

Functionality that must be preserved:

- same `PORT`
- same `BUDDY_SERVER_USERNAME` and `BUDDY_SERVER_PASSWORD`
- same `OPENCODE_SERVER_USERNAME` and `OPENCODE_SERVER_PASSWORD`
- same `BUDDY_RUNTIME_ROOT`
- same `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME`
- same `BUDDY_MIGRATION_DIR`
- same bundled backend resources
- same stdout parsing for sqlite migration progress
- same kill/lifecycle behavior from Electron main
- same `/api/health` readiness check

If those are preserved, changing only the runner should not require changing provider/auth/model semantics.

## Low-Risk Experiment

Add an experimental runner switch in `packages/desktop-electron/src/main/cli.ts`, guarded by an env var such as:

```text
BUDDY_BACKEND_RUNNER=bun-compiled | node | electron-utility
```

Experiment A:

```text
Electron main
  -> node resources/backend/buddy-backend.js serve --hostname ... --port ...
```

Experiment B:

```text
Electron main
  -> Electron utility process
  -> resources/backend/buddy-backend.js serve --hostname ... --port ...
```

Then run the existing memory script or an equivalent desktop-launched measurement against the same endpoints:

- `/api/healthz`
- `/api/health`
- `/api/provider`
- passive app/settings route set

Compare against current compiled sidecar measurements in `docs/memory-optimization/log/`.

## Expected Signal

If health-only memory drops materially when the same backend JS runs under Node/Electron utility rather than the compiled Bun sidecar, the remaining memory issue is significantly process-model related.

If health-only memory stays near the current compiled sidecar floor, the main remaining issue is still eager Buddy import graph and route loading.

## Caveats

- The current measurement script measures `buddy-backend.exe`, not an Electron utility process. It will need either a runner option or a sibling measurement script for a Node/Electron utility experiment.
- Comparing vendor OpenCode numbers directly to Buddy is imperfect because Buddy has more product routes and services.
- The clean comparison is same Buddy backend JS, same environment, different runner.
- Do not mix this experiment with provider/auth implementation changes. Process-model measurement should be isolated.
