# Buddy macOS release analysis (2026-03-01)

This note captures the analysis of how vendored OpenCode ships its desktop release, and what Buddy would need to cut its first installable macOS release.

## Key correction

The vendored desktop app release flow is not driven by `release-github-action.yml`.

- `vendor/opencode/.github/workflows/release-github-action.yml` is for the separate GitHub Action package under `vendor/opencode/github/**`.
- The real app and desktop release pipeline is `vendor/opencode/.github/workflows/publish.yml`.

## Vendored OpenCode release flow

### 1. Human entrypoint

The release entrypoint is:

- `vendor/opencode/script/release`

That script just runs:

```bash
gh workflow run publish.yml -f bump="<major|minor|patch>"
```

So the actual release is workflow-driven, not a local one-off `tauri build`.

### 2. Version and draft release first

The `version` job in:

- `vendor/opencode/.github/workflows/publish.yml`

runs:

- `vendor/opencode/script/version.ts`

That step:

- computes the version from `OPENCODE_BUMP` or `OPENCODE_VERSION`
- generates release notes
- creates a draft GitHub release `v<version>`
- outputs the GitHub release id and tag for later jobs

### 3. Build CLI binaries first

The `build-cli` job runs:

```bash
./packages/opencode/script/build.ts --all
```

Then it uploads `packages/opencode/dist` as the `opencode-cli` artifact.

This matters because the desktop app bundles the CLI as a sidecar.

### 4. Build desktop per target

The `build-tauri` matrix in:

- `vendor/opencode/.github/workflows/publish.yml`

includes separate desktop builds for:

- `x86_64-apple-darwin`
- `aarch64-apple-darwin`
- Windows and Linux targets

So macOS is built per architecture, not as a single universal artifact in this workflow.

### 5. Desktop prepare step pulls the CLI artifact into the app

Before the Tauri build, the workflow runs:

- `vendor/opencode/packages/desktop/scripts/prepare.ts`

That script:

- updates the desktop package version
- downloads the `opencode-cli` artifact from the current GitHub run
- copies the correct arch-specific CLI binary into `src-tauri/sidecars`

This is how the desktop app gets its sidecar binary.

### 6. Tauri build uploads release assets

The desktop build uses:

- `tauri-apps/tauri-action`

from `vendor/opencode/.github/workflows/publish.yml` with:

- `releaseId`
- `tagName`
- `releaseDraft: true`
- `releaseAssetNamePattern: opencode-desktop-[platform]-[arch][ext]`

So the generated desktop artifacts are uploaded directly to the draft GitHub release.

### 7. macOS signing and notarization happen during CI

For macOS runners, the workflow:

- imports a Developer ID Application certificate
- extracts the signing identity
- writes the App Store Connect API key to a temporary `.p8` file
- passes signing and notarization env vars into the Tauri build

The key secrets/env vars used are:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_API_ISSUER`
- `APPLE_API_KEY`
- `APPLE_API_KEY_PATH`

So the vendored release is intended to be signed and notarized, not just built locally.

### 8. Updater artifacts are also signed

The workflow also passes:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

And the production desktop config:

- `vendor/opencode/packages/desktop/src-tauri/tauri.prod.conf.json`

enables:

- `bundle.createUpdaterArtifacts: true`

and includes updater configuration under `plugins.updater`.

So vendored OpenCode ships installable binaries plus updater metadata/signatures.

### 9. Production Tauri config differs from dev config

Vendored OpenCode has separate desktop configs:

- `vendor/opencode/packages/desktop/src-tauri/tauri.conf.json` (dev-oriented)
- `vendor/opencode/packages/desktop/src-tauri/tauri.prod.conf.json`
- `vendor/opencode/packages/desktop/src-tauri/tauri.beta.conf.json`

The production config adds release-specific behavior such as:

- updater artifacts
- updater endpoint/pubkey
- production branding

The base config also includes:

- mac bundle targets including `dmg` and `app`
- mac entitlements via `entitlements.plist`
- a sidecar binary bundle declaration

### 10. Publish only after build succeeds

The final `publish` job runs:

- `vendor/opencode/script/publish.ts`

That step:

- rewrites versions across package manifests
- runs `bun install`
- publishes SDK/plugin artifacts
- commits and tags the release version
- undrafts the GitHub release

So the full release is a multi-stage pipeline, not a single build command.

## What Buddy currently has

Buddy already has a working Tauri desktop app:

- root script: `bun run build:desktop`
- desktop package: `packages/desktop/package.json`
- Tauri config: `packages/desktop/src-tauri/tauri.conf.json`

Buddy also already bundles a backend sidecar:

- `packages/desktop/scripts/predev.ts`
- `packages/buddy/package.json` (`build:desktop-sidecar`)

Buddy's current Tauri config already includes:

- app icons
- `externalBin` pointing at `sidecars/buddy-backend`
- bundled migration resources

So Buddy can produce a local desktop build.

## What Buddy does not yet have (compared to vendored OpenCode)

Buddy does not currently have the full release machinery that vendored OpenCode uses:

- no production-specific Tauri config like `tauri.prod.conf.json`
- no separate beta/prod desktop configs
- no mac entitlements file checked in
- no visible CI release workflow in this repo equivalent to `publish.yml`
- no visible Apple signing / notarization setup
- no visible Tauri updater signing setup
- no visible workflow that builds and publishes per-arch mac artifacts to a GitHub release

Buddy also has no visible release automation that mirrors:

- `script/version.ts`
- `script/publish.ts`
- the multi-job build/publish workflow

## Practical requirement for Buddy's first installable mac release

If the goal is "something I can install" for a first macOS release, the minimum serious path is:

1. Add a production Tauri config for Buddy.
2. Configure mac bundle targets (`dmg` and `app`).
3. Add a mac entitlements plist if Buddy keeps the current overlay/private-API style behavior.
4. Build the Buddy backend sidecar as part of the release pipeline and copy it into `src-tauri/sidecars`.
5. Produce separate mac builds for:
   - `x86_64-apple-darwin`
   - `aarch64-apple-darwin`
6. Add Apple Developer ID signing in CI.
7. Add Apple notarization in CI.
8. Upload the resulting artifacts to a GitHub release.

If auto-update support is wanted from day one, also add:

9. Tauri updater signing keys
10. updater artifact generation and a `latest.json` hosting path

## Bottom line

Vendored OpenCode's "real release" is:

- workflow-dispatched
- versioned first
- CLI sidecar built first
- desktop built per platform/arch
- mac builds signed and notarized
- release artifacts uploaded to a draft release
- release finalized only after all builds pass

Buddy currently has enough to do local desktop builds, but not yet the vendored release pipeline needed for a proper signed installable macOS release.
