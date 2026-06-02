
# Haryana — SCERT (S3 CDN + Saksham Drive)

**Publisher:** State Council of Educational Research & Training, Haryana  
**Official domain:** `scertharyana.gov.in`  
**Fetch family:** mixed — **direct CDN PDF** + **listing → Google Drive**  
**Supported formats:** PDF (CDN); Drive file links for Saksham textbooks

Use this reference when the user wants Haryana SCERT/Saksham textbooks or Haryana SCERT public PDFs. It helps the agent separate two official patterns: direct S3/CDN PDFs linked from SCERT pages, and Saksham textbook rows that lead to official Google Drive files where some items download and others remain `wrapper_only`.

## Official domains

| Section | URL |
|---------|-----|
| Home | `https://scertharyana.gov.in/` |
| Saksham textbooks 2025 | `https://scertharyana.gov.in/saksham-resource/` |
| Saksham shortcut | `https://scertharyana.gov.in/saksham` → 301 to `saksham-resource/` |

## Discovery — S3 CDN PDFs

1. Crawl home HTML for `cdnbbsr.s3waas.gov.in/.../*.pdf` links.
2. **Disambiguate** when several PDFs appear on the home page: match the user’s label to the list item’s visible text or `aria-label` (monthly newsletters sit next to NAS/scheme PDFs).
3. Verify with `curl -sI`; download with `curl -fL`.

| Resource | Home cue | CDN URL |
|----------|----------|---------|
| NAS comparison 2021 vs 2017 | **NAS Comparison report: 2021 vs 2017** | `https://cdnbbsr.s3waas.gov.in/s323d2e1578544b172cca332ff74bddf5f/uploads/2022/09/2022091944.pdf` |
| SCERT bulletin March–April 2022 | **March-April 2022** (`aria-label` often `March-April-2022 - PDF…`) | `https://cdnbbsr.s3waas.gov.in/s323d2e1578544b172cca332ff74bddf5f/uploads/2022/08/2022081794.pdf` |

## Discovery — Saksham Drive textbooks

1. Open `https://scertharyana.gov.in/saksham-resource/` (HTML title: **Textbooks 2025 latest**).
2. Locate class tables by caption (e.g. **Textbooks Class 1**, **Textbooks Class-2**).
3. Follow official `drive.google.com/file/d/{id}/view` link for the subject row.
4. Do **not** invent file IDs — parse from HTML only. Optional: save listing HTML for re-parse.

```bash
curl -sL -m 60 -A "Mozilla/5.0" "https://scertharyana.gov.in/saksham-resource/" -o saksham-resource.html
```

## Fetch

**CDN:**

```bash
curl -fL -m 120 -A "Mozilla/5.0" -o "{local_path}" "{s3_pdf_url}"
```

**Drive:**

1. Parse `{FILE_ID}` from the table’s official `view` URL.
2. Try `https://drive.google.com/uc?export=download&id={FILE_ID}` with `curl -fL` (follow redirects to `drive.usercontent.google.com`).
3. If body starts with `%PDF` → `fetch_status: fetched`.
4. If `curl -sI -L` on the view URL hits `accounts.google.com/ServiceLogin`, or `uc?export=download` returns HTML (`<!doctype`), → `wrapper_only` with the official Drive `view` URL as `source_url`.
5. **Per-file variance:** some Saksham Drive IDs download without login (e.g. Class 2 maths Part 1 EN); others (e.g. Class 1 Hindi Part 1) stay `wrapper_only` — do not assume all class rows behave the same.

## Verify

- CDN PDF: 200, `application/pdf`, `%PDF`.
- Drive: confirm listing row from saved HTML; for downloads, `%PDF` magic on disk. `wrapper_only` is a pass when export/sign-in blocks the file.

## Disambiguation

| User says | Source |
|-----------|--------|
| NAS / scheme PDF on SCERT home | S3 CDN link from home; match **NAS Comparison report: 2021 vs 2017** label |
| March–April 2022 newsletter | Home newsletter list item → `2022081794.pdf` (not adjacent months) |
| Saksham 2025 textbooks (where listed) | `saksham-resource/` class tables → Drive |
| Class 1 textbook Saksham | **Textbooks Class 1** table → first subject row’s Drive link |
| Class 2 textbook | **Textbooks Class-2** section on same page |

## Known source gaps

- Drive may require Google login or return HTML wrappers — report `wrapper_only`, not unofficial mirrors.
- Saksham page title: "Textbooks 2025 latest".
- Drive download success is **file-dependent** within the same Saksham page.

## fetch_status vocabulary

| Status | When |
|--------|------|
| `fetched` | PDF on disk (CDN or Drive export) |
| `wrapper_only` | Official Drive link; no verified PDF bytes |
| `listing_only` | Table located, file not retrieved |
