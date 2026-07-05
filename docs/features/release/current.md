# Current Release Path

This is the current Buddy desktop release model. It is intentionally a
single-branch, two-ring process:

- `release:cut` always publishes a **Preview** candidate.
- `release:promote` manually promotes that exact candidate to **Stable**.
- Promotion does not rebuild, repackage, or copy assets.

## Terms

- **Build channel**: compile-time app identity from `BUDDY_CHANNEL`
  (`dev`, `beta`, `prod`). This controls app name, bundle id, recovery
  eligibility, and storage identity.
- **Update ring**: user-facing update selection inside Buddy:
  `stable` or `preview`.
- **Preview candidate**: a normal production app build published as a GitHub
  prerelease in `prashantbhudwal/buddy-releases`.
- **Stable release**: the same GitHub release after its prerelease flag is
  removed and GitHub latest points at it.

Important: Preview is not the vendor `beta` build channel. Release workflows
still build `BUDDY_CHANNEL=prod`. Preview is only an updater ring.

## User-Facing Updater

Buddy exposes update controls in Settings -> Updates.

- Stable is the default ring.
- Preview can be selected by the user.
- Selecting Preview saves the ring and immediately checks for updates.
- Switching back to Stable does not downgrade. Normal update checks only install
  newer versions.
- Update progress is emitted by the desktop main process and shown inline in
  Settings -> Updates and in persistent update toasts.

Updater state lives in Electron settings and uses:

```text
UpdateRing = "stable" | "preview"
UpdateProgressStatus = "idle" | "checking" | "downloading" | "ready" | "installing" | "error"
```

## Update Resolution

Stable ring:

- macOS and Windows resolve update manifests from GitHub stable latest:

```text
https://github.com/prashantbhudwal/buddy-releases/releases/latest/download/<manifest>
```

Preview ring:

- Buddy fetches GitHub releases and selects the highest published semantic
  version across prereleases and stable releases.
- This matters after promotion: if `v1.2.0` was a bad Preview and `v1.3.0` is
  promoted Stable, Preview users should resolve `v1.3.0`; the older bad
  prerelease must not outrank the newer stable release.
- If no published semantic release can be resolved, Preview falls back to stable
  latest.

Normal update checks:

- Reject same or older versions.
- Respect blocked recovery-policy versions.
- Never use downgrade as normal update behavior.

Recovery checks:

- Are explicit-version only.
- May still downgrade when the signed recovery policy allows it.

## Platform Updaters

macOS:

- Uses Buddy's custom updater, not Electron ShipIt.
- Fetches signed `latest-macos-<arch>.json` metadata.
- Downloads through streamed fetch so progress can be reported before sha512
  verification.
- Installs by launching the Buddy installer script and restarting the app.

Windows:

- Uses `electron-updater` for install mechanics.
- Buddy first fetches and verifies the signed remote manifest.
- Buddy then serves that manifest from a local loopback feed to
  `electron-updater`.
- Download progress events are mapped into Buddy update progress snapshots.

## Release Cut

Command:

```bash
bun run release:cut
```

Aliases:

```bash
bun run release:cut:electron
bun run release:tag
```

The release wizard:

1. Requires `main`.
2. Requires a clean working tree.
3. Syncs with `origin/main`.
4. Suggests the next version from the highest published release tag, including
   Preview candidates, so a soaking candidate version is not reused.
5. Uses the latest stable release only as the changelog baseline.
6. Runs required local gates:

```bash
bun fmt
bun lint
bun typecheck
```

7. Builds and validates the local dev installable.
8. Builds the native production release target from a detached temporary
   worktree and dry-runs signed target updater metadata.
9. Creates or updates the draft release.
10. Dispatches the publish workflow.
11. Watches the GitHub Actions run when requested.
12. Pulls the version-sync commit back to local `main`.

## GitHub Actions

Entry workflows:

- `.github/workflows/publish.yml`
- `.github/workflows/publish-cheap.yml`

