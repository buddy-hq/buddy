# PDF Parsing Known Issues

This document tracks work intentionally deferred after the initial LiteParse and selective-OCR
integration.

## Handwriting Recognition

### Status

Open and deferred.

### Current behavior

Buddy's bundled Tesseract path is intended for printed English text. It is not a
handwriting-grade recognizer.

LiteParse can identify pages with missing, sparse, garbled, scanned, or vector text, but it does
not identify handwriting as its own complexity category. A handwritten page will usually be
routed because it looks scanned or textless, not because LiteParse understands that it contains
handwriting.

### Why the current path is insufficient

Handwriting varies by writer, pen, page quality, rotation, ruled paper, mathematical notation,
cross-outs, and layout. Printed-text OCR can return plausible but incorrect words, which is
particularly risky for grading or correcting student work.

### Intended path

Use LiteParse for document intake, page selection, rendering, coordinates, and result merging,
while routing selected handwritten pages to a handwriting-capable engine through LiteParse's HTTP
OCR adapter.

The word "server" describes the adapter protocol. It does not require a cloud service. A future
Buddy implementation could run:

- a local OCR worker in a separate Electron utility process;
- a locally packaged model runtime exposed on loopback;
- a remote handwriting OCR service when explicitly configured;
- a vision-language model designed for handwriting and educational material.

The worker would return text, bounding boxes, and confidence in LiteParse's expected OCR response
shape.

### Work required

- choose and evaluate a handwriting-capable model on real student papers;
- define printed-text versus handwriting routing;
- package the runtime and model assets for macOS and Windows;
- manage worker lifecycle, readiness, cancellation, crashes, and upgrades;
- keep local traffic authenticated or otherwise restricted;
- cap memory, CPU, concurrency, and page resolution;
- support offline installation if local-first operation remains required;
- persist OCR provenance and confidence for grading workflows;
- design human review for uncertain handwriting instead of silently trusting recognition.

PaddleOCR, EasyOCR, and document vision models remain candidates, not selected solutions. A
separate evaluation is required before choosing one.

## Searchable PDF And Text-Layer Generation

### Status

Open and deferred.

### Current behavior

OCR output is written into Buddy's prepared resource pack. The original PDF and Buddy's managed
source copy remain unchanged.

This means:

- the model can read OCR text through the prepared resource;
- the original scanned PDF may still be unsearchable in an external viewer;
- text may not be selectable or accessible in the PDF reader;
- no invisible PDF text layer is generated.

### Why writing a derived PDF is not sufficient

Buddy's reading resource currently exposes one reader path. Resource presentation resolves that
path to the original workspace PDF or the managed source copy.

Simply writing a searchable PDF under derived state would not make the reading surface use it.
The resource object, reader view, presentation resolution, and lifecycle rules would all need to
understand an enhanced reader asset.

### Risks of indiscriminate layering

Adding invisible OCR text to every page can damage otherwise healthy PDFs:

- duplicate words in copy and search results;
- misaligned selections;
- incorrect reading order;
- broken accessibility output;
- OCR mistakes competing with correct native text;
- larger files;
- duplicated or garbled text on pages with broken existing mappings.

The original PDF must never be overwritten.

### Intended path

Introduce explicit reader assets:

```text
original reader asset
optional searchable reader asset
active reader asset = validated searchable asset or original fallback
```

The first safe scope should be:

1. Generate a searchable derivative only when a page was classified as `scanned` or `no-text`.
2. Require accepted OCR text before generating or selecting the derivative.
3. Copy the original PDF and add invisible text only to qualifying pages.
4. Leave healthy native-text pages untouched.
5. Validate that the derivative opens, preserves page count and dimensions, and contains the
   expected searchable text.
6. Persist both the immutable original asset and optional enhanced reader asset.
7. Make resource presentation resolve the enhanced asset when valid and fall back to the original
   when absent or invalid.
8. Keep source inspection and original-file access pointed at the original.
9. Build generation into staged resource promotion, rebuild, cleanup, and failure recovery.

Mixed, garbled, and vector-text pages should remain out of the first searchable-PDF milestone.
Those cases may already contain a defective text layer, and adding another layer can produce
duplicates unless the existing layer is safely replaced.

### Implementation choices

Two broad approaches remain:

- Use a mature searchable-PDF pipeline such as OCRmyPDF.
  - Better handling of PDF edge cases.
  - Significant Python, Ghostscript, Tesseract, packaging, and cross-platform runtime cost.
- Build the layer from LiteParse text items and bounding boxes.
  - Reuses already available recognition results.
  - Requires reliable PDF writing, coordinate conversion, rotation handling, Unicode font
    embedding, invisible text rendering, validation, and accessibility testing.

This is a real reader-resource feature, not a small parser output option.

## Per-Page OCR Provenance

### Status

Open.

### Current behavior

LiteParse returns spatial text items that can identify accepted OCR text and confidence. Complexity
analysis separately reports which pages were candidates and why.

Buddy currently retains final page text but does not persist the full decision trail.

As a result, a prepared resource does not yet provide a durable answer to:

- which pages were considered for OCR;
- which pages actually ran OCR;
- which pages accepted OCR text;
- why each page was selected;
- which OCR engine and language were used;
- confidence summaries;
- partial per-page OCR failures.

### Intended path

Add page-level extraction provenance to the resource-pack contract and a compact document-level
summary.

The page model should distinguish:

```text
native
ocr
mixed
none
```

It should separately represent OCR selection, execution, accepted output, reason, engine,
language, and confidence. Resource preparation output should expose a concise page-range summary
to the model without dumping all word-level details.

