# Desktop Sidecar Vendor Migration Report

Date: 2026-03-21

## Assumption For This Report

This report assumes vendor/OpenCode is moving its desktop shell to Electron within 1-2 weeks, based on product input provided in Buddy discussion.

This report does not attempt to independently verify that statement. It uses that assumption as the migration target.

## Scope

This report compares:

- Buddy's current desktop runtime and sidecar packaging
- vendor/OpenCode's current Electron desktop runtime
- the migration work Buddy would need to complete to follow that Electron direction

It focuses on:

- desktop shell boot and process model
- sidecar launch shape
- plugin loading
- packaged runtime assets
- feature carryover from current Buddy desktop to a vendor-aligned Electron setup

This is based on code inspection and local runtime verification of the current Buddy implementation. It is not a full product-wide parity certification.

## Current Confirmed Findings

### 1. Buddy's current desktop runtime is Tauri plus a Buddy-owned JS sidecar runtime tree

Relevant files:

- `packages/desktop/src-tauri/src/lib.rs`
- `packages/desktop/scripts/predev.ts`
- `packages/desktop/scripts/utils.ts`
- `packages/buddy/script/build-compiled-binary.ts`

Observed behavior:

1. Buddy desktop launches a compiled sidecar binary.
2. That binary is invoked with `run <resources/backend/buddy-backend.js>`.
3. Buddy desktop therefore depends on a packaged backend resource tree under `packages/desktop/src-tauri/resources/backend`.

### 2. The system prompt plugin issue was caused by Buddy packaging, not OpenCode core plugin behavior

Relevant files:

- `packages/buddy/src/opencode-runtime/system-prompt-guard-plugin.ts`
- `packages/buddy/src/opencode-runtime/plugins/buddy-system-prompt-guard.ts`
- `packages/buddy/src/opencode-runtime/system-prompt-capture.ts`
- `packages/buddy/script/build-compiled-binary.ts`

Observed behavior:

1. Buddy injected a plugin URL into OpenCode config.
2. That plugin URL resolved relative to the packaged runtime module tree.
3. Desktop initially did not ship the plugin file and then still did not ship the plugin's imported support module.
4. The plugin therefore never loaded in the desktop sidecar runtime.

Result:

- the failure was in Buddy's runtime packaging/path coupling
- it was not a vendor/OpenCode prompt assembly bug

### 3. Vendor Electron runs the sidecar differently

Relevant files:

- `vendor/opencode/packages/desktop-electron/src/main/index.ts`
- `vendor/opencode/packages/desktop-electron/src/main/cli.ts`

Observed behavior:

1. Vendor Electron uses Electron main-process startup, not Tauri.
2. Vendor Electron spawns the compiled CLI binary directly.
3. Vendor Electron resolves the packaged sidecar binary from Electron resources, not through a `buddy-backend.js` runtime entrypoint.
4. Vendor Electron sets desktop-local state through Electron app paths such as `app.getPath("userData")`.

### 4. Not all current Buddy desktop features carry over unchanged

Confirmed answer:

No. All features that work in Buddy desktop today will not work unchanged in the vendor Electron model.

More precise answer:

1. OpenCode core sidecar boot has a vendor Electron equivalent.
2. Buddy's current Tauri shell does not carry over unchanged.
3. Buddy-specific runtime features that currently depend on Buddy's packaged JS runtime tree do not carry over unchanged.
4. Some backend features survive conceptually but require a different delivery path under Electron.

## Buddy Desktop Baseline

Relevant files:

- `packages/desktop/src-tauri/src/lib.rs`
- `packages/desktop/src/platform.ts`
- `packages/desktop/src/server.ts`
- `packages/desktop/scripts/predev.ts`
- `packages/desktop/scripts/utils.ts`
- `packages/buddy/script/build-compiled-binary.ts`

Observed properties:

