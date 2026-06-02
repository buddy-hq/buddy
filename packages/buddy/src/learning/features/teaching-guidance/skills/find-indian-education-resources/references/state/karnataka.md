
# Karnataka — Textbook Society (listing → direct PDF)

**Publisher:** Karnataka Textbook Society (ರಿ)  
**Official domain:** `textbooks.karnataka.gov.in` only  
**Fetch family:** `listing-crawler` → `static-pdf` (`uploads/*.pdf`)  
**Supported formats:** PDF

Use this reference when the user wants Karnataka Textbook Society/KTBS textbooks by class, medium, subject, or language. It helps the agent use the official listing text before filenames, handle duplicate flat/nested upload paths, and avoid inventing `uploads/*.pdf` guesses when the listing does not expose a match.

## Official domains

| Purpose | URL |
|---------|-----|
| Home (Kannada) | `https://textbooks.karnataka.gov.in/` |
| English listing | `https://textbooks.karnataka.gov.in/en` |

## Discovery

1. Prefer **`/en`** for class-named textbooks; home (`/`) adds carousel `media_to_upload*.pdf` (often notices).
2. Extract PDF hrefs: `uploads/...pdf` (URL-encoded spaces allowed).
3. Match user request to **anchor text** in the listing HTML first, then filename tokens (`5th`, `10th`, `Marati`/`Marathi`, `maths`, `SS`, `Kannada`, etc.).
4. **Never invent** `uploads/{guess}.pdf` — only URLs present in fetched HTML.

**Duplicate paths:** The same title may appear twice — a flat `uploads/{title}_{id}.pdf` and a nested `uploads/Karnataka_Textbook_Society/Text_Books_25_26/CLASS-{N}/{MEDIUM}/...pdf`. When both exist, pick the href whose anchor label best matches the request (class, medium, subject, part); do not prefer nested paths by default.

```bash
curl -sL -m 60 -A "Mozilla/5.0" "https://textbooks.karnataka.gov.in/en" \
  | rg -o 'uploads/[^"<> ]+\.pdf' | sort -u
```

Note: `curl -sI` on `/` may return HTTP 500 while `GET` succeeds — use GET for discovery.

## Fetch

```bash
curl -sI -m 30 -A "Mozilla/5.0" "https://textbooks.karnataka.gov.in/uploads/{encoded_name}.pdf"
curl -fL -m 120 -A "Mozilla/5.0" -o "{local_path}" \
  "https://textbooks.karnataka.gov.in/uploads/{encoded_name}.pdf"
```

## Verify

- Expect `200` and `Content-Type: application/pdf`.
- `file` shows PDF; optional `pdftotext -f 1 -l 1` for class/subject on cover.

## Disambiguation

| User says | Match |
|-----------|--------|
| Class 5 Marathi maths part 1 | `5th%20Marati%20maths%20part%201_1760436599.pdf` (flat `/en` entry; nested `.../CLASS-5/MARATI/5th%20Marathi%20Maths%20Part%20-1%202025-26.pdf` also exists) |
| Class 6 Marathi maths part 1 | `6th%20Marathi%20Maths%20Text%20Fina%20part%20-%201_1760438070.pdf` or nested `.../CLASS-6/MARATI/6th%20Marathi%20%20Maths%20Part%20-1%202025-26.pdf` — prefer anchor **CLASS-6 MARATHI MATHS PART-1** |
| Class 10 English textbook part 1 | `10th%20Part%20-%201%20English_1758174723.pdf` — see **English-medium trap** below |
| Class 10 Social Science Kannada part 1 | `10th%20SS%20Kannada%20Part%20-%201_1758175600.pdf` (`SS` = social science) |
| Opaque numeric PDF on listing | Use exact `uploads/{id}.pdf` from HTML |

**English-medium trap:** Filenames like `10th Part - 1 English` mean **English medium** (instruction language), not the English-language subject. That listing entry is often Social Science Part 1 (English medium). English-subject books use other titles on the same listing (e.g. First Flight, Footprints without Feet). Confirm with cover `pdftotext` when the user names “English” ambiguously.

## Known source gaps

- Large files (~30 MB+ nested paths, ~7 MB flat) may need `-m 300` on download; retry with longer `-m` and `curl -fL` once.
- Carousel `media_to_upload*.pdf` on home may be notices, not textbooks — use `/en` class-named files for textbook requests.
- Site spelling varies (`Marati` vs `Marathi` in filenames); match tokens loosely, then verify cover text.

## fetch_status vocabulary

| Status | When |
|--------|------|
| `fetched` | PDF on disk, verified |
| `not_found` | No matching anchor after listing crawl |
| `timeout` | Repeated failures — document URL attempted |
