# PDF Parsing Design

## Status

PDF parsing is implemented and closed for the current product phase.

This document records the current design decisions and intended behavioral contract. It
deliberately describes stable boundaries rather than individual implementation files, which may
move as the codebase evolves.

The PDF parsing implementation belongs under:

```text
packages/buddy/src/resource-packs/pdf/
```

An earlier LiteParse research and integration plan is archived beside this document with a
`legacy-` prefix. That plan records intent and research at the time it was written. It is not the
current implementation contract, and the code may differ because the design moved from globally
enabled OCR to Buddy-owned selective OCR.

## Objective

Buddy should prepare PDFs into reliable, model-readable resource packs while preserving the
original document for the learner-facing reader.

The system should:

- extract native PDF text quickly;
- recover text from pages that genuinely require OCR;
- preserve page boundaries;
- provide full text and chunked reading material to the model;
- keep preparation local and offline by default;
- behave predictably on macOS and Windows;
- retain a legacy extraction path for failures;
- avoid paying OCR cost on ordinary text-bearing pages.

## Core Model

PDF preparation has two independent outputs:

1. **Reader source**
   - The original or Buddy-managed PDF used by the learner-facing reading surface.
   - The source PDF remains immutable.

2. **Prepared resource pack**
   - Derived Markdown containing full text, page text, chunks, table-of-contents information when
     available, cover media, warnings, and extraction metadata.
   - This is the model-readable representation used by resource tools.

OCR currently affects only the prepared resource pack. It does not add an invisible text layer to
the PDF and does not create a searchable replacement PDF.

## Default Extraction Strategy

LiteParse is the default PDF parser.

Buddy owns the OCR policy around LiteParse instead of accepting LiteParse's broad default OCR
routing unchanged.

The default flow is:

```text
PDF
  -> native text extraction
  -> page complexity analysis
  -> Buddy selective-OCR policy
  -> targeted OCR for selected pages only
  -> merge targeted pages with native pages
  -> resource-pack construction
```

The native extraction and complexity analysis are cheap relative to OCR. The extra analysis pass
is accepted because it prevents full-document OCR on ordinary educational PDFs.

## Why OCR Is Selective

LiteParse's built-in routing treats substantial embedded images as a reason to OCR a page. That
policy favors maximum recovery of labels, captions, and text inside illustrations.

In educational books, nearly every page may contain an illustration while already carrying a
healthy native text layer. OCRing all such pages made preparation tens of times slower while
adding very little text.

Buddy therefore treats OCR as recovery work, not routine enrichment.

## OCR Decision Policy

LiteParse reports page complexity signals. Buddy interprets them as follows.

### Always OCR

- `scanned`
  - The page is effectively a page image and has almost no usable native text.
- `no-text`
  - The page has almost no extractable native text.
- `garbled`
  - The native text layer exists but decodes into unreadable characters.
- `vector-text`
  - Visible letters are drawn as vector shapes instead of represented as text characters.

### Conditionally OCR

- `sparse-text`
  - Some native text exists, but the page contains unusually little text.
  - This signal is ambiguous because covers, poems, headings, worksheets, and pages with large
    whitespace can all be legitimately sparse.
  - Buddy OCRs sparse pages only when the native text is extremely limited or the page is backed
    by a full-page image.
  - The current conservative native-text threshold is fewer than 200 characters.

### Do Not OCR By Itself

- `embedded-images`
  - An illustration, photograph, logo, or diagram exists on the page.
  - This alone does not imply that native page text is missing.
  - Buddy does not OCR a page solely for this reason.

New or unknown complexity reasons must not silently expand OCR work. They require an explicit
Buddy policy decision.

## Targeted OCR And Merge

When OCR is required:

1. Buddy asks LiteParse to parse only the selected page numbers with OCR enabled.
2. LiteParse renders those pages and runs the configured OCR engine.
3. LiteParse filters low-confidence OCR output and text that overlaps native text.
4. Buddy replaces only the corresponding native page results with the OCR-merged page results.
5. Unselected pages retain their native extraction.

This preserves document order and prevents an OCR decision on one page from forcing OCR across the
whole document.

## OCR Engine

The current default OCR engine is LiteParse's built-in Tesseract path.

Current decisions:

- OCR runs locally.
- The default language is English.
- English Tesseract language data is bundled with Buddy.
- Preparation must not depend on a first-use network download.
- OCR concurrency is intentionally low to keep CPU and memory usage predictable in the desktop
  app.
