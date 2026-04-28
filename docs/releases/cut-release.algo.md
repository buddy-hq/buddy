# Buddy Release Cut Algorithm

This document is retained for historical context. The canonical Electron-only release process is now in [`docs/guides/cut-release-electron.v2.algo.md`](/Users/prashantbhudwal/Code/buddy/docs/guides/cut-release-electron.v2.algo.md).

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
  - [`script/cut-release.ts`](/Users/prashantbhudwal/Code/buddy/script/cut-release.ts)
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
7. Use `workflow_dispatch` for stable releases in this repo. The old local tag-push path is retired.
8. Advanced math runtime assets are now restored from the previous stable release when runtime inputs did not change; otherwise CI rebuilds them.

## Preconditions
0. Preferred local entrypoint:
   - `bun run release:cut`
   - This interactive wizard:
     - requires an interactive terminal; it cannot run headless
     - requires a clean working tree
     - checks GitHub auth and updater-signing secret presence
     - syncs local `main` with `origin/main`
     - suggests the next release version from the latest stable GitHub release in `prashantbhudwal/buddy`
     - does not read `package.json` to decide the next release version
     - lets you edit the draft release title and notes in your editor
     - `EDITOR` and `VISUAL` only control the notes editor; they do not remove the interactive requirement
     - creates or updates the GitHub draft release before dispatch
     - runs `bun fmt`, `bun lint`, and `bun typecheck`
     - triggers the GitHub `publish` workflow with `workflow_dispatch`
     - can watch the workflow and then pull the release-sync commit back to local `main`
     - force-syncs local tags from `origin` before that pull so stale local `vX.Y.Z` tags do not block with `would clobber existing tag`
   - If you use manual `gh` fallback commands, always pass `--repo prashantbhudwal/buddy`. Never rely on the default `gh` repo context.

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
8. Advanced math runtime release assets are resolved before upload:
   - The workflow looks up the latest previous stable release tag.
   - If both runtime inputs are unchanged since that tag, it reuses the prior assets and renames them to the current release version:
     - [`packages/buddy/src/local-runtimes/advanced-math/runtime/main.py`](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/local-runtimes/advanced-math/runtime/main.py)
     - [`packages/buddy/script/build-advanced-math-runtime.ts`](/Users/prashantbhudwal/Code/buddy/packages/buddy/script/build-advanced-math-runtime.ts)
   - If no previous stable release exists, required assets are missing, or runtime inputs changed, it falls back to rebuilding in CI.
9. The final publish job also persists the release version back to `main`.
   - It updates the tracked package versions in git.
   - It updates `bun.lock` so the lockfile stays aligned with the versioned workspace packages.
   - It creates a follow-up sync commit named `chore(release): sync package versions to vX.Y.Z`.
   - If `main` advanced while the release was building, the sync step stops instead of rewriting branch history. Rerun the release from the new `main` head.
10. If you rerun the same version after fixing `main`, GitHub reuses the existing draft release.
   - This is the normal recovery path after a failed `workflow_dispatch` run.
   - If a previous attempt already created the release tag at an older commit, rerunning the workflow does not move that tag.

## Local Tag Flow
Do not use a local tag-driven stable release flow in this repo.

Why:
- It creates local `vX.Y.Z` tags that can drift from the GitHub release tag.
- When they drift, normal pulls can fail with `would clobber existing tag`.
- The supported `workflow_dispatch` flow already creates the stable release tag on GitHub from the published release, so a separate local stable tag path only adds failure modes.

`bun run release:tag` is now a compatibility alias for `bun run release:cut`, and [`script/tag.ts`](/Users/prashantbhudwal/Code/buddy/script/tag.ts) exits with instructions instead of creating a local stable tag.

## Stop Conditions
Stop immediately if any of these happen:

- working tree is dirty before the release commit
- branch is not `main`
- `gh auth status` fails
- `bun fmt`, `bun lint`, or `bun typecheck` fail
- targeted release tests fail
- `verify-updater-signing` fails in CI
- the release draft is missing updater metadata or mac runtime assets
- advanced math runtime assets are missing for either target after the `build-advanced-math` job
- `main` advanced during a `workflow_dispatch` release before the final version-sync commit
- a local `vX.Y.Z` tag disagrees with `origin` and `git fetch --tags` reports `would clobber existing tag`

## Recovery
1. If GitHub created a draft release with bad assets:
   - delete or edit the draft release in GitHub
   - do not mark it final until the artifact set is correct

2. If a `workflow_dispatch` release failed after creating the draft:
   - fix the issue on `main`
   - rerun the `publish` workflow with the same `version`
   - the workflow will reuse the existing draft release instead of creating a second one

3. If a local Buddy release tag already drifted from `origin`:
   - resync tags from `origin`:
     - `git fetch origin '+refs/tags/*:refs/tags/*'`

## Notes
- The app is currently ad-hoc signed, but not Apple Developer signed or notarized. Expect normal macOS Gatekeeper friction on first install.
- Updater support is mandatory for release success in the current pipeline.
- The first stable release at `0.0.1` must use explicit `BUDDY_VERSION=0.0.1`; otherwise the helper may choose `0.1.0`.
- GitHub Actions artifact upload/download can strip execute bits from bundled sidecars. Release validation must confirm `Buddy.app/Contents/MacOS/buddy-backend` is still executable in the published DMG/app.
- `workflow_dispatch` releases now add a follow-up version-sync commit on `main`, so local git state stays aligned with the shipped release without rewriting branch history.
- The version-sync logic updates both the package version files and `bun.lock`.
- Advanced math runtime build reuse is content-gated by runtime source/build-script changes and previous stable release asset availability; it is not tied to desktop code changes.
- Stable release tags should come from GitHub only. Creating or reusing local stable tags is the root cause of the recurring pull conflict dialog.
