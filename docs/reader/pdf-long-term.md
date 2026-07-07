# PDF Reader Long-Term Architecture

This document records the PDF reader investigation and the long-term direction for Buddy's reader architecture. It covers the original problem, what was verified in local upstream checkouts, what Buddy currently does, why the current Foliate PDF path is structurally limited, and how to keep the same Buddy reader interface while replacing the PDF rendering engine.

## Decision

Buddy should keep one user-facing reader interface, but split the rendering engine by document type.

- EPUB and other reflowable ebook formats should keep using `foliate-js`.
- PDF should move to a dedicated PDF.js-backed engine.
- Highlights, bookmarks, search results, current location, chat selection, notes, and the reader toolbar/sidebar should belong to Buddy's reader shell, not to Foliate.

In other words:

```txt
Buddy DocumentReader shell
  owns the user interface, persistence, selections, annotations, bookmarks, search panel,
  location UI, preferences UI, and chat-selection integration

FoliateEngine
  handles EPUB/MOBI/AZW/FB2/CBZ-style book rendering
  anchors with CFI or Foliate navigation targets

PdfJsEngine
  handles PDF rendering
  anchors with page numbers, normalized page coordinates, text quotes, and page offsets
```

The long-term answer is not a short-term Foliate patch. The long-term answer is to make Buddy's reader UI engine-neutral and make PDF a first-class PDF reader underneath that interface.

## Original Problem

Buddy currently uses `foliate-js` for PDFs because it provides a common reading surface across formats:

- a shared reading view
- selection support
- highlight/note support
- search and navigation hooks
- bookmarks
- reader preferences
- a consistent Buddy toolbar/sidebar experience

The problem is that the PDF experience is poor on small screens.

The specific failure mode is not just "PDFs need zoom." It is that PDFs need a page-after-page vertical reading layout. On small screens, fixed full-page rendering forces each PDF page to stay too small. Textbook PDFs become almost impossible to read unless the user can zoom and then scroll continuously through pages.

The desired user behavior is:

- pages flow vertically, one after another
- fit-width is the default for narrow panes
- zoom can be adjusted without losing highlights
- selection and highlights still work
- bookmarks and notes still work
- the UI still feels like Buddy's reader, not like an embedded foreign PDF app

## Current Buddy State

The reader guidance lives in `docs/commands/build-reader.md`.

Relevant guidance from that file:

- reader components live in `packages/web/src/components/readers`
- Buddy uses `foliate-js`, not the GPL Foliate app code
- `~/code/foliate-js` is the API reference
- `~/code/foliate` is the behavior/UI reference
- implementation should be by analogy with the references, but Buddy cannot copy GPL Foliate app code

Buddy's `packages/web` dependency is currently pinned to:

```txt
github:johnfactotum/foliate-js#399248a67a8862ffb5e6463a33f9d52b317ca2eb
```

That is in `packages/web/package.json`.

The current React reader component is:

```txt
packages/web/src/components/readers/foliate-reader.tsx
```

The current PDF compatibility layer is:

```txt
packages/web/src/components/readers/utils/foliate-pdf-compat.ts
```

The current local type surface consumed from Foliate is:

```txt
packages/web/src/foliate-js.d.ts
```

The current storage helper is:

```txt
packages/web/src/components/readers/utils/foliate-storage.ts
```

The current reader already has more than the older inventory doc claimed. It includes:

- toolbar
- TOC popover
- search popover
- bookmarks
- annotations
- preferences
- selection toolbar
- annotation dialog
- location dialog
- persisted per-book state
- global preferences
- PDF-specific compatibility code for selection and overlay drawing

The important limitation is that this is still built around a Foliate-shaped anchor model.

Current persisted state shape is roughly:

```ts
type CurrentBookState = {
  lastLocation?: string
  bookmarks: ReaderBookmark[]
  annotations: ReaderAnnotation[]
}

type ReaderBookmark = {
  value: string
  label: string
  created: string
}

type ReaderAnnotation = FoliateAnnotationPayload & {
  label?: string
  index?: number
}
```

The key issue is `value: string`. For EPUB this is normally a CFI-like Foliate value. For PDF, Buddy currently bends this through Foliate's fixed-layout renderer. Long term, PDF annotations should not be encoded as Foliate strings.