1. Tauri is the current desktop shell.
2. Desktop integrations are implemented with Tauri APIs in `packages/desktop/src/platform.ts`.
3. The web app uses a desktop platform/server abstraction instead of depending directly on Tauri everywhere.
4. Sidecar startup depends on `buddy-backend.js` plus additional packaged backend resources.
5. Buddy currently copies backend runtime assets into `packages/desktop/src-tauri/resources/backend`.

Current packaged backend runtime examples:

- `resources/backend/buddy-backend.js`
- `resources/backend/plugins/buddy-system-prompt-guard.ts`
- `resources/backend/system-prompt-capture.ts`
- `resources/backend/skills/system/...`
- `resources/backend/node_modules/@parcel/watcher-...`
- `resources/backend/tree-sitter-*.wasm`

## Vendor Electron Baseline

Relevant files:

- `vendor/opencode/packages/desktop-electron/package.json`
- `vendor/opencode/packages/desktop-electron/src/main/index.ts`
- `vendor/opencode/packages/desktop-electron/src/main/cli.ts`
- `vendor/opencode/packages/desktop-electron/src/main/ipc.ts`
- `vendor/opencode/packages/desktop-electron/src/preload/index.ts`
- `vendor/opencode/packages/desktop-electron/src/main/migrate.ts`

Observed properties:

1. Electron main process owns app lifecycle.
2. Renderer communication is provided through preload and IPC.
3. The sidecar is a compiled CLI binary resolved from Electron resources.
4. Desktop-local app state is tied to Electron's user-data paths.
5. Vendor already includes shell-local migration code for Tauri-to-Electron data movement.

## Feature Carryover Matrix For A Vendor-Aligned Electron Move

| Feature / capability | Carries over unchanged | Migration work required |
| --- | --- | --- |
| OpenCode core sidecar boot / serve | Yes, conceptually | Switch Buddy desktop launcher to Electron main-process sidecar spawn. |
| Buddy web UI in `packages/web` | Largely yes | Keep the existing renderer app and reconnect it to Electron preload/platform APIs. |
| `packages/desktop/src/server.ts` server connection contract | Mostly yes | Recreate the initialization handshake from Electron instead of Tauri bindings. |
| Tauri shell boot | No | Replace `packages/desktop/src-tauri/**` with Electron main/preload/bootstrap. |
| Tauri platform implementation in `packages/desktop/src/platform.ts` | No | Reimplement the same contract on top of Electron IPC and Electron-native capabilities. |
| Buddy system prompt capture / filter plugin | No | Replace runtime-entrypoint-relative plugin delivery with an Electron-compatible delivery path. |
| Buddy bundled system skill bootstrap | No | Replace app-bundle-relative skill discovery with an Electron-compatible or managed-path source. |
| Watcher-backed file watching capability | Yes, conceptually | Use the vendor/Electron-compatible build/runtime delivery instead of Buddy's current Tauri resource-copy path. |
| Tree-sitter / parser assets | Yes, conceptually | Deliver these through the Electron sidecar/package path instead of the current Tauri backend resources layout. |
| Buddy database migration staging | No, not automatically | Preserve or redesign Buddy-owned migration resource staging under Electron packaging. |
| Desktop updater / relaunch / notifications / dialogs / shell-open / window controls | No | Port each integration from Tauri plugins to Electron main/preload APIs. |
| Current `buddy-backend.js` runtime entrypoint model | No | Remove or replace it as part of the Electron sidecar launch model. |

## Current Buddy Features That Depend On The Tauri Backend Resource Tree

### 1. Buddy System Prompt Capture / Filtering

Relevant files:

- `packages/buddy/src/opencode-runtime/system-prompt-guard-plugin.ts`
- `packages/buddy/src/opencode-runtime/plugins/buddy-system-prompt-guard.ts`
- `packages/buddy/src/opencode-runtime/system-prompt-capture.ts`
- `packages/buddy/src/learning/adapters/http/session/state-actions.ts`

Current dependency:

- runtime-relative plugin file
- runtime-relative capture support module

Effect on Electron migration:

- the feature stays valid
- the current Tauri packaging path does not
- Electron needs a new runtime delivery path for the same hook/capture behavior

