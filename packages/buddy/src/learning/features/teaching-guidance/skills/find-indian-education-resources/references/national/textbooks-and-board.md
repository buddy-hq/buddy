# National Textbooks and Board Materials

Use this reference when the user wants school-level study material or board practice material and has not clearly asked for a state board. Typical natural requests: “class 9 science book”, “chapter 3 history PDF”, “full NCERT book zip”, “CBSE sample paper”, “marking scheme”, “question bank”, “competency practice paper”, or “official board academic material”.

This reference is **not limited to Science or Mathematics**. It covers any official NCERT/CBSE class/subject material the source families expose, including languages, social science, EVS, and board-practice documents. The science/math examples below are prominent because those current-title rollouts needed extra disambiguation rules.

This file helps the agent distinguish two common families:

- **NCERT textbooks**: class/subject/medium/part/chapter downloads from `ncert.nic.in`, including chapter PDFs, prelims, and full-book ZIPs.
- **CBSE Academic resources**: sample papers, marking schemes, question banks, practice papers, competency material, and academic resource listings.

If the request is state-specific (“Maharashtra board”, “Tamil Nadu book”, “Kerala standard 9”), use the **State Mini Router** in `SKILL.md` and then read the matching state file. If the request is a platform object, QR code, or app resource, use `digital-platforms.md` instead.

## Contents

