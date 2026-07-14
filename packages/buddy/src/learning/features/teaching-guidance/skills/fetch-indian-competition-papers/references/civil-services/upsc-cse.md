# UPSC CSE

Fetch official UPSC Civil Services Examination (CSE) question papers — Prelims and Mains — from the UPSC archive. Only `www.upsc.gov.in`. No coaching sites. No mirrors.

## Domain

`https://www.upsc.gov.in`

## Landing pages

Two pages. Both are server-rendered Drupal HTML. GET with `curl` — PDF links are in the raw HTML; no JavaScript execution required.

| Page | URL | Holds |
|------|-----|-------|
| Recent | `https://www.upsc.gov.in/examinations/previous-question-papers` | Most recent ~2–3 years (currently 2024–2026) |
| Archives | `https://www.upsc.gov.in/examinations/previous-question-papers/archives` | Older years (currently 2016–2023) |

Check **recent first**. If the target year is absent, check **archives**. If absent from both, report a status (see Failure modes).

## How the listing is structured

Each exam+year is its own `<table>` with a `<caption>` and a `<ul class="arrows">` of papers:

```html
<table>
  <caption>Civil Services (Preliminary) Examination, 2026</caption>
  ...
  <ul class="arrows">
    <li>General Studies Paper - I<a href="https://www.upsc.gov.in/sites/default/files/QP_CSP_2026_GENERAL_STUDIES_PAPER-I_25052026.pdf"> (34.19 MB) </a></li>
    <li>General Studies Paper - II<a href="https://www.upsc.gov.in/sites/default/files/QP_CSP_2026_GENERAL_STUDIES_PAPER-II_25052026.pdf"> (26.46 MB) </a></li>
  </ul>
</table>
```

- **`<caption>`** identifies exam + stage + year.
- **`<li>` text** is the human-readable paper/subject name.
- **`<a href>`** is the direct PDF URL.

## Discovery procedure

Follow exactly.

1. GET the recent page:

```bash
curl -sL "https://www.upsc.gov.in/examinations/previous-question-papers"
```

2. Find the target table. Match a `<caption>` that contains **all of**:
   - `Civil Services` (required — other exams like "Engineering Services (Main)" also say "Main")
   - stage keyword: `Preliminary` → prelims, `Main` → mains
   - the target year (e.g. `2025`)
   - Match case-insensitively. The 2017 prelims caption is all-caps: `CIVIL SERVICES (PRELIMINARY) EXAM. 2017` — tolerate `Examination` vs `EXAM.`.
3. Within that table, find the target paper. Match the `<li>` text against the requested paper/subject. Match case-insensitively on distinctive tokens, not the full string — the listing abbreviates (e.g. "Animal Husb. and Vet. Science", "General Studies Paper - I").
4. Extract the `href` ending in `.pdf`. Preserve it verbatim — some hrefs contain `%20` (URL-encoded spaces). Do not re-encode or decode.
5. If the target year is not on the recent page, repeat steps 1–4 against the **archives** page:

```bash
curl -sL "https://www.upsc.gov.in/examinations/previous-question-papers/archives"
```

6. If no matching caption exists on either page → see Failure modes.

## Stage → paper mapping

### Prelims (`Civil Services (Preliminary) Examination`)

Two papers only:
- `General Studies Paper - I`
- `General Studies Paper - II` (CSAT)

If the user says "CSAT", that is General Studies Paper - II. If the user says "GS" / "General Studies" without a paper number for prelims, default to Paper - I and note Paper - II is also available.

### Mains (`Civil Services (Main) Examination`)

