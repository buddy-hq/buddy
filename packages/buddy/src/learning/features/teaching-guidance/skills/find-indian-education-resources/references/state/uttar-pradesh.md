
# Uttar Pradesh SCERT — E-Books (static PDF)

**Publisher:** State Council of Educational Research and Training, Uttar Pradesh  
**Official domain:** `scert-up.in` / `www.scert-up.in` only  
**Fetch family:** `static-pdf` (HTML e-book tables → direct `/EBook/*.pdf`)  

## What this source covers

- School textbooks and e-books (KALRAV, Rainbow, Manjari, Gintara, etc.)
- Workbooks, D.El.Ed materials, training modules linked from the E-Book hub

## Landing pages

| Purpose | URL |
|--------|-----|
| E-Book hub | `https://www.scert-up.in/home/EBook` |
| Direct PDF base | `https://scert-up.in/EBook/` |

Tables list title, class, and **direct PDF anchors** (English filenames and percent-encoded Hindi names).

## Direct PDF URL pattern

```
https://scert-up.in/EBook/{filename}.pdf
```

Examples: `KALRAV-Class-1.pdf`, `rainbow-Class-7.pdf`, `maths-Class-7.pdf`, `1कलरव.pdf` (Unicode filename — URL-encode for curl).

## Discovery workflow

1. **Parse the request** — class, subject series (KALRAV = early primary, Rainbow = upper primary English strand, etc.), medium (Hindi/English/Sanskrit as offered).
2. **Fetch the E-Book page** and extract PDF hrefs:

```bash
curl -sL -A "Mozilla/5.0" "https://www.scert-up.in/home/EBook" \
  | rg -o 'https?://[^"<> ]+/EBook/[^"<> ]+\.pdf' | sort -u
```

3. **Filter** by filename tokens: `KALRAV`, `rainbow`, `RAINBOW`, `Class-7`, `maths`, `manjari`, class numerals in Hindi or English.
4. **Verify:**

```bash
curl -sI -A "Mozilla/5.0" "https://scert-up.in/EBook/{filename}.pdf"
```

5. **Download** with exact filename (encode non-ASCII):

```bash
python3 -c "import urllib.parse; print(urllib.parse.quote('1कलरव.pdf'))"
curl -fL -A "Mozilla/5.0" -o out.pdf "https://scert-up.in/EBook/KALRAV-Class-1.pdf"
```

6. **Post-download:** confirm class/subject on cover; `Rainbow` vs `KALRAV` are different series — do not substitute. If the cover is image-scanned, use `pdfinfo` title/author (e.g. **RAINBOW-7**, **गणित-7**, **कलरव कक्षा 1**) when cover text is not machine-readable.

## Disambiguation

| User says | Look for |
|-----------|----------|
| Class 1 English / KALRAV | `KALRAV-Class-1.pdf` |
| Class 2 KALRAV (hub row “Kalrav Class 2”) | `KALRAV-CLASS-2.pdf` — not `KALRAV-Class-2.pdf` (Bhoj), not `कलरव-bhoj-2.pdf` |
| Class 2 KALRAV Bhoj / Brij | `KALRAV-Class-2.pdf` or `कलरव-bhoj-2.pdf` — match exact hub row label |
| Class 7 Rainbow (English) | `rainbow-Class-7.pdf` or `RAINBOW-5.pdf` (check class digit) |
| Class 7 Mathematics | `maths-Class-7.pdf` (not `rainbow-Class-7.pdf` or `science-Class-7.pdf`) |
| Class 7 Science | `science-Class-7.pdf` (not Rainbow or maths) |
| Hindi-medium class 1 KALRAV | `1कलरव.pdf` — encode: `curl ... "$(python3 -c "import urllib.parse; print(urllib.parse.quote('1कलरव.pdf'))")"` |

## Metadata mapping

| Field | Guidance |
|-------|----------|
| `source_url` | Final `/EBook/...pdf` URL |
| `landing_url` | `https://www.scert-up.in/home/EBook` |
| `class` | From filename or table row |
| `subject` | Series name + user subject |
| `fetch_status` | `fetched` on 200 + valid PDF |

## Known gaps and failure modes

- **Filename variants:** `rainbow` vs `RAINBOW`, `KALRAV-CLASS-2` vs `KALRAV-Class-2`, `Gintara` vs `गिनतारा` — use exact `href` from the hub row.
- **Unicode paths:** Must URL-encode; guessing transliteration fails.
- **Same HEAD size:** Multiple Class-2 KALRAV variants (default vs Bhoj) can share `Content-Length` — disambiguate from the hub table label, not HEAD alone.
- **Mixed resource types:** D.El.Ed and training PDFs share `/EBook/` — filter by table section.
- **404 on invented names:** Do not shorten `KALRAV-Class-1` to `kalrav1.pdf`.

## Rights

Content published and managed by SCERT Uttar Pradesh. No open license captured; official government textbook use.

## Quick verification

```bash
curl -sI -A "Mozilla/5.0" "https://scert-up.in/EBook/KALRAV-Class-1.pdf"
curl -sL -A "Mozilla/5.0" "https://www.scert-up.in/home/EBook" | rg -o '/EBook/[^"<> ]+\.pdf' | head
```