- [NCERT Textbooks](#ncert-textbooks)
- [CBSE Academic (sample papers and question banks)](#cbse-academic-sample-papers-and-question-banks)

---

# NCERT Textbooks

Prefer official NCERT textbook **PDFs and full-book ZIPs** from `ncert.nic.in` when that host is reachable. Current NCERT rollouts such as **Curiosity**, **Our Wondrous World**, and **Ganita Prakash** are available on official NCERT direct PDF URLs. DIKSHA is the official **host fallback** for the same current books when `ncert.nic.in` is down or unreachable. No third-party mirrors.

## Current vs legacy defaults

Do **not** ask “old or new?” for ordinary NCERT/CBSE textbook requests when the official default has already changed.

| User request shape | Default behavior | Ask or switch only when |
|--------------------|------------------|-------------------------|
| “Download class 6 science book” / “grade 8 book” / “latest NCERT book” | Use the **current official textbook** for that class, subject, and medium, and prefer the direct NCERT PDF/ZIP host when reachable | The user explicitly asks for old/previous/retired/legacy edition or names a legacy title/chapter |
| Plain class/subject/book-family request with no chapter title | Prefer **live** titles first | Live results are genuinely ambiguous after checking official sources |
| Topic + book request, e.g. “I am in CBSE Grade 8 and learning force, download the book” | Treat the topic as **context**, resolve the **current full book first**, then find the matching current chapter inside it | The user explicitly names the legacy chapter/book, or explicitly asks for the old edition |
| Named old chapter/title (“Force and Pressure”, old EVS title, etc.) | Treat as a **legacy** request | The user then says they actually want the current replacement |
| `ncert.nic.in` down for a current/default request | Keep the **same current book**, but switch the **download host** to DIKSHA live textbook workflow | The user explicitly wants the legacy static NCERT edition |

Current default cues to hard-code unless live verification contradicts them:

- **Class 5 EVS / The World Around Us** → `Our Wondrous World` (current official NCERT chapter PDFs use `eeev1*`; for example `eeev101.pdf`).
- **Classes 6-8 Science** → `Curiosity` (current official NCERT chapter PDFs use `fecu1*`, `gecu1*`, `hecu1*`; for example `hecu1ps.pdf`, `hecu102.pdf`).
- **Classes 6-8 Mathematics** → `Ganita Prakash` (current official NCERT chapter PDFs use `*gp*`; for example `hegp101.pdf`).
- **Grade 9 current titles** are still in transition across official labels. Verify the live NCERT/DIKSHA listing first instead of assuming the older pre-rollout title.

Host default to hard-code unless verification contradicts it:

- For current/default NCERT books, **try the direct NCERT PDF/ZIP URL first**.
- Use DIKSHA when the NCERT host is **timing out, unreachable, or otherwise not fetchable from the current machine**.
- Do **not** treat DIKSHA as the default downloader just because it is a valid fallback.

Interpretation rule to hard-code unless the user says otherwise:

- **User wording beats model memory.** If the user says only a **topic** (for example `force`) and asks for the class book, do **not** reinterpret that as a legacy chapter request just because older NCERT books had a famous chapter title like `Force and Pressure`.
- A topic word is **not** the same as an explicit legacy chapter title.
- Resolve the current book first; only use a legacy mapping when the user actually names the legacy chapter/book or asks for the older edition.

Legacy cues that justify older-book matching:

- Old chapter names like **“Force and Pressure”** imply the legacy Class 8 Science book (`hesc108`), not current `Curiosity`.
- Retired EVS titles/chapter names imply the legacy pre-`Our Wondrous World` book.
- Use DIKSHA `status: ["Retired"]` only for explicit legacy requests.

## What this source offers

| Format | Pattern | Verification cue |
|--------|---------|-------------------|
| Chapter PDF | `textbook/pdf/{code}{NN}.pdf` | 200 (e.g. `jesc105`, `hegp101`) |
| Prelims | `textbook/pdf/{code}ps.pdf` | 200 |
| Full book ZIP | `textbook/pdf/{code}dd.zip` | 200 (e.g. `gecu1dd.zip`) |
| Catalog | `textbook.php` | 200; JS embeds codes + titles |
| Current-book host fallback | DIKSHA live digital textbook | Parent ECAR plus child chapter PDFs; use when NCERT host is unreachable |

## URL and link patterns (by format)

Base PDF/ZIP: `https://ncert.nic.in/textbook/pdf/`

| What | Pattern | Example |
|------|---------|---------|
| Chapter N | `{code}{NN}.pdf` | `hegp101.pdf` = ch 1 |
| Prelims | `{code}ps.pdf` | identity check |
| Full book | `{code}dd.zip` | all chapters |

Chapter numbers zero-padded (`01`, `02`, …).

## Host reachability (run before discovery or download)

**Do not** scrape `textbook.php` or loop chapter PDFs until the host responds. Empty output from `curl -sI` usually means **timeout**, not “file missing”.

### Probe (always use visible errors and timeouts)

```bash
NCERT_HOST="https://ncert.nic.in"
curl -sS -m 25 --connect-timeout 12 -o /dev/null -w "http=%{http_code} exit=%{exitcode} connect=%{time_connect}s\n" \
  -I "${NCERT_HOST}/"
```

- **Never** use bare `curl -sI` on NCERT URLs — `-s` hides connect failures and looks like “no output”.
- Browser equivalent: `ERR_CONNECTION_TIMED_OUT` → same class as curl exit **28**.

### Classify the probe

| Signal | Meaning | `fetch_status` | Next step |
|--------|---------|----------------|-----------|
| curl exit **28**, `http=000`, connect **0.000s** | TCP never completed — host unreachable from this network | `network_unreachable` | Stop NCERT fetches; tell user (see below). Optional one retry with `--connect-timeout 25 -m 45`. |
| HTTP **200** on `/` (any `Content-Type`) | Host reachable | — | Continue NCERT workflow below. |
| HTTP **5xx** / slow hang then failure | Server error or overload | `network_unreachable` or `inconclusive` | One retry; then treat like outage. |
| HTTP **200** on `/` but PDF URLs timeout | Partial outage / PDF path blocked | `network_unreachable` | Report PDF CDN unreachable; do not web-search coaching mirrors. |
| HTTP **404** on a specific PDF after probe **200** | Wrong chapter/code or `source_gap` | `not_found` or `source_gap` | Do not confuse with exit 28. |

### What to tell the user when `network_unreachable`

Say clearly:

1. **Official NCERT host did not respond** from this machine (`ncert.nic.in` — connection timed out).
2. The requested book/chapter may still exist on NCERT; you could not verify or download right now.
3. Suggest: retry later, try another network (e.g. mobile hotspot), check the site in a browser.
4. For **current** textbook requests, continue with the official **DIKSHA live-textbook** workflow (see `digital-platforms.md`) instead of stopping at the NCERT timeout.
5. For explicit **legacy** requests, suggest retry later, another network (for example mobile hotspot), or browser verification; do **not** silently swap to a different current book.
6. **Do not** treat outage as wrong book code; **do not** substitute third-party PDF mirrors unless the user explicitly approves degraded mode.

### While host is down

- **Do not** download all of `textbook.php` (large, slow, fails the same way).
- **Do not** run generic web search for NCERT PDFs on coaching sites.
- For **current/default** requests, switch to DIKSHA live textbook discovery before declaring the fetch blocked.
- For **explicit legacy** requests, report the NCERT outage honestly instead of silently replacing the book with a current edition.
- You may still answer from **prior grounding** if the user asked to teach/make a worksheet and did not require a fresh download — label assumptions: “NCERT textbook not reachable; content aligned to standard Class X topic Y.”

## How to fetch

0. Resolve whether the user wants the **current default** book or an **explicit legacy** one.  
1. **Probe** host reachability (section above).  
2. Choose the official path:
   - **Current/default request + `ncert.nic.in` reachable** → prefer the direct NCERT static PDF/ZIP workflow below.
   - **Current/default request + `ncert.nic.in` unreachable** → keep the same current title, but use the compact DIKSHA live-textbook fallback below.
   - **Explicit legacy request + `ncert.nic.in` unreachable** → stop and report `network_unreachable`; do **not** silently replace it with the current book.
   - **Explicit legacy request + host reachable** → use the NCERT static workflow below.
3. Parse class, subject, medium, part I/II, chapter vs full book. If the user gave only a **topic** plus “the book”, treat that as a **current-book request with topic context**, not as a legacy chapter request.  
4. For the NCERT static path, **infer book code** when possible (prefix table + subject) and `curl -sS -m 25 -I` on `{code}ps.pdf` — skip `textbook.php` if prelims returns **200**. This is the preferred path for current books too when the NCERT host responds.  
5. If code is still unknown, discover from `textbook.php` (curl + grep/regex on `textbook.php?{code}=`) **only when step 1 passed**.  
6. Filter by class prefix and medium letter; **Science ≠ Social Science** (`sc` vs `ss`).

| Class | Code prefix | Class | Code prefix |
|-------|-------------|-------|-------------|
| 1–6 | `a`–`f` | 9 | `i` |
| 7 | `g` | 10 | `j` |
| 8 | `h` | 11 | `k` |
| | | 12 | `l` |

Medium (2nd letter, common case): `e` English, `h` Hindi, `u` Urdu.

7. Match user book title via page JS labels or grep (`Ganita Prakash` → `*gp*`, `Curiosity` → `*cu*`).  
7A. If the user gave a topic like `force` but asked for **the book**, first lock the **current textbook title/code**, then locate the topic/chapter within that current book. Do **not** jump directly to an older chapter code from memory.  
8. If the user names a **chapter topic** but not a number, scan `{code}01`–`{code}13` with `curl -sS -m 25 -I` then `pdftotext -f 1 -l 1` on 200s until the heading matches (e.g. “Life Processes” → `jesc105`; legacy Class 8 “Force and Pressure” → `hesc108`). Use catalog range from `textbook.php?{code}=` only when the host is up and you need chapter bounds.  
9. `curl -sS -fL -m 120 -o …` for PDF/ZIP after `curl -sS -m 25 -I` shows **200** and `Content-Type` is `application/pdf` or `application/zip`.  
10. For ZIP: `unzip -l` before full extract. Extract the relevant chapter PDFs first; then prefer `prepare_resource` and `ingest_full_text` on those extracted files instead of manual page parsing when the tools are available.

```bash
# After host probe succeeds:
curl -sS -m 25 --connect-timeout 12 -I "https://ncert.nic.in/textbook/pdf/{code}ps.pdf"
curl -sS -fL -m 120 -o out.pdf "https://ncert.nic.in/textbook/pdf/{code}{chapter}.pdf"
curl -sS -fL -m 300 -o book.zip "https://ncert.nic.in/textbook/pdf/{code}dd.zip"
# Catalog only if code still unknown:
curl -sS -m 45 --connect-timeout 15 "https://ncert.nic.in/textbook.php" | rg -o 'textbook\.php\?[a-z]{4,5}[0-9]=[0-9]+-[0-9]+'
```

Use **curl** for binaries (not WebFetch).

If you fetch a supported file to disk, prefer Buddy's `prepare_resource` -> `ingest_full_text` pipeline. For readable textbooks and chapter PDFs, do **not** use `present_media` as the main workflow when the resource pipeline is available; `present_media` only shows the file artifact, while the resource pipeline is the preferred reading/grounding path. Manual `pdftotext` and page/chapter parsing are fallback paths for unsupported files, failed preparation, or context-budget limits.

## DIKSHA fallback for current textbooks

Use this compact fallback when the user wants a **current/default NCERT textbook** and `ncert.nic.in` is unreachable. This fallback changes the **download host**, not the **book default**.

### When this fallback applies

- Plain requests like “download class 6 science book”, “latest NCERT book”, or “grade 5 EVS book”.
- Current-title requests where NCERT static hosting is down.

### When this fallback does not apply

- Explicit legacy/retired requests.
- QR/DIAL/app/player flows, auth walls, or broader platform-object tasks. For those, read `digital-platforms.md`.

### Minimal workflow

1. Search DIKSHA anonymous API with `primaryCategory: ["Digital Textbook"]`, `board: ["NCERT"]`, class, subject, medium, and `status: ["Live"]`.
2. Take the parent textbook `identifier` and `downloadUrl`.
3. Download the parent ECAR only to inspect its contents.
4. Read `hierarchy.json` and extract child `artifactUrl` entries where `mimeType == "application/pdf"` and `primaryCategory == "eTextbook"`.
5. Download the child chapter PDF(s) the user actually needs.
6. If the user wants the full book for grounding and DIKSHA exposes only per-chapter PDFs, read or ingest those chapter PDFs sequentially.
7. Do **not** stop at `present_media` for these chapter PDFs when `prepare_resource` / `ingest_full_text` are available; prefer the resource pipeline first.

```bash
curl -s -X POST 'https://diksha.gov.in/api/content/v1/search' \
  -H 'Content-Type: application/json' \
  -d '{
    "request": {
      "filters": {
        "primaryCategory": ["Digital Textbook"],
        "board": ["NCERT"],
        "gradeLevel": ["Class 8"],
        "subject": ["Science"],
        "medium": ["English"],
        "status": ["Live"]
      },
      "limit": 5,
      "fields": ["identifier","name","downloadUrl","mimeType","primaryCategory","gradeLevel","medium","board","contentType"]
    }
  }'

curl -sL '{downloadUrl}' -o textbook.ecar
unzip -p textbook.ecar hierarchy.json | jq '
  [.. | objects
   | select(.mimeType? == "application/pdf" and .primaryCategory? == "eTextbook")
   | {identifier, name, artifactUrl}]'
curl -sS -fL -o chapter.pdf '{artifactUrl}'
```

### Known live patterns

- Current DIKSHA textbook bundles often expose chapter PDFs like `fecu101.pdf`, `gecu101.pdf`, `hecu101.pdf`, or `eeev101.pdf` through child `artifactUrl` fields.
- The matching current books are also available on official NCERT direct PDF URLs when that host is reachable; DIKSHA is the fallback host, not the default downloader.
- Do **not** stop at the parent ECAR and claim the readable book PDF is already fetched.
- Use `status: ["Retired"]` only for explicit legacy requests because retired results can be noisy.

## Verify

- HTTP 200; `Content-Type` application/pdf or zip  
- `file` shows PDF document; ZIP lists expected chapter PDFs  
- Prelims/first page matches requested class/subject (`pdftotext` on prelims or chapter 1 is fine)  

## Access barriers

- No API; light JS on `textbook.php`  
- Anonymous fetch works for available CDN files when the host responds  
- **`ncert.nic.in` often times out** (curl 28, browser `ERR_CONNECTION_TIMED_OUT`) — classify as `network_unreachable`, not wrong URL  

## Rights / license

NCERT free for personal educational use; link official URLs.

## fetch_status for this source

| Status | When |
|--------|------|
| `fetched` | Valid PDF/ZIP on disk |
| `network_unreachable` | curl exit 28, `http=000`, or browser connection timed out to `ncert.nic.in` before any HTTP response |
| `source_gap` | Host reachable; code on catalog but all PDF/ZIP URLs 404 (e.g. `ihsc1`) |
| `not_found` | Host reachable; single URL 404 |
| `disambiguation_required` | Multiple codes match — list before download |

## Disambiguation / known source gaps

- Default to main textbook, not exemplar/lab manual, unless asked.  
- Default to the **current official title** for plain NCERT/CBSE class/subject requests. Do **not** ask “old or new?” unless the user explicitly asks for a previous/retired edition or names a legacy chapter/title.  
- For those current/default requests, prefer the **direct NCERT PDF/ZIP host first** when it responds. DIKSHA is the official host fallback when NCERT is timing out.
- Do **not** reinterpret a plain topic word as a legacy chapter title just because you remember older NCERT phrasing. Example: `force` in a Grade 8 book request means “find the current Grade 8 Science book and the force topic inside it,” not automatically legacy `Force and Pressure`.
- Part I vs II: codes ending `1` vs `2`. If the user names a chapter but not a part (e.g. “first chapter” of Ganita Prakash), default to **Part I** (`hegp1`, not `hegp2` or Hindi `hhgp1`).  
- Current middle-stage Science defaults are `Curiosity`: Class 6 `fecu1`, Class 7 `gecu1`, Class 8 `hecu1`. Do not silently map plain “class 8 science book” to legacy `hesc1`.  
- Current Class 5 EVS / The World Around Us defaults to `Our Wondrous World` (`eeev1`); do not default to the retired EVS title unless the user explicitly asks for it.  
- **ihsc1** (Class 9 Hindi Vigyan): chapter, prelims, ZIP all **404** — report `source_gap`; do not fetch English `iesc1` unless the user explicitly asks for English fallback. Class 8 Hindi Vigyan **`hhsc1`** still downloads (`hhsc101.pdf` → 200); do not assume all Hindi `*sc*` codes share the same CDN status.  
- **ihmh1** (Class 9 Hindi Ganita Manjari): same pattern as `ihsc1` — catalog/JS may list code, all PDF/ZIP URLs **404** (verify live).  
- Grade 9 current textbooks can appear under live labels such as `(NEW) ...` or renamed titles like `Exploration` on DIKSHA. Verify the live listing before locking the final title or code.  
- Renamed books: Ganita Prakash (`gp`), Curiosity (`cu`) — confirm via prelims or DIKSHA live metadata if title ambiguous.  
- Class 7 English Science is **Curiosity** (`gecu1`); `ghcu1` (Jigyasa, Hindi) and `gucu1` (Tajassus, Urdu) are other-medium Science books on the same class page — do not swap unless the user asked for that medium.  
- Class 10 English Social Science spans **`jess1`–`jess4`** (Geography, Economics, History, Political Science) — match catalog title (e.g. Contemporary India → `jess1`), not just the `ss` letter.

| User may say | Official title (approx.) | Code hint |
|--------------|--------------------------|-----------|
| EVS / The World Around Us (Class 5 current) | Our Wondrous World | `eeev1` |
| Mathematics (Class 6–8) | Ganita Prakash | `*gp*` (e.g. Class 6 `fegp1`, Class 8 `hegp1`) |
| Science (Class 6 current) | Curiosity | `fecu1` |
| Science (Class 7 current) | Curiosity | `gecu1` |
| Science (Class 8 current) | Curiosity | `hecu1` |
| Science (Class 8, legacy English) | Science | `hesc1` (e.g. Force and Pressure → `hesc108.pdf` when host is up) |
| Science (Grade 9 current) | Verify live current listing first (`(NEW) ...` / `Exploration`) | do not assume the retired title without a live check |
| Contemporary India (Class 10) | Social Science textbook | `jess1` (not `jesc1` Science) |
| Vigyan (Hindi Science) | Vigyan | `h` + `sc` (e.g. Class 8 `hhsc1`); Class 9 Hindi `ihsc1` may be **source_gap** |

**Part I / Part II:** Physics Class 11 uses `keph1` vs `keph2`; always match user’s part before chapter number. In Part II, `{code}01.pdf` is the **first file of that volume** (e.g. `keph201.pdf`), but the PDF heading may continue numbering from Part I (e.g. “Chapter 8”) — verify with prelims + first-page text, not “chapter 1 of the whole book.”

## Copyright

Official site only; do not redistribute via unofficial hosting.

---

## CBSE Academic

# CBSE Academic (sample papers and question banks)

Official assessment PDFs from **`cbseacademic.nic.in`** only: question banks (QB), sample question papers (SQP), marking schemes (MS).

## What this source offers

| Type | Index HTML | PDF under |
|------|------------|-----------|
| Question bank X | `qbclass10.html` | `web_material/QuestionBank/ClassX/` |
| Question bank XII | `qbclass12.html` | `web_material/QuestionBank/ClassXII/` |
| SQP + MS (per session) X | `SQP_CLASSX_{session}.html` | `web_material/SQP/ClassX_{y1}_{y2}/` |
| SQP + MS (per session) XII | `SQP_CLASSXII_{session}.html` | `web_material/SQP/ClassXII_{y1}_{y2}/` |
| Archive | `sqp_archive.html` | links to session pages |

**QB classes:** X and XII only (no Class 9 QB on site). **No Physics** file is exposed on `qbclass12.html` — scrape the live index; do not guess `PhysicsXII.pdf`.

## URL and link patterns (by format)

Prefix: `https://cbseacademic.nic.in/`

| Resource | Example |
|----------|---------|
| QB | `web_material/QuestionBank/ClassXII/AccountancyXII.pdf` |
| SQP (recent) | `…/ClassX_2025_26/Science-SQP.pdf` |
| MS (recent) | `…/ClassX_2025_26/Science-MS.pdf` |
| SQP (older) | `…/ClassX_2019_20/Science_SQP.pdf` (underscore era) |

Session folder: `Class{X|XII}_{start}_{end2digit}` (underscores, no hyphen).

## How to fetch

1. Parse class (X/XII), subject, QB vs SQP vs MS, session if given.  
2. Open correct index HTML; scrape `href="web_material/…"`.  
3. If year omitted for SQP or MS (“latest sample paper” / “latest marking scheme”), open `sqp_archive.html`, take the first `SQP_CLASS{X|XII}_*.html` link for that class, then scrape that session page.  
4. `curl -sI` then `curl -sL -o …` for PDF.  
5. Report URL, type, class, subject, session.

```bash
curl -sL "https://cbseacademic.nic.in/qbclass12.html" | rg -o 'href="web_material/[^"]+\.pdf"'
curl -sL "https://cbseacademic.nic.in/SQP_CLASSX_2025-26.html" | rg -o 'href="web_material/SQP/[^"]+\.pdf"'
curl -sL "https://cbseacademic.nic.in/sqp_archive.html" | rg -o 'SQP_CLASSX_[^"]+\.html' | head -1
curl -sI "https://cbseacademic.nic.in/web_material/QuestionBank/ClassXII/AccountancyXII.pdf"
```

## Verify

- HTTP 200; `application/pdf`; non-empty file; host `cbseacademic.nic.in`  
- Science vs Social Science vs Home Science: `Science-SQP.pdf`, `SocialScience-SQP.pdf`, `HomeScience-SQP.pdf` (and matching `-MS.pdf`) — match the user’s subject exactly  

## Access barriers

- HTML listing only; no JSON API  
- Anonymous direct PDF fetch works for official PDF URLs.

## Rights / license

CBSE R&D copyright on materials; link official URLs.

## fetch_status for this source

| Status | When |
|--------|------|
| `fetched` | PDF saved |
| `listing_only` | Index found but PDF missing/404 — re-scrape session page |
| `disambiguation_required` | Multiple English variants on page |

## Disambiguation / known gaps

- “Question bank” → `qbclass*.html`; “sample paper/SQP” → `SQP_CLASS*`.  
- Marking scheme → `-MS.pdf` or `_MS.pdf` by era.  
- Class X QB: only English, Maths, Science (`EnglishX.pdf`, etc.).  
- **Archive without year:** open `sqp_archive.html`, take the first `SQP_CLASS{X|XII}_*.html` link for that class (fetch agents used `head -1` on `rg` output), then scrape that page for SQP or MS.  
- **Page vs folder:** recent session HTML uses hyphens (`SQP_CLASSX_2025-26.html`); PDF folder uses underscores (`ClassX_2025_26`). Older archive pages also use underscores in the HTML name (`SQP_CLASSX_2019_20.html`) — take the exact `href` from `sqp_archive.html`, do not flip hyphen/underscore when building the index URL.  
- **Mathematics variants (Class X SQP):** `MathsStandard-SQP.pdf` vs `MathsBasic-SQP.pdf` — match user’s “standard” vs “basic”; do not default to one without checking the session index.  
- **Hindi medium:** when listed, English and Hindi are separate files (`Science-SQP.pdf` vs `Science-SQP_hi.pdf`, `MathsBasic-SQP_hi.pdf`, etc.); default to English unless the user asks for Hindi.  
- **MS on same page as SQP:** marking schemes (`-MS.pdf` or `_MS.pdf` by era) are linked from the same session index as the sample paper — no separate MS index.

## Copyright

Official CBSE Academic site; no unofficial mirrors.

---

## NEP 2020
