# Banking — Fetch Official Indian Banking Exam Papers

**Leaf id:** `banking`
**Exams covered:** IBPS PO (CRP PO/MT), IBPS Clerk (CRP Clerks), SBI PO, RBI Grade B (Officers in Gr B (DR)). Same mechanism applies to IBPS RRB, IBPS Specialist Officers, SBI Clerk.
**Official surfaces:**
- IBPS — `https://www.ibps.in/` (WordPress; notices at `/index.php/crp-updates/`; PDFs at `https://www.ibps.in/wp-content/uploads/*.pdf`)
- SBI — `https://sbi.bank.in/web/careers` (Liferay portal; openings at `/web/careers/current-openings`; PDFs at `/documents/77530/...` and `/csfile/...`)
- RBI — `https://opportunities.rbi.org.in/scripts/index.aspx` (F5 bot-defense; linked from `https://www.rbi.org.in/`)
**Extraction date:** 2026-07-13

## Hard Truth (Read First)

Banking exams (IBPS, SBI PO/Clerk, RBI Grade B) are **computer-based tests (CBT)**. The bodies **do not publish full question papers** as public PDFs. No official "previous year question paper" archive exists on any of the three official surfaces. Expect most requests to end in **`source_gap`**.

What the official sites *do* publish (none are question papers):
- **Notifications / detailed advertisements** — exam pattern, syllabus, vacancies, eligibility. Closest official artefact.
- **Exam calendars** (IBPS) — schedule only.
- **Corrigenda, vacancy lists, select lists, biodata forms** — admin artefacts.
- **Response sheets / answer keys / score cards** — behind **candidate login** (`auth_required`). Never public.

Do not return a notification PDF as a "question paper". A notification may contain a small exam-pattern/sample-question snippet; that does not make it the paper.

## Workflow

1. Identify exam, year, stage (prelims/mains), subject/paper, medium from the user prompt.
2. Pick the official surface by exam body:
   - IBPS PO/Clerk/RRB/SPL → `ibps.in`
   - SBI PO/Clerk → `sbi.bank.in/web/careers`
   - RBI Grade B → `opportunities.rbi.org.in`
3. Look for a question paper / sample paper / model paper / previous-year paper / public answer key:

   ```bash
   curl -sL -A "Mozilla/5.0" "<page>" | grep -iE "question paper|sample paper|model paper|previous|answer key|response sheet"
   ```

   Grep the same page for PDF links.
4. Decide status:
   - No public paper exists → **`source_gap`** (expected default).
   - User asks for response sheet / answer key / score card → **`auth_required`** (candidate login; do not bypass).
   - User asks for a year/session that was never held → **`not_found`**.
   - RBI opportunities page returns a bot-challenge interstitial under plain GET → report **`unreachable`** for that surface; do not parse the interstitial as content. Fall back to `rbi.org.in` homepage links or to `source_gap`.
   - Only a listing with no direct download → `listing_only`.
5. Return metadata (see Metadata Contract) with the honest `fetch_status`.

## Where To Look On Each Surface (Live Patterns)

### IBPS — `https://www.ibps.in/`
- Notices/updates page: `https://www.ibps.in/index.php/crp-updates/`
- PDF upload root: `https://www.ibps.in/wp-content/uploads/<FILENAME>.pdf`
- Naming patterns observed: `Detailed-Notification_CRP-PO-XVI_...pdf`, `Detailed-Notification-CRP-SPL-XVI_...pdf`, `IBPS_CALENDAR_<YYYY>-27_final.pdf`, `Corrigendum-CRP-Clerks-XIV-*.pdf`.
- Recruitment/application portals (login-gated, **not** paper archives): `https://ibpsreg.ibps.in/<code>/` (e.g. `biprjan26`, `boicojun26`, `crsarsimay26`, `jdccbjun26`, `rbisejun26`, `sbiscojun26`, `sbiscoljun26`).
- Grep the home + CRP-updates pages for `question paper|sample paper|model paper|previous|answer key|response sheet`. As of 2026-07-13 these return **nothing** → `source_gap`.

### SBI — `https://sbi.bank.in/web/careers`
- `sbi.co.in/web/careers` 301-redirects to `sbi.bank.in/web/careers`. Use the latter.
- Current openings: `https://sbi.bank.in/web/careers/current-openings`
- Recruitment results: `https://sbi.bank.in/web/careers/recruitment-results` and `…/recruitment-results-archive`
- PDF roots: `https://sbi.bank.in/documents/77530/<id>/<name>.pdf?t=<ts>` and `https://sbi.bank.in/csfile/<name>.pdf`
- Observed artefacts: detailed advertisements, select lists, biodata forms, corrigenda, "how to apply" guides. **No question papers.**
- Response-sheet notice seen on current-openings: *"LINK TO DOWNLOAD RESPONSE SHEET WILL BE AVAILABLE UPTO …"* — candidate-login gated → `auth_required` if requested.

