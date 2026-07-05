Release cut steps

1. Start from a clean `main`.
   - `git branch --show-current`
   - `git status --short`

2. Cut a Preview candidate.
   - Preferred command: `bun run release:cut`
   - The wizard checks the latest stable release for changelog baseline.
   - The wizard suggests the next version from the highest published release tag, including Preview candidates, so it does not reuse a soaking candidate version.

3. Let GitHub Actions build/sign/upload once.
   - The publish workflow creates or reuses the draft release.
   - The final publish step marks it `isDraft=false` and `isPrerelease=true`.
   - Stable `/releases/latest` is unchanged at this point.

4. Verify the Preview candidate.
   - `gh release view v<version> --repo prashantbhudwal/buddy-releases --json isDraft,isPrerelease,tagName,name,url,publishedAt,assets`
   - Required state: `isDraft=false`, `isPrerelease=true`.
   - Required assets include platform installers, blockmaps, target updater metadata, metadata signatures, recovery policy, install scripts, and required advanced math runtime assets.

5. Dogfood through Buddy Preview.
   - In Buddy: Settings → Updates → Preview.
   - Run “Check for updates”.
   - Verify download progress, install, restart, and final app version.

6. Promote to Stable only after manual approval.
   - `bun run release:promote v<version>`
   - The script verifies the release is published, still a prerelease, has the required asset inventory, then flips the same GitHub release to Stable/latest.
   - No rebuild and no asset copy happen during promotion.

7. Roll forward when needed.
   - Bad Preview candidate: leave it prerelease or mark it draft, then cut a newer candidate.
   - Bad promoted Stable: move latest back to the prior stable release and use signed recovery policy when needed.
   - If a bad Preview is followed by a fixed Preview with a higher version and only the fixed one is promoted, Stable users skip the bad release. Preview update checks choose the highest published version, so an older bad prerelease does not outrank a newer promoted Stable.

8. Local mac updater validation before another release, when needed.
   - `BUDDY_VERSION=<higher-than-installed-version> bun run serve:update:mac-local`
   - Launch installed Buddy with `BUDDY_UPDATE_METADATA_URL="http://127.0.0.1:43199/latest-mac.json" /Applications/Buddy.app/Contents/MacOS/Buddy`
   - Inspect failures in:
     - `~/Library/Logs/Buddy/main.log`
     - `~/Library/Logs/Buddy/update-installer.log`
