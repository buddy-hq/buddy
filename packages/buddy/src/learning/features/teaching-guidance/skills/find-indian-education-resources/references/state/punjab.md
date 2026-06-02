# Punjab Educare — e-books and Drive-wrapped textbooks

**Publisher:** Department of School Education, Punjab (Punjab Educare portal)  
**Official domain:** `www.punjabeducare.org` only  
**Fetch family:** `listing-crawler` → **Google Drive** (`wrapper_only` for textbook binaries)  
**Status:** Official listing with Drive wrapper behavior.

## What this source covers

- E-book index and **class-band textbook pages** (Google Sites + embedded Drive links)
- Teacher activity handbooks (often Drive `open?id=` links)
- Subject-wise textbook links for classes 1–12

## Official domains

| Purpose | URL |
|--------|-----|
| E-books hub | `https://www.punjabeducare.org/e-books` |
| Classes 1–5 textbooks | `https://www.punjabeducare.org/e-books/text-books-1st-5th` |
| Classes 6–10 textbooks | `https://www.punjabeducare.org/e-books/text-books-6th-10th` |
| Classes 11–12 textbooks | `https://www.punjabeducare.org/e-books/text-books-11th-12th` |
| Site home (also lists Drive folders) | `https://www.punjabeducare.org/` |

**Not in scope:** `educare.punjab.gov.in` (does not resolve in verification passes) — use `punjabeducare.org` only.

## Drive link patterns

From official pages:

```
https://drive.google.com/open?id={FILE_ID}&usp=drive_fs
https://drive.google.com/file/d/{FILE_ID}/view?usp=drive_fs
```

Example (Class 8 Science English):  
`https://drive.google.com/open?id=19qKyxa5B1sdU5nljvl1C-mYAlE9gCAUP`

### Drive fetch rules

1. Discover `FILE_ID` only from official Punjab Educare page HTML (class/subject listing).
2. Try `https://drive.google.com/uc?export=download&id={FILE_ID}`.
3. If response is HTML viewer / sign-in (~70KB `text/html`), report `fetch_status: wrapper_only` with official Drive URL as `source_url`.
4. Some Educare-linked Drive IDs return a real PDF via `uc?export=download`. If bytes start with `%PDF`, use `fetch_status: fetched`.
5. Follow redirects: `open?id=` often **307** → `/file/d/.../view`; `uc?export=download` often **303** → `drive.usercontent.google.com` — use `curl -sL`.
6. Large textbooks (~60MB+): allow a longer timeout (e.g. `curl -m 60`); verify with `file` and `%PDF` magic bytes, not Content-Type alone.
7. Portal footer warns textbooks are for teachers/students/parents — misuse (printing/selling) is prohibited.

## Discovery workflow

1. **Parse** class band and subject from user prompt.
2. **Open** the matching `/e-books/text-books-*` page.
3. **Extract Drive IDs** from page source:

```bash
curl -sL -A "Mozilla/5.0" "https://www.punjabeducare.org/e-books/text-books-6th-10th" \
  | rg -o 'drive\.google\.com/open\?id=[a-zA-Z0-9_-]+'
```

4. Parse **class section headers** in embedded Google Sites markup (e.g. 6th / 7th / 8th blocks), then match **link text** to subject and medium — labels are authoritative (e.g. `Science (English)`), not guessed IDs.
5. Sanity-check link count on 6–10 page (~80+ `open?id=` URLs in HTML); zero matches → re-fetch listing, do not invent IDs.
6. Verify wrapper or binary per Drive rules above.

## Disambiguation

| User says | Page | Notes |
|-----------|------|-------|
| Class 8 science textbook English | `text-books-6th-10th` | Row label **Science (English)** → `19qKyxa5B1sdU5nljvl1C-mYAlE9gCAUP` |
| Upper primary / classes 6–8 science English | `text-books-6th-10th` | Same band page; classes 6–7 use row **Science** (English); class 8 use **Science (English)** row above |
| Class 6 science | `text-books-6th-10th` | Row **Science** → `1G_m76lcc4E-3U-mVBTBbPW0lCnH0y597` |
| Class 7 science | `text-books-6th-10th` | Row **Science** → `1cF1w6auam_9E-yBT8ndZVyzNEJmfTCbH` |
| Punjabi-medium science | `text-books-6th-10th` | Look for **Vigyan (Punjabi)** (or similar), not plain **Science** |
| Primary class 1–5 books | `text-books-1st-5th` | Multiple `open?id=` links |
| Senior secondary 11–12 | `text-books-11th-12th` | Drive links per subject |

**Class 8 English science:** two similar rows exist — prefer **Science (English)** (`19qKyxa5B1sdU5nljvl1C-mYAlE9gCAUP`) over **Science (English Medium)** (`1jnQRv56O-eDGxGVQk6cQGkFgX7N32Gvg`) when the prompt names English medium explicitly.

## Metadata mapping

| Field | Guidance |
|-------|----------|
| `source_url` | Official Drive URL from Educare page |
| `landing_url` | Educare e-books listing used |
| `fetch_status` | `listing_verified` (hub/band navigation only) / `wrapper_only` (typical) / `fetched` (if `uc?export=download` returns PDF bytes) |
| `resource_type` | `textbook`, `teacher_handbook` |

## Known gaps

- Page HTML is Google Sites — links are in embedded markup; use full page curl, not guessed IDs.
- 6–10 listing is dense (~80+ Drive links); disambiguate by class section + link text (duplicate English science rows on class 8).
- **Negative test:** Random `open?id=` not present on official page → `not_found`.

## Quick verification

```bash
curl -sI -A "Mozilla/5.0" "https://www.punjabeducare.org/e-books"
```
