# Buddy Release Cut Algorithm

This is the repeatable process to cut a Buddy desktop release from GitHub.

The current release shape is:

- macOS only
- downloadable from GitHub Releases
- auto-update required
- advanced math runtime downloadable from the same GitHub release
- ad-hoc signed only
- not Apple Developer signed
- not notarized

## Inputs
- Repo root: `/Users/prashantbhudwal/Code/buddy`
- Release branch: `main`
- GitHub repo: `prashantbhudwal/buddy`
- Release workflow: [`.github/workflows/publish.yml`](/Users/prashantbhudwal/Code/buddy/.github/workflows/publish.yml)
- Release scripts:
  - [`script/tag.ts`](/Users/prashantbhudwal/Code/buddy/script/tag.ts)
  - [`script/version.ts`](/Users/prashantbhudwal/Code/buddy/script/version.ts)
  - [`script/changelog.ts`](/Users/prashantbhudwal/Code/buddy/script/changelog.ts)
  - [`script/publish.ts`](/Users/prashantbhudwal/Code/buddy/script/publish.ts)

## Rules
1. Cut stable releases from `main` only.
2. Do not create a release from a dirty working tree.
3. Do not publish if `bun fmt`, `bun lint`, or `bun typecheck` fail.
4. Do not publish if the updater signing secret is missing.
5. Treat GitHub Releases as the source of truth for desktop artifacts, updater metadata, and advanced math runtime assets.
6. For the first `0.0.1` release, set the version explicitly. If no previous stable release exists, the helper defaults to `0.1.0`.
7. Prefer `workflow_dispatch` over tag-push releases for this repo. The remote vendor guard can reject tag pushes when the release range includes protected `vendor/opencode/**` changes.

## Preconditions
1. Ensure local state is clean.
   - `git branch --show-current`
   - `git status --short`
   - Expected:
     - branch is `main`
     - working tree is clean

2. Ensure GitHub CLI is authenticated.
   - `gh auth status`

3. Ensure repo secrets are configured.
   - Required:
     - `TAURI_SIGNING_PRIVATE_KEY`
   - Usually required:
     - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

4. Ensure the release content is actually ready.
   - desktop onboarding flow works
   - updater banner works in packaged builds
   - advanced math runtime installs from release assets
   - packaged app launches the bundled backend successfully

5. Run final validations from repo root.
   - `bun fmt`
   - `bun lint`
   - `bun typecheck`
   - run only targeted package tests for the release changes

## Preferred Algorithm: Draft Release by Workflow Dispatch
Use this when you want GitHub to compute and build the release without first pushing a local tag. This is the normal stable-release path for this repo.

1. Sync local `main`.
   - `git checkout main`
   - `git pull --ff-only origin main`

2. Open the `publish` workflow in GitHub Actions.
3. Use `Run workflow`.
4. Provide one of:
   - `version: 0.0.1`
   - `bump: patch|minor|major`
5. Wait for the workflow to build the draft release.
6. Verify the draft release contents and artifacts.
7. If the workflow succeeds, the release is published automatically by the final job.
8. The final publish job also persists the release version back to `main`.
   - It updates the tracked package versions in git.
   - It updates `bun.lock` so the lockfile stays aligned with the versioned workspace packages.
   - It creates a follow-up sync commit named `chore(release): sync package versions to vX.Y.Z`.
   - If `main` advanced while the release was building, the sync step stops instead of rewriting branch history. Rerun the release from the new `main` head.
9. If you rerun the same version after fixing `main`, GitHub reuses the existing draft release.
   - This is the normal recovery path after a failed `workflow_dispatch` run.
   - If a previous attempt already created the release tag at an older commit, rerunning the workflow does not move that tag.

## Alternate Algorithm: Tagged Stable Release
1. Sync local `main`.
   - `git checkout main`
   - `git pull --ff-only origin main`

2. Choose the exact version.
   - First release:
     - `export BUDDY_VERSION=0.0.1`
   - Later releases:
     - either set `BUDDY_VERSION=x.y.z`
     - or set `BUDDY_BUMP=patch|minor|major`

3. Create the local release commit and tag.
   - `bun run release:tag`
   - This script:
     - updates package versions and `bun.lock`
     - creates commit `release: vX.Y.Z`
     - creates git tag `vX.Y.Z`

4. Verify the result before pushing.
   - `git log --oneline -n 3`
   - `git tag --list 'v*' | tail`
   - `git show --stat --no-patch HEAD`

