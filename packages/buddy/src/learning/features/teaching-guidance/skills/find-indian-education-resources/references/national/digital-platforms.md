# National Digital Learning Platforms

Use this reference when the user wants a digital platform object rather than a simple static PDF. Natural requests may sound like “open this QR code content”, “find DIKSHA resource for class 6”, “ePathshala version of this book”, “content id do_…”, “DIAL code”, “app textbook”, “ECAR file”, “online learning resource”, or “platform course/content”.

This file helps the agent locate:

- **DIKSHA objects**: digital textbooks, ECAR collections, learning resources, courses, QR/DIAL lookups, state hubs, and Sunbird API metadata.
- **ePathshala objects**: NCERT eTextbook/app resources, topic IDs, EPUB/PDF paths, QR/topic lookup, and app/portal boundaries.

Use this when platform identity, content metadata, app routes, QR codes, or gated platform behavior matter. Also use it when the user wants a **current official NCERT textbook** but the static `ncert.nic.in` host is unavailable or the live title rollout is clearer on DIKSHA. Use `textbooks-and-board.md` when the user only wants the ordinary NCERT static PDF/ZIP and that host is working.

## Contents

- [DIKSHA (Digital Infrastructure for Knowledge Sharing)](#diksha-digital-infrastructure-for-knowledge-sharing)
- [ePathshala](#epathshala)

---

# DIKSHA (Digital Infrastructure for Knowledge Sharing)

DIKSHA (`diksha.gov.in`) is India's national digital education platform (Sunbird/NDEAR). It hosts digital textbooks (ECAR collections), learning resources, courses, and state portals. Success on this leaf is **correct metadata classification and official URLs** — not forcing a PDF when the platform serves ECAR collections or auth-gated SPA routes. For current NCERT textbook fallback, success often means **searching the live digital textbook, downloading the parent ECAR, and then extracting the real chapter PDFs from `hierarchy.json`**.

## What this source offers

| Resource type | How it appears | Typical format |
|---------------|----------------|----------------|
| NCERT digital textbooks | API search `Digital Textbook` | Parent ECAR collection plus child chapter PDFs in `hierarchy.json` |
| Learning resources (FLN, worksheets) | API search `Learning Resource` | PDF or ECAR |
| Courses | API search `Course` | ECAR collection |
| QR-linked library objects | `/search/Library/1?key={dialCode}` | Browser — **often auth-gated** |
| State content hubs | `/{state}/` e.g. `/telangana/` | HTML SPA landing |
| FLN / NIPUN landing | `/fln.html` | Static HTML |

## URL and link patterns

| Pattern | Purpose |
|---------|---------|
| `https://diksha.gov.in/` | National homepage |
| `https://diksha.gov.in/api/content/v1/search` | Anonymous metadata search (POST JSON) |
| `https://diksha.gov.in/api/content/v1/read/{identifier}` | Read one object by `do_*` id |
| `https://diksha.gov.in/search/Library/1?key={key}` | Library/QR search — **302 to OIDC login** when anonymous |
| `https://diksha.gov.in/play/collection/{identifier}` | Collection player — **curl often 200 HTML shell**; browser may redirect to `/resources/play/...` then OIDC |
| `https://diksha.gov.in/play/content/{identifier}` | Single-resource player (learning resources, etc.) |
| `https://diksha.gov.in/resources/play/collection/{identifier}` | SPA player — **302 OIDC** when anonymous (`curl -sI`) |
| `https://diksha.gov.in/resources` | Resources hub — **302 OIDC** when anonymous |
| `https://diksha.gov.in/explore/1?key={key}&selectedTab=all` | Curated explore (e.g. NISHTHA FLN) — treat like `/resources` (often auth-gated) |
| `https://diksha.gov.in/fln.html` | Foundational learning landing (static; links out to `/play/collection/do_*`) |
| `https://diksha.gov.in/{state}/` | State portal (`/telangana` → **301** to `/telangana/`) |
| `https://diksha.gov.in/ts/get/dial/{code}` | Telangana state DIAL deep link (example from state hub HTML) |

Content identifiers look like `do_31307360979353600012111`.

## How to fetch

### 1. Parse the request

Extract: board (default NCERT), class/grade, subject, medium, resource type (textbook vs worksheet vs course), and whether the user gave a QR key or content ID.

### 1A. Current vs legacy textbook routing

- Plain requests like **“download class 6 science book”**, **“latest NCERT book”**, or **“grade 5 EVS book”** should search **`status: ["Live"]` first**.
- Use **`status: ["Retired"]` only** when the user explicitly asks for an old/previous/retired edition or names a legacy title/chapter.
- Current default cues:
  - **Class 5 EVS / The World Around Us** → `Our Wondrous World`
  - **Classes 6-8 Science** → `Curiosity`
  - **Grade 9 live titles** can still appear under labels like `(NEW) ...` or renamed titles such as `Exploration`; verify the live listing instead of assuming a retired pre-rollout title.
- Do **not** ask “old or new?” unless the official live results are genuinely ambiguous after checking class, subject, medium, and status.

### 2. Prefer anonymous API when possible

**Search:**

```bash
curl -s -X POST 'https://diksha.gov.in/api/content/v1/search' \
  -H 'Content-Type: application/json' \
  -d '{
    "request": {
      "filters": {
        "primaryCategory": ["Digital Textbook"],
        "board": ["NCERT"],
        "gradeLevel": ["Class 10"],
        "subject": ["Science"],
        "medium": ["English"],
        "status": ["Live"]
      },
      "limit": 5,
      "fields": ["identifier","name","downloadUrl","mimeType","primaryCategory","gradeLevel","medium","board","contentType"]
    }
  }'
```

Filter tips:

- Use **`Digital Textbook`** (not `Textbook`) for NCERT e-textbooks.
- For plain/current textbook requests, default to **`status: ["Live"]`**. Use `Retired` only for explicit legacy requests.
- For worksheets/FLN materials use `primaryCategory: ["Learning Resource"]` with grade/medium filters.
- For courses use `primaryCategory: ["Course"]` — optional text filter via `"query": "Constitution Day"` inside `request`:

```bash
curl -s -X POST 'https://diksha.gov.in/api/content/v1/search' \
  -H 'Content-Type: application/json' \
  -d '{
    "request": {
      "filters": {
        "primaryCategory": ["Course"],
        "board": ["NCERT"],
        "status": ["Live"]
      },
      "query": "Constitution Day",
      "limit": 5,
      "fields": ["identifier","name","downloadUrl","mimeType","primaryCategory","board","status"]
    }
  }'
```

Anonymous search can return live NCERT Constitution Day courses (English + Hindi when available) with ECAR `downloadUrl`.

**Read by ID** (when user or page gives `do_*`):

```bash
curl -s 'https://diksha.gov.in/api/content/v1/read/{identifier}?fields=identifier,name,mimeType,downloadUrl,primaryCategory,gradeLevel,medium,board,contentType,status'
```

### 2A. For digital textbooks, extract the real chapter PDFs from the parent ECAR

For many current NCERT textbooks, the search result is a **parent ECAR collection**, not the final PDF the user actually wants.

Workflow:

1. Search the live textbook (`Digital Textbook`, `status: ["Live"]`).
2. Keep the parent `identifier` and `downloadUrl`.
3. Download the parent ECAR only to inspect the hierarchy.
4. Read `hierarchy.json` and extract **child `artifactUrl` PDFs** whose `primaryCategory` is `eTextbook`.
5. Download the child chapter PDF(s) the user actually needs.
6. After the chapter PDF is on disk, prefer Buddy's `prepare_resource` -> `ingest_full_text` pipeline.

```bash
curl -sL '{downloadUrl}' -o textbook.ecar
unzip -p textbook.ecar hierarchy.json | jq '
  [.. | objects
   | select(.mimeType? == "application/pdf" and .primaryCategory? == "eTextbook")
   | {identifier, name, artifactUrl}]'
curl -sS -fL -o chapter.pdf '{artifactUrl}'
```

Notes:

- Do **not** stop at the parent ECAR and report “book PDF fetched” when the actual readable files are nested child PDFs.
- Current NCERT textbook bundles often expose official child PDFs like `hecu101.pdf`, `gecu101.pdf`, `fecu101.pdf`, or `eeev101.pdf` through these child `artifactUrl` fields.
- If the user wants the **whole book for grounding**, reading the extracted chapter PDFs sequentially is acceptable when DIKSHA does not expose a single consolidated PDF.

### 3. Browser routes (QR keys, library search, `/resources`)

If the user mentions a **QR code**, **dial code**, or **library key**:

1. Try the browser URL pattern: `https://diksha.gov.in/search/Library/1?key={key}`
2. If the response redirects to `/auth/realms/sunbird/...openid-connect/auth`, report **`auth_required`** with the OIDC landing URL — do not claim the content was fetched.
3. Fall back to API search by subject/class if the user also named the book.

When the user asks for a **content identifier from the player page** but SPA routes redirect to login, recover the `do_*` id from the player URL path (`/play/collection/{id}` or `/resources/play/collection/{id}` in the OIDC `redirect_uri`) and confirm via anonymous read API — report `auth_required` for the player shell plus `metadata_only` for the identifier.

**Player-page nuance:**

| Probe | Typical anonymous result |
|-------|---------------------------|
| `curl -sI /play/collection/{id}` | HTTP **200** — Angular/HTML shell; `do_*` usually **not** in static HTML |
| Browser open same `/play/collection/{id}` | May land on OIDC with `redirect_uri=.../resources/play/collection/{id}?auth_callback=1` |
| `curl -sI /resources/play/collection/{id}` | HTTP **302** → Sunbird OIDC |

Do not treat a 200 on `/play/collection/...` from curl alone as proof the player rendered content.

`/resources`, `/explore/...`, and generic library search without API fallback → expect **`auth_required`** for anonymous agents.

**QR / dial keys:** there is **no documented anonymous API** to resolve a library key (e.g. `12083`) to a `do_*` id. OIDC library search is the browser path; otherwise need board/class/subject filters on `/api/content/v1/search` or a user-supplied identifier.

### 4. Download when appropriate

When `downloadUrl` is present and the user wants the file:

```bash
curl -sI -L '{downloadUrl}'    # check Content-Type and size
curl -sL -f -o '{local_name}' '{downloadUrl}'
```

- **Digital Textbook parent collections:** `downloadUrl` often serves an ECAR/zip parent bundle. This is valid, but it is usually **not yet the readable textbook PDF**. Inspect `hierarchy.json`, then fetch the child chapter `artifactUrl` PDF(s).
- ECAR collections: `Content-Type: application/zip` — valid success; note format `ecar` or `zip`, not PDF.
- **Learning resources:** API `mimeType` may be `application/pdf`, but `downloadUrl` often still serves a **zip/ECAR** (`Content-Type: application/zip`). Unzip the bundle and extract embedded PDFs (e.g. `01.pdf`); verify `%PDF` on the extracted file. Report `format: pdf` only after extraction if the user asked for PDF bytes.
- Official CDN hosts on `downloadUrl`: `obj.diksha.gov.in`, `files.odev.oci.diksha.gov.in` — verify HTTP 200 before reporting `fetched`.
- After a child PDF or other supported extracted file is saved locally, prefer `prepare_resource` -> `ingest_full_text`. If there are multiple chapter PDFs and no single whole-book file, ingest/read them sequentially.

Large ECAR textbook bundles (~3 MB+) are acceptable downloads.

### 5. State portals and static landings

- State hub: `curl -sI -L 'https://diksha.gov.in/{state}/'` — capture landing URL and `listing_only` unless a specific resource is named. Telangana example: hub at `https://diksha.gov.in/telangana/` (title *Telangana - DIKSHA*); page may link state DIAL URLs like `https://diksha.gov.in/ts/get/dial/{code}` — follow only if the user named a code; deeper library browse may still hit OIDC.
- FLN: `https://diksha.gov.in/fln.html` — static NIPUN/FLN hub (`listing_only`); lists developmental-goal tiles and `/play/collection/do_*` links. For downloadable FLN objects, use API search (`Learning Resource`, grade Preschool–3) rather than scraping the landing alone.

## Verify

- API: `responseCode: OK`, `result.content[]` non-empty (or honest `source_gap` if count 0).
- Auth wall: HTTP 302 Location contains `openid-connect/auth` → `auth_required`.
- ECAR: HTTP 200 and zip magic or `Content-Type: application/zip`.
- eTextbook child PDF: `artifactUrl` from `hierarchy.json` returns HTTP 200 and `%PDF`.
- PDF: `%PDF` header.

## Access barriers

| Barrier | Signal | Status |
|---------|--------|--------|
| OIDC login on library/search | 302 to `/auth/realms/sunbird/...` | `auth_required` |
| Composite search API | `Unauthorized` | use `/api/content/v1/search` instead |
| Digital textbook parent ECAR | Search result is a collection; readable chapter PDFs are nested child assets | inspect `hierarchy.json`, then fetch child `artifactUrl` PDFs |
| Learning Resource “PDF” | API `mimeType: application/pdf` but CDN zip/ECAR | unzip → `%PDF` or report `ecar` |
| Video/audio in player | metadata only via API | `listing_only` or `metadata_only` |
| QR key only, no metadata | library 302 OIDC; no dial API | `auth_required` (valid pass) |

QR key **12083** (from ePathshala cross-links) hits the library search login wall when anonymous — **`auth_required` is a valid pass**.

## Rights / license

Government of India platform content; use official URLs. ECAR bundles are platform distribution format — do not re-host on unofficial mirrors.

## fetch_status for this source

| Situation | fetch_status |
|-----------|----------------|
| File on disk (ECAR/PDF) verified | `fetched` |
| Official metadata + downloadUrl, no bytes requested | `metadata_only` |
| SPA/QR/login redirect only | `auth_required` |
| Landing HTML only | `listing_only` |
| API count 0 after documented filters | `source_gap` |

## Disambiguation / known source gaps

- **DIKSHA digital textbook ≠ NCERT.nic.in PDF** — same title may exist on both; this leaf is DIKSHA only.
- **Digital Textbook vs Textbook** filter — former works for NCERT Class 10 Science; latter may return zero.
- **Live vs Retired** — use `status: ["Live"]` for current/default textbook requests; use `Retired` only for explicit legacy requests because retired search results can be noisy.
- **ECAR parent vs chapter PDF** — NCERT textbooks on DIKSHA are usually parent ECAR collections whose real readable chapter PDFs are exposed as child `artifactUrl` entries in `hierarchy.json`. Some **Learning Resource** worksheets also ship as ECAR zip even when metadata says PDF.
- **Current default title shifts** — plain Class 5 EVS defaults to `Our Wondrous World`; plain Classes 6-8 Science defaults to `Curiosity`; Grade 9 current titles may have multiple official live labels, so verify the live listing.
- **Player vs API** — anonymous read/search can return `downloadUrl` while `/resources/play/...` and browser player sessions require login; do not downgrade API success because the SPA player redirected.
- NISHTHA/FLN training links from other portals may point to `diksha.gov.in/fln.html`, `/explore/1?key=NISHTHAFLN...`, or auth-gated search — classify honestly.

## Report metadata

Always include: `source_url` (API or landing), `landing_url`, `identifier` when known, `format` (`ecar`, `pdf`, `html`, `metadata`), `resource_type` (`digital_textbook`, `learning_resource`, `course`), `fetch_status`, `verification_status`. For digital textbooks with child PDFs, also include the parent collection identifier plus the final child `artifactUrl` that was actually downloaded.

---

## ePathshala

# ePathshala

NCERT/CIET **digital textbook and e-resource portal** (`epathshala.nic.in`). Formats include eTextbooks (EPUB), flipbooks, audio, video, and QR-linked topics. Many QR codes resolve on ePathshala first, then **redirect to DIKSHA** — classify the final outcome; do not assume a PDF on disk.

## What this source offers

| Format | Where | Typical outcome |
|--------|-------|-----------------|
| eTextbook catalog | `process.php?id=students&type=eTextbooks` | Browser menu by class/subject/medium |
| EPUB | Download links from book/topic pages | `fetched` if direct URL works |
| Flipbook | In-browser reader | `listing_only` or `flipbook` metadata |
| Audio / video | Topic resource pages | `stream_url_only` or `listing_only` |
| QR topic | `topic.php?id={id}` | Stay on ePathshala **or** redirect to DIKSHA |

## URL and link patterns (by format)

Base: `https://epathshala.nic.in/`

| Workflow | Pattern | Example |
|----------|---------|---------|
| Student eTextbooks (English) | `process.php?id=students&type=eTextbooks&ln=en` | Class/subject picker |
| QR topic | `topic.php?id={numeric}` | `topic.php?id=12083` |
| QR search page | `topics.php` | Manual QR entry |
| App info | `pages.php?id=download-app&ln=en` | HTML only |

**Downstream (not ePathshala host):** redirects may land on `diksha.gov.in/search/Library/1?key={same_id}` or OIDC login.

## How to fetch

Use a **browser** (or browser MCP). `curl` alone often fails on JS menus; connection to `epathshala.nic.in` may time out from some networks — retry, then report honestly.

**Connectivity signals:** DNS may resolve (`dig epathshala.nic.in` → `164.100.166.50`) even when TCP/HTTPS fails. Typical failure mode: `curl` exit **28**, HTTP code **`000`**, no headers; browser lands on **`chrome-error://chromewebdata/`**. Retry root and entry URLs 2–3× (15–75 s connect timeout) before `network_unreachable`. Do **not** guess direct chapter PDF paths like `/ebook/jesc101.pdf` — use the eTextbook menu when the host responds.

### A — Browse eTextbooks (no QR)

1. Open `https://epathshala.nic.in/process.php?id=students&type=eTextbooks&ln=en`.
2. Select **class**, **medium** (e.g. English), and **subject** (match user wording to official book title, e.g. Ganita Prakash for Class 8 Maths).
3. Open the book → chapter or “download” control.
4. If a direct **EPUB** or **PDF** URL appears in the network tab or link `href`, `curl -fL` it and verify magic bytes (`application/epub+zip` or `%PDF`).
5. If only an in-browser **flipbook** loads, record `landing_url`, `format: flipbook`, `fetch_status: listing_only`.

### B — QR code / topic id

1. Open `https://epathshala.nic.in/topic.php?id={id}` (user’s QR numeric id).
2. Note **HTTP status** and **final URL** after redirects (up to 10 hops).
3. Classify:

| Final situation | `fetch_status` | `resource_type` |
|-----------------|----------------|-----------------|
| Stays on ePathshala with playable/downloadable asset | `fetched` or `listing_only` | per format |
| Redirects to `diksha.gov.in` and OIDC **login** page | `auth_required` | `platform_redirect` |
| Redirects to DIKSHA but anonymous API/download works | `fetched` or `metadata_only` | per DIKSHA object (document in report) |
| Host connection timeout / no response | `network_unreachable` | `unknown` |
| Invalid / empty topic id on ePathshala | `source_gap` | `unknown` |

4. For DIKSHA login walls: **do not** invent credentials. Report `auth_required`, `landing_url` = OIDC or search URL, `verification_status: verified` if redirect chain observed.
5. **When ePathshala is down:** checking `https://diksha.gov.in/search/Library/1?key={id}` is allowed. OIDC login for **any** numeric key (including placeholders like `99999999`) does **not** prove the QR maps to content — treat as `auth_required` only, not `source_gap` confirmation.
6. **Metadata when host down:** optional anonymous DIKSHA search by dialcode (filter name **`dialcodes`**, not `key`):

```bash
curl -s -X POST 'https://diksha.gov.in/api/content/v1/search' \
  -H 'Content-Type: application/json' \
  -d '{"request":{"filters":{"status":["Live"],"dialcodes":["{qr_id}"]},"limit":5,"fields":["identifier","name","gradeLevel","subject","medium","board","primaryCategory","dialcodes"]}}'
```

`result.count: 0` → honest `source_gap` for that QR id; `count ≥ 1` → `metadata_only` (title/class/subject); still not `fetched`.

### C — topics.php lookup

1. Open `https://epathshala.nic.in/topics.php`.
2. Enter QR id if the form allows; otherwise use `topic.php?id=` directly.
3. Same redirect classification as **B**.

### D — App download page

1. Open `https://epathshala.nic.in/pages.php?id=download-app&ln=en`.
2. Expect HTML with official store links — `listing_only`; do not treat as a direct APK/IPA fetch.

## Verify

- **EPUB/ZIP:** file magic / `file` command  
- **PDF:** `%PDF` header  
- **Redirects:** final URL host and path recorded in `landing_url`  
- **auth_required:** OIDC or “Log in to DIKSHA” in page title/body  

## Access barriers

- **JS menus** on eTextbook browser  
- **NIC network timeouts** from some environments  
- **QR → DIKSHA OIDC** (example key `12083`: login required without session)  
- Embedded **video/audio** may lack stable direct file URL  

## Rights / license

Official CIET-NCERT educational content; use official URLs only; do not mirror on unofficial hosts.

## fetch_status for this source

| Status | When |
|--------|------|
| `fetched` | EPUB/PDF/ZIP on disk with verified magic bytes |
| `listing_only` | Flipbook or catalog page; no stable public file URL |
| `stream_url_only` | Video/audio URL captured but not saved as file |
| `auth_required` | DIKSHA (or other) login blocks anonymous access |
| `redirects_to_diksha` | Use with `auth_required` or `metadata_only` as appropriate |
| `network_unreachable` | `epathshala.nic.in` does not connect after retries |
| `source_gap` | Valid-looking id but no resource on official site |

## Disambiguation / known source gaps

- User asks for **ePathshala** → do **not** silently use `ncert.nic.in/textbook/pdf/` unless they accept NCERT CDN as fallback after documenting ePathshala failure.  
- Vague requests (“**school e-books for kids**”, “NCERT digital textbooks”) → **Students → eTextbooks** at `process.php?id=students&type=eTextbooks&ln=en`; QR codes on book backs use workflow **B**, not the catalog menu.  
- **Ganita Prakash**, **Curiosity**, etc. are NCERT titles — pick the matching class/subject on the eTextbook menu. NCERT chapter filenames (e.g. **`jesc101.pdf`**) map through class/subject/chapter browse — not stable direct URLs on this host.  
- QR id **12083** maps to NCERT **Class 12 English “(NEW) Biology”** digital textbook (`do_31307360996459315213259`) via DIKSHA dialcode metadata; browser library search → **DIKSHA auth_required** without login.  
- **Invalid / placeholder QR ids** (e.g. `99999999`): cannot classify `source_gap` vs redirect until ePathshala responds; DIKSHA OIDC alone is inconclusive — use dialcode API `count: 0` when host is down.  
- When ePathshala host is down, report `network_unreachable` and any partial evidence (DNS, supplementary DIKSHA check per workflow **B** steps 5–6).

## Copyright

Hosted by CIET-NCERT; link official properties only.

---

## UDISE Plus
