# GitHub Actions release minutes notes

Date: 2026-06-29

Purpose: preserve the CI minutes analysis and recommendations from the release-cost chat so the research does not need to be repeated when resuming work.

## Context

Buddy has two release entrypoints:

- `.github/workflows/publish.yml` runs on `v*` tags and manual dispatch.
- `.github/workflows/publish-cheap.yml` is manual-only and calls the same shared workflow with `direct_release_uploads: true`.

Both delegate to `.github/workflows/publish-shared.yml`.

`publish-cheap` already applies the main existing optimization: each platform job uploads built Electron assets directly to the draft GitHub release instead of uploading them as GitHub Actions artifacts and later re-uploading them from the finalizer job.

## Observed `publish-cheap` run cost

Screenshot reference from the chat:

| Job | Runtime |
| --- | ---: |
| `publish / smoke-node-backend` | 1m 21s |
| `publish / version` | 1m 21s |
| `publish / build-electron-macos-x64` | 15m 0s |
| `publish / build-electron-macos-arm64` | 5m 10s |
| `publish / build-standards` | 52s |
| `publish / prepare-advanced-math` | 1m 59s |
| `publish / build-electron-windows-x64` | 21m 32s |
| `publish / build-advanced-math` | 0s |
| `publish / finalize-electron-release` | 1m 12s |
| `publish / publish` | 1m 6s |
| **Total wall-clock job runtime shown by GitHub** | **49m 33s** |

The wall-clock number is not the free-tier budget impact. GitHub-hosted runner billing/minute consumption is weighted by operating system.

Approximate current cost impact for that run:

| Area | Rounded job minutes | Approximate GitHub cost after quota | Approximate free-tier budget equivalent |
| --- | ---: | ---: | ---: |
| macOS x64 | 15 | $0.93 | 150 standard minutes |
| macOS arm64 | 6 | $0.37 | 60 standard minutes |
| Windows x64 | 22 | $0.22 | 44 standard minutes |
| Ubuntu jobs | 11 | $0.07 | 11 standard minutes |
| **Total** | **54** | **~$1.59/run** | **~265 standard minutes/run** |

Result: a 2,000-minute GitHub Free quota only covers roughly 7 full releases of this shape.

Sources checked during the chat:

- GitHub Actions billing: <https://docs.github.com/en/billing/concepts/product-billing/github-actions>
- GitHub-hosted runner pricing: <https://docs.github.com/en/billing/reference/actions-runner-pricing>

Pricing and free-tier terms can change. Re-check the links before making longer-term CI decisions.

## Why the run is expensive

The main cost is not ordinary duplication. It is the platform matrix:

- macOS arm64 release build
- macOS x64 release build on Intel macOS runner
- Windows x64 release build
- Ubuntu release orchestration and package asset jobs

The Electron desktop package embeds target-native runtime pieces. Relevant implementation details found during the chat:

- `packages/desktop-electron/scripts/prepare.ts` calls `bun run --cwd ../buddy build:node`.
- `packages/buddy/script/build-node.ts` validates that requested target platform/arch matches the current host.
- `script/backend-node-artifact.ts` resolves native packages from `process.platform` and `process.arch`.
- `packages/desktop-electron/electron.vite.config.ts` externalizes/copies native packages such as `@lydell/node-pty-${platform}-${arch}` and `@parcel/watcher-${platform}-${arch}`.

Therefore the macOS arm64, macOS x64, and Windows packaging jobs are mostly genuinely platform-specific. They cannot be trivially collapsed into one Ubuntu build.

## Duplications and avoidable work

### 1. `sdk:generate` runs three times

In `.github/workflows/publish-shared.yml`, each Electron platform job runs:

```yaml
- run: bun run sdk:generate
```

This happens in:

- `build-electron-macos-arm64`
- `build-electron-macos-x64`
- `build-electron-windows-x64`

The SDK generation is platform-independent. It can be moved into a single Ubuntu preparation job that uploads the generated SDK files as a small artifact. Each platform job can download those files before build.

Expected impact: modest on successful releases, but clean and predictable.

Risk: generated files must exactly match what each platform job expects under `packages/sdk/src/gen/`. Do not edit generated SDK files manually.

### 2. `publish-cheap` still downloads large release binaries back from GitHub

In direct release upload mode:

1. Platform jobs upload `.dmg`, `.zip`, `.exe`, and `.blockmap` files directly to the draft release.
2. `finalize-electron-release` downloads update assets from the draft release into `electron-dist`.
3. Finalizer scripts synthesize/sign update manifests from those downloaded files.

Relevant workflow area:

- `.github/workflows/publish-shared.yml`, `finalize-electron-release`, step `Download update assets from draft release`.

Relevant script:

- `packages/desktop-electron/scripts/download-release-update-assets.ts`

This avoids GitHub artifact storage for large files, but it still duplicates network I/O. The finalizer only needs file metadata and hashes for update manifests.