### 2. Bundled Buddy System Skills

Relevant files:

- `packages/buddy/src/config/opencode/skills.ts`
- `packages/buddy/src/learning/skills/service/system-installer.ts`
- `packages/buddy/src/learning/skills/service/paths.ts`

Current dependency:

- Buddy searches for bundled skill roots relative to the current app/module layout

Effect on Electron migration:

- the skill capability stays valid
- the current packaged bundle-relative lookup path does not carry over unchanged

### 3. Watcher Native Binding Delivery

Relevant files:

- `packages/desktop/scripts/utils.ts`
- `vendor/opencode/packages/opencode/script/build.ts`

Current dependency:

- Buddy currently copies watcher bindings into the packaged backend resource tree

Effect on Electron migration:

- file watching remains required
- the current Tauri packaging path is not the target shape

### 4. Tree-Sitter / Parser Asset Delivery

Relevant files:

- `packages/desktop/src-tauri/resources/backend/tree-sitter-*.wasm`
- `vendor/opencode/packages/opencode/script/build.ts`

Current dependency:

- Buddy currently ships parser assets in Tauri backend resources

Effect on Electron migration:

- parsing capability remains required
- the current Tauri asset layout is not the target shape

### 5. Buddy Migration Resources

Relevant files:

- `packages/desktop/scripts/utils.ts`
- `packages/desktop/src-tauri/src/lib.rs`

Current dependency:

- desktop stages Buddy migrations into Tauri resources and passes migration paths into the backend process

Effect on Electron migration:

- this remains a Buddy-specific concern
- Electron still needs an explicit Buddy-owned migration resource path

## Electron Migration Work Required For Buddy

This section replaces the previous sidecar-convergence target list.

### 1. Replace The Desktop Shell

Required outcome:

- Buddy desktop boots from Electron main/preload instead of Tauri Rust entrypoints

Current Buddy ownership:

- `packages/desktop/src-tauri/**`
- `packages/desktop/src/platform.ts`

Vendor reference:

- `vendor/opencode/packages/desktop-electron/src/main/index.ts`
- `vendor/opencode/packages/desktop-electron/src/main/ipc.ts`
- `vendor/opencode/packages/desktop-electron/src/preload/index.ts`

### 2. Recreate Buddy's Desktop Platform Contract On Electron

Required outcome:

- the `Platform` contract currently fulfilled by Tauri is fulfilled by Electron without changing the web app's behavior

Current Buddy ownership:

- `packages/desktop/src/platform.ts`

Affected capability areas:

- fetch
- dialogs
- notifications
- relaunch
- shell open
- window controls
- local desktop storage

### 3. Replace Sidecar Launch And Initialization

Required outcome:

- Buddy desktop launches the backend through Electron's main process
- initialization still produces the server connection data consumed by the renderer

Current Buddy ownership:

- `packages/desktop/src-tauri/src/lib.rs`
- `packages/desktop/src/server.ts`

Vendor reference:

- `vendor/opencode/packages/desktop-electron/src/main/cli.ts`
- `vendor/opencode/packages/desktop-electron/src/main/index.ts`

### 4. Remove Dependency On `buddy-backend.js` Runtime Entrypoint Packaging

Required outcome:

- Buddy no longer depends on `resources/backend/buddy-backend.js` plus runtime-relative support files as the desktop launch contract

Current Buddy ownership:

- `packages/buddy/script/build-compiled-binary.ts`
- `packages/desktop/scripts/utils.ts`
- `packages/desktop/src-tauri/src/lib.rs`

### 5. Redesign Delivery Of Buddy-Owned Runtime Extensions

Required outcome:

- Buddy runtime extensions keep working without relying on the current Tauri backend resource tree

Current Buddy-owned extensions already confirmed:

- system prompt capture/filter plugin
- bundled system skill bootstrap

Current Buddy ownership:

- `packages/buddy/src/opencode-runtime/**`
- `packages/buddy/src/config/opencode/skills.ts`
- `packages/buddy/src/learning/skills/service/**`

