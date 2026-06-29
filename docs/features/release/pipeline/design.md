# Release pipeline design checkpoint

Date: 2026-06-29

Status: design planning in progress. This document records decisions already made. It is intentionally not a file-by-file implementation plan.

## Goal

Refactor Buddy's release pipeline around the actual limits of GitHub Free without turning it into a generalized CI platform.

The pipeline must remain understandable for a single developer, support full and partial platform releases, and make the main cost levers independently selectable. Optimizing one quota must not silently worsen another quota or change product behavior without an explicit decision.

## Current constraints

Buddy's source repository is private and therefore receives the GitHub Free allowances:

- 2,000 weighted GitHub-hosted runner minutes per billing cycle.
- 500 MB of Actions artifact storage.
- 10 GB of Actions cache storage per repository.

GitHub Release assets are a separate storage mechanism. Individual files must remain below GitHub's release-asset limit, but total release size and download bandwidth are not currently the limiting resources.

Observed full `publish-cheap` release:

- Approximately 49m33s of summed job runtime.
- Approximately 265 weighted GitHub Actions minutes.
- Approximately $1.59 after included minutes are exhausted.
- macOS Intel is the largest individual contributor, followed by macOS ARM64 and Windows.

The limits are independent:

- `publish-cheap` addressed Actions artifact storage by uploading binaries directly to the draft GitHub Release.
- It did not address runner minutes.
- Existing dependency caches consume approximately 10.78 GB and also add runner time.

## Locked design decisions

### 1. Preserve both binary transports

`publish` and `publish-cheap` remain distinct entrypoints.

- `publish` stages packaged binaries through one-day GitHub Actions artifacts before uploading them to the draft release.
- `publish-cheap` uploads packaged binaries directly from platform jobs to the draft release.
- The shared pipeline must support both transports.

This is an intentional trade-off:

- A full normal release produces roughly 1.31 GB of Actions artifacts and therefore exceeds the 500 MB GitHub Free allowance.
- The normal path is retained for its more transactional staging behavior.
- The cheap path is the practical default whenever Actions artifact storage is the active constraint.

Transport choice must remain independent from platform selection.

### 2. Represent build targets independently

The shared workflow receives three independent booleans:

- macOS ARM64
- macOS x64/Intel
- Windows x64

Friendly choices such as All, Mac only, Windows only, ARM only, or Custom may be added to the release wizard later, but presets must resolve into these explicit target facts.

The workflow must reject a release plan with no selected targets.

### 3. Make partial stable releases first-class

Partial target selections may be published as normal stable releases. Draft-only partial releases are not part of the design.

The updater will move from global manifests to one manifest per supported target:

- `latest-macos-arm64.json`
- `latest-macos-x64.json`
- `latest-windows-x64.yml`
- Each manifest has its corresponding signature file.

Formats remain platform-specific:

- macOS keeps Buddy's signed JSON updater format.
- Windows keeps the signed YAML format used with `electron-updater`.

Each installed app requests exactly one manifest based on its own platform and architecture.

### 4. Treat the updater migration as breaking

The per-target updater migration will not preserve `latest-mac.json` or `latest.yml` compatibility for existing installations.

- Existing users of builds that only know the global manifests must install the migration release manually.
- The small current user base makes this acceptable.
- The pipeline will not maintain legacy global manifests or a compatibility window.

This removes permanent compatibility machinery from the release workflow.

### 5. Copy omitted target manifests forward

Every published release contains the current signed manifest for every supported target.

- A selected target receives a newly generated manifest for the new release version.
- An omitted target copies its previous signed target manifest forward unchanged.
- Only the tiny manifest and signature are copied.
- Binaries are not copied or downloaded again.

Example:

- 0.0.48 contains all targets.
- 0.0.49 contains only macOS ARM64.
- The ARM manifest advances to 0.0.49.
- Intel and Windows manifests attached to 0.0.49 still describe 0.0.48 and retain version-specific asset URLs.
- A user already on the pinned version does not redownload the application.

This is core partial-release behavior, not legacy compatibility.

### 6. Use stable target-specific Bun dependency caches

Bun dependency caches use GitHub Actions cache storage, not Actions artifact storage.

Use one stable cache generation per Bun version, OS, and target architecture, with a manually controlled epoch:

```text
release-bun-v1-{bun-version}-{os}-{architecture}
```

Expected examples:

