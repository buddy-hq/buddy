# National Textbooks and Board Materials

Use this reference when the user wants school-level study material or board practice material and has not clearly asked for a state board. Typical natural requests: “class 9 science book”, “chapter 3 history PDF”, “full NCERT book zip”, “CBSE sample paper”, “marking scheme”, “question bank”, “competency practice paper”, or “official board academic material”.

This file helps the agent distinguish two common families:

- **NCERT textbooks**: class/subject/medium/part/chapter downloads from `ncert.nic.in`, including chapter PDFs, prelims, and full-book ZIPs.
- **CBSE Academic resources**: sample papers, marking schemes, question banks, practice papers, competency material, and academic resource listings.

If the request is state-specific (“Maharashtra board”, “Tamil Nadu book”, “Kerala standard 9”), use the **State Mini Router** in `SKILL.md` and then read the matching state file. If the request is a platform object, QR code, or app resource, use `digital-platforms.md` instead.

## Contents

- [NCERT Textbooks](#ncert-textbooks)
- [CBSE Academic (sample papers and question banks)](#cbse-academic-sample-papers-and-question-banks)

---

# NCERT Textbooks

Download official NCERT textbook **PDFs and full-book ZIPs** from `ncert.nic.in` only. No third-party mirrors.

## What this source offers

| Format | Pattern | Verification cue |
|--------|---------|-------------------|
| Chapter PDF | `textbook/pdf/{code}{NN}.pdf` | 200 (e.g. `jesc105`, `hegp101`) |
| Prelims | `textbook/pdf/{code}ps.pdf` | 200 |
| Full book ZIP | `textbook/pdf/{code}dd.zip` | 200 (e.g. `gecu1dd.zip`) |
| Catalog | `textbook.php` | 200; JS embeds codes + titles |

## URL and link patterns (by format)

Base PDF/ZIP: `https://ncert.nic.in/textbook/pdf/`

| What | Pattern | Example |
|------|---------|---------|
| Chapter N | `{code}{NN}.pdf` | `hegp101.pdf` = ch 1 |
| Prelims | `{code}ps.pdf` | identity check |
| Full book | `{code}dd.zip` | all chapters |

Chapter numbers zero-padded (`01`, `02`, …).

## How to fetch

1. Parse class, subject, medium, part I/II, chapter vs full book.  
2. Discover code from `textbook.php` (curl + grep/regex on `textbook.php?{code}=`).  
3. Filter by class prefix and medium letter; **Science ≠ Social Science** (`sc` vs `ss`).

| Class | Code prefix | Class | Code prefix |
|-------|-------------|-------|-------------|
| 1–6 | `a`–`f` | 9 | `i` |
| 7 | `g` | 10 | `j` |
| 8 | `h` | 11 | `k` |
| | | 12 | `l` |

Medium (2nd letter, common case): `e` English, `h` Hindi, `u` Urdu.

4. Match user book title via page JS labels or grep (`Ganita Prakash` → `*gp*`, `Curiosity` → `*cu*`).  
5. If the user names a **chapter topic** but not a number, use the catalog range on `textbook.php?{code}={start}-{end}` as a hint, then `curl -sL` candidate chapter PDFs and `pdftotext` the first page until the heading matches (e.g. “Life Processes” → `jesc105`, not `jesc106`).  
6. `curl -sI` prelims or target URL; then `curl -sL -o …` for PDF/ZIP.  
7. For ZIP: `unzip -l` before full extract.

```bash
curl -sL "https://ncert.nic.in/textbook.php" | rg -o 'textbook\.php\?[a-z]{4,5}[0-9]=[0-9]+-[0-9]+'
curl -sI "https://ncert.nic.in/textbook/pdf/{code}ps.pdf"
curl -sL -o out.pdf "https://ncert.nic.in/textbook/pdf/{code}{chapter}.pdf"
curl -sL -o book.zip "https://ncert.nic.in/textbook/pdf/{code}dd.zip"
```

Use **curl** for binaries (not WebFetch).

## Verify

- HTTP 200; `Content-Type` application/pdf or zip  
- `file` shows PDF document; ZIP lists expected chapter PDFs  
- Prelims/first page matches requested class/subject (`pdftotext` on prelims or chapter 1 is fine)  

## Access barriers

- No API; light JS on `textbook.php`  
- Anonymous fetch works for available CDN files  

## Rights / license

NCERT free for personal educational use; link official URLs.

## fetch_status for this source

| Status | When |
|--------|------|
| `fetched` | Valid PDF/ZIP on disk |
| `source_gap` | Code on catalog but all PDF/ZIP URLs 404 (e.g. `ihsc1`) |
| `disambiguation_required` | Multiple codes match — list before download |

## Disambiguation / known source gaps

- Default to main textbook, not exemplar/lab manual, unless asked.  
- Part I vs II: codes ending `1` vs `2`. If the user names a chapter but not a part (e.g. “first chapter” of Ganita Prakash), default to **Part I** (`hegp1`, not `hegp2` or Hindi `hhgp1`).  
- **ihsc1** (Class 9 Hindi Vigyan): chapter, prelims, ZIP all **404** — report `source_gap`; do not fetch English `iesc1` unless the user explicitly asks for English fallback. Class 8 Hindi Vigyan **`hhsc1`** still downloads (`hhsc101.pdf` → 200); do not assume all Hindi `*sc*` codes share the same CDN status.  
- **ihmh1** (Class 9 Hindi Ganita Manjari): same pattern as `ihsc1` — catalog/JS may list code, all PDF/ZIP URLs **404** (verify live).  
- Renamed books: Ganita Prakash (`gp`), Curiosity (`cu`) — confirm via prelims if title ambiguous.  
- Class 7 English Science is **Curiosity** (`gecu1`); `ghcu1` (Jigyasa, Hindi) and `gucu1` (Tajassus, Urdu) are other-medium Science books on the same class page — do not swap unless the user asked for that medium.  
- Class 10 English Social Science spans **`jess1`–`jess4`** (Geography, Economics, History, Political Science) — match catalog title (e.g. Contemporary India → `jess1`), not just the `ss` letter.

| User may say | Official title (approx.) | Code hint |
|--------------|--------------------------|-----------|
| Mathematics (Class 6–8) | Ganita Prakash | `*gp*` (e.g. Class 6 `fegp1`, Class 8 `hegp1`) |
| Science (Class 7) | Curiosity | `*cu*` (`gecu1`) |
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
