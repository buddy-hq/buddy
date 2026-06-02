
# Madhya Pradesh — Vimarsh portal

**Authority:** Madhya Pradesh School Education (Vimarsh)  
**Official domain:** `vimarsh.mp.gov.in` only  
**Fetch family:** `listing-crawler` + partial static PDF (stub for textbooks)  
**Promotion:** `stub` — subject textbooks not verified; rationalization PDFs are not textbooks

Use this reference when the user wants Madhya Pradesh/MP Vimarsh school materials, especially state portal textbook or study-material requests. It helps the agent avoid a common false success: Vimarsh may expose rationalization lists, Urdu ZIPs, vocational listings, or ASP.NET listing pages, but those are not necessarily the requested subject textbook.

## Official domains

| Surface | URL |
|---------|-----|
| Vimarsh home | `https://vimarsh.mp.gov.in/` |
| NCERT rationalized content (class bands) | `https://vimarsh.mp.gov.in/school/NCRT_Books.aspx` |
| Vocational textbooks page | `https://vimarsh.mp.gov.in/school/vocational_all_textbooks.aspx` |
| Urdu medium listing | `https://vimarsh.mp.gov.in/school/Urdu_medium_books.aspx` |

## Discovery workflow

1. Load Vimarsh home — reach textbook surfaces via **home-page banners** (NCERT rationalized, Urdu-medium, vocational); portal is results/CCLE/PM SHRI heavy. “Study Materials” nav is **commented out** in live HTML (source still names `school/remedial_meterials.aspx`, `rmsa2019/DigiLEP/index.aspx`, `blueprint.aspx`, `question_bank.aspx` — not exposed in active menu).
2. For NCERT-aligned listings, open `school/NCRT_Books.aspx` (may **302** to a session-prefixed ASP.NET path); read link targets (`../files/class6.pdf` … `class12.pdf`).
3. **Before claiming `fetched` for a textbook:** open PDF and confirm it is the requested subject textbook, not the **Rationalisation of Content in the Textbooks** booklet (tabular dropped-topics list). Use `pdftotext -f 1 -l 2` on title pages when unsure.
4. **Urdu medium:** `Urdu_medium_books.aspx` lists subject **ZIP** archives (classes 9–12); HEAD large files before full download (~100–200 MB typical).
5. **Vocational:** `vocational_all_textbooks.aspx` is an ASP.NET **form postback** UI (classes 9–12 in static HTML); static crawl yields `listing_only`, not per-book PDF URLs.

## Fetch

| Resource | Mechanism | Typical `fetch_status` |
|----------|-----------|------------------------|
| Rationalization booklet `files/classN.pdf` | `curl -fL` from link on `NCRT_Books.aspx` | `listing_only` or `catalog_list` (not `textbook`) |
| Urdu-medium subject ZIP (e.g. Class 9 Science) | Link from `Urdu_medium_books.aspx`; `curl -sI` first | `fetched` when class/subject/medium match filename |
| Vocational textbook PDF | Form submit on `vocational_all_textbooks.aspx` | `listing_only` (no static PDF anchors) |
| Class X subject textbook (Hindi/English NCERT page) | No stable direct textbook path verified | `inconclusive` |
| Guessed root URL e.g. `/class6.pdf` | — | `not_found` (404) |

```bash
curl -sI -A "Mozilla/5.0" "https://vimarsh.mp.gov.in/school/NCRT_Books.aspx"
curl -fL -A "Mozilla/5.0" -o rationalized-class6.pdf \
  "https://vimarsh.mp.gov.in/files/class6.pdf"
# Inspect title page — rationalization list ≠ textbook
```

## Verify

- PDF magic `%PDF` required for any download.
- If content is rationalization catalog: `resource_type: catalog_list`; `verification_status: verified_mismatch` when user asked for a subject textbook; `fetch_status: inconclusive` — do **not** mark class science/math textbook as `fetched`.
- Urdu ZIPs on the official Urdu page are subject textbooks when filename/row match; still confirm class and medium before `fetched`.

## Disambiguation

| User says | Action |
|-----------|--------|
| MP Vimarsh textbooks | Home → `NCRT_Books.aspx` or vocational/Urdu pages |
| Class 6 science textbook | Honest `inconclusive` — `NCRT_Books.aspx` has only rationalization PDFs; Urdu विज्ञान is classes 9–10 only |
| `class6.pdf` on Vimarsh | Prefer `files/class6.pdf` from `NCRT_Books.aspx`; verify document type |

## Known gaps

- Results/exam-heavy portal; subject textbook binaries not verified.
- Root `/class6.pdf` is a **404 trap** — use only `files/class6.pdf` from official listing.

## Negative tests

- Do not report rationalization booklet as “Class 6 Science textbook”.
- Do not use `vimarsh.mp.gov.in/class6.pdf` (404).
