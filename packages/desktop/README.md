# Buddy Desktop Release

This is the operational guide for Buddy desktop release builds.

There are only two flows:

- local installable builds for dogfooding
- GitHub releases for real publishing

## Local Installable Build

Use this when you want a real installable app for your current machine without publishing anything.

From the repo root:

```bash
bun run build:desktop:installable
```

Or from `packages/desktop`:

```bash
bun run build:installable
```

This build:

- builds the Buddy backend sidecar for the current host target
- stages the sidecar and bundled migrations
- runs a production-style Tauri build
- copies the final app bundles into `packages/desktop/src-tauri/target/bundles`

Important:

- this does not create a GitHub release
- this does not create or push a git tag
- this does not publish anything
- the installable app uses the production app identifier, so its Tauri data is separate from the dev app

To smoke-test a specific version locally:

```bash
BUDDY_VERSION=0.1.0 bun run build:desktop:installable
```

That version override is temporary for the build and is restored afterward.

## GitHub Release Flow

The real release workflow is:

- `.github/workflows/publish.yml`

It runs in exactly two cases:

- you push a git tag that matches `v*` (normal path)
- you start the workflow manually with `workflow_dispatch` (fallback path)

Critical rule:

- committing code does not cut a release
- pushing code to `main` without a tag does not cut a release
- a release starts only after a `v*` tag push or a manual workflow run

The workflow jobs are:

1. `version`
2. `build-sidecar`
3. `build-tauri`
4. `publish`

In short:

- `version` computes the version and creates a draft GitHub release
- `build-sidecar` builds the backend sidecars
- `build-tauri` packages the desktop apps and uploads them into the draft release
- `publish` undrafts the release

The current release targets are:

- macOS arm64
- macOS x64
- Windows x64

If `TAURI_SIGNING_PRIVATE_KEY` is configured, the workflow also publishes updater metadata and release builds can auto-update. If it is not configured, the release still ships, just without in-app updater support.

## Normal Release Steps

Use this when you are ready to ship.

1. Make sure your branch is `main` and your working tree is clean.
2. Create the local release commit and local tag:

```bash
BUDDY_VERSION=0.1.0 bun run release:tag
```

or

```bash
BUDDY_BUMP=patch bun run release:tag
```

`release:tag` updates versions, creates a local commit named `release: v<version>`, and creates a local `v<version>` tag. It does not push anything.

3. Push the commit:

```bash
git push origin main
```

4. Push the tag:

```bash
git push origin v0.1.0
```

The tag push is what triggers the release workflow.

## Manual Release Fallback

If you manually start the `publish` workflow instead of pushing a tag:

- run it from `main`
- provide either `version` or `bump`

This is a fallback path, not the normal release flow.

## Useful Commands

Create the local release commit and tag:

```bash
bun run release:tag
```

Create a specific release version:

```bash
BUDDY_VERSION=0.1.0 bun run release:tag
```

Create the next semantic bump:

```bash
BUDDY_BUMP=minor bun run release:tag
```

Preview release notes locally:

```bash
bun run release:notes
```

Create a draft GitHub release directly without a tag push:

```bash
BUDDY_VERSION=0.1.0 bun run release:version
```

That is an advanced/manual path. On non-tag runs it requires `BUDDY_VERSION` or `BUDDY_BUMP`.

## Current Limits

The current pipeline does not include:

- Linux desktop releases
- beta or preview channels
- Apple signing or notarization
- Windows code signing
- store publishing
- non-desktop package publishing
