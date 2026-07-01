# LiteParse PDF Research And Integration Plan

Date: 2026-07-01

## Goal

Make LiteParse Buddy's default PDF parsing engine for resource packs, with the current `pdfjs-dist`/system-command pipeline retained as fallback. The key question is not whether to try LiteParse as an optional experiment, but how to integrate it with a correct mental model of its capabilities, limits, packaging shape, and OCR behavior.

## Current Buddy PDF Path

Buddy prepares learning resources through `prepare_resource`, which registers a resource object and builds a staged resource pack before promotion.

Relevant files:

- `packages/buddy/src/resources/resource-registry-service.ts`
- `packages/buddy/src/resource-packs/service.ts`
- `packages/buddy/src/resource-packs/extractors.ts`
- `packages/buddy/src/resource-packs/contracts.ts`
- `packages/buddy/src/resource-packs/storage.ts`

Current PDF extraction is in `extractPdfResource(sourcePath)` in `packages/buddy/src/resource-packs/extractors.ts`.

Current behavior:

- Uses `pdfjs-dist/legacy/build/pdf.mjs`.
- Reads all PDF bytes into memory.
- Extracts each page with `page.getTextContent()`.
- Renders page text via `renderPdfTextContent(content.items)`.
- Builds:
  - `fullText`
  - `pageMarkdowns`
  - `tocMarkdown` from PDF outline when available
  - `chunkUnits` from outline, inferred chapter headings, or page windows
  - `coverImage` via `pdftoppm` or `mutool`
- Falls back to `pdftotext` and then `mutool draw -F txt` only if the `pdfjs-dist` path throws.

Important limitation:

- The current text rendering is fairly shallow. It mostly joins text items into lines using `hasEOL`; it does not perform strong spatial layout reconstruction, OCR, confidence tracking, or handwritten/scanned page routing.

## Existing Resource-Pack Contract

The right integration boundary is `ResourceExtractionResult`:

```ts
type ResourceExtractionResult = {
  status: "ready" | "unsupported" | "error"
  warnings: string[]
  fullText: string
  chunkMarkdowns?: string[]
  chunkUnits?: ResourceChunkUnitSeed[]
  tocMarkdown?: string
  pageMarkdowns?: ResourceExtractionPage[]
  extractor: string
  coverImage?: ResourceExtractionCover
  title?: string
  author?: string
}
```

Do not change `prepare_resource`, `ingest_full_text`, object manifests, Bench reader state, or frontend API shape for the first implementation. LiteParse should be adapted into this existing contract as the default PDF engine.

## LiteParse Mental Model

Working model from current public docs, the LiteParse AGENTS text supplied by the user, and a source review of `@llamaindex/liteparse@2.4.0`:

```text
PDF or document input
  -> optional conversion for non-PDF formats
  -> PDFium loading and native text extraction
  -> optional page-level OCR for pages classified as needing OCR
  -> OCR/native text merge
  -> spatial grid projection
  -> formatter: json, text, markdown
```

Relevant Node API to validate in Buddy:

- `new LiteParse(config)`
- `parser.parse(pathOrBytes)`
- `parser.screenshot(pathOrBytes, pageNumbers?)`
- `parser.isComplex(pathOrBytes)` if exposed in the installed Node package
- `parser.parsePages(pages)` only for pre-extracted page input, not for normal PDF parsing

Expected useful config:

- `outputFormat: "json" | "text" | "markdown"`
- `ocrEnabled`
- `ocrLanguage`
- `ocrServerUrl`
- `tessdataPath`
- `maxPages`
- `targetPages`
- `dpi`
- `imageMode`
- `extractLinks`
- `preserveVerySmallText`
- `password`
- `quiet`
- `numWorkers`

Important API details from review:

- The Node library always returns a JS object with fields such as `pages`, `text`, and `images`.
- `outputFormat: "json"` does not mean `result.text` is a JSON string. It means the library returns structured JS pages and projected plain text.
- `outputFormat: "markdown"` changes `result.text` to rendered markdown and may populate page markdown fields.
- CLI behavior is not the contract to rely on; use the Node library directly for Buddy evaluation.
- `screenshot()` is async in source even if docs examples omit `await`.

## OCR Modes

LiteParse has three OCR routes conceptually:

1. Native built-in Tesseract.
   - Applies to the Node/native package when `ocrEnabled: true` and no `ocrServerUrl` is provided.
   - Best first default for Buddy's packaged desktop path because it is local and does not require a separate OCR process.
   - Requires language data such as `eng.traineddata`; Buddy should bundle or pre-provision this and pass `tessdataPath`.
   - Good fit for scanned/printed English pages, not a handwriting-grade recognizer.