5. Push branch and tag.
   - `git push origin main`
   - `git push origin vX.Y.Z`
   - This may be rejected by the remote vendor guard if the release range includes protected `vendor/opencode/**` changes.
   - If that happens, stop using the tag-push flow for that version and finish the release with `workflow_dispatch` instead.

6. Let GitHub Actions run the `publish` workflow on the tag.
   - The workflow will:
     - create or reuse a draft GitHub release
     - fail fast if updater signing is missing
     - build macOS arm64 and x64 desktop artifacts
     - upload updater metadata and signatures
     - upload advanced math runtime bundles for both mac targets
     - undraft the release when all build jobs succeed

7. Verify the GitHub release contents.
   - Expected desktop artifacts:
     - macOS arm64 installer/bundle
     - macOS x64 installer/bundle
     - updater metadata such as `latest.json`
     - updater signatures
   - Expected advanced math assets:
     - `buddy-advanced-math-vX.Y.Z-aarch64-apple-darwin.zip`
     - `buddy-advanced-math-vX.Y.Z-aarch64-apple-darwin.zip.sha256`
     - `buddy-advanced-math-vX.Y.Z-x86_64-apple-darwin.zip`
     - `buddy-advanced-math-vX.Y.Z-x86_64-apple-darwin.zip.sha256`

8. Run post-release smoke checks.
   - Download and install from GitHub Release.
   - Confirm the installed helper is executable:
     - `stat -f '%Sp %N' /Applications/Buddy.app/Contents/MacOS/buddy-backend`
     - expected mode includes execute bits such as `-rwxr-xr-x`
   - Launch the installed app and confirm the bundled backend process actually starts.
     - expected:
       - no `Permission denied (os error 13)` on startup
       - `/Applications/Buddy.app/Contents/MacOS/buddy-backend` is running
   - Confirm first-run onboarding appears on a fresh install.
   - Confirm `Log in with ChatGPT Plus` opens the same provider auth flow as settings.
   - Confirm `Test with free models` resolves to the `opencode` free-model path.
   - Confirm advanced math runtime installs from Settings.
   - Confirm updater detection and banner behavior using a newer tagged release.

## Stop Conditions
Stop immediately if any of these happen:

- working tree is dirty before the release commit
- branch is not `main`
- `gh auth status` fails
- `bun fmt`, `bun lint`, or `bun typecheck` fail
- targeted release tests fail
- `verify-updater-signing` fails in CI
- the release draft is missing updater metadata or mac runtime assets
- `main` advanced during a `workflow_dispatch` release before the final version-sync commit
- `git push origin vX.Y.Z` is rejected by the vendor guard because the release range includes protected vendored source

## Recovery
1. If `bun run release:tag` created the commit/tag locally but you have not pushed:
   - delete the local tag:
     - `git tag -d vX.Y.Z`
   - drop or replace the local release commit using normal non-destructive git workflow

2. If the tag was pushed and CI failed:
   - fix the issue on `main`
   - delete the failed tag locally and remotely only if you intend to re-use the same version:
     - `git tag -d vX.Y.Z`
     - `git push --delete origin vX.Y.Z`
   - otherwise cut a new version

3. If GitHub created a draft release with bad assets:
   - delete or edit the draft release in GitHub
   - do not mark it final until the artifact set is correct

4. If a `workflow_dispatch` release failed after creating the draft:
   - fix the issue on `main`
   - rerun the `publish` workflow with the same `version`
   - the workflow will reuse the existing draft release instead of creating a second one

## Notes
- The app is currently ad-hoc signed, but not Apple Developer signed or notarized. Expect normal macOS Gatekeeper friction on first install.
- Updater support is mandatory for release success in the current pipeline.
- The first stable release at `0.0.1` must use explicit `BUDDY_VERSION=0.0.1`; otherwise the helper may choose `0.1.0`.
- GitHub Actions artifact upload/download can strip execute bits from bundled sidecars. Release validation must confirm `Buddy.app/Contents/MacOS/buddy-backend` is still executable in the published DMG/app.
- `workflow_dispatch` releases now add a follow-up version-sync commit on `main`, so local git state stays aligned with the shipped release without rewriting branch history.
- The version-sync logic updates both the package version files and `bun.lock`.
- If you mix flows for the same version, the GitHub release tag may already point at an older commit even though the published artifacts came from a later `workflow_dispatch` run. Avoid mixing flows unless you are intentionally recovering an existing draft.
