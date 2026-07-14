# SSC — Staff Selection Commission (CGL / CHSL / CPO)

Fetch official SSC question-paper artifacts from `ssc.gov.in`. SSC does **not** publish question papers as standalone direct-download PDFs. Real question papers ship as "Question Papers cum Response Sheets" bundled with final/tentative answer keys, behind candidate login at `ssc.digialm.com`. The only directly downloadable official artifact is the **write-up / notification PDF** that announces the release. Report honestly; do not fabricate.

## Official surface

- Site: `https://ssc.gov.in/` (Angular SPA; content via JSON API).
- API base: `https://ssc.gov.in/api`.
- Candidate response-sheet portal: `https://ssc.digialm.com//EForms/configuredHtml/<formId>/<appId>/login.html` — **login-gated** (Registered ID + Password). Out of scope; never bypass.

## How to find question papers

SSC bundles question papers with answer keys in result/answer-key notifications. No "previous year question papers" archive exists. The `/previous-year-question-paper` route is broken (its API `contentType` returns 500). Work the answer-key listing instead.

### Step 1 — list answer-key notifications

```bash
curl -s "https://ssc.gov.in/api/general-website/portal/records?page=1&limit=10&contentType=answer-key&language=english&isAttachment=true&attributes=id,headline,examId,examYear,contentType,startDate,endDate,language,createdAt,redirectUrl"
```

- Public, no auth, HTTP 200.
- Returns `{statusCode:"200", data:[...]}`. Each entry: `headline`, `examYear`, `attachments[]`.
- Use `contentType=results` for result write-ups (roll-number lists, **not** question papers).
- Only the latest ~10 notifications are kept. Page 2+ is empty. Older years are gone from the listing.

### Step 2 — match the exam

Filter `data` by `headline` containing the exam family and tier:

- CGL → `Combined Graduate Level`
- CHSL → `Combined Higher Secondary`
- CPO / SI → `Sub Inspector in Delhi Police and Central Armed Police Forces` / `Central Armed Police Forces`
- Also match `examYear` and tier (`Tier-I`, `Tier-II`, `Paper-I`).

### Step 3 — resolve the direct PDF

Each entry has exactly one attachment: the write-up PDF. Build the URL from `attachments[0].path`:

- `path` looks like `uploads\\masterData\\AnswerKeys\\<file>.pdf` (backslashes).
- URL = `https://ssc.gov.in/api/attachment/` + `path` with `\` replaced by `/`.
  - Example: `https://ssc.gov.in/api/attachment/uploads/masterData/AnswerKeys/Final_writeup_17062026.pdf`

This PDF is the official notification announcing the answer keys + question papers cum response sheets. Directly downloadable and genuine. It is **not** the question paper itself.

### Step 4 — the actual question paper

The write-up PDF states the question papers cum response sheets are accessible via the `ssc.digialm.com` login link (Registered ID + Password), usually for a ~30-day window after result declaration. This is `auth_required` — report it; do not attempt to bypass.

## Failure modes

- `auth_required` — the actual question paper cum response sheet is behind candidate login at `ssc.digialm.com`. Normal, expected outcome when a user asks for the SSC question paper itself. Return the write-up PDF as the public sibling; set `fetch_status: auth_required` for the paper. When reporting `auth_required`, extract the concrete login URL from the write-up PDF text if present (the digialm link printed in the notification) and record it verbatim. Do **not** use placeholder `<formId>/<appId>` templates — only emit a URL actually found in the write-up text. If no concrete URL appears in the write-up, leave the paper `source_url` empty and note "digialm login URL not printed in write-up".
- `source_gap` — SSC keeps only the latest ~10 answer-key notifications; older-year (≤2024) write-ups are delisted and the digialm windows have expired. No permanent public archive exists. Report `source_gap` for older years.
- `listing_only` — a notification headline announces question papers but the write-up PDF attachment is missing/empty. Return `listing_only`.
- `not_found` — the requested exam/year/tier has no entry in the `answer-key` listing.

## Metadata fields (per OBJECTIVE)

Return one result per resolved artifact:

| Field | Value for SSC |
|---|---|
| `title` | The notification headline, e.g. "Uploading of Final Answer Key(s) along with Candidates' Response Sheet(s) and Marks of Combined Graduate Level Examination, 2025 (Tier-II)" |
| `exam` | `SSC CGL` / `SSC CHSL` / `SSC CPO` (or exact exam name from headline) |
| `year` | `examYear` from the record |
| `session` | Tier/Phase if in headline (`Tier-I`, `Tier-II`, `Paper-I`, `Phase-XIII`) |
| `paper` | — (SSC papers are not separately titled in the write-up) |
| `subject` | — (not applicable) |
| `medium` | `english` (request `language=hindi` for Hindi write-ups if needed) |
| `source_url` | `https://ssc.gov.in/api/attachment/uploads/masterData/AnswerKeys/<file>.pdf` (the write-up PDF); leave empty for the auth-gated question paper |
| `landing_url` | `https://ssc.gov.in/answer-key` (SPA route; the API endpoint is the real landing) |
| `local_path` | set by Buddy after download |
| `format` | `PDF` |
| `fetch_status` | `fetched` for the write-up PDF; `auth_required` for the actual question paper; `source_gap` for older years |
| `verification_status` | `verified` after the GET check below. **Vocabulary:** `verified` is reserved **only** for successfully fetched files. For `not_found` or `source_gap` cases where no file is downloaded, set `verification_status` to `unreachable` (not `verified`). |
| `extraction_date` | ISO date of discovery |
| `notes` | e.g. "Write-up PDF only. Actual question papers cum response sheets are behind candidate login at ssc.digialm.com (auth_required). Available for a ~30-day window after result." |

## Verification

Before returning `fetched`:

```bash
curl -sL -A "Mozilla/5.0" "<source_url>" -o /tmp/ssc.pdf -w "%{http_code} %{content_type} %{size_download}"
```

1. Confirm HTTP `200`, `content_type` contains `application/pdf`, `size_download` > 1000.
2. Confirm the file starts with `%PDF` (magic bytes).
3. If any check fails → `verification_status: unreachable` (or `unexpected_type`); do not claim `fetched`.

For the API listing, confirm `statusCode:"200"` and a non-empty `data` array.

## Rules

- Use only `ssc.gov.in` (API + attachment host) and the official `ssc.digialm.com` portal reference. Never coaching sites, mirrors, or aggregators (Vedantu, Allen, Gradeup, AffairsCloud, etc.).
- Never attempt to log in, submit credentials, or scrape behind the digialm portal. Report `auth_required` and stop.
- Do not guess PDF filenames. Always resolve via the `records` listing → `attachments[0].path`.
- One targeted request per exam/year. No bulk harvesting.