2. HTTP OCR server.
   - Applies to the Node/native package when `ocrServerUrl` is provided.
   - Later, lets Buddy route OCR to EasyOCR, PaddleOCR, a custom local service, or a remote service that returns text with bounding boxes and confidence.
   - "Server" here means LiteParse's OCR adapter protocol, not necessarily a cloud service or external daemon. In Buddy, the right local implementation is an Electron `utilityProcess` OCR worker that starts on `127.0.0.1` and passes that localhost URL to LiteParse as `ocrServerUrl`.
   - This is the better long-term hook for handwritten paper correction, because Buddy can choose a handwriting-capable OCR/VLM service behind the LiteParse OCR API.
   - Costs more operationally than built-in Tesseract: utility-process lifecycle, model/runtime assets, GPU/CPU needs, latency, localhost access control, and offline packaging.

3. WASM/browser `ocrEngine` callback.
   - Applies to `@llamaindex/liteparse-wasm`, not the default Buddy backend path.
   - Lets a browser caller provide any async OCR implementation, such as a Web Worker with `tesseract.js` or a remote OCR call.
   - Useful if Buddy ever parses PDFs in the renderer/browser, but not the first backend resource-pack integration.

Buddy default should be:

```text
LiteParse native parser
  OCR mode: built-in Tesseract English
  tessdataPath: Buddy-packaged tessdata directory containing eng.traineddata
  fallback: current pdfjs/system parser stack
```

`eng.traineddata` is a required Buddy desktop runtime asset for OCR-enabled builds, not an optional cache file. The first-use LiteParse download behavior is only a failure mode if Buddy ships OCR support without packaging the data file or without passing `tessdataPath` to the packaged directory.

Parked future grading/correction path:

```text
LiteParse native parser
  OCR mode: Electron utility-process OCR worker exposing LiteParse's HTTP OCR API
  fallback: built-in Tesseract for printed English only
```

This is not part of the first LiteParse integration. The first implementation should ship with built-in Tesseract English OCR only.

## Parked Later: PaddleOCR Cost Model

PaddleOCR is parked for later. Do not evaluate, package, or implement it in the first LiteParse milestone. Keep these notes only so the later handwriting/document OCR worker discussion starts from a realistic cost model.

PaddleOCR may be more capable than Tesseract for document-shaped OCR, but the cost is materially higher.

Useful current facts from PaddleOCR/PaddlePaddle docs:

- PaddleOCR can run through multiple inference engines, including PaddlePaddle, ONNX Runtime, and Transformers.
- PaddlePaddle's install docs require 64-bit Python and list Python 3.9 through 3.13.
- PaddlePaddle's install docs list x86_64/Intel/AMD64 processor architecture and currently say PaddlePaddle does not support arm64. This is a major packaging concern for macOS arm64 unless the ONNX Runtime route works well enough.
- PaddleOCR supports local model directories for isolated/offline installs. Buddy must pre-package models rather than letting PaddleOCR download models on first use.
- Official PP-OCRv5 model sizes vary widely:
  - mobile text detection: about 4.7 MB
  - English mobile recognition: about 7.5 MB
  - PP-OCRv5 server text detection: about 84.3 MB
  - PP-OCRv5 server recognition: about 81 MB
  - optional text-line orientation models: about 1 MB to 6.5 MB
- Official CPU timings are per model/module on benchmark hardware, not full PDF-page end-to-end latency. They still show the tradeoff clearly: mobile models are much cheaper; server models are much heavier.

Expected Buddy costs if PaddleOCR becomes a local handwriting/document OCR worker:

- Disk/install size: likely hundreds of MB once Python runtime, inference runtime, model files, and native libraries are included. The model files alone can range from tens of MB for mobile English OCR to 150+ MB for server detection plus recognition before adding runtime dependencies.
- Memory: likely hundreds of MB warm, possibly low-GB under load depending on engine, model choice, rendered page DPI, concurrency, and whether layout/VL models are enabled. Buddy should process pages sequentially or with a very low concurrency cap.
- CPU: noticeably slower than built-in Tesseract for simple printed English. For CPU-only desktop use, expect OCR to be a background job with progress/cancel, not an instant inline operation.
- Setup: harder than Tesseract. Requires model asset management, offline packaging, a local OCR API worker, crash handling, timeouts, queueing, and platform-specific runtime validation.
- macOS arm64 risk: default PaddlePaddle engine may be a poor fit if arm64 support is still absent. The ONNX Runtime path may be the more realistic local desktop path to evaluate first.
- Windows risk: native dependency packaging, antivirus/signing friction, and runtime DLL discovery need explicit smoke tests.

