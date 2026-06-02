# Jammu & Kashmir — JKBOSE textbooks

**Publisher:** Jammu and Kashmir Board of School Education (JKBOSE)  
**Official domain:** `jkbose.nic.in` / `www.jkbose.nic.in` only  
**Fetch family:** `listing-crawler` → direct PDF links on class pages  
**Status:** Mixed — class pages and PDFs exist, but the **NIC host often times out** from some networks.

## What this source covers

- JKBOSE **textbook index** and per-class download pages
- Subject-wise textbook **PDFs** (can be large; slow downloads)

## Official domains

| Purpose | URL |
|--------|-----|
| Textbook index | `https://www.jkbose.nic.in/TextBooks.html` |
| Class 10 textbooks page | `https://www.jkbose.nic.in/textbookclass10.html` |

(Alternate host `https://jkbose.nic.in/` — same NIC infrastructure; expect identical timeout behavior.)

## Discovery workflow

1. Open **TextBooks.html** → follow class link (e.g. Class 10).
2. On class page, extract `href="...pdf"` (relative or absolute on `jkbose.nic.in`).
3. **Download with retry** for large files:

```bash
curl -fL -A "Mozilla/5.0" --connect-timeout 20 --max-time 300 --retry 2 --retry-delay 5 \
  -o "{local_path}" "{pdf_url}"
```

4. **Verify:** HEAD or first bytes `%PDF` when download completes.

## Timeout / source_gap handling

If `curl` / TCP to `jkbose.nic.in` **times out** before HTML or PDF bytes:

| Field | Value |
|-------|-------|
| `fetch_status` | `source_gap` |
| `verification_status` | `unverified` when the current network cannot reach the NIC host |
| `landing_url` | Intended official URL attempted |
| Report | Document timeout, retry flags used, no fabricated PDF |

**Do not** substitute third-party mirrors or cached copies.

### Connectivity failure signature

Blind agents consistently saw **TCP connect timeout on port 443**, not a slow PDF download:

| Signal | Typical value |
|--------|----------------|
| `curl` exit code | **28** (`Failed to connect … port 443`) |
| HTTP code | **000** (no TLS handshake) |
| Bytes | **0** |
| DNS | `www.jkbose.nic.in` → `164.100.248.55` (resolves; TCP does not complete) |
| Both hosts | `jkbose.nic.in` and `www.jkbose.nic.in` behave the same |
| Browser | May show `chrome-error://chromewebdata/` — treat as **`source_gap`**, not a different workflow |

With `--connect-timeout 20 --retry 2 --retry-delay 5`, expect **3 connect attempts** (~20s each + delays, ~70s wall time) before giving up. `--max-time 300` does **not** help if TCP never connects.

**Do not download a subject PDF** until the official class listing HTML loads and you extract a real `href="...pdf"`. Retries on a guessed PDF URL are still `source_gap` when the host is down.

**Guessed direct PDF URLs** (e.g. user or a user supplies `https://www.jkbose.nic.in/uploads/class10_science_2025.pdf` without using the listing): if the host is unreachable, report **`source_gap`** — you cannot distinguish `not_found` (404) from a valid file until NIC responds. After the host responds, use HTTP status (`not_found` on 404).

## Disambiguation

| User says | Start page | Action |
|-----------|------------|--------|
| JKBOSE class 10 textbooks / class 10 science PDF | `textbookclass10.html` | List PDF links; fetch Science (or any) subject book |
| JKBOSE textbook portal | `TextBooks.html` | Navigate to class, then PDF |
| Direct PDF URL only (no listing) | User-supplied `jkbose.nic.in` URL | `curl` with retry flags; same timeout rules |
| Guessed path under `/uploads/…` | — | Host down → `source_gap`; host up → verify 404 vs PDF |
| Invented subject PDF URL (after crawl) | Class page from index | `not_found` if no matching `href` on official pages |

## Metadata mapping

| Field | Guidance |
|-------|----------|
| `source_url` | Direct JKBOSE PDF when fetched |
| `landing_url` | Class listing page |
| `fetch_status` | `fetched` / `source_gap` / `not_found` |
| `resource_type` | `textbook` |

## Known gaps

- **Infrastructure:** JKBOSE NIC endpoints frequently **timeout** from some cloud or automated networks.
- Specific subject PDF paths (e.g. `/uploads/class10_science_2025.pdf`) are **unverified** until the host responds — discover links from `textbookclass10.html`, do not treat guessed paths as canonical URLs.

## Quick verification (when host responds)

```bash
curl -sI -A "Mozilla/5.0" --connect-timeout 20 --max-time 60 \
  "https://www.jkbose.nic.in/TextBooks.html"
```