Better option:

- Keep direct binary upload for `publish-cheap`.
- Still upload `latest*.yml` from each platform job as tiny GitHub artifacts.
- In the finalizer, download only those tiny `latest-yml-*` artifacts.
- Skip `download-release-update-assets.ts` when those manifests are present.

Expected impact: small minutes savings, cleaner release finalization, less GitHub release download/upload churn.

Risk: ensure `latest.yml`, `latest-mac.yml`, `latest-mac.json`, and signatures are still generated from complete per-platform data.

### 3. Expensive platform builds start before smoke passes

The Electron platform build jobs currently need only `version`. They do not wait for `smoke-node-backend`.

If `smoke-node-backend` fails, macOS and Windows builds may already have burned most of the minutes.

Better option:

- Add `smoke-node-backend` to the `needs` list of:
  - `build-electron-macos-arm64`
  - `build-electron-macos-x64`
  - `build-electron-windows-x64`

Expected impact: no savings on successful releases; significant savings on broken releases. Adds roughly 1–2 minutes wall-clock latency to successful releases.

Risk: low.

### 4. `build-standards` always verifies/uploads knowledge graph assets

The workflow already has reuse logic for advanced math runtime assets:

- `prepare-advanced-math` checks whether runtime inputs changed since the previous stable release.
- If unchanged, it copies previous release assets forward and skips `build-advanced-math`.

The standards/knowledge-graph assets could use the same pattern:

- Detect whether knowledge graph inputs changed since previous release.
- If unchanged, download/copy previous release assets to the new draft release.
- If changed, run the current verify/upload path.

Expected impact: small, about one Linux minute per unchanged release.

Risk: depends on defining the exact source paths that should invalidate the standards asset.

### 5. Repeated checkout/setup/install is mostly unavoidable

Every GitHub Actions job runs on an isolated machine. The repeated `checkout`, `setup-bun`, cache restore, and `bun install` steps are expected.

Caching full `node_modules` is not obviously safe or worth it because release jobs intentionally install OS/arch-specific native packages:

- `bun install --os=darwin --cpu=arm64`
- `bun install --os=darwin --cpu=x64`
- default install on Windows

The current Bun install cache is safer than cross-platform `node_modules` reuse.

## High-impact lever: platform scope

The biggest savings come from changing what gets built:

- Skipping macOS Intel saves about 150 standard-minute equivalents per run.
- Skipping Windows saves about 44 standard-minute equivalents per run.
- Keeping full macOS Intel + macOS arm64 + Windows means workflow optimization will probably save only about 5–20 standard-minute equivalents on successful runs.

If `publish-cheap` is intended as an emergency/backup release path, consider adding manual dispatch inputs such as:

- `include_macos_x64`
- `include_macos_arm64`
- `include_windows_x64`
- `include_standards`
- `include_advanced_math`

Default could remain full release for safety, or `publish-cheap` could intentionally default to arm64 macOS + Windows only.

This is a product/release policy decision, not just CI optimization.

## Updater implications of partial platform releases

Question from the chat: if `publish-cheap` can run with or without Intel macOS assets, does updater logic need to change? Example: ship `0.44` without Intel macOS, then an Intel app checks for updates and cannot find the matching asset.

Short answer:

- If `publish-cheap` still builds all currently supported update platforms, no updater change is needed.
- If a stable GitHub release is allowed to omit a platform that existing installed apps support, updater behavior needs an explicit policy and probably code changes.

Current macOS updater behavior:

- The app fetches `https://github.com/prashantbhudwal/buddy-releases/releases/latest/download/latest-mac.json`.
- `latest-mac.json` has one `version` for the whole macOS manifest.
- The app chooses the expected archive name from its own runtime architecture:
  - Apple Silicon expects `buddy-v{version}-macos-apple-silicon.zip`.
  - Intel expects `buddy-v{version}-macos-intel.zip`.
- If the manifest version is newer but does not contain the matching archive, the updater logs `custom mac updater could not find a matching archive` and returns `{ updateAvailable: false, failed: true }`.
- Renderer code maps that to update check status `error`.

Consequence:

- If `0.44` is published as the latest stable release with only Apple Silicon macOS assets, Intel users on `0.43` will see an update-check error, not a clean "up to date".
- They will not automatically fall back to an older complete release.
- They will become updateable again when a later latest stable release, for example `0.45`, includes `buddy-v0.45-macos-intel.zip`.
- Exact recovery updates to an omitted version should not be targeted. An Intel recovery target of `0.44` would fail if `0.44` has no Intel asset.

What users actually see if we let it fail:

- The automatic in-app update watcher only shows a toast when the update status is `ready`. A missing matching archive returns an error state, so normal background polling should be mostly silent.
- Manual update checks from settings or the app menu show "Update check failed."
- Startup recovery paths can show "Update check failed." with a manual download fallback if Buddy is already in a failed-startup recovery flow.
- Users on the omitted platform keep running their current installed version. They are not forced to update and the app should otherwise continue working.
- Once the next stable/latest release includes their platform again, they should be offered that later release and effectively skip the omitted partial release.

