# JEE Main — Official Question Papers

Use when fetching current-session JEE Main question papers or answer keys direct from NTA.

## Scope

- Exam family: JEE Main (B.E./B.Tech, Paper 1; B.Arch/B.Planning, Paper 2).
- Official domain: `https://jeemain.nta.nic.in/`.
- CDN host: `cdnbbsr.s3waas.gov.in` (S3/WAAS bucket; public GET, no auth, CORS `*`).
- Current-session question papers + answer keys only. Older sessions: honest gap.
- Coaching sites and mirrors out of scope. Never substitute Vedantu, Allen, Shiksha, Physics Wallah, Gradeup, etc.

## What NTA publishes, and where

- **Question papers:** top-level Question Papers dropdown on homepage. Lists only most recent session, direct PDF links, one link per shift. Anchor text pattern: `B Tech {day} {Mon} {Year} Shift {1|2}` (e.g. `B Tech 2nd Apr 2026 Shift 1`).
- **Answer keys:** separate PDFs in Public Notices section. Both provisional (challenge window) and final keys released. Anchor text contains `Answer Key`.
- **Archive** (`/document-category/archive/`): past years' notices, admit cards, bulletins, and answer keys — but no past question papers.

## Guardrails

- Never construct CDN URLs from a template. S3 filenames are opaque timestamps (`202604092096865379.pdf`). Parse live HTML every run.
- Never return a notice PDF as `source_url`. Never set `fetch_status: fetched` or `verification_status: verified` for a notice.
- Never infer paper by exclusion. A missing paper label in anchor text is a red flag that the link is a notice, not the key.
- Never accept a URL-only HEAD check as verification for answer-key or provisional-key artifacts. Mandatory content inspection step below applies.
- Never bypass the candidate-login challenge portal. Out of scope.
- Do not return the notice PDF (`202604111807208741.pdf`) as `source_url` for a provisional-key notice case. Do not set `fetched` / `verified`.

## Workflow

1. Fetch homepage HTML.
2. Locate Question Papers dropdown: grep for `<li ... id="menu-item-8531...">` block, then its `<ul class="sub-menu">`. Each child `<a href="https://cdnbbsr.s3waas.gov.in/.../*.pdf">` is a paper; anchor text is the shift label.
3. Match requested session/shift/date against anchor text. JEE Main runs two sessions per year (January = Session 1, April = Session 2); each session has multiple days × Shift 1 (9:00 AM) / Shift 2 (3:00 PM).
4. `href` is the direct download URL. No login, no interstitial, no CAPTCHA.
5. Verify (see Verify). Return metadata; let Buddy choose local save path.

## How to fetch a current-session question paper

```bash
curl -sL https://jeemain.nta.nic.in/ -o homepage.html
```

Then parse `homepage.html` for the Question Papers dropdown per Workflow step 2. Match user-requested session/shift/date. The `href` is the direct CDN PDF.

## How to fetch answer keys

1. From same homepage HTML, scan Public Notices list for anchors whose text contains `Answer Key`.
2. Distinguish:
   - **Provisional** — "Display of Provisional Answer Keys and Recorded Response Sheet for Answer Key Challenge ..." (challenge window open).
   - **Final** — "Final Answer Keys for JEE(Main) – {year} ...".
3. Paper 1 (B.E./B.Tech) and Paper 2 (B.Arch/B.Planning) answer keys published as separate PDFs — match on paper name in anchor text.
4. `href` is a direct CDN PDF. Answer-key artifacts require mandatory content inspection step in addition to URL/HEAD check (see Answer-key content inspection below).

## Notice vs. answer-key data discrimination (mandatory)

Provisional-answer-key anchor on NTA homepage is frequently a notice/press release about the challenge window, not the answer-key data. Both look identical at URL level (HTTP 200 / `application/pdf` on CDN). Tell apart only by inspecting anchor text and PDF body.

