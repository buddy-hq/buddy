# Chhattisgarh SCERT textbooks (static PDF)

**Publisher:** State Council of Educational Research and Training, Chhattisgarh  
**Official domain:** `scert.cg.gov.in` only (not `tbc.cg.nic.in` for this reference)  
**Fetch family:** `static-pdf` (medium/year HTML hubs → direct PDFs under `/pdf/`)  

## What this source covers

- School textbooks by **academic session**, **medium** (Hindi, English, Dwibhashik), and class
- Reduced/syllabus-aligned editions (`Reduced_Class-*`, `ClassN - *-reduced.pdf`)
- Separate hubs for ECCE, question banks, D.El.Ed — out of scope unless requested

## Landing pages (discovery)

| Purpose | URL |
|--------|-----|
| Textbook hub | `https://scert.cg.gov.in/pdf/textbook.htm` |
| Hindi medium 2024–25 | `https://scert.cg.gov.in/pdf/textbook-2024-25/textbook-2024-25.htm` |
| English medium 2024–25 | `https://scert.cg.gov.in/pdf/textbook-EM-2024-25/textbook-em-2024-25.htm` |
| English medium 2021–22 (archive) | `https://scert.cg.gov.in/pdf/textbook-EM-2021-22/textbook-em-2021-22.htm` |
| Dwibhashik 2024–25 | `https://scert.cg.gov.in/pdf/textbook-dwibhashik-2024-25/textbook-dwibhashik-2024-25.htm` |

Start at `textbook.htm`, then open the **medium + session** page that matches the request. TBC MIS links on the hub point off-domain — use SCERT paths only.

## Direct PDF URL patterns

**2024–25 reduced set** (mixed relative bases):

```
https://scert.cg.gov.in/pdf/textbook-2024-25/Reduced_Class-{N}-{Subject}-2024-25.pdf
https://scert.cg.gov.in/pdf/textbook-EM-2024-25/Reduced_Class-{N}-{Subject}-2024-25.pdf
```

Examples:

| Label on EM page | PDF URL |
|------------------|---------|
| Class-9 Science | `https://scert.cg.gov.in/pdf/textbook-EM-2024-25/Reduced_Class-9-Science-2024-25.pdf` |
| Class-9 English (Flight Reader) | `https://scert.cg.gov.in/pdf/textbook-2024-25/Reduced_Class-9-English-2024-25.pdf` |
| Class-6 Vigyan (Hindi hub) | `https://scert.cg.gov.in/pdf/textbook-2024-25/Reduced_Class-6-Vigyan-2024-25.pdf` |

**2021–22 English archive:**

```
https://scert.cg.gov.in/pdf/textbook-EM-2021-22/Class{N} - {Subject}-reduced.pdf
```

(URL-encode spaces: `Class9%20-%20English-reduced.pdf`)

Filenames often include **spaces** before/after hyphens (`Reduced_Class-6-English- 2024-25.pdf`) — copy the exact `href` from HTML.

## Discovery workflow

1. **Parse** class, subject, medium (Hindi / English / Dwibhashik), session year (default 2024–25).
2. **Open the correct listing page** (see table above).
3. **Extract PDF links:**

```bash
curl -sL -A "Mozilla/5.0" \
  "https://scert.cg.gov.in/pdf/textbook-EM-2024-25/textbook-em-2024-25.htm" \
  | rg -o 'href="[^"]+\.pdf"' | sed 's/href="//;s/"$//'
```

4. **Resolve relatives** — `../textbook-2024-25/...` from EM page → under `/pdf/textbook-2024-25/`; same-folder links stay under `/pdf/textbook-EM-2024-25/`.
5. **Filter** by class number and subject token (`English`, `Science`, `Vigyan`, `Ganit`, `Maths`).
6. **Verify and download** with `Mozilla/5.0` user-agent; expect HTTP 200 and `application/pdf`.
7. **Post-download:** `file` confirms PDF; `pdftotext -f 1 -l 3` to confirm class, subject, session, and SCERT Raipur on the cover (image-only pages are rare on these reduced sets).

## Disambiguation notes

When the user says **current session** with no year, default **2024–25** on the matching medium hub (Hindi → `textbook-2024-25.htm`, English → `textbook-em-2024-25.htm`).

| User says | Page | Listing anchor (approx.) | Target file |
|-----------|------|--------------------------|-------------|
| Class 9 English (EM, 2024–25) | `textbook-em-2024-25.htm` | Class-9 English / Flight | `../textbook-2024-25/Reduced_Class-9-English-2024-25.pdf` |
| Class 9 Science (EM, 2024–25) | same | Class-9 Science | `Reduced_Class-9-Science-2024-25.pdf` (same folder as page) |
| Class 6 Science Hindi medium | `textbook-2024-25.htm` | कक्षा-6 विज्ञान… (VIGYAN EVAN PRAUDYOGIKI) | `Reduced_Class-6-Vigyan-2024-25.pdf` |
| Class 10 Science (EM) | `textbook-em-2024-25.htm` | Class-10 Science | `Reduced_Class-10-Science-2024-25.pdf` |
| Older 2021–22 English class 9 | `textbook-em-2021-22.htm` | Class-9 FLIGHT English Reader | `Class9 - English-reduced.pdf` |

**Vigyan** = Science on Hindi-medium pages; **Science** on English-medium pages. Do not swap session folders (2024–25 vs 2021–22).

## Metadata mapping

| Field | Guidance |
|-------|----------|
| `source_url` | Final PDF on `scert.cg.gov.in` |
| `landing_url` | Medium/session listing used |
| `class` | From prompt |
| `subject` | Map Vigyan → Science when user language is English |
| `medium` | Hindi / English / Dwibhashik from page choice |
| `resource_type` | `textbook` |
| `format` | `pdf` |
| `fetch_status` | `fetched` or `not_found` |
| `license` | Official SCERT CG; no open license captured |

## Known gaps and failure modes

- **Wrong medium page:** Hindi filenames on `textbook-2024-25.htm`, English on `textbook-em-2024-25.htm`.
- **Split PDF bases:** Some class IX–X English/Hindi PDFs live under `textbook-2024-25/` while Maths/Science sit under `textbook-EM-2024-25/` — resolve `../` correctly.
- **Spaces in filenames:** Must encode for curl; do not truncate ` - ` or trailing space before `2024-25`.
- **tbc.cg.nic.in:** Separate inventory system; not covered by this reference.
- **404 on year mismatch:** `Class9 - English-reduced.pdf` (2021–22) ≠ `Reduced_Class-9-English-2024-25.pdf`.

## Rights

Official SCERT Chhattisgarh materials. No CC license on site. Educational use per government copyright norms.

## Quick verification

```bash
curl -sI -A "Mozilla/5.0" \
  "https://scert.cg.gov.in/pdf/textbook-EM-2024-25/Reduced_Class-9-Science-2024-25.pdf"
curl -sI -A "Mozilla/5.0" \
  "https://scert.cg.gov.in/pdf/textbook-2024-25/Reduced_Class-6-Vigyan-2024-25.pdf"
```