## Verified Local Reference State

The local reference checkouts were verified as part of this investigation.

### `~/code/foliate-js`

Before updating, the local `foliate-js` checkout was on:

```txt
5ba02c71c9398a58ce837011e3a25163d229687a
```

It was behind `origin/main` by one commit. It was then fast-forwarded to:

```txt
78914aef4466eb960965702401634c2cb348e9b1
```

The newest upstream commits at the time of investigation were:

```txt
78914ae Use original hrefs for external links and add isExternal in fb2.js (#129)
76dcd8f OPDS: support non-standard and legacy link relations (#126)
5ba02c7 TTS: fix error & nodes getting skipped
6e13f24 Add draw options for search matches (#122)
9a67679 Fix MOBI anchors being calculated too late (#118)
```

The diff from Buddy's current pin `399248a...` to latest `78914ae...` touched:

```txt
fb2.js
mobi.js
opds.js
text-walker.js
tts.js
view.js
```

It did not add vertical PDF scrolling. It did not materially change `pdf.js`, `fixed-layout.js`, or `paginator.js` in a way that solves this problem.

The latest PDF-specific upstream commit found in `foliate-js` was:

```txt
1217096 Update PDF.js to 5.5.207
```

That commit updated embedded PDF.js, but it did not turn Foliate's fixed-layout PDF renderer into a continuous vertical PDF reader.

### `~/code/foliate`

The local Foliate app checkout is current on:

```txt
67b6676d3f936c5edea91d4d903385ef39dd25c0
```

The branch is:

```txt
gtk4
```

Its `src/foliate-js` submodule still points to:

```txt
399248a67a8862ffb5e6463a33f9d52b317ca2eb
```

That is the same commit Buddy is pinned to.

This means upgrading Buddy from `399248a...` to latest `foliate-js` would not track the Foliate app's current vendored submodule state, and it would not solve vertical PDF reading anyway.

## Corrected Assumptions

The initial user framing was directionally right but needed one correction.

It is not fully accurate to say Foliate's PDF support has not been updated at all for a long time. The embedded PDF.js dependency was updated in upstream `foliate-js` in 2026.

The important verified point is narrower and more relevant:

- Foliate's PDF rendering model still uses the fixed-layout renderer.
- The fixed-layout renderer still does not support vertical page-after-page PDF reading.
- The latest upstream checkout does not solve this.
- The official Foliate app still uses the same `foliate-js` commit Buddy is pinned to.

So the small-screen PDF problem remains valid.

## Foliate PDF Architecture

In `foliate-js/pdf.js`, `makePDF()` creates a book with:

```js
const book = { rendition: { layout: 'pre-paginated' } }
```

That is the root of the issue.

In `foliate-js/view.js`, `pre-paginated` selects the fixed-layout renderer:

```js
this.isFixedLayout = this.book.rendition?.layout === 'pre-paginated'
if (this.isFixedLayout) {
    await import('./fixed-layout.js')
    this.renderer = document.createElement('foliate-fxl')
} else {
    await import('./paginator.js')
    this.renderer = document.createElement('foliate-paginator')
}
```

So PDFs do not use `foliate-paginator`.

The reflowable paginator is the renderer that understands:

```txt
flow="scrolled"
```

The fixed-layout renderer instead observes only:

```txt
zoom
```

and accepts values such as:

```txt
fit-width
fit-page
numeric zoom
```

It has spread/page navigation and some scroll inside the current fixed-layout surface, but it does not have a continuous page list.

That distinction matters:

- `foliate-paginator` can switch between paginated and scrolled mode for reflowable content.
- `foliate-fxl` can fit or zoom a currently loaded fixed-layout spread/page.
- PDF uses `foliate-fxl`.
- Therefore PDF cannot become vertical page-after-page by setting Foliate's existing `flow` mode.

## Current Buddy PDF Modes

Buddy currently detects PDF sources and fixed-layout snapshots. It disables normal flow switching for fixed-layout sources:

```ts
const canChangeFlow = snapshot ? !snapshot.isFixedLayout : false
const canChangePdfView = sourceIsPdf && (snapshot?.isFixedLayout ?? false)
```

For PDFs, Buddy exposes three modes:

