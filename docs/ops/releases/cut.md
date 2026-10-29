# Release Cut Runbook

Procedure to cut, verify, dogfood, and promote Buddy desktop releases across Preview and Stable channels.

---

## 1. Prerequisites
Start from a clean and updated `main` branch:
```sh
git checkout main && git pull origin main && git status --short
```

---

## 2. Cut a Preview Candidate
Print the raw input, inspect the diffs, and write a notes file following [notes.md](notes.md). Then run the release cut wizard with that file:
```sh
bun run release:notes:input --channel prod
bun run release:cut --notes /tmp/buddy-notes.md --title "Buddy <version>"
```
- Uses the previous published release in the same channel as the notes baseline.
- Suggests the next version from highest published tag (including soaking Preview candidates) to prevent collisions.

---

## 3. Automated Build, Sign & Upload
GitHub Actions publish workflow:
- Builds, signs, and uploads release artifacts for macOS and Windows.
- Publishes release with `isDraft=false` and `isPrerelease=true`.
- Stable `/releases/latest` endpoint remains unchanged.

---

## 4. Verify Preview Candidate
Inspect release metadata and assets via GitHub CLI:
```sh
gh release view v<version> --repo prashantbhudwal/buddy-releases --json isDraft,isPrerelease,tagName,name,url,publishedAt,assets
```
Ensure required assets exist:
- Platform installers and `.blockmap` files (macOS DMG/ZIP, Windows NSIS/EXE).
- Target updater metadata (`latest-mac.yml`, `latest.yml`) and signatures.
- Signed recovery policy, install scripts, and math runtime bundles.

---

## 5. Dogfood via Preview Channel
1. In Buddy: **Settings → Updates → Channel → Preview**.
2. Click **Check for updates**.
3. Verify download progress, install, clean restart, and verified runtime version.

---

## 6. Promote to Stable
After validation and manual sign-off:
```sh
bun run release:promote v<version>
```
- Validates published prerelease and required asset inventory.
- Flips release status to Stable/latest without rebuild or re-upload.

---

## 7. Roll-Forward & Recovery
- **Defective Preview:** Do not promote. Leave as prerelease (or draft) and cut a newer candidate.
- **Defective Stable:** Retarget `latest` to prior stable release and deploy signed recovery policy.
- **Channel Precedence:** Preview clients track the highest published tag, so newer preview releases outrank older releases.
- A newer promoted Stable is not outranked by an older bad Preview. If a bad Preview is followed by a fixed Preview with a higher version and only the fixed candidate is promoted, Stable users skip the unpromoted bad Preview.

---

## 8. Local Updater Smoke Testing (macOS)
Validate updater behavior locally before cutting:
```sh
BUDDY_VERSION=<version-above-installed> bun run serve:update:mac-local
```
Launch installed app targeting mock metadata server:
```sh
BUDDY_UPDATE_METADATA_URL="http://127.0.0.1:43199/latest-mac.json" /Applications/Buddy.app/Contents/MacOS/Buddy
```
Inspect logs in `~/Library/Logs/Buddy/main.log` and `update-installer.log`.

## Buddy Beta distribution

Buddy Beta is a separate installation and release stream that publishes into the same assets repository as Stable, `prashantbhudwal/buddy-releases`. Its independent numeric versions start at `0.1.0`. Beta releases are tagged `beta-vX.Y.Z`, are always pre-releases, and are never marked latest; Stable keeps `vX.Y.Z` and owns GitHub's latest release. Source provenance lives in `buddy-hq/buddy` under `beta-vX.Y.Z`. Artifact filenames are the same in both streams because each release tag namespaces its own assets.

Installed Stable apps can never be updated retroactively, so the shared repository relies on what they already ignore:

- **Stable ring and recovery** read only `/releases/latest`, which is never a Beta release.
- **Preview ring** reads only tags of the form `vX.Y.Z` among the newest 100 releases, so `beta-v` tags are skipped.
- **Release notes on the Preview ring** display any visible body text of a pre-release in range. Beta notes are therefore written inside an HTML comment that those apps strip; the GitHub page of a Beta release shows no notes.

