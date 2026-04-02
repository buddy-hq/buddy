Release cut steps I performed

1. Checked the branch and tree state.
   - `git branch --show-current`
   - `git status --short`
   - Confirmed the repo was on `main` and clean.

2. Checked the latest stable GitHub release.
   - `gh release list --repo prashantbhudwal/buddy --exclude-drafts --exclude-pre-releases --limit 2 --json tagName,publishedAt`

3. Derived the next release version.
   - Latest stable was `v0.0.17`
   - Next release was `v0.0.18`

4. Dispatched the release workflow immediately.
   - `gh workflow run publish.yml --repo prashantbhudwal/buddy -f version=0.0.18`

5. Watched the workflow with timeout scaling based on remaining work.
   - While the matrix build jobs were still active, I used long polling intervals:
     - `sleep 480; gh run view ...`
   - When the run got down to the final upload/publish stage, I shortened the interval:
     - `sleep 180; gh run view ...`
   - If a failure had appeared, I would have shortened further to inspect logs sooner.

6. Verified the workflow finished successfully.
   - Checked the run until all jobs were `success`

7. Verified the published release assets.
   - `gh release view v0.0.18 --repo prashantbhudwal/buddy --json isDraft,isPrerelease,tagName,name,url,publishedAt,assets`

8. Confirmed the release was published and left the workspace untouched so your later edits stay out of this cut.