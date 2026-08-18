# Buddy Electron Release Cut Algorithm (v2)

This is the canonical process to cut **Electron-only** Buddy desktop releases.

## Scope
- Release target: `@buddy/desktop-electron` only
- Legacy Tauri package: `packages/desktop` kept in repo, **not** part of publish flow
- Distribution channel: GitHub Releases Preview candidate, then Stable promotion
- Platforms: macOS (`arm64`, `x64`) and Windows (`x64`)
- Updater metadata:
  - Windows: `latest.yml`
  - macOS native Electron metadata: `latest-mac.yml`
  - macOS Buddy-managed updater metadata: `latest-mac.json` and `latest-mac.json.sig`
- Advanced math runtime: attached as release assets and reused from prior stable release when inputs are unchanged

## Inputs
- Repo root: `/Users/prashantbhudwal/Code/buddy`
- Release branch: `main`
- GitHub repo: `buddy-hq/buddy`
- Workflow: [`.github/workflows/publish.yml`](/Users/prashantbhudwal/Code/buddy/.github/workflows/publish.yml)
- Preview candidate command: `bun run release:cut:electron`
- Stable promotion command: `bun run release:promote vX.Y.Z`

## Rules
1. Preview candidates are cut from `main` only.
2. Working tree must be clean before release.
3. Required gates must pass before dispatch: `bun fmt`, `bun lint`, `bun typecheck`.
4. Publish path is workflow-dispatch driven; no local stable tag workflow.
5. Tauri is excluded from publishing and version-sync scope.
6. GitHub Releases are the source of truth for Electron installers, updater metadata, and advanced math runtime assets.
7. macOS unsigned auto-update does not use ShipIt. It uses Buddy-managed `latest-mac.json` metadata signed with the Tauri updater keypair.
8. `release:cut` publishes a GitHub prerelease. Stable/latest changes only when `release:promote` succeeds.

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
4. Required updater signing secret for macOS Buddy-managed updates:
   - `TAURI_SIGNING_PRIVATE_KEY`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` when the key is encrypted
   - The local gate accepts the same environment variables or
     `~/.config/buddy/tauri-updater.key` plus the optional
     `~/.config/buddy/tauri-updater.key.password`.
5. Optional platform signing/notarization secrets:
   - `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
   - `CSC_LINK`, `CSC_KEY_PASSWORD`
   - `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`

## Preferred Flow (Electron v2)
1. Run `bun run release:cut:electron` from repo root.
2. In the wizard:
   - sync local `main` with `origin/main`
   - choose `patch`, `minor`, `major`, or custom semantic version
   - edit draft release title and notes
3. Confirm dispatch; the wizard runs required repository gates.
4. The wizard builds a dev-channel installable for the native host platform.
   - macOS installs and launches `/Applications/Buddy Dev.app`.
   - Windows installs and launches Buddy Dev from an isolated temporary directory.
   - The wizard rejects an artifact carrying the production Buddy name or application identity.
5. Spot-check the installed Buddy Dev application, then approve or abort in the terminal.
   - Approval closes and removes the temporary Buddy Dev installation.
   - An existing macOS Buddy Dev installation is restored.
   - Production Buddy remains installed at its previous version for updater validation.
6. The wizard builds the native production release target from a detached temporary worktree and dry-runs its signed target updater manifest.
7. Only after both local gates pass, the wizard creates or updates the draft release and dispatches `publish-cheap.yml`.
8. Watch the workflow to completion.
9. Verify artifacts on the resulting release:
   - macOS: `.dmg`, `.zip`, `.blockmap`
   - Windows: `.exe`, `.blockmap`
   - updater metadata:
     - `latest.yml`
     - `latest-mac.yml`
     - `latest-mac.json`
     - `latest-mac.json.sig`
   - advanced math runtime zips/checksums for both macOS targets
10. Confirm the publish job completed and the release is a published prerelease:
    - `isDraft=false`
    - `isPrerelease=true`
