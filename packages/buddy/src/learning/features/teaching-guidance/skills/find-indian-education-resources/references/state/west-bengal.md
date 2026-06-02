
# West Bengal — WBBSE textbooks

**Authority:** West Bengal Board of Secondary Education (WBBSE)  
**Official domain:** `wbbse.wb.gov.in` only (external `wbbsebooksale.in` is purchase portal — document, do not fetch per domain rule)  
**Fetch family:** `listing-crawler` — official paid catalog via JSON API; **no** free Madhyamik textbook PDF on-domain  
**Promotion:** `stub`

Use this reference when the user wants West Bengal/WBBSE textbooks or Madhyamik board books. It helps the agent prove what the official WBBSE site provides: a live catalog and sale workflow, not a verified free on-domain textbook PDF. The expected useful answer may be `listing_only` or `sale_only`, not a downloaded file.

## Official domains

| Surface | URL |
|---------|-----|
| WBBSE home | `https://wbbse.wb.gov.in/` (redirects to `/Web/Home?l=…`) |
| Book sale counter (live) | `/Web/WBBSEBookSaleCounter?l=GmOMh4ieAsfBrSunLPBveA==` from **home nav “Sale of Books”** |
| Bare sale URL (no `l=`) | `https://wbbse.wb.gov.in/Web/WBBSEBookSaleCounter` → HTTP 200 but **`/Error/Unexpected.html`** maintenance shell |
| Services | `/Web/Services?l=…` — “Sale of Books” card → paid workflow at `www.wbbsebooksale.in` |
| Download forms | `/Web/DownloadForms?l=…` — admin PDFs (admission, challan, pension); **not** textbooks |
| Book catalog API | `GET /Web/GetBookList?page=1&limit=85` — 85 WBBSE titles (classes VI–X), prices, **no** `PdfFilePath` |

## Discovery workflow

1. Load WBBSE home with browser User-Agent (`curl` without UA may get **HTTP 403**). Scan nav: **Sale of Books**, Services, Download Forms, RTI `PdfViewer` links.
2. **Sale counter:** use encrypted `?l=` from home nav — bare `/Web/WBBSEBookSaleCounter` is an error page, not a catalog.
3. Call `GetBookList` with **`page` and `limit`** — bare API returns `{"records":[],"total":85}` despite nonzero total.
4. `PdfViewer?l=…` routes serve notifications, calendar, routines — **not** Madhyamik textbooks.
5. Class IX (and other classes): catalog rows list subject, medium, book code, and **price** — no on-domain PDF. Purchase checkbox → redirect to `wbbsebooksale.in` (SBI E-Pay); report `listing_only` + `sale_only`, not `fetched`.
6. Do not download unofficial mirrors or probe off-domain sale portal.

```bash
curl -sL -A "Mozilla/5.0" "https://wbbse.wb.gov.in/" | rg -i 'WBBSEBookSaleCounter|GetBookList'
curl -sL -A "Mozilla/5.0" \
  "https://wbbse.wb.gov.in/Web/GetBookList?page=1&limit=85" | jq '.records[0]'
```

## Fetch

- No verified free Madhyamik textbook PDF on `wbbse.wb.gov.in`.
- Official binary path for board PDFs: **Download Forms** list only (admin forms) — use `GetDownloadFormsList?page=1&limit=20`, not textbooks.
- Guessed endpoints (`DownloadBook`, `BookPdf`, `ReadWriteData/Books/{code}.pdf`) return HTML errors, not `%PDF`.
- When catalog + paid workflow confirmed: `fetch_status: listing_only`, `verification_status: sale_only`.

## Verify

| Status | When |
|--------|------|
| `inconclusive` | Home unreachable; cannot confirm catalog vs free PDF |
| `listing_only` | `GetBookList` or sale counter lists titles/prices; no textbook binary |
| `sale_only` | Live sale counter shows prices + purchase redirect to `wbbsebooksale.in` |
| `fetched` | Official textbook PDF with `%PDF` verified on `wbbse.wb.gov.in` |

## Disambiguation

| User says | Action |
|-----------|--------|
| WBBSE textbooks | Start home → Sale of Books + `GetBookList` |
| Class 9 Madhyamik book | **18** Class IX titles (subjects/mediums); none have on-domain PDF — ask subject/medium or report honest gap |
| Book sale counter | Must use home-nav `?l=` link; bare URL is error shell |
| Free PDF / NCERT-style | Not on WBBSE domain — paid sale only |

## Known gaps

- No NCERT-style open textbook PDF host; distribution is **paid sale** (and physical channels).
- `wbbsebooksale.in` is outside `wbbse.wb.gov.in` — cite as purchase path only.

## Negative tests

- Do not fabricate `wbbse.wb.gov.in/.../Class9_Math.pdf`.
- Do not treat bare sale-counter error page as a successful catalog.
- Do not call `GetBookList` without pagination and infer “no books”.
- Do not label `PdfViewer` notification PDFs as Madhyamik textbooks.
