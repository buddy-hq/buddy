
# Kerala SCERT — Textbook Archives (static PDF)

**Publisher:** SCERT Kerala (textbook archives)  
**Official domain:** `textbooksarchives.scert.kerala.gov.in` only  
**Fetch family:** `static-pdf` (folder index → consolidated full-book PDFs)  
## What this source covers

- Standard-wise **consolidated** textbook PDFs (often full books, not per-chapter splits on this archive)
- English-medium files often tagged `[E]` in the filename

## Landing pages

| Purpose | URL |
|--------|-----|
| Archive home | `https://textbooksarchives.scert.kerala.gov.in/` |
| Standard folders | `.../consolidated pdf/STANDARD WISE/Standard {N}/` |

## Direct PDF URL pattern

```
https://textbooksarchives.scert.kerala.gov.in/consolidated pdf/STANDARD WISE/Standard {N}/{filename}.pdf
```

Encode spaces (`%20`), brackets (`%5B` `%5D`) for curl. Example filename: `TB_9_2016_900[E]_SOCIAL SCIENCE_PART 2.pdf`.

## Discovery workflow

1. **Parse the request** — standard (class), subject, part (Part 1/2), medium (English `[E]` vs Malayalam).
2. **Optional listing probe** (often empty or blocked — do not stop here):

```bash
curl -sL -A "Mozilla/5.0" "https://textbooksarchives.scert.kerala.gov.in/" \
  | rg -oi 'TB_[^"<> ]+\.pdf' | head
curl -sI -A "Mozilla/5.0" \
  "https://textbooksarchives.scert.kerala.gov.in/consolidated%20pdf/STANDARD%20WISE/Standard%20{N}/"
```

- Archive **home HTML** frequently has **no** `TB_*.pdf` tokens in a single `curl` pass.
- **`STANDARD WISE/Standard {N}/` via curl** often returns **403 Forbidden** (no directory listing). Use direct encoded PDF URLs when known from archive naming.

3. **Match** `TB_{standard}_*` and subject tokens (`SOCIAL SCIENCE`, `MATHEMATICS`, `PHYSICS`, …) and `[E]` for English; use the disambiguation table when the request is specific (e.g. Standard 9 SS Part 1 vs Part 2).
4. **Build the encoded direct URL** from the matched filename (primary path when listing fails).
5. **Verify & download:**

```bash
URL='https://textbooksarchives.scert.kerala.gov.in/consolidated%20pdf/STANDARD%20WISE/Standard%209/TB_9_2016_900%5BE%5D_SOCIAL%20SCIENCE_PART%202.pdf'
curl -sI -A "Mozilla/5.0" "$URL"
curl -fL -A "Mozilla/5.0" -o book.pdf "$URL"
```

6. **Post-download:** large files (~9–11 MB for Standard 9 SS English parts); `pdfinfo` page counts help sanity-check (e.g. Part 2 ~68 pages, Part 1 ~84 pages). Cover text is often **image-only** — see Verify below.

## Disambiguation

| User says | Filename hint |
|-----------|----------------|
| Standard 9 Social Science Part 2 English | `TB_9_2016_900[E]_SOCIAL SCIENCE_PART 2.pdf` |
| Standard 9 Social Science Part 1 English | `TB_9_2016_900[E]_SOCIAL SCIENCE_PART 1.pdf` |
| Part 1 vs Part 2 | `PART 1` vs `PART 2` in filename — do not merge |

## Verify

- Expect `200`, `Content-Type: application/pdf`, and `Content-Length` matching downloaded bytes.
- `file` + optional `pdfinfo` for page count; `pdftotext` on page 1 may return **empty** (scanned pages).
- When headers and filename tokens match the request but cover text is not extractable, use `verification_status: partial` (acceptable for this archive).

## Metadata mapping

| Field | Guidance |
|-------|----------|
| `source_url` | Encoded final PDF URL |
| `landing_url` | Archive home (`/`); note 403 if you also tried the standard folder |
| `class` | Standard number |
| `medium` | `[E]` → English; absence often Malayalam |
| `resource_type` | `textbook` (consolidated) |
| `verification_status` | `partial` when PDF is valid but cover/metadata is filename-only |

## Known gaps and failure modes

- **403 on standard folders:** `.../STANDARD WISE/Standard {N}/` via curl is not a reliable index — construct the direct PDF URL instead.
- **Home grep empty:** Do not treat missing `TB_*.pdf` in home HTML as “book unavailable” if the filename pattern is known.
- **Edition year:** Archive may lag current syllabus (`2016` in filenames); read title page year when possible.
- **URL encoding:** Spaces/brackets break naive curl.
- **No per-chapter PDFs** on this path — full book only.
- **Part confusion:** Science/Math multi-part books need exact `PART n`.
- **Out of scope:** Live **DIKSHA Kerala** streams are a different product — this leaf is `textbooksarchives.scert.kerala.gov.in` consolidated PDFs only.

## Rights

Official Kerala state textbook content; no open license captured in research.

## Quick verification

```bash
curl -sI -A "Mozilla/5.0" \
  "https://textbooksarchives.scert.kerala.gov.in/consolidated%20pdf/STANDARD%20WISE/Standard%209/TB_9_2016_900%5BE%5D_SOCIAL%20SCIENCE_PART%202.pdf"
```