Later evaluation note, not first milestone:

```text
First Paddle path to test later:
  PP-OCRv5 mobile/English or Latin recognition
  ONNX Runtime engine if it works on macOS arm64 and Windows x64
  hosted behind an Electron utilityProcess HTTP OCR worker

Avoid as first default:
  PaddleOCR-VL / document VLM pipelines
  broad server models
  GPU-only assumptions
```

## Assumptions That Must Be Checked

These are deliberately written as assumptions, not conclusions.

1. LiteParse Node package works under Buddy's runtime targets.
   - macOS arm64 dev.
   - macOS x64 if supported by releases.
   - Windows x64 release target.
   - Windows arm64 if Buddy continues to expose that optional path.
   - Bun runtime for backend dev.
   - Electron's Node runtime for packaged desktop.

2. LiteParse's structured Node output is the default adapter source.
   - The Node API should be treated as structured JS output with `pages`, `pageNum`, `page.text`, `page.markdown`, `textItems`, `result.text`, and `images`.
   - Do not assume `result.text` is JSON in `outputFormat: "json"` mode.
   - Buddy should own `fullText`, `pageMarkdowns`, and chunking for the first implementation rather than trusting LiteParse markdown end to end.
   - LiteParse markdown remains a follow-up upgrade path after sample review.

3. LiteParse markdown may be better for tables/headings/lists, but should not be adopted blindly.
   - Need sample comparison against Buddy's existing page markdown.
   - Need to understand how image placeholders and links behave.
   - Initial recommendation is `imageMode: "off"` unless embedded images are intentionally stored.
   - Treat dense tables, complex multi-column layouts, scans, charts, and handwriting as known hard cases until Buddy samples prove otherwise.

4. LiteParse OCR is pluggable; Tesseract is only the first default.
   - The built-in OCR path is Tesseract based.
   - The future HTTP OCR path can use EasyOCR, PaddleOCR, custom local OCR, or a remote OCR service, but this is parked until after the first LiteParse integration.
   - The WASM path can use a JS-side `ocrEngine` callback, but this is not the first Buddy backend path.
   - Do not use LiteParse/Tesseract as a handwriting-recognition solution.
   - LiteParse does not expose a handwriting-specific detector or complexity reason.
   - Complexity reasons should be treated as scan/text-layer signals, not handwriting signals.
   - For scanned or handwritten papers, LiteParse may be better used as intake, page rendering, complexity detection, and routing to the HTTP OCR path backed by a handwriting-capable OCR/vision service.
   - English OCR should be enabled by default because Buddy should bundle `eng.traineddata` with the app.
   - Built-in OCR needs `.traineddata` files. Source review indicates missing language data can be downloaded on first use from tessdata sources, which is not acceptable to assume in offline packaged Electron.
   - Do not depend on first-use network download for OCR. Ship the English tessdata file and pass `tessdataPath`.

5. LiteParse can replace or improve cover generation via screenshots.
   - Need to confirm screenshot output format, memory behavior, and whether it works in packaged Electron.
   - Existing `pdftoppm` and `mutool` fallbacks should remain during rollout.

6. LiteParse package layout is native and needs explicit packaging work.
   - The Node package appears to depend on native optional packages.
   - Buddy's backend node artifact and Electron main bundle intentionally avoid broad runtime `node_modules`.
   - We must verify the exact packages/files needed at runtime.
   - Preserve the platform native package plus the sibling PDFium dynamic library next to the native extension, or configure `PDFIUM_LIB_PATH`.
   - The package is ESM-only, so Buddy should test dynamic/import behavior in Bun dev and Electron's Node runtime.

7. Complexity detection exists and is stable enough to guide OCR/routing.
   - Need to confirm whether the current Node package exposes `isComplex`.
   - Need to inspect return shape and reasons.
   - Need to decide if it should be used before parsing, after a cheap no-OCR parse, or only in an evaluation script.
   - Do not expect a `handwriting` complexity reason.

8. `parsePages()` is not part of the first Buddy integration path.
   - It skips PDFium and OCR by design.
   - Source review found a possible runtime contract mismatch around `textItems[].words`; avoid depending on it for the first integration.

## Proposed Integration Shape

Create an isolated PDF extraction module:

```text
packages/buddy/src/resource-packs/pdf/
  index.ts
  types.ts
  liteparse-parser.ts
  pdfjs-parser.ts
  adapter.ts
  evaluation.ts or script under packages/buddy/script/
```

Target interface:

```ts
type PdfExtractionEngineResult = {
  extractor: string
  pageTexts: Array<{ pageNumber: number; text: string }>
  fullText?: string
  tocMarkdown?: string
  coverImage?: ResourceExtractionCover
  warnings: string[]
}
```

