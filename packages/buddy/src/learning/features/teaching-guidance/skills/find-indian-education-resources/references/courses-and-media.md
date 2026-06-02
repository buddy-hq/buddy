# Courses, Media, and Open University Resources

Use this reference when the user wants open schooling, online-course, broadcast, or open-university material rather than a school-board textbook. Natural requests may sound like “NIOS course 202 material”, “learner guide”, “DAISY zip”, “SWAYAM course PDF/video”, “SWAYAM Prabha schedule”, “TV lecture stream”, “IGNOU unit”, “eGyanKosh bitstream”, or “open university course material”.

This file helps the agent locate:

- **NIOS public materials**: secondary/senior secondary/vocational/OBE course pages, course-code PDFs, learner guides, ZIP/EPUB/DAISY assets.
- **SWAYAM**: course pages, preview/player metadata, and public vs gated course assets.
- **SWAYAM Prabha**: channel schedules, telecast rows, streams, and media metadata.
- **eGyanKosh**: IGNOU/open university handles, item pages, and bitstreams.

Use this when level or delivery mode is open schooling, online course, broadcast media, or open university. Use national/state textbook references for ordinary school textbooks.

## Contents

- [NIOS Public Materials](#nios-public-materials)
- [SWAYAM](#swayam)
- [SWAYAM Prabha](#swayam-prabha)
- [eGyanKosh](#egyankosh)

---

## NIOS Public Materials

# NIOS — public online course materials (listing → PDF/ZIP/EPUB)

**Publisher:** National Institute of Open Schooling (NIOS)  
**Official domain:** `nios.ac.in` / `www.nios.ac.in` — **public** material branches only  
**Fetch family:** `listing-crawler` → direct `/media/documents/...` binaries  

## What this source offers

- Secondary, senior secondary, vocational, OBE, and Divyang student **syllabus and material** pages
- Direct PDFs, learner guides, ZIP/EPUB/DAISY packs under `/media/documents/`

**Out of scope:** `sdmis.nios.ac.in` and other authenticated student portals.

## URL and link patterns (by format)

| Format | Pattern |
|--------|---------|
| Hub | `https://www.nios.ac.in/online-course-material.aspx` |
| Secondary index | `https://www.nios.ac.in/online-course-material/secondary-courses.aspx` |
| Per-subject page | `.../secondary-courses/{subject}-({code})-syllabus.aspx` |
| PDF | `https://www.nios.ac.in/media/documents/.../*.pdf` |
| ZIP / EPUB | `.../media/documents/DAISYSECENG/...zip`, `.../EPub/...epub` |

Known public examples:

- `https://www.nios.ac.in/media/documents/Course_Bifurcation_2023/10th/201.pdf` (Hindi 201 course bifurcation)
- `https://www.nios.ac.in/media/documents/Course_Bifurcation_2023/10th/202.pdf` (English 202 course bifurcation)
- `https://www.nios.ac.in/media/documents/201_learnerguide_hindi.pdf`
- `https://www.nios.ac.in/media/documents/DAISYSECENG/201_ClassX_Hindi_part1.zip` (~209 MB DAISY/ZIP part 1)

## How to fetch

1. **Parse the request** — level (secondary / Sr.Secondary / vocational), **course code** (201, 202, …), subject name, **asset type** (course bifurcation vs learner guide vs DAISY/ZIP part N vs EPUB), and format (PDF vs ZIP vs EPUB).
2. Open the correct branch listing, then the **syllabus page** for that code (e.g. `hindi-(201)-syllabus.aspx`, `english-(202)-syllabus.aspx`).
3. On the syllabus page, collect official links under `/media/documents/` matching the requested asset and format. The **primary course bifurcation PDF** is usually the heading link (e.g. “Syllabus Bifurcation of English (202)”); learner guide, lesson PDFs, DAISY ZIP, and EPUB are separate siblings on the same page.
4. **Verify** with `curl -sI` then **download** with `curl -fL` and User-Agent:

```bash
curl -sI -A 'Mozilla/5.0 (compatible; BuddyResourceFetcher/1.0)' \
  'https://www.nios.ac.in/media/documents/Course_Bifurcation_2023/10th/201.pdf'
curl -fL -A 'Mozilla/5.0 (compatible; BuddyResourceFetcher/1.0)' -o 201.pdf \
  'https://www.nios.ac.in/media/documents/Course_Bifurcation_2023/10th/201.pdf'
```

5. For ZIP/EPUB requests, pick the correct folder and part — `DAISYSECENG/` for DAISY/ZIP packs (not `EPub/`), and match `part1` / `part2` when the user asks for a specific part. Download the matching extension; do not rename to PDF. Large ZIPs (~200 MB+) need `-fL` and time to complete.

## Verify

- PDF: `%PDF`
- ZIP: `PK\x03\x04` header
- EPUB: ZIP-based container or correct content-type

## Access barriers

- Use `www.nios.ac.in` consistently; relative links need host prefix
- Ignore notification PDFs unrelated to the requested course (e.g. site-wide AICTE circulars) unless they are the only official match
- **`sdmis.nios.ac.in` student portal:** `https://sdmis.nios.ac.in/` and `/auth` return **200 HTML** login shells (`Content-Type: text/html`), not PDF bytes — probe with `curl -sI`, return `auth_required`, **do not** POST credentials or scrape post-login dashboards. If the user can name **course codes**, the same official PDFs/ZIPs are on public syllabus pages under `online-course-material/...`

## Rights / license

NIOS course materials; government publication.

## fetch_status for this source

| Situation | Status |
|-----------|--------|
| Correct official binary | `fetched` |
| Only syllabus HTML, no binary for format | `listing_only` |
| Auth-only student portal | `auth_required` (out of scope — do not login) |

## Disambiguation / known source gaps

| User says | Start page | Typical asset |
|-----------|------------|---------------|
| Hindi 201 course bifurcation PDF | `hindi-(201)-syllabus.aspx` | `Course_Bifurcation_2023/10th/201.pdf` |
| Hindi 201 learner guide PDF | same syllabus page | `201_learnerguide_hindi.pdf` (different from bifurcation) |
| English 202 syllabus / bifurcation PDF | `english-(202)-syllabus.aspx` | `Course_Bifurcation_2023/10th/202.pdf` (heading link on page) |
| Hindi 201 DAISY/ZIP part 1 | same syllabus page | `DAISYSECENG/201_ClassX_Hindi_part1.zip` — not `EPub/` |
| Hindi 201 EPUB part 1 | same syllabus page | `EPub/201_ClassX_Hindi_part1.epub` |
| “My enrolled course PDFs” / SDMIS login | — | `auth_required` — out of scope; ask for course code or use public syllabus branch |
| Divyang materials | `course-material-for-divyang-students.aspx` | Branch-specific assets |

**Pattern:** secondary bifurcation PDFs often follow `Course_Bifurcation_2023/10th/{code}.pdf`; learner guides follow `{code}_learnerguide_{subject}.pdf`.

---

## SWAYAM

# SWAYAM (MOOC platform)

Government **MOOC** platform (`swayam.gov.in`) with per-course hosts on `onlinecourses.swayam2.ac.in` / `onlinecourses.nptel.ac.in`. Anonymous users can discover courses and read **preview metadata**; enrolled **unit videos, PDFs, and assessments** require SWAYAM SSO.

## What this source offers

| Resource | Where | Typical anonymous outcome |
|----------|-------|---------------------------|
| Course catalog | `swayam.gov.in/explorer` | `metadata_only` |
| Course preview | `onlinecourses.*.ac.in/{slug}/preview` | `metadata_only` (client-rendered) |
| Coordinator pages | `swayam.gov.in/nc_details/{NC}` | `metadata_only` |
| Week/unit lectures | `/{slug}/course`, unit paths | `auth_required` |
| Direct guessed PDF/MP4 | Invented paths under course host | `auth_required` or `not_found` |

## URL patterns

| Workflow | Pattern | Example |
|----------|---------|---------|
| Explorer | `https://swayam.gov.in/explorer` | Filter National Coordinator → NCERT / NIOS |
| Preview | `https://onlinecourses.swayam2.ac.in/{slug}/preview` | Card link; **redirects** to `.../e-learning/preview/{slug}` |
| Preview (canonical) | `https://onlinecourses.swayam2.ac.in/e-learning/preview/{slug}` | Hydrated tabs: Summary, Course outline, Books, Instructor Bio |
| NPTEL preview | `https://onlinecourses.nptel.ac.in/{slug}/preview` | `noc26_ge106` (`"ncCode": "NCERT"` in explorer JSON) |
| Unit / week entry | `https://onlinecourses.swayam2.ac.in/{slug}/unit?unit={n}` | Redirects to `.../e-learning/course/{slug}?unitId={n}` → SSO or preview bounce |
| SSO | `https://swayam-sso.swayam2.ac.in/signin` | Google, Microsoft, or SWAYAM account; `client_id=swayam-node2-production` |
| Course home (gated) | `https://onlinecourses.swayam2.ac.in/{slug}/` or `.../{slug}/course` | Login wall (HTTP 200 body is SSO HTML) |
| About (gated) | `https://onlinecourses.swayam2.ac.in/{slug}/about` | Login required message |

**HEAD requests return 405** on these hosts — use GET.

## How to fetch (metadata-first)

### A — Find a course (NCERT / NIOS / user topic)

1. Open `https://swayam.gov.in/explorer`.
2. Use National Coordinator filter (**NCERT**, **NIOS**, etc.) or search keywords matching the user request.
3. From the course card, record: **title**, **instructor**, **institute**, **start/end dates**, **weeks/credits**, **preview URL** (`.../preview`).
4. Set `fetch_status: metadata_only`, `format: html`, `resource_type: course_metadata`.

Embedded JSON in the explorer page includes fields like `title`, `url`, `explorerInstructorName`, `instructorInstitute`, `startDate`, `endDate`, `availability`, `ncCode`. Parse `{"edges": [...]}` from saved `explorer.html` (regex/script) and filter `ncCode == "NCERT"` when the UI filter is slow — acceptable when the UI is slow.

**Institute field:** explorer JSON may list a generic `instructorInstitute` (e.g. IIT Bombay) while the hydrated preview page shows the real affiliation (e.g. RIE Bhopal). Prefer **preview page** text for instructor/institute when both exist.

### B — Preview page (no login)

1. Open the official `.../preview` URL from the card (do not invent slugs unless the user supplied one).
2. Capture visible syllabus/marketing text and registration dates after JS loads (browser if needed).
3. If only a loading shell appears in raw `curl` output, use a **browser** after redirect to `e-learning/preview/{slug}` — tabs expose syllabus outline, dates, and Books/References links. Still report `metadata_only` when explorer JSON already established identity; note hydration in `extra steps`.

| Probe | curl GET | After browser hydration |
|-------|----------|-------------------------|
| `.../preview` | Next.js loading shell | Full preview tabs (outline module names, no unit PDFs) |
| `.../e-learning/course/{slug}?unitId=1` | Shell or redirect | **SWAYAM Login** on `swayam-sso.swayam2.ac.in`, or anonymous bounce back to preview |

**Do not** treat the anonymous preview **Course Information** YouTube embed (marketing intro) as the gated unit lecture — it is not a substitute for `auth_required` unit video.

### C — Unit video / lecture bytes (expect failure without account)

1. Map user **“week 1”** to the first **module** on the anonymous preview **Course outline** (SWAYAM school MOOCs label modules/chapters, not “Week 1”).
2. Follow unit entry `/{slug}/unit?unit=1` → `.../e-learning/course/{slug}?unitId=1`, or `/course` directly.
3. If the response is **SWAYAM Login**, Firebase SSO, or “requires that you be logged in”, set `fetch_status: auth_required`.
4. Anonymous `?unitId=` may redirect to preview with **zero PDF links** — still `auth_required` for enrolled lecture notes/video, not `fetched`.
5. **Do not** fabricate credentials or bypass enrollment.

### D — Negative: guessed direct file URL

1. If the user supplies a direct `.pdf` / `.mp4` path under `onlinecourses.*` without going through preview/explorer, probe with GET.
2. Report `auth_required`, `not_found`, or redirect to SSO — not `fetched`.

## Verify

- **metadata_only:** title + at least two of {instructor, institute, dates, preview URL} from official host
- **auth_required:** login page title/body or explicit “logged in” message on official domain
- Do **not** mark lecture video `fetched` without a verified anonymous direct URL

## Rights / license

Per-course; National Coordinator and providing institution own materials. Document NC name when known; do not claim CC/open license unless stated on the course page.

## Disambiguation

| User says | Start | Notes |
|-----------|-------|-------|
| NCERT course | Explorer → filter NCERT | Example metadata course: `noc26_ge106` preview on `onlinecourses.nptel.ac.in` |
| Class 11 Accountancy MOOC | Preview `nce26_sc01` | School-level accounting MOOC |
| Download lecture PDF | `/course` or `unit?unit=1` → `?unitId=1` | Expect `auth_required`; preview outline has titles only |
| Week 1 lecture video | First module in preview outline → `?unitId=1` | Expect `auth_required`; guessed `.../E1/lec1.mp4` → `not_found` |

## fetch_status matrix

| Situation | Status |
|-----------|--------|
| Catalog/preview metadata | `metadata_only` |
| SSO on units | `auth_required` |
| Invalid slug | `not_found` |
| Network failure | `network_unreachable` |

---

## SWAYAM Prabha

# SWAYAM Prabha (educational TV / streaming)

**24×7 DTH / YouTube educational channels** under PM e-Vidya. Primary outcomes are **YouTube live URLs**, **program schedules**, and **archive embeds** — not downloadable MP4 files on `swayamprabha.gov.in`.

## What this source offers

| Resource | Where | Typical outcome |
|----------|-------|-----------------|
| Live school channels | `/Live_channel/se` | `stream_url_only` (YouTube `watch?v=`) |
| Live HE / competitive | `/Live_channel/he`, `/Live_channel/ce` | `stream_url_only` |
| Program schedule | `/program/current_se/{channel_no}` | `metadata_only` |
| Archive telecasts | `/program/archive_se/{channel_no}` | `stream_url_only` (DIKSHA play or YouTube — see C) |
| Category hub | `/live_channel/category` | `listing_only` |
| School explorer | `/schooledu` | `listing_only` (alternate entry to SE channels) |

**Path capitalization matters:** live grids use `Live_channel` (capital **L**). `GET .../live_channel/se` (all lowercase) returns **500**; `.../live_channel/category` (lowercase) still **200**.

## URL patterns

| Workflow | Pattern | Example |
|----------|---------|---------|
| Home | `https://www.swayamprabha.gov.in/` | Links to categories |
| School live grid | `https://www.swayamprabha.gov.in/Live_channel/se` | Channel 01–12 cards |
| Channel 01 live YT | In grid `href` on lightbox | `https://www.youtube.com/watch?v=jkCqvsUx69I` (IDs change — read live page) |
| Schedule | `https://www.swayamprabha.gov.in/program/current_se/1` | NCERT PM eVIDYA 1 |
| Archive | `https://www.swayamprabha.gov.in/program/archive_se/1` | Past telecasts — Content column links (often DIKSHA) |
| HE / competitive live | `https://www.swayamprabha.gov.in/Live_channel/he`, `.../ce` | Same lightbox pattern as SE |

**Dead or wrong paths:** `program/archive/{n}` (no `_se`) → **500**; `live_programs/se/{n}` → **404**.

## How to fetch

### A — Live channel YouTube link

1. Open `https://www.swayamprabha.gov.in/Live_channel/se` (or `.../he`, `.../ce` per user level).
2. Find the channel number / name (e.g. **Channel No:01 — NCERT PM eVIDYA 1**).
3. Extract the official `https://www.youtube.com/watch?v=...` (or `youtu.be`) from the channel card lightbox anchor (`data-gallery="youtubevideos"`, `href` on the YouTube icon).
4. Schedule URL is often duplicated in the card `data-title` HTML — use for workflow B, not required for live watch.
5. `fetch_status: stream_url_only`, `format: video/stream`, `resource_type: live_channel`.

### B — Program schedule (metadata)

1. Open `https://www.swayamprabha.gov.in/program/current_se/{n}` matching the channel (schedule link is also embedded in the channel card `data-title`).
2. Confirm channel selector shows the right label (e.g. **CH 01 : NCERT PM eVIDYA 1**).
3. For “today”, filter rows under the bilingual day header (e.g. `मंगलवार, 02 जून 2026 / Tuesday, 02 June 2026`) and matching `DD-MM-YYYY` telecast dates — the page lists a full rotating cycle, not a single slot.
4. Table has **no** video/download links — only metadata.
5. `fetch_status: metadata_only` — do not claim you downloaded video.

### C — Archive clip

1. From the live grid or schedule page, follow **Archive** → `https://www.swayamprabha.gov.in/program/archive_se/{n}` (not `program/archive/{n}`).
2. Pick a **past** row (same-day telecasts usually **not** in archive yet).
3. Record the **Content** column `href` — school channel archive rows may point to `https://diksha.gov.in/play/content/...` rather than YouTube (legacy YouTube UI may be commented out in HTML).
4. `fetch_status: stream_url_only` when a verified play/watch URL is returned; optional DIKSHA artifact MP4 on `obj.diksha.gov.in` is still `stream_url_only` (government CDN, not `swayamprabha.gov.in` bytes).

### D — Negative: MP4 only from Prabha host

1. If asked to `curl` an MP4 from `swayamprabha.gov.in` without YouTube/DIKSHA, grep saved HTML for `.mp4` / `m3u8` on the portal host — expect **none** for telecasts.
2. `GET https://www.swayamprabha.gov.in/Download` may return **200** but only static promo assets (e.g. `Swayam Prabha Promo.mp4`), not NCERT telecasts.
3. Report `not_found` for “today’s telecast MP4 on portal only”; live is YouTube, schedule is metadata, archive is past rows + external play URLs.

## Verify

- **stream_url_only (live):** `youtube.com` / `youtu.be` from `/Live_channel/*` HTML
- **stream_url_only (archive):** `diksha.gov.in/play/content/...` or YouTube from `program/archive_*` Content column
- **metadata_only:** schedule rows include date/time + program title from `program/current_*` HTML; no `.mp4` on portal host
- Browser optional; `curl` + HTML parse works for A–C

## Rights

Government portal; video playback on YouTube subject to YouTube terms. Record links only.

## Disambiguation

| User says | Start |
|-----------|-------|
| PM e-Vidya / school TV | `/Live_channel/se` |
| Channel 1 / NCERT PM eVIDYA 1 | Channel 01 on SE grid → `current_se/1` |
| What’s on today | `program/current_se/{n}` |
| Past class | `program/archive_se/{n}` |

## fetch_status matrix

| Situation | Status |
|-----------|--------|
| YouTube link from official page | `stream_url_only` |
| Schedule table only | `metadata_only` |
| No MP4 on portal | `not_found` (for direct-file asks) |

---

## eGyanKosh

# eGyanKosh — IGNOU open repository (DSpace PDF bitstreams)

**Publisher:** IGNOU — eGyanKosh  
**Official domain:** `egyankosh.ac.in` only  
**Fetch family:** `static-pdf` via DSpace handle → bitstream  

## What this source offers

- Course modules and books as **PDF bitstreams**
- Handle landing pages with metadata and download links
- Communities/collections browse (HTML)

## URL and link patterns (by format)

| Format | Pattern |
|--------|---------|
| Handle page | `https://egyankosh.ac.in/handle/{prefix}/{suffix}` (DSpace uses `123456789/{id}`) |
| Direct PDF | `https://egyankosh.ac.in/bitstream/{prefix}/{suffix}/{sequence}/{filename}.pdf` |
| Repository search | `https://egyankosh.ac.in/simple-search?query={term}&submit=Go` |
| SLM community (browse) | `https://egyankosh.ac.in/handle/123456789/1` |

Example verified bitstream:

```
https://egyankosh.ac.in/bitstream/123456789/46834/1/BES-144B1E.pdf
```

## How to fetch

1. **Parse the request** — module code, course title, or handle/bitstream hint.
2. **No bitstream URL?** Start at `https://egyankosh.ac.in/`, browse communities (e.g. Self Learning Material at `/handle/123456789/1`) or run `simple-search?query={module|block}&submit=Go`, then open an **item** handle from results.
3. **Handle-only:** `curl -sL -A "Mozilla/5.0" "https://egyankosh.ac.in/handle/{prefix}/{suffix}"` and parse **View/Open** links for `bitstream/...pdf` — take `sequence` and `filename` from the page HTML, never guess.
4. **Collection handle:** Some handles list child items (collection), not a PDF. Browse to a child item handle, then repeat step 3 on that item. Example: `123456789/4385` → item `123456789/68797` → `Block-2.pdf`.
5. **Verify:** `curl -sI -A "Mozilla/5.0" "{bitstream_url}"` → 200, `application/pdf`.
6. **Download:** `curl -fL -A "Mozilla/5.0" -o "{local_path}" "{bitstream_url}"`.
7. Record module code from filename or handle metadata when visible.

```bash
# Item handle → extract bitstream path from HTML
curl -sL -A "Mozilla/5.0" "https://egyankosh.ac.in/handle/123456789/46834"
```

## Verify

- `%PDF` magic
- `Content-Length` > 0

## Access barriers

- JSESSIONID may appear; anonymous GET still works for tested PDFs
- Do not use non-IGNOU mirrors

## Rights / license

Repository item copyright (IGNOU); treat as rights-governed.

## fetch_status for this source

| Situation | Status |
|-----------|--------|
| Bitstream PDF saved | `fetched` |
| User-named bitstream 404 (even if handle lists a different official PDF) | `source_gap` — do not substitute another filename |
| Handle 404 or no PDF link on page | `source_gap` |
| Collection/metadata browse only | `listing_only` |

## Disambiguation / known source gaps

| Item | Handle / bitstream | Notes |
|------|-------------------|-------|
| BES-144B1E module PDF | `123456789/46834/1/BES-144B1E.pdf` | Known public bitstream |
| Collection → child item | `123456789/4385` → `68797/1/Block-2.pdf` | Input handle is a collection; PDF on child item |
| Wrong filename on live handle | `123456789/99999/1/Nonexistent_Module.pdf` | Handle serves `Unit-23.pdf`; user path 404 → `source_gap`, no substitute |
| Discovery without URL | search `block` → `123456789/53540/1/Block-4.pdf` | Homepage + `simple-search` → item handle → bitstream |
| Wrong sequence or fake handle | — | 404 → `source_gap`; after bitstream 404, open handle to separate bad handle vs wrong filename |