So letting it fail is operationally survivable for a short-lived partial release, but it is not clean UX. It is more acceptable for an emergency backup release than for the normal stable release path.

Current Windows behavior is similar in policy terms:

- Windows uses signed `latest.yml` and `electron-updater`.
- If a latest stable release omits Windows assets or publishes a manifest that points at missing assets, update checks can fail.
- There is only one Windows target today, `x64`, so this is simpler than macOS unless Windows is made optional in a cheap release.

Safe release policies:

1. Full stable release policy
   - Only publish a stable GitHub release as `latest` when it contains all supported updater platforms.
   - Partial platform builds can exist as draft/prerelease/manual downloads, but should not become the stable latest release.
   - Lowest updater risk.

2. Partial stable release with known updater degradation
   - Allow a release such as `0.44` to become latest with only Apple Silicon macOS.
   - Accept that Intel macOS update checks will show an error until the next full release.
   - This is operationally simple but user-hostile.

3. Platform-specific latest manifests
   - Add arch/platform-specific manifests, for example:
     - `latest-mac-arm64.json`
     - `latest-mac-x64.json`
     - potentially `latest-windows-x64.yml`
   - Update the app to fetch the manifest for its own platform/arch.
   - The release pipeline can then advance Apple Silicon to `0.44` while keeping Intel on `0.43`.
   - Existing installed apps still fetch the old global `latest-mac.json`, so migration needs compatibility planning.

Recommended policy for now:

- Do not let `publish-cheap` publish a partial platform set as the stable latest release unless the missing-platform updater behavior is intentionally accepted.
- If adding platform toggles, make partial releases draft or prerelease by default, or require an explicit input such as `allow_partial_stable_release`.
- Keep `latest-mac.json` and `latest.yml` pointing only at complete, supported, downloadable assets.
- Before supporting partial stable releases properly, add platform-specific manifests and update the updater selection logic.

## Backup CI providers discussed

### GitHub overage budget

Lowest migration option. At the observed run shape, each full release costs roughly $1.59 after included minutes are exhausted. A small GitHub Actions spending limit, such as $5/month, buys roughly three additional full releases.

### Self-hosted GitHub Actions runners

Most reliable no-minute backup if hardware exists. GitHub docs state self-hosted runner usage is free.

Would preserve the GitHub release workflow almost entirely, but requires:

- macOS host for mac builds
- Windows host for Windows builds
- runner labels that replace `macos-26`, `macos-26-intel`, and `windows-2025-vs2026`

### Blacksmith

Low-migration GitHub Actions-compatible runner provider. It was identified as a good free-tier backup, but with an important constraint:

- It is best suited if the repository is in a GitHub organization.
- Its macOS runners are Apple Silicon-focused, so the current `macos-26-intel` macOS x64 job is not necessarily a drop-in fit.

Sources checked:

- <https://www.blacksmith.sh/pricing>
- <https://docs.blacksmith.sh/introduction/quickstart>
- <https://docs.blacksmith.sh/blacksmith-runners/overview>

### CircleCI

Viable as a true external CI backup but requires a real migration from GitHub Actions syntax and release orchestration.

Free tier exists, but macOS and Windows consume credits quickly. Not ideal for this workflow unless doing an emergency one-off port.

Sources checked:

- <https://circleci.com/docs/guides/plans-pricing/plan-overview/>
- <https://circleci.com/pricing/price-list/>

### Codemagic

Potential macOS-only escape hatch. It was not identified as a full release backup because Windows/Linux coverage would not match the current release workflow for free.

Source checked:

- <https://docs.codemagic.io/billing/pricing/>

## Recommended order of work

1. Add `smoke-node-backend` as a dependency before expensive Electron platform builds.
   - Low risk.
   - Prevents wasting macOS/Windows minutes when backend smoke is already broken.

2. Change direct-upload finalization to pass tiny `latest*.yml` artifacts instead of downloading large binaries from the draft release.
   - Low/medium risk.
   - Removes real duplicate I/O from `publish-cheap`.

3. Generate SDK once and share it with platform jobs.
   - Medium risk.
   - Removes duplicate platform-independent work.

4. Add reuse logic for standards knowledge-graph assets.
   - Medium risk.
   - Mirrors existing advanced-math reuse pattern.

5. Decide whether `publish-cheap` should support optional platform toggles.
   - Highest actual savings.
   - Requires release policy decision because it can produce partial releases.

## Resume prompt

If resuming this work, start with:

> Read `docs/features/release/github-actions-minutes.md`, inspect `.github/workflows/publish-shared.yml`, and implement the lowest-risk CI minutes optimizations first. Do not change release platform coverage unless explicitly asked.