This provenance is a prerequisite for trustworthy paper correction and for deciding whether a
searchable PDF derivative should be generated.

## Structural Metadata And Legacy Extraction

### Status

Open.

### Current behavior

PDF text extraction and PDF structural metadata are separate concerns. Outline or
table-of-contents extraction can fail even when LiteParse text extraction succeeds.

The legacy path may also fall through from PDF.js to a system text extractor. Benchmark reports
must therefore record the extractor that actually completed rather than labeling all legacy runs
as PDF.js.

### Intended path

- make outline extraction reliable in the backend runtime;
- evaluate whether LiteParse should become the outline source;
- keep outline failure non-fatal to usable page text;
- preserve explicit warnings;
- continue recording the final extractor used.

## Selective-OCR Policy Coverage

### Status

Open and expected to evolve through evaluation.

### Current tradeoff

Ignoring `embedded-images` alone provides the required performance improvement, but Buddy may miss
text that exists only inside diagrams, charts, screenshots, or illustrations on otherwise healthy
pages.

The sparse-text threshold is also a policy choice rather than a universal truth.

### Recent findings

Two real PDFs exposed different failure modes that the OCR policy must distinguish.

#### Fully scanned book: The History of Western Education

Observed behavior:

```text
pages = 446
native_text_pages = 0
native_non_whitespace_chars = 0
LiteParse OCR candidates = 446
candidate reasons = scanned: 446
```

This is the expected shape of a fully scanned book. Native extraction cannot produce useful model
text, and OCRing every page in-process is too expensive for the current desktop execution model.
The automatic OCR budget should prevent this document from entering a full-book OCR call.

#### Mostly text-bearing PDF: NCF-SE-2023

Observed behavior:

```text
pages = 600
native_text_pages = 600
native_non_whitespace_chars = 1,334,808
LiteParse OCR candidates under the old policy = 482
candidate reasons under the old policy:
  vector-text = 461
  sparse-text / embedded-images+sparse-text = 21
```

This document has healthy native text on every page. Many `vector-text` pages contain thousands of
native characters, for example pages with roughly 2,000–3,000 characters. Treating `vector-text` as
an unconditional strong OCR signal therefore produces a false-positive OCR workload.

The policy implication is:

```text
vector-text + weak native text
  -> OCR candidate

vector-text + healthy native text
  -> not an OCR candidate
```

With the proposed routing thresholds, the same NCF-SE-2023 document selects only the sparse-text
pages for OCR:

```text
proposed OCR candidates = 21
candidate reasons:
  sparse-text / embedded-images+sparse-text = 21
```

This is still over the current 10-page automatic OCR budget, so the shipping compromise remains to
return the native extraction as ready and warn that those OCR candidates were skipped. The warning
should not imply that 482 text-bearing pages failed to parse.

### Intended path

- build a representative education PDF corpus;
- compare native, selective, and full-OCR output;
- measure recovered useful text, false OCR additions, latency, and memory;
- add diagram-specific recovery only when evidence justifies its cost;
- keep new LiteParse complexity reasons opt-in at the Buddy policy layer;
- revise thresholds through named policy constants and benchmark artifacts.

The current selective policy remains the default until this evaluation shows a better balance.

## Automatic OCR Budget For Large Scanned PDFs

### Status

Open, with a shipping compromise in place.

### Current problem

Selective OCR protects ordinary educational PDFs by avoiding OCR on pages that already have usable
native text. However, an all-image scanned book can still route every page to OCR. In that case the
selective path degenerates into a full-book OCR job.

This matters for the desktop product because LiteParse OCR is currently invoked in-process and does
not expose a cancellation or timeout API. Buddy's `prepare_resource` wait timeout only controls how
long the tool waits before returning; it does not stop a native OCR call that is already running.
A long OCR call can therefore leave the resource in `preparing` while the backend continues working.

### Current compromise

Automatic OCR is capped by a small page budget. Buddy still runs native extraction for the whole PDF
and still runs complexity analysis for all pages. The cap applies only to the expensive targeted OCR
pass.

Current behavior:

```text
OCR-needed pages <= automatic OCR budget
  -> run targeted OCR and merge those pages into the native extraction

OCR-needed pages > automatic OCR budget and native text is usable
  -> skip OCR, return the native extraction as ready, and warn how many OCR-needed pages were
     skipped plus the reason summary

OCR-needed pages > automatic OCR budget and native text is not usable
  -> skip OCR, preserve the skipped-OCR reason, and let the existing non-OCR/fallback path
     determine the terminal resource status
```

The initial automatic OCR budget is intentionally conservative: 10 pages. This is not a statement
that 11 OCR pages is intrinsically too large. It is a release guard until Buddy has a better
execution model for long OCR work.

Buddy does not currently choose the "best" 10 OCR pages from an over-budget document. If the
selected OCR set is over budget, Buddy skips OCR entirely for that pass. This avoids producing a
misleading partially-OCRed resource whose page coverage depends on an arbitrary ordering policy.

Warnings for skipped OCR must distinguish `scanned`, `sparse-text`, `vector-text`, and other
candidate reasons. A warning that only says "OCR skipped for N pages" is not sufficient, because a
mostly text-bearing PDF can have many vector-text candidates while still producing a complete native
text extraction.

### Intended path

- persist page-level OCR selection, execution, and skipped-page provenance;
- add a model-facing way to check an existing resource's preparation status without re-adding it;
- make `prepare_resource` retries idempotent for the same source object;
- execute OCR in batches with progress between batches;
- move OCR into a cancellable process boundary before enforcing wall-clock timeouts;
- expose clear UI/tool states for OCR running, OCR skipped, OCR timed out, and partial/native-only
  preparation.
