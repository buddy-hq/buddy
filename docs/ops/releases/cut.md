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
