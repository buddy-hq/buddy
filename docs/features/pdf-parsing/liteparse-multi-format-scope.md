# LiteParse Multi-Format Adoption Boundary

Date: 27 July 2026

## Status

This document records where LiteParse 2.9 fits in Buddy's resource-preparation architecture beyond
PDFs. It is an evaluation and decision boundary, not an implementation plan.

The decision is:

- keep LiteParse as Buddy's primary PDF text and OCR engine;
- deepen its use for PDF-native capabilities where evaluation shows a fidelity improvement;
- retain Buddy's format-native DOCX, PPTX, spreadsheet, EPUB, HTML, and text parsers;
- consider LiteParse's non-PDF conversion path only as an optional fallback for formats Buddy
  cannot otherwise prepare;
- do not treat LiteParse's document-complexity result as the token-safety boundary.

No multi-format parser replacement is authorized by this document.

## LiteParse And LlamaParse Are Different Products

LiteParse is the local open-source parser embedded in Buddy. Its core is a PDF parser built on
PDFium, with local Tesseract OCR and an optional HTTP OCR adapter.

LlamaParse is LlamaIndex's separate cloud document-parsing product. Claims about higher-quality
agentic parsing in the LlamaParse product documentation must not be assumed to exist in the local
LiteParse package.

This document concerns `@llamaindex/liteparse` 2.9 only.

## What Multi-Format Support Actually Means

LiteParse does not contain format-native parsers for Word, PowerPoint, spreadsheets, and images.
Its multi-format flow is:

```text
Office or OpenDocument input
  -> LibreOffice conversion to PDF
  -> LiteParse PDF parsing

Image input
  -> ImageMagick conversion to PDF
  -> LiteParse PDF parsing and optional OCR
```

This provides broad visual document support, but it is a lossy conversion boundary. After
conversion, LiteParse sees PDF pages, not the original Office object model.

Consequences include:

- unprinted or non-visual source semantics may be absent;
- pagination, fonts, layout, and chart rendering depend on the converter;
- document conversion adds process startup, temporary-file, and PDF parsing cost;
- results depend on compatible external executables being installed and discoverable;
- the same input can render differently across converter and font installations.

LiteParse's reconstructed Markdown headings, tables, lists, images, and links are inferred from PDF
spatial layout. They are not the original Office semantics.

## Current Buddy Parser Matrix

Buddy dispatches resource preparation by format in
[`extractors.ts`](../../../packages/buddy/src/resource-packs/extractors.ts).

| Format | Buddy implementation | Important preserved semantics | LiteParse route |
| --- | --- | --- | --- |
| PDF | LiteParse plus Buddy selective OCR and fallback stack | Page order, page text, targeted OCR, outline metadata when available, cover | Native PDF parsing |
| DOCX | Mammoth to HTML, then Turndown to Markdown | Word-oriented semantic headings, lists, tables, links, and conversion warnings | LibreOffice to PDF |
| PPTX | Buddy OpenXML archive parser | Slide order, slide titles, tables, speaker notes, and alt text | LibreOffice to PDF |
| XLSX, XLS, XLSM, XLSB, ODS, Numbers | SheetJS worker | Worksheets, visibility, row and column identity, cell values, cached formula results, formulas, and per-sheet CSV artifacts | LibreOffice to PDF |
| EPUB | Buddy ZIP, XML, and HTML pipeline | Spine order, chapters, TOC, title, author, and cover | Not supported |
| HTML and XHTML | Turndown | Source document structure without pagination | No useful advantage |
| Markdown, text, JSON, YAML, CSV, and code | Direct text preparation | Exact source text | No useful advantage |
| Images | Native model attachment; no general image resource-pack OCR path | Original pixels for model vision | ImageMagick to PDF, then OCR |

Relevant format-native implementations:

- [`pptx-extractor.ts`](../../../packages/buddy/src/resource-packs/pptx-extractor.ts)
- [`spreadsheet-parser.ts`](../../../packages/buddy/src/resource-packs/spreadsheet-parser.ts)
- [`extractors.ts`](../../../packages/buddy/src/resource-packs/extractors.ts) for DOCX, EPUB,
  HTML, text, and fallback PDF extraction

## Current LiteParse Use Inside Buddy

Buddy currently uses LiteParse only for PDFs.

The adapter in
[`liteparse-parser.ts`](../../../packages/buddy/src/resource-packs/pdf/liteparse-parser.ts):

- invokes `parse()` for PDF page extraction;
- invokes `isComplex()` for per-page routing signals;
- optionally targets selected pages for OCR;
- uses bundled English Tesseract data;
- consumes the final `page.text` strings.

Buddy currently does not persist or use most of LiteParse's richer output:

- reconstructed page Markdown;
- text and word bounding boxes;
- extracted links and images;
- annotations and form fields;
- tagged-PDF structure trees;
- vector graphics;
- page screenshots;
- detailed font and character-code metadata.

Buddy wraps LiteParse with its own selective OCR policy in
[`selective-ocr-parser.ts`](../../../packages/buddy/src/resource-packs/pdf/selective-ocr-parser.ts).
The policy caps automatic OCR work and does not OCR a page merely because it contains an embedded
image.

The legacy PDF stack remains intentionally independent so that it can recover when LiteParse itself
fails.

## What LiteParse Can Replace Or Improve

### Strong PDF candidates

#### PDF cover rendering

