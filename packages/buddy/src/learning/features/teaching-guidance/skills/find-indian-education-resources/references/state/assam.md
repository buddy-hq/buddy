# Assam SCERT — textbook lists, on-domain PDFs, and Drive textbooks

**Publisher:** State Council of Educational Research and Training, Assam  
**Official domain:** `scert.assam.gov.in` only (Drive links are **official wrappers** from SCERT pages)  
**Fetch family:** `mixed` — direct `sites/default/files/...pdf` + **listing → Google Drive** (`wrapper_only` common)  
**Status:** Official listing with direct PDFs and Drive wrapper cases.

## What this source covers

- **Comprehensive textbook list** PDFs (elementary, by academic year)
- **Ka-Shreni to Class VIII** textbook tables (2025–26) with per-title Drive links
- **On-domain teacher/resource PDFs** (e.g. sports pedagogy handbook)
- Textbook portlets by level (`taxonomy/term/5673`, etc.)

## Official domains

| Purpose | URL |
|--------|-----|
| Home | `https://scert.assam.gov.in/` |
| Elementary textbooks portlet | `https://scert.assam.gov.in/taxonomy/term/5673` |
| Comprehensive textbook lists | `https://scert.assam.gov.in/taxonomy/term/6120` |
| Ka-Shreni – Class VIII (2025–26) | `https://scert.assam.gov.in/portlet-sub-innerpage/textbook-from-ka-shreni-to-class-viii-2025-26` |
| Elementary level 2023–24 portlet | `https://scert.assam.gov.in/portlet-sub-innerpage/textbooks-elementary-level-2023-24` |
| Sports pedagogy handbook (detail page) | `https://scert.assam.gov.in/documents-detail/handbook-on-sports-integrated-pedagogy-for-teachers-and-teacher-educator` |
| Site search (fallback discovery) | `https://scert.assam.gov.in/search/node?keys={query}` |

## Direct PDF patterns (on-domain)

```
https://scert.assam.gov.in/sites/default/files/swf_utility_folder/departments/scert_medhassu_in_oid_6/how_do_i/level_1/{filename}.pdf
https://scert.assam.gov.in/sites/default/files/swf_utility_folder/departments/scert_medhassu_in_oid_6/menu/document/{filename}.pdf
```

Known examples:

| Resource | URL |
|----------|-----|
| Comprehensive list 2024–25 | `https://scert.assam.gov.in/sites/default/files/swf_utility_folder/departments/scert_medhassu_in_oid_6/how_do_i/level_1/comprehensive_list_of_textbooks_for_the_academic_year_2024-25.pdf` |
| Sports integrated pedagogy handbook | `https://scert.assam.gov.in/sites/default/files/swf_utility_folder/departments/scert_medhassu_in_oid_6/menu/document/handbook_on_sports_integrated_pedagogy_fr_teachers_and_teacher_educators.pdf` |

## Google Drive wrapper pattern (textbooks)

Official table rows link to:

```
https://drive.google.com/file/d/{FILE_ID}/view?usp=sharing
```

Example (Class I English 2025): **Begineers English-Class I_(English) 2025** →  
`https://drive.google.com/file/d/1cyPFGgDcNg-P8Qwtdi6PVd34OPl4vNrO/view?usp=sharing`

### Drive fetch rules

1. Resolve `FILE_ID` from the official SCERT listing row (never guess IDs).
2. **`/file/d/.../view` is not the PDF.** `curl -sI` on the view URL typically returns `text/html` (~74–75 KB viewer shell). Use the view URL as `source_url` only after confirming the portlet row; download via export (step 3).
3. Attempt export URL with redirects: `curl -fL` → `https://drive.google.com/uc?export=download&id={FILE_ID}` (often **303** then PDF stream).
4. If export response is HTML viewer / sign-in shell (~70KB `text/html`), report:
   - `fetch_status`: `wrapper_only`
   - `verification_status`: `verified` (official link + wrapper behavior documented)