```ts
PDF_VIEW_MODE_FIT = "fit"
PDF_VIEW_MODE_FIT_WIDTH = "fit-width"
PDF_VIEW_MODE_SPREAD = "spread"
```

Those map to:

```ts
fit       -> spread: "none", zoom: "fit-page"
fit-width -> spread: "none", zoom: "fit-width"
spread    -> spread: "both", zoom: "fit-page"
```

This is useful, but it still cannot express continuous vertical page layout. It only configures Foliate fixed-layout spread and zoom behavior.

## Foliate App Behavior

The Foliate app has a `scrolled` setting and UI for reader flow. Its reader shell passes:

```js
flow: view.scrolled ? 'scrolled' : 'paginated'
```

to the browser-side renderer.

But because PDFs are fixed-layout, that setting does not turn the PDF renderer into the paginator. It is not a solved mobile PDF UX in the Foliate app either.

Foliate app also has WebView zoom actions:

```js
zoomIn() { this.#webView.zoom_level += 0.1 }
zoomOut() { this.#webView.zoom_level -= 0.1 }
zoomRestore() { this.#webView.zoom_level = 1 }
```

There is also a comment in Foliate app code:

```js
// TODO: disable this for fixed-layout
minimum_font_size: font.minimum_size,
```

This reinforces that the reference app does not provide a clean PDF-specific small-screen architecture. It mostly has app-level zoom over a fixed-layout rendering model.

## Upstream Maintainer Signals

The upstream README describes PDF support as proof-of-concept and experimental:

> There is a proof-of-concept, highly experimental adapter for PDF.js, with which you can show PDFs using the same fixed-layout renderer for EPUBs.

Issue #112 in `johnfactotum/foliate-js` asks how to change PDF view and vertical scrolling. The maintainer response:

> You can't. PDFs are shown using the same renderer as other fixed layout books, and that renderer is very bare-bones.

Issue #139 in `johnfactotum/foliate` contains earlier design discussion. Important points from maintainer comments:

- a plain embedded PDF.js viewer worked, but was not a great Foliate app experience
- annotations are the biggest problem if PDF support is implemented outside the common reader model
- the intended Foliate direction was to improve fixed-layout support first
- the fixed-layout renderer lacked zooming and continuous scrolling
- some PDF support was added, but described as basic, experimental, and needing fixed-layout renderer improvements

This aligns with the source code: Foliate's architecture is not currently the right long-term foundation for a high-quality small-screen PDF reader.

## PDF.js Capabilities Verified

PDF.js provides the primitives Buddy needs for a serious PDF reader:

- loading a PDF document
- fetching individual pages
- page viewports
- scale-based rendering
- HiDPI canvas rendering
- text layers
- annotation layers
- link services
- page labels
- outlines
- search primitives/controllers in the viewer layer
- rendering queues that prioritize visible pages
- vertical scroll mode in the viewer layer
- spread modes in the viewer layer

The official PDF.js examples show page rendering through:

```js
const page = await pdf.getPage(1)
const viewport = page.getViewport({ scale })
```

PDF.js documentation also warns against rendering every page at high resolution:

- canvases consume significant memory
- the demo viewer only creates/renders/holds canvases for visible pages
- the recommended approach is to render only visible pages

That is exactly what Buddy needs: a virtualized continuous viewer that renders visible pages plus overscan.

## Why Not Just Upgrade Foliate

Upgrading `foliate-js` does not solve the issue.

Verified reasons:

- latest `foliate-js` is ahead of Buddy's pin, but latest changes are not a vertical PDF layout solution
- latest PDF update is an embedded PDF.js version update, not a fixed-layout architecture change
- official Foliate app still points its submodule to Buddy's current pin
- upstream maintainer explicitly says the PDF view cannot be changed to vertical in the current fixed-layout renderer

An upgrade may still be useful later for unrelated fixes, but it is not the long-term PDF experience solution.

## Why Not Patch Foliate Fixed Layout

Patching `foliate-js/fixed-layout.js` could force better single-page or fit-width behavior.

A community workaround in issue #112 suggests:

- set renderer zoom to `fit-width`
- force portrait/single-page behavior below a wide threshold

That can improve narrow-pane reading, but it is not continuous vertical page-after-page reading.