### RBI — `https://opportunities.rbi.org.in/scripts/index.aspx`
- Linked from `https://www.rbi.org.in/` homepage (grep `opportunities.rbi.org.in`).
- **Bot defense:** the live opportunities portal is fronted by F5 TSPD. A plain `curl -sL` returns a JS challenge interstitial (~44 KB), not the real listing. Treat a TSPD/`<data:;base64,…>`/JS-challenge body as **`unreachable`** for plain GET; do not parse it as the recruitment list.
- Old path `https://www.rbi.org.in/Scripts/Oppurtunities.aspx` now returns an error page — do not use it.
- RBI Grade B is CBT; no public question-paper archive → `source_gap` (or `unreachable` for the portal under plain GET).

## Verification (When You Do Return A File)

Only verify files you actually intend to return as official artefacts. For banking, the realistic verifiable artefacts are **notification/calendar PDFs** (used only to confirm the surface is live or to read exam pattern — **not** to return as a paper).

```bash
curl -sI -A "Mozilla/5.0" "<pdf_url>" --max-time 30
```

Pass criteria for a returned file:
- HTTP `200`
- `Content-Type: application/pdf` (or `application/zip` for bundles)
- `Content-Length` > 0 and non-trivial (a real paper is tens of KB to MB; an error HTML page is small)
- Body starts with `%PDF` (for PDF) — optional byte check:

  ```bash
  curl -sL "<pdf_url>" | head -c 4
  ```

Example (verified 2026-07-13, **notification, not a paper**):

```bash
curl -sI "https://www.ibps.in/wp-content/uploads/IBPS_CALENDAR_2026-27_final.pdf"
# → HTTP/1.1 200 OK
#   Content-Type: application/pdf
#   Content-Length: 442312
```

When no file is fetched (`source_gap` / `auth_required` / `not_found` / `listing_only`):
- Leave `source_url` empty.
- Set `fetch_status` to the honest outcome.
- Set `verification_status` to `unreachable` **only** if a real URL was attempted and failed (e.g. RBI bot-defense interstitial). If no URL was attempted, leave `verification_status` empty and record the reason in `notes` (e.g. `"CBT exam; no public paper published; no URL attempted"`).
- Never mark `verification_status: verified` without a fetched, checked file.

## Metadata Contract (Per OBJECTIVE)

Return these fields for every request:

| Field | Required | Banking-specific notes |
|-------|----------|------------------------|
| `title` | yes | e.g. "IBPS PO XVI 2026 Prelims Question Paper" |
| `exam` | yes | `IBPS PO` / `IBPS Clerk` / `SBI PO` / `RBI Grade B` (or `IBPS RRB` / `IBPS SPL` / `SBI Clerk`) |
| `year` | yes | Calendar year of the exam cycle |
| `session` | | Prelims / Mains / Shift if known |
| `paper` | | Paper name if applicable |
| `subject` | | For subject-specific posts (e.g. Specialist Officers) |
| `medium` | | English / Hindi / bilingual; default English |
| `source_url` | yes | Direct download URL **when available**; empty for non-fetched outcomes |
| `landing_url` | yes | Official page where the link was (or would be) discovered |
| `local_path` | | Path where Buddy saved the file, if downloaded |
| `format` | yes | `PDF` / `ZIP`; `N/A` for non-fetched |
| `fetch_status` | yes | `fetched` / `source_gap` / `listing_only` / `auth_required` / `paywall` / `not_found` |
| `verification_status` | yes | `verified` / `unreachable` / `unexpected_type` (only meaningful when a URL was attempted) |
| `extraction_date` | yes | ISO date of discovery |
| `notes` | | Caveats, e.g. "CBT exam; no public paper published", "response sheet is login-gated" |

## Expected Outcomes By Request Type (Cheat Sheet)

| User asks for | Expected `fetch_status` | Why |
|---------------|------------------------|-----|
| IBPS PO/Clerk question paper (any year) | `source_gap` | CBT; never published as PDF. |
| SBI PO/Clerk question paper (any year) | `source_gap` | CBT; never published as PDF. |
| RBI Grade B question paper (any year) | `source_gap` (or `unreachable` for the portal under plain GET) | CBT; not published; portal bot-defended. |
| IBPS/SBI/RBI response sheet / answer key / score card | `auth_required` | Candidate login at `ibpsreg.ibps.in` / SBI portal / RBI portal. |
| Exam pattern / syllabus / notification | `fetched` (notification PDF) **but label it as notification, not a paper** | Notification PDFs are public; do not mislabel as question paper. |
| A year/session that was never conducted | `not_found` | — |

## Never Do

- Never use coaching sites or third-party mirrors (Vedantu, Allen, Shiksha, Physics Wallah, Gradeup, AffairsCloud, PracticeMock, bankersadda, etc.).
- Never bypass candidate login, CAPTCHA, or bot-defense interstitials.
- Never return a notification/calendar/corrigendum PDF as a "question paper".
- Never scrape `ibpsreg.ibps.in` or other login portals for papers.
- Never use the dead RBI path `rbi.org.in/Scripts/Oppurtunities.aspx`.
