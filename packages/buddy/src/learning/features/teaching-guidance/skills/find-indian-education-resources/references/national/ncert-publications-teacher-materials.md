# NCERT Publications, Teacher Materials, and Periodicals

Use this reference when the user wants NCERT material that is not an ordinary student textbook: teacher support, source books, handbooks, publication listings, journals, periodicals, or issue PDFs. Natural requests may sound like “teacher handbook”, “science source book”, “ECCE package”, “NCERT journal issue”, “Indian Educational Review PDF”, “publication catalogue”, or “print material”.

This file helps the agent locate:

- **Teacher-facing material**: DESM handbooks, source books, teacher guides, ECCE/professional-development PDFs.
- **Publication/listing material**: NCERT publication and print-material pages.
- **Periodicals**: journal series, issue/month/year discovery, and official issue PDFs.

Use this when the request is about supporting teachers, research/periodical publications, or non-textbook NCERT material. Use `textbooks-and-board.md` for student textbooks and CBSE board practice material.

## Contents

- [NCERT Material for Teachers (DESM)](#ncert-material-for-teachers-desm)
- [NCERT Publications and Print Materials](#ncert-publications-and-print-materials)
- [NCERT Journals and Periodicals](#ncert-journals-and-periodicals)

---

# NCERT Material for Teachers (DESM)

**Fetch family:** listing-crawler → direct PDF  
**Supported formats:** PDF handbooks, source books, teacher guides, ECCE packages.

## What this source offers

DESM **Material for Teachers** — teacher handbooks, source books on assessment, subject teacher guides, ECCE/professional-development PDFs linked from one NCERT index page.

## Official domains

- `https://ncert.nic.in/desm/material-for-teachers.php`

## Discovery

1. Fetch the HTML listing with curl (default page is Hindi; add `?ln=en` when matching English anchor labels).
2. Collect `href` values pointing to `.pdf` (often relative `pdf/...` under `/desm/`).
3. Resolve to absolute:

```text
https://ncert.nic.in/desm/pdf/{filename}
```

(URL-encode special characters when curling — e.g. `ChapterIVLanguage%28English%29.pdf` for parentheses, `teacher%27shandbook.pdf` for apostrophes.)

4. Match user request to link anchor text (class, subject, medium, handbook vs source book). Do not download if no listing link matches.

## URL and link patterns (by format)

| Resource type | Example filename (on listing) |
|---------------|-------------------------------|
| Assessment source book chapter | `ChapterIVLanguage(English).pdf` |
| Science source book VI–VIII (English) | `SB_ScienceVI-VIII.pdf` (~100 MB+ — use `-m 120` on first curl) |
| Science source book VI–VIII (Hindi) | `SB_VigyanVI-VIII.pdf` |
| Mathematics source book VI–VIII | `SB_MathsVI-VIII.pdf` |
| Teachers’ handbook (Class VI Science) | `teacher'shandbook.pdf` |
| Class 1–2 handbook | Not on DESM listing — return `listing_only`; DEE hosts `Revised_Teachers_Handbook_Class_1-2.pdf` under `dee/pdf/` (publications section); guessed `desm/pdf/*Class_1-2*` URLs 404 |
| Environmental education (HS) | `content.pdf` (not `teacher_hs.pdf` — discover from listing) |

## How to fetch

```bash
curl -fL -m 90 -o teacher-material.pdf "https://ncert.nic.in/desm/pdf/{encoded-filename}.pdf"
```

Prefer resolving the exact link from the listing over guessing filenames.

## Verify

```bash
head -c 4 teacher-material.pdf | xxd   # %PDF
```

## Access barriers

- Large source books (e.g. `SB_ScienceVI-VIII.pdf`) can exceed 100 MB; start with `-m 120` rather than default 90s.
- Other handbook URLs may be slow; retry with longer `-m` before `timeout`.
- No login required for public DESM PDFs.

## Rights / license

NCERT copyright on site materials.

## fetch_status for this source

| Status | When |
|--------|------|
| `fetched` | PDF saved and verified |
| `timeout` | Official link found but transfer failed after retry |
| `listing_only` | Could not match user request to any listing link |

## Disambiguation / known source gaps

- Not for student textbooks — use NCERT textbook workflow if user asks for a class textbook chapter.
- Class 1–2 teachers handbook removed from DESM index; do not guess `desm/pdf/Teachers_Handbook_Class_1-2.pdf` (404). Honest `listing_only` is correct for DESM-only workflow.

---

## Publications

# NCERT Publications and Print Materials

**Fetch family:** listing-crawler → direct PDF (some catalogue HTML / EPUB-style flows)  
**Supported formats:** PDF catalogues and reports; HTML listings; occasional non-PDF flows on DEE titles.

## What this source offers

NCERT **publication catalogues**, **other publications** (handbooks, reports), and **DEE print materials** — official lists with linked PDFs (and sometimes EPUB/app paths).

## Official domains

| Surface | URL |
|---------|-----|
| Publication list | `https://ncert.nic.in/list-publication.php?ln=en` |
| Other publications | `https://ncert.nic.in/other-publications.php?ln=en` |
| DEE print materials | `https://ncert.nic.in/dee/print-materials.php?ln=en` |

## Discovery

1. Choose landing page by user intent:
   - **Catalogue / price list / publication inventory** → `list-publication.php`
   - **Handbooks, research reports, thematic books** → `other-publications.php`
   - **DEE reports and print-series titles** → `dee/print-materials.php`
2. Crawl HTML for `.pdf` links (on `list-publication.php`, legacy `list_of_publication.pdf` anchors are often **commented out**; use the live card links — e.g. **NCERT General Publications - Catalogue** → `Checklist_General_Publication_UN420.pdf`, textbook inventory → `Checklist_Textbooks_UN416.pdf`).
3. Resolve paths:
   - `uploads/publication/...` → `https://ncert.nic.in/uploads/publication/...`
   - `pdf/publication/otherpublications/...` → `https://ncert.nic.in/pdf/publication/otherpublications/...`
   - `dee/pdf/...` → `https://ncert.nic.in/dee/pdf/...`

## URL and link patterns (by format)

| Type | Example |
|------|---------|
| Master publication list (legacy) | `uploads/publication/list_of_publication.pdf` — **may return HTTP 403** for direct/scripted GET; use live checklist PDFs below |
| General publications catalogue (live) | `uploads/publication/Checklist_General_Publication_UN420.pdf` |
| Textbook catalogue (live) | `uploads/publication/Checklist_Textbooks_UN416.pdf` |
| NEP books list | `uploads/publication/NEP_Books_2020.pdf` |
| Other publication title | `pdf/publication/otherpublications/tioi101.pdf` |
| Yoga handbook (upper primary, EN) | `pdf/publication/otherpublications/Yoga_A_Healthy_Way_of_Living_Upper_Primary_Stage.pdf` (~45 MB) |
| Arts education training (PT Vol. I) | `pdf/publication/otherpublications/Training_Package_on_Arts_Education_for_PT_Vol-I.pdf` (Vol. II: `..._Vol-II.pdf`) |
| DEE report | `dee/pdf/Review_CCE_States_UT_2016.pdf` (listing href may be `pdf/Review_CCE_States_UT_2016.pdf` under `dee/print-materials.php`) |

## How to fetch

```bash
curl -fL -o publication.pdf \
  -H "Referer: https://ncert.nic.in/list-publication.php?ln=en" \
  "https://ncert.nic.in/{resolved-path}.pdf"
curl -sI -H "Referer: https://ncert.nic.in/{resolved-path}" \
  "https://ncert.nic.in/{resolved-path}.pdf"   # optional pre-check
```

Use the matching landing page as `Referer` (`other-publications.php`, `dee/print-materials.php`, etc.) for `uploads/publication/` and `pdf/publication/` paths.

If only an HTML/EPUB reader opens with no stable PDF URL, set `fetch_status: listing_only` and record `landing_url`.

## Verify

PDF: `%PDF` magic bytes. Catalogue PDFs may be large; use `-m 120` if needed.

## Access barriers

- `uploads/publication/list_of_publication.pdf` — **HTTP 403** even with Referer/cookies; body: `Access denied. Only allowed via ncert.nic.in or ncert.gov.in`. Use live **UN420** / **UN416** checklist PDFs from `list-publication.php` instead.
- `Checklist_General_Publication_UN420.pdf` is large (~80 MB); keep `curl -m 120` (or higher).
- `other-publications.php` mixed reliability — when ambiguous, prefer a `dee/pdf/` or `uploads/publication/` URL discovered on `dee/print-materials.php` or `list-publication.php`.

## Rights / license

NCERT / MoE publication terms on site.

## fetch_status for this source

| Status | When |
|--------|------|
| `fetched` | PDF verified on disk |
| `listing_only` | Official page found but no direct PDF for requested title |
| `wrapper_only` | Link routes to non-PDF app/EPUB shell without public binary |

## Disambiguation / known source gaps

- Learning outcome stage PDFs belong on `learning-outcome.php`, not publication catalogues.
- Journals are a separate NCERT surface (`journals-periodicals.php`).

---

## Journals Periodicals

# NCERT Journals and Periodicals

Official NCERT journal issues published as PDFs (some older VTTE issues also offer EPUB). Use only `ncert.nic.in`. Do not use third-party mirrors.

## Workflow

1. **Parse the request** — journal name (or abbreviation), issue period (month/year/volume if given), and language hint if any.
2. **Open the listing** — fetch the journals catalog page and locate the matching series section.
3. **Match the issue link** — map the user’s journal title to a `series_slug` folder and an issue `href` (filenames are opaque).
4. **Download** — `curl` the direct PDF (or EPUB if explicitly requested and linked).
5. **Verify** — confirm PDF magic bytes; optionally read page 1 for journal/issue title.
6. **Report** — metadata contract fields including `landing_url`, `source_url`, `local_path`, `format`, `fetch_status`, `verification_status`.

If multiple issues match, prefer the newest issue unless the user named a specific year or volume.

## Landing page

```text
https://ncert.nic.in/journals-and-periodicals.php
```

Hindi navigation: `?ln=hi` (same PDF paths).

## Listing structure

- One Bootstrap **accordion panel per journal**; every issue link is in the static HTML (~170 KB). **No JSON API** — `curl` the English listing is enough (no browser).
- Issues are grouped by year; within a series the **newest issues usually appear first** in that panel.
- Row labels are often **Hindi** (e.g. `जनवरी 2024`, `जुलाई 2025`). VTTE also uses **अंक** (issue) and **खंड** (volume), e.g. `अंक–1, खंड–14, जुलाई, 2025` → `VTTE_July_2025_Issue_I.pdf`.
- Some older VTTE rows list **PDF | EPUB** on the same line — pick the `href` whose extension matches the requested format.

## Series slugs (directory names)

Issues live under:

```text
https://ncert.nic.in/pdf/publication/journalsandperiodicals/{series_slug}/{filename}.pdf
```

Known `series_slug` values from the live listing:

| User-facing journal (examples) | `series_slug` |
|--------------------------------|---------------|
| Voices of Teachers and Teacher Educators (VTTE) | `vtte` |
| Bhartiya Adhunik Shiksha (BAS) | `bhartiyaadhunikshiksha` |
| Indian Educational Review | `indianeducationalreview` |
| Indian Journal of Educational Technology | `indianjournalofeducationaltechnology` |
| Journal of Indian Education | `journalofindianeducation` |
| Prathmik Shikshak | `prathmikshikshak` |
| School Science | `schoolscience` |
| The Primary Teacher | `theprimaryteacher` |

Do **not** guess `{filename}` — extract it from the listing HTML for the requested issue label.

## Discovery commands

```bash
curl -fsSL -A "BuddyFetch/1.0" "https://ncert.nic.in/journals-and-periodicals.php" -o /tmp/journals.html
# Scope to the series_slug path segment, then month/year or abbreviation:
rg -n "journalsandperiodicals/vtte/" /tmp/journals.html
rg -n "bhartiyaadhunikshiksha|BAS_|जनवरी 2024" /tmp/journals.html
rg -n "indianeducationalreview|IER-|जुलाई 2025" /tmp/journals.html
```

## Download

```bash
curl -fL -A "BuddyFetch/1.0" -o issue.pdf "https://ncert.nic.in/pdf/publication/journalsandperiodicals/{series_slug}/{filename}.pdf"
file issue.pdf   # expect PDF document
```

For EPUB when the listing offers it:

```bash
curl -fL -o issue.epub "https://ncert.nic.in/pdf/publication/journalsandperiodicals/vtte/Voices_Teacher_Educator_2016.epub"
```

## Verify

```bash
file issue.pdf                              # PDF document
pdftotext -f 1 -l 1 issue.pdf - | head -20  # journal title, volume, month/year on cover

file issue.epub                             # EPUB document
unzip -l issue.epub | head                  # mimetype, OEBPS/
```

After parsing the listing, confirm the chosen `href` contains `/journalsandperiodicals/{series_slug}/` before downloading (filenames alone are not enough).

**Known issue filenames:** `VTTE_Issue_December_2025.pdf`, `VTTE_July_2025_Issue_I.pdf`, `BAS_Jan2024.pdf`, `IER-JULY2025.pdf`, `Voices_Teacher_Educator_2016.epub`.

## Disambiguation

- **VTTE** vs **BAS** vs **School Science** are different `series_slug` trees — match the journal name before picking a PDF.
- Issue labels on the page may say “December 2025”, “July 2025 Issue I”, or Hindi month words; tie-break toward the label closest to the user’s date words (not filename spelling).
- **Indian Educational Review** filenames vary widely (`IER-JULY2025.pdf`, `IER-January-2025.pdf`, `IER_July_17.pdf`) — always take the `href` from the IER accordion row.
- Older issues use inconsistent filename casing (`BAS_Jan2024.pdf`, `bas_jan_2018.pdf`).
- For “latest” without a month: prefer the **first** issue link in that journal’s accordion panel unless the user named a specific period.

## Failure modes

| Situation | `fetch_status` |
|-----------|----------------|
| PDF downloaded and verified | `fetched` |
| Listing found but no matching issue link | `listing_only` |
| Link returns 404 | `not_found` |
| Server error / timeout after retry | `inconclusive` |

## Rights note

NCERT standard copyright footer (CIET/NCERT/NIC). No open-content license stated on the listing page.

---

## NCERT eContent Guidelines