To make Foliate fixed-layout a real PDF reader, Buddy would need to add:

- continuous page list layout
- page virtualization
- zoom model
- visible page tracking
- selection across pages
- highlight overlays across pages
- search result mapping
- page-label navigation
- scroll restoration
- memory management

At that point Buddy would effectively be writing a PDF viewer inside Foliate's fixed-layout abstraction. PDF.js already has many of these primitives and is purpose-built for PDFs.

## Why Not Embed PDF.js Viewer As-Is

Embedding the stock PDF.js viewer would solve many PDF behaviors quickly, but it would not keep Buddy's reader interface the same.

Problems:

- foreign toolbar and sidebar
- separate search UI
- separate outline UI
- separate annotation model
- harder chat-selection integration
- harder source-system integration
- harder consistent keyboard shortcut model
- harder theme and layout integration
- harder persistence using Buddy resource identity

The stock viewer is a useful reference, but Buddy should not expose it as the product surface.

Buddy should use PDF.js as an engine/toolkit, not as the user-facing app.

## Why Not Convert PDF To EPUB

Converting PDF to fixed-layout EPUB or HTML would not solve the core problem cleanly.

Problems:

- PDF text order can be messy
- scanned/image PDFs have no reliable text layer without OCR
- layout conversion can destroy page coordinates
- generated HTML would still need a PDF-like page model for highlights
- conversion adds a preparation pipeline before reading
- continuous reading still needs a renderer

The source system may prepare PDFs for extraction, OCR, or AI grounding. That is separate from the reader's visual PDF renderer.

## Long-Term Architecture

The long-term architecture should be:

```txt
DocumentReader
  ReaderShell
    Toolbar
    Sidebar
    SearchPanel
    BookmarksPanel
    AnnotationsPanel
    PreferencesPanel
    SelectionToolbar
    AnnotationDialog
    LocationDialog
    ChatSelectionBridge

  ReaderEngine
    FoliateEngine
    PdfJsEngine
```

The shell owns all UI state that should feel identical across formats.

The engine owns only format-specific rendering and anchor resolution.

## Engine Contract

The engine contract should be explicit and Buddy-owned. It should not expose Foliate types directly to the shell.

Conceptual shape:

```ts
type ReaderEngineKind = "foliate" | "pdf"

type ReaderEngine = {
  kind: ReaderEngineKind
  open: (source: ReaderSource) => Promise<ReaderSnapshot>
  destroy: () => void

  goTo: (anchor: ReaderAnchor) => Promise<void>
  getCurrentLocation: () => ReaderLocation
  getSelection: () => ReaderSelection | null
  clearSelection: () => void

  search: (request: ReaderSearchRequest) => AsyncGenerator<ReaderSearchEvent>
  clearSearch: () => void
  showSearchResult: (result: ReaderSearchResult) => Promise<void>

  addAnnotation: (annotation: ReaderAnnotation) => Promise<void>
  deleteAnnotation: (annotation: ReaderAnnotation) => Promise<void>
  showAnnotation: (annotation: ReaderAnnotation) => Promise<void>

  addBookmark: (bookmark: ReaderBookmark) => Promise<void>
  setMode: (mode: ReaderMode) => Promise<void>
}
```

This is not intended as final API code. It is the boundary idea: the shell calls Buddy reader concepts, not Foliate APIs.

## Shared Data Model

Buddy should store reader state using a format-neutral model.

```ts
type ReaderDocumentIdentity = {
  sourceId: string
  format: "epub" | "pdf" | "mobi" | "azw" | "fb2" | "cbz"
  title?: string
  author?: string
  fingerprint?: string
}

type ReaderAnchor =
  | FoliateAnchor
  | PdfAnchor

type FoliateAnchor = {
  engine: "foliate"
  cfi: string
  sectionIndex?: number
  fraction?: number
}

type PdfAnchor = {
  engine: "pdf"
  pageIndex: number
  pageLabel?: string
  yRatio?: number
  rects?: NormalizedPdfRect[]
  textQuote?: string
  textHash?: string
}

type NormalizedPdfRect = {
  x: number
  y: number
  width: number
  height: number
}

type ReaderBookmark = {
  id: string
  anchor: ReaderAnchor
  label: string
  created: string
}

type ReaderAnnotation = {
  id: string
  anchor: ReaderAnchor
  text: string
  note: string
  color: string
  style: "highlight" | "underline" | "squiggly" | "strikethrough"
  created: string
  modified: string
}
```