`script/release/shared-repository-guard.ts` checks these invariants against simulations of the shipped Stable readers before every Beta publication and again afterwards. If the post-publication check fails, the pipeline returns the Beta release to draft and fails. The guard refuses a Beta release that would push the newest Stable or Preview release out of installed apps' 100-release window, so cut a Stable or Preview release if Beta gets far ahead. Installed apps also read release notes from only the newest 20 releases. The guard refuses a Beta release that would hide the notes of the release those apps are currently offered, and only warns when Beta pushes out older catch-up notes. Either way they never show Beta notes.

Beta is cut from the long-lived `beta` branch: `main` plus upcoming work, including the OpenCode v2 upgrade. Stable continues to be cut from `main`. Land fixes on `main` first and regularly merge `main` → `beta`. When Beta's work is ready for Stable, merge `beta` → `main`.

Before the first cut, the owner must:

1. Create `beta` from `main` after the Beta workflows land, so `publish-beta.yml` exists on both branches. Give `beta` the same branch protection and required `Check` and `vendor-guard` checks as `main`.
2. Generate a separate minisign updater keypair. Commit its public key in `BUDDY_DISTRIBUTIONS.beta.updaterPublicKey` in `packages/script/src/distribution.ts`. Keep the private key outside the repository. Beta signing and publication fail closed while the public key is `null`.
3. Add `BUDDY_BETA_UPDATER_PRIVATE_KEY` and `BUDDY_BETA_UPDATER_PRIVATE_KEY_PASSWORD` to the source repository's Actions secrets. Beta publishes with the existing `BUDDY_RELEASE_TOKEN`; it never signs with the Stable key.
4. After the first cut, run the side-by-side checks in [qa-checklist.md](qa-checklist.md) on macOS ARM64, macOS Intel, and Windows x64.

CI runs on pushes to both branches. As on `main`, a push that changes `vendor/opencode` fails `vendor-guard`; cut Beta from a later green `beta` commit.

From clean, green `beta`, run:

```sh
bun run release:notes:input --channel beta
# Read the diffs and write /tmp/buddy-beta-notes.md following notes.md.
bun run release:cut:beta --fs --targets all --notes /tmp/buddy-beta-notes.md --title "Buddy Beta <version>"
```

Write the notes for people using Buddy, following [notes.md](notes.md). `--notes` skips the editor, and `--title` defaults to the tag. Both `--fast` and `--fs` require `--notes`.

The first Beta release must build macOS ARM64, macOS Intel, and Windows x64. Later cuts may select a subset; omitted feeds must come from a previous published Beta release. Beta never bootstraps a production or legacy manifest. For local gates, explicitly configure the Beta key through `TAURI_SIGNING_PRIVATE_KEY` or `TAURI_SIGNING_PRIVATE_KEY_PATH` and its password; Beta never falls back to `~/.config/buddy/tauri-updater.key`.

`publish-beta.yml` maps the Beta signing secrets to the generic signing slots, serializes the entire Beta stream, and skips skill artifact publication. The pipeline creates a draft, builds and verifies assets, freezes their bytes, records the source tag, checks the shared repository, then publishes a **pre-release that is never latest**. Beta has no promotion step. A cut below the highest published Beta version is refused. Retrying the same frozen version verifies the original bytes and source instead of replacing assets.

Inspect and install a published release:

```sh
gh release view beta-v0.1.0 --repo prashantbhudwal/buddy-releases --json isDraft,isPrerelease,tagName,url,assets
bun run download:beta beta-v0.1.0
```

The local macOS installer selects `Buddy Beta.app` and checks `ai.buddy.desktop.beta` before replacing it. For end users, each Beta release contains `install-buddy-macos.sh` and `install-buddy-windows.ps1` rendered for Beta: they find the newest `beta-v` release and never read Stable's latest. Review and run the installer downloaded from that Beta release. Production installer files and published bytes are unchanged.

Validate Beta-to-Beta updates on both platforms. For a defective Beta, cut a higher numeric Beta version with the fix and let clients roll forward. Never mark a Beta release latest, retag it `vX.Y.Z`, or run `release:promote` on it; promotion refuses Beta tags and records.
