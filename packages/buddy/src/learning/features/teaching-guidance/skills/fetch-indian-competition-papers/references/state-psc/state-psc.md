# State PSC — Fetch Official State PSC Papers

Fetch official State Public Service Commission (State PSC) question papers.

## Scope

Each Indian state runs its own Public Service Commission — own site, URL pattern, access policy. **No stable cross-state pattern.** This leaf is per-state-aware: concrete fetch mechanisms where iteration-1 blind runners proved them; honest failure modes everywhere else.

Never default to a catch-all `source_gap`. Some state PSCs (BPSC, KPSC, Kerala PSC, WBPSC, JPSC, GPSC, RPSC, MPPSC, HPSC, APSC, TGPSC, APPSC) publish real, directly downloadable PDFs; some (UPPSC, TNPSC) host listings with partial coverage; some (MPSC, PPSC, UKPSC, OPSC) are client-rendered SPAs or postback-driven with no crawlable surface. Resolve the state first, then apply the matching mechanism.

## State index

Scan this table first to find the user's state, its commission, and the best-case fetch outcome. Then jump to the linked section for the concrete fetch mechanism. Do not read all 19 sections — read only the one matching the user's request.

| State | Commission | fetch_status | Section |
|-------|-----------|--------------|---------|
| Bihar | BPSC | fetched | [BPSC](#bpsc-bihar) |
| Uttar Pradesh | UPPSC | fetched | [UPPSC](#uppsc-uttar-pradesh) |
| Tamil Nadu | TNPSC | fetched | [TNPSC](#tnpsc-tamil-nadu) |
| Maharashtra | MPSC | source_gap | [MPSC](#mpsc-maharashtra) |
| Karnataka | KPSC | fetched | [KPSC](#kpsc-karnataka) |
| Kerala | Kerala PSC | fetched | [Kerala PSC](#kerala-psc-kerala) |
| Andhra Pradesh | APPSC | fetched | [APPSC](#appsc-andhra-pradesh) |
| Telangana | TGPSC | fetched | [TGPSC](#tgpsc-telangana) |
| West Bengal | WBPSC | fetched | [WBPSC](#wbpsc-west-bengal) |
| Jharkhand | JPSC | fetched | [JPSC](#jpsc-jharkhand) |
| Odisha | OPSC | source_gap | [OPSC](#opsc-odisha) |
| Gujarat | GPSC | fetched | [GPSC](#gpsc-gujarat) |
| Rajasthan | RPSC | fetched | [RPSC](#rpsc-rajasthan) |
| Madhya Pradesh | MPPSC | fetched | [MPPSC](#mppsc-madhya-pradesh) |
| Chhattisgarh | CGPSC | source_gap | [CGPSC](#cgpsc-chhattisgarh) |
| Punjab | PPSC | listing_only | [PPSC](#ppsc-punjab) |
| Uttarakhand | UKPSC | source_gap | [UKPSC](#ukpsc-uttarakhand) |
| Haryana | HPSC | fetched | [HPSC](#hpsc-haryana) |
| Assam | APSC | fetched | [APSC](#apsc-assam) |

The `fetch_status` column shows the **canonical best-case outcome** for each state — what a successful fetch returns. Per-request outcomes may differ (e.g. a `fetched` state can still return `not_found` or `source_gap` for a specific year/subject). See each section's `fetch_status` block for the full enum of per-request outcomes.

## When to stop

- **Try only the state the user named.** Do not crawl multiple states. Max 1 state per request. Do not fan out to multiple state PSCs unless the user explicitly asks for multiple states.
- **If the state is not in the index**, report `source_gap` with the general fallback guidance (see "General fallback" below). Do not guess a state and fabricate a result.
- **If a state's section says `listing_only` or `source_gap`**, do not attempt postback emulation, headless browsers, or auth bypass. Report the status and stop.
- **Do not infinite-crawl.** Once you have resolved the state, read only that state's section, attempt its documented fetch mechanism, and return. Do not walk every state section.

## Identify the state from user intent

Users phrase state-PSC requests many ways. Normalize to a canonical state + commission before fetching.

| Canonical state | Commission | Aliases / colloquial prompts (romanized + Hindi) |
|-----------------|-----------|--------------------------------------------------|
| Bihar | BPSC | "Bihar PCS", "BPSC", "बिहार पीसीएस", "Bihar PCS ka paper" |
| Uttar Pradesh | UPPSC | "UPPSC", "UP PCS", "Uttar Pradesh PCS", "यूपी पीसीएस" |
| Tamil Nadu | TNPSC | "TNPSC", "Tamil Nadu PCS", "Group-I Tamil Nadu" |
| Maharashtra | MPSC | "MPSC", "Maharashtra PCS", "महाराष्ट्र पीसीएस" |
| Karnataka | KPSC | "KPSC", "Karnataka PCS", "KAS" |
| Kerala | Kerala PSC | "Kerala PSC", "Kerala PCS", "കേരള PSC" |
| Andhra Pradesh | APPSC | "APPSC", "AP PCS", "Group-I AP" |
| Telangana | TGPSC | "TGPSC", "TSPSC", "Telangana PCS", "Group-I Telangana" |
| West Bengal | WBPSC | "WBPSC", "WB PCS", "West Bengal PCS" |
| Jharkhand | JPSC | "JPSC", "Jharkhand PCS", "झारखंड पीसीएस" |
| Odisha | OPSC | "OPSC", "Odisha PCS", "ओडिशा पीसीएस" |
| Gujarat | GPSC | "GPSC", "Gujarat PCS", "GAS" |
| Rajasthan | RPSC | "RPSC", "Rajasthan PCS", "RAS" |
| Madhya Pradesh | MPPSC | "MPPSC", "MP PCS", "मध्य प्रदेश पीसीएस" |
| Chhattisgarh | CGPSC | "CGPSC", "Chhattisgarh PCS", "छत्तीसगढ़ पीसीएस" |
| Punjab | PPSC | "Punjab PCS", "PPSC", "Punjab Civil Services", "PSCSCCE" |
| Uttarakhand | UKPSC | "Uttarakhand PCS", "UKPSC", "UK PCS", "उत्तराखंड पीसीएस" |
| Haryana | HPSC | "Haryana PCS", "HPSC", "HCS", "Haryana Civil Services" |
| Assam | APSC | "Assam PCS", "APSC", "Assam Civil Services", "CCE Assam", "ACCSE" |

Stop and ask if the state cannot be resolved from the prompt. Never guess a state and fabricate a result.

## Official surfaces and fetch mechanisms

State sections organized by region. Each follows a consistent skeleton: What this source offers, URL patterns, How to fetch, Verify, Access barriers, fetch_status, Disambiguation / known gaps.

---

### East India

---

#### BPSC (Bihar) — WordPress admin-ajax tree (FETCHABLE)

**What this source offers:**

BPSC publishes previous year question papers as **image-scan PDFs** via a WordPress "Question Booklets" plugin on its official site. Not a static link list — exposes an AJAX tree that must be walked to reach PDF URLs. Public, no-auth, no-CAPTCHA. Tree exposes 66th–71st CCE prelims and mains. Other BPSC exams may appear as additional root nodes.

**URL patterns:**

- Landing page: `https://bpsc.bihar.gov.in/question-booklets/`
- AJAX endpoint: `https://bpsc.bihar.gov.in/wp-admin/admin-ajax.php`
- PDF location: `https://bpsc.bihar.gov.in/wp-content/uploads/BPSC_content/QuestionBooklets/<filename>.pdf`
- Example: `https://bpsc.bihar.gov.in/wp-content/uploads/BPSC_content/QuestionBooklets/GENERAL-STUDIES-04-01-25.pdf` (70th Prelims GS, 04-01-2025 re-exam)

**How to fetch:**

1. GET `https://bpsc.bihar.gov.in/question-booklets/`. The page embeds `question_booklets_params = {"ajax_url":"https://bpsc.bihar.gov.in/wp-admin/admin-ajax.php","nonce":"<nonce>",...}`. Extract the `nonce` (embedded in public page HTML, not a secret).
2. POST `https://bpsc.bihar.gov.in/wp-admin/admin-ajax.php` with form body `action=get_children&parent_id=<root_id>&nonce=<nonce>`. Root is "Combined Competitive Examination". Response is JSON `{"success":true,"data":{"children":[...]}}`; each child has `id`, `title`, `has_children`, `has_pdfs`. **`get_children` uses the `parent_id` parameter** (per the live JS `question-booklets.js`), NOT `item_id` — sending `item_id` to `get_children` returns the root list (a no-op for tree-walking). The `item_id` parameter is used only by `get_question_booklets_pdfs` (step 4).
3. Walk the tree by calling `get_children` with the child `id` as `parent_id` until you reach a node with `has_pdfs=true`. Proven path for the 70th CCE:
   - Combined Competitive Examination (root)
   - → 70th Combined Competitive Examination (id=19, `has_children=true`)
   - → Integrated 70th Combined (Preliminary) (id=20, `has_pdfs=true`)
   - (siblings: 70th Main Compulsory id=21, 70th Main Optional id=44)
4. POST `admin-ajax.php` with `action=get_question_booklets_pdfs&item_id=<pdf_node_id>&nonce=<nonce>`. Response JSON lists PDFs, each with `id`, `title`, `file_url`. Proven PDFs for id=20:
   - `https://bpsc.bihar.gov.in/wp-content/uploads/BPSC_content/QuestionBooklets/GENERAL-STUDIES-04-01-25.pdf` (70th Prelims GS, 04-01-2025 re-exam)
   - `https://bpsc.bihar.gov.in/wp-content/uploads/BPSC_content/QuestionBooklets/GENERAL-STUDIES-13-12-24.pdf` (70th Prelims GS, 13-12-2024 original)
5. GET the `file_url` directly. PDFs live under `wp-content/uploads/BPSC_content/QuestionBooklets/`.

```bash
# Step 1: extract nonce from landing page
curl -s 'https://bpsc.bihar.gov.in/question-booklets/' | grep -oP '"nonce":"\K[^"]+'

# Step 2: walk tree (get_children uses parent_id, NOT item_id)
curl -s -X POST 'https://bpsc.bihar.gov.in/wp-admin/admin-ajax.php' \
  -d 'action=get_children&parent_id=<root_id>&nonce=<nonce>'

# Step 4: list PDFs for a leaf node (get_question_booklets_pdfs uses item_id)
curl -s -X POST 'https://bpsc.bihar.gov.in/wp-admin/admin-ajax.php' \
  -d 'action=get_question_booklets_pdfs&item_id=<pdf_node_id>&nonce=<nonce>'

# Step 5: download PDF
curl -s -o paper.pdf 'https://bpsc.bihar.gov.in/wp-content/uploads/BPSC_content/QuestionBooklets/<filename>.pdf'
```

**Verify:**

BPSC question booklets are **image scans** (PDF v1.7, Creator "HP Scan", no text layer). `pdftotext` returns nothing.
- Confirm `Content-Type: application/pdf` and non-empty body (proven: ~9.7 MB, 48 pages, A4).
- OCR page 1 with `tesseract` and confirm the booklet header matches the requested exam/date. Proven markers for the 70th Prelims GS 04-01-2025 booklet: "GENERAL STUDIES 04.01.2025", Series `01/BPP/GO/CC/PT-2025(Y)`, "150 questions", "Maximum Marks: 150", "2 Hours", "48 printed pages".

```bash
file paper.pdf
pdftotext paper.pdf - | head   # returns nothing — image scan, expected
# OCR page 1 for content verification
pdftoppm -f 1 -l 1 -r 300 paper.pdf page && tesseract page-1.ppm stdout | head
# Or: pdftoppm -f 1 -l 1 -r 300 paper.pdf page && read page-1.ppm directly if image-capable model
```

**Access barriers:**

- None. No auth, no captcha, no JS rendering required for the AJAX tree.
- **Symptom:** `admin-ajax.php` returns `success:false` or the nonce is rejected. **Fix:** re-GET the landing page for a fresh nonce before concluding unreachable.

**fetch_status:**

- `fetched` — requested CCE edition/stage/subject PDF is in the tree and downloads successfully.
- `not_found` — requested CCE edition / stage / subject is not a node in the tree (e.g. a year BPSC has not published).
- `source_gap` — node exists but `get_question_booklets_pdfs` returns an empty list.

**Disambiguation / known gaps:**

- Tree exposes 66th–71st CCE prelims and mains. Other BPSC exams may appear as additional root nodes — walk them the same way.
- PDFs are image scans — OCR required for content verification, not `pdftotext`, or read page images directly if image-capable model (`pdftoppm` + read tool).

---

#### JPSC (Jharkhand) — PHP two-step POST form (FETCHABLE)

**What this source offers:**

JPSC publishes previous exam question papers as **image-scan PDFs** on its official site `jpsc.gov.in` (Apache, static XHTML + PHP). The question-paper page uses a **two-step PHP form POST** — not a static link list. The exam dropdown lists 33+ exams including Civil Services PT (2021, 2023, 2025), Civil Services Main (2021, 2023), Forest Range Officer, Assistant Conservator of Forest, Civil Judge (Junior Division), Child Development Project Officer, Food Safety Officer, Dental Doctors, Assistant Engineer, Accounts Officer, Deputy Collector (Limited), Assistant Public Prosecutor, and more.

**URL patterns:**

- Listing page: `https://jpsc.gov.in/sam_question_paper.php`
- Download: POST to `https://jpsc.gov.in/sam_question_paper.php` with body `exam_name=<id>&subject=<pdf_filename>&submit=Click+Here+To+Download`
- No static PDF file path; PDFs served inline as the POST response.

**How to fetch:**

1. GET `https://jpsc.gov.in/sam_question_paper.php`. Parse the `<select name="exam_name">` dropdown. Each `<option value="<id>">` is an exam (e.g. value=11 → "CIVIL SERVICES PT EXAM-2023, ADVT. NO. 01/2024"). The dropdown auto-submits via `onchange="this.form.submit();"`.
2. POST `https://jpsc.gov.in/sam_question_paper.php` with body `exam_name=<id>`. Response is the same page with a second `<select name="subject">` dropdown populated. Each `<option value="<filename>.pdf">` is a question paper (e.g. "General Studies Paper-I.pdf", "General Studies Paper-II.pdf").
3. POST `https://jpsc.gov.in/sam_question_paper.php` with body `exam_name=<id>&subject=<filename>&submit=Click+Here+To+Download`. Response body **is the PDF** (Content-Type: application/pdf). Save it directly. No static PDF URL — the PDF is served as the POST response.

```bash
# Step 1: parse exam dropdown
curl -s 'https://jpsc.gov.in/sam_question_paper.php' | grep -oP '<option value="\K[^"]+'

# Step 2: get subject dropdown for an exam
curl -s -X POST 'https://jpsc.gov.in/sam_question_paper.php' -d 'exam_name=<id>'

# Step 3: download PDF (response body IS the PDF)
curl -s -o paper.pdf -X POST 'https://jpsc.gov.in/sam_question_paper.php' \
  -d 'exam_name=<id>&subject=<filename>.pdf&submit=Click+Here+To+Download'
```

**Verify:**

JPSC question papers are **image scans** (Creator: "HP Scanjet Software", Producer: "EZTwain Pro 3.43b3", BitsPerComponent 1, DeviceGray — bi-level scan). `pdftotext` returns nothing.
- Confirm `Content-Type: application/pdf` and non-empty body (proven: ~1.15 MB, 28 pages).
- OCR page 1 with `tesseract` at 300 DPI and confirm the booklet header matches the requested exam. Proven markers for Civil Services PT 2023 GS Paper-I: "QUESTION BOOKLET", "GENERAL STUDIES (PAPER—I)", "PRELIMINARY TEST", "Time Allowed : 2 Hours Maximum Marks : 200", bilingual (English + Hindi).

```bash
file paper.pdf
pdftotext paper.pdf - | head   # returns nothing — image scan, expected
pdftoppm -f 1 -l 1 -r 300 paper.pdf page && tesseract page-1.ppm stdout | head
# Or: pdftoppm -f 1 -l 1 -r 300 paper.pdf page && read page-1.ppm directly if image-capable model
```

**Access barriers:**

- None for question papers. No auth, no captcha. The two-step POST is the intended public flow.
- The `Results.php` page ("Results/ Answer Keys") is a separate surface for answer keys, not probed in detail this iteration.

**fetch_status:**

- `fetched` — requested exam is in the dropdown and the two-step POST returns a valid PDF (proven for Civil Services PT 2023 GS Paper-I).
- `source_gap` — requested exam/year is not in the dropdown, or the subject dropdown is empty for that exam.
- `not_found` — requested exam does not exist on the JPSC surface.

**Disambiguation / known gaps:**

- PDFs served inline as POST responses — no static PDF URL to bookmark or share. Execute the POST flow each time.
- Exam dropdown lists 33+ exams. Match the requested exam by the option text (includes year and advt number).
- PDFs are image scans — OCR required for content verification, or read page images directly if image-capable model (`pdftoppm` + read tool).

---

#### OPSC (Odisha) — ASP.NET WebForms postback (SOURCE GAP via HTTP)

**What this source offers:**

OPSC site is **ASP.NET WebForms**. The "Previous Question Papers" nav item exists, linking to `https://opsc.gov.in/Pages/View_Content.aspx?id=p/5qRxj7CZtpXYhZHF7BXQ==`. Fetching this URL (with or without ASP.NET session cookies, with or without URL-encoding the base64 ID) returns the **"What's New"** content feed (recruitment notices, results, admission certificates) — NOT question papers. The `id` query parameter does not filter the content category via static GET.

Actual PDF links are behind `__doPostBack` calls:
- Each list item has a "View Pdf" button: `javascript:__doPostBack('ctl00$generic_masterpage1$ctl15','')`.
- PDF served only after the postback submits `__VIEWSTATE` + `__EVENTVALIDATION` + the event target.
- A "Load More" button (`btn_load`) also uses postback to paginate.
- Switching to the "Previous Question Papers" category requires a postback from the homepage nav (which sets server-side state), not just the URL.

Same class of barrier as UPPSC (ASP.NET WebForms POSTBACK), but worse: UPPSC at least returns the correct listing page via GET, whereas OPSC returns the wrong ("What's New") content.

**URL patterns:**

- Homepage: `https://opsc.gov.in/` → redirects to `https://opsc.gov.in/Public/OPSC/Default.aspx`
- Previous Question Papers nav: `https://opsc.gov.in/Pages/View_Content.aspx?id=p/5qRxj7CZtpXYhZHF7BXQ==`
- Application portal: `opscechayan.in` (linked from homepage, likely candidate-login-gated, not probed)

**How to fetch:**

None via static HTTP. A headless browser or ASP.NET postback simulator would be required — out of scope for this skill's fetch flow.

**Verify:**

N/A — no content accessible to verify via static HTTP.

**Access barriers:**

- "Previous Question Papers" section exists in the nav but its content is postback-driven and returns "What's New" notices via GET.
- A headless browser or ASP.NET postback simulator would be required — out of scope.

**fetch_status:**

- `source_gap` — no crawlable direct-download path exists via static HTTP. Report honestly; do not fabricate a PDF URL. (Proven by iteration-1: `200 text/html` with "What's New" heading and recruitment-notice titles, confirmed across 3 fetch variants.)

**Disambiguation / known gaps:**

- Do **not** report "OPSC has no question paper archive" — the nav item exists, suggesting the commission does publish previous papers. The gap is in **fetchability via static HTTP**, not in existence.
- OPSC also has a separate application portal at `opscechayan.in` (linked from the homepage) — likely candidate-login-gated, not probed.

---

#### WBPSC (West Bengal) — JSP static HTML + Download endpoint (FETCHABLE)

**What this source offers:**

WBPSC publishes previous year question papers and answer keys as **text-based PDFs** on its official site `psc.wb.gov.in` (JSP-based, title "Public Service Commission,WB"). The Previous Year Question Papers page is **static server-rendered HTML** with a DataTables-enhanced table containing 123 direct download links. All links present in the raw HTML — no AJAX needed to enumerate. Coverage includes WBCS (Exe) Prelims (2015–2022, excluding 2020), WBCS (Exe) Mains (2018–2023), WBJS Judicial Mains (2020–2022), and many departmental exams (Clerkship, Asstt Engineer, Jr Engineer, Audit & Accounts, etc.).

**URL patterns:**

- Previous Year Question Papers listing: `https://psc.wb.gov.in/previous_year_question_paper.jsp`
- Direct PDF download: `https://psc.wb.gov.in/Download?param1=<filename>.pdf&param2=PYQP`
- Answer keys: `https://psc.wb.gov.in/answer_key.jsp` → `Download?param1=<filename>.pdf&param2=advertisement`
- Filenames embed exam name + year, e.g. `20240318164932_WBCS(PRELI)-2022.pdf`, `pyqp_20190905133227_WBCS(P)-2015_compressed.pdf`.

**How to fetch:**

1. GET `https://psc.wb.gov.in/previous_year_question_paper.jsp`. Static server-rendered HTML with a DataTables-enhanced table. All 123 `Download?param1=<filename>.pdf&param2=PYQP` links present in the raw HTML — no AJAX needed to enumerate.
2. Filter links by exam name in the `param1` filename (e.g. `WBCS(PRELI)`, `WBCS_Main`, `WBJS`, `Clerkship`, `ASSTTENGR`, `JrEngg`).
3. GET `https://psc.wb.gov.in/Download?param1=<filename>&param2=PYQP` directly. No auth, no CAPTCHA, no POSTBACK. Response is the PDF.

```bash
# Enumerate all PYQP download links
curl -s 'https://psc.wb.gov.in/previous_year_question_paper.jsp' | grep -oP 'Download?param1=\K[^"&]+'

# Download a specific paper
curl -s -o paper.pdf 'https://psc.wb.gov.in/Download?param1=<filename>.pdf&param2=PYQP'
```

**Verify:**

WBPSC question papers and answer keys are **text-based PDFs** (unlike BPSC's image scans). `pdftotext` extracts the header directly.
- Confirm HTTP 200 + `Content-Type: application/pdf` + non-empty body.
- **WBCS Prelims 2022** (`20240318164932_WBCS(PRELI)-2022.pdf`): HTTP 200, `application/pdf`, 831 KB, PDF v1.6. `pdftotext` extracts "WBCS(PRELI)-2022".
- **WBCS (Exe) Prelims 2024 Answer Key** (`202606241652_WBCS_24_Prelim_AK.pdf`): HTTP 200, `application/pdf`, 68 KB, PDF v1.7, 2 pages. `pdftotext` confirms: "PUBLIC SERVICE COMMISSION, WEST BENGAL", "W.B.C.S.(Exe) etc. Examination(Preli), 2024 [Advt no. 08/2024]", "DATE OF EXAM 14.06.2026".

```bash
file paper.pdf
pdftotext paper.pdf - | head
```

**Access barriers:**

- None for question papers or answer keys. No auth, no captcha, no JS rendering required.
- `question_paper.jsp` has no static download links (DataTables, possibly current-exam or empty). Use `previous_year_question_paper.jsp` as the primary archive surface.

**fetch_status:**

- `fetched` — requested exam/year is in the PYQP listing and the `Download` endpoint returns a valid PDF (proven for WBCS Prelims 2022 + 2024 Answer Key).
- `source_gap` — requested exam/year is not among the 123 listed PYQP files (e.g. WBCS Prelims 2020).
- `not_found` — requested exam does not exist on the WBPSC surface at all.

**Disambiguation / known gaps:**

- **Official URL is `psc.wb.gov.in`.** The old URL `pscwbapplication.in` is the application portal (S3/CloudFront), not the question-paper archive.
- **`pscwb.org.in` is a third-party WordPress blog** (Hostinger/Cloudflare) about job news — do **not** use it. Not an official government domain.
- WBCS (Exe) Prelims: 2015, 2016, 2017, 2018, 2019, 2021, 2022. (2020 not seen in listing.)
- WBCS (Exe) Mains: 2018, 2019, 2021, 2022, 2023 (compulsory + optional + maths papers).
- WBJS (Judicial) Mains: 2020, 2021, 2022 (compulsory + optional).

---

### North India

---

#### UPPSC (Uttar Pradesh) — ASP.NET WebForms POSTBACK (PARTIAL)

**What this source offers:**

UPPSC hosts a "Previous Year Question Papers" listing on its official site `uppsc.up.nic.in`, reached via the `OuterPages/PreQuesPapers.aspx?ID=PrevQues` section. Listing page title is "List of Previous Year Question Papers". This is an **ASP.NET WebForms** page — not crawlable via static links; requires `__doPostBack` form submissions carrying `__VIEWSTATE` / `__EVENTVALIDATION`.

Published year tabs: **2025, 2024, 2023, 2021, 2020, 2018, 2017**. **2022 is NOT a published year tab.** The only static PDF links on the default view are for "Assistant Professor Government Degree College Examination 2025" — a different exam from PCS.

**URL patterns:**

- Landing page: `https://uppsc.up.nic.in/` → "Previous Year Question Papers" listing
- Listing page: `OuterPages/PreQuesPapers.aspx?ID=PrevQues` (title "List of Previous Year Question Papers")
- PDF URL pattern: `../Upload_QuestionPaper/<token>_prvpr.pdf` (direct public PDF links)

**How to fetch:**

1. GET the previous-question-papers landing page. There is an AngularJS intermediate page ("Clear history" script); follow through to the "List of Previous Year Question Papers" page (~177 KB).
2. Parse the form: year-tab list, exam dropdown (`DDL_PaperCode`), paper/series selectors. Extract `__VIEWSTATE`, `__EVENTVALIDATION`, and the dropdown option values.
3. Submit the form via `__doPostBack` for the requested Exam + Year + Paper + Series. Response is the same page with either a results table (containing `../Upload_QuestionPaper/<token>_prvpr.pdf` direct links) or the text `Presently there is no record found.`
4. If a `prvpr.pdf` link is present, GET it directly — it is a public PDF.

**Verify:**

- Confirm HTTP 200 + `Content-Type: application/pdf` + non-empty body.
- Extract text with `pdftotext` and confirm the exam/year/subject header matches the request.

```bash
file paper.pdf
pdftotext paper.pdf - | head
```

**Access barriers:**

- ASP.NET WebForms POSTBACK required — not a static link list. `__VIEWSTATE` and `__EVENTVALIDATION` must be extracted and submitted.
- No auth, no captcha for the listing itself.

**fetch_status:**

- `fetched` — year/exam/paper exists and a `prvpr.pdf` link is returned.
- `source_gap` — requested year is not among the published year tabs, **or** the form submission returns "no record found" (proven for 2022 PCS GS). This is the honest outcome for the 2022 PCS GS case.
- `listing_only` — page lists a paper but no direct `prvpr.pdf` link is attached.

**Disambiguation / known gaps:**

- **2022 is NOT a published year tab.** Submitting PCS + 2022 + GS Paper-01 + Series-A returns "Presently there is no record found."
- Do **not** substitute a different exam/year paper (e.g. the 2025 Asst. Professor paper) for a requested PCS paper. That is a forbidden substitution.

---

#### PPSC (Punjab) — ASP.NET WebForms postback (LISTING ONLY)

**What this source offers:**

PPSC site is **ASP.NET WebForms**. The homepage is ~1 MB of server-rendered HTML containing every notice/advertisement as an `<a href="/index.aspx?page=N&tabid=M&tablinkid=K">` anchor. The homepage carries a marquee announcement:

> "Question paper and answer key are uploaded on the respective page of the advertisements under closed advertisement link."

**Critical finding:** all `index.aspx?page=N` URLs return the **same ~1,033,712-byte HTML shell**. A diff between the homepage (page=10) and the closed-adv page (page=28) shows only 4 differing lines (`__VIEWSTATE`, `__EVENTVALIDATION`, visitor counter). The actual per-page content (advertisement details, question-paper PDF links) is loaded via **ASP.NET postback**, not via direct URL access.

There are **zero direct PDF links** in the static HTML of any page. All file references are images. Notice titles mention "ANSWER KEY" extensively, but the PDFs are behind postback navigation.

**URL patterns (for reference, not directly crawlable):**

- Homepage: `https://ppsc.gov.in/index.aspx?page=10&tabid=3&tablinkid=10`
- Closed advertisements: `https://ppsc.gov.in/index.aspx?page=28&tabid=49&tablinkid=28&tablinkyes=1`
- Individual notice: `https://ppsc.gov.in/index.aspx?page=N&tabid=10&tablinkid=K`

**How to fetch:**

None via static HTTP. Reaching individual advertisement pages (which contain the question-paper PDF links) requires ASP.NET `__doPostBack` form submissions carrying `__VIEWSTATE` / `__EVENTVALIDATION`. Out of scope for this skill's static-fetch flow.

**Verify:**

N/A — no content accessible to verify via static HTTP.

**Access barriers:**

- All `index.aspx?page=N` URLs return the same HTML shell. Per-page content is loaded via postback only.
- A headless browser or ASP.NET postback emulator would be required — out of scope.

**fetch_status:**

- `listing_only` — site lists notices/advertisements with titles referencing answer keys and question papers, but no direct PDF download link is available via static HTTP. Default outcome for PPSC question-paper requests.
- `source_gap` — requested exam/advertisement does not appear in the notice listing at all.

**Disambiguation / known gaps:**

- Question papers exist (the site says they are uploaded under closed advertisements), but they are behind ASP.NET postback. Report `listing_only`.
- Do **not** fabricate a PDF URL. The `readwritedata/files/` path is referenced for images only; no question-paper PDF path is discoverable via static HTML.

---

#### UKPSC (Uttarakhand) — multi-domain, all broken (SOURCE GAP)

**What this source offers:**

UKPSC online presence is fragmented across multiple domains, all broken for question-paper access:

| Domain | Status | Notes |
|--------|--------|-------|
| `ukpsc.gov.in` | DNS SERVFAIL | Domain does not resolve. Linked as "Old Website" from the new site. |
| `ukpsc.net.in` | React SPA shell | 747 bytes, `<div id="root"></div>`, create-react-app. No crawlable content. |
| `psc.uk.gov.in` | Live (Laravel) | New official site. Homepage works (~118 KB). But question-paper pages return 500. |
| `pscuk.net.in` | Commercial site | "Products and Services", "Fees Details" — **NOT official, excluded.** |

New site (`psc.uk.gov.in`) question-paper sections:

| Section | URL | HTTP result |
|---------|-----|-------------|
| Old Question Papers | `psc.uk.gov.in/candidate-corner/oldquestionpaper` | **500 Server Error** |
| Answer Keys | `psc.uk.gov.in/candidate-corner/answerkey` | **500 Server Error** |
| Recruitment | `psc.uk.gov.in/candidate-corner/recruitment` | 200 OK — has recruitment notification PDFs under `public/uploads/recruitment/`, but **no question papers** |

**URL patterns:**

- New official site: `https://psc.uk.gov.in/`
- Old Question Papers (broken): `https://psc.uk.gov.in/candidate-corner/oldquestionpaper`
- Answer Keys (broken): `https://psc.uk.gov.in/candidate-corner/answerkey`

**How to fetch:**

None via static HTTP. Question-paper and answer-key pages exist in the site navigation but return 500 Server Error. Old domain has DNS failure. React SPA domain has no server-rendered content.

**Verify:**

N/A — no content accessible to verify.

**Access barriers:**

- Question-paper and answer-key pages return 500 Server Error on the new official site.
- Old domain `ukpsc.gov.in` has DNS SERVFAIL.
- `ukpsc.net.in` is a React SPA shell with no crawlable content.
- `pscuk.net.in` is a commercial site — **NOT official, excluded.**

**fetch_status:**

- `source_gap` — no crawlable direct-download path for question papers exists via HTTP. Report honestly; do not fabricate a URL.

**Disambiguation / known gaps:**

- If the 500 errors are resolved in a future iteration, re-probe `psc.uk.gov.in/candidate-corner/oldquestionpaper` for direct PDF links.
- Do **not** use `pscuk.net.in` — it is a commercial site, not an official government domain.

---

#### HPSC (Haryana) — DNN static HTML (FETCHABLE)

**What this source offers:**

HPSC publishes previous year question papers as **image-scan PDFs** on its official DotNetNuke (DNN) CMS site `hpsc.gov.in` (Microsoft-IIS/8.0). The Previous Year's Question Papers page is **static HTML** with 230 direct PDF links. No POSTBACK, no AJAX, no auth, no CAPTCHA. Coverage includes HCS Prelims (2021, 2022, 2023 — GS + CSAT each), HCS Mains 2023 (GS, English, Hindi, + ~25 optional subjects), and Subject Knowledge Test (SKT) papers for various posts (2024–2026).

**URL patterns:**

- Papers: `https://hpsc.gov.in/en-us/Previous-Question-Papers`
- Answer keys: `https://hpsc.gov.in/en-us/Examination/Answer-Keys`
- PDFs: `https://hpsc.gov.in/Portals/0/<filename>.pdf`
- Mains subfolder: `https://hpsc.gov.in/Portals/0/QPAPER_HCS_MAINS_2023/<subject>_2023.pdf`
- Example: `https://hpsc.gov.in/Portals/0/HCS_Pre_CSAT1_2023.pdf`

**How to fetch:**

1. GET `https://hpsc.gov.in/en-us/Previous-Question-Papers`. Page is ~62 KB of static HTML containing 230 direct PDF links under `/Portals/0/...`.
2. Parse the link table. Each entry has the exam name as link text and the PDF URL as `href`. Links categorized by exam:
   - HCS Prelims: 2021, 2022, 2023 (GS + CSAT each)
   - HCS Mains 2023: GS, English, Hindi, + ~25 optional subjects (under `/Portals/0/QPAPER_HCS_MAINS_2023/`)
   - Subject Knowledge Test (SKT) papers for various posts (2024–2026)
3. GET the PDF URL directly (e.g. `https://hpsc.gov.in/Portals/0/HCS_Pre_CSAT1_2023.pdf`). Public PDF.

Answer Keys are on a separate page: `https://hpsc.gov.in/en-us/Examination/Answer-Keys` — includes HCS 2026 combined Master QP + Answer Key PDFs (e.g. `Master_QP_Ans_Key_HCS_GS_Paper1_02_05_2026.pdf`).

```bash
# Enumerate PDF links
curl -s 'https://hpsc.gov.in/en-us/Previous-Question-Papers' | grep -oP 'Portals/0/\K[^"]+\.pdf'

# Download a paper
curl -s -o paper.pdf 'https://hpsc.gov.in/Portals/0/HCS_Pre_CSAT1_2023.pdf'
```

**Verify:**

HPSC question papers are **image scans** (PDF v1.1, Producer "Zan Image Printer (BW)", no text layer). `pdftotext` returns only an "OFFICE COPY" watermark (~1,216 chars).
- Confirm HTTP 200 + `Content-Type: application/pdf` + non-empty body.
- Confirm the filename and link-text match the requested exam/year/subject.
- `pdfimages -list` confirms grayscale CCITT images at 300 DPI.
- **Symptom:** OCR (`tesseract`) may return empty on light scans. **Do not treat as a failure.** Rely on filename + link-text + HTTP metadata. If image-capable model, split with `pdftoppm` and read the page image directly — visual inspection works where OCR fails on light scans.
- Proven: `HCS_Pre_CSAT1_2023.pdf` → 1,171,023 bytes, 32 pages, A4. `01_GEN_STUDIES_2023_MAINS_2023.pdf` → 2,888,428 bytes.

```bash
file paper.pdf
pdftotext paper.pdf - | head   # returns only "OFFICE COPY" watermark — expected
pdfimages -list paper.pdf
```

**Access barriers:**

- None. No auth, no captcha, no JS rendering. All PDF links are in server-rendered HTML.

**fetch_status:**

- `fetched` — requested paper is listed with a `/Portals/0/...` link (proven for HCS Prelims 2023 CSAT, HCS Mains 2023 GS).
- `not_found` — requested year/stage/subject is not in the link table (e.g. HCS Prelims 2024 is not listed on the papers page).
- `listing_only` — a row exists but the PDF link is missing/broken.

**Disambiguation / known gaps:**

- HCS Prelims papers available for **2021–2023 only**. HCS Mains papers are **2023 only**. No papers before 2021 or after 2023 on the papers page (2026 is on the answer-keys page as a combined Master QP + Answer Key). If a year outside this range is requested, report `not_found`.
- Do **not** substitute a different year/subject paper. If 2024 HCS Prelims is requested and not listed, report `not_found`.
- PDFs are image-based — `pdftotext` returns empty or only a watermark. Verification relies on filename + link-text + HTTP metadata, not text extraction, or read page images directly if image-capable model (`pdftoppm` + read tool).

---

### Northeast India

---

#### APSC (Assam) — PHP static HTML (FETCHABLE)

**What this source offers:**

APSC publishes previous question papers as **image-based PDFs** on its official PHP site `apsc.nic.in` (Apache). The Previous Question Papers page is **static HTML** with 177 direct PDF links. No POSTBACK, no AJAX, no auth, no CAPTCHA. Papers grouped by exam: CCE Preliminary 2025 (GS-I, GS-II), CCE Main 2024 (Essay, GS-I through GS-V), CCE Preliminary 2024, CCE Main 2023, CCE Preliminary 2023, plus many other recruitment exams (JE, AE, UTO, JAA, Functional Manager, Grade IV, AAO, ARO, CDO, etc.).

**URL patterns:**

- Papers: `https://apsc.nic.in/questions_2023.php`
- Answer keys: `https://apsc.nic.in/answer_keys.php`
- Question paper PDFs: `https://apsc.nic.in/prev_qp/<filename>.pdf`
- Answer key PDFs: `https://apsc.nic.in/misc_2026/<filename>.pdf`
- **Broken/legacy:** `https://apsc.nic.in/cce_prelims_papers.php` → returns "File not found." (16 bytes). Do NOT use this URL; use `questions_2023.php` instead.

**How to fetch:**

1. GET `https://apsc.nic.in/questions_2023.php`. Page is ~56 KB of static HTML containing 177 direct PDF links under `prev_qp/...`.
2. Parse the link table. Each entry has the subject/paper name as `<span class="label">` text and the PDF URL as `href`. Papers grouped by exam in `<td>` sections with colored headers.
3. GET the PDF URL directly (e.g. `https://apsc.nic.in/prev_qp/GS-I_CCE(P)_2025.pdf`). Public PDF.

Answer Keys are on a separate page: `https://apsc.nic.in/answer_keys.php` — ~150 KB, direct PDF links under `misc_2026/...` (and older year-stamped subfolders). CCE Prelims 2025: `AnsKey_CCE(P)_2025_GS_I.pdf`, `AnsKey_CCE(P)_2025_GS_II.pdf`.

```bash
# Enumerate PDF links
curl -s 'https://apsc.nic.in/questions_2023.php' | grep -oP 'prev_qp/\K[^"]+\.pdf'

# Download a paper
curl -s -o paper.pdf 'https://apsc.nic.in/prev_qp/GS-I_CCE(P)_2025.pdf'
```

**Verify:**

APSC question papers are **image-based PDFs** (PDF v1.7, Producer "iLovePDF", no text layer). `pdftotext` returns empty.
- Confirm HTTP 200 + `Content-Type: application/pdf` + non-empty body.
- Confirm the filename and link-text match the requested exam/year/subject.
- Proven: `GS-I_CCE(P)_2025.pdf` → 22,738,602 bytes, 48 pages. `GS-I_2024.pdf` → 1,358,332 bytes. `essay_2024.pdf` → 335,682 bytes.

```bash
file paper.pdf
pdftotext paper.pdf - | head   # returns empty — image-based, expected
```

**Access barriers:**

- None. No auth, no captcha, no JS rendering. All PDF links are in server-rendered HTML.

**fetch_status:**

- `fetched` — requested paper is listed with a `prev_qp/...` link (proven for CCE Prelims 2025 GS-I, CCE Mains 2024 GS-I, CCE Mains 2024 Essay).
- `not_found` — requested year/stage/subject is not in the link table (e.g. CCE Prelims 2022 is not listed).
- `listing_only` — a section header exists but no PDF links are attached.

**Disambiguation / known gaps:**

- CCE Prelims papers available for **2023–2025**. CCE Mains papers are **2023–2024**. If a year outside the listed range is requested, report `not_found`.
- Do **not** use `cce_prelims_papers.php` — it is broken. Always use `questions_2023.php`.
- PDFs are image-based — `pdftotext` returns empty. Verification relies on filename + link-text + HTTP metadata, or read page images directly if image-capable model (`pdftoppm` + read tool).

---

### South India

---

#### KPSC (Karnataka) — static HTML archive (FETCHABLE)

**What this source offers:**

KPSC publishes previous year question papers as **directly downloadable PDFs** on its official site `kpsc.kar.nic.in`. Two static HTML pages aggregate PDF links:

1. **`questionpaper.html`** — a landing page (FrontPage-generated, 144 KB) with ~431 direct `.pdf` links. Tends to have more recent papers (2023–2024): Labour Inspector, Group-C Non-Technical, Excise Sub Inspector, Assistant Director, Compulsory Kannada, Departmental Exams.
2. **`PREVIOUS YEARS QUESTION PAPERS.htm`** — a large archive page (FrontPage-generated, 1.27 MB) with ~476 direct `.pdf` links named by subject code (`11.pdf` through `573.pdf`). A subject-code-to-exam-name mapping PDF (`Subject code 11 to 573.pdf`) is linked from the same page.

Both pages are **static HTML** — no JavaScript rendering, no AJAX, no POSTBACK. All PDF links are plain `<a href>` tags pointing to files at the site root.

**URL patterns:**

- Homepage: `https://kpsc.kar.nic.in/`
- Question papers landing: `https://kpsc.kar.nic.in/questionpaper.html`
- Previous years archive: `https://kpsc.kar.nic.in/PREVIOUS%20YEARS%20QUESTION%20PAPERS.htm`
- Subject code mapping: `https://kpsc.kar.nic.in/Subject%20code%2011%20to%20573.pdf`
- PDF URL pattern: `https://kpsc.kar.nic.in/<filename>.pdf` (files live at the site root)
  - Example (by subject code): `https://kpsc.kar.nic.in/11.pdf`
  - Example (by exam name): `https://kpsc.kar.nic.in/Paper-2%20(511).pdf`
  - Example (with timestamp): `https://kpsc.kar.nic.in/GENERAL%20KNOWLEDGE%20(PAPER-1)47102012023153107.pdf`

**How to fetch:**

1. GET `https://kpsc.kar.nic.in/questionpaper.html` (or `PREVIOUS%20YEARS%20QUESTION%20PAPERS.htm` for the larger archive).
2. Parse the static HTML for `<a href="...pdf">` links. Links are relative to the site root, so resolve them as `https://kpsc.kar.nic.in/<href>`.
3. For the subject-code archive, download `Subject code 11 to 573.pdf` to map numeric codes to exam/subject names.
4. GET the target PDF URL directly. No auth, no cookies, no form submission required.

```bash
# Enumerate PDF links
curl -s 'https://kpsc.kar.nic.in/questionpaper.html' | grep -oP 'href="\K[^"]+\.pdf'

# Download subject-code mapping
curl -s -o subject_codes.pdf 'https://kpsc.kar.nic.in/Subject%20code%2011%20to%20573.pdf'

# Download a paper
curl -s -o paper.pdf 'https://kpsc.kar.nic.in/11.pdf'
```

**Verify:**

- Confirm `Content-Type: application/pdf` and non-empty body.
- **Text-based PDFs** (e.g. `11.pdf`): `pdftotext` extracts text. Proven markers for `11.pdf`: "DO NOT OPEN THIS QUESTION BOOKLET UNTIL YOU ARE ASKED TO DO SO", "SUBJECT CODE", "SPECIFIC PAPER (PAPER-II)", "Time Allowed: 2 Hours".
- **Image-scan PDFs** (e.g. `Paper-2 (511).pdf`, 40 pages): `pdftotext` returns nothing. Verify via `file` (confirms PDF version + page count) and OCR with `tesseract` on page 1 if content verification is needed.

```bash
file paper.pdf
pdftotext paper.pdf - | head
```

**Access barriers:**

- None. No auth, no captcha, no JS rendering, no rate-limiting observed.
- The alternate domain `kpsc.karnataka.gov.in` does **not** resolve (NXDOMAIN). Use `kpsc.kar.nic.in` only.

**fetch_status:**

- `fetched` — requested paper's PDF is linked on either HTML page and downloads successfully (proven for subject code 11 and Paper-2 code 511).
- `not_found` — requested exam/subject code is not among the ~476 PDFs in the archive.
- `source_gap` — exam exists but KPSC has not published its question paper.

**Disambiguation / known gaps:**

- Archive organized by **subject code**, not by exam name (KAS, Gazetted Probationers, etc.). To find a specific exam's papers, consult the `Subject code 11 to 573.pdf` mapping file first.
- The `questionpaper.html` page and the `PREVIOUS YEARS QUESTION PAPERS.htm` page have **overlapping but not identical** content. Check both.
- `kpsc.karnataka.gov.in` is dead — do not use it. The only live official domain is `kpsc.kar.nic.in`.
- Site is generated by Microsoft FrontPage and uses `windows-1252` charset. URL-encode spaces in filenames (`%20`).

---

#### Kerala PSC (Kerala) — Drupal 8 Views archive (FETCHABLE)

**What this source offers:**

Kerala PSC publishes previous question papers and answer keys as **directly downloadable PDFs** on its official Drupal 8 site `keralapsc.gov.in`. Four listing pages, each a Drupal Views table with direct PDF download links:

1. **`/previous-question-papers`** — OMR-based exam question papers. Has a year filter dropdown (2014–2026). Table columns: Year, Title (exam/post name), Body (Paper Code + Date of Test), Download.
2. **`/question-paper-descriptive-exam`** — descriptive exam question papers. Recent papers (2026-06, 2026-03).
3. **`/answerkey_omrexams`** — answer keys for OMR exams. Direct PDFs.
4. **`/answerkey_onlineexams`** — answer keys for online exams.

All pages are **server-rendered Drupal HTML** with direct PDF links. No JavaScript rendering required to extract links.

**URL patterns:**

- Homepage: `https://www.keralapsc.gov.in/`
- Previous Question Papers (OMR): `https://www.keralapsc.gov.in/previous-question-papers`
- Question Paper Descriptive Exam: `https://www.keralapsc.gov.in/question-paper-descriptive-exam`
- Answer Key OMR: `https://www.keralapsc.gov.in/answerkey_omrexams`
- Answer Key Online: `https://www.keralapsc.gov.in/answerkey_onlineexams`
- PDF URL pattern: `https://www.keralapsc.gov.in/sites/default/files/<year-month>/<filename>.pdf`
  - Example: `/sites/default/files/2018-08/175-2016.pdf` (Paper Code 175/2016, Tradesman Automobile Mechanic)
  - Example: `/sites/default/files/2026-06/8_1.pdf` (descriptive exam, June 2026)
  - Example: `/sites/default/files/2026-07/AnswerKey%20064-2026.pdf` (answer key, July 2026)
- Year filter: `?tid=<year_id>` (e.g. `?tid=232` for 2024). The year IDs are option values in the `<select name="tid">` dropdown on the listing page.

**How to fetch:**

1. GET `https://www.keralapsc.gov.in/previous-question-papers` (for OMR exams) or `/question-paper-descriptive-exam` (for descriptive exams).
2. Parse the Drupal Views table HTML. Each row has: Year (`views-field-field-year-category`), Title (`views-field-title`), Paper Code + Date (`views-field-body`), Download link (`views-field-field-file` → `<a href="...pdf">`).
3. To filter by year, either parse the `<select name="tid">` options and append `?tid=<year_id>` to the URL, or filter client-side after downloading the full page.
4. GET the PDF URL directly. No auth, no cookies, no form POST required.

```bash
# Enumerate PDF links
curl -s 'https://www.keralapsc.gov.in/previous-question-papers' | grep -oP 'sites/default/files/\K[^"]+\.pdf'

# Filter by year
curl -s 'https://www.keralapsc.gov.in/previous-question-papers?tid=232' | grep -oP 'sites/default/files/\K[^"]+\.pdf'

# Download a paper
curl -s -o paper.pdf 'https://www.keralapsc.gov.in/sites/default/files/2018-08/175-2016.pdf'
```

**Verify:**

- Confirm `Content-Type: application/pdf` (or check via `file` command) and non-empty body.
- **Text-based PDFs** (e.g. `175-2016.pdf`): `pdftotext` extracts text, though font encoding may produce garbled characters. The PDF is valid and real.
- **Image-scan PDFs** (e.g. `8_1.pdf`, 2026-06): `pdftotext` returns nothing (0 text pages). Verify via `file` (confirms PDF version) and OCR if content verification is needed.
- Proven: `175-2016.pdf` → PDF v1.3, 1 page, 1,490,772 bytes. `8_1.pdf` → PDF v1.4, 1,221,004 bytes (image scan).

```bash
file paper.pdf
pdftotext paper.pdf - | head
```

**Access barriers:**

- None. No auth, no captcha, no JS rendering. Drupal Views pages are fully server-rendered.
- Site uses `www.keralapsc.gov.in`; the bare `keralapsc.gov.in` also works but redirects to `www`.

**fetch_status:**

- `fetched` — requested paper is listed on one of the four pages with a direct PDF link (proven for Paper Code 175/2016 and descriptive exam 8_1.pdf).
- `not_found` — requested year/exam is not in the listing (check the year filter dropdown for available years).
- `source_gap` — exam/year exists but no PDF download link is attached to the row.
- `listing_only` — a row exists but the Download column is empty.

**Disambiguation / known gaps:**

- Kerala PSC uses **Paper Codes** (e.g. `175/2016`) as the primary identifier, not exam names alone. The Paper Code appears in the Body column and in the PDF filename.
- Answer keys are published on **separate pages** (`/answerkey_omrexams`, `/answerkey_onlineexams`), not bundled in the question paper PDF. Fetch them as sibling resources when available.
- The year filter dropdown lists years 2014–2026. Papers before 2014 may not be available.
- Site is bilingual (English + Malayalam). The English listing is at `/previous-question-papers`; Malayalam at `/ml/previous-question-papers`. Use the English listing for PDF discovery.

---

#### APPSC (Andhra Pradesh) — portal question-papers page (FETCHABLE, LIMITED COVERAGE)

**What this source offers:**

APPSC publishes previous exam question papers as **image-scan PDFs** via a public question-papers archive on the **portal subdomain** `portal-psc.ap.gov.in`. The page `HomePages/QuestionPapersofVariousNotifications.aspx` is publicly accessible (HTTP 200, no auth) and lists ~122–130 direct PDF links served from the main domain `psc.ap.gov.in/Documents/...`. Coverage spans Group-I Screening Test (prelims, notification 36/2016), Group-I/II/III Mains (2018, 2022, 2023 cycles), AEE Screening Test, Panchayat Secretary, and other notifications.

**Important caveat on the main domain:** the main `psc.ap.gov.in` content paths (`/QuestionPapers`, `/PreviousPapers`, `/Account/Login.aspx`) remain **login-gated / broken** (404 or 302-to-404). The homepage `psc.ap.gov.in/` is a 4,922-byte shell with links to subdomains but no question-paper links. Only the **portal question-papers page** is public; do not rely on `psc.ap.gov.in` content paths directly.

**URL patterns:**

- Landing page (public archive): `https://portal-psc.ap.gov.in/HomePages/QuestionPapersofVariousNotifications.aspx`
- PDF host: `https://psc.ap.gov.in/Documents/NotificationDocuments/<filename>.pdf`
- Example: `https://psc.ap.gov.in/Documents/NotificationDocuments/Group-I Services Screening Test Not.no. 36-2016.pdf` (Group-I Screening Test / prelims, notification 36/2016, exam held 2017)

**How to fetch:**

1. GET `https://portal-psc.ap.gov.in/HomePages/QuestionPapersofVariousNotifications.aspx`. Static server-rendered HTML (no auth, no JS rendering required). Lists ~122–130 PDF links of the form `psc.ap.gov.in/Documents/NotificationDocuments/<filename>.pdf`, grouped by notification.
2. Filter links by exam/notification in the link text (e.g. "Group-I Screening Test", "Group-I Services Mains", "AEE Screening Test", "Panchayat Secretary"). Each link embeds the notification number (e.g. "36/2016") and paper name.
3. GET `https://psc.ap.gov.in/Documents/NotificationDocuments/<filename>.pdf` directly. No auth, no CAPTCHA, no POSTBACK. Response is the PDF (proven: HTTP 200, `application/pdf`, 8.32 MB, 48 pages).

```bash
# Enumerate PDF links from the portal question-papers page
curl -s 'https://portal-psc.ap.gov.in/HomePages/QuestionPapersofVariousNotifications.aspx' \
  | grep -oP 'Documents/NotificationDocuments/\K[^"]+\.pdf'

# Download a paper
curl -s -o paper.pdf 'https://psc.ap.gov.in/Documents/NotificationDocuments/Group-I Services Screening Test Not.no. 36-2016.pdf'
```

**Verify:**

APPSC question papers are **image-based PDFs** (Producer `ilovepdf.com`, no text layer). `pdftotext` returns nothing.
- Confirm `Content-Type: application/pdf` and non-empty body (proven: ~8.32 MB, 48 pages).
- Match the link text from the listing (notification number + paper name) to the requested exam.
- OCR page 1 with `tesseract` and confirm the booklet header matches the requested exam. Proven markers for the Group-I Screening Test (36/2016): "General Studies and Mental Ability" (bilingual English + Telugu), "Time : 150 Minutes", "Max. Marks : 150", "150 questions", "Each question carries 1 mark", Series "GS/EP/100 | 2017", "Test Booklet is printed in four (4) Series".

```bash
file paper.pdf
pdftotext paper.pdf - | head   # returns nothing — image-based, expected
pdftoppm -f 1 -l 1 -r 300 paper.pdf page && tesseract page-1.ppm stdout | head
# Or: pdftoppm -f 1 -l 1 -r 300 paper.pdf page && read page-1.ppm directly if image-capable model
```

**Access barriers:**

- **None for the portal question-papers page.** `portal-psc.ap.gov.in/HomePages/QuestionPapersofVariousNotifications.aspx` is public (HTTP 200, no auth).
- The **main `psc.ap.gov.in` content paths remain login-gated/broken** (`/QuestionPapers`, `/PreviousPapers`, `/Account/Login.aspx` → 404 or 302-to-404). Do not use these paths; use the portal question-papers page instead.
- The portal root `portal-psc.ap.gov.in/Default.aspx` shows login nav links — ignore those and navigate to the `HomePages/QuestionPapersofVariousNotifications.aspx` page directly.

**fetch_status:**

- `fetched` — requested exam/notification is in the portal QP listing and the `psc.ap.gov.in/Documents/...` PDF downloads successfully (proven for Group-I Screening Test 36/2016).
- `source_gap` — requested exam/year is not among the listed notifications (e.g. no more recent Group-I prelims/Screening Test paper than 36/2016 is listed; recent Group-I cycles list only Mains papers).
- `not_found` — requested exam does not exist on the APPSC surface at all.

**Disambiguation / known gaps:**

- **Only one Group-I prelims (Screening Test) paper is listed:** notification 36/2016 (exam held 2017). Group-I Mains papers (2018, 2022, 2023 cycles) are also available. No more recent Group-I prelims paper is listed on this page.
- **Do not use the main `psc.ap.gov.in` content paths** — they are login-gated/broken. The portal question-papers page is the only public surface.
- PDFs are image-based (Producer `ilovepdf.com`, no text layer) — verification relies on link-text + HTTP metadata + OCR, not `pdftotext`, or read page images directly if image-capable model (`pdftoppm` + read tool).
- Do **not** substitute papers from coaching sites or third-party mirrors. If a requested paper is not in the portal listing, report `source_gap` / `not_found` honestly.

---

#### TGPSC / TSPSC (Telangana) — static JSP archive (FETCHABLE, LIMITED COVERAGE)

**What this source offers:**

The Telangana State Public Service Commission has been **renamed from TSPSC to TGPSC** (Telangana Public Service Commission). The old domain `tspsc.gov.in` no longer resolves (NXDOMAIN). The current official site is split across two domains:

- `tgpsc.gov.in` — the portal/application site (OTR, hall tickets, application links).
- `websitenew.tgpsc.gov.in` — the content site (notifications, results, old question papers, syllabus).

The content site hosts an **"Old Question Papers"** page at `/oldquestionp.jsp` — a static JSP page with 21 direct PDF links. PDFs are served via a `/preview/` URL pattern with base64-encoded filenames. No auth, no captcha for question papers. Coverage is limited: only 21 papers, all from the **January 2023 exam cycle** (AE, AEE, AFA, Managers, Technical GrII, AMVI, TPBO) plus one 2015 AEE paper. **No Group-I Prelims/Mains papers** are listed.

**URL patterns:**

- Portal: `https://www.tgpsc.gov.in/`
- Content site: `https://websitenew.tgpsc.gov.in/`
- Old Question Papers: `https://websitenew.tgpsc.gov.in/oldquestionp.jsp`
- Results, Keys and OMR: `https://websitenew.tgpsc.gov.in/resukeyomr.jsp`
- PDF URL pattern: `https://websitenew.tgpsc.gov.in/preview/<base64-encoded-filename>r95v17a0y2d8i13v`
  - The base64 segment decodes to a path like `PRESSNOTE/2DGM_GS_QP20230121161006.pdf`.
  - The suffix `r95v17a0y2d8i13v` is **constant** across all links.
  - Example: `https://websitenew.tgpsc.gov.in/preview/UFJFU1NOT1RFLzJER01fR1NfUVAyMDIzMDEyMTE2MTAwNi5wZGY=r95v17a0y2d8i13v` → "General Studies And General Abilities 21st Feb Shift 1 Actual"

**How to fetch:**

1. GET `https://websitenew.tgpsc.gov.in/oldquestionp.jsp`.
2. Parse the static HTML for `<a href="https://websitenew.tgpsc.gov.in/preview/...">` links. Each link's text describes the exam + paper + shift.
3. GET the `/preview/` URL directly. No auth, no cookies, no form submission required for question papers.
4. (Answer keys) `/keys` requires login — do not attempt. Report `auth_required` for answer key requests.

```bash
# Enumerate preview PDF links
curl -s 'https://websitenew.tgpsc.gov.in/oldquestionp.jsp' | grep -oP 'preview/\K[^"]+'

# Download a paper
curl -s -o paper.pdf 'https://websitenew.tgpsc.gov.in/preview/<base64-segment>r95v17a0y2d8i13v'
```

**Verify:**

- Confirm non-empty body and PDF content (the `/preview/` endpoint returns `application/pdf` or a PDF binary).
- **Text-based PDFs**: `pdftotext` extracts text. Proven markers for the GS paper: "TELANGANA STATE PUBLIC SERVICE COMMISSION", "Question Paper Name: GENERAL STUDIES AND GENERAL ABILITIES 21st Feb Shift 1 Actual", "Duration: 150", "Total Marks: 150".
- Proven: `tgpsc_qp.pdf` → PDF v1.4, 6,745,159 bytes, text extractable.

```bash
file paper.pdf
pdftotext paper.pdf - | head
```

**Access barriers:**

- **Question papers: none.** No auth, no captcha, no JS rendering. Static JSP HTML with direct PDF links.
- **Answer keys (`/keys`): `auth_required`.** The `/keys` page redirects to `/login`. Do not bypass.
- `tspsc.gov.in` and `old.tspsc.gov.in` — both NXDOMAIN. Do not use.
- One link on the old question papers page points to `http://old.tspsc.gov.in/OldQuestionPapers/AEE-CIVIL-8-2015/AEE-GS-QP.pdf` — this is **dead** (NXDOMAIN).

**fetch_status:**

- `fetched` — requested exam is listed on `oldquestionp.jsp` and the `/preview/` PDF downloads successfully (proven for GS & General Abilities 21st Feb Shift 1).
- `not_found` — requested exam/year is not among the 21 papers listed (e.g. Group-I Prelims is not listed).
- `source_gap` — TGPSC has not published the requested exam's question paper on the old question papers page.
- `auth_required` — for answer key requests (`/keys` requires login).

**Disambiguation / known gaps:**

- **TSPSC has been renamed to TGPSC.** The old domain `tspsc.gov.in` is dead. Always use `websitenew.tgpsc.gov.in` for content and `tgpsc.gov.in` for the portal.
- **Coverage is limited.** The `oldquestionp.jsp` page lists only 21 papers, all from the **January 2023 exam cycle** (AE, AEE, AFA, Managers, Technical GrII, AMVI, TPBO) plus one 2015 AEE paper. **No Group-I Prelims/Mains papers** are listed. No multi-year archive exists on the current site.
- The `/preview/` URL uses base64-encoded filenames. The encoding is standard base64 of the file path (e.g. `PRESSNOTE/<filename>.pdf`). The suffix `r95v17a0y2d8i13v` is constant and can be treated as a fixed token.
- The dead link to `old.tspsc.gov.in` suggests there was a larger archive on the old domain, but it is no longer accessible.
- Do **not** fabricate `/preview/` URLs by encoding arbitrary filenames. Only use links discovered from the `oldquestionp.jsp` page HTML.

---

#### TNPSC (Tamil Nadu) — static archive (PARTIAL)

**What this source offers:**

TNPSC hosts two question-paper pages on its official site `tnpsc.gov.in`, both **static HTML tables** with direct PDF links:

1. "Previous Year Question Papers": the English previous-questions page (title "TNPSC - Previous year Question papers"). Note: the bare `previous-questions.html` path returns "resource removed" — use the English previous-questions page reached from the homepage nav.
2. "Objective Type (Without Tentative Answer Key)": `English/answerkeys.aspx` (title "TNPSC - Objective Type (Without Tentative Answer Key)").

No POSTBACK, no AJAX.

**Known coverage (as of iteration-1):**
- "Previous Year Question Papers" lists **Group-I (Preliminary) only for 2011** (General Knowledge → `IDPC.pdf`). Group-I Main GS Paper-1/2 are also 2011 only.
- "Objective Type (Without Tentative Answer Key)" lists 2024 papers for **other exams**: Group-IC Service, Combined Technical Services, Special Competitive Examination. **No Group-I Preliminary 2024.**

**URL patterns:**

- Homepage: `https://tnpsc.gov.in/`
- Previous Year Question Papers: English previous-questions page (reached from homepage nav; bare `previous-questions.html` returns "resource removed")
- Objective Type (Without Tentative Answer Key): `https://tnpsc.gov.in/English/answerkeys.aspx`
- PDF URL pattern: `../static_pdf/dptpreviousyearquestion/<filename>.pdf` (e.g. `IDPC.pdf`)

**How to fetch:**

1. GET the English previous-questions page (reached from the homepage nav) for Group-I and older papers.
2. GET `https://tnpsc.gov.in/English/answerkeys.aspx` for 2024 objective-type papers.
3. Parse the static HTML tables for direct PDF links (`../static_pdf/...`).
4. GET the PDF URL directly. No auth, no POSTBACK, no AJAX.

```bash
# Enumerate PDF links
curl -s 'https://tnpsc.gov.in/English/answerkeys.aspx' | grep -oP 'static_pdf/\K[^"]+\.pdf'

# Download a paper
curl -s -o paper.pdf 'https://tnpsc.gov.in/static_pdf/dptpreviousyearquestion/IDPC.pdf'
```

**Verify:**

- Confirm HTTP 200 + `Content-Type: application/pdf` + non-empty body.
- Extract text with `pdftotext` and confirm the exam/year/subject header matches the request.

```bash
file paper.pdf
pdftotext paper.pdf - | head
```

**Access barriers:**

- None. No auth, no captcha, no JS rendering. Static HTML tables with direct PDF links.
- The bare `previous-questions.html` path returns "resource removed" — use the English previous-questions page reached from the homepage nav.

**fetch_status:**

- `fetched` — requested paper is listed with a `static_pdf/...` link (e.g. Group-I Prelims 2011).
- `source_gap` — requested exam/year is not in either table (proven for Group-I Prelims 2024).
- `listing_only` — a row exists but the PDF link is missing/broken.

**Disambiguation / known gaps:**

- **Do not** report "no archive exists" for TNPSC. An archive exists; it is just partial. The stub's old "TNPSC has no archive" claim is falsified.
- Group-I Preliminary papers are only available for 2011. No Group-I Preliminary 2024 is listed.

---

### West & Central India

---

#### GPSC (Gujarat) — ASP.NET WebForms static tables (FETCHABLE)

**What this source offers:**

GPSC publishes **question papers (prelims + mains)** and **provisional answer keys (prelims with master question paper)** as directly downloadable PDFs. Three separate listing pages cover different paper types, each with hundreds of entries. Papers are organized by advertisement number and exam name, not by calendar year alone.

**URL patterns:**

- **Listing pages:**
  - Prelims with answer key: `https://gpsc.gujarat.gov.in/QuestionPaper?name=questionpaperprelimwithans`
  - Prelims without answer: `https://gpsc.gujarat.gov.in/QuestionPaper?name=questionpaperprelimwithoutans`
  - Mains: `https://gpsc.gujarat.gov.in/QuestionPaper?name=questionpapermains`
  - Answer keys (standalone): `https://gpsc.gujarat.gov.in/StageDocument?name=answerkey`
- **PDF URLs:** `https://gpsc.gujarat.gov.in/Documents/AdvertismentDocument/<prefix>-<advt_nums>-<year>.pdf`
  - `PAK-` = Provisional Answer Key (Prelim) with Master Question Paper
  - `QP-` = Question Paper (Prelim, without answer)
  - `QPM-` / `QSM-` = Question Paper (Main)

**How to fetch:**

1. GET the appropriate listing page (e.g. `QuestionPaper?name=questionpaperprelimwithoutans`). Page is a static HTML table — no postback needed. Pages are large (344 KB–3.8 MB).
2. Parse the HTML table rows. Each row contains: exam name (`<td>`), advertisement number (`<td>`), publish date (`<td>`), and a PDF link (`<a href='/Documents/AdvertismentDocument/...pdf' aria-label='Question Paper (Prelim) - <advt>'>`).
3. Match the requested exam/year/subject by filtering on the exam name text and advertisement number in the table cells.
4. GET the PDF URL directly. No auth, no cookies, no captcha.

```bash
# Enumerate PDF links
curl -s 'https://gpsc.gujarat.gov.in/QuestionPaper?name=questionpaperprelimwithoutans' \
  | grep -oP 'Documents/AdvertismentDocument/\K[^"]+\.pdf'

# Download a paper
curl -s -o paper.pdf 'https://gpsc.gujarat.gov.in/Documents/AdvertismentDocument/QP-_117,120-2025-26.pdf'
```

**Verify:**

- **Text-based PDFs.** Confirm HTTP 200 + `Content-Type: application/pdf` + non-empty body, then extract text with `pdftotext`.
- Proven markers for `PAK-26-2025-26.pdf`: "PROVISIONAL ANSWER KEY", "Advertisement No. 26/2025-26", "Preliminary Test Held On 23-06-2026". Bilingual (English + Gujarati).
- Proven markers for `QP-_117,120-2025-26.pdf`: question text with numbered questions (medical/science content).

```bash
file paper.pdf
pdftotext paper.pdf - | head
```

**Access barriers:**

- None. No auth, no captcha, no JS-rendering. All PDF links are in server-rendered HTML tables.
- `gpsc-ojas.gujarat.gov.in` is a sibling recruitment portal — not needed for question papers.

**fetch_status:**

- `fetched` — requested exam/advt paper is listed and the PDF downloads successfully.
- `not_found` — requested exam/advt/year is not in the listing table.
- `source_gap` — listing page exists but no PDF link is attached to the row.

**Disambiguation / known gaps:**

- GPSC organizes papers by **advertisement number**, not calendar year. The same advertisement number may cover multiple posts. Match on both exam name text and advertisement number.
- A single PDF may contain question papers for multiple advertisement numbers (e.g. `QP-_117,120-2025-26.pdf` covers advt 117 and 120).
- The "prelimwithans" page publishes **provisional** answer keys with master question papers — these are the question papers bundled with answers, not separate answer keys.

---

#### RPSC (Rajasthan) — ASP.NET WebForms static tables (FETCHABLE)

**What this source offers:**

RPSC publishes **previous question papers** and **model answer keys** as directly downloadable PDFs. The question papers page embeds all PDF links (1439 unique) in static HTML — no postback required to enumerate them. Answer keys (1395 unique) are on a separate page. Coverage spans 2002–2026 across dozens of exam types (RAS, School Lecturer, Agriculture Officer, ARO, etc.).

**URL patterns:**

- **Listing pages:**
  - Question papers: `https://rpsc.rajasthan.gov.in/quespapers`
  - Answer keys: `https://rpsc.rajasthan.gov.in/answerkeys`
- **PDF URLs:**
  - Question papers: `https://rpsc.rajasthan.gov.in/Static/PreviousQuestionPaper/<UUID>.pdf`
  - Answer keys: `https://rpsc.rajasthan.gov.in/Static/AnswerKeys/<UUID>.pdf`
- Filenames are UUID-format (e.g. `CF8B60D5-1480-4ACB-8875-A4E8A4D22DCD.pdf`) — no human-readable names. The exam name, year, and subject are in the table row text, not the filename.

**How to fetch:**

1. GET `https://rpsc.rajasthan.gov.in/quespapers` with a browser User-Agent. **Use GET, not HEAD** — HEAD returns 404 (server quirk). Page is ~1.7 MB and contains all 1439 PDF links in a static HTML table.
2. Parse the table rows. Each row contains: exam name (`<td>`), paper description (`<td>`), and a PDF link (`<a href='Static/PreviousQuestionPaper/<UUID>.pdf'>`).
3. Match the requested exam/year/subject by filtering on the exam name and paper description text in the table cells.
4. GET the PDF URL directly. No auth, no cookies, no captcha.
5. For answer keys, repeat with `answerkeys` page and `Static/AnswerKeys/<UUID>.pdf` pattern.

```bash
# Enumerate PDF links (use GET, never HEAD — HEAD returns 404)
curl -s -A 'Mozilla/5.0' 'https://rpsc.rajasthan.gov.in/quespapers' \
  | grep -oP 'Static/PreviousQuestionPaper/\K[^"]+\.pdf'

# Download a paper
curl -s -A 'Mozilla/5.0' -o paper.pdf 'https://rpsc.rajasthan.gov.in/Static/PreviousQuestionPaper/<UUID>.pdf'
```

**Verify:**

- **Question paper PDFs are image scans** (Creator "HP Scan", no text layer). `pdftotext` returns nothing. Verify via:
  - Confirm `Content-Type: application/pdf` and non-empty body (proven: ~19.8 MB).
  - OCR page 1 with `tesseract` (200 dpi) and confirm the booklet header. Proven markers: "Lecturer & Coach (Sec. Edy. Deptt.) Comp. Exam - 2025", "Physical Education", "No. of Questions in Booklet: 130", "Maximum Marks: 260".
- **Answer key PDFs are text-based.** `pdftotext` works. Proven markers: "RAJASTHAN PUBLIC SERVICE COMMISSION, AJMER", "Model Answer Key Issue Date: 10-07-2026".

```bash
file paper.pdf
pdftotext paper.pdf - | head   # returns nothing for question papers — image scan, expected
pdftoppm -f 1 -l 1 -r 200 paper.pdf page && tesseract page-1.ppm stdout | head
# Or: pdftoppm -f 1 -l 1 -r 200 paper.pdf page && read page-1.ppm directly if image-capable model
```

**Access barriers:**

- **HEAD returns 404 on all pages** — server misconfiguration. Always use GET; the site works fine via GET.
- No auth, no captcha, no JS-rendering. All PDF links are in server-rendered HTML.
- Question paper PDFs are image scans — require OCR for content verification, or read page images directly if image-capable model (`pdftoppm` + read tool).

**fetch_status:**

- `fetched` — requested exam/year/subject paper is listed and the PDF downloads successfully.
- `not_found` — requested exam/year is not in the listing table.
- `source_gap` — listing page exists but no PDF link is attached to the row.

**Disambiguation / known gaps:**

- Filenames are UUIDs — cannot infer exam/year from the URL alone. Must parse the listing HTML to map UUID → exam/year/subject.
- The page has year (2002–2026) and exam name dropdowns that use `__doPostBack` for filtering, but **all links are already in the initial HTML** — no postback needed to enumerate.
- The homepage also shows recent answer key PDFs in a sidebar — these are the same links as on the `answerkeys` page.

---

#### MPPSC (Madhya Pradesh) — CodeIgniter AJAX pagination (FETCHABLE)

**What this source offers:**

MPPSC publishes **previous year question papers** and **answer keys** as directly downloadable PDFs. The listing page is blocked (HTTP 403) but the AJAX pagination endpoint returns the full table with direct PDF links. Papers are organized by exam name and year, with per-subject download links. Coverage includes State Engineering Service, State Eligibility Test, Food Safety Officer, Assistant Registrar, Dental Surgeon, and many more (25 rows per page, multiple pages).

**URL patterns:**

- **Listing page (blocked, returns shell only):** `https://mppsc.mp.gov.in/Oldquestionpaper`
- **AJAX data endpoint:** `POST https://mppsc.mp.gov.in/Oldquestionpaper/ajaxPaginationData/<page_num>` with form data `page=<page_num>`
- **PDF URLs:** `https://mppsc.mp.gov.in/uploads/oldquestionpaper/<descriptive_filename>.pdf`
- **Answer keys:** same pattern at `https://mppsc.mp.gov.in/Answer/ajaxPaginationData/<page_num>`
- Filenames are human-readable (e.g. `General_Studies_and_Civil_Engineering_Paper_2025.pdf`).

**How to fetch:**

1. POST to `https://mppsc.mp.gov.in/Oldquestionpaper/ajaxPaginationData/0` with form data `page=0` and headers:
   - `User-Agent: <browser UA>` (required — site blocks non-browser agents)
   - `Referer: https://mppsc.mp.gov.in/Oldquestionpaper`
   - `X-Requested-With: XMLHttpRequest`
   - `Accept: */*`
2. Response is an HTML table with columns: S.NO, Title (exam name), Year, Downloads (list of `<a>` links per subject/paper).
3. Paginate by incrementing the page number: `ajaxPaginationData/1`, `ajaxPaginationData/2`, etc. Each page has 25 rows.
4. Match the requested exam/year/subject by filtering on the Title and Year columns.
5. GET the PDF URL directly. PDFs are accessible without cookies or special headers.

```bash
# Fetch AJAX data (browser User-Agent required — site blocks non-browser agents)
curl -s -X POST 'https://mppsc.mp.gov.in/Oldquestionpaper/ajaxPaginationData/0' \
  -A 'Mozilla/5.0' \
  -H 'Referer: https://mppsc.mp.gov.in/Oldquestionpaper' \
  -H 'X-Requested-With: XMLHttpRequest' \
  -H 'Accept: */*' \
  -d 'page=0'

# Download a paper (no special headers needed for PDFs)
curl -s -o paper.pdf 'https://mppsc.mp.gov.in/uploads/oldquestionpaper/General_Studies_and_Civil_Engineering_Paper_2025.pdf'
```

**Verify:**

- **Text-based PDFs.** Confirm HTTP 200 + `Content-Type: application/pdf` + non-empty body, then extract text with `pdftotext`.
- Proven markers for `General_Studies_and_Civil_Engineering_Paper_2025.pdf`: "RSAE/2025/C", "Question Booklet Sl. No.", "GENERAL STUDIES AND CIVIL ENGINEERING", 32 pages.

```bash
file paper.pdf
pdftotext paper.pdf - | head
```

**Access barriers:**

- **The listing page (`Oldquestionpaper`) returns HTTP 403** on both HEAD and GET. The GET returns the site shell (nav + empty `ajaxdata` div) but no content. The actual data is loaded via the AJAX endpoint, which returns 200 with proper headers.
- Required headers for AJAX: `Referer`, `X-Requested-With: XMLHttpRequest`, browser User-Agent.
- PDF files are directly accessible via GET — no cookies or special headers needed.
- `mppsc.nic.in` is dead (DNS failure). Use `mppsc.mp.gov.in` exclusively.

**fetch_status:**

- `fetched` — requested exam/year/subject paper is listed via AJAX and the PDF downloads successfully.
- `not_found` — requested exam/year is not in any AJAX page.
- `source_gap` — exam/year row exists but no PDF link is attached.

**Disambiguation / known gaps:**

- The 403 on the HTML page is a WAF/bot-defense, not a true access denial. The AJAX endpoint is the correct entry point.
- Each exam row may have multiple PDF links (one per subject/paper). Match on the link text (e.g. "CIVIL ENGINEERING", "AGRICULTURAL ENGINEERING") to select the right paper.
- Pagination: 25 rows per page. Total page count is not returned — paginate until empty rows.

---

#### CGPSC (Chhattisgarh) — PHP static list, model answers only (PARTIAL)

**What this source offers:**

CGPSC publishes **model answers (answer keys)** as directly downloadable PDFs. There is **no question paper page** — CGPSC does not publish question papers on its website. The model answer page has a static HTML list with ~80+ PDF links covering State Service, Civil Judge, Engineering Service, and other exams from 2020–2025.

**URL patterns:**

- **Listing page:** `https://psc.cg.gov.in/Modelanswer.php`
- **PDF URLs:** `https://psc.cg.gov.in/PDFs/MODEL_ANSWER/<EXAM_NAME>_<YEAR>_<TYPE>_(<DATE>).pdf`
  - `<TYPE>` is either `MODEL_ANSWER` or `AMENDED_MODEL_ANSWER`
- No question paper URL pattern exists.

**How to fetch:**

1. GET `https://psc.cg.gov.in/Modelanswer.php` with `Accept-Encoding: gzip` (or `--compressed`). **HEAD returns 200 with Content-Length 0** — must use GET with compression to get actual content.
2. Parse the static HTML `<ul>` list. Each `<li>` contains an `<a href='PDFs/MODEL_ANSWER/...pdf'>` with the exam name, year, type, and date in both the filename and link text.
3. Match the requested exam/year by filtering on the link text.
4. GET the PDF URL directly. No auth, no cookies, no captcha.

```bash
# GET with gzip (HEAD returns 200 with Content-Length 0 — must use GET with compression)
curl -s --compressed 'https://psc.cg.gov.in/Modelanswer.php' | grep -oP 'PDFs/MODEL_ANSWER/\K[^"]+\.pdf'

# Download a model answer
curl -s -o answer.pdf 'https://psc.cg.gov.in/PDFs/MODEL_ANSWER/<filename>.pdf'
```

**Verify:**

- **Model answer PDFs are image scans** (no text layer). `pdftotext` returns nothing. Verify via:
  - Confirm `Content-Type: application/pdf` and non-empty body (proven: ~9.4 MB, 5 pages, A4).
  - OCR page 1 with `tesseract` and confirm the document header. Proven markers: "www.psc.cg.gov.in", "23/02/2026", State Service Exam 2025 Prelims (Hindi text).

```bash
file answer.pdf
pdftotext answer.pdf - | head   # returns nothing — image scan, expected
pdftoppm -f 1 -l 1 -r 300 answer.pdf page && tesseract page-1.ppm stdout | head
# Or: pdftoppm -f 1 -l 1 -r 300 answer.pdf page && read page-1.ppm directly if image-capable model
```

**Access barriers:**

- **HEAD returns 200 with Content-Length 0** — must use GET with `Accept-Encoding: gzip` or `--compressed`.
- No auth, no captcha, no JS-rendering. Static HTML list with direct PDF links.
- Model answer PDFs are image scans — require OCR for content verification, or read page images directly if image-capable model (`pdftoppm` + read tool).

**fetch_status:**

- `source_gap` — for question paper requests. CGPSC does not publish question papers. Report honestly; do not substitute a model answer for a question paper request.
- `fetched` — for model answer (answer key) requests, when the requested exam/year model answer is listed and the PDF downloads successfully.
- `not_found` — requested exam/year model answer is not in the list.

**Disambiguation / known gaps:**

- **CGPSC does not publish question papers.** Only model answers (answer keys) are available. A request for a CGPSC question paper is a `source_gap` — do not fabricate or substitute.
- Both original and amended model answers may exist for the same exam. The amended version (`AMENDED_MODEL_ANSWER`) is the revised/corrected one.
- `psc.cg.gov.in` is the correct domain. The site runs PHP on Microsoft IIS.

---

#### MPSC (Maharashtra) — React SPA shell (SOURCE GAP via HTTP)

**What this source offers:**

The MPSC site is a **create-react-app single-page application**. The server-rendered HTML is only `<div id="root"></div>` plus webpack JS/CSS chunk tags (~4.6 KB shell). No navigation links, no question-paper listing, no PDF references are present in static HTML — all content renders client-side via JavaScript.

**URL patterns:**

- Homepage: `https://mpsc.gov.in/`

**How to fetch:**

None via static HTTP. A headless browser would be required to render the site — out of scope for this skill's fetch flow.

**Verify:**

N/A — no content accessible to verify via static HTTP.

**Access barriers:**

- Site is a client-rendered SPA. No server-rendered links, no question-paper listing, no PDF references in static HTML.
- A headless browser would be required to render the site — out of scope.

**fetch_status:**

- `source_gap` — no crawlable direct-download path exists via HTTP. Report honestly; do not fabricate a PDF URL. (Proven by iteration-1: `200 text/html 4661` SPA shell.)

**Disambiguation / known gaps:**

- The gap is in **fetchability via static HTTP**, not necessarily in existence of an archive. The SPA may render question-paper links client-side, but this cannot be verified without a headless browser.

---

## General fallback (states not in the table above)

Most Indian state PSCs are now documented with concrete fetch mechanisms above. For any state **not** listed in the "Identify the state" table (e.g. Manipur, Tripura, Nagaland, Mizoram, Meghalaya, Sikkim, Arunachal Pradesh, Goa, Himachal Pradesh, Jammu & Kashmir, Ladakh):

1. Identify the official commission site (typically `<state>psc.gov.in` or `<state>psc.nic.in`).
2. GET the homepage and look for a "previous question papers" / "question papers" / "old question papers" section in server-rendered HTML.
3. If a direct PDF download link is available, fetch and verify it (HTTP 200 + expected `Content-Type` + non-empty body).
4. If the site is a client-rendered SPA (empty `<div id="root">` shell, no server-rendered links), report `source_gap`.
5. If the site lists papers but requires candidate login / admit-card credentials, report `auth_required`.
6. If the site lists papers but provides no direct download link, report `listing_only`.
7. If the requested year/session does not exist on the official surface, report `not_found`.

Do **not** assume "no archive" without checking. Several state PSCs that were assumed to have no archive (TNPSC) were proven to host partial archives by iteration-1 blind runners. Probe before concluding.

## Known official PSC sites (all documented states)

| State | Commission | Official site | Mechanism |
|-------|-----------|---------------|----------|
| Bihar | BPSC | `bpsc.bihar.gov.in` | WordPress admin-ajax tree (FETCHABLE) |
| Uttar Pradesh | UPPSC | `uppsc.up.nic.in` | ASP.NET WebForms POSTBACK (PARTIAL) |
| Tamil Nadu | TNPSC | `tnpsc.gov.in` | static HTML tables (PARTIAL) |
| Maharashtra | MPSC | `mpsc.gov.in` | React SPA shell (SOURCE GAP via HTTP) |
| Karnataka | KPSC | `kpsc.kar.nic.in` | static HTML archive (FETCHABLE) |
| Kerala | Kerala PSC | `www.keralapsc.gov.in` | Drupal 8 Views archive (FETCHABLE) |
| Andhra Pradesh | APPSC | `portal-psc.ap.gov.in` / `psc.ap.gov.in` | portal question-papers page (FETCHABLE, LIMITED) |
| Telangana | TGPSC | `websitenew.tgpsc.gov.in` | static JSP archive (FETCHABLE, LIMITED) |
| West Bengal | WBPSC | `psc.wb.gov.in` | JSP static HTML + Download endpoint (FETCHABLE) |
| Jharkhand | JPSC | `jpsc.gov.in` | PHP two-step POST form (FETCHABLE) |
| Odisha | OPSC | `opsc.gov.in` | ASP.NET WebForms postback (SOURCE GAP via HTTP) |
| Gujarat | GPSC | `gpsc.gujarat.gov.in` | ASP.NET static tables (FETCHABLE) |
| Rajasthan | RPSC | `rpsc.rajasthan.gov.in` | ASP.NET static tables (FETCHABLE) |
| Madhya Pradesh | MPPSC | `mppsc.mp.gov.in` | CodeIgniter AJAX pagination (FETCHABLE) |
| Chhattisgarh | CGPSC | `psc.cg.gov.in` | PHP static list, model answers only (PARTIAL) |
| Punjab | PPSC | `ppsc.gov.in` | ASP.NET WebForms postback (LISTING ONLY) |
| Uttarakhand | UKPSC | `psc.uk.gov.in` | multi-domain, all broken (SOURCE GAP) |
| Haryana | HPSC | `hpsc.gov.in` | DNN static HTML (FETCHABLE) |
| Assam | APSC | `apsc.nic.in` | PHP static HTML (FETCHABLE) |

## Metadata contract

Every result returns the fields defined in `OBJECTIVE.md`. The `fetch_status` field MUST use the canonical enum — do not invent statuses.

| Field | Required | Notes |
|-------|----------|-------|
| `title` | yes | Human-readable paper title |
| `exam` | yes | Exam family / commission + exam name |
| `year` | yes | Year or session |
| `state` | yes | Canonical state name |
| `session` | | Shift / date variant when relevant |
| `paper` | | Paper 1 / GS I / etc. |
| `subject` | | GS / Optional subject |
| `medium` | | English / Hindi / bilingual |
| `source_url` | yes | Direct download URL when available |
| `landing_url` | yes | Official page where the link was discovered |
| `local_path` | | Path where Buddy saved the file, if downloaded |
| `format` | yes | PDF, ZIP, etc. |
| `fetch_status` | yes | one of `fetched`, `source_gap`, `listing_only`, `auth_required`, `paywall`, `not_found` |
| `verification_status` | yes | `verified`, `unreachable`, `unexpected_type` |
| `extraction_date` | yes | ISO date of discovery |
| `notes` | | Caveats (e.g. "image scan — OCR-verified", "Answer key in same PDF") |

### `fetch_status` enum (canonical — do not deviate)

- `fetched` — downloaded to local path. **Use `fetched`, never `success`.**
- `source_gap` — official site has no public download for the requested item.
- `listing_only` — listing exists but no direct download link.
- `auth_required` — requires login / admit credentials.
- `paywall` — requires payment.
- `not_found` — requested year/session/subject does not exist.

### Verification rules

- **Text-based PDFs:** confirm HTTP 200 + `Content-Type: application/pdf` + non-empty body, then extract text with `pdftotext` and confirm the exam/year/subject header matches the request.
- **Image-scan PDFs (e.g. BPSC, JPSC, RPSC question papers, CGPSC model answers, HPSC, APSC):** `pdftotext` returns nothing or only a watermark. Verify via one of: (a) `pdftoppm` to split PDF into page images, then read the images directly if you are an image-capable model; (b) `tesseract` OCR on page 1; (c) filename + link-text + HTTP metadata. Match the booklet header / series code / marks / question count. Do not treat an empty text layer as a failure. For HPSC and APSC, OCR may also fail on light scans — rely on filename + link-text + HTTP metadata (or read the page image directly if image-capable).
- **`verification_status` values:** `verified` (HTTP 200 + expected type + non-empty + content matches), `unreachable` (non-200 / connection failure / DNS failure), `unexpected_type` (wrong Content-Type or empty body).

## Guardrails

- **Only official state PSC sites.** The domains in the table above (and their `*.gov.in` / `*.nic.in` siblings) are in scope.
- **No coaching sites, exam portals, or third-party mirrors.** Do not use Vedantu, Allen, Shiksha, Physics Wallah, Gradeup, AffairsCloud, `pscwb.org.in` (third-party WordPress blog about job news), `pscuk.net.in` (commercial site), or any unofficial archive/mirror, even if the official site is a `source_gap`.
- **No auth bypass.** If a resource requires login / admit-card credentials, report `auth_required` and stop. Do not proxy, scrape behind walls, or bypass CAPTCHAs.
- **No paywall bypass.** Report `paywall` and stop.
- **No substitution.** If the requested year/subject is absent, report `source_gap` / `not_found`. Do not substitute a different year, subject, or exam (e.g. do not return a 2025 Asst. Professor paper for a 2022 PCS GS request; do not substitute a CGPSC model answer for a CGPSC question paper request).
- **No fabrication.** If a URL cannot be discovered from the official surface, do not invent one. An honest `source_gap` is always preferred over a hallucinated link. Do not fabricate TGPSC `/preview/` URLs by encoding arbitrary filenames — only use links discovered from the `oldquestionp.jsp` page HTML.
- **No bulk harvesting.** Use targeted per-year/per-paper requests; do not scrape entire multi-year archives in one shot.
- **Never use HEAD** on RPSC, MPPSC, or CGPSC — all return misleading status codes. Always use GET.
- **Always send a browser User-Agent** — MPPSC blocks non-browser agents.
- **Always send `Accept-Encoding: gzip`** (or use `--compressed`) — CGPSC returns 0 bytes without it.