The key change is that the anchor becomes a union.

- EPUB annotations use Foliate CFI.
- PDF annotations use page index plus normalized page rectangles and text quote metadata.

The UI does not care which kind it receives. The engine does.

## Highlights In Foliate Modes

For Foliate-backed formats:

- selection comes from Foliate-rendered document ranges
- anchor is CFI or another Foliate navigation target
- highlight drawing uses Foliate/overlayer behavior
- changing between paginated and scrolled modes should preserve highlights because CFI remains the logical anchor
- bookmarks use the current CFI
- search results use Foliate search CFIs

Foliate mode preferences remain relevant:

```txt
paginated
scrolled
font preset
font scale
line height
margin
gap
max inline size
max block size
justify
hyphenate
```

These are text/book preferences. They should not be forced onto PDF.

## Highlights In PDF Modes

For PDF-backed sources:

- selection comes from the PDF.js text layer
- the PDF engine identifies which page each selected rect belongs to
- selected DOM rects are converted into page-relative normalized rectangles
- normalized rectangles are stored in `PdfAnchor.rects`
- text content is stored as `textQuote`
- a hash/fingerprint of selected text can be stored as `textHash` for best-effort validation

Example:

```ts
type PdfAnchor = {
  engine: "pdf"
  pageIndex: 42
  pageLabel: "43"
  rects: [
    { x: 0.12, y: 0.34, width: 0.48, height: 0.018 },
    { x: 0.12, y: 0.36, width: 0.31, height: 0.018 },
  ]
  textQuote: "The selected sentence from the PDF text layer..."
  textHash: "..."
}
```

When the user changes PDF mode:

- continuous vertical
- single-page
- two-up
- fit-width
- fit-page
- explicit zoom
- rotation

the stored rectangles remain valid because they are page-coordinate anchors, not screen-coordinate anchors.

On render, the PDF engine maps normalized page rectangles back into overlay positions using the current page viewport and page DOM bounds.

This is the important answer to the highlights question: highlights do not move with Foliate. They move with Buddy's neutral annotation model. Foliate and PDF.js each know how to draw their own anchor kind.

## Bookmarks

Bookmarks should use the same anchor union.

For Foliate:

```ts
type FoliateBookmark = {
  anchor: {
    engine: "foliate"
    cfi: string
  }
}
```

For PDF:

```ts
type PdfBookmark = {
  anchor: {
    engine: "pdf"
    pageIndex: number
    pageLabel?: string
    yRatio?: number
  }
}
```

`yRatio` is the normalized vertical offset within the page. It lets Buddy restore a position inside a page, not only the top of the page.

The bookmarks UI can stay the same:

- list label
- created date
- current bookmark state
- add/remove bookmark button
- click to navigate

The engine decides how to navigate.

## Search

Search should also become engine-neutral at the shell boundary.

For Foliate:

- use Foliate's existing `view.search()`
- search results carry CFI anchors
- `showSearchResult` calls Foliate navigation/select APIs

For PDF:

- use PDF.js text content/search facilities
- search results carry page index and normalized rect anchors
- result snippets use text content around the match
- `showSearchResult` scrolls to page and draws/activates the match overlay

The search popover/panel should stay Buddy-owned.

The rows should become:

```ts
type ReaderSearchRow =
  | {
      kind: "section"
      label: string
    }
  | {
      kind: "result"
      label?: string
      excerpt: {
        pre: string
        match: string
        post: string
      }
      anchor: ReaderAnchor
    }
```

This removes the current `activeResultCfi` assumption from the shared UI.

## PDF Reader Modes

PDF modes should be separate from Foliate text-flow modes.

```ts
type PdfReaderMode = {
  layout: "continuous" | "single-page" | "two-up"
  scaleMode: "fit-width" | "fit-page" | "custom"
  scale?: number
  rotation: 0 | 90 | 180 | 270
}
```

The default for small screens should be:

```ts
{
  layout: "continuous",
  scaleMode: "fit-width",
  rotation: 0,
}
```

The default for larger reading panes can still be continuous fit-width, with optional two-up as a user mode.

