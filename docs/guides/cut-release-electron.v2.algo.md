# Buddy Electron Release Cut Algorithm (v2)

This is the canonical process to cut **Electron-only** Buddy desktop releases.

## Scope
- Release target: `@buddy/desktop-electron` only
- Legacy Tauri package: `packages/desktop` kept in repo, **not** part of publish flow
- Distribution channel: GitHub Releases
- Platforms: macOS (`arm64`, `x64`) and Windows (`x64`)
- Updater metadata: `latest*.yml` uploaded from Electron build outputs
- Advanced math runtime: attached as release assets and reused from prior stable release when inputs are unchanged

## Inputs
- Repo root: `/Users/prashantbhudwal/Code/buddy`
- Release branch: `main`
- GitHub repo: `prashantbhudwal/buddy`
- Workflow: [`.github/workflows/publish.yml`](/Users/prashantbhudwal/Code/buddy/.github/workflows/publish.yml)
- Release command: `bun run release:cut:electron`

## Rules
1. Stable releases are cut from `main` only.
2. Working tree must be clean before release.
3. Required gates must pass before dispatch: `bun fmt`, `bun lint`, `bun typecheck`.
4. Publish path is workflow-dispatch driven; no local stable tag workflow.
5. Tauri is excluded from publishing and version-sync scope.
6. GitHub Releases are the source of truth for Electron installers, updater metadata, and advanced math runtime assets.

## Preconditions
1. Validate local git state.
   - `git branch --show-current` must be `main`
   - `git status --short` must be empty
2. Ensure GitHub CLI auth works.
   - `gh auth status`
3. Ensure release content is ready.
   - Electron dev flow works: `bun run dev:desktop:electron`
   - Electron installable build works: `bun run build:installable:electron`
   - Session persistence and message streaming are verified manually
   - Advanced math runtime can be restored from cache or built fresh as needed
4. Optional signing/notarization secrets (workflow continues without them):
   - `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
   - `CSC_LINK`, `CSC_KEY_PASSWORD`
   - `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`

## Preferred Flow (Electron v2)
1. Run `bun run release:cut:electron` from repo root.
2. In the wizard:
   - sync local `main` with `origin/main`
   - choose `patch`, `minor`, `major`, or custom semantic version
   - edit draft release title and notes
3. Confirm dispatch; wizard runs required gates and starts `publish.yml` via `workflow_dispatch`.
4. Watch workflow to completion.
5. Verify artifacts on the resulting release:
   - macOS: `.dmg`, `.zip`, `.blockmap`
   - Windows: `.exe`, `.blockmap`
   - updater metadata: `latest*.yml`
   - advanced math runtime zips/checksums for both macOS targets
6. Confirm publish job completed and release is no longer draft.
7. Pull the auto-generated version-sync commit to local `main` when prompted.
   - The wizard force-syncs local tags from `origin` first, so stale local release tags do not block the pull with a clobber prompt.

## Workflow Jobs (Expected)
1. `version`: compute/validate release version and draft release.
2. `build-sidecar`: build release sidecar artifacts.
3. `build-electron`: build/package Electron installers for macOS + Windows.
4. `upload-electron-release`: upload Electron artifacts + finalized updater YAML.
5. `build-advanced-math`: restore or rebuild advanced math runtime assets, then upload.
6. `publish`: finalize release and sync workspace versions back to `main`.

## Stop Conditions
Stop and fix before retry if any occur:
- dirty working tree
- not on `main`
- failed `gh auth status`
- failed `bun fmt`, `bun lint`, or `bun typecheck`
- missing Electron artifacts in release upload step
- missing `latest*.yml` in release
- advanced math runtime missing for required targets
- `main` advanced during workflow before version-sync commit

## Recovery
1. If release is still draft with wrong assets:
   - fix on `main`
   - rerun `publish.yml` with same `version`
2. If workflow failed after draft creation:
   - fix root cause
   - rerun with the same `version` so existing draft is reused
3. If local branch is behind after publish:
   - `git pull --rebase origin main`

## Notes
- `bun run release:cut` and `bun run release:cut:electron` currently execute the same Electron release wizard.
- `bun run release:tag` remains a compatibility alias; stable tags should still be created by GitHub publish flow.
- Tauri code remains in repo for transition only and is intentionally not part of release publishing.