- `Essay`
- `General Studies Paper - I` / `II` / `III` / `IV`
- Compulsory language papers: `English Compulsory`, `Hindi Compulsory`, and Indian Language Compulsory (Assamese, Bengali, Bodo, Gujarati, Kannada, Kashmiri, Maithili, Malayalam, Marathi, Nepali, Odia, Punjabi, Sanskrit, Sindhi, Tamil, Telugu, Urdu — availability varies by year).
- Optional subject `Paper - I` and `Paper - II`: Agriculture, Animal Husbandry & Veterinary Science, Anthropology, Botany, Chemistry, Civil Engineering, Commerce & Accountancy, Economics, Electrical Engineering, Geography, Geology, History, Law, Management, Mathematics, Mechanical Engineering, Medical Science, Philosophy, Physics, Political Science & International Relations, Psychology, Public Administration, Sociology, Statistics, Zoology.
- Literature optional `Paper - I` / `Paper - II`: same language list as above plus others (English Literature, Hindi Literature, etc.).

If the user asks for a "mains optional" without naming the subject, you cannot resolve it — ask, or report `not_found` with a note listing available subjects from the table.

## Known PDF URL patterns (reference only)

Do not guess URLs. Filename conventions change across years and even within a single year. Examples observed live:

- `https://www.upsc.gov.in/sites/default/files/QP_CSP_2026_GENERAL_STUDIES_PAPER-I_25052026.pdf`
- `https://www.upsc.gov.in/sites/default/files/QP-CSP-25-GENERAL-STUDIES-PAPER-I-26052025.pdf`
- `https://www.upsc.gov.in/sites/default/files/QP-CSP-24-GENERAL-STUDIES-PAPER-I-180624.pdf`
- `https://www.upsc.gov.in/sites/default/files/CSP_2020_GS_Paper-1.pdf`
- `https://www.upsc.gov.in/sites/default/files/QP-CSM-24-AGRICULTURE-PAPER-I-031024.pdf`
- `https://www.upsc.gov.in/sites/default/files/AGRICULTURE-PAPER-I-QP-CSM-25-010925.pdf` (note: subject-first, reversed order in 2025)
- `https://www.upsc.gov.in/sites/default/files/ESSAY-QP-CSM-25-010925.pdf`

The host path `https://www.upsc.gov.in/sites/default/files/` is stable. The filename is not. Always extract the href from the listing. Never synthesize a URL from a pattern.

## Verification

Mandatory before returning `fetched`. GET the extracted PDF URL and confirm all three:

1. **HTTP 200** (HTTP/2 200 or HTTP 1.1 200).
2. **`Content-Type: application/pdf`** (exact; reject `text/html` — that would be an error/redirect page).
3. **Body inspection** — `Content-Length` > 0, body starts with `%PDF`. Run `pdftotext` on the downloaded PDF; confirm it contains exam content (questions, answer mappings, booklet headers). A scanned-image notice with no text layer is not a paper or answer key. For image-scan PDFs where `pdftotext` returns empty, verify via one of: (a) `pdftoppm` to split PDF into page images, then read the images directly if you are an image-capable model; (b) `tesseract` OCR on page 1; (c) filename + caption match.

```bash
curl -sL -o paper.pdf "https://www.upsc.gov.in/sites/default/files/<filename>.pdf"
file paper.pdf          # PDF document, version X.Y
pdftotext paper.pdf -  # should contain exam text (questions, headers)
```

If any check fails, do not return `fetched`. Report `unreachable` or `unexpected_type` in `verification_status` and set `fetch_status` accordingly.

## Metadata fields (return these)

| Field | Required | For upsc-cse |
|-------|----------|--------------|
| `title` | yes | e.g. "UPSC CSE Prelims 2025 General Studies Paper I" |
| `exam` | yes | `UPSC CSE` |
| `year` | yes | e.g. `2025` |
| `session` | | Prelims: `Preliminary`. Mains: `Main`. For CDS/NDA-style sessions (not CSE) n/a. |
| `paper` | yes | e.g. `General Studies Paper I`, `General Studies Paper II (CSAT)`, `Essay`, `GS III` |
| `subject` | | Mains optional subject name, e.g. `Agriculture`, `Anthropology`. Empty for GS/Essay. |
| `stage` | yes | `prelims` or `mains` |
| `medium` | | `English` (default). Set only if the `<li>` text or filename indicates Hindi/regional. |
| `source_url` | yes | The direct `https://www.upsc.gov.in/sites/default/files/*.pdf` URL extracted from the listing. |
| `landing_url` | yes | The page (recent or archives) where the link was found. |
| `local_path` | | Path where Buddy saved the file, if downloaded. |
| `format` | yes | `PDF` |
| `fetch_status` | yes | `fetched` / `source_gap` / `listing_only` / `not_found` |
| `verification_status` | yes | `verified` / `unreachable` / `unexpected_type` |
| `extraction_date` | yes | ISO date of discovery (today). |
| `notes` | | Caveats: "English only", "Optional subject abbreviated in listing as ...", "Paper not yet posted for this year", etc. |