Then adapt it to `ResourceExtractionResult`:

```text
PdfExtractionEngineResult
  -> pageMarkdowns
  -> fullText
  -> chunkUnits
  -> status
  -> warnings
```

Rollout order:

1. Move existing PDF logic behind `pdfjs-parser.ts` without behavior changes.
2. Add LiteParse parser behind the same internal interface.
3. Make LiteParse the default parser.
4. Fall back to pdfjs/pdftotext/mutool when LiteParse cannot load, throws, or returns unusable text.
5. Keep current source validation and staged pack promotion unchanged.
6. Add focused tests and a sample evaluation script for regression visibility, not as a prerequisite to choosing the default engine.
7. Enable English OCR by default with built-in Tesseract by pointing LiteParse at Buddy's packaged `eng.traineddata`.
8. Add config space for `ocrServerUrl` even if the first release uses local Tesseract, so a bundled handwriting-capable Electron `utilityProcess` OCR worker can be added later without changing the parser boundary. Do not implement the OCR worker in the first milestone.

Default parser order:

```text
LiteParse
  -> pdfjs-dist
  -> pdftotext
  -> mutool
  -> unsupported
```

Fallback is for operational robustness, not indecision. If LiteParse loads and produces usable page text, Buddy should use the LiteParse result.

## Evaluation Plan

Build a small local evaluation script that can parse a folder of PDFs through both engines and emit JSON/markdown summaries. This script is for observing quality and catching regressions after the default-engine decision, not for deciding whether LiteParse should be default.

Sample classes:

- normal digital textbook PDF
- chapter PDF from Indian education sources
- two-column academic/article PDF
- table-heavy worksheet
- scanned typed worksheet
- handwritten answer sheet
- rotated or photographed page PDF
- large PDF, ideally 100+ pages
- encrypted/password-protected PDF if safe sample exists

Metrics:

- parse success/failure
- wall time
- memory if easy to measure
- page count
- extracted non-whitespace chars
- chunk count
- empty pages
- representative first page text
- table/list degradation notes
- OCR behavior and warnings for built-in Tesseract; HTTP OCR is parked unless a later worker exists
- package/runtime load behavior
- result shape differences between `outputFormat: "json"`, `"text"`, and `"markdown"`
- full document vs `targetPages` behavior

Manual review questions:

- Does the output preserve reading order better than pdfjs?
- Does it avoid repeated headers/footers better or worse?
- Does it preserve tables well enough for learning workflows?
- Does markdown output improve ingestion compared with Buddy page markdown?
- Are handwritten answers recognized, ignored, or garbled?
- Does complexity detection correctly flag scans or missing text layers?
- Does it fail predictably on handwriting-heavy pages?

## Packaging Work To Investigate

Buddy currently builds a Node backend artifact with `Bun.build` and narrowly externalizes a few native runtime packages. Electron then copies selected native runtime packages into `out/main/chunks/node_modules`, and `electron-builder` unpacks selected native modules.

Files to inspect before implementation:

- `packages/buddy/script/build-node.ts`
- `script/backend-node-artifact.ts`
- `packages/desktop-electron/electron.vite.config.ts`
- `packages/desktop-electron/electron-builder.config.ts`
- `packages/desktop-electron/scripts/smoke-backend-utility.ts`

Likely required changes:

- Add `@llamaindex/liteparse@2.4.0` or a reviewed pinned version to backend dependencies.
- Add platform optional LiteParse packages to `packages/buddy/package.json` if Bun does not install them transitively in the desired way.
- Externalize LiteParse native packages from the backend bundle.
- Copy LiteParse wrapper, platform native package files, and PDFium sidecar files into Electron output.
- Add `asarUnpack` patterns for `.node`, `.dylib`, `.so`, `.dll`, and any PDFium/Tesseract sidecar files.
- Extend smoke tests to import and minimally parse/screenshot a tiny PDF in Electron-as-Node.
- Add an offline OCR smoke or explicitly disable OCR in the first experiment.
- Bundle or pre-provision English tessdata if enabling OCR by default. The current upstream `tessdata_best` English file is about 15 MB, which is acceptable if license/notice obligations are handled.
- Treat missing packaged `eng.traineddata` as a packaging/test failure, not as a normal runtime state.
- Audit license and notice requirements for Apache-2.0 LiteParse/Tesseract/tessdata and BSD-style PDFium binaries before redistribution.

## Open Questions For Reviewer

The reviewer should focus on LiteParse correctness, not Buddy implementation convenience.