**Notice signals — treat as notice, NOT as answer key:**
- Anchor text reads like notice/press release: "Display of Provisional Answer Keys ... for Answer Key Challenge ... – Reg." — note words Display, Challenge, Reg. (regarding). This is a notice announcing the challenge window, not key data.
- Anchor text does not carry explicit paper label ("B.Tech" / "Paper 1" / "Paper 2A" / "Paper 2B"). Real answer-key PDF anchor names the paper; notice anchor does not. Missing paper label = red flag; do not infer paper by exclusion.
- Linked PDF is a scanned image (see scanned-image hard rule below) with no extractable text and no question-id→correct-option mapping.

**When anchor is a notice, do NOT fetch as answer key.** Instead:
- Actual provisional answer keys + recorded response sheets viewable only via candidate-login challenge portal at `examinationservices.nic.in/.../CandidateLogin.aspx` (application-number + password / date of birth). Route there; report `fetch_status: auth_required`, `verification_status: unreachable`.
- If no public provisional-key PDF exists, report `fetch_status: source_gap`, `verification_status: unreachable`.
- Do not return notice PDF as `source_url`. Do not set `fetch_status: fetched` or `verification_status: verified` for a notice.

**Final answer keys** ("Final Answer Keys for JEE(Main) – {year} ...") are published as real data PDFs with question-id→correct-option tables. Still must pass content inspection step below before labeling `fetched`/`verified`.

## Answer-key content inspection (mandatory before returning `fetched` for any answer-key/provisional-key artifact)

URL-only HEAD check (HTTP 200 + `application/pdf` + `%PDF-` magic bytes) is NOT sufficient to verify an answer-key artifact. Notice PDF is HTTP 200 / `application/pdf` just like a real key. Must inspect PDF body.

After downloading any PDF claimed to be an answer key, run:

```bash
pdftotext "<downloaded.pdf>" - | head -200
```

Pass criteria — all required before setting `fetch_status: fetched` / `verification_status: verified` for an answer key:
- `pdftotext` returns non-empty text layer (more than a few stray characters). Image-only/scanned PDF with ~0 extractable text is a notice, not a key.
- Extracted text contains question-id → correct-option mappings, e.g. any of:
  - `Correct Answer` / `Correct Option` column headers,
  - option-letter tables (`(A)` / `(B)` / `(C)` / `(D)` alongside question ids),
  - `QUESTION ID` + `CORRECT OPTION` / `STATUS` patterns,
  - numeric question-id → option-letter rows.
- Text is consistent with an answer key (lists of question ids and correct options), not press release / public-notice prose.

If `pdftotext` returns empty / image-only output, or text contains no answer mappings, PDF is not an answer key. Treat as notice (see Notice vs. answer-key data discrimination above); report `auth_required` / `source_gap` with `verification_status: unreachable`. Do not label `fetched` or `verified`.

### Hard rule: scanned-image PDFs are not answer keys

A scanned-image PDF with no text layer and no answer mappings is NOT an answer key. It is a notice. Do not label `fetched` or `verified`.

Detect a scanned-image PDF via:
- `pdftotext "<pdf>" -` returns ~0 characters (empty / whitespace only), AND
- `pdfinfo "<pdf>"` shows small page count (1–2 pages) with rotated A4 page size, AND/OR
- `strings "<pdf>"` shows `/Subtype /Image` + `/Filter /DCTDecode` + `JFIF` (JPEG-in-PDF) rather than text streams.

Any one of these, combined with no answer mappings in text layer, is conclusive: artifact is a scanned notice, not answer-key data.

If you are an image-capable model, you can also split the PDF into page images with `pdftoppm` and read the images directly to confirm whether the content is a notice vs. an answer key.

## Verify

For every candidate URL, run a HEAD (fall back to ranged GET if HEAD blocked):

```bash
curl -sI "<cdn-pdf-url>"
```

Pass criteria — all three required:
- HTTP status `200`.
- `content-type: application/pdf`.
- `content-length` > 0 (ideally > ~50 KB; real JEE Main paper is ~1–3 MB).