```text
release-bun-v1-1.3.14-macos-arm64
release-bun-v1-1.3.14-macos-x64
release-bun-v1-1.3.14-windows-x64
release-bun-v1-1.3.14-linux-x64
```

Behavior:

- Application version changes do not create new caches.
- ARM and Intel never share target-native cache contents.
- A Bun version change creates a new generation automatically.
- The manual epoch is changed only when deliberately refreshing the baseline.
- Newly added dependencies missing from an existing immutable cache are downloaded normally by `bun install`.
- Forgetting to rotate the epoch can reduce performance, but must not compromise dependency correctness.

This deliberately avoids dependency-fingerprint scripts, automatic generation management, or a cache-preparation job.

The repository cache capacity remains capped at the included 10 GB. After the new stable caches exist, old lockfile-keyed Bun cache generations should be deleted once.

### 7. Key Electron tooling caches by actual dependencies

Electron/electron-builder caches remain separate from Bun dependency caches.

Their keys include:

- Target OS and architecture.
- The actual Electron version.
- The actual electron-builder version.

Buddy application version changes and unrelated package metadata must not invalidate these caches.

Resolving the two version strings locally is negligible work and avoids unnecessary cache generations and uploads.

### 8. Gate every release job behind preflight

All platform builds and optional-asset work wait for preflight to succeed.

This prevents a failed backend smoke test or signing prerequisite from allowing expensive macOS and Windows jobs to consume minutes.

The small potential wall-clock delay is accepted. In observed runs, version preparation and smoke already completed at approximately the same time.

### 9. Merge version preparation and backend smoke

Use one Ubuntu `preflight` job:

1. Checkout and install dependencies once.
2. Verify updater signing prerequisites.
3. Run recovery-policy and backend smoke checks.
4. Resolve/create the release and emit version, tag, repository, and release outputs.

This removes duplicate checkout, cache restoration, and installation while giving downstream jobs one clear dependency.

### 10. Merge finalization and publication

Use one Ubuntu `finalize-and-publish` job after all selected platform and required asset jobs succeed.

It:

1. Collects or verifies release assets according to the selected transport.
2. Finalizes and signs per-target updater manifests.
3. Copies omitted target manifests forward.
4. Uploads installer scripts and normal-transport binaries.
5. Finalizes the recovery policy.
6. Synchronizes version files/tags and publishes the draft release.

Repeated uploads must remain idempotent through clobber behavior so the job can be rerun after a failure.

### 11. Preserve direct-upload binary redownload verification

For `publish-cheap`, finalization redownloads the selected target update archives and blockmaps from the draft release before signing manifests.

- The finalizer hashes the actual files users will download.
- The current approximately 665 MB download took only about 15 seconds on Ubuntu.
- GitHub Release bandwidth is not a current quota wall.
- The integrity check is worth more than the negligible measured minute saving from trusting job-generated metadata.

The download logic must be selection-aware rather than requiring all three targets.

### 12. Make advanced-math assets follow selected targets

Advanced-math assets are correctness-driven and are not an independent wizard toggle.

- ARM Mac release: prepare ARM runtime assets.
- Intel Mac release: prepare Intel runtime assets.
- Both Mac targets: prepare both.
- Omitted Mac targets do not receive unused runtime assets.
- Existing automatic reuse-versus-build behavior remains.

This avoids spending macOS minutes on runtime assets for app targets that are not part of the release while preventing a selected app from pointing to a missing matching runtime.

### 13. Keep the standards dataset bundled

The approximately 94 MB standards knowledge-graph archive remains embedded in every installer.

This is an explicit product-behavior decision:

- Users retain offline standards enable/repair behavior from the bundled archive.
- Removing it would require a network download and change product behavior.

Accepted flaw:

- The same compressed dataset is repeated across every macOS DMG, macOS ZIP, and Windows installer.
- A full release carries roughly 470 MB of repeated packaged data.
- Normal Actions artifacts remain much larger as a result.
- This optimization is deferred until the product behavior itself is intentionally reconsidered.

## Explicitly deferred optimizations

### Shared Electron renderer build

The platform-independent renderer is currently rebuilt for every target.

Observed renderer build contribution:

- Intel Mac: about 1m29s.
- ARM Mac: about 29s.
- Windows: about 1m13s.
- Approximately 18–20 net weighted minutes could likely be saved after accounting for a shared Linux build and artifact transfer.

