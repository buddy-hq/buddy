# PDF reader end-to-end verification — 2026-08-08

## Scope

Manual verification of the current `pdf-reader` branch in the already-running Electron window `Buddy Dev — pdf-reader` on the localhost dev server. This log is grounded in the current implementation and on-disk fixtures; the PDF design docs are treated as non-authoritative where they differ from code.

## Environment

- App: `Buddy Dev — pdf-reader` (Electron, existing dev-server window; no app startup performed intentionally).
- Branch: `pdf-reader`.
- Test start: 2026-08-08, Asia/Kolkata.
- Current open source: `/Users/prashantbhudwal/Documents/Buddy/Inbox/CCEM_COMPULSORYI_2024.pdf`.

## On-disk fixture inventory

The fixture pool includes text-heavy textbooks and exams, long books, worksheets, slide/deck PDFs, and PDFs stored under nested `resources/` directories. Candidate sources selected for manual coverage will be recorded with their absolute path, page count, and observed characteristics before each UI run.

## Coverage matrix

| Area | Status | Evidence / notes |
| --- | --- | --- |
| Source selection from Quick chats → Sources | Pass | Sources panel reported 118 sources; search/open worked for several PDF entries. The apparent `states-of-matter-session.pdf` mismatch was investigated and dismissed; see INVESTIGATION-001. |
| Text-heavy / scanned or OCR-like PDF rendering | Pass | CCEM rendered an accessible text layer; UPSC rendered a 56-page scanned Hindi exam image; hecu107 rendered a colorful textbook PDF. |
| Long PDF / continuous scrolling | Pass | NCF-SE-2023 opened at 600 pages and scrolling reached visible `Acronyms`, page 8 of 600. |
| Page navigation, page labels, progress, history | Pass | Single-page previous/next, Go to page, printed label 98 on hecu107, and reading-history back/forward all worked. |
| Outline / table of contents and metadata | Partial | CCEM correctly showed the empty-TOC state; metadata card showed type/layout/page count/fingerprint. A populated outline remains to verify. |
| Search, match options, result navigation | Pass | CCEM search returned 17 results; result navigation reached printed page 8 / physical page 9; case, whole-word, and diacritics controls toggled. |
| Zoom, fit modes, rotation, single-page, two-up | Pass | Zoom increased 63%→70%; Single and Two-up layouts, Go to page, and 90° rotation all visibly changed the reader. |
| Text selection → chat context | Pass | Drag selection exposed Copy/Highlight/Add note/Search selection actions and populated selected passage context in chat. |
| Highlight / annotation create, edit, delete, persistence | Pass | Highlight creation plus style/color/note editing survived CCEM reopen; the temporary annotation was then deleted and the panel was empty. |
| Bookmarks and persistence | Pass | A CCEM page bookmark was visible after reopening the source; it was then deleted as test cleanup. |
| Reader preferences / themes / keyboard help | Pass | Night theme, motion/cursor switches, and keyboard-shortcuts modal opened and updated successfully. |
| PDF source switching / cleanup between documents | Pass | Switched among CCEM, UPSC, NCF, hecu107, and the states-of-matter source without a stale previous page remaining after load. |
| Error/password/unsupported-source handling | Observation | UPSC was labelled `Unsupported` in Sources but still opened and rendered as a scanned 56-page PDF; whether that status is intentional needs product clarification. |

## Investigations

### INVESTIGATION-001 — `states-of-matter-session.pdf` appears to open as `states-of-matter-session.mdx`

- Status: Dismissed after reproduction and byte-level verification; this is the selected PDF rendered by PDF.js, not an MDX reader or source-resolution failure.
- Reproduction: In Quick chats, open Sources, search for `states-of-matter-session.pdf`, and click either of the two `Open states-of-matter-session.pdf` results.
- Observed: Each result navigates to its own resource object, and the reader title is `states-of-matter-session.mdx` with `Page 1 of 4`.
- Route evidence: the first result navigated to resource object `01KXTNY9KN6NVP05VYECWWHGRN`; the second source object is `01KYB28EREM59DN2S9V647DBFE`. Both manifests point their `readerPath` at their managed `source/states-of-matter-session.pdf`.
- Byte evidence: both managed files are valid four-page PDF 1.4 documents with the same SHA-256 hash, `3b874697881b42faf44f336bbf0d1e0289a166106c066b53e20e9292d0c1614b`.
- Metadata evidence: `pdfinfo` reports `Title: states-of-matter-session.mdx`, `Creator: Chromium`, and `Pages: 4` for both PDFs. The displayed `.mdx` string and page count therefore come from the PDF itself.
- Reader evidence: the live surface exposes PDF-specific controls including `Search in document`, zoom, page layouts, and rotation. The Foliate/MDX reader is not active.
- User effect: the embedded title can make the selected PDF look like the wrong file even though the correct PDF is open. This is a lower-priority title-presentation ambiguity, not loss of PDF access or content.

## Test log

### 2026-08-08 — setup and initial inspection

- Confirmed the target window is `Buddy Dev — pdf-reader` at `localhost:5173` and is already rendering a PDF through the new PDF reader.
- Confirmed the current source title is `CCEM_COMPULSORYI_2024.pdf`, with visible page text and 21 pages in the reader UI.
- A generic Electron default-app window was briefly surfaced when resolving the ambiguous display name `Electron`; it was not the target app. The target was then identified by the repository Electron binary path and no production/dev startup command was run.
- Review note: current code and tests are the source of truth for the manual matrix; existing docs may be stale.