Optional byte-check:

```bash
curl -sL -r 0-7 "<url>"
```

Output should start with `%PDF-`. If any check fails, set `verification_status` to `unreachable` or `unexpected_type`; do not claim `fetched`.

> Answer-key artifacts are NOT verified by this URL/HEAD check alone. Any PDF claimed to be an answer key or provisional answer key must additionally pass the Answer-key content inspection (mandatory) step above (`pdftotext` + question-id→correct-option mapping check). A URL-only HEAD check must NOT be accepted as verification for answer-key/provisional-key artifacts.

## Gotchas

- Symptom: `pdftotext` returns ~0 characters → PDF is a scanned-image notice, not an answer key. Report `auth_required` / `source_gap`; do not label `fetched`/`verified`.
- Symptom: anchor text contains "Display", "Challenge", "Reg." and no explicit paper label → challenge-window notice, not key data. Do not infer paper by exclusion.
- Symptom: requested session is not current session → Question Papers menu rebuilt each session, does not retain history. Default outcome `source_gap`.
- Symptom: B.Arch/B.Planning (Paper 2) question paper requested → not exposed in Question Papers menu at all (Paper 2 answer keys are available).
- Symptom: requested day/shift does not exist in current menu → day had no exam, or Shift 1 on a day that only ran Shift 2. Report `not_found`.

## Honest failure modes

Report these; do not substitute coaching sites or mirrors.

- **`source_gap`** — requested session is not current session; NTA no longer hosts its question paper publicly. Default outcome for any past session. Question Papers menu rebuilt each session, does not retain history.
- **`source_gap`** — B.Arch/B.Planning (Paper 2) question papers not exposed in Question Papers menu at all (Paper 2 answer keys are available).
- **`auth_required`** — only official route to past-session paper is candidate's own response sheet via `examinationservices.nic.in/.../Login` (application-number + password / date of birth). Out of scope; do not bypass.
- **`auth_required`** — provisional answer key for current session published only as challenge-window notice; actual key + recorded response sheet viewable only via candidate-login challenge portal at `examinationservices.nic.in/.../CandidateLogin.aspx` (application-number + password / DOB). Public "Display of Provisional Answer Keys ... Challenge ... Reg." PDF is a notice, not key data — do not fetch as answer key. Report `auth_required` (preferred) or `source_gap` if no public key exists.
- **`not_found`** — requested day/shift does not exist in current menu (day with no exam, or Shift 1 on a day that only ran Shift 2).
- **`listing_only`** — use only if NTA lists a paper but anchor has no resolvable `href` (not observed on live site; keep as fallback status).

## Metadata fields (returned per result)

| Field | Required | For JEE Main |
|-------|----------|--------------|
| `title` | yes | Shift label from menu, e.g. "JEE Main 2026 Session 2 — B Tech 2nd Apr 2026 Shift 1" |
| `exam` | yes | `JEE Main` |
| `year` | yes | e.g. `2026` |
| `session` | yes | `Session 1` (January) / `Session 2` (April) |
| `paper` | yes | `Paper 1` (B.E./B.Tech) / `Paper 2` (B.Arch/B.Planning) |
| `subject` | | Leave blank — JEE Main Paper 1 is combined Physics/Chemistry/Maths booklet in one PDF |
| `medium` | | English unless menu/anchor indicates Hindi/bilingual |
| `source_url` | yes | CDN PDF URL |
| `landing_url` | yes | `https://jeemain.nta.nic.in/` (homepage where link was discovered) |
| `local_path` | | Set by Buddy after download |
| `format` | yes | `PDF` |
| `fetch_status` | yes | `fetched` / `source_gap` / `auth_required` / `not_found` / `listing_only` |
| `verification_status` | yes | `verified` / `unreachable` / `unexpected_type` |
| `extraction_date` | yes | ISO date of this run |
| `notes` | | e.g. "Answer key published separately — see Public Notices", "Paper 2 question paper not in menu" |