LiteParse's `screenshot()` API can render the first page directly. After cross-platform validation,
it could replace the `pdftoppm` and `mutool` cover-rendering subprocesses while reusing a native
dependency Buddy already packages.

#### PDF page representation

Buddy currently keeps projected plain text. LiteParse's reconstructed page Markdown may improve
tables, headings, lists, links, images, and multi-column reading order. It should replace plain text
only after comparative evaluation on:

- ordinary books and papers;
- tables and multi-column layouts;
- scanned and selectively OCRed pages;
- malformed or font-corrupted PDFs;
- chunk boundaries and token cost.

#### Spatial citations and visual tooling

Bounding boxes, word boxes, screenshots, extracted images, and page dimensions could support
spatial citations, document-region inspection, and page-aware model tools. These are new
capabilities rather than replacements for an Office parser.

#### Currently unsupported convertible formats

When LibreOffice is available, LiteParse could provide a best-effort preparation fallback for
formats such as:

- DOC, DOCM, ODT, and RTF;
- PPT, PPTM, and ODP;
- Pages and Keynote;
- other converter-supported formats not represented in Buddy's native resource registry.

Such output must be labeled as PDF-converted visual extraction rather than native extraction.
Failure to find or run the converter must produce a normal unsupported result, not a broken
resource.

### Possible image-resource capability

When ImageMagick is available, LiteParse could create a prepared OCR resource from an image. This
would complement the original image's native model-vision path; it should not silently replace the
original pixels or imply that OCR captures all visual information.

## What LiteParse Must Not Replace

### Structured spreadsheet parsing

Spreadsheet conversion to PDF cannot provide Buddy's machine-readable workbook contract. It cannot
reliably preserve:

- formulas separately from displayed or cached values;
- stable cell addresses;
- worksheet visibility;
- complete large sheets beyond printed page areas;
- per-sheet CSV artifacts;
- row-window chunking;
- workbook-native budgets and validation.

LiteParse may later supplement spreadsheet extraction with chart or layout screenshots, but the
SheetJS parser remains authoritative.

### Presentation-native parsing

PDF export is useful for visual slide appearance, but cannot be trusted to retain speaker notes,
alt text, relationship order, or other non-printed presentation data. The Buddy PPTX parser remains
authoritative. A visual LiteParse result could be an additional artifact, not a replacement.

### Semantic DOCX parsing

Mammoth reads Word semantics directly. LiteParse infers structure after LibreOffice has rendered the
document to pages. That can improve visual fidelity in some documents but can lose semantic
structure in others. Keep Mammoth as the default and consider LiteParse only as a fallback or a
separate visual representation.

### EPUB parsing

LiteParse does not replace Buddy's EPUB container, spine, metadata, TOC, or cover extraction.

### Direct text formats

Converting plain text, Markdown, HTML, code, JSON, YAML, or CSV into PDF adds work and can reduce
fidelity. Buddy should continue reading these formats directly.

### Token estimation and admission safety

LiteParse does not provide provider-token accounting. Text length, word boxes, UTF-8 bytes, and
provider tokens are different quantities.

The 26 July incident also demonstrated that LiteParse 2.9's `isComplex()` and `isGarbled` verdicts
can miss a document-wide broken-font extraction. The adaptive UTF-8 estimate and the
`ingest_full_text` headroom gate remain independent safety controls.

## Packaging Boundary

Buddy currently packages:

- the platform-specific LiteParse native module;
- PDFium through the LiteParse package;
- English Tesseract language data.

Buddy does not package LibreOffice or ImageMagick. The Electron runtime resources are defined in
[`electron-builder.config.ts`](../../../packages/desktop-electron/electron-builder.config.ts).

Developer machines may already expose `soffice` and `magick`, but Buddy cannot assume that normal
macOS and Windows installations do. Making conversion-based formats first-class would require one
of these explicit product decisions:

1. Bundle and maintain the converters, including size, licensing, signing, update, and security
   costs.
2. Detect user-installed converters and expose the feature as best-effort.
3. Run conversion in a separately managed local or remote service.

Until one is chosen, LibreOffice and ImageMagick conversion must not become a required preparation
path.

## Recommended Long-Term Boundary

```text
PDF
  -> LiteParse primary
  -> Buddy selective OCR and admission safety
  -> independent legacy fallback

Format with a strong Buddy-native parser
  -> native parser remains authoritative
  -> optional LiteParse visual artifact only when it adds value

Unsupported but LibreOffice-convertible format
  -> optional capability-detected conversion fallback

Image
  -> retain original visual input
  -> optional LiteParse OCR resource as a secondary representation
```

The next LiteParse work, if prioritized later, should remain PDF-focused:

1. Benchmark `page.markdown` against the current `page.text` resource output.
2. Evaluate `screenshot()` as the PDF cover renderer.
3. Decide whether bounding boxes and links belong in the resource-pack contract.
4. Add a converter-capability probe only if unsupported Office formats become a product
   requirement.

Do not replace all existing parsers behind one generic LiteParse call.

## Sources

- [LiteParse repository overview](https://github.com/run-llama/liteparse)
- [LiteParse Node.js API and supported formats](https://github.com/run-llama/liteparse/blob/main/packages/node/README.md)
- [LiteParse architecture and external conversion flow](https://github.com/run-llama/liteparse/blob/main/AGENTS.md)
- [PDF Parsing Design](./design.md)
- [Full-Text Ingestion Design](../full-text-ingestion/design.md)
