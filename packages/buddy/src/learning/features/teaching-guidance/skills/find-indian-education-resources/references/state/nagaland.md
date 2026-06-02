# Nagaland SCERT — syllabi, ECCE, and teacher handbooks

**Publisher:** State Council of Educational Research and Training, Nagaland  
**Official domain:** `scert.nagaland.gov.in` only  
**Fetch family:** `static-pdf` (WordPress posts/pages → `/wp-content/uploads/...pdf`)  
## What this source covers

- Pre-primary / elementary **syllabus** PDFs
- **ECCE curriculum handbook** (Parts A & B)
- **Teacher manuals** for pre-primary classes
- **Transition syllabus** compilations
- Curriculum development pages (HTML discovery → PDF links)

## Official domains

| Purpose | URL |
|--------|-----|
| Site home | `https://scert.nagaland.gov.in/` |
| Elementary curriculum & syllabus post | `https://scert.nagaland.gov.in/curriculum-and-syllabus-for-elementary-schools-in-nagaland/` |
| ECCE handbook post | `https://scert.nagaland.gov.in/nagaland-ecce-curriculum-handbook-preschool-teacher-handbook/` |
| Textbook & curriculum development | `https://scert.nagaland.gov.in/textbook-curriculum-development/` |

## Direct PDF URL patterns

```
https://scert.nagaland.gov.in/wp-content/uploads/{YYYY}/{MM}/{filename}.pdf
```

Verified examples:

| Resource | URL |
|----------|-----|
| ECCE Curriculum Handbook Part A | `https://scert.nagaland.gov.in/wp-content/uploads/2024/04/NAGALAND-ECCE-CURRICULUM-HANDBOOK-Part-A.pdf` |
| ECCE Curriculum Handbook Part B | `https://scert.nagaland.gov.in/wp-content/uploads/2024/04/NAGALAND-ECCE-CURRICULUM-HANDBOOK-Part-B.pdf` |
| Pre-primary & elementary syllabus (2023) | `https://scert.nagaland.gov.in/wp-content/uploads/2023/10/SYLLABUS-FOR-PRE-PRIMARY-ELEMENTARY-EDUCATION-2023-1.pdf` |
| SCERT curriculum syllabus (2023) | `https://scert.nagaland.gov.in/wp-content/uploads/2023/04/SCERT-Curriculum-Syllabus.pdf` |
| Transition syllabus (core subjects, 2026) | `https://scert.nagaland.gov.in/wp-content/uploads/2026/02/Compiled-Transition-Syllabus-All-Four-Core-Subjects.pdf` |
| Teacher manual Class A | `https://scert.nagaland.gov.in/wp-content/uploads/2026/04/TEACHER-MANUAL-Class-A-Final-Int.pdf` |
| Teacher manual Class B (5–6 year) | `https://scert.nagaland.gov.in/wp-content/uploads/2026/04/TEACHER-MANUAL-5-6-year-Class-B-Int.pdf` |

## Discovery workflow

1. **Parse the request** — syllabus vs ECCE handbook vs teacher manual vs transition document.
2. **Open the matching post/page** from the table above (or home → menu link).
3. **Extract PDF anchors:**

```bash
curl -sL -A "Mozilla/5.0" "{landing_url}" \
  | rg -o 'https://scert\.nagaland\.gov\.in/wp-content/uploads/[^"]+\.pdf'
```

4. **Filter** by filename tokens (`ECCE`, `SYLLABUS`, `TEACHER-MANUAL`, `Transition`).
5. **Verify:** `curl -sI -A "Mozilla/5.0" "{pdf_url}"` → `200`, `application/pdf` (or `Accept-Ranges` with PDF body).
6. **Download:** `curl -fL -A "Mozilla/5.0" -o "{local_path}" "{pdf_url}"`.

## Disambiguation notes

| User says | Landing | Target |
|-----------|---------|--------|
| ECCE / preschool curriculum handbook | ECCE post | Part A or Part B PDF |
| Elementary syllabus Nagaland (pre-primary + elementary) | Curriculum post | `SYLLABUS-FOR-PRE-PRIMARY-ELEMENTARY-EDUCATION-2023-1.pdf` (~30 MB) |
| SCERT curriculum syllabus (shorter 2023 doc) | Same curriculum post | `SCERT-Curriculum-Syllabus.pdf` — not the pre-primary/elementary compilation |
| Transition syllabus core subjects | **Verified direct URL** (see table) | `Compiled-Transition-Syllabus-All-Four-Core-Subjects.pdf` — **not linked** on textbook/curriculum or elementary discovery HTML |
| Teacher manual pre-primary Class A | ECCE post | `TEACHER-MANUAL-Class-A-Final-Int.pdf` |
| Teacher manual pre-primary Class B | ECCE post | `TEACHER-MANUAL-5-6-year-Class-B-Int.pdf` |

**Do not guess** upload paths under `/scert/wp-content/` (broken mirror on `webtest.nagaland.gov.in`).

## Metadata mapping

| Field | Guidance |
|-------|----------|
| `source_url` | Absolute PDF on `scert.nagaland.gov.in` |
| `landing_url` | WordPress post used for discovery |
| `resource_type` | `syllabus`, `ecce_handbook`, `teacher_manual`, `transition_syllabus` |
| `fetch_status` | `fetched` / `not_found` |
| `license` | Official government SCERT material; no open license stated |

## Anti-patterns

| Mistake | Outcome |
|---------|---------|
| Scrape `textbook-curriculum-development/` expecting syllabus PDF anchors | **No** `wp-content/uploads/...pdf` links in page HTML (widgets/images only) |
| Wait for transition syllabus to appear on discovery landings | 2026 transition PDF is **not** listed on textbook/curriculum or elementary posts — use verified direct URL after HEAD |
| Guess invented `uploads/{YYYY}/{MM}/Fake-Class-10-*.pdf` | **HTTP 404**, `Content-Type: text/html` (not PDF); `curl -f` download fails |
| Substitute elementary/transition syllabus when user asked for Class 10 textbook | Wrong resource — report `not_found` / `source_gap` for the requested path |

## Known gaps

- **`source_gap`:** No Nagaland SCERT **secondary textbooks** (e.g. Class 10 Mathematics) on `scert.nagaland.gov.in`. Verified catalog is syllabi, ECCE handbooks, pre-primary teacher manuals, and transition syllabus only.
- Some sidebar assets point to stale `webtest.nagaland.gov.in` hosts — ignore.
- Missing upload paths return **404** with HTML body, not `application/pdf`.
- **Negative test:** Invented `.../uploads/2020/01/Fake-Class-10-Textbook.pdf` (or `Fake-Class-10-Math.pdf`) → expect `not_found`; do not swap in a verified syllabus PDF.

## Quick verification

```bash
curl -sI -A "Mozilla/5.0" \
  "https://scert.nagaland.gov.in/wp-content/uploads/2024/04/NAGALAND-ECCE-CURRICULUM-HANDBOOK-Part-A.pdf"
```
