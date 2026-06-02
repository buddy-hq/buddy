
# Gujarat — GSSTB textbooks (listing API → ViewFile wrapper)

**Publisher:** Gujarat State School Textbook Board (GSSTB)  
**Official domain:** `gsstb.gujarat.gov.in` (GCERT `gcert.gujarat.gov.in` for ancillary pages)  
**Fetch family:** `listing-crawler` → **ViewFile wrapper** (CouchDB-backed PDFs)  
**Supported formats:** PDF

Use this reference when the user wants Gujarat/GSSTB textbooks by standard, medium, or subject. It helps the agent walk the official folder hierarchy and convert listing records into the official `ViewFile` wrapper flow; a raw `filePath` token is not itself a downloadable PDF.

## Official domains

| Purpose | URL |
|---------|-----|
| Textbook browser | `https://gsstb.gujarat.gov.in/gsstb/Textbook` |
| Folder API | `https://gsstb.gujarat.gov.in/GetFolderContentGsstb/{folderId}` |

## Discovery

1. Start at `/gsstb/Textbook` or API root `GetFolderContentGsstb/0`.
2. Walk folders: **New Textbooks** (4) → **Standard One to eight** (25) → medium folder → **Std *** child.
3. Each file row has `filePath` like `CouchDB##...||....pdf` — **do not curl this token directly**.
4. Official download: `https://gsstb.gujarat.gov.in/ViewFile?fileName={hash}` where `hash` = `GreateHashString(filePath)` from site JS. Without a resolved hash, report `wrapper_only` (listing alone is not a PDF URL).

**Std 1 Gujarati (API walk):**

| Step | Folder id | Name |
|------|-----------|------|
| Root | 0 | (via API) |
| 1 | 4 | New Textbooks |
| 2 | 25 | Standard One to eight |
| 3 | 26 | Gujarati Medium |
| 4 | 27 | Std One |

```bash
curl -sL -A "Mozilla/5.0" "https://gsstb.gujarat.gov.in/GetFolderContentGsstb/27"
```

Example titles in folder 27: **Kalkaliyo**, **Ananddayi**, **Kalrav Paryavaran**.

## Fetch

**ViewFile hash (when not using the browser UI):**

- Read `https://gsstb.gujarat.gov.in/Admin/js/Common.js` (`GreateHashString` / `FrontValue`; CryptoJS AES-128-CBC).
- Encrypt the API `filePath` string; key and IV both `4090909090909020`; Base64-encode ciphertext; then replace `/` → `HASH__HASH` and `+` → `HASH_HASH` in the `fileName` query value.
- Known examples such as Kalkaliyo, Ananddayi, and Kalrav Paryavaran use this hash + folder-27 listing — no guessed file IDs.

**Do not use these ViewFile guesses** (they return HTTP 500):

- `ViewFile?fileName={bare .pdf filename from token tail}`
- `ViewFile?filePath={encoded CouchDB token}`

```bash
curl -sL -A "Mozilla/5.0" -o book.pdf \
  "https://gsstb.gujarat.gov.in/ViewFile?fileName={hash}"
```

- Prefer the textbook UI when the hash cannot be resolved from static HTML.
- If only the wrapper opens or download fails after honest hash attempt: `fetch_status: wrapper_only`, `landing_url` = Textbook page or attempted ViewFile URL; keep `api_listing_url` and CouchDB token for traceability.

## Verify

- Downloaded PDF: `%PDF` magic.
- Wrapper: record official `ViewFile` or folder path; note CouchDB token in report for traceability.

## Disambiguation

| User says | Folder path |
|-----------|-------------|
| Std 1 Gujarati Kalkaliyo / Ananddayi / Kalrav Paryavaran | 4 → 25 → 26 → **27**, match title in listing |
| English medium primary ~Std 5 | 4 → 25 → **35** (English Medium) → enumerate child (e.g. **40** = Std Five) |
| Std 5 English textbook | folder **40**, example title **English SecondLanguage** |

Under English medium (**35**), call `GetFolderContentGsstb/35` and descend to the **Std *** folder id — disambiguation does not list every std folder.

## Known source gaps / wrapper_only / Drive

- Some Gujarat flows use Google Drive, but the **GSSTB textbook tree** uses **ViewFile**, not `drive.google.com`.
- GCERT static HTML had no Drive anchors in discovery — do not use unofficial Drive mirrors.
- Use honest `wrapper_only` when hash/ViewFile cannot be resolved without the site UI.

## fetch_status vocabulary

| Status | When |
|--------|------|
| `fetched` | PDF saved from official ViewFile/download |
| `wrapper_only` | Official link opens viewer; no local PDF |
| `listing_only` | Folder tree located, file not resolved |
