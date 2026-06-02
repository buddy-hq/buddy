# National Assessments, Indices, and Learning Outcomes

Use this reference when the user wants evidence of learning, assessment resources, official outcomes, or performance/report-card documents. Natural requests may sound like “achievement survey report for Bihar”, “learning outcomes for class 5”, “assessment framework”, “state performance in education”, “district grading report”, “PARAKH resources”, or “PGI report card”.

This file helps the agent locate:

- **Learning evidence and surveys**: NAS reports and report-card routes.
- **Assessment resources**: PARAKH materials and assessment-unit PDFs.
- **Performance indices**: PGI and PGI-D state/district reports.
- **Expected learning standards**: NCERT learning outcome documents.

Use this for assessment, learning outcome, and performance-index questions. If the request is about a mission/scheme/data platform rather than outcomes or performance, use `missions-data-schemes.md`.

## Contents

- [NAS — National Achievement Survey state reports (static PDF)](#nas-national-achievement-survey-state-reports-static-pdf)
- [PARAKH (NCERT assessment unit)](#parakh-ncert-assessment-unit)
- [PGI and PGI-D (Performance Grading Index)](#pgi-and-pgi-d-performance-grading-index)
- [NCERT Learning Outcomes](#ncert-learning-outcomes)

---

# NAS — National Achievement Survey state reports (static PDF)

**Publisher:** Ministry of Education — NAS  
**Official domain:** `nas.gov.in` / `www.nas.gov.in`  
**Fetch family:** `static-pdf` (direct state report downloads); HTML report cards optional when portal healthy  

## What this source offers

- **State-level NAS report PDFs** via predictable download URLs
- HTML report-card dashboards by survey year (may be unavailable when backend errors)

## URL and link patterns (by format)

| Format | Pattern |
|--------|---------|
| PDF (state report) | `https://www.nas.gov.in/download-data-file/{state_slug}.pdf` |
| HTML report card | `https://nas.gov.in/report-card/{year}` (e.g. `2021`) — use when live; else PDF pattern |

`{state_slug}` is the lowercase English state name (`bihar`, `maharashtra`, `kerala`, …). There is **no `{year}` segment** in the PDF path; survey cycle is not disambiguated in the URL (server `Last-Modified` on tested files was Mar 2022).

Colloquial names (“achievement survey website”, “NAS survey report file”) still map to this host and slug pattern — no HTML portal navigation required when the slug is known.

## How to fetch

1. **Parse the request** — state (required); survey year if mentioned is context only unless a separate year-specific asset is documented.
2. Normalize state → slug (lowercase, no spaces).
3. **Verify:** `curl -sI -A "Mozilla/5.0" "https://www.nas.gov.in/download-data-file/{slug}.pdf"`.
4. **Download:** `curl -fL -A "Mozilla/5.0" -o "{local_path}" "https://www.nas.gov.in/download-data-file/{slug}.pdf"`.
5. Confirm `%PDF` and reasonable file size.

If the user asks for a **non-existent state slug**, expect **302** (not 200), `Content-Type: text/html`, and `Location: https://www.nas.gov.in/download-data-state-wise-2017`. Optionally follow once with `curl -sL` to confirm the body is HTML (often **500** on that landing page), not `%PDF` — then report honest `source_gap`; do not save HTML or substitute another state’s file.

## Verify

- HTTP 200 and `Content-Disposition` often `filename={slug}.pdf`
- Magic `%PDF`

## Access barriers

- Report-card HTML (`/report-card/{year}`) may return **HTTP 500** on both `nas.gov.in` and `www.nas.gov.in` (Laravel `QueryException`, PostgreSQL unreachable) while the direct PDF endpoint still works.
- Use **www** host for `download-data-file` when bare domain behaves differently

## Rights / license

MoE NAS site terms; government copyright.

## fetch_status for this source

| Situation | Status |
|-----------|--------|
| State PDF on disk | `fetched` |
| Invalid slug / redirect loop | `source_gap` |
| Portal HTML down but state PDF via pattern | `fetched` (PDF) + `listing_only` (portal) |
| Portal HTML only when PDF pattern unknown | `listing_only` |

## Disambiguation / known source gaps

| Case | Expected |
|------|----------|
| Bihar state NAS report PDF | `download-data-file/bihar.pdf` — verified 200 |
| Maharashtra | `download-data-file/maharashtra.pdf` — verified 200 |
| Kerala (“achievement survey website”, vague prompt) | `download-data-file/kerala.pdf` — verified 200 |
| `nonexistent-state.pdf` or `atlantica.pdf` | 302 → `download-data-state-wise-2017`, HTML not PDF — `source_gap` |
| `/report-card/2021` HTML | 500 on both hosts — prefer direct PDF workflow |

---

## PARAKH

# PARAKH (NCERT assessment unit)

Official PARAKH materials live on **PARAKH** (`parakh.ncert.gov.in`). Use only this domain and paths discovered from its pages. Do not use third-party mirrors.

## Workflow

1. **Parse the request** — document type (assessment framework, analysis framework, operational guidelines, grade-band report, technical report) and cycle (e.g. Rashtriya Sarvekshan 2024).
2. **Open the PRS hub** — `https://parakh.ncert.gov.in/prs` (PARAKH Rashtriya Sarvekshan). The site homepage does not list PDF hrefs in static HTML; the `/prs` page links official files.
3. **Match the link text** to the user’s request (e.g. “Assessment Framework”, “Grade 3”, “Technical Report”).
4. **Build the PDF URL** — files are served from:
   ```
   https://parakh.ncert.gov.in/themes/parakh/prs-files/{filename}.pdf
   ```
   Use the exact `href` from `/prs`; do not guess filenames except via that page.
5. **Verify** — `curl -sI` for HTTP 200 and `content-type: application/pdf`.
6. **Download** — `curl -sL -f -o …`. Use a long timeout on hub GET and PDF GET (both can take minutes). For the Technical Report (~274 MB), use e.g. `curl -sL -f --max-time 3600 -o …`.
7. **Verify bytes** — first bytes `%PDF`.
8. **Report** metadata contract fields.

## Known PDFs (PRS 2024 hub)

| User-facing label (on `/prs`) | Filename | Approx. size |
|--------------------------------|----------|----------------------|
| Assessment Framework | `Assessment_Framework_PARAKH_Rashtriya_Sarvekshan_07-11-2024.pdf` | ~49 MB |
| Analysis Framework | `Analysis_Framework_PARAKH.pdf` | ~61 MB |
| Operational Guidelines | `OPERATIONAL_GUIDELINES2024.pdf` | ~6.5 MB |
| Grade 3 / 6 / 9 | `Grade3.pdf`, `Grade6.pdf`, `Grade9.pdf` | Grade 3 ~800 KB |
| Technical Report | `PRS_2024_Technical_Report.pdf` | ~274 MB |

## Disambiguation

- **Assessment Framework** ≠ Analysis Framework ≠ Operational Guidelines.
- **Grade band** PDFs are separate from framework PDFs.
- Technical Report is very large (~270 MB+); still a direct PDF if requested.

## Pitfalls

- **No directory listing** — `GET /themes/parakh/prs-files/` returns **403**; discover filenames only from `/prs` link `href`s.
- **Slow hub HTML** — `curl` of `/prs` can take several minutes; do not assume the hub is down until the GET times out.
- **Filename guessing** — wrong paths 404; always copy `href` from `/prs` (Assessment vs Operational vs Analysis labels sit on the same page).

## Non-goals

- `dashboard.parakh.ncert.gov.in` authenticated dashboards.
- NAS or state board exam papers.

## Honest statuses

| Situation | `fetch_status` |
|-----------|----------------|
| PDF downloaded and `%PDF` | `fetched` |
| Only HTML pages, no matching PDF on `/prs` | `listing_only` |
| Wrong filename guessed (404) | retry via `/prs` links |

---

## PGI

# PGI and PGI-D (Performance Grading Index)

Official **Performance Grading Index (PGI)** for school education is published by the Ministry of Education (Department of School Education and Literacy) and surfaced on:

- **PGI portal:** `https://pgi.udiseplus.gov.in/` (interactive SPA)
- **DoSEL statistics:** `https://www.dsel-education.gov.in/en/statistics` (tables for PGI State and PGI District reports)
- **Legacy PDF paths** under `education.gov.in/sites/upload_files/mhrd/files/statistics-new/` (may move; verify with HEAD)

Scope includes **PGI (states/UTs)** and **PGI-D (districts)**.

## Workflow

1. **Parse the request** — state/UT report vs district report vs live portal scores; reporting year if given.
2. **Choose surface:**
   - **Interactive grades / dashboards** → start at `https://pgi.udiseplus.gov.in/` (Angular SPA; `curl` on `/` returns ~1.7 KB shell only). Document what is visible without login. Often `listing_only` or `metadata_only` for curl-only agents. Public hash routes include `#/statepgi/home`, `#/statepgi/national-findings`, `#/statepgi/indicators`, `#/statepgi/state/{sId}` (e.g. `101` = Jammu & Kashmir). UI year selector shows **2017–18 … 2020–21** — older than CMS national PDFs. District national PDFs are on DoSEL, not this SPA. **No national consolidated PGI/PGI-D PDF** on the portal — use DoSEL CMS below.
   - **Per-state performance PDFs (portal host only):** `https://pgi.udiseplus.gov.in/performance/{stateCode}/{stateCode}.pdf` — verified for state code `101` (`application/pdf`, `%PDF`). State codes are **not** discoverable from the static shell; read from the SPA (state detail route or `main.*.js` / `pgi_documentDownload_url`). Nav “Report” brochure URLs such as `PGI-State-2024-25-Brochure.pdf` may return **404** — do not rely on them.
   - **Downloadable national PDF reports (PGI / PGI-D)** → DoSEL statistics portal:
     - Listing UI: `https://www.dsel-education.gov.in/en/statistics` (Next.js; table often **does not hydrate** in headless browser — empty snapshot or alert-only shell). Prefer **CMS API** over clicking Download.
     - Alternate filter URL (also JS): `https://dsel.education.gov.in/statistics?field_statistics_category_target_id=305`
     - **CMS API (anonymous, reliable for current rows):**
       ```
       https://www.dsel-education.gov.in/cms/wp-json/wp/v2/search?search=PGI&subtype=any&per_page=20
       ```
       Match `central_documents` titles such as **PGI for States/UTs Report for 2024-2025** or **PGI for Districts Report for 2024-2025**. Disambiguate by title — do not substitute PGI-D for PGI.
     - For each document id `N`, fetch `.../wp-json/wp/v2/central_documents/N` → read ACF field `pdf` (attachment id) → fetch `.../wp-json/wp/v2/media/{id}` → use `source_url` (under `https://www.dsel-education.gov.in/static/uploads/.../*.pdf`; may 302 from bare `dsel-education.gov.in` to `www`).
     - **2024–25 examples (ids may change next cycle):** States/UTs `central_documents/43449` → `media/43450`; PGI-D `43420` → `media/43421`.
     - Download with `curl -sL -f` and verify `%PDF`.
3. **When a direct PDF URL is known** — verify with `curl -sI`, then `curl -sL -f -o …` and check `%PDF`.
4. **Indexed legacy example** (verify before use; may 404 in some networks):
   ```
   https://www.education.gov.in/sites/upload_files/mhrd/files/statistics-new/PGIS.pdf
   ```
   (PGI 2.0 for States/UTs, 2022–23 & 2023–24 per document title when available.)
5. **Report honestly** if PDF bytes cannot be retrieved anonymously.

## Known dead paths (do not retry)

| URL pattern | Result |
|-------------|--------|
| `…/statistics/report_in_PDF/PGIS2425.pdf`, `PGID2425.pdf`, `pgi-d.pdf` | 404 after redirect to `www.dsel-education.gov.in` |
| `…/sites/default/files/PGIS.pdf`, `pgi_20_21.pdf` on `education.gov.in` | 404 HTML |
| `https://www.education.gov.in/sites/upload_files/mhrd/files/statistics-new/PGIS.pdf` | 404 HTML (indexed elsewhere; verify with HEAD) |
| `https://dsel.education.gov.in/en/node/3437` | 404 Page Not Found |
| `https://pgi.udiseplus.gov.in/PGI-State-*-Brochure.pdf` (nav Report links) | 404 |
| `https://www.dsel-education.gov.in/en/search`, `/en/reports` | Does not expose a useful table UI for this workflow |

## Honest `fetch_status` values

| Situation | Status |
|-----------|--------|
| PDF saved, `%PDF` verified | `fetched` |
| Official portal loads but no file URL resolved | `listing_only` |
| Statistics page needs JS; download link not resolved | `listing_only` |
| Known official PDF URL returns 404/HTML error page | `source_gap` |
| Dashboard metrics only, no file | `metadata_only` |

## Non-goals

- Raw UDISE+ unit-level microdata exports.
- Non-PGI rows on the statistics portal (e.g. examination results) unless the user explicitly asks.

## PGI vs PGI-D

| Product | Typical statistics row title |
|---------|------------------------------|
| PGI (states/UTs) | “PGI for States/UTs Report …” |
| PGI-D (districts) | “PGI for Districts Report …” |

Do not substitute one for the other.

---

## Learning Outcomes

# NCERT Learning Outcomes

**Fetch family:** listing-crawler → direct PDF  
**Supported formats:** PDF (stage-wise learning outcome documents); HTML listing only as discovery step.

## What this source offers

Official NCERT **Learning Outcomes** documents by school stage (foundational, elementary, secondary, higher secondary) and language, linked from a single NCERT landing page.

## Official domains

- `https://ncert.nic.in/learning-outcome.php?ln=en` (primary listing; `www` mirror may also serve notice PDFs)

## Discovery

1. Fetch the landing page with curl (HTML).
2. Extract links ending in `.pdf` (relative paths under `pdf/publication/otherpublications/` are common).
3. Resolve relative links to absolute:

```text
https://ncert.nic.in/{relative-path}
```

4. Match the user’s stage (foundational / elementary / secondary / higher secondary) and language (English, Hindi, Urdu) from **listing anchor text**, not guessed filenames.

### Listing layout (`learning-outcome.php?ln=en`)

| Stage | Listing pattern | Language links on page |
|-------|-----------------|--------------------------|
| Foundational | Single row: “Learning Outcome for the Foundational Stage” | English only — no Hindi/Urdu siblings on the listing |
| Elementary | One row with `|| English || Hindi || Urdu` | `tilops101.pdf`, `Learning_Outcomes–Hindi.pdf`, `Learning_outcomes_urdu.pdf` |
| Secondary | One row with `|| English || Hindi` | `learning_outcomes.pdf`, `learning_outcomes_Hindi.pdf` (underscore before `Hindi`) |
| Higher secondary | Single row: “Learning Outcomes at the Higher Secondary Stage - Draft” | Draft only on `?ln=en` — no separate Hindi/Urdu links |

Typical anchor text (use for stage/medium match): “Learning Outcomes at Elementary Stage … **English**”, “Learning Outcomes at Secondary Stage … **English**”, etc.

## URL and link patterns (by format)

| Stage (typical) | Example path segment | Notes |
|-----------------|----------------------|-------|
| Foundational | `Learning_Outcome_for_the_Foundational_Stage.pdf` | English foundational LO |
| Elementary | `tilops101.pdf`, `Learning_Outcomes–Hindi.pdf`, `Learning_outcomes_urdu.pdf` | English ~16 MB — use `-m 120` |
| Secondary | `learning_outcomes.pdf`, `learning_outcomes_Hindi.pdf` | ~5–6 MB each |
| Higher secondary | `Draft_LO.pdf` | draft LO ~9 MB — use `-m 120` |

Alternate notice PDF: `https://www.ncert.nic.in/pdf/notice/learning_outcomes.pdf`

## How to fetch

1. Open listing → pick the PDF URL for the requested stage/language.
2. Download with curl (not WebFetch for binaries):

```bash
curl -fL -o learning-outcomes.pdf "https://ncert.nic.in/pdf/publication/otherpublications/{filename}.pdf"
```

3. If download is slow, increase timeout: `curl -fL -m 120 ...`

## Verify

```bash
head -c 4 learning-outcomes.pdf | xxd   # expect 25 50 44 46 (%PDF)
```

## Access barriers

- Anonymous access works for official stage/language PDF URLs.
- `tilops101.pdf` (elementary English) and `Draft_LO.pdf` often need `curl -m 120`; retry once before `timeout`.
- Probe large or slow URLs with range fetch: `curl -sfL -r 0-4 -o /dev/null URL` (expect `%PDF` in first bytes).

## Rights / license

NCERT site copyright footer applies; government educational use.

## fetch_status for this source

| Status | When |
|--------|------|
| `fetched` | PDF on disk, `%PDF` verified |
| `listing_only` | Could not resolve a stage/language link on the official page |
| `timeout` | Official URL exists but transfer failed after retry |

## Disambiguation / known source gaps

- Do not confuse with textbook chapter PDFs (`textbook/pdf/`).
- Do not guess PDF paths — always resolve from the listing (elementary English is `tilops101.pdf`, not `learning_outcomes.pdf`).
- Elementary Hindi uses an en-dash in the filename (`Learning_Outcomes–Hindi.pdf`); secondary Hindi uses underscore (`learning_outcomes_Hindi.pdf`).
- `https://www.ncert.nic.in/pdf/notice/learning_outcomes.pdf` is a notice PDF, not a stage LO document — use only when the user asks for that notice, not for stage-wise LO.

---

## Teacher Materials
