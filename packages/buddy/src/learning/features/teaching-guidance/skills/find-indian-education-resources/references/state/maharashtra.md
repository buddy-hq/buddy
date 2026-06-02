
# Maharashtra Balbharati — e-Book Library (static PDF)

**Publisher:** Maharashtra State Bureau of Textbook Production and Curriculum Research (Balbharati)  
**Official domain:** `books.ebalbharati.in` only (also linked from `ebalbharati.in`). Listing HTML may show Download links on `ebooks.ebalbharati.in` — still fetch with `https://books.ebalbharati.in/pdfs/{id}.pdf`.
**Fetch family:** `static-pdf` (filterable HTML library → `/pdfs/{numeric_id}.pdf`)  

## What this source covers

- Standards 1–12 textbooks, workbooks, teachers’ handbooks, archives (multiple syllabus years)
- Multiple mediums: Marathi, English, Hindi, Urdu, and others per filter UI

## Landing pages

| Purpose | URL |
|--------|-----|
| Main e-book library | `https://books.ebalbharati.in/` |
| Archives (older editions) | `https://books.ebalbharati.in/archives/` |

Discovery is **client-side filtered HTML** (syllabus year, book type, class, medium, subject). PDF IDs are opaque numerics — **never invent an ID**; read it from the listing `Download` link.

## Direct PDF URL pattern

```
https://books.ebalbharati.in/pdfs/{id}.pdf
```

| Example | PDF id |
|---------|--------|
| Standard 8 English Balbharati | `803020001.pdf` |
| Standard 1 Marathi Balbharati | `101050001.pdf` (from default library HTML list) |

## Discovery workflow

1. **Parse the request** — standard (class), subject/title (e.g. Balbharati, Mathematics, Science), medium (Marathi/English/Hindi/…), syllabus year if stated (default to latest year shown, often 2025).
2. **Open** `https://books.ebalbharati.in/` and apply filters matching class, medium, and book type **Text Books** unless user asked for workbook/handbook.
3. **Extract PDF links** from the rendered book list (initial HTML includes many `pdfs/NNNNNNNNN.pdf` anchors):

```bash
curl -sL -A "Mozilla/5.0" "https://books.ebalbharati.in/" \
  | rg -o 'pdfs/[0-9]+\.pdf|openpdf\([0-9]+\)' | sort -u
```

Also parse `onclick='openpdf({id})'` on book rows when Download anchors are sparse.

**Default page vs filters:** Unfiltered home (2025 syllabus) often lists **lower standards** (e.g. Std 1 Balbharati in all mediums). **Std 8 English** and other upper-standard titles are usually **not** on that first page — static curl of `/` alone will miss them.

Match row labels (Marathi book titles in Devanagari) to the user’s medium and standard. When filters change, re-fetch the page, simulate the UpdatePanel postback, or use browser automation if the list is empty in static HTML.

**ASP.NET filter postback (when static HTML lacks the target class/medium):** The library uses `Js/cart.js` (`fpnl()` / `chkclick()`) — selected filter IDs post via `__doPostBack('upBtn', '<comma-separated-ids>#1')` on an UpdatePanel with syllabus year (e.g. `txtyear=2025`). Example filter IDs from a 2025 run: `101` Text Books, `208` Standard 8, `303` English. Parse the filtered response HTML for `pdfs/{id}.pdf` or `openpdf({id})` — do not invent IDs. English-medium filter for Std 8 shows `८ वी बालभारती इंग्रजी` only (no Marathi Balbharati row in that set).
4. **Verify before full download:**

```bash
curl -sI -A "Mozilla/5.0" "https://books.ebalbharati.in/pdfs/{id}.pdf" \
  | rg -i 'HTTP/|content-type|content-length'
```

Expect `200` and `application/pdf`.
5. **Download:**

```bash
curl -fL -A "Mozilla/5.0" -o "{local_path}" "https://books.ebalbharati.in/pdfs/{id}.pdf"
```

6. **Post-download:** `file` confirms PDF; `pdftotext -f 1 -l 2` to read “STANDARD …”, “BALBHARATI”, subject, and medium on the title page.

## Disambiguation

| User says | Match on listing / title page |
|-----------|------------------------------|
| Standard 1 Marathi Balbharati | Row “१ ली बालभारती मराठी”; ID `101050001` (often on default home — no postback) |
| Standard 1 Hindi / English Balbharati | “१ ली बालभारती हिंदी” → `102050001`; “१ ली बालभारती इंग्रजी” → `103050001` |
| Standard 8 English Balbharati | Filter English medium; row “८ वी बालभारती इंग्रजी”; `803020001` (requires postback) |
| Workbook vs textbook | Set **Book Types** filter correctly |

## Metadata mapping

| Field | Guidance |
|-------|----------|
| `source_url` | Final `https://books.ebalbharati.in/pdfs/{id}.pdf` |
| `landing_url` | Library home or archives page used |
| `class` | From title page “STANDARD …” |
| `medium` | From filter + title (Marathi/English/…) |
| `resource_type` | `textbook`, `workbook`, `teacher_guide` |
| `license` | Colophon reserves reproduction to MSBTPCR; not open content |

## Known gaps and failure modes

- **Opaque IDs:** Cannot derive `{id}` from class alone; must scrape listing after filters. Example IDs in this doc (`101050001`, `803020001`) are verified samples — do not reuse for a different class/medium without re-matching the listing.
- **JS/WebForms:** Static curl of `/` may only see default first page (~12 lower-standard books); upper standards need filter postback or browser.
- **Wrong book type:** Exam/sample compilations can appear in search — confirm “BALBHARATI” and standard on title page.
- **Sparse pdftotext:** Many title pages are image-heavy; `pdftotext` on pages 1–2 may return little text — rely on listing label, HEAD (`application/pdf`), and `file` magic, then deeper page extract if needed.
- **Archives:** Older syllabus years live under `/archives/`; same `/pdfs/` pattern once book is found.

## Rights

Official Balbharati textbooks. PDF colophon reserves all reproduction rights. Personal/educational fetch only unless user has separate permission.

## Quick verification

```bash
curl -sI -A "Mozilla/5.0" "https://books.ebalbharati.in/pdfs/803020001.pdf"
curl -sL -A "Mozilla/5.0" "https://books.ebalbharati.in/" | rg -o 'pdfs/[0-9]+\.pdf' | head
```
