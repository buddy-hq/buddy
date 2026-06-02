# Goa SCERT — textbooks, life skills, and official PDFs

**Publisher:** State Council of Educational Research and Training, Goa  
**Official domain:** `scert.goa.gov.in` only  
**Fetch family:** `static-pdf` (WordPress pages → direct `/wp-content/uploads/...pdf`)  
## What this source covers

- Legacy **class textbooks** (some still on `wp-content/uploads/2020/06/text-books/`)
- **Life skills / value education** student and teacher booklets (2022 uploads)
- **Curriculum framework and policy PDFs** (2024–2027 uploads)
- **Audio books** — often Google Drive folders from the textbook hub (not direct MP3 on domain)

## Discovery snapshot

| Surface | Drive links | On-domain PDF hrefs |
|---------|-------------|---------------------|
| `?page_id=2140` textbook hub | 11 | 10 |
| `?page_id=2116` life skills | 0 | multiple `Student-{N}-*.pdf` |

Prefer life-skills or legacy `2020/06/text-books/` paths for direct PDF fetches; textbook hub often → **Google Drive** (`external_redirect`).

## Landing pages (discovery)

| Purpose | URL |
|--------|-----|
| Textbooks hub (classes 1–12; many links → Drive) | `https://scert.goa.gov.in/?page_id=2140` |
| Audio books classes 1–2 | `https://scert.goa.gov.in/?page_id=2575` |
| Life skills / co-curricular (classes 5–8 PDFs) | `https://scert.goa.gov.in/?page_id=2116` |
| Site home (important links sidebar) | `https://scert.goa.gov.in/` |

For **direct PDF fetch**, prefer pages that expose `href="/wp-content/uploads/...pdf"` or full `https://scert.goa.gov.in/wp-content/uploads/...pdf` anchors — not only Drive folder thumbnails on `page_id=2140`.

## Direct PDF URL patterns

```
https://scert.goa.gov.in/wp-content/uploads/{YYYY}/{MM}/{path}.pdf
```

Examples:

| Resource | URL |
|----------|-----|
| Class 1 Marathi textbook (legacy, still live) | `https://scert.goa.gov.in/wp-content/uploads/2020/06/text-books/Class-1/Gomant-Bharati-Marathi-Class-1.pdf` |
| Class 5 student — Waste Management | `https://scert.goa.gov.in/wp-content/uploads/2022/04/Student-5-Waste-Management.pdf` |
| SCF School Education report | `https://scert.goa.gov.in/wp-content/uploads/2024/07/Final-Report-SCF-SE-Goa-1_opt.pdf` |

Relative links on pages (`href="/wp-content/uploads/..."`) must be resolved to absolute URLs on `scert.goa.gov.in`.

## Discovery workflow

1. **Parse the request** — class, subject/medium, resource type (textbook, life-skills booklet, curriculum report).
2. **Pick the listing page:**
   - Textbook → `?page_id=2140` (check for legacy PDF vs Drive)
   - Life skills → `?page_id=2116`
   - Policy / SCF → home sidebar or search `wp-content/uploads/2024/`
3. **Extract PDF links:**

```bash
curl -sL -A "Mozilla/5.0" "https://scert.goa.gov.in/?page_id=2116" \
  | rg -o 'href="(/wp-content/uploads/[^"]+\.pdf|https://scert\.goa\.gov\.in/wp-content/uploads/[^"]+\.pdf)"'
```

On **`page_id=2140`**, the same extract often surfaces **policy / GTET / circular** PDFs only — not `text-books/` or `Gomant-Bharati` anchors. If nothing matches, grep the hub HTML for `gomant`, `marathi`, `class-{N}`, or fall through to the disambiguation table / verified legacy paths (Class 1 Marathi is **not** linked as an on-domain PDF on the hub today).

4. **Filter** by filename tokens (`Student-5`, `Gomant-Bharati`, `SCF-SE`, etc.).
5. **Verify:** `curl -sI -A "Mozilla/5.0" "{absolute_url}"` → `200`, `application/pdf`.
6. **Download:** `curl -fL -A "Mozilla/5.0" -o "{local_path}" "{absolute_url}"`.

## Disambiguation notes

| User says | Page | Target file |
|-----------|------|-------------|
| Class 1 Marathi Gomant Bharati | `page_id=2140` (Class 1 tile → **Drive folder**, no direct PDF `href`) | legacy path only: `.../Class-1/Gomant-Bharati-Marathi-Class-1.pdf` |
| Class 5 waste management student booklet | `page_id=2116` | `Student-5-Waste-Management.pdf` |
| Goa SCF School Education report | Home / important links | `Final-Report-SCF-SE-Goa-1_opt.pdf` |
| Class 5 Marathi textbook via 2020 path guess | — | **Often 404/500** — hub now points to Drive for many classes |

**Do not guess** `Class-{N}/Gomant-Bharati-Marathi-Class-{N}.pdf` for N>1 without a live link — only Class 1 Marathi legacy path is known-good on-domain.

## Metadata mapping

| Field | Guidance |
|-------|----------|
| `source_url` | Absolute PDF on `scert.goa.gov.in` |
| `landing_url` | WordPress page used (`?page_id=...`) |
| `class` | From filename (`Student-5`, `Class-1`) or prompt |
| `resource_type` | `textbook`, `student_booklet`, `curriculum_report`, `circular` |
| `fetch_status` | `fetched` / `external_redirect` (Drive) / `not_found` |
| `license` | Footer: Copyright SCERT Goa |

## Known gaps and failure modes

- **Textbook hub migration:** `page_id=2140` links many classes to **Google Drive** — report `external_redirect` if no SCERT PDF
- **Hub listing gap:** Class 1 legacy Marathi PDF is **not** exposed as an on-domain `href` on `page_id=2140` (hub tile → Drive). Success needs the verified legacy URL + HEAD verify, not a live hub anchor.
- **Legacy 2020 paths:** Most `Class-2` … `Class-8` under `text-books/` return **500** (Class 5 Marathi pattern → HTTP 500 + `text/html`, not PDF) except verified Class 1 Marathi
- **Wrong-class substitute:** When the requested class pattern fails, do **not** return Class 1 (or another class) same-series PDF as success — report `not_found`
- **Audio books:** `page_id=2575` → Drive files, not on-domain MP3
- **Negative test:** Invented `.../Class-5/Gomant-Bharati-Marathi-Class-5.pdf` → expect **500**; use `page_id=2116`, listing scrape, or known-good URL

## Rights

Copyright SCERT Goa (site footer). No open-content license. Official government educational material.

## Quick verification commands

```bash
curl -sI -A "Mozilla/5.0" \
  "https://scert.goa.gov.in/wp-content/uploads/2020/06/text-books/Class-1/Gomant-Bharati-Marathi-Class-1.pdf"

curl -sL -A "Mozilla/5.0" "https://scert.goa.gov.in/?page_id=2116" \
  | rg -o '/wp-content/uploads/2022/04/Student-5[^"]+\.pdf'
```