11. From the preserved production Buddy installation, open Settings → Updates, select Preview, check for updates, and verify download progress, installation, and restart into the new version.
12. After manual soak/approval, promote the same assets to Stable:
    - `bun run release:promote vX.Y.Z`
    - The script verifies release state and asset inventory, then flips GitHub release metadata to stable/latest.
13. Pull the auto-generated version-sync commit to local `main` when prompted.
   - The wizard force-syncs local tags from `origin` first, so stale local release tags do not block the pull with a clobber prompt.

## Workflow Jobs (Expected)
1. `version`: compute/validate release version and draft release.
2. `build-sidecar`: build release sidecar artifacts.
3. `build-electron`: build/package Electron installers for macOS + Windows.
4. `upload-electron-release`: upload Electron artifacts + finalized updater YAML + signed `latest-mac.json`.
5. `build-advanced-math`: restore or rebuild advanced math runtime assets, then upload.
6. `publish`: finalize the Preview prerelease candidate and sync workspace versions back to `main`.

## Stop Conditions
Stop and fix before retry if any occur:
- dirty working tree
- not on `main`
- failed `gh auth status`
- failed `bun fmt`, `bun lint`, or `bun typecheck`
- Buddy Dev installable fails to build, install, launch, or receive manual approval
- native production release smoke or signed target-manifest dry run fails
- missing Electron artifacts in release upload step
- missing updater metadata in release (`latest.yml`, `latest-mac.yml`, `latest-mac.json`, `latest-mac.json.sig`)
- published release is not marked as a prerelease before Stable promotion
- `release:promote` asset verification fails
- advanced math runtime missing for required targets
- `main` advanced during workflow before version-sync commit

## Recovery
1. If release is still draft with wrong assets:
   - fix on `main`
   - rerun `publish.yml` with same `version`
2. If workflow failed after draft creation:
   - fix root cause
   - rerun with the same `version` so existing draft is reused
3. If a Preview candidate is bad after publication:
   - leave it as prerelease or mark it draft
   - cut a newer candidate from fixed `main`
   - after a newer fixed version is promoted, Stable users skip the bad Preview release; Preview update checks choose the highest published version, so an older bad prerelease cannot outrank a newer promoted Stable
4. If a promoted Stable release is bad:
   - move GitHub latest back to the previous stable release
   - use the signed recovery policy path when a rollback install is required
5. If local branch is behind after publish:
   - `git pull --rebase origin main`

## Local macOS Updater Validation
Use this before cutting another release when you need to validate the unsigned macOS updater end to end.

1. Build and install a packaged Buddy that already contains the custom mac updater.
   - Example: `bun run build:installable:electron`
2. Build the update payload you want Buddy to install.
   - The update payload version must be higher than the installed Buddy version.
3. Start the local signed update server from repo root:
   - `BUDDY_VERSION=0.0.19 bun run serve:update:mac-local`
4. Launch the installed Buddy against that local metadata URL:
   - `BUDDY_UPDATE_METADATA_URL="http://127.0.0.1:43199/latest-mac.json" /Applications/Buddy.app/Contents/MacOS/Buddy`
5. In Buddy, run “Check for Updates” and then “Install & Restart”.
6. If install fails, inspect:
   - main app log: `~/Library/Logs/Buddy/main.log`
   - installer log: `~/Library/Logs/Buddy/update-installer.log`

The local server script:
- regenerates `latest-mac.json`
- signs it with the same Tauri updater keypair used by the old Tauri updater
- serves the manifest, signature, and local zip artifacts over HTTP

Required local files if not provided through env vars:
- `~/.config/buddy/tauri-updater.key`
- `~/.config/buddy/tauri-updater.key.password`

## Notes
- `bun run release:cut` and `bun run release:cut:electron` currently execute the same Electron release wizard.
- `bun run release:tag` remains a compatibility alias; release tags should still be created by GitHub publish flow.
- Stable promotion does not rebuild or copy assets. It only changes GitHub release metadata after verification.
- Tauri code remains in repo for transition only and is intentionally not part of release publishing.