It is deferred because production `electron-vite` does not expose a simple renderer-only build flow. Sharing it would introduce a new approximately 69 MB artifact and a build-output contract between Linux and platform jobs.

Platform jobs remain self-contained for now.

### Shared SDK generation

SDK generation remains in each platform job.

- Current total cost is only about four weighted minutes.
- Generated output is approximately 460 KB.
- Creating a dedicated cross-job artifact is not justified by itself.
- If renderer sharing is implemented later, SDK generation should move into the same shared build boundary.

## Remaining planning decisions

The following areas were not decided before this checkpoint:

- Exact workflow modularity: separate reusable workflow, matrix job, composite actions, or a combination.
- Release wizard presets, defaults, prompt order, and command-line arguments.
- Whether a fresh advanced-math build requires explicit cost confirmation or remains fully automatic.
- Whether standards release assets should remain app-version scoped or eventually move to an immutable dataset release.
- Whether platform build jobs should remain individually named or become one conditional matrix.
- Runner-provider strategy: GitHub-hosted only, self-hosted backup, or external provider backup.
- Whether macOS Intel can safely build on an ARM runner through cross-compilation/Rosetta.
- Targeted Windows `bun install` optimization after the corrected cache behavior is measured.
- Recovery-policy representation for intentionally omitted/pinned targets.
- Detailed validation, tests, rollout order, and failure recovery.

## Future directions and remaining wins

### Large or potentially large wins

1. **Target selection**
   - Already enabled by the design.
   - Omitting Intel Mac saves approximately 150 weighted minutes.
   - Omitting ARM Mac saves approximately 60.
   - Omitting Windows saves approximately 44.
   - These savings trade platform coverage for quota and are never implied by `publish-cheap`.

2. **Alternative or self-hosted runners**
   - Self-hosted runners do not consume GitHub-hosted minutes.
   - External providers may reduce or move the runner quota.
   - This is the strongest escape hatch if optimized full releases still exceed the desired monthly capacity.

3. **macOS Intel runner strategy**
   - Intel is the largest target cost.
   - Building x64 output on the faster ARM runner could be a major saving if native dependencies, signing, packaging, and smoke verification can be made reliable.
   - The vendored OpenCode workflow still uses a native Intel runner, so feasibility must be proven rather than assumed.

4. **Standards unbundling**
   - Would remove roughly 94 MB from every installer and about 470 MB of repeated full-release output.
   - Explicitly deferred because it changes offline product behavior.

### Medium wins

1. **Windows installation path**
   - Windows still spends about five minutes in `bun install` even after restoring the existing cache.
   - After stable cache keys are deployed, profile linker/filesystem behavior before changing it.
   - Vendored OpenCode uses `--linker hoisted` on Windows, but this must be validated against Buddy's patches and native dependencies rather than copied blindly.

2. **Shared renderer build**
   - Estimated net saving: approximately 18–20 weighted minutes.
   - Deferred until the post-refactor full-release cost is known.

3. **Advanced-math asset hosting**
   - Runtime bundles are content-versioned but currently copied into each app release.
   - A dedicated immutable runtime release could remove repeated copy work and release-asset duplication.
   - Fresh runtime builds would still be required when runtime inputs change.

### Small wins intentionally not prioritized

- Generate SDK once: approximately four weighted minutes.
- Replace the 15-second direct-upload redownload with manifest metadata or API digest comparison.
- Split or combine jobs solely for cleaner visual presentation when no duplicate setup is removed.
- Add a general telemetry or cost-instrumentation system; existing GitHub step timings are sufficient for the next comparison.

## Expected outcome and validation point

The locked cache policy should remove routine dependency-cache uploads and reclaim old cache generations. Merged preflight/final jobs remove duplicate Linux setup. Failure gating prevents broken releases from starting expensive builds.

The exact optimized full-release total is not yet known and must not be promised before a real run. The first successful full release after implementation is the decision point:

- Compare weighted minutes with the approximately 265-minute baseline.
- Confirm cache storage remains comfortably below 10 GB.
- Confirm both binary transports still work.
- Confirm each target updater reads only its explicit manifest.
- Confirm omitted target manifests remain pinned without binary redownload.
- Revisit Windows installation, Intel runner strategy, and shared renderer work only if they remain material walls.

## Resume point

When planning resumes:

1. Read this document.
2. Continue from **Remaining planning decisions**.
3. Decide workflow/job modularity before creating a file-by-file implementation plan.
4. Preserve every locked decision unless explicitly revisited.