The long-term product default should optimize reading, not mimic a print preview.

## Shared Preferences

Some reader preferences remain shared:

- theme
- annotation colors
- annotation style
- reduce motion
- autohide chrome/cursor behavior
- sidebar/tool visibility
- keyboard shortcut handling

Some preferences are Foliate-only:

- font preset
- font scale
- line height
- text margin
- hyphenation
- justification
- paginated vs scrolled text flow

Some preferences are PDF-only:

- continuous/single/two-up layout
- zoom mode
- numeric zoom
- rotation
- page spacing
- show/hide page shadows

The preferences UI can stay in the same place, but it should render engine-specific controls depending on the active source.

## Persistence

Current state uses localStorage through `foliate-storage.ts`. Long term, the state should be renamed and versioned as Buddy reader state, not Foliate reader state.

Suggested direction:

```txt
buddy:reader:preferences:v2
buddy:reader:document:v2:<document-id>
```

Document state:

```ts
type ReaderDocumentState = {
  version: 2
  identity: ReaderDocumentIdentity
  lastLocation?: ReaderAnchor
  bookmarks: ReaderBookmark[]
  annotations: ReaderAnnotation[]
  enginePreferences?: {
    foliate?: FoliateReaderMode
    pdf?: PdfReaderMode
  }
}
```

The document identity should be more stable than title/author alone. For resources, prefer a Buddy resource/object id. For loose files, use a fingerprint if available, or the current title/author/source fallback.

## Migration

Buddy is currently single-user and backward compatibility is not a hard requirement, but losing personal highlights is still bad product behavior.

Migration should be best-effort and should not compromise the new architecture.

### EPUB and reflowable formats

Existing persisted `ReaderBookmark.value` and `ReaderAnnotation.value` can be wrapped as:

```ts
{
  engine: "foliate",
  cfi: old.value
}
```

This migration is straightforward.

### Existing PDFs stored through Foliate

Existing PDF highlights are harder because they are stored as Foliate values over the fixed-layout PDF adapter.

Options:

1. Best-effort migration while the Foliate PDF path still exists:
   - open the PDF using the old Foliate engine
   - resolve the old annotation value
   - find page index and range rects
   - convert rects to normalized PDF page coordinates
   - store a new `PdfAnchor`

2. Keep legacy entries visible but mark them unavailable until migrated:
   - preserve text/note/color/style
   - show a "legacy PDF highlight" state
   - do not block the new engine on perfect conversion

3. Drop old PDF highlight anchors if the migration is too brittle:
   - acceptable only if there is little real user data
   - should be a deliberate product call, not an accidental side effect

The preferred path is option 1 for real user data, with option 2 as fallback. Do not keep Foliate PDF rendering around forever just to support old anchors.

## PDF.js Engine Design

The PDF engine should be a native Buddy component, not an iframe around the generic PDF.js viewer.

Core pieces:

- load PDF from Buddy's source/blob pipeline
- configure `pdfjsLib.GlobalWorkerOptions.workerSrc`
- parse metadata and outline
- create a scroll container for pages
- virtualize pages using `@tanstack/react-virtual` or an equivalent page virtualization strategy
- render visible pages plus overscan
- render canvas layer
- render text layer
- render annotation/link layer
- render Buddy highlight overlay layer
- track visible page and current location
- expose page navigation and search through the `ReaderEngine` contract

Layer structure per page:

```txt
PdfPage
  canvas layer
  text layer
  PDF annotation/link layer
  Buddy highlight overlay layer
  Buddy search overlay layer
```

The highlight overlay layer should sit above text/canvas but below transient popovers.

## Page Virtualization And Performance

PDFs can be hundreds or thousands of pages. Rendering every page at high DPI is not viable.

The engine should:

- keep page measurements stable
- render visible pages plus a small overscan
- cancel render tasks when pages leave overscan
- cache rendered pages carefully
- release canvases when memory pressure is high
- re-render at the current zoom only when necessary
- debounce resize and zoom changes
- preserve scroll anchor on zoom changes

PDF.js's own FAQ recommends rendering only visible pages. Buddy should follow that approach.

## Selection And Chat Integration

The existing Buddy selection toolbar should remain.

For Foliate:

- selection range comes from the Foliate iframe document
- engine returns selected text, CFI, section index, and screen position

For PDF:

- selection range comes from the PDF.js text layer
- engine maps selection rects to PDF page coordinates
- engine returns selected text, `PdfAnchor`, page label, and screen position

Shared shell behavior:

- show selection toolbar
- send `onChatSelection`
- remove transient chat selection when dismissed
- create annotation/note from selection
- copy selected text

The chat layer should receive a normalized selection:

```ts
type ReaderSelection = {
  text: string
  anchor: ReaderAnchor
  selectionKey: string
  label?: string
}
```

This removes CFI assumptions from chat context.

## Annotation Rendering

For Foliate:

- continue using Foliate's annotation and overlayer behavior
- CFI resolves to DOM range
- draw highlight/underline/squiggly/strikethrough using existing drawing helpers

For PDF:

- draw Buddy-owned SVG/HTML overlays on top of PDF pages
- use normalized rectangles from `PdfAnchor.rects`
- support the same visual styles:
  - highlight
  - underline
  - squiggly
  - strikethrough
- note marker rendering should be independent of engine

Existing drawing helpers may be reusable if they can operate on rect collections instead of live DOM ranges. If not, create PDF-specific drawing helpers and keep the style tokens shared.

## Outline, Page Labels, And Location

Foliate:

- TOC comes from `book.toc`
- page list comes from `book.pageList`
- location comes from Foliate relocation detail
- progress can be fraction/CFI

PDF:

- outline comes from `pdf.getOutline()`
- page labels should come from PDF.js page label APIs if available
- location should be current visible page plus page offset
- progress should be page-based:

```ts
type PdfLocation = {
  engine: "pdf"
  pageIndex: number
  pageLabel?: string
  pageCount: number
  yRatio?: number
  fraction: number
}
```

The location dialog can remain the same shell feature, but should offer page-oriented jumps for PDF.

## Theme And Dark Mode

Current Buddy PDF theming through Foliate applies CSS filters to the fixed-layout renderer. That can continue conceptually, but the PDF.js engine should own it explicitly.

Options:

- keep PDF canvas unmodified in light themes
- use CSS filter for dark themes, as Buddy currently does
- keep overlays unfiltered so highlight colors remain stable
- consider a future "invert PDF" toggle separate from global theme

Do not make dark mode block the engine split.

## Source System Fit

This work aligns with the source-system lane.

The reader should not be responsible for PDF ingestion, OCR, or semantic chunking. Those belong to source/resource preparation.

The reader should expose:

- visual page location
- selected text
- annotation anchors
- page references
- source/resource id

That gives the agent and source system stable references:

```txt
resource id + page label/index + selected text + optional normalized rects
```

This is closer to what users expect from source-grounded research systems.

## Rejected Long-Term Paths

### Keep Foliate PDF and only improve zoom

Rejected as the primary long-term plan.

Fit-width and numeric zoom are useful, but they do not solve continuous page reading.

### Fork GPL Foliate app behavior

Rejected.

Buddy can study the app, but must not copy GPL app code into Buddy-owned code.

### Depend on the published `foliate-js@1.0.1`

Rejected.

The repo already documents that the published package lacked the PDF adapter/assets and failed PDF smoke tests.

### Convert all PDFs to fixed-layout EPUB

Rejected as the reader strategy.

It adds conversion fragility and still does not solve the need for a first-class PDF page model.

### Use native OS PDF views

Not the preferred path.

Native PDF views could be fast, but Buddy needs a web/Electron renderer with selection, overlays, annotations, chat integration, and consistent UI across macOS and Windows.

## Implementation Plan

### Phase 1: Extract the shell

Goal: make `FoliateReader` stop being the conceptual owner of the reader product.

Steps:

- introduce `DocumentReader`
- move toolbar/sidebar/dialog/popover components under neutral names over time
- define Buddy reader types:
  - `ReaderAnchor`
  - `ReaderLocation`
  - `ReaderSelection`
  - `ReaderAnnotation`
  - `ReaderBookmark`
  - `ReaderSearchResult`
- keep Foliate behavior unchanged behind `FoliateEngine`

This phase should not change user behavior.

### Phase 2: Version persistence

Goal: make persistence engine-neutral.

