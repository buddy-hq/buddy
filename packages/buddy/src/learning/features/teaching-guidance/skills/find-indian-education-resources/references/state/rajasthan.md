# Rajasthan Board textbooks (BSER static PDF)

**Publisher:** Board of Secondary Education, Rajasthan (BSER)  
**Official domain:** `rajeduboard.rajasthan.gov.in` only  
**Fetch family:** `static-pdf` (frameset navigation → session-year HTML → direct subject PDFs)  
## What this source covers

- Class-wise textbook PDFs (especially classes IX–XII; older archives for VI–VIII)
- Session-year book sets under `books-2019/`, `books-2017/`, etc.
- Model papers and guidelines (separate folders — not textbooks)

## Landing pages (discovery)

| Purpose | URL |
|--------|-----|
| Books frameset entry | `https://rajeduboard.rajasthan.gov.in/books/index.htm` |
| Left navigation (session years) | `https://rajeduboard.rajasthan.gov.in/books/left.htm` |
| Current session listing (example; verify on `left.htm`) | `https://rajeduboard.rajasthan.gov.in/books-2019/2026-27.htm` |
| Older class-X-only page | `https://rajeduboard.rajasthan.gov.in/books-2017/10books.htm` |

The site uses **HTML frames**. Crawl `left.htm` for the session-year link, then open the year page (e.g. `2024-25.htm`) which lists class IX and X PDFs with relative paths like `cls9\Science.pdf`.

## Direct PDF URL pattern

```
https://rajeduboard.rajasthan.gov.in/books-2019/{relative-path-with-backslashes-as-forward-slashes}
```

Examples (resolve from the live year page — do not invent):

| Relative on page | Full URL |
|------------------|----------|
| `cls9\Science.pdf` | `https://rajeduboard.rajasthan.gov.in/books-2019/cls9/Science.pdf` |
| `cls10\English-Golden-Rays.pdf` | `https://rajeduboard.rajasthan.gov.in/books-2019/cls10/English-Golden-Rays.pdf` |
| `cls10\maths.pdf` | `https://rajeduboard.rajasthan.gov.in/books-2019/cls10/maths.pdf` |

Some links cross folders (e.g. `books-2020\cls9\Punjabi.pdf` → `.../books-2020/cls9/Punjabi.pdf`). **URL-encode spaces and `&`** in filenames (`Saririk & Swasthya Shiksha.pdf` → `%20`, `%26`).

## Discovery workflow

1. **Parse the request** — class, subject, medium (English vs Hindi titles), session year if known.
2. **Open `books/left.htm`** and pick the session link that matches the requested academic year (default: newest year page such as `2024-25.htm` under `books-2019/`).
3. **Extract PDF links** from the year page:

```bash
curl -sL -A "Mozilla/5.0" "https://rajeduboard.rajasthan.gov.in/books-2019/2026-27.htm" \
  | rg -o 'href="[^"]+\.pdf"' | sed 's/href="//;s/"$//'
```

If the scrape returns no match for a core subject (especially Class 9 Maths), also search commented markup — recent session pages sometimes wrap core `cls9\*.pdf` links in `<!-- ... -->` while the PDF URL still returns 200:

```bash
curl -sL -A "Mozilla/5.0" "https://rajeduboard.rajasthan.gov.in/books-2019/2026-27.htm" \
  | rg -o 'cls9\\[^"]+\.pdf|cls10\\[^"]+\.pdf'
```

4. **Map subject to filename** — English class 10 may be `English-Golden-Rays.pdf` or `English-Resolution.pdf`; Science is `Science.pdf` (class 9/10) or `Vigyan.pdf` (Hindi-medium label on some pages); Maths is `maths.pdf` (default) or `Maths-New.pdf` (Hindi-medium; page label often **Maths- (hindhi Ver.)** or **Maths-I**).
5. **Resolve relative href** against the year page directory (`books-2019/` unless href starts with `books-2020/` etc.).
6. **Verify and download:**

```bash
curl -sI -A "Mozilla/5.0" "{pdf_url}" | rg -i 'HTTP/|content-type'
curl -fL -A "Mozilla/5.0" -o "{local_path}" "{pdf_url}"
```

7. **Post-download:** `file` confirms PDF; optional `pdftotext -f 1 -l 1` for title check. Many board PDFs are scanned — if `pdftotext` returns nothing, rely on HTTP 200, `Content-Length` match after download, and `file`.

## Disambiguation notes

| User says | Look for | Notes |
|-----------|----------|-------|
| Class 9 Science | `cls9\Science.pdf` on current year page | ~52 MB; 200 OK |
| Class 10 Science | `cls10\Science.pdf` | Very large (~150 MB) |
| Class 9 Maths | `cls9\maths.pdf` | May be **commented out** on newest year page (`2026-27.htm`); HEAD `.../cls9/maths.pdf` after mapping |
| Class 10 English | `English-Golden-Rays.pdf` or `English-Resolution.pdf` | Two separate books; default **Golden Rays** (~100 MB) unless user names **Resolution** (~24 MB) |
| Class 10 Maths | `maths.pdf` or `Maths-New.pdf` | Default `maths.pdf`; `Maths-New.pdf` is Hindi-medium (~167 MB) |
| Social Science (Hindi) | `socsci(hindi).pdf` or `SST.pdf` | Medium-specific |

Do not use legacy IP links on `left.htm` (`117.239.28.178`) — stay on `rajeduboard.rajasthan.gov.in`.

## Metadata mapping

| Field | Guidance |
|-------|----------|
| `source_url` | Final PDF URL on `rajeduboard.rajasthan.gov.in` |
| `landing_url` | Session year page used (`2024-25.htm`, etc.) |
| `class` | From prompt (IX → 9, X → 10) |
| `subject` | Science, Mathematics, English, etc. |
| `medium` | From filename/label (`Vigyan`, `socsci(hindi)`) |
| `resource_type` | `textbook` |
| `format` | `pdf` |
| `fetch_status` | `fetched` on 200 + valid PDF |
| `license` | Official BSER content; no open license captured |

## Known gaps and failure modes

- **Wrong session year:** Older `books-2017/` pages may not list the same filenames as `books-2019/2024-25.htm`.
- **Frameset:** If only `index.htm` is fetched, you get no PDFs — must follow `left.htm` → year page.
- **Huge files:** Class 10 Science can exceed 150 MB; Golden Rays ~100 MB. Allow time and disk; if `curl -fL` fails mid-transfer (e.g. exit 18), retry with `curl -fL -C -` to resume.
- **404 on guessed paths:** Filenames are not uniform across years; always scrape the active year page.
- **Commented-out core links:** On the newest session page, Class 9 Maths/Science/Social Science hrefs may live only in HTML comments — visible rows can be IT, regional languages, etc. Do not treat an empty active-link scrape as `source_gap`; map the subject to `cls{N}/...` and HEAD-verify, or parse commented `cls9\...pdf` paths.
- **Duplicate titles on one page:** Class 10 English (Golden Rays vs Resolution) and Maths (`maths.pdf` vs `Maths-New.pdf`) — HEAD both if ambiguous before downloading large files.
- **External NCERT links** on some year pages are out of scope for this reference.

## Rights

Official BSER website textbooks. No Creative Commons license stated. Personal/educational fetch only unless board terms allow otherwise.

## Quick verification

```bash
curl -sI -A "Mozilla/5.0" \
  "https://rajeduboard.rajasthan.gov.in/books-2019/cls9/Science.pdf"
curl -sI -A "Mozilla/5.0" \
  "https://rajeduboard.rajasthan.gov.in/books-2019/cls10/English-Golden-Rays.pdf"
```
