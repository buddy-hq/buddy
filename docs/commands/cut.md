Release cut steps I performed

1. Checked the branch and tree state.
   - `git branch --show-current`
   - `git status --short`
   - Confirmed the repo was on `main` and clean.

2. Checked the latest stable GitHub release.
   - `gh release list --repo prashantbhudwal/buddy --exclude-drafts --exclude-pre-releases --limit 2 --json tagName,publishedAt`

3. Derived the next release version.
   - Increment the latest stable tag with a patch release unless there is an explicit reason to cut minor or major.

4. Dispatched the release workflow immediately.
   - `gh workflow run publish.yml --repo prashantbhudwal/buddy -f version=<next-version>`

5. Watched the workflow with timeout scaling based on remaining work.
   - While the matrix build jobs were still active, I used long polling intervals:
     - `sleep 480; gh run view ...`
   - When the run got down to the final upload/publish stage, I shortened the interval:
     - `sleep 180; gh run view ...`
   - If a failure had appeared, I would have shortened further to inspect logs sooner.

6. Verified the workflow finished successfully.
   - Checked the run until all jobs were `success`

7. Verified the published release assets.
   - `gh release view v<next-version> --repo prashantbhudwal/buddy --json isDraft,isPrerelease,tagName,name,url,publishedAt,assets`
   - Required assets now include:
     - macOS installers: `.dmg`, `.zip`, `.blockmap`
     - Windows installers: `.exe`, `.blockmap`
     - updater metadata:
       - `latest.yml`
       - `latest-mac.yml`
       - `latest-mac.json`
       - `latest-mac.json.sig`
     - advanced math runtime zips and checksums for required macOS targets

8. For local validation before another release, use the local mac updater server instead of shipping blind.
   - `BUDDY_VERSION=<higher-than-installed-version> bun run serve:update:mac-local`
   - Launch installed Buddy with `BUDDY_UPDATE_METADATA_URL="http://127.0.0.1:43199/latest-mac.json" /Applications/Buddy.app/Contents/MacOS/Buddy`
   - If install fails, inspect:
     - `~/Library/Logs/Buddy/main.log`
     - `~/Library/Logs/Buddy/update-installer.log`

9. Confirmed the release was published and left the workspace untouched so later edits stay out of the cut.
