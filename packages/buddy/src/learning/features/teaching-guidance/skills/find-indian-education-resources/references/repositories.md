# Repository and Aggregator Resources

Use this reference when the user is asking for an item inside a repository or aggregator, not a known textbook-board/publisher page. Natural requests may sound like “find an OER video”, “NROER resource on fractions”, “NDLI item”, “official repository record”, “library catalog result”, “media object”, or “what source/license does this repository item have”.

This file helps the agent locate:

- **NROER resources**: OER item pages, `readDoc` files, media/player URLs, interactives, and license/attribution metadata.
- **NDLI records**: catalog/search records, publisher/source resolution, metadata boundaries, and access limitations.

Use this when the main task is repository discovery, metadata classification, license/source attribution, or resolving an aggregator record. Do not force a direct PDF when the official source is a catalog entry, player, wrapper, or metadata-only object.

## Contents

- [NROER](#nroer)
- [NDLI](#ndli)

---

## NROER

# NROER — National Repository of Open Educational Resources

NROER (`nroer.gov.in`) is India’s national OER aggregator for school resources: PDFs, video, audio, images, and interactives (typically **CC BY-SA**). Success means locating the **official item or `readDoc` URL**, classifying format, and fetching when the host responds — not guessing Mongo ids.

## What this source offers

| Format | Pattern | Fetch approach |
|--------|---------|----------------|
| PDF | `.../readDoc/{mongoId}/{filename}.pdf` | `curl -fL` with retry on 502 |
| Video / audio | `readDoc`, **`/media/{hash}.mp4`**, or item/course player embed | Browser/network inspect → `metadata_only` or `stream_url_only` |
| Interactive / HTML5 | Item page | `metadata_only` unless direct file URL found |
| Browse / search | `/gsearch?q=` | `listing_only` until a concrete item is chosen |

## URL and link patterns

| Pattern | Purpose |
|---------|---------|
| `https://nroer.gov.in/` | Homepage |
| `https://nroer.gov.in/gsearch?q={query}` | Search results |
| `https://nroer.gov.in/.../readDoc/{mongoObjectId}/{filename}` | Direct object delivery (common for PDF/epub) |
| `https://nroer.gov.in/home/file/{mongoObjectId}` | File/detail page; video items often expose **`/media/...`** here |
| `https://nroer.gov.in/media/{path}.mp4` (or `.webm`) | Direct video/audio bytes when listed on the file page |
| `https://nroer.gov.in/{unitId}/course/about/` | CLIx-style unit landing |
| `https://nroer.gov.in/{unitId}/course/activity_player/{groupId}/{activityId}` | Lesson activity player (video lessons) |
| Item page URL | Linked from search; use when `readDoc` returns **502** |

## How to fetch

### 1. Parse the request

Extract subject, class level, medium, and format (PDF vs video vs interactive). Default to English search terms if unspecified.

### 2. Search on-portal

Open `https://nroer.gov.in/gsearch?q={encoded_query}` (or site navigation). Pick a result whose title matches the request.

### 3. Resolve the object URL

- From the item page, find the **official** `readDoc/...` link or download control.
- For PDFs: `curl -sI` then `curl -fL -o {local_path} "{readDoc_url}"`.
- On **502** from `readDoc`: wait/retry once, reload item page, re-extract link (do not swap to unofficial mirrors).

### 4. Non-PDF

From the item or `home/file/{id}` page, check for **`/media/...`** URLs (video/audio) as well as `readDoc`. Record `resource_type`, `landing_url`, and `source_url`. If only a course activity player or embedded player is available, set `fetch_status: metadata_only` and describe how a human would play the asset.

### 5. License

Copy license/attribution text from the item page into the report when shown (CC BY-SA expected).

## Verify

| Format | Check |
|--------|-------|
| PDF | `%PDF` magic, size > 0 |
| Video/audio | Official URL or player documented |

## Connectivity failure signatures

`nroer.gov.in` may be **unreachable even when DNS resolves**. Treat the signals below as **`source_gap`** — do not invent `readDoc` Mongo ids, substitute `ncert.nic.in`, or use Wayback/third-party hosts for official URLs or license text.

| Signal | Meaning |
|--------|---------|
| `dig` → `158.144.43.3` (or similar) but `curl` exit **28**, HTTP **000**, `nc` connect timeout | TCP blocked or host not accepting connections from the current network |
| WebFetch **403 Forbidden** on `gsearch` or homepage | Host may block non-India or automated clients |
| Browser **`chrome-error://chromewebdata/`** | No portal HTML loaded |
| `readDoc` **502** after one retry + item-page re-extract | Persistent gateway failure → `source_gap` |

When the host responds, proceed with on-portal `gsearch` → item page → `readDoc` or `/media/` as usual.

## Access barriers

| Situation | `fetch_status` |
|-----------|----------------|
| PDF saved | `fetched` |
| Player/metadata only | `metadata_only` |
| Search only | `listing_only` |
| Timeout / persistent 502 | `source_gap` |

## Disambiguation

- **NCERT textbooks** on `ncert.nic.in` are a different leaf — use NROER only when the user asks for NROER/OER repository content.
- Do not use third-party scrapers, Wayback, or non-`nroer.gov.in` hosts unless the reference workflow lands there from an official redirect.
- Videos are not always `readDoc` — prefer the official file page and `/media/...` links when present.

---

## NDLI

# NDLI — National Digital Library of India

NDLI (`www.ndl.gov.in`) is a **federated metadata portal** for Indian and global learning resources. This leaf documents **search, browse, and source resolution** — not bulk harvesting of NDLI-hosted mirrors.

**Host:** Always use `https://www.ndl.gov.in/` — bare `ndl.gov.in` (no `www`) is unreliable.

## Policy: no harvesting

- **Do not** paginate `doc-search.php` to build corpora or mirror `/serveFile/...` assets.
- **Do not** use NDLI as a substitute CDN when the content provider publishes the canonical file elsewhere.
- **Do** return rich metadata from NDLI item pages and, when bytes are required, fetch from the **content provider’s official domain** named on the item (e.g. NCERT, OpenStax, IIT-PAL publisher site).

## What this source offers

| Surface | URL | Use |
|---------|-----|-----|
| National search UI | `https://www.ndl.gov.in/` → `/_search?key=` | User-style search (JS); prefer API below for repeatable lookup |
| School Education hub | `https://www.ndl.gov.in/ndl_se` | Domain `se` |
| Higher Education hub | `https://www.ndl.gov.in/ndl_he` | Domain `he` |
| Research hub | `https://www.ndl.gov.in/ndl_re` | Domain `re` |
| Search API | `POST https://www.ndl.gov.in/ajax/doc-search.php` | JSON metadata hits |
| Item page | `/{se\|he\|re}_document/{provider}/{repo}/{id}` | Title, provider, access rights, breadcrumbs |
| NDLI Club | `https://club.ndl.iitkgp.ac.in/` | **Discovery-only** — Vaadin SPA; see Club below |
| UI search (school) | `/se_search?key=` or `/sesearch?key=&lang=` | JS results page after hub search box |
| Thumbnails / preview bytes | `/serveFile/{provider}/{fileId}` | **Out of scope** for byte fetch |

## Wrong paths

| URL / parameter | Result |
|-----------------|--------|
| `https://ndl.gov.in/` (no `www`) | Connect failure |
| `/search?key=...` | **404** (legacy) |
| `GET /ndl_se/search?key=...` | **Stub only** (~29-byte version comment) — not HTML results |
| `domain: "_s"` (from bare `/_search` pathname) | doc-search **HTTP 500** |
| Standalone `se_document/...` for a language leaf inside a collection | Often **404** — use parent collection + stitching pane |

## Search API (metadata)

```bash
curl -sS -c cookies.txt -b cookies.txt 'https://www.ndl.gov.in/' -o /dev/null

curl -sS -b cookies.txt -X POST 'https://www.ndl.gov.in/ajax/doc-search.php' \
  -H 'Content-Type: application/json' \
  -H 'Referer: https://www.ndl.gov.in/ndl_se/search?key=YOUR_QUERY' \
  -d '{
    "domain": "se",
    "key": "ncert science class 10",
    "pageToken": null,
    "filters": {},
    "last": null,
    "template": "list"
  }'
```

Parse `docs[]` HTML for `href=".../{domain}_document/..."` and `Content Provider:` spans. Set `domain` to `se`, `he`, or `re` matching the user segment (school vs college vs research).

Use `Referer` matching the hub (`ndl_se/search?key=...` is fine for curl even though that GET path is a stub).

## Item page workflow

1. Open the `*_document/...` URL from search results (use `www.ndl.gov.in`). Document URLs may include `?e=0|{searchKey}|||`.
2. Parse `#tab-metadata` for title, content provider, educational level, resource type, access icon (Open/Restricted), breadcrumb trail.
3. **Collections** (`Resource Type: Collection`): enumerate language editions from the **stitching pane** on the collection page — do not assume each edition’s `se_document/...` URL works standalone.
4. Note `iframe#content-holder` → `/module-viewer/viewer.php?id=...&domain=...` for embedded preview (metadata only; viewer may reference `/serveFile/` — do not download).
5. If the user needs a **downloadable file**, identify the provider and switch to that organization’s official domain — report `metadata_only` on NDLI when only the federated viewer is available.

**Disambiguation:** For `ncert science class 10`, the top hit is usually *Science NCERT Class 10*; rank 2 may be *Social Science* — match subject in the title/breadcrumb.

## Browse tree (school / NCERT)

When the user asks to **browse** (not only search): School hub → Content Provider **NCERT** → Class → Textbooks → subject collection → language leaf.

Example (Class 10 Science English): hub `ndl_se` → NCERT → Class 10 → Textbooks → **Science** collection (`.../IN__N__1_C_10__32_T__5_S__78_79`) → English leaf **Science: Class 10** (`.../IN__N__1_C_10__32_T__5_S__78_S__493_854`). Chapter rows in the sidebar are further `se_document/...` metadata links.

## Publisher resolution (NCERT example)

After NDLI metadata names **NCERT** and access is Open:

| Step | URL |
|------|-----|
| Textbook portal | `https://ncert.nic.in/textbook.php` → Class X → Science |
| Class 10 Science index | `https://ncert.nic.in/textbook.php?jesc1=0-13` |
| Chapter PDFs | `https://ncert.nic.in/textbook/pdf/jesc101.pdf` … `jesc113.pdf` |
| Full book ZIP | `https://ncert.nic.in/textbook/pdf/jesc1dd.zip` |

Verify `%PDF` on **ncert.nic.in**, not on NDLI `/serveFile/`. OpenStax HE hits (`domain: he`) → `openstax.org` for bytes.

## NDLI Club (discovery only)

Landing `https://club.ndl.iitkgp.ac.in/` is a **Vaadin/Polymer SPA** (“enable JavaScript” shell). For program copy, `GET` public view modules (e.g. `/src/views/club-about.js`, `club-home.js`) — do not bulk-harvest `server.club.ndl.iitkgp.ac.in` event APIs. `fetch_status`: `listing_only`.

## How to fetch (decision table)

| User goal | Steps | Typical `fetch_status` |
|-----------|-------|------------------------|
| “Find resource on NDLI” | doc-search → item page metadata | `metadata_only` |
| “Download textbook PDF” | NDLI metadata → **publisher official URL** → publisher `curl` | `fetched` (publisher URL in report) |
| Club / institutional program info | `club.ndl.iitkgp.ac.in` SPA + view JS | `listing_only` |
| Browse NCERT tree to a textbook leaf | hub → provider → class → subject → edition | `metadata_only` |

## Verify

- Search JSON returns `docs.length > 0` or show `modal_no_result` honestly.
- Publisher PDF: `%PDF` on the **publisher** URL, not only `/serveFile/`.

## Access barriers

| Situation | Status |
|-----------|--------|
| Metadata captured, bytes on publisher | `fetched` (cite both URLs) |
| Metadata only (harvesting disallowed or no publisher link) | `metadata_only` |
| Login on publisher | `auth_required` |
| doc-search 500 / empty | `source_gap` |

## Rights

Aggregator disclaimer: content hosted at source organizations; NDLI is not the primary rights holder.