### Metadata formatting notes

- **Canonical paper name in `paper`:** Use the full canonical paper name in the `paper` field (e.g. `General Studies Paper III`, not `GS III`). Abbreviations are acceptable in `notes` but not in the structured `paper` field.
- **Optional subject paper formatting:** For optional subject papers, use the exact formatting from the official listing including hyphens (e.g. `Psychology Paper - I`, not `Psychology Paper I`).
- **Empty field rendering:** For empty metadata fields (e.g. `subject` for GS/Essay papers), leave an empty string or use `(empty — GS)` for General Studies papers. Avoid verbose descriptive placeholders.

## Failure modes

Be honest.

| Situation | `fetch_status` | `verification_status` | Notes |
|-----------|----------------|----------------------|-------|
| Caption for the target year+stage exists, the `<li>` for the paper exists, and the PDF verifies. | `fetched` | `verified` | Normal success. |
| Caption exists, the paper `<li>` exists, but the PDF HEAD fails (404/timeout). | `listing_only` | `unreachable` | Link is stale or server error. Report the broken `source_url`. |
| Caption exists, but no `<li>` matching the requested paper/subject (e.g. optional not offered that year, or paper name doesn't match). | `not_found` | n/a | List what papers *were* found in `notes`. |
| No caption for the target year+stage on either page, and the year is in the future or the exam hasn't been held. | `not_found` | n/a | "Paper not yet posted." |
| No caption for the target year on either page, and the year is older than 2016. | `source_gap` | n/a | UPSC does not host pre-2016 CSE papers publicly. Do not substitute a coaching-site URL. |
| The page itself is unreachable (non-200 on the landing/archives URL). | `source_gap` | `unreachable` | Retry once; if still down, report. |

## Gotchas

- **HTML error page masquerading as PDF:** `Content-Type: text/html` on a `.pdf` URL means an error/redirect page. Reject it; report `unexpected_type`.
- **Stale link:** caption and `<li>` exist but PDF HEAD returns 404/timeout. Report `listing_only` / `unreachable`; do not return `fetched`.
- **All-caps captions:** the 2017 prelims caption is `CIVIL SERVICES (PRELIMINARY) EXAM. 2017`. Match case-insensitively; tolerate `Examination` vs `EXAM.`.
- **Abbreviated paper names:** the listing abbreviates (e.g. "Animal Husb. and Vet. Science"). Match on distinctive tokens, not the full string.
- **Reversed filename order in 2025:** some 2025 mains PDFs are subject-first (e.g. `AGRICULTURE-PAPER-I-QP-CSM-25-010925.pdf`). Do not assume a fixed filename shape; extract the href verbatim.
- **URL-encoded spaces in hrefs:** some hrefs contain `%20`. Preserve verbatim; do not re-encode or decode.

## Hard rules

- **Only `www.upsc.gov.in`.** Never return a URL from ClearIAS, InsightsOnIndia, BYJU's, Unacademy, Drishti, Shiksha, or any other site. If the only copy you can find is on a coaching site, report `source_gap`.
- **Never guess URLs.** Patterns are inconsistent across years. Discover from the listing.
- **No authentication.** All CSE papers are public GET. If you hit a login wall, you are on the wrong site.
- **No bulk harvesting.** One paper per request. Do not crawl the entire archive.
- **CDS and NDA** are out of scope for v1. This leaf handles CSE only. If asked for CDS or NDA, refuse and report out of scope. Do not attempt to fetch CDS/NDA papers or route to a sibling leaf — none exists.