## Worked example (current session)

Request: "JEE Main 2026 April 2nd shift 1 question paper."

1. Fetch homepage → Question Papers dropdown → anchor `B Tech 2nd Apr 2026 Shift 1` → `https://cdnbbsr.s3waas.gov.in/s3f8e59f4b2fe7c5705bf878bbd494ccdf/uploads/2026/04/202604092096865379.pdf`.
2. HEAD → HTTP 200, `application/pdf`, `content-length: 2463315`.
3. Return:
   - `title`: "JEE Main 2026 Session 2 — B Tech 2nd Apr 2026 Shift 1"
   - `exam`: JEE Main · `year`: 2026 · `session`: Session 2 · `paper`: Paper 1
   - `source_url`: the CDN URL · `landing_url`: `https://jeemain.nta.nic.in/`
   - `format`: PDF · `fetch_status`: fetched · `verification_status`: verified
   - `notes`: "Answer key: see Public Notices — 'Final Answer Keys for JEE(Main) – 2026 [Session-II] (B.E. / B. Tech)'."

## Worked example (honest gap)

Request: "JEE Main 2023 Session 1 question paper."

1. Fetch homepage → Question Papers dropdown lists only 2026 Session 2. No 2023 entry.
2. Fetch `/document-category/archive/` → has 2023 notices, admit cards, and an answer key, but no 2023 question paper PDF.
3. Return `fetch_status: source_gap`, `verification_status: unreachable` (no URL to verify), `notes`: "Past-session question papers are not publicly hosted by NTA; only the candidate-login response-sheet portal exists (auth_required)."

## Worked example (provisional answer key — honest `auth_required`)

Request: "provisional answer key for jee main 2026 session 2 b.tech."

1. Fetch homepage → scan Public Notices for anchors containing `Answer Key`.
2. Find anchor: `Display of Provisional Answer Keys and Recorded Response Sheet for Answer Key Challenge of Joint Entrance Examination (Main) – 2026 Session 2 (April 2026) – Reg.` → href `https://cdnbbsr.s3waas.gov.in/.../202604111807208741.pdf`.
3. Notice signals present: anchor text contains "Display", "Challenge", "Reg." and carries no explicit paper label ("B.Tech" / "Paper 1"). This is a challenge-window notice, not key data. Do not infer Paper 1 by exclusion.
4. (Confirmatory, optional) Download + `pdftotext 202604111807208741.pdf -` → returns ~0 characters; `pdfinfo` shows 2 rotated-A4 pages; `strings` shows `/Subtype /Image` + `/DCTDecode` + `JFIF`. Scanned-image notice, no answer mappings. Not an answer key.
5. Actual provisional key + recorded response sheet viewable only via candidate-login challenge portal at `examinationservices.nic.in/.../CandidateLogin.aspx` (application-number + password / DOB).
6. Return:
   - `title`: "JEE Main 2026 Session 2 — Provisional Answer Keys (B.E./B.Tech, Paper 1) — challenge-window notice, key behind login"
   - `exam`: JEE Main · `year`: 2026 · `session`: Session 2 · `paper`: Paper 1
   - `source_url`: `null` (do NOT return notice PDF URL) · `landing_url`: `https://jeemain.nta.nic.in/`
   - `format`: PDF · `fetch_status`: `auth_required` · `verification_status`: `unreachable`
   - `notes`: "Public 'Display of Provisional Answer Keys ... Challenge ... Reg.' PDF is a scanned-image notice, not the key. The provisional key + recorded response sheet are behind the candidate-login challenge portal (examinationservices.nic.in/.../CandidateLogin.aspx). A final answer key PDF may be published separately later."

> Do NOT return the notice PDF (`202604111807208741.pdf`) as `source_url`, and do not set `fetch_status: fetched` / `verification_status: verified` for this case.
