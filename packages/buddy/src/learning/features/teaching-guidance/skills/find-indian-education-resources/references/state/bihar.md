# Bihar SCERT — e-resources and textbooks (static PDF)

**Publisher:** State Council of Educational Research and Training, Bihar  
**Official domain:** `scert.bihar.gov.in` only for e-resources in this reference  
**Fetch family:** `static-pdf` (HTML listing → item detail page → direct PDF under `/public/uploads/eresources/`)  
## What this source covers

- Class IX–XII (and other) **e-resources** with per-title detail pages and PDF downloads
- Teacher handbooks and CPD materials on the same portal
- **BSTBPC class textbooks** are linked from `https://scert.bihar.gov.in/textbooks` but hosted on `bstbpc.gov.in` — that host may return **HTTP 500**; prefer **scert.bihar.gov.in/eresources** for dependable fetches

## Discovery snapshot — handbook priority

| Title | Detail slug | SCERT PDF |
|-------|-------------|-----------|
| Science handbook teachers 6–8 | `science-handbook-for-teachers-class-6-8-1753723306` | `PBL_6-8_combine__book.pdf` |

Verify handbook and textbooks via **detail page** download `href`, not slug-derived filenames.

## Landing pages (discovery)

| Purpose | URL |
|--------|-----|
| E-resources index (searchable grid) | `https://scert.bihar.gov.in/eresources` |
| Bihar textbooks hub (links to BSTBPC) | `https://scert.bihar.gov.in/textbooks` |
| NCERT mirror link on portal | `https://ncert.nic.in/textbook.php` |

Start from **`/eresources`** for class/subject textbooks and handbooks with direct SCERT-hosted PDFs.

## Detail-page pattern

Each item has a slug URL:

```
https://scert.bihar.gov.in/eresources/{slug}-{unix_timestamp}
```

Example: `https://scert.bihar.gov.in/eresources/world-of-history-1719212099`

On the detail page:

- Title and cover image confirm identity (e.g. `World_Of_History_Class-9_Page_1.jpg` → Class 9)
- **`Formate: PDF`** appears in metadata (site spelling)
- **Download** link points to the real file — often **not** the same as the slug name

```bash
curl -sL -A "Mozilla/5.0" "https://scert.bihar.gov.in/eresources" \
  | rg -o 'href="https://scert\.bihar\.gov\.in/eresources/[^"]+"' | sort -u
```

Extract the PDF from the detail page:

```bash
curl -sL -A "Mozilla/5.0" "https://scert.bihar.gov.in/eresources/world-of-history-1719212099" \
  | rg -o 'https://scert\.bihar\.gov\.in/public/uploads/eresources/[^"<> ]+\.pdf'
```

## Direct PDF URL pattern

```
https://scert.bihar.gov.in/public/uploads/eresources/{filename}.pdf
```

- Filenames are **opaque** (`total_merged.pdf`, `Panorma_Reader_I_class-9th_page_1-42.pdf`, `Civics_Class-_9_(Binder).pdf`) — **never guess** from the title slug alone
- Some titles now use **Google Drive** (`drive.google.com/file/d/...`) instead of SCERT hosting — if no `scert.bihar.gov.in/...pdf` on the detail page, report `fetch_status: external_redirect` and do not substitute another subject’s PDF

## Discovery workflow

1. **Parse the request** — class, subject, resource type (textbook vs teacher handbook).
2. **Open** `https://scert.bihar.gov.in/eresources` and locate the card/link matching the title (or use slug from listing `href`).
3. **Open the detail page** and read `Formate: PDF`.
4. **Copy the official Download `href`** — prefer `https://scert.bihar.gov.in/public/uploads/eresources/...pdf` over `javascript:void` / `showMe` wrappers (they share the same URL in `onclick`).
5. **Verify:** `curl -sI -A "Mozilla/5.0" "{pdf_url}"` → `200` and `Content-Type: application/pdf`.
6. **Download:** `curl -fL -A "Mozilla/5.0" -o "{local_path}" "{pdf_url}"`.
7. **Post-check:** `file` confirms PDF; optional `pdftotext -f 1 -l 2` for title/class. If `pdftotext` returns nothing (image-scanned pages), rely on detail-page title, **Formate: PDF**, and cover image instead.

## Disambiguation notes

| User says | Detail slug (example) | PDF filename (example) |
|-----------|----------------------|-------------------------|
| Class 9 World of History | `world-of-history-1719212099` | `total_merged.pdf` |
| Class 9 Panorama English Reader Part I | `panorama-english-reader-1719212595` | `Panorma_Reader_I_class-9th_page_1-42.pdf` (typo **Panorma** on server); user **Part 1** = portal **Part -1** / Part I |
| Democratic Polity Part I, Class 9 | `democratic-polity-part-i-1719211628` | `Civics_Class-_9_(Binder).pdf` |
| Science handbook teachers 6–8 | `science-handbook-for-teachers-class-6-8-1753723306` | `PBL_6-8_combine__book.pdf`; portal Hindi title **शिक्षकों हेतु विज्ञान हस्त-पुस्तिका कक्षा 6-8**, cover `Science_Handbook_for_Teachers_class6-8.png` |
| Class 11 Chemistry Part I | `chemistry-part-i-1719298584` | Drive-only — not SCERT direct PDF |

**World of History** uses `total_merged.pdf` for multiple history titles — always verify cover/meta on the detail page.

## Metadata mapping

| Field | Guidance |
|-------|----------|
| `source_url` | Final PDF on `scert.bihar.gov.in` |
| `landing_url` | `/eresources` index or specific `/eresources/{slug}` page |
| `class` | From cover image name, title, or user prompt |
| `resource_type` | `textbook`, `teacher_guide`, `handbook` |
| `fetch_status` | `fetched` / `external_redirect` (Drive) / `not_found` |
| `license` | Official SCERT Bihar; no open license captured |

## Known gaps and failure modes

- **BSTBPC links** on `/textbooks` may 500 — do not block on them if e-resource path exists
- **Drive-only items** (e.g. Mathematics, Biology, Chemistry XI) — report honestly; no NCERT substitution
- **Huge files** — `Civics_Class-_9_(Binder).pdf` ~150 MB; `PBL_6-8_combine__book.pdf` (science handbook) ~230 MB — allow long downloads; warn in `notes`
- **Image-scanned PDFs** — handbook and civics binder may have no extractable text on early pages; do not fail verification when HEAD/`file` pass and detail page identity matches
- **Shared filenames** — `total_merged.pdf` reused across history titles; `Civics_Class-_9_(Binder).pdf` may label other civics binders — confirm detail page title

## Rights

Official SCERT Bihar content. No Creative Commons statement captured. Educational fetch only; no assumed commercial reuse.

## Quick verification commands

```bash
curl -sI -A "Mozilla/5.0" \
  "https://scert.bihar.gov.in/public/uploads/eresources/total_merged.pdf"

curl -sI -A "Mozilla/5.0" \
  "https://scert.bihar.gov.in/public/uploads/eresources/Panorma_Reader_I_class-9th_page_1-42.pdf"
```
