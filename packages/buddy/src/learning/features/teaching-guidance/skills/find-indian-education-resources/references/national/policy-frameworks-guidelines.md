# National Policies, Frameworks, and Guidelines

Use this reference when the user wants an official document that defines policy, curriculum expectations, digital-learning guidance, accessibility guidance, or screening guidance. Natural requests may sound like “official education policy PDF”, “new curriculum framework”, “foundational stage framework”, “digital education guidelines”, “guidelines for disabled children e-content”, “screening checklist”, or “what document says schools should do”.

This file helps the agent locate and disambiguate:

- **Policy/framework documents**: NEP 2020, NCF-SE 2023, NCF-FS 2022.
- **Digital education guidance**: PRAGYATA and NCERT eContent guidelines.
- **Accessibility/screening guidance**: CWSN e-content guidelines and PRASHAST.

Use this for normative guidance documents. Do not use it for ordinary textbooks, exam papers, data dashboards, or survey/report-card results.

## Contents

- [National Education Policy 2020 (NEP)](#national-education-policy-2020-nep)
- [NCF for School Education 2023 (NCF-SE)](#ncf-for-school-education-2023-ncf-se)
- [NCF for Foundational Stage 2022 (NCF-FS)](#ncf-for-foundational-stage-2022-ncf-fs)
- [PRAGYATA Guidelines for Digital Education](#pragyata-guidelines-for-digital-education)
- [NCERT eContent guidelines (Version 3.0)](#ncert-econtent-guidelines-version-30)
- [Guidelines for e-Content for Children with Disabilities (CWSN)](#guidelines-for-e-content-for-children-with-disabilities-cwsn)
- [PRASHAST (NCERT disability screening checklist)](#prashast-ncert-disability-screening-checklist)

---

# National Education Policy 2020 (NEP)

Official Ministry of Education **National Education Policy 2020** English PDF. Use only `www.education.gov.in` and `dsel.education.gov.in`. Do not use third-party mirrors or NCERT publication lists (`NEP_Books_2020.pdf` is **not** the policy text).

**Fetch family:** static-pdf after resolving the download URL (DoSEL CMS usually works with curl; MoE Highlights is a Next.js SPA — **browser fallback**).

## Workflow

1. **Parse the request** — user wants the full NEP 2020 policy PDF (English).
2. **Legacy curl probe** — `curl -sI -L` on the mhrd upload path (below). Expect **404**; if so, do not treat alternate MoE `.pdf` URLs as binary without checking magic bytes.
3. **DoSEL CMS (preferred curl path)** — search DoSEL CMS (below); pick `central_documents` post **10528** (~**1,453,912 bytes**). `curl -fL` the `acf_data.pdf.url` from the hit.
4. **MoE browser (fallback)** — if DoSEL CMS fails, open the National Education Policy Highlights page; resolve the English PDF href from the hydrated UI or network tab. Automated browsers may show a **blank SPA** (no Highlights control).
5. **Verify** — `%PDF` magic; first page contains “National Education Policy 2020”; size ~1.45 MB (~66 pages in discovery).
6. **Report** — metadata contract.

## Official landing pages

| Page | URL |
|------|-----|
| National Education Policy (Highlights + attachments) | `https://www.education.gov.in/en/national-education-policy` |
| NEP overview (DoSEL) | `https://dsel.education.gov.in/en/nep-overview` |
| NEP 2020 hub | `https://www.education.gov.in/en/nep-2020` |

### Browser step (fallback when DoSEL CMS does not resolve)

1. Open `https://www.education.gov.in/en/national-education-policy`.
2. In **Highlights**, select the English **National Education Policy 2020** PDF download.
3. If the browser navigates to a direct `.pdf` URL, record it as `source_url` and download with curl.
4. If download starts without a stable URL, save the file from the browser download folder and record `fetch_status` per honesty rules.

## Legacy direct URL (try; may 404)

```text
https://www.education.gov.in/sites/upload_files/mhrd/files/NEP_Final_English_0.pdf
```

```bash
curl -sI -L "https://www.education.gov.in/sites/upload_files/mhrd/files/NEP_Final_English_0.pdf"
```

This legacy URL may return **404** — do not treat it as guaranteed.

### MoE paths that look like PDFs but are not

| URL pattern | Probe result | `fetch_status` if saved as PDF |
|-------------|--------------|--------------------------------|
| `…/sites/upload_files/mhrd/files/NEP_Final_English_0.pdf` | **404** (Next.js error HTML on GET) | `source_gap` |
| `…/documents/nep/NEP_Final_English_0.pdf` | **200** but `content-type: text/html` (Next.js wrapper) | `wrapper_only` |

```bash
curl -sI -L "https://www.education.gov.in/documents/nep/NEP_Final_English_0.pdf"
# Expect HTML, not application/pdf — confirm with head -c 5 (not %PDF)
```

`www.education.gov.in/cms/…` search for “National Education Policy 2020” returned **0** policy hits in discovery — rely on **DoSEL** CMS, not main-site CMS, for curl resolution.

## DoSEL CMS (primary when legacy path 404)

After legacy **404**, use DoSEL CMS before spending time on MoE browser hydration:

```bash
curl -fsSL "https://dsel.education.gov.in/cms/wp-json/custom/api/search?s=National%20Education%20Policy%202020"
```

**Pick the right hit:** many results are press releases or initiatives. Use the `central_documents` row whose **title is exactly** “National Education Policy 2020” and whose English PDF is ~**1.45 MB** (post id **10528** in discovery). Do not download smaller NEP-themed PDFs (~100–200 KB) from search noise.

Optional confirm:

```bash
curl -fsSL "https://dsel.education.gov.in/cms/wp-json/custom/api/post?id=10528"
```

Example direct file URL (verify with `curl -sI` before download; expect `application/pdf`, **1,453,912** bytes):

```text
https://dsel-education.gov.in/static/uploads/2025/09/b93d35b5f0b245da94ef9ec7ea8205bd.pdf
```

```bash
curl -fL -o nep-2020.pdf "https://dsel-education.gov.in/static/uploads/2025/09/b93d35b5f0b245da94ef9ec7ea8205bd.pdf"
file nep-2020.pdf
```

## Disambiguation

| User says | Resolve to |
|-----------|------------|
| NEP 2020 policy / National Education Policy PDF | MoE/DoSEL policy PDF (~1.45 MB) via workflow above |
| NCERT NEP books list / `NEP_Books_2020.pdf` | **not** this leaf — NCERT publication list (~**13 MB** on `ncert.nic.in`; may return 200 but wrong document class) |
| NCF 2023 / foundational NCF | other curriculum leaves |

## fetch_status vocabulary

- `fetched` — verified NEP 2020 policy PDF on disk
- `source_gap` — official pages reachable but no PDF URL resolved
- `wrapper_only` — SPA/HTML shell without binary

---

## NCF-SE 2023

# NCF for School Education 2023 (NCF-SE)

Official NCERT **National Curriculum Framework for School Education 2023** (English PDF). Use only `ncert.nic.in` / `www.ncert.nic.in`. Do not use third-party mirrors.

**Fetch family:** static-pdf (direct binary)

## Workflow

1. **Parse the request** — user wants the 2023 school-education NCF / NCF-SE / NCERT curriculum framework PDF.
2. **Discover** — NCERT homepage (`https://ncert.nic.in/?ln=en`) lists the English PDF; or use the known focus-group path after confirming with `curl -sI`.
3. **Verify** — HTTP 200, `Content-Type: application/pdf`, non-zero size; optional `%PDF` magic on downloaded bytes.
4. **Download** — `curl -fL` (not WebFetch for the binary).
5. **Report** — metadata contract fields; title should reference National Curriculum Framework for School Education (2023).

## Primary direct URL

```text
https://ncert.nic.in/pdf/focus-group/NCF-SE_2023EN.pdf
```

```bash
curl -sI -L "https://ncert.nic.in/pdf/focus-group/NCF-SE_2023EN.pdf"
curl -fL -A "BuddyFetch/1.0" -o ncf-se-2023.pdf \
  "https://ncert.nic.in/pdf/focus-group/NCF-SE_2023EN.pdf"
file ncf-se-2023.pdf
```

`www.ncert.nic.in` serves the same object if `ncert.nic.in` fails.

Direct PDF — no separate HTML landing page; `landing_url` may equal `source_url`.

## Post-download checks

Expect HTTP 200, `Content-Type: application/pdf`, `Content-Length: 21703375` (~20.7 MB), and `%PDF` magic. Typical full book is on the order of ~600 pages (PDF 1.7). Mismatch → wrong file or truncated download.

## Homepage discovery

```bash
curl -fsSL "https://ncert.nic.in/?ln=en" | grep -i 'NCF-SE\|School Education 2023\|focus-group'
```

Follow the official `href` under `pdf/focus-group/` — do not invent filenames.

Homepage may also link a **larger May 2026 revision** (not the primary for this leaf):

```text
https://ncert.nic.in/pdf/NCFSE2023_May2026.pdf
```

```bash
curl -sI -L "https://ncert.nic.in/pdf/NCFSE2023_May2026.pdf"
# ~44.8 MB (Content-Length: 44840497) when reachable
```

Use `NCF-SE_2023EN.pdf` unless the user explicitly wants the May 2026 homepage edition.

## Flipbook (non-download)

NCERT may expose read-only flipbook HTML under `/flipbook/NCF/`. Prefer the direct PDF above; report `listing_only` if the user only wants on-screen reading — do not claim `fetched` without saved PDF bytes.

## Disambiguation

| User says | Resolve to |
|-----------|------------|
| NCF 2023 school / NCF-SE | `NCF-SE_2023EN.pdf` |
| `NCF-2023-School-Education.pdf` or “under `/pdf/ncf/`” | **obsolete (404)** — use `NCF-SE_2023EN.pdf` in `pdf/focus-group/` |
| Homepage `NCFSE2023_May2026.pdf` | alternate ~45 MB PDF — use only if user wants that edition; default remains focus-group English |
| Foundational stage 2022 | wrong leaf — see `ncf-fs-2022` |
| NEP 2020 policy | wrong leaf — see `nep-2020` |

## Known source gaps

- `https://ncert.nic.in/pdf/ncf/NCF-2023-School-Education.pdf` and `/pdf/ncf/` directory listing — **404** (obsolete-filename trap; recover via focus-group URL).

## fetch_status vocabulary

- `fetched` — PDF on disk, verified
- `source_gap` — official site up but PDF path not reachable
- `listing_only` — only HTML/flipbook, no PDF retrieved

---

## NCF-FS 2022

# NCF for Foundational Stage 2022 (NCF-FS)

Official NCERT **National Curriculum Framework for Foundational Stage 2022** (English PDF). Use only `ncert.nic.in`. Do not use third-party mirrors.

**Fetch family:** static-pdf (direct binary); optional flipbook is read-only HTML, not a substitute download.

## Workflow

1. **Parse the request** — user wants the 2022 foundational-stage NCF / NCF-FS PDF.
2. **Discover** — NCERT homepage links the English PDF; confirm URL with `curl -sI` before download.
3. **Verify** — HTTP 200, `Content-Type: application/pdf`, `Content-Length: 5115681` (~5.1 MB); after download, `file` reports PDF 1.5 and first bytes `%PDF-`.
4. **Download** — `curl -fL`.
5. **Report** — metadata contract; title should reference Foundational Stage (2022).

## Primary direct URL (current as of discovery)

```text
https://ncert.nic.in/pdf/focus-group/NCF-FS_2022EN.pdf
```

```bash
curl -sI -L "https://ncert.nic.in/pdf/focus-group/NCF-FS_2022EN.pdf"
curl -fL -A "BuddyFetch/1.0" -o ncf-fs-2022.pdf \
  "https://ncert.nic.in/pdf/focus-group/NCF-FS_2022EN.pdf"
file ncf-fs-2022.pdf
```

## Homepage discovery

```bash
curl -fsSL "https://ncert.nic.in/?ln=en" | grep -i 'Foundational Stage 2022\|NCF-FS'
```

Use the official `pdf/focus-group/` link from the page.

## Flipbook (non-download)

Homepage may link either flipbook path (both HTML, not PDF bytes):

```text
https://ncert.nic.in/flipbook/NCF/National_Curriculum_Framework_for_Foundational_Stage_2022/
https://ncert.nic.in/flipbook/NCF/NCF-FS_2022EN
```

If the user only needs on-screen reading, report `listing_only` / HTML flipbook — do **not** claim a PDF `fetched` unless bytes were saved. When the user declines download, do not substitute the flipbook for saving `NCF-FS_2022EN.pdf`.

## Disambiguation

| User says | Resolve to |
|-----------|------------|
| NCF foundational 2022 / NCF-FS | `NCF-FS_2022EN.pdf` |
| Old filename `ncf_Foundational_Stage.pdf` | **obsolete (404)** — use `NCF-FS_2022EN.pdf` |
| School education NCF 2023 | wrong leaf (`ncf-se-2023`) |
| Foundational learning outcomes PDF | wrong leaf (`learning-outcomes`) |

## Known source gaps

- Legacy `https://ncert.nic.in/pdf/focus-group/ncf_Foundational_Stage.pdf` returns 404 — use `NCF-FS_2022EN.pdf`; note obsolete name in metadata `notes` when the user asked for the old filename.
- Do **not** guess other hyphenated names under `pdf/focus-group/`; use only URLs found on official pages.

## fetch_status vocabulary

- `fetched` — PDF saved and verified
- `source_gap` — PDF URL not reachable
- `listing_only` — flipbook/HTML only

---

## Pragyata

# PRAGYATA Guidelines for Digital Education

Official NCERT **PRAGYATA** digital-education guidelines (English PDF). Prefer `ncert.nic.in`; DoSEL announcement pages are secondary discovery only.

**Fetch family:** static-pdf (direct binary)

## Workflow

1. **Parse the request** — user wants PRAGYATA / digital education guidelines PDF from government sources.
2. **Discover** — NCERT homepage lists the document; confirm with `curl -sI`.
3. **Download** — `curl -fL`.
4. **Verify** — `%PDF` magic; `Content-Length: 1717828` (~1.7 MB); cover text **PRAGYATA** / **Guidelines for Digital Education** (`pdftotext` or `pdfinfo`; ~47 pages, A4).
5. **Report** — metadata contract.

## Primary direct URL

```text
https://ncert.nic.in/pdf/announcement/PRAGYATA_Guidelines_English.pdf
```

```bash
curl -sI -L "https://ncert.nic.in/pdf/announcement/PRAGYATA_Guidelines_English.pdf"
curl -fL -A "BuddyFetch/1.0" -o pragyata-guidelines.pdf \
  "https://ncert.nic.in/pdf/announcement/PRAGYATA_Guidelines_English.pdf"
```

## Homepage discovery

```bash
curl -fsSL "https://ncert.nic.in/?ln=en" | grep -i PRAGYATA
```

## DoSEL announcement (secondary)

```text
https://dsel.education.gov.in/en/node/1741
```

Crawl official PDF links if NCERT direct URL fails.

Legacy MoE upload (do not rely on — commonly **404** with an HTML error page, not PDF):

```text
https://www.education.gov.in/sites/upload_files/mhrd/files/pragyata-guidelines_0.pdf
```

On 404, fall back to the NCERT primary URL above; do not treat the MoE response as `wrapper_only`.

## Disambiguation

| User says | Resolve to |
|-----------|------------|
| PRAGYATA digital education guidelines | NCERT announcement PDF above |
| vague “digital education” / online learning guidelines (government) | same NCERT PRAGYATA PDF (not eContent v3.0) |
| NCERT eContent v3.0 school guidelines | different document — see NCERT eContent section in this reference |
| CWSN e-content guidelines | different document — see CWSN / inclusive education section in this reference |

## fetch_status vocabulary

- `fetched` — PDF verified on disk
- `source_gap` — official pages up, PDF not retrievable
- `listing_only` — HTML announcement only

---

## NIPUN Bharat

# NCERT eContent guidelines (Version 3.0)

Official **Guidelines for Development of eContent for School Education Version 3.0** are hosted by **CIET NCERT** with an NCERT mirror. Use government domains only (`ciet.ncert.gov.in`, `ncert.nic.in`). This leaf is **not** the CWSN / disability-inclusive e-content guidelines (separate document and reference leaf).

## Workflow

1. **Parse the request** — Version 3.0 **school** e-content development guidelines (not CWSN-specific, PRAGYATA, or PRASHAST).
2. **Host preference** — default to CIET storage; if the user names **NCERT.nic.in only**, use the mirror URL and do not fetch from CIET.
3. **Discovery page (optional)** — `https://ciet.ncert.gov.in/econtent-guidelines` names the document and links the PDF (Laravel HTML).
4. **Primary PDF (prefer CIET storage)**:
   ```text
   https://ciet.ncert.gov.in/storage/app/public/files/14/econtent-guidelines/GuidelinesforeContent3.pdf
   ```
5. **Alternate official mirror** (user requests NCERT host, or CIET fails):
   ```text
   https://ncert.nic.in/pdf/GuidelinesforeContent3.pdf
   ```
6. **Verify** — `curl -sI` on chosen URL → 200, `application/pdf`, `Content-Length: 17745679` (~17.7 MB).
7. **Download** — `curl -fL` with a normal UA (e.g. `BuddyFetch/1.0`).
8. **Verify bytes** — `%PDF`; optional `pdftotext` on pages 1–2 for title *Guidelines for Developement of eContent for School Education* (official spelling) and DSE&L/MHRD committee framing — not the CWSN booklet title.
9. **Report** metadata including which host was used (`source_url`, `host_used`).

```bash
curl -sI "https://ciet.ncert.gov.in/storage/app/public/files/14/econtent-guidelines/GuidelinesforeContent3.pdf"
curl -fL -A "BuddyFetch/1.0" -o GuidelinesforeContent3.pdf \
  "https://ciet.ncert.gov.in/storage/app/public/files/14/econtent-guidelines/GuidelinesforeContent3.pdf"
file GuidelinesforeContent3.pdf
pdftotext -f 1 -l 2 GuidelinesforeContent3.pdf - | head -20
```

NCERT mirror (same file size class; `Last-Modified` often 2021-03-05):

```bash
curl -sI "https://ncert.nic.in/pdf/GuidelinesforeContent3.pdf"
curl -fL -A "BuddyFetch/1.0" -o GuidelinesforeContent3.pdf \
  "https://ncert.nic.in/pdf/GuidelinesforeContent3.pdf"
```

## Discovery surfaces

| Surface | URL | Notes |
|---------|-----|--------|
| CIET guidelines page | `https://ciet.ncert.gov.in/econtent-guidelines` | HTML landing; links storage PDF |
| CIET direct PDF | storage path above | Primary when no host constraint |
| NCERT direct PDF | `https://ncert.nic.in/pdf/GuidelinesforeContent3.pdf` | Mirror; use when user excludes CIET |
| NCERT home | `https://ncert.nic.in/` | May list “Guidelines for Development of eContent… Version-3.0”; mine with `rg` if needed |

Some environments have seen intermittent odd responses on the NCERT PDF path; if NCERT fails, try CIET storage (and vice versa) before `source_gap`.

## Disambiguation

| Request | Action |
|---------|--------|
| School e-content v3.0 (this leaf) | Fetch `GuidelinesforeContent3.pdf` from CIET or NCERT per host preference |
| CWSN / children with disabilities e-content | **Do not** deliver `GuidelinesforeContent3.pdf`; use the CWSN reference leaf or `https://ncert.nic.in/pdf/CWSN_E-Content_guidelines_2021_new.pdf` |
| PRAGYATA / PRASHAST | Wrong document family — use those leaves |

## Fetch notes

- Use `curl -fL` for binaries; do not use WebFetch for the full PDF.
- If one official host returns errors, try the other official URL before reporting `source_gap`.
- Expected on disk: `GuidelinesforeContent3.pdf`, PDF 1.6, ~17,745,679 bytes.

---

## CWSN eContent Guidelines

# Guidelines for e-Content for Children with Disabilities (CWSN)

Official MoE/NCERT guidance PDF for accessible e-content development. Use government domains only (`ncert.nic.in`, `dsel.education.gov.in`, `education.gov.in`). This leaf is **not** the general school eContent v3.0 guidelines (those are a separate document).

## Workflow

1. **Parse the request** — user wants CWSN / children with disabilities / inclusive e-content **guidelines** (PDF).
2. **Discover** — start from NCERT homepage or accessibility hub, or DoSEL node; resolve the official PDF URL.
3. **Download** — `curl` the direct PDF.
4. **Verify** — `curl -sI` → 200, `application/pdf`, ~2.58 MB (`Content-Length` ~2583862); `file` → PDF; title pages mention e-content for children with disabilities (March 2021, MoE expert sub-committee).
5. **Report** — full metadata contract; if DoSEL paths were requested but failed, note `source_gap` on DoSEL only.

## Primary direct URL (preferred when reachable)

```text
https://ncert.nic.in/pdf/CWSN_E-Content_guidelines_2021_new.pdf
```

```bash
curl -sI "https://ncert.nic.in/pdf/CWSN_E-Content_guidelines_2021_new.pdf"
curl -fL -A "BuddyFetch/1.0" -o cwsn-guidelines.pdf \
  "https://ncert.nic.in/pdf/CWSN_E-Content_guidelines_2021_new.pdf"
file cwsn-guidelines.pdf
pdftotext -f 1 -l 2 cwsn-guidelines.pdf - | head -20
```

Expected on disk: `CWSN_E-Content_guidelines_2021_new.pdf` (~148 pages).

## Discovery surfaces

| Surface | URL |
|---------|-----|
| NCERT home | `https://ncert.nic.in/` |
| Accessibility hub | `https://ncert.nic.in/accessibility.php` |
| DoSEL node | `https://dsel.education.gov.in/en/node/1926` |
| DoSEL file (linked from NCERT accessibility) | `https://dsel.education.gov.in/sites/default/files/2021-06/CWSN_E-Content_guidelines.pdf` |

Homepage / accessibility mining pattern:

```bash
curl -fsSL "https://ncert.nic.in/" | rg -i 'CWSN|disabilit|e-Content'
curl -fsSL "https://ncert.nic.in/accessibility.php" | rg -i 'CWSN|guideline|\.pdf'
```

### Accessibility hub listing

On `accessibility.php`, section **Teachers support material on Inclusive Education**:

- Link label: *Guideline for the development of eContent for Children with Disabilities*
- Page `href` points at the DoSEL file URL in the table above (may return **404**)
- When the user asks for the booklet “on the accessibility section”, set `landing_url` to `accessibility.php` but **download** the NCERT primary PDF

## Alternate official PDF (MoE upload)

If NCERT path fails, try the MoE direct file (same policy family):

```text
https://www.education.gov.in/sites/upload_files/mhrd/files/CWSN_E-Content_guidelines.pdf
```

Resolve only links present on official pages — do not invent paths.

## DoSEL node workflow

When the user names DoSEL / school education department:

1. Try the DoSEL file URL from `accessibility.php` (table above) with `curl -fL` — follow `dsel.education.gov.in` → `www.dsel-education.gov.in` redirects; confirm `%PDF`, not an HTML 404 page.
2. Optionally check the node: `https://dsel.education.gov.in/en/node/1926` — it may return **404**; redirect to `https://www.dsel-education.gov.in/node/1926` serves a **Next.js shell** with no PDF `href` in static HTML (`curl` + `rg` alone will not find a file there).
3. On any DoSEL failure, fetch the NCERT primary URL and note `source_gap` on DoSEL only.

```bash
curl -sI "https://dsel.education.gov.in/sites/default/files/2021-06/CWSN_E-Content_guidelines.pdf"
curl -fsSL "https://dsel.education.gov.in/en/node/1926" -o /tmp/dsel-cwsn.html || true
rg -o 'href="[^"]+\.pdf"' /tmp/dsel-cwsn.html || true
```

## Disambiguation

| Document | Do not confuse with |
|----------|---------------------|
| CWSN e-content guidelines | eContent v3.0 for general school education |
| CWSN e-content guidelines | PRASHAST disability screening checklist |

## Failure modes

| Situation | `fetch_status` |
|-----------|----------------|
| PDF verified | `fetched` |
| Only HTML node, PDF link broken | `source_gap` or `not_found` |
| Multiple PDFs; unclear which is CWSN | list options; pick title match |

## Rights note

Ministry of Education / NCERT expert-committee publication; standard government copyright, not an open license.

---

## PRASHAST

# PRASHAST (NCERT disability screening checklist)

**PRASHAST** (“A Disability Screening Checklist for Schools”) is published by NCERT on `ncert.nic.in`. The official booklet is a direct PDF, not a separate product site.

## Workflow

1. **Parse the request** — PRASHAST booklet vs launch video vs mobile app. Colloquial **“app booklet”** or **“disability screening app booklet”** means the checklist PDF, not the Play Store app.
2. **If the prompt names `PRASHAST.pdf`** — `curl -sI https://ncert.nic.in/pdf/PRASHAST.pdf` (expect **404**), then resolve via the accessibility page; NCERT serves the booklet as `DSCS_booklet.pdf` (Disability Screening Checklist for Schools).
3. **Start at the accessibility page** — `https://ncert.nic.in/accessibility.php` and find the **PRASHAST** section.
4. **Booklet PDF** — follow the link labeled “Access PRASHAST booklet”. Official URL:
   ```
   https://ncert.nic.in/pdf/DSCS_booklet.pdf
   ```
   Do **not** use `PRASHAST.pdf` (404 on NCERT).
5. **Verify** — `curl -sI` → 200, `application/pdf` (expect `Content-Length: 3533115`, `Last-Modified` ~ Sep 2022).
6. **Download** — `curl -sL -f -o …`
7. **Verify bytes** — `%PDF-1.6`; optional `pdftotext` pages 1–2 for cover title **“PRASHAST — A Disability Screening Checklist for Schools (Part-1 and Part-2)”** (~47 pages, ~3.5 MB).
8. **Report** metadata.

## Related surfaces (usually not the booklet)

| Surface | URL | Typical `fetch_status` |
|---------|-----|------------------------|
| Mobile app | Google Play `com.dscs.app` | `listing_only` / external |
| Launch video | `https://youtu.be/gM29c5dKQjg` (linked on accessibility page) | `metadata_only` |
| Hindi booklet | `DSCS_booklet_Hi.pdf` — not linked on the accessibility page; verify page before claiming | `fetched` only if linked |

## Non-goals

- CWSN e-content guidelines PDF (different document).
- PRAGYATA digital education guidelines.

---

## DIKSHA