### Disk fixtures inspected before UI runs

| Fixture | Pages | Useful characteristic |
| --- | ---: | --- |
| `/Users/prashantbhudwal/Documents/Buddy/Inbox/CCEM_COMPULSORYI_2024.pdf` | 21 | Text-heavy exam; unusual metadata warning; visible text layer. |
| `/Users/prashantbhudwal/Documents/Buddy/Inbox/UPSC_CSE_2026_GS1.pdf` | 56 | Scanned PDF (`ScandAll PRO` / Adobe PDF Scan Library); likely image/OCR stress case. |
| `/Users/prashantbhudwal/Documents/Buddy/Inbox/NCF-SE-2023.pdf` | 600 | Long A4 document with AcroForm metadata. |
| `/Users/prashantbhudwal/Documents/Buddy/reading/gutenberg/moby-dick.pdf` | 375 | Long text PDF with Title/Author metadata. |
| `/Users/prashantbhudwal/Documents/Buddy/startups/zero-to-one-presentation.pdf` | 10 | Landscape slide/deck PDF with Title, Subject, and Author metadata. |
| `/Users/prashantbhudwal/Documents/Buddy/Inbox/resources/pg-how-to-work-hard/paulgraham.com-How to Work Hard.pdf` | 6 | Tagged Chromium-generated web PDF. |
| `/Users/prashantbhudwal/Documents/Buddy/Inbox/diksha-exploring-magnets/curiosity-class-6-science-chapter-4-exploring-magnets.pdf` | 2 | Small tagged Microsoft Word-generated worksheet. |
| `/Users/prashantbhudwal/Documents/Buddy/video/uploads/States-of-Matter-NGSS-MS-PS1-4-Worksheet--ZqlHUC-ESQ.pdf` | 7 | Tagged LibreOffice worksheet in Letter size. |

### Source panel inspection

- Opened the bottom `Sources` tab from the current Quick chats conversation.
- The panel reported `118 SOURCES` and exposed source search plus `Add resource`.
- The visible list contained both `PDF · Ready` and `PDF · Unprocessed` entries, as well as EPUB entries, confirming that source status and file type vary within the same source pool.
- Visible PDF candidates included `CCEM_COMPULSORYI_2024.pdf` (Ready), `CCEM_OP_I_2024.pdf` (Unprocessed), `CCEM_OP_II_2024.pdf` (Unprocessed), and several worksheets/textbook PDFs.

### Manual PDF runs

- PASS — `CCEM_COMPULSORYI_2024.pdf`: opened as a 21-page text-heavy PDF with visible text layer. The TOC action showed the correct empty-state message for a document without an exposed outline. Metadata card exposed PDF type, fixed layout, page count, and document fingerprint.
- PASS — CCEM interaction sweep: zoom changed 63%→70%; text selection populated selected-passage chat context; Highlight created an annotation; the annotation editor changed style to Underline, color to Amber, and saved a note; the annotation panel displayed the result; search returned 17 results and navigated to the page-8 result (physical page 9); Match case, Whole words, and Match diacritics switches toggled; Single and Two-up layouts rendered; Previous/Next controls moved pages; Go to page moved to page 2; clockwise rotation visibly changed the document to 90°; reader preferences and keyboard help opened successfully.
- PASS — `UPSC_CSE_2026_GS1.pdf`: Sources displayed `PDF · Unsupported`, but opening it rendered the scanned Hindi exam page and reported 56 pages. No blank-reader or load failure was observed. The status mismatch is retained as an observation, not a confirmed PDF-reader defect.
- PASS — `NCF-SE-2023.pdf`: opened and rendered a 600-page document. Continuous scrolling reached the visible `Acronyms` section at page 8 of 600, demonstrating long-document loading and position updates.
- PASS — `hecu107.pdf`: opened and rendered the textbook PDF with 18 pages. The reader exposed `Page 1 of 18 · Label 98`, demonstrating a separate printed page label from the physical page index.
- PASS — `AGENTS.pdf` (Sources status `PDF · Unprocessed`): opened through the source panel and rendered a one-page PDF. The reader title was `AGENTS.md`, matching the embedded PDF title metadata rather than the filename; this was treated as metadata behavior, not a source-resolution defect.
- PASS — CCEM persistence/history: after reopening the source, the edited annotation note and the page-1 bookmark were still present. Reading-history back moved page 1→2→1 and forward moved 1→2. The temporary bookmark and annotation were deleted after verification.
- PASS — Selection search: selecting CCEM text exposed `Search selection`; activating it opened document search prefilled with the selected passage and returned one result. The search and selection overlays were dismissed without sending a chat message.
- Not available in Quick chats — the on-disk `moby-dick.pdf` fixture was not returned by Sources search, so it was not used for populated-outline verification. The matrix retains the outline item as partial because only the correct empty-TOC behavior was available in the source pool.
- DISMISSED INVESTIGATION-001 — `states-of-matter-session.pdf`: searching the Sources panel returned two PDF-labelled results. Each opened its correct resource-object route in PDF.js. The two managed PDFs are byte-identical four-page files whose embedded title is `states-of-matter-session.mdx`; see the investigation record above.
