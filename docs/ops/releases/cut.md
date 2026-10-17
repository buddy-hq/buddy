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
Run the release cut wizard:
```sh
bun run release:cut
```
- Inspects latest stable release for changelog baseline.
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

Buddy Beta is a separate installation and release stream. Its independent numeric versions start at `0.1.0`. Release assets live in `prashantbhudwal/buddy-beta-releases` under `vX.Y.Z`; source provenance lives in `buddy-hq/buddy` under `beta-vX.Y.Z`. Artifact filenames stay the same because the repositories provide the namespace.

Beta is cut from the long-lived `beta` branch: `main` plus upcoming work, including the OpenCode v2 upgrade. Stable continues to be cut from `main`. Land fixes on `main` first and regularly merge `main` → `beta`. When Beta's work is ready for Stable, merge `beta` → `main`.

Before the first cut, the owner must:

1. Create `beta` from `main` after the Beta workflows land, so `publish-beta.yml` exists on both branches. Give `beta` the same branch protection and required `Check` and `vendor-guard` checks as `main`.
2. Create the public `prashantbhudwal/buddy-beta-releases` repository, initialized with a README. Release creation tags the default branch, so an empty repository cannot receive its first release.
3. Generate a separate minisign updater keypair. Commit its public key in `BUDDY_DISTRIBUTIONS.beta.updaterPublicKey` in `packages/script/src/distribution.ts`. Keep the private key outside the repository. Beta signing and publication fail closed while the public key is `null`.
4. Add `BUDDY_BETA_RELEASE_TOKEN`, `BUDDY_BETA_UPDATER_PRIVATE_KEY`, and `BUDDY_BETA_UPDATER_PRIVATE_KEY_PASSWORD` to the source repository's Actions secrets. The token must write only the Beta releases repository. Scope the production release token only to the production releases repository, so neither token can write to the other stream.
5. After the first cut, run the side-by-side checks in [qa-checklist.md](qa-checklist.md) on macOS ARM64, macOS Intel, and Windows x64.

CI runs on pushes to both branches. As on `main`, a push that changes `vendor/opencode` fails `vendor-guard`; cut Beta from a later green `beta` commit.

From clean, green `beta`, run:

```sh
bun run release:cut:beta --targets all
```

The first Beta release must build macOS ARM64, macOS Intel, and Windows x64. Later cuts may select a subset; omitted feeds must come from a previous published Beta release. Beta never bootstraps a production or legacy manifest. For local gates, explicitly configure the Beta key through `TAURI_SIGNING_PRIVATE_KEY` or `TAURI_SIGNING_PRIVATE_KEY_PATH` and its password; Beta never falls back to `~/.config/buddy/tauri-updater.key`.

`publish-beta.yml` maps the three Beta secrets to the generic release/signing slots, serializes the entire Beta stream, and skips skill artifact publication. The pipeline creates a draft, builds and verifies assets, freezes their bytes, records the source tag, then publishes a **non-prerelease latest** release. Beta has no promotion step. A cut below the highest published Beta version is refused. Retrying the same frozen version verifies the original bytes and source instead of replacing assets.

Inspect and install a published release:

```sh
gh release view v0.1.0 --repo prashantbhudwal/buddy-beta-releases --json isDraft,isPrerelease,tagName,url,assets
bun run download:beta v0.1.0
```

The local macOS installer selects `Buddy Beta.app` and checks `ai.buddy.desktop.beta` before replacing it. For end users, each Beta release contains `install-buddy-macos.sh` and `install-buddy-windows.ps1` rendered with Beta repository, product, and download-directory defaults. Review and run the installer downloaded from the Beta repository. Production installer files and published bytes are unchanged.

Validate Beta-to-Beta updates on both platforms. For a defective Beta, cut a higher numeric Beta version with the fix and let clients roll forward. Do not retarget latest to an older version or run `release:promote`; promotion refuses the Beta channel and repository.