### 6. Preserve Buddy Runtime State Paths Or Explicitly Migrate Them

Required outcome:

- Buddy runtime state, sessions, credentials, and migrations continue to resolve from stable Buddy-owned paths or receive an explicit migration path

Affected areas:

- Buddy runtime root
- XDG config/state/cache paths
- migration resource path
- desktop-local state store

Vendor reference:

- `vendor/opencode/packages/desktop-electron/src/main/migrate.ts`

### 7. Replace Tauri-Specific Build, Packaging, And Release Steps

Required outcome:

- desktop build/dev/release flow no longer depends on Tauri resource syncing or Tauri bundle output

Current Buddy ownership:

- `packages/desktop/scripts/predev.ts`
- `packages/desktop/scripts/utils.ts`
- `packages/desktop/scripts/local-release.ts`
- `packages/desktop/src-tauri/**`

Vendor reference:

- `vendor/opencode/packages/desktop-electron/package.json`

### 8. Add Packaged-Electron Verification For Buddy-Owned Runtime Features

Required outcome:

- packaged desktop verification proves Buddy-owned runtime features load correctly in Electron artifacts, not only in source builds

Minimum areas to verify:

- sidecar boot
- Buddy system prompt capture/filtering
- Buddy system skills bootstrap
- migration path wiring
- desktop-to-renderer initialization handshake

## Files Most Likely To Survive With Limited Change

- `packages/web/**`
- `packages/desktop/src/server.ts`
- Buddy backend runtime logic under `packages/buddy/src/**`
- Buddy prompt capture/read behavior itself under `packages/buddy/src/opencode-runtime/**`

## Files Most Likely To Be Replaced Or Heavily Reworked

- `packages/desktop/src-tauri/**`
- `packages/desktop/src/platform.ts`
- `packages/desktop/scripts/predev.ts`
- `packages/desktop/scripts/utils.ts`
- `packages/desktop/scripts/local-release.ts`
- Tauri-specific bindings generation and invocation paths
- the current `resources/backend/buddy-backend.js` packaging contract

## Files Examined

Vendor:

- `vendor/opencode/packages/opencode/script/build.ts`
- `vendor/opencode/packages/desktop/scripts/predev.ts`
- `vendor/opencode/packages/desktop/src-tauri/src/cli.rs`
- `vendor/opencode/packages/opencode/src/config/config.ts`
- `vendor/opencode/packages/opencode/src/plugin/index.ts`
- `vendor/opencode/packages/desktop-electron/package.json`
- `vendor/opencode/packages/desktop-electron/src/main/index.ts`
- `vendor/opencode/packages/desktop-electron/src/main/cli.ts`
- `vendor/opencode/packages/desktop-electron/src/main/ipc.ts`
- `vendor/opencode/packages/desktop-electron/src/preload/index.ts`
- `vendor/opencode/packages/desktop-electron/src/main/migrate.ts`

Buddy:

- `packages/buddy/script/build-compiled-binary.ts`
- `packages/buddy/script/build-single.ts`
- `packages/buddy/script/build-sidecar.ts`
- `packages/desktop/scripts/predev.ts`
- `packages/desktop/scripts/utils.ts`
- `packages/desktop/src-tauri/src/lib.rs`
- `packages/desktop/src/platform.ts`
- `packages/desktop/src/server.ts`
- `packages/buddy/src/opencode-runtime/system-prompt-guard-plugin.ts`
- `packages/buddy/src/opencode-runtime/plugins/buddy-system-prompt-guard.ts`
- `packages/buddy/src/opencode-runtime/system-prompt-capture.ts`
- `packages/buddy/src/config/opencode/overlay-builder.ts`
- `packages/buddy/src/config/opencode/skills.ts`
- `packages/buddy/src/learning/skills/service/system-installer.ts`
- `packages/buddy/src/learning/skills/service/paths.ts`
- `packages/buddy/src/learning/adapters/http/session/state-actions.ts`