- OCR runs in Buddy's existing backend utility process. It does not require a separate sidecar
  process.

The OCR engine decision is separate from the selective page-routing decision. A future OCR engine
can replace Tesseract without changing the resource-pack boundary.

## LiteParse Output Contract

Buddy uses LiteParse's structured Node output.

Important semantics:

- The parse call returns a JavaScript object, not a JSON string.
- Pages include projected text and spatial text items.
- OCR-derived text items carry OCR font/source markers and confidence values.
- Complexity analysis is a separate API that reports `needsOcr` and reasons.
- Output formatting configuration does not automatically persist extraction provenance into
  Buddy metadata.

Buddy owns the conversion from LiteParse pages into its resource-pack representation.

## Fallback Strategy

If the selected LiteParse strategy fails, Buddy falls back to the legacy PDF extraction stack.

The legacy stack may use PDF.js and then system text extraction tools when necessary.

Fallback requirements:

- A LiteParse failure must be visible in resource warnings.
- Successful fallback output remains a usable resource.
- A document is unsupported only when no configured extractor produces usable text.
- The fallback is for reliability, not the normal default.

## Resource-Pack Contract

PDF extraction feeds the same resource preparation contract as other supported resource formats.

The resulting pack can contain:

- resource-level metadata;
- full extracted text;
- one Markdown file per page;
- structural chunks;
- a table of contents when available;
- a cover image;
- extraction warnings.

Chunking remains Buddy-owned. It uses available outline or heading structure and otherwise falls
back to page windows or generic chunks.

The resource records the extractor used at the document level. Detailed per-page OCR provenance
is not yet part of the persisted contract and is tracked as a known issue.

## Source And Derived-State Rules

- The original user file is never modified.
- Buddy's managed source copy is immutable after registration.
- Resource-pack generation happens through staged derived state before promotion.
- A failed rebuild must not replace a previously valid promoted pack with partial output.
- Existing prepared resources do not silently change when parsing policy changes; they must be
  rebuilt.
- Reader presentation continues to use the original or managed PDF source.

## Desktop Packaging

LiteParse is a native Node dependency and must be packaged as such.

The desktop contract is:

- support Buddy's macOS and Windows release targets;
- include the platform-specific native package;
- keep the native extension and its PDFium dynamic library discoverable together;
- keep native dependencies external to JavaScript bundling;
- unpack native runtime files where required by Electron packaging;
- bundle English Tesseract language data as an application resource;
- provide the packaged language-data path to the backend runtime;
- validate the native parser by parsing a real PDF in desktop smoke tests.

The app must be restarted when the packaged backend or parser configuration changes.

## Performance And Benchmarking

PDF strategy comparisons must exercise the real resource preparation API, not only call parser
functions directly.

The benchmark harness:

- creates resources through Buddy's typed backend client;
- polls the resource API until preparation reaches a terminal state;
- uses isolated temporary workspaces;
- compares selective OCR, full OCR, no OCR, and the legacy path;
- records duration, final status, extractor, character count, warnings, platform, architecture,
  and runtime version;
- writes a reusable JSON report.

Benchmark artifacts are retained under:

```text
docs/artifacts/benchmarks/
```

Current measurements show that selective OCR is close to no-OCR and legacy preparation time for
normal text-bearing educational PDFs, while still recovering text from image-only scanned PDFs.

## Failure Semantics

- Missing bundled OCR language data is a configuration failure.
- Invalid LiteParse page numbering or an empty final extraction is a parser failure.
- A targeted OCR failure follows the normal LiteParse-to-legacy fallback path.
- Empty pages may be retained when the document as a whole contains usable text, with warnings
  where appropriate.
- The original PDF remains available even when text preparation fails.

## Current Non-Goals

- Handwriting-grade recognition.
- PaddleOCR or EasyOCR packaging.
- A separate local OCR service.
- Browser/WASM PDF parsing.
- Non-English OCR language packs.
- Searchable-PDF generation.
- Mutating or replacing the original PDF.
- OCRing every embedded diagram for possible labels.
- Treating the legacy integration plan as an exact map of the current code.

## Design Summary

The locked current direction is:

```text
LiteParse native extraction
  + Buddy-owned selective OCR
  + bundled local English Tesseract
  + targeted page merge
  + Buddy-owned resource-pack construction
  + legacy extraction fallback
  + immutable original PDF
```

This is the default until evaluation data justifies changing the page-routing policy or OCR
engine.
