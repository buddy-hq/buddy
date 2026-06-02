# Odisha SCERT — textbooks, workbooks, and publications (static PDF)

**Publisher:** State Council of Educational Research and Training, Odisha  
**Official domain:** `scert.odisha.gov.in` only  
**Fetch family:** `static-pdf` (WordPress HTML listings → direct `/wp-content/uploads/...pdf`)  
## What this source covers

- School textbooks (classes I–X and newer I–VIII OCF set)
- Workbooks and teacher guides
- Syllabus, teacher-education, and scheme PDFs linked from publications

## Landing pages (discovery)

| Purpose | URL |
|--------|-----|
| Publications hub | `https://scert.odisha.gov.in/departments/publications/` |
| Textbooks class I–X (main table) | `https://scert.odisha.gov.in/textbook-class-i-x/` |
| New textbooks class I–VIII (OCF 2025–26) | `https://scert.odisha.gov.in/new-textbook-class-i-viii/` |
| Workbooks & teacher guides | `https://scert.odisha.gov.in/workbook-teachers-guide-book/` |

Start from the **category page** that matches the resource type, not the publications hub alone (the hub links to these pages but does not list every PDF inline).

## Direct PDF URL pattern

```
https://scert.odisha.gov.in/wp-content/uploads/{YYYY}/{MM}/{filename}.pdf
```

- `{YYYY}/{MM}` is usually `2024/06` for the current I–X textbook batch; newer OCF books often use `2026/04` or `2026/03`.
- Filenames are descriptive but inconsistent: `English-V-P-1-128_11zon.pdf`, `Bigyana-VI-Hindi_11zon-1.pdf`, `Paribesa-Bigyan-V-P-1-208_11zon.pdf`.
- Suffixes like `_11zon`, `_compressed`, and duplicate `-1` variants are common; **use the exact `href` from the listing**, do not guess shortened names.
- Odia titles appear as percent-encoded or Unicode paths under `wp-content/uploads/2026/04/`.

## Discovery workflow

1. **Parse the request** — class, subject, medium (English / Hindi / Odia / Urdu / Bengali / Telugu as offered), resource type (textbook vs workbook/teacher guide).
2. **Open the right listing page** (table of subjects per class):
   - Textbook → `textbook-class-i-x/` (classes I–X) or `new-textbook-class-i-viii/` (new OCF set).
   - Workbook or teacher handbook → `workbook-teachers-guide-book/`.
3. **Extract PDF links** from the HTML (all are direct anchors, not JS APIs):

```bash
curl -sL -A "Mozilla/5.0" "https://scert.odisha.gov.in/textbook-class-i-x/" \
  | rg -o 'https://scert\.odisha\.gov\.in/wp-content/uploads/[^"<> ]+\.pdf' \
  | sort -u
```

4. **Filter by filename and row context** — match class numerals (`V`, `VI`, `VII`), subject tokens (`English`, `Bigyan`, `Bigyana`, `Ganita`, `Paribesa`), and medium (`Hindi`, `Urdu`, `Bengali`, etc.). When multiple PDFs match, prefer the one whose link sits in the same table row as the subject title. Grep HTML around the `href` (Odia row labels like ପଞ୍ଚମ ଶ୍ରେଣୀ or **MY ENGLISH BOOK**) when filenames alone are ambiguous.
5. **Verify before download:**

```bash
curl -sI -A "Mozilla/5.0" "{pdf_url}" | rg -i 'HTTP/|content-type|content-length'
```

Expect `HTTP/1.1 200` and `Content-Type: application/pdf`.

6. **Download:**

```bash
curl -fL -A "Mozilla/5.0" -o "{local_path}" "{pdf_url}"
```

7. **Post-download check:** `file` shows PDF; optional `pdftotext -f 1 -l 2` or `pdfinfo`. Many SCERT PDFs are image-scanned — empty `pdftotext` is normal; rely on listing row + exact `href` + `file`/`pdfinfo` instead of title-page text.

## Disambiguation notes