1. Is the documented Node API accurate for the latest package?
2. Does `@llamaindex/liteparse` expose `isComplex` in the Node package today?
3. What exactly is returned by `parse()` for `outputFormat: "json"` and `"markdown"`?
4. Does `result.text` differ materially between `json`, `text`, and `markdown` modes?
5. Does `parse()` with `outputFormat: "markdown"` still return `pages`, `textItems`, and useful page-level markdown?
6. Does LiteParse support handwritten text in any meaningful way, or only typed/scanned OCR?
7. What are the known failure cases for scanned PDFs, dense tables, handwriting, charts, and multi-column pages?
8. Does built-in OCR ship with all platform packages, and what language data is bundled?
9. What are the package files needed at runtime for macOS and Windows?
10. Are there licensing or redistribution concerns for PDFium/Tesseract data in an Electron app?
11. Does it run under Bun, or should Buddy's backend use it only in the Node artifact path?
12. Is LiteParse stable enough for primary extraction, or should it start behind a feature flag?
13. Does first-use OCR require network access for tessdata?
14. Does the published CLI differ from the library API in ways that make CLI-based tests misleading?
15. Later: which Electron utility-process, local, or remote HTTP OCR backend should Buddy use for future handwritten answer correction?

## Subagent Review Findings

A `gpt-5.5` xhigh reviewer inspected LiteParse source and package behavior. Findings to preserve in the plan:

1. Handwriting support is weaker than hoped.
   - LiteParse does not expose handwriting detection, handwriting-specific OCR, or a `handwriting` complexity reason.
   - Treat handwritten answer correction as a separate handwriting-capable OCR/VLM workflow.

2. Built-in OCR is not automatically offline-ready.
   - The OCR engine is compiled in, but language `.traineddata` files may not be bundled in npm tarballs.
   - First-use OCR may download language data into cache paths.
   - For English, the data size is not the main blocker; deterministic offline provisioning is.

3. OCR selection is page-level, not image-region-level.
   - Embedded images can trigger full-page OCR.
   - This matters for mixed text/logo pages and scanned pages.

4. Markdown output needs empirical validation.
   - LiteParse itself points hard layouts, charts, scans, and handwriting toward LlamaParse.
   - Open issues mention target-page stalls or quality changes and OCR/projection scrambling in some scanned/typewritten cases.

5. `outputFormat: "json"` is easy to misunderstand.
   - The library returns structured JS data in all modes.
   - `json` mode does not make `result.text` a JSON string.
   - Markdown mode changes `result.text` and may add page markdown.

6. `parsePages()` is not a normal PDF parse path.
   - It skips PDFium and OCR.
   - There may be a runtime mismatch around required `textItems[].words`.

7. Published CLI/docs have drift.
   - Use Node library probes as the source of truth for Buddy evaluation.

8. Packaging must preserve native sidecars.
   - The platform package and sibling PDFium library are runtime requirements.
   - ESM-only import and native sidecar loading need Bun and Electron smoke tests.

9. License redistribution needs explicit audit.
   - Do not assume npm tarballs carry all needed PDFium/Tesseract license/notice files.

## Initial Implementation Recommendation

Implement a default-LiteParse integration with current-parser fallback:

```text
try LiteParse PDF extraction
if it produces usable text:
  build Buddy resource pack from LiteParse result
else:
  fall back to current pdfjs/system pipeline
```

Use English OCR by default through built-in Tesseract. The implementation must package `eng.traineddata` and pass `tessdataPath`. If the data file is missing, treat it as a packaging bug caught by smoke tests rather than letting LiteParse silently depend on a network download during resource preparation.

Preserve an explicit OCR configuration layer:

```text
ocrMode = "tesseract" | "http" | "disabled"
ocrLanguage = "eng"
tessdataPath = Buddy-managed path
ocrServerUrl = optional future OCR service
```

Do not market or rely on handwritten-paper correction through LiteParse. For grading papers, treat LiteParse as an intake and routing component first:

```text
paper PDF
  -> LiteParse page images/text/complexity
  -> handwriting/scanned route if needed
  -> answer extraction
  -> rubric matching
  -> human-reviewable corrections
```

## Sources To Recheck

- `https://github.com/run-llama/liteparse`
- `https://github.com/run-llama/liteparse/blob/main/packages/node/README.md`
- `https://www.npmjs.com/package/@llamaindex/liteparse`
- `https://registry.npmjs.org/@llamaindex/liteparse/latest`
- LiteParse repository source if cloned locally
- LiteParse issue tracker for OCR, markdown, and packaging regressions

If cloning is needed, clone into `~/code/`, for example `~/code/liteparse`, not inside the Buddy repo.
