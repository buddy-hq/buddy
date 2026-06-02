
# Telangana SCERT — E-Textbooks (static PDF)

**Publisher:** State Council of Educational Research and Training, Telangana  
**Official domain:** `scert.telangana.gov.in` (including `www.`)  
**Fetch family:** `static-pdf` (portal listings → `/pdf/publication/...` PDFs)  

## What this source covers

- Class-wise e-textbooks (English, Telugu, bilingual/EM social studies, etc.)
- Publication PDFs under year folders such as `ebooks2019/`

## Landing pages

| Purpose | URL |
|--------|-----|
| SCERT home | `https://scert.telangana.gov.in/` |
| E-textbook PDF folder (representative) | `https://scert.telangana.gov.in/pdf/publication/ebooks2019/` |
| E-textbooks nav (ASP.NET shell) | `https://scert.telangana.gov.in/Displaycontent.aspx?encry=ammkNW4/gx+NeApstGPX+A==` |

Some listings use `DisplayImage.aspx?...` wrappers; resolve to a direct `/pdf/publication/.../*.pdf` path when possible. Home carousel links labeled “e-Textbooks” may return **unrelated** PDFs (e.g. NMMS materials) — do not treat as the textbook index.

## Direct PDF URL pattern

```
https://scert.telangana.gov.in/pdf/publication/{year_folder}/{filename}.pdf
```

Filenames often contain **spaces** (e.g. `10th eng.pdf`, `10 social em-21.pdf`). URL-encode spaces as `%20` in curl.

## Discovery workflow

1. **Parse the request** — class, subject, medium (English / Telugu / EM = English medium for social, etc.).
2. **Optional home crawl** (often insufficient — do not stop here):

```bash
curl -sL -A "Mozilla/5.0" "https://scert.telangana.gov.in/" \
  | rg -oi 'pdf/publication/[^"<> ]+\.pdf' | sort -u
```

- Static home HTML usually lists **misc publication** PDFs, not class-wise `ebooks2019/` filenames.
- `Displaycontent.aspx` e-Textbooks menu is postback UI — static `curl` does not expose direct ebook paths.
- `https://scert.telangana.gov.in/pdf/publication/ebooks2019/` via curl returns **403 Forbidden** (no directory listing).

3. **Filter** known filename tokens (`10th`, `9th`, `10 social`), medium (`eng`, `telugu`, `em`) from the disambiguation table; build the encoded direct URL.
4. **Verify (HEAD)** — require `200`, `Content-Type: application/pdf`, and multi-MB `Content-Length`. Wrong guesses (e.g. `9 eng.pdf`, `9th english.pdf`) often return **`200` with `text/html` (~2–3 KB)** — reject those.

```bash
curl -sI -A "Mozilla/5.0" "https://scert.telangana.gov.in/pdf/publication/ebooks2019/10th%20eng.pdf"
```

5. **Download:**

```bash
curl -fL -A "Mozilla/5.0" -o book.pdf \
  "https://scert.telangana.gov.in/pdf/publication/ebooks2019/10th%20eng.pdf"
```

6. **Post-download:** `%PDF` magic, `file` reports PDF; `pdftotext` on title pages for class/subject (e.g. *Our World through English* vs *SOCIAL STUDIES*). Do not swap English language vs EM social filenames.

## Disambiguation

| User says | Filename hint |
|-----------|----------------|
| Class 10 English textbook | `10th eng.pdf` |
| Class 10 Social Science English medium | `10 social em-21.pdf` (EM = English medium social) |
| Class 9 English | `9th eng.pdf` |
| Class 10 English vs Social EM | `10th eng.pdf` is language book; `10 social em-21.pdf` is English-medium social — do not swap |

## Metadata mapping

| Field | Guidance |
|-------|----------|
| `source_url` | Final PDF URL (encoded) |
| `landing_url` | Portal page or folder used for discovery |
| `class` | From filename (`10th` → 10) |
| `medium` | `eng`, `telugu`, `em` tokens |
| `resource_type` | `textbook` |

## Known gaps and failure modes

- **403 on `ebooks2019/`:** Folder URL is not a browsable index — use filename pattern + HEAD, not directory listing.
- **Home grep empty for textbooks:** Missing class PDFs in home HTML does not mean unavailable if the disambiguation token matches.
- **Year folders:** `ebooks2019/` may not hold latest edition; discover current folder from live site when HTML exposes it.
- **Spaces in paths:** Break curl if not encoded.
- **DisplayImage.aspx / carousel:** May serve unrelated PDFs; follow to real textbook path or use direct `/pdf/publication/.../*.pdf`.
- **False 200 HTML:** Near-miss filenames return small HTML bodies — always check `Content-Type` and size on HEAD.
- **Guessing filenames:** Wrong class digit or subject → 404 or HTML trap above.

## Rights

Official Telangana government textbook content; no open license captured.

## Quick verification

```bash
curl -sI -A "Mozilla/5.0" \
  "https://scert.telangana.gov.in/pdf/publication/ebooks2019/10%20social%20em-21.pdf"
```
