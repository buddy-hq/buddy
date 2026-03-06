# Desktop Sidecar Runtime Parity Log (2026-03-05)

## Context
- Problem observed in Buddy desktop sidecar path: PKCE plugin resolution failure (`@openauthjs/openauth/pkce`) in compiled runtime mode.
- User requirement: do not "patch around" vendor behavior; align Buddy runtime execution with OpenCode behavior.

## Root Cause Summary
- This was not a missing-file issue in vendor.
- Sidecar binary execution mode differed from OpenCode's runtime expectations:
  - Failing mode: executing compiled app runtime directly.
  - Working mode: Bun runtime mode (`BUN_BE_BUN=1`) executing bundled JS entrypoint.
- The mismatch caused module resolution behavior differences in compiled sidecar runtime.

## What Was Changed

### 1) Backend sidecar build now emits two outputs
- File: `packages/buddy/script/build-compiled-binary.ts`
- Added optional `bundleOutputFile`.
- Build now produces:
  - compiled sidecar binary (`compile.outfile`) and
  - Bun runtime bundle entry (`target: "bun"`, `format: "esm"`).
- Both outputs use the same migration `define` values.

- File: `packages/buddy/script/build-single.ts`
  - Now requests runtime bundle output at `dist/desktop-sidecar/app/index.js`.

- File: `packages/buddy/script/build-sidecar.ts`
  - Release sidecar artifacts now also include runtime bundle at:
    - `dist/release-sidecars/<sidecarDir>/app/index.js`

### 2) Desktop prep scripts now stage runtime resources
- File: `packages/desktop/scripts/utils.ts`
  - Added `syncBackendRuntimeResources(sourceDir, target)`.
  - Copies runtime bundle directory into `src-tauri/resources/backend`.
  - Copies `index.js` -> `buddy-backend.js` (stable entrypoint name).
  - Installs/copies target-specific `@parcel/watcher-*` binding into bundled backend resources:
    - prefers workspace source from vendor node_modules
    - falls back to temp `bun add --os --cpu` install.

- File: `packages/desktop/scripts/predev.ts`
  - Calls `syncBackendRuntimeResources(...)` after sidecar build.

- File: `packages/desktop/scripts/prepare.ts`
  - Calls `syncBackendRuntimeResources(...)` from release artifact directory.

### 3) Desktop runtime launch now mirrors OpenCode mode
- File: `packages/desktop/src-tauri/src/lib.rs`
  - Added bundled entrypoint lookup (`backend/buddy-backend.js`).
  - Sidecar spawn changed to:
    - `buddy-backend run <entrypoint>`
    - env: `BUN_BE_BUN=1`.
  - This removed the temporary plugin-disable workaround path.

### 4) Tauri resources updated
- File: `packages/desktop/src-tauri/tauri.conf.json`
  - Added `"resources/backend"` to bundle resources.

## Validation Performed
- `bun run build:desktop` -> passed.
- `bun run build:installable` -> passed.
- `bun run --cwd packages/buddy build:release-sidecar --target x86_64-pc-windows-msvc` -> passed.
- `BUDDY_VERSION=... BUDDY_RUST_TARGET=x86_64-pc-windows-msvc BUDDY_SIDECAR_ARTIFACT_DIR=... bun run --cwd packages/desktop prepare:release` -> passed.
- Manual smoke run in Bun-mode sidecar showed plugin load success for `opencode-anthropic-auth` and no PKCE resolution error.

## Gotchas For Future Agents

1. Runtime entrypoint is now required for desktop sidecar startup.
- Do not assume sidecar binary alone is sufficient.
- Required resource file: `packages/desktop/src-tauri/resources/backend/buddy-backend.js`.

2. Do not bypass prep scripts.
- `predev` and `prepare:release` stage both:
  - sidecar binary and
  - backend runtime resources.
- Running Tauri build/dev without these may fail at runtime entrypoint lookup.

3. Keep Tauri resources list aligned.
- If `resources/backend` is removed from `tauri.conf.json`, packaged app will fail to locate backend entrypoint.

4. Watcher binding is target-specific.
- `syncBackendRuntimeResources` installs/copies `@parcel/watcher-*` for the selected target.
- If target mapping changes, update `WATCHER_BINDING_BY_TARGET` in `packages/desktop/scripts/utils.ts`.

5. Release script ordering matters.
- `prepare:release` expects sidecar artifact directory to exist first.
- Running prepare before release-sidecar build will fail.

6. Working tree hygiene.
- `packages/desktop/src-tauri/resources/backend/*` and `packages/desktop/src-tauri/sidecars/*` are build-staged and can show up as untracked in local runs depending on gitignore coverage.
- Validate ignore rules before committing to avoid noisy diffs.

## Parity Decision
- Desktop sidecar should continue using Bun runtime execution mode for backend startup unless OpenCode upstream execution model changes.
- If upstream changes, re-verify by reproducing with:
  - compiled direct mode vs
  - `BUN_BE_BUN=1` + `run <entrypoint>`
  before altering launch strategy.