| User says | Look for | Example filename |
|-----------|----------|------------------|
| Class 5 English textbook | `textbook-class-i-x/`, English + `V` (not `English-IV-P-1` or `English-VII-P-1`) | `English-V-P-1-128_11zon.pdf` |
| OCF JASMINE part 1 | `new-textbook-class-i-viii/`, exact `JASMINE-1.pdf` in **JASMINE** row | not `JASMINE.pdf` or `JASMINE-2.pdf` on same page |
| Class 6 Science (Odia medium) | `Bigyan` or `Paribesa` + `VI` without `Hindi`/`Urdu` suffix | `Bigyan-6-Urdhu` vs `Bigyana-VI-Hindi` — pick medium explicitly |
| Class 6 Science Hindi | `Bigyana-VI-Hindi` | `Bigyana-VI-Hindi_11zon-1.pdf` |
| Environment Science class 5 | `Paribesa-Bigyan` + `V` | `Paribesa-Bigyan-V-P-1-208_11zon.pdf` |
| Teacher guide / workbook Science class 6 | `workbook-teachers-guide-book/`, row Utthan – Science – class 6 | `Science_Class_6.pdf` (not `Science-Cl-7-_-8_11zon.pdf`) |

**Paribesa Bigyan** (environmental science) and **Bigyan/Bigyana** (general science) are different subjects; do not substitute.

## Metadata mapping

| Field | Guidance |
|-------|----------|
| `source_url` | Final PDF URL |
| `landing_url` | Category page used for discovery |
| `class` | From prompt or filename (`V` → 5, `VI` → 6) |
| `subject` | English, Mathematics (`Ganita`), Science (`Bigyan`/`Bigyana`), etc. |
| `medium` | From filename suffix or table row |
| `resource_type` | `textbook`, `workbook`, `teacher_guide`, `syllabus` |
| `format` | `pdf` |
| `fetch_status` | `fetched` on 200 + valid PDF; `not_found` if no matching anchor |
| `license` | Official SCERT Odisha; no open-content license on site |

## New OCF textbooks (classes I–VIII)

Page: `https://scert.odisha.gov.in/new-textbook-class-i-viii/`  
PDFs under `wp-content/uploads/2026/04/` (and related months) with short names such as `JASMINE-1.pdf`, `Pallavi-1.pdf`, plus Odia Unicode filenames. Ullas primers live under `2026/03/` and can be very large — prefer named subject books for tests.

```bash
curl -sL -A "Mozilla/5.0" "https://scert.odisha.gov.in/new-textbook-class-i-viii/" \
  | rg -o 'https://scert\.odisha\.gov\.in/wp-content/uploads/2026/[^"<> ]+\.pdf'
```

Do not use the I–X table page for OCF titles; do not strip Odia or Latin filenames when copying `href`s.

## Known gaps and failure modes

- **Guessing URLs** fails when `_11zon` or `-1` suffix differs; always scrape the listing.
- **Wrong category page:** I–X books are on `textbook-class-i-x/`; OCF/Ullas titles are on `new-textbook-class-i-viii/` only.
- **OCF numbered siblings:** Same hub lists `JASMINE.pdf`, `JASMINE-1.pdf`, `JASMINE-2.pdf` — use the exact filename from the request; do not pick the shortest name.
- **Workbook page noise:** `workbook-teachers-guide-book/` mixes Utthan subject workbooks, multi-class guides (`Science-Cl-7-_-8_11zon.pdf`), and admin PDFs; confirm class in the table row, not filename alone.
- **Image-scanned PDFs:** `pdftotext` on pages 1–2 often returns nothing; verification should use listing row + HEAD + `file` (and `pdfinfo` if needed).
- **Large files:** Some primers exceed 70 MB (`Ullas-Primer-Concise-78mb.pdf`); prefer subject textbooks for smoke tests.
- **404 on invented paths:** Negative test — do not strip `_11zon` from filenames.
- **Non-textbook PDFs** on every page (RTI, CTET syllabus, D.El.Ed); filter with subject/class tokens.

## Rights

Official SCERT Odisha website content. No Creative Commons or explicit redistribution license captured. Use for personal/educational fetch; do not assume commercial reuse.

## Quick verification commands

```bash
# Example textbook (research-verified)
curl -sI -A "Mozilla/5.0" \
  "https://scert.odisha.gov.in/wp-content/uploads/2024/06/English-V-P-1-128_11zon.pdf"

# List all PDFs on class I–X page
curl -sL -A "Mozilla/5.0" "https://scert.odisha.gov.in/textbook-class-i-x/" \
  | rg -o 'https://scert\.odisha\.gov\.in/wp-content/uploads/[^"<> ]+\.pdf' | wc -l
```