Steps:

- create `reader-storage.ts`
- introduce v2 keys
- migrate existing Foliate state into v2 Foliate anchors
- leave current v1 reader state readable during transition

### Phase 3: Build `PdfJsEngine` skeleton

Goal: open PDFs with PDF.js in Buddy's shell.

Steps:

- add PDF.js dependency or use existing bundled PDF.js strategy intentionally
- configure worker and asset loading for Vite/Electron
- render continuous vertical pages
- implement fit-width default
- implement visible-page tracking
- implement `goTo` for page anchors
- implement current location updates

### Phase 4: Add PDF selection and annotations

Goal: match Buddy's existing highlight/note workflow.

Steps:

- render text layer
- detect selection across page text layers
- convert selection rects to normalized page coordinates
- show the existing selection toolbar
- create annotations with `PdfAnchor`
- render stored PDF annotations as overlays
- support show/delete/update annotation

### Phase 5: Add PDF search, outline, bookmarks

Goal: make PDFs feature-complete in the shared interface.

Steps:

- load outline
- render outline in existing TOC UI
- implement page search
- show search results in existing search UI
- implement PDF bookmarks using page/y anchors
- implement location dialog page jumps

### Phase 6: Remove Foliate PDF as the default

Goal: stop routing PDFs through Foliate.

Steps:

- route PDF sources to `PdfJsEngine`
- keep Foliate for EPUB/MOBI/AZW/FB2/CBZ
- optionally keep a debug flag for old Foliate PDF during migration
- remove Foliate PDF compatibility code after migration confidence is high

## Verification Plan

For code changes, Buddy's normal completion requirement applies:

- `bun lint`
- `bun typecheck` from repository root

For reader behavior, add targeted verification:

- desktop viewport screenshot
- narrow/mobile-width viewport screenshot
- PDF continuous vertical pages render nonblank
- fit-width default is readable on narrow width
- zoom preserves current page and highlight positions
- highlights survive mode changes
- bookmarks navigate correctly
- search result navigation works
- text selection toolbar appears in the correct screen position
- no page canvas is rendered for every page in a large document
- memory does not grow unbounded while scrolling

Use Playwright for visual checks where possible. For canvas views, include pixel/nonblank checks so tests do not pass with empty pages.

## Risks

### Text selection accuracy

PDF text layers can be imperfect. Some PDFs have poor text order or missing text.

Mitigation:

- store selected text quote
- store normalized rects
- support image-only pages as view-only until OCR/source preparation exists

### Annotation stability

Page-coordinate highlights are stable across zoom, but not across a changed PDF file.

Mitigation:

- use resource identity/fingerprint
- store page label and text quote as fallback context

### Memory usage

Continuous PDF viewers can use too much memory if every page is rendered.

Mitigation:

- virtualize pages
- cancel offscreen render tasks
- release canvases outside overscan

### Worker and asset setup

PDF.js worker and assets can be annoying under Vite/Electron.

Mitigation:

- centralize PDF.js runtime setup
- avoid ad hoc imports throughout the app
- verify production Electron build, not only Vite dev

### Feature parity pressure

PDF.js has many features Buddy may not need immediately.

Mitigation:

- implement reading, selection, highlights, bookmarks, outline, search, zoom first
- defer forms, signing, embedded annotation editing, and PDF file mutation

## Open Questions

- Should PDF.js be consumed directly from `pdfjs-dist`, or should Buddy reuse the PDF.js bundled inside `foliate-js` temporarily?
- Should reader state remain in localStorage for now, or move into Buddy's object/resource system as part of source-system work?
- How much effort should be spent migrating existing Foliate-backed PDF annotations?
- Should PDF dark mode default to filtered/inverted rendering, or should it remain opt-in?
- Should two-up PDF mode be desktop-only by default?

## Final Position

Buddy should not let Foliate's PDF adapter define Buddy's PDF product.

Foliate remains a good ebook engine. PDF.js is the right PDF rendering foundation. Buddy's own reader shell should be the stable product interface across both.

Highlights, bookmarks, notes, search, chat selection, and preferences should become Buddy reader concepts with engine-specific anchors. Foliate modes keep working for Foliate anchors. PDF modes work through PDF page anchors. The user sees one reader; the code gets two engines.