Shared workflow:

- `.github/workflows/publish-shared.yml`

The workflow run name is:

```text
preview candidate <version-or-input>
```

The shared workflow:

1. Computes the release version.
2. Builds macOS Apple Silicon, macOS Intel, and Windows x64 targets.
3. Signs/notarizes where configured.
4. Builds or reuses advanced math runtime assets.
5. Uploads installers, blockmaps, updater manifests, signatures, recovery
   policy, install scripts, and runtime assets.
6. Verifies draft asset inventory.
7. Runs `script/publish.ts`.
8. Verifies the final release state is:

```text
isDraft=false
isPrerelease=true
```

9. Verifies published Preview candidate assets again.

`script/publish.ts` finalizes the release with:

```bash
gh release edit <tag> --draft=false --prerelease --repo prashantbhudwal/buddy-releases
```

That means Stable `/releases/latest` is unchanged by a cut.

## Preview Dogfood

After the workflow publishes the candidate:

1. Open installed production Buddy.
2. Go to Settings -> Updates.
3. Select Preview.
4. Check for updates.
5. Verify:
   - update is found
   - download progress appears inline
   - download progress appears in toast
   - install/restart works
   - final app version is the candidate version

For local macOS updater validation:

```bash
BUDDY_VERSION=<higher-than-installed-version> bun run serve:update:mac-local
BUDDY_UPDATE_METADATA_URL="http://127.0.0.1:43199/latest-mac.json" /Applications/Buddy.app/Contents/MacOS/Buddy
```

Useful logs:

```text
~/Library/Logs/Buddy/main.log
~/Library/Logs/Buddy/update-installer.log
```

## Stable Promotion

Command:

```bash
bun run release:promote vX.Y.Z
```

The promotion script:

1. Requires a `vX.Y.Z` tag.
2. Reads release state from GitHub.
3. Rejects drafts.
4. Rejects releases that are already stable.
5. Verifies required release assets and manifests.
6. Flips the same release to stable/latest:

```bash
gh release edit vX.Y.Z --prerelease=false --latest --repo prashantbhudwal/buddy-releases
```

7. Verifies GitHub `/releases/latest` points at the promoted tag.

No build, signing, upload, asset copy, or manifest regeneration happens during
promotion.

## Install Scripts

Public site install scripts must stay stable-only.

Site endpoints:

- `packages/site/src/pages/install.ts`
- `packages/site/src/pages/install-buddy-macos.sh.ts`
- `packages/site/src/pages/install-buddy-windows.ps1.ts`

Served scripts:

- `scripts/install-buddy-macos.sh`
- `scripts/install-buddy-windows.ps1`

Both public installers resolve GitHub stable latest through `/releases/latest`.
They must not install Preview prereleases.

Local install commands:

```bash
bun run install:release
bun run download:preview
```

- `install:release` installs stable by default.
- `download:preview` uses the tracked local installer with
  `BUDDY_INSTALL_RELEASE_KIND=preview`; it resolves the latest published
  prerelease, verifies it is a Preview prerelease, downloads the app asset or
  manifest-pinned archive, and replaces the installed app.

## Rollback And Bad Candidates

Bad Preview candidate:

- Leave it as prerelease, or mark it draft.
- Cut a newer Preview candidate from fixed `main`.
- Stable users never receive the bad candidate unless it was promoted.
- Preview users resolve the highest published semantic version, so a newer
  promoted Stable release can supersede an older bad prerelease.

Bad promoted Stable:

- Move GitHub latest back to the prior stable release.
- Use the signed recovery-policy path if machines need an explicit rollback
  install.

## Invariants

- `release:cut` must never publish Stable directly.
- Stable changes only through `release:promote`.
- Preview and Stable use the same production build assets.
- Preview is an update ring, not a separate build channel.
- Public install scripts install Stable only.
- Normal update checks do not downgrade.
- Recovery downgrade remains explicit-version and policy-gated.
- Promotion is metadata-only after asset verification.
