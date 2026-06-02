# National Missions, Data, and Scheme Documents

Use this reference when the user wants public government material about an education mission, scheme, data system, dashboard, implementation report, or initiative. Natural requests may sound like “FLN benchmarking report”, “NIPUN document”, “school statistics report”, “UDISE PDF”, “scheme guideline”, “Samagra Shiksha document”, “CIET initiative brochure”, or “government dashboard report”.

This file helps the agent locate:

- **Mission/scheme documents**: NIPUN Bharat and Samagra Shiksha PDFs, report libraries, and planning/guideline documents.
- **School data and dashboard artifacts**: UDISE+ public reports, listed documents, and document API routes.
- **Initiative material**: CIET/NCERT initiative pages and public brochures.

Use this for system-level missions, schemes, dashboards, and public education data. If the request is about assessment performance or learning outcomes, use `assessment-outcomes.md` instead.

## Contents

- [NIPUN Bharat — mission documents (static PDF)](#nipun-bharat-mission-documents-static-pdf)
- [Samagra Shiksha — scheme documents (static PDF)](#samagra-shiksha-scheme-documents-static-pdf)
- [UDISE+ (Unified District Information System for Education Plus)](#udise-unified-district-information-system-for-education-plus)
- [CIET Initiatives (NCERT)](#ciet-initiatives-ncert)

---

# NIPUN Bharat — mission documents (static PDF)

**Publisher:** Ministry of Education — NIPUN Bharat mission  
**Official domains:** `nipunbharat.education.gov.in`; supplementary PDFs may appear on `education.gov.in`  
**Fetch family:** `static-pdf` (portal `/fls/file/` + government upload URLs)  

## What this source offers

- Foundational literacy and numeracy **benchmark** and toolkit PDFs on the mission portal
- **FLS report library** at `/fls/file/` (national benchmarking PDF, per-state and district FLS reports) — not teacher-training module PDFs
- Mission guidelines and planning documents (often linked from DoSEL / MoE; URLs move)
- Teacher professional development is routed to **NISHTHA** / **DIKSHA FLN**, not `/fls/file/`
- HTML mission pages for context (optional)

## URL and link patterns (by format)

| Format | Pattern | Example |
|--------|---------|---------|
| PDF (portal) | `https://nipunbharat.education.gov.in/fls/file/{File_Name}.pdf` | `.../Benchmarking_for_ORF_and_Numeracy.pdf` |
| PDF (state FLS) | `https://nipunbharat.education.gov.in/fls/file/state/{state}.pdf` | Crawl `sList.aspx` for exact state slug |
| PDF (district FLS) | `https://nipunbharat.education.gov.in/fls/file/district/{district}.pdf` | Crawl `dList.aspx` for exact district slug |
| PDF (MoE upload) | `https://education.gov.in/sites/upload_files/mhrd/files/...pdf` | Search MoE site when DoSEL 404s |
| File library index | `https://nipunbharat.education.gov.in/fls/{page}.aspx` | `RCard.aspx`, `sList.aspx`, `dList.aspx`, `fls.aspx` |

## File library inventory

Crawl **`/fls/RCard.aspx`**, **`sList.aspx`**, **`dList.aspx`**, **`fls.aspx`** to list linked `file/...pdf` paths. Index pages may return **302 → `/Logout.aspx`** on `HEAD`; the **HTML body still lists PDF hrefs** — use `curl -sL` (or fetch body without treating 302 as empty).

| Asset class | Count / pattern | Notes |
|-------------|-----------------|-------|
| National benchmarking | `file/Benchmarking_for_ORF_and_Numeracy.pdf` | ~52 MB |
| State FLS reports | `file/state/{state}.pdf` | 36 states in crawled index |
| District FLS reports | `file/district/{district}.pdf` | 10 districts in crawled index |
| Teacher training modules | — | **None** linked from public file-library pages |

Homepage framework cards route teacher PD off-portal: **DIKSHA FLN** (`diksha.gov.in/fln.html`), **NISHTHA FLN** (`itpd.ncert.gov.in`). When the user asks for a **mission portal file-library** PDF, those external hosts are not substitutes.

## How to fetch

1. **Parse the request** — document type (benchmark, state/district FLS report, guidelines, teacher module).
2. For **portal files**, use the exact `/fls/file/` URL from the file-library index, disambiguation table, or user-supplied filename — do not guess filenames when the named file 404s.
3. **Verify:** `curl -sI -A "Mozilla/5.0" "{url}"` → HTTP 200 and `content-type: application/pdf`.
4. **Download:** `curl -fL -A "Mozilla/5.0" -o "{local_path}" "{url}"` (large files may take minutes).
5. **Post-check:** `file` shows PDF; optional first-page text for title.

**Control probe** when a `/fls/file/` URL 404s or the portal looks down: `HEAD` `Benchmarking_for_ORF_and_Numeracy.pdf`. HTTP 200 + `application/pdf` means the file channel works; the requested asset is missing → `source_gap`, not a mirror hunt.

For **guidelines** when only “NIPUN Bharat guidelines English PDF” is requested:

- Try mission portal links first (`index.html` / `index.aspx` — often HTTP 200; public index may not list guidelines)
- Probe legacy DoSEL and MoE upload paths (verify each with `curl -sI`):

```text
https://dsel.education.gov.in/sites/default/files/NIPUN_BHARAT_GUIDELINES_EN.pdf
  → 301 www.dsel-education.gov.in → 404
https://education.gov.in/sites/upload_files/mhrd/files/NIPUN_BHARAT_GUIDELINES_EN.pdf
  → 302 www.education.gov.in → 404
https://www.dsel-education.gov.in/sites/default/files/nipun/NIPUN_BHARAT_GUIDELINES_EN.pdf
https://www.dsel-education.gov.in/sites/default/files/update/nipun_bharat_eng_1.pdf
  → 404
```

- Do **not** guess `/fls/file/{guidelines-name}.pdf` on the portal (example: guessed names → 404)
- “Important Documents & Links / Reports” and **`PlanTemplate.aspx`** may require **`Login.aspx`** — no public guidelines PDF index found there in live crawl
- If no URL returns HTTP 200 + `application/pdf`, report `source_gap` honestly

For **teacher training module on mission portal file library**:

- Crawl `/fls/` index pages; expect **FLS reports only**
- Do not substitute NISHTHA/DIKSHA when the user scoped the request to `nipunbharat.education.gov.in` `/fls/file/`

## Verify

- HTTP 200 + `application/pdf` before full download
- Magic bytes `%PDF`
- On 404 for a user-named `/fls/file/` URL: record `source_gap`; optional control probe on benchmarking PDF

## Access barriers

- Portal homepage may timeout; direct `/fls/file/` URLs can still work
- File-library ASPX pages: 302 to logout while body still lists PDFs
- Legacy `dsel.education.gov.in` paths may redirect to `www.dsel-education.gov.in` and then 404 — not a license to use unofficial mirrors
- Guidelines and some document areas may be behind **login** without a public PDF URL

## Rights / license

Government mission documents; no open-content license stated on portal.

## fetch_status for this source

| Situation | Status |
|-----------|--------|
| PDF on disk, verified | `fetched` |
| Official URL 404 after search | `source_gap` |
| Login wall | `auth_required` (rare on public mission PDFs) |

## Disambiguation / known source gaps

| User intent | Official path | Notes |
|-------------|---------------------------|-------|
| ORF & numeracy benchmarking PDF | `nipunbharat.education.gov.in/fls/file/Benchmarking_for_ORF_and_Numeracy.pdf` | ~52 MB; colloquial “big foundational literacy benchmarking PDF” maps here |
| English guidelines (legacy research URL) | `dsel.education.gov.in/.../NIPUN_BHARAT_GUIDELINES_EN.pdf` | **404** via `www.dsel-education.gov.in`; MoE upload same basename **404** — rediscover on MoE or report `source_gap` |
| Teacher training module on mission `/fls/file/` | — | Public library has FLS reports only; use NISHTHA/DIKSHA for PD, or `source_gap` if portal file library was required |
| User-supplied `/fls/file/` filename | Build exact URL from pattern | 404 → `source_gap`; do not guess alternate portal names |
| Removed `fls/file/` name | — | Expect 404 → `source_gap` |

---

## Samagra Shiksha

# Samagra Shiksha — scheme documents (static PDF)

**Publisher:** Ministry of Education — Samagra Shiksha  
**Official domain:** `samagra.education.gov.in` only  
**Fetch family:** `static-pdf` + HTML scheme pages  

## What this source offers

- Integrated school-education scheme **explanatory PDFs** under `/docs/`
- HTML about/guidelines pages for scheme context

## URL and link patterns (by format)

| Format | Pattern |
|--------|---------|
| PDF | `https://samagra.education.gov.in/docs/{name}.pdf` |
| HTML | `https://samagra.education.gov.in/about.html`, other top-level pages |

Primary explanatory document (research + catalog):

```
https://samagra.education.gov.in/docs/samagra_shiksha.pdf
```

## How to fetch

1. **Parse the request** — which scheme document (overview PDF, implementation note, etc.).
2. For a named PDF in `/docs/`, build the full URL — do not use third-party mirrors.
3. **Verify:** `curl -sI -A "Mozilla/5.0" --connect-timeout 30 --max-time 120 "{url}"` → 200 and PDF content-type.
4. **Download:** `curl -fL -A "Mozilla/5.0" --connect-timeout 30 --max-time 300 -o "{local_path}" "{url}"`.
5. Optional: list `https://samagra.education.gov.in/docs/` and match `href="...pdf"` when the user description is vague.
6. **About page → PDF:** When the user asks to open `about.html` and follow an official link:

```bash
curl -sL -A "Mozilla/5.0" --connect-timeout 30 --max-time 120 \
  "https://samagra.education.gov.in/about.html" -o about.html
# extract same-host .pdf hrefs from about.html, then verify + download each candidate
```

Use only `samagra.education.gov.in` PDF URLs — do not substitute NCERT or state hosts.

## Verify

- `%PDF` magic after download
- Filename in `Content-Disposition` when present

## Access barriers

- Host may be slow; increase curl timeouts before declaring `source_gap`
- **Connect timeout (curl exit 28):** `dig +short samagra.education.gov.in` may resolve (e.g. `164.100.166.225`) while TCP to `:443` or `:80` still times out from some networks — this is a **network path** gap, not a wrong URL. Escalate once (`--connect-timeout 60 --max-time 180`), then try HTTP fallback on the same path; retry from a network path that reaches MoE gov.in hosts before mirroring.
- **Browser:** `about.html` or the PDF URL may show a browser error page when curl also times out — same blocker; do not treat browser failure as proof the file is missing.
- **Network variance:** Treat `docs/samagra_shiksha.pdf` as the happy path when the host responds.
- Do not substitute NCERT or state PDFs for Samagra scheme documents

## Rights / license

Government scheme publication.

## fetch_status for this source

| Situation | Status |
|-----------|--------|
| PDF retrieved | `fetched` |
| Timeout after retries (exit 28, connect never completes) | `source_gap` (network) — retry from reachable path |
| Stale filename (e.g. old `ss_implementation.pdf`) | `source_gap` (stale) when host returns 404; if host unreachable, report network gap and note stale expectation |

## Disambiguation / known source gaps

| Document | URL | Notes |
|----------|-----|-------|
| Current explanatory PDF | `docs/samagra_shiksha.pdf` | Primary happy path |
| Colloquial “integrated school education scheme” / main explanatory PDF | `docs/samagra_shiksha.pdf` | Map vague wording to this file; do not guess mirrors or legacy names |
| Legacy implementation PDF names | `docs/ss_implementation.pdf` (example) | Stale vs `samagra_shiksha.pdf`; when host is reachable, `HEAD` may 404 — still `source_gap` (stale), not a substitute fetch |
| About page linked PDF | discover from `about.html` | Same host only; crawl `href="...pdf"` after page loads |

---

## NAS

# UDISE+ (Unified District Information System for Education Plus)

UDISE+ is India's official school-education statistics system (MoE). The main portal (`udiseplus.gov.in`) is an Angular SPA. **Public annual reports, booklets, and many DCF/notice PDFs** are served through a document API that returns **base64-encoded PDFs in JSON** — not as plain `/assets/*.pdf` static files. Interactive dashboards and SDMS bulk tools are separate surfaces; success is often **`fetched`** (PDF on disk), **`listing_only`** (dashboard/KYS metadata), or **`auth_required`** (SDMS/OAuth), not forcing a download everywhere.

## What this source offers

| Resource type | Where it appears | Typical fetch |
|---------------|------------------|---------------|
| Annual UDISE+ reports (NEP / existing structure) | Publications page → `dcf2021` keys | API → decode PDF |
| UDISE+ booklets | Publications → `pdfFiles` keys | API → decode PDF |
| MoE letters / portal notices | Home + publications → `dcf2021` | API → decode PDF |
| DCF templates & uploads | Publications / Data Capture → `pdfFiles`, `UploadedFiles` | API when listed |
| Know Your School | `kys.udiseplus.gov.in/#/home` | Browser; captcha on every search (no sign-in) |
| National dashboard | `dashboard.udiseplus.gov.in` | Browser → `listing_only` |
| GIS | `gis.udiseplus.gov.in` | Browser |
| School microdata / SDMS bulk | `sdms.udiseplus.gov.in` | **`auth_required`** (OAuth) |

**Out of scope for this leaf:** Performance Grading Index at `pgi.udiseplus.gov.in` (see PGI reference).

## URL and route patterns

| Pattern | Purpose |
|---------|---------|
| `https://udiseplus.gov.in/` | National portal home |
| `https://udiseplus.gov.in/#/{lang}/page/publications` | Publications & statistics (e.g. `#/en/page/publications`) |
| `https://udiseplus.gov.in/#/{lang}/home` | Home notice board — MoE letters with dates (e.g. `#/en/home`) |
| `https://api.udiseplus.gov.in/udise-fms/api/fileUpload/getDocument/{folder}/{name}.pdf` | **Primary public PDF API** (JSON + base64 `pdf`) |
| `https://kys.udiseplus.gov.in/#/home` | Know Your School (School Name / Advance Search tabs) |
| `https://dashboard.udiseplus.gov.in/` | Public dashboard shell |
| `https://gis.udiseplus.gov.in/gis-web-app/#/home` | GIS |
| `https://sdms.udiseplus.gov.in/` | Restricted SDMS (login) |

## How to fetch

### 1. Parse the request

Decide which subtype the user wants:

- **Annual report** (year + NEP vs existing structure)
- **Booklet / explainer PDF**
- **Official letter / notice** (portal extension, state circular)
- **DCF form** (Excel/PDF template from publications)
- **School lookup** (KYS)
- **Live statistics dashboard** (no file expected)
- **Bulk microdata** (expect auth wall)

### 2. Prefer the document API for listed PDFs

Official downloads use:

```text
GET https://api.udiseplus.gov.in/udise-fms/api/fileUpload/getDocument/{folder}/{name}.pdf
```

The response is JSON. When successful it contains a `pdf` field (base64). Decode, write to disk, and verify magic bytes `%PDF`.

**Common folders and names:**

| User intent | `{folder}` | Example `{name}` |
|-------------|------------|------------------|
| 2024–25 annual report (NEP structure) | `dcf2021` | `UDISE_Report_2024_25_NEP_Structure` |
| 2024–25 annual report (existing structure) | `dcf2021` | `UDISE_Report_2024_25_Existing_Structure` |
| 2023–24 annual report (NEP) | `dcf2021` | `UDISE_Report_2023_24_NEP_Structure` |
| UDISE+ system booklet | `pdfFiles` | `UDISE_Plus_Booklet` or `UDISEBookletFinal` |
| Older booklets | `dcf2021` | `UDISE+2020_21_Booklet_English` |
| Portal extension / MoE letter (2025–26 cycle) | `dcf2021` | See letter table below |
| DCF Excel/PDF upload (data capture) | `UploadedFiles` | e.g. `UDISE_DCF_Final_25_26_v3`, `DCF_Final_2023_24_v6_3101` |

**MoE portal letters (`dcf2021`) — multiple keys per cycle; pick by date/title:**

| `{name}` | Notice date (home board) | Topic |
|----------|--------------------------|-------|
| `extendedDated15Dec` | 01-12-2025 | Extension of data entry till 15 Dec 2025 |
| `DoLetterStatesUTs2025` | 01-10-2025 | DO letter to States and UTs |
| `DO_letter_portal_2025_26` | 30-04-2025 | Portal opening for 2025–26 |
| `DoLetter12_24`, `portal_closing` | (listed on home) | Other cycle notices |

When the user asks for the **latest** letter or **portal extension**, fetch the candidate keys above (or read the home notice board at `#/en/home`), compare dates, and pick the newest that matches their words. `landing_url` for letters is usually **home**, not publications.

If the user names a **year** but not NEP vs existing structure, pick the report type they imply (NEP is common for 2022–25 cycles) or fetch the one whose title matches their words; note both exist in publications.

**Example (save report):**

```bash
curl -sS 'https://api.udiseplus.gov.in/udise-fms/api/fileUpload/getDocument/dcf2021/UDISE_Report_2024_25_NEP_Structure.pdf' \
  -o /tmp/udise-response.json
# Decode: jq -r '.pdf' /tmp/udise-response.json | base64 -d > udise-report-2024-25-nep.pdf
```

Large payloads (10+ MB decoded) are expected — do not treat size alone as failure.

If the API returns `statusDesc` like `File not found or not a PDF`, the `{folder}`/`{name}` pair is wrong — use the publications page (browser) to discover the exact key, or try the alternate structure (NEP vs existing) for the same year.

### 3. Browser when the SPA must be read

Use a browser when:

- The user points to **Publications** without naming a file — open `https://udiseplus.gov.in/#/en/page/publications` (adjust language), read the table, then call the document API with the matching `dcfDownload(folder, name)` pair from the UI (equivalent to the API path above).
- The user asks about **dashboard** content — open `https://dashboard.udiseplus.gov.in/` (no login on this host). Walk the six tabs (Education, School, Teacher, Student, Fact Sheet, All Reports). Default scope is **All India/National · 2024-25**. On **Fact Sheet**, expand accordion sections to reveal full indicator tables. Report **`listing_only`** unless the user asks for a specific downloadable report from **All Reports**.
- The user asks for **Know Your School** — open `https://kys.udiseplus.gov.in/#/home`. **Sign-in is not required** for the public search form, but **captcha is mandatory** on every mode (School Name, UDISE code, PIN, Advance Search). Automated agents cannot complete search → report **`auth_required`** (captcha gate, not OAuth). **School Name** has State + name only (no management filter); use **Advance Search** (State → District → … → Management, e.g. Department of Education) to narrow government schools.

`curl` on `https://udiseplus.gov.in/` alone only returns the SPA shell — not report tables.

### 4. Restricted modules

| Request | Expected status |
|---------|-----------------|
| SDMS bulk export / microdata without credentials | `auth_required` |
| Teacher portal `/moe_teacher/` | `auth_required` |
| OAuth redirects to `auth.udiseplus.gov.in` | `auth_required` |

Do not invent microdata URLs; cite the login surface reached.

## Classification cheat sheet

| `fetch_status` | When |
|----------------|------|
| `fetched` | Decoded PDF saved and verified `%PDF` |
| `listing_only` | Dashboard/KYS/publications HTML metadata only |
| `metadata_only` | Official URL + document key identified, file intentionally not saved (user only asked “where”) |
| `auth_required` | SDMS/OAuth/login blocked bytes; KYS captcha blocks programmatic search (humans can search without an account) |
| `source_gap` | MoE-hosted resource not exposed on UDISE+ (rare; note alternate ministry URL if found off-domain) |

## Verification

- PDF: first bytes `%PDF-1.`
- `source_url` should be the API URL used or the official page that lists the document.
- `landing_url` is the human-facing portal page (publications hash route or home).
- Note `format: pdf` and approximate size after decode.

## Common mistakes

- Guessing `/assets/pdf/UDISEPlus_Booklet_2024-25.pdf` — **404**; use the document API.
- Confusing **PGI** (`pgi.udiseplus.gov.in`) with UDISE+ main publications.
- Expecting `curl` on dashboard hosts to return tables — use browser or report `listing_only`.
- Treating JSON base64 response as failed because it is not `application/pdf` over the wire.
- Picking a single MoE letter key when the user says **latest** — compare dated notices on `#/en/home` or fetch multiple `dcf2021` letter keys.
- Expecting KYS to need OAuth — captcha is the gate; use Advance Search for management filters.
- Skipping Fact Sheet accordion clicks on the dashboard — tables are hidden until expanded.

---

## CIET Initiatives

# CIET Initiatives (NCERT)

CIET program pages, initiative brochures, and downloadable PDFs hosted on `ciet.ncert.gov.in`. Use only the official CIET site. Platform deep-dives (DIKSHA content API, ePathshala app) are out of scope unless the user only needs the CIET initiative landing.

## Workflow

1. **Parse the request** — initiative name (PM eVIDYA, accessibility, DIKSHA, NISHTHA, ICT, etc.) or “CIET notice/PDF”.
2. **Open the initiative index** — list slugs, then open the matching `/initiative/{slug}` page.
3. **Collect assets** — direct PDFs under `/storage/app/public/files/...` or document HTML-only outreach.
4. **Download PDFs** with `curl` when present.
5. **Report** — honest `fetch_status` (`fetched` vs `listing_only` for HTML-only initiatives).

## Index

```text
https://ciet.ncert.gov.in/initiatives
```

The index lists initiative **cards** linking to `/initiative/{slug}` — it usually does **not** embed direct storage PDF hrefs. Follow a slug page (or `/brochure-on-ict-initiatives`) to find PDFs. For notice/ad PDFs without opening an initiative, scrape **`/`** (home) instead.

**Invalid:** `https://ciet.ncert.gov.in/initiative` (404 without slug).

## Initiative pages

```text
https://ciet.ncert.gov.in/initiative/{slug}
```

Known slugs: `accessibility`, `bharatonthemoon`, `diksha`, `epathshala`, `ict-initiative`, `moocs-on-swayam`, `ncf-tech-platform`, `nishtha`, `pmevidya`.

## Storage PDF pattern

```text
https://ciet.ncert.gov.in/storage/app/public/files/{numeric_id}/{subdir/}{filename}.pdf
```

Home and notice pages also link storage PDFs directly (often under subdirs like `Notices/` or `Advertisement_...`). Extract hrefs from HTML — do not guess `{numeric_id}`.

Initiative pages may also host images under `/storage/app/public/photos/` — scan for `.pdf` hrefs only; hero PNG/JPG are not documents.

```bash
curl -fsSL "https://ciet.ncert.gov.in/initiative/accessibility" -o /tmp/ciet-acc.html
rg -o 'storage/app/public/files/[^"]+\.pdf' /tmp/ciet-acc.html
curl -fL -o doc.pdf "https://ciet.ncert.gov.in/storage/app/public/files/13/6.pdf"
```

## ICT brochure page

```text
https://ciet.ncert.gov.in/brochure-on-ict-initiatives
```

Linked from `/initiatives` and from slug `ict-initiative`. Lists many official brochure PDFs under:

```text
https://ciet.ncert.gov.in/storage/app/public/files/19/Brochure/{filename}.pdf
```

Example (English, ~43 MB): `Technology_intiatives_EN.pdf` (filename spelling as on site). Other brochures on the same page cover DIKSHA, NISHTHA, PM eVIDYA, ePathshala, etc.

## Initiative-specific notes

| Slug | Typical outcome |
|------|-----------------|
| `accessibility` | HTML + inclusion program tiles; links storage PDF `.../files/13/6.pdf` (*Accessibility Concerns in NCERT Textbooks*) |
| `pmevidya`, `diksha`, `epathshala` | Mostly HTML describing national platforms — `listing_only`; images under `/photos/` only, no `.pdf` on page |
| `ict-initiative` | HTML hub → `/brochure-on-ict-initiatives` for multi-PDF brochure listing |
| Notices on home | Often direct storage PDFs (orders, advertisements) |

## Excluded document

Do **not** treat **Guidelines for Development of eContent for School Education v3.0** as part of this leaf (`storage/.../econtent-guidelines/GuidelinesforeContent3.pdf`) — separate national leaf.

## Failure modes

| Situation | `fetch_status` |
|-----------|----------------|
| PDF downloaded | `fetched` |
| Initiative page exists, no PDF | `listing_only` |
| 404 slug | `not_found` |

## Rights note

CIET/NCERT site copyright; initiative pages may embed third-party platform links — document landing URLs only.