5. Many SCERT-linked Drive files return a real PDF via `uc?export=download` (for example, Class I English and Class V Assamese EVS). If bytes start with `%PDF`, use `fetch_status: fetched`.
6. Do **not** treat third-party mirrors as success.

**Portlet anchor spelling:** SCERT uses **Begineers** (not “Beginners”) in Drive link text for Class I English 2025.

## Discovery workflow

1. **Parse** — list PDF vs single textbook vs teacher handbook vs Drive-backed title.
2. **Open** taxonomy/portlet page from table above (or `documents-detail/...` for some teacher handbooks).
3. **For on-domain PDFs:** extract `href="...sites/default/files/...pdf"` (almost always under `swf_utility_folder/...`), verify HEAD, `curl -fL` download.
4. **For Drive rows:** fetch portlet HTML, match **class + medium + subject** in the table, extract `file/d/{ID}` from that row’s anchor only.
5. Record `landing_url` as the SCERT portlet or `documents-detail` page (not the Drive view URL alone).
6. **Fallback:** site search `https://scert.assam.gov.in/search/node?keys={terms}` when the user names a handbook but not a portlet (e.g. `sports+pedagogy` → documents-detail page with PDF link).

```bash
curl -sL -A "Mozilla/5.0" \
  "https://scert.assam.gov.in/portlet-sub-innerpage/textbook-from-ka-shreni-to-class-viii-2025-26" \
  | rg -o 'drive\.google\.com/file/d/[^/]+|sites/default/files/[^"]+\.pdf'
```

## Disambiguation

| User says | Page | Target |
|-----------|------|--------|
| Comprehensive textbook list 2024–25 | `taxonomy/term/6120` or how_do_i links | `comprehensive_list_of_textbooks_for_the_academic_year_2024-25.pdf` |
| Class I English textbook 2025 | 2025–26 portlet | Drive row **Begineers English-Class I_(English) 2025** → `1cyPFGgDcNg-P8Qwtdi6PVd34OPl4vNrO` |
| Class V Assamese medium textbook 2025 | 2025–26 portlet | **Ami Aru Amar Paribesh_Class V_Assamese** (EVS; only Class V Assamese-medium row) → `12Xz17B3pz9qLYmkx3MUf95rkpVMZZF58` |
| Sports pedagogy handbook teachers | `documents-detail/handbook-on-sports-integrated-pedagogy-for-teachers-and-teacher-educator` or search | `handbook_on_sports_integrated_pedagogy_fr_teachers_and_teacher_educators.pdf` |

## Metadata mapping

| Field | Guidance |
|-------|----------|
| `source_url` | Final PDF URL **or** official Drive view URL |
| `landing_url` | SCERT portlet/taxonomy page |
| `fetch_status` | `fetched` / `wrapper_only` / `not_found` |
| `resource_type` | `textbook_list`, `textbook`, `teacher_handbook` |

## Anti-patterns

| Mistake | Outcome |
|---------|---------|
| Guess on-domain path e.g. `sites/default/files/textbooks/class5_assamese_2025.pdf` | **HTTP 404** — not under verified `swf_utility_folder/...` tree |
| Guess Drive `FILE_ID` without portlet row | Invalid / wrong file — always parse 2025–26 Ka-Shreni table |
| Treat Drive **view** URL body as PDF | HTML wrapper only; use `uc?export=download` for bytes |

## Known gaps

- Some Drive exports may still return HTML-only in other environments; when export fails, use `wrapper_only` with verified portlet link.
- Class V “Assamese textbook” on the 2025–26 portlet is **EVS** (Ami Aru Amar Paribesh), not a separate Assamese L1 language row.
- Secondary textbooks may be on DIKSHA rather than direct SCERT PDFs — out of scope unless user asks for DIKSHA.

## Quick verification

```bash
curl -sI -A "Mozilla/5.0" \
  "https://scert.assam.gov.in/sites/default/files/swf_utility_folder/departments/scert_medhassu_in_oid_6/how_do_i/level_1/comprehensive_list_of_textbooks_for_the_academic_year_2024-25.pdf"
```
