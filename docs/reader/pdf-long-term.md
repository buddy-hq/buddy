# PDF Reader Long-Term Architecture

This document records the PDF reader investigation and the long-term direction for Buddy's reader architecture. It covers the original problem, what was verified in local upstream checkouts, what Buddy currently does, why the current Foliate PDF path is structurally limited, and how to keep the same Buddy reader interface while replacing the PDF rendering engine.

## Decision

Buddy should keep one user-facing reader interface, but split the rendering engine by document type.

- EPUB and other reflowable ebook formats should keep using `foliate-js`.
- PDF should move to a dedicated PDF.js-backed engine.
- Highlights, bookmarks, search results, current location, chat selection, notes, and the reader toolbar/panels should belong to Buddy's reader shell, not to Foliate.
- Buddy should build its PDF surface from PDF.js's exported viewer components, not embed the stock viewer application and not begin by rebuilding its rendering queue from the low-level display API.

In other words:

```txt
Buddy DocumentReader shell
  owns the user interface, persistence, selections, annotations, bookmarks, search panel,
  location UI, preferences UI, and chat-selection integration

FoliateEngine
  handles the currently supported EPUB route and remains extensible to other ebook formats
  anchors with CFI or Foliate navigation targets

PdfJsEngine
  wraps PDF.js viewer-layer components behind a small Buddy-owned adapter
  handles PDF rendering, navigation, selection extraction, search, and location events
  anchors with canonical PDF page coordinates, text quotes, and page offsets
```

The long-term answer is not a short-term Foliate patch. The long-term answer is to make Buddy's reader UI engine-neutral and make PDF a first-class PDF reader underneath that interface.

This is one end-to-end delivery, not a sequence of independently releasable partial readers. The new PDF path remains internal until it reaches current Buddy PDF feature parity and passes the cutover gates in this document. Shared shell behavior should still be extracted incrementally during implementation so the architecture is proven by working features rather than a speculative full rewrite.

## Original Problem

Buddy currently uses `foliate-js` for PDFs because it provides a common reading surface across formats:

- a shared reading view
- selection support
- highlight/note support
- search and navigation hooks
- bookmarks
- reader preferences
- a consistent Buddy toolbar and panel experience

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

The current reader already has more than the older inventory doc claimed. The live production route includes:

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

There is an older `FoliateSidebar` component and a set of reader hooks in the tree, but the live `FoliateReader` does not mount that sidebar or use those hooks. They are not part of the parity baseline. Likewise, production resource discovery currently routes only `.epub` and `.pdf` files into the reader. MOBI, AZW, FB2, and CBZ are engine capabilities or future extensions, not current production routes.

The existing PDF route also has important gaps that must not be mislabeled as working parity requirements:

- its whole-document search does not produce useful PDF results because Foliate PDF sections do not expose the document factory used by Foliate search
- it has a table of contents when the PDF exposes an outline, but no PDF page-label/page-list model
- it has fit-page, fit-width, and spread modes, but no continuous layout, persisted PDF mode, arbitrary numeric zoom control, or rotation control
- it supports selection and annotation on a rendered page, but not a deliberate cross-page selection contract
- it has no dedicated password prompt

The new engine must preserve every working behavior and may improve these known gaps. “Feature parity” in this document never means reproducing a broken search path or inventing a legacy sidebar requirement.

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

The official PDF.js getting-started guidance distinguishes the core, display, and viewer layers and describes the viewer as a useful starting point for a custom viewer. Buddy should therefore reuse exported viewer components while replacing the stock application shell.

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

That is exactly what Buddy needs: a viewer-managed continuous surface with bounded visible-page canvas rendering.

Primary references:

- [PDF.js getting started and layer overview](https://mozilla.github.io/pdf.js/getting_started/)
- [PDF.js API documentation](https://mozilla.github.io/pdf.js/api/)
- [PDF.js memory and worker-version guidance](https://github.com/mozilla/pdf.js/wiki/frequently-asked-questions)

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
    PopoversAndPanels
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

The contract should also preserve ownership boundaries:

- the shell/controller owns bookmark and annotation collections, persistence, dialogs, panels, and chat integration
- the engine owns format-specific rendering, navigation, selection extraction, search execution, and location events
- the engine receives annotations to render; it does not own the authoritative annotation collection
- bookmarks do not need engine CRUD methods because navigation already operates on anchors
- all long-running engine operations need cancellation or stale-run protection
- the shell should branch on declared capabilities, not scatter checks for a particular engine kind

Conceptual shape:

```ts
type ReaderEngineKind = "foliate" | "pdf"

type ReaderEngineCapabilities = {
  textFlow: boolean
  pageLayouts: boolean
  search: boolean
  outline: boolean
  pageLabels: boolean
  textSelection: boolean
  annotations: boolean
}

type ReaderEngineCallbacks = {
  onReady: (snapshot: ReaderSnapshot) => void
  onLocationChange: (location: ReaderLocation) => void
  onSelectionChange: (selection: ReaderSelection | null) => void
  onError: (error: Error) => void
}

type ReaderEngineFactory = {
  open: (
    source: ReaderSource,
    callbacks: ReaderEngineCallbacks,
    signal?: AbortSignal,
  ) => Promise<ReaderEngineSession>
}

type ReaderEngineSession = {
  kind: ReaderEngineKind
  capabilities: ReaderEngineCapabilities

  goTo: (anchor: ReaderPositionAnchor, signal?: AbortSignal) => Promise<void>
  getCurrentLocation: () => ReaderLocation
  getSelection: () => ReaderSelection | null
  clearSelection: () => void

  search: (
    request: ReaderSearchRequest,
    signal?: AbortSignal,
  ) => AsyncGenerator<ReaderSearchEvent>
  clearSearch: () => void
  showSearchResult: (result: ReaderSearchResult) => Promise<void>

  setAnnotations: (annotations: ReaderAnnotation[]) => Promise<void>
  showAnnotation: (annotation: ReaderAnnotation, signal?: AbortSignal) => Promise<void>

  setMode: (mode: ReaderMode) => Promise<void>
  destroy: () => Promise<void>
}
```

This is not intended as final API code. React components or hooks may own `open` and `destroy` rather than exposing a fully imperative object. The boundary idea is what matters: the shell calls Buddy reader concepts, receives explicit events, and keeps product state outside the renderer.

## Shared Data Model

Buddy should store reader state using a format-neutral model.

Persisted anchors should describe an addressing scheme, not the engine implementation that currently renders it. Use anchor kinds such as `cfi-position` and `pdf-text`, not `engine: "foliate"`. This avoids coupling stored user data to a replaceable renderer.

Position anchors and text anchors should be separate types. Bookmarks and last-location state require a position. Annotations and text search results require a text range. A single type with many optional fields permits invalid combinations.

```ts
type ReaderDocumentIdentity = {
  sourceId: string
  format: "epub" | "pdf" | "mobi" | "azw" | "fb2" | "cbz"
  title?: string
  author?: string
  contentFingerprint?: string
}

type ReaderPositionAnchor = CfiPositionAnchor | PdfPositionAnchor

type ReaderTextAnchor = CfiTextAnchor | PdfTextAnchor

type CfiPositionAnchor = {
  kind: "cfi-position"
  cfi: string
  sectionIndex?: number
  fraction?: number
}

type CfiTextAnchor = {
  kind: "cfi-text"
  cfi: string
  sectionIndex?: number
}

type PdfPositionAnchor = {
  kind: "pdf-position"
  pageIndex: number
  pageLabel?: string
  xRatio: number
  yRatio: number
}

type PdfPoint = {
  x: number
  y: number
}

type PdfQuad = {
  topLeft: PdfPoint
  topRight: PdfPoint
  bottomRight: PdfPoint
  bottomLeft: PdfPoint
}

type PdfTextSegment = {
  pageIndex: number
  quads: PdfQuad[]
  startOffset?: number
  endOffset?: number
}

type PdfTextAnchor = {
  kind: "pdf-text"
  segments: PdfTextSegment[]
  quote: {
    exact: string
    prefix?: string
    suffix?: string
  }
}

type ReaderBookmark = {
  id: string
  anchor: ReaderPositionAnchor
  label: string
  created: string
}

type ReaderAnnotation = {
  id: string
  anchor: ReaderTextAnchor
  text: string
  note: string
  color: string
  style: "highlight" | "underline" | "squiggly" | "strikethrough"
  created: string
  modified: string
}
```

PDF quads must use a documented canonical coordinate system: unrotated PDF user space relative to the page crop box. Convert DOM selection points through the active PDF.js page viewport before persistence. Do not persist coordinates in the currently scaled or rotated DOM coordinate system.

The `segments` array allows one selection to span multiple pages. `pageIndex` is the stable navigation identity within a particular PDF; `pageLabel` is display metadata. The exact quote plus optional prefix and suffix provides recovery context when text-layer segmentation changes.

For Buddy resources, `sourceId` should be the object/resource id. If an object id is not available, use a stable directory-plus-resource-path identity. Use `contentFingerprint` to detect that the bytes behind an identity changed; do not derive identity from title and author alone.

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
- the PDF engine identifies which page each selected quad belongs to
- selected DOM geometry is converted through each page viewport into canonical, unrotated PDF coordinates
- page-specific quads are stored in `PdfTextAnchor.segments`
- the exact selected text plus optional prefix and suffix are stored as quote context
- selections spanning pages produce multiple `PdfTextSegment` values

Example:

```ts
type PdfTextAnchor = {
  kind: "pdf-text"
  segments: [
    {
      pageIndex: 42
      quads: PdfQuad[]
      startOffset: 318
      endOffset: 381
    },
  ]
  quote: {
    exact: "The selected sentence from the PDF text layer..."
    prefix: "Text before the selection"
    suffix: "Text after the selection"
  }
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

the stored quads remain valid because they are canonical PDF coordinates, not screen coordinates or coordinates from the currently rotated viewport.

On render, the PDF engine maps canonical quads through the current page viewport into overlay positions.

This is the important answer to the highlights question: highlights do not move with Foliate. They move with Buddy's neutral annotation model. Foliate and PDF.js each know how to draw their own anchor kind.

## Bookmarks

Bookmarks should use the same anchor union.

For Foliate:

```ts
type FoliateBookmark = {
  anchor: {
    kind: "cfi-position"
    cfi: string
  }
}
```

For PDF:

```ts
type PdfBookmark = {
  anchor: {
    kind: "pdf-position"
    pageIndex: number
    pageLabel?: string
    xRatio: number
    yRatio: number
  }
}
```

`xRatio` and `yRatio` are normalized offsets within the page. Together they let Buddy restore a position inside a page through zoom and every rotation, not only the top of the page.

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
- search results carry `PdfTextAnchor` values
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
      anchor: ReaderTextAnchor
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
- reduce motion
- autohide chrome/cursor behavior
- panel/tool visibility where the shell persists it
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

Current state uses localStorage through `foliate-storage.ts`. The new design should introduce a Buddy-owned, versioned `ReaderStateRepository` boundary and keep localStorage as its first implementation. Moving state into Buddy's object/resource system is a separate project and should not be coupled to the PDF renderer migration.

Persisted data must be runtime-validated from `unknown` before use. During the transition, read v2 first, fall back to v1 where migration is supported, and write only v2.

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
  lastLocation?: ReaderPositionAnchor
  bookmarks: ReaderBookmark[]
  annotations: ReaderAnnotation[]
  enginePreferences?: {
    foliate?: FoliateReaderMode
    pdf?: PdfReaderMode
  }
}
```

The document identity should be more stable than title/author alone. For resources, use a Buddy resource/object id when available and otherwise use the normalized directory-plus-resource path. A content fingerprint detects changed bytes. Do not silently apply old page-coordinate annotations to a changed PDF.

## Migration

Buddy is currently single-user and backward compatibility is not a hard requirement, but losing personal highlights is still bad product behavior.

Migration should be best-effort and should not compromise the new architecture.

### EPUB and reflowable formats

Existing persisted `ReaderBookmark.value` and `ReaderAnnotation.value` can be wrapped as:

```ts
{
  kind: "cfi-position",
  cfi: old.value
}
```

Annotations should use `kind: "cfi-text"`. This migration is straightforward.

### Existing PDFs stored through Foliate

Existing PDF highlights are harder because they are stored as Foliate values over the fixed-layout PDF adapter.

The implementation uses a deliberate two-tier migration:

1. When full range geometry can be resolved safely, convert it while the Foliate PDF path still exists:
   - open the PDF using the old Foliate engine
   - resolve the old annotation value
   - find page index and range rects
   - convert rects into canonical, unrotated PDF coordinates
   - store a new `PdfTextAnchor`

2. Otherwise import a navigation-safe legacy entry without inventing geometry:
   - preserve text/note/color/style
   - derive the zero-based PDF page from Foliate's saved section index or fake CFI base
   - store a `pdf-text` segment with offsets/quads absent, so the item remains visible and can navigate to its page but is not drawn at a fabricated location
   - leave the v1 record untouched as a recovery/export source

Buddy must not silently drop a legacy PDF entry or fabricate a highlight rectangle. New writes use v2 only. The importer matches a bounded v1 record using the normalized filename plus the existing notebook persistence suffix, validates every field, and ignores ambiguous or malformed records.

Local Buddy profiles were checked for the v1 key prefix and do contain legacy reader records, so an accidental discard is not acceptable. The navigation-safe tier allows the Foliate PDF renderer to be removed without claiming that unavailable historical DOM rectangles were recovered exactly.

## PDF.js Engine Design

The PDF engine should be a native Buddy component built from PDF.js's exported viewer-layer pieces. It should not be an iframe around the generic viewer application, and Buddy should not initially rebuild the viewer's rendering queue from low-level page APIs.

Use a direct, exact `pdfjs-dist` dependency in `packages/web`. Do not reach into Foliate's bundled PDF.js copy. The API module and worker must come from the same package version, and the worker, CMaps, standard fonts, WASM, and viewer CSS/assets must be bundled locally for Vite and packaged Electron. Do not depend on a CDN.

The initial adapter should evaluate and wrap the public exports that Buddy needs:

- `PDFViewer`
- `PDFLinkService`
- `PDFFindController`
- `EventBus`
- `ScrollMode`
- `SpreadMode`

Use the viewer layer for page layout, current-page tracking, scale modes, rotation, rendering queues, text layers, and link/annotation layers. Keep Buddy's own toolbar, panels, search results UI, persistence, annotation model, and chat-selection integration. Avoid depending on underscored/private viewer fields; if the find controller's public events are insufficient for Buddy's result list, implement a small cancellable text-search service through the display API instead of reading private state.

Core pieces:

- load PDF from Buddy's source/blob pipeline
- centralize PDF.js runtime and asset configuration
- parse metadata and outline
- give `PDFViewer` one clear scroll container
- configure continuous vertical, single-page, and two-up modes through PDF.js viewer modes
- configure fit-width, fit-page, custom scale, and rotation through the viewer adapter
- use PDF.js's rendering queue and page-view buffer
- render Buddy highlight overlay layer
- track visible page and current location
- expose navigation, search, selection, and location events through the Buddy engine contract
- cancel source loads, searches, and stale asynchronous work when the source changes or the reader unmounts

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

PDF.js's viewer already prioritizes visible pages and keeps a bounded buffer of expensive rendered canvases. It may retain lightweight page-view DOM for the document, so the performance gate must measure canvas/render retention rather than incorrectly requiring a bounded count of page wrapper elements. Buddy should use and measure that behavior before introducing a second virtualization system. Combining `PDFViewer` with `@tanstack/react-virtual` would create competing ownership of the scroll container, page mounting, measurements, selection layers, and keyboard behavior.

The initial engine should:

- preserve one scroll owner
- keep page measurements stable across mixed page sizes
- rely on the PDF.js rendering queue and page-view buffer for visible-page rendering and canvas release
- re-render at the current zoom only when necessary
- respond to container resize rather than viewport breakpoints because the Bench pane is resizable
- preserve scroll anchor on zoom changes
- verify that repeated source changes destroy loading tasks, workers, object URLs, and page views

If profiling with representative large documents proves that PDF.js page-view DOM retention is a real problem, evaluate an alternative virtualization design as a separate optimization. Any TanStack Virtual fallback must still use one clear vertical scroll parent, stable page keys, measured variable page heights, and preserved selection/navigation semantics.

## Selection And Chat Integration

The existing Buddy selection toolbar should remain.

For Foliate:

- selection range comes from the Foliate iframe document
- engine returns selected text, CFI, section index, and screen position

For PDF:

- selection range comes from the PDF.js text layer
- engine maps selection geometry into one or more canonical PDF page segments
- engine returns selected text, `PdfTextAnchor`, page label, and screen position

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
  anchor: ReaderTextAnchor
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
- map canonical quads from `PdfTextAnchor.segments` through the current page viewport
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
  kind: "pdf-location"
  pageIndex: number
  pageLabel?: string
  pageCount: number
  xRatio: number
  yRatio: number
  fraction: number
}
```

The location dialog can remain the same shell feature, but should offer page-oriented jumps for PDF.

## Theme And Dark Mode

Current Buddy PDF theming through Foliate applies CSS filters to the fixed-layout renderer. The PDF.js engine should preserve that behavior for the initial cutover so the engine migration does not also become a visual-theme change.

- keep PDF canvas rendering unmodified in light themes
- preserve the current filter behavior in dark themes
- keep Buddy annotation and search overlays outside the page filter so their colors remain stable
- treat a future explicit "invert PDF" preference as separate product work

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
resource id + page label/index + selected text + optional canonical PDF quads
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

## End-To-End Delivery Plan

This work is complete only when one production-ready `DocumentReader` provides the current Buddy PDF feature set plus continuous vertical reading, explicit zoom, and horizontal panning for zoomed pages. Intermediate implementation checkpoints may be exposed through tests or a development-only flag, but they are not releasable product states and must not replace the current Foliate PDF path.

### Outcome And Non-Regression Contract

The final reader must preserve all working current Buddy PDF behavior:

- the Buddy toolbar, popovers, dialogs, metadata/details, preferences, and help UI
- loading, ready, empty, timeout, and error states
- table-of-contents navigation
- the existing search UI contract; the nonfunctional legacy PDF search path is replaced by working document search, result excerpts, active-result highlighting, cancellation, and navigation
- previous/next navigation, reading history, progress display, page/location dialog, and location restoration
- text selection, copy, selection toolbar positioning, chat-selection staging, and chat-selection removal
- highlights and notes, including create, edit, delete, show, colors, and highlight/underline/squiggly/strikethrough styles
- bookmarks, current-bookmark state, persistence, and navigation
- global reader preferences, themes, reduced motion, cursor/chrome behavior, keyboard shortcuts, and external links
- annotation summaries and reading context sent to the surrounding directory/chat state

The final PDF reader intentionally adds or changes only the PDF reading surface:

- continuous vertical page-after-page layout is the default
- fit-width is the default scale for narrow or resized Bench panes
- fit-page, custom numeric zoom, zoom in, zoom out, and zoom reset remain available
- when the scaled page is wider than the pane, the same PDF scroll container provides horizontal panning
- horizontal panning is not horizontal page-to-page flow
- single-page and two-up layouts remain optional modes
- rotation is supported without invalidating highlights, bookmarks, search results, or the restored reading position
- zoom, rotation, layout changes, and container resizes preserve the current reading anchor

EPUB continues through Foliate and must not change behavior as part of this work. The neutral contract remains capable of adding MOBI, AZW, FB2, and CBZ later, but those formats are not currently exposed by production resource discovery and are not claimed as a tested regression surface here.

### Verified Baseline Acceptance Matrix

This matrix is the source of truth for parity. A “working baseline” row must remain unchanged from the user's perspective. An “improvement” row closes a verified gap in the Foliate PDF route and is not a behavior regression.

| Area | Verified Foliate PDF baseline | Required PDF.js result | Classification |
| --- | --- | --- | --- |
| Open/lifecycle | Blob opens through the shared reader with opening, ready, timeout, empty, and error states | Preserve states; additionally cancel rapid source replacement and release loading task, worker, page views, events, observers, and object URLs | Preserve and harden |
| Reader chrome | Buddy toolbar, popovers, dialogs, metadata hover card, help, and footer are mounted; the orphaned sidebar is not | Keep Buddy-owned chrome and neutral shared panels; do not expose the stock PDF.js toolbar/sidebar | Preserve |
| Outline | PDF outline can populate the TOC and navigate | Preserve named and explicit destination navigation and external-link handling | Preserve |
| Page list/labels | No reliable PDF page-list/page-label model | Expose PDF.js page labels and a navigable page list | Improvement |
| Search | Search controls exist, but whole-PDF results are effectively unavailable for Foliate PDF sections | Provide cancellable whole-document search, excerpts, match options, active highlighting, and result navigation | Improvement |
| Layout | Fit page, fit width, and two-page spread | Continuous fit-width default plus single-page/two-up alternatives | Preserve and improve |
| Zoom/pan | Fit presets only; no product numeric zoom control | Fit presets, numeric zoom, keyboard/toolbar/trackpad zoom, and one two-axis scroll owner for horizontal panning | Improvement |
| Rotation | No product rotation control | Rotate in 90-degree steps while retaining canonical anchors | Improvement |
| Navigation | Previous/next, history, progress, location jump, and restoration work through Foliate navigation | Preserve with page/ratio PDF position anchors and page labels | Preserve |
| Selection/chat | Single rendered-page text selection, copy, floating toolbar, staging, and removal | Preserve and add multi-page PDF text anchors with canonical quads | Preserve and improve |
| Annotations | Create/edit/delete/show, note, four colors, four styles, and per-book persistence work on rendered Foliate PDF pages | Preserve all actions/styles and keep overlays aligned across scale, rotation, layout, resize, reopen, and restart | Preserve and harden |
| Bookmarks | Add/remove/current-state/navigation/persistence use Foliate-shaped string values | Preserve behavior with versioned PDF position anchors | Preserve and migrate |
| Preferences/theme | Theme/filter, reduced motion, autohide cursor, and common shortcuts are global; PDF mode is not persisted | Preserve common preferences and persist discriminated PDF mode separately | Preserve and improve |
| Password PDF | No dedicated product prompt | Show required/incorrect-password states and allow retry or predictable cancellation | Improvement |
| Image-only PDF | Viewable when PDF.js renders it; text actions simply have no useful text | Remain viewable and disable or yield no text-dependent actions predictably | Preserve and clarify |
| Non-PDF | Production routes `.epub` through Foliate | Keep the EPUB engine and user behavior unchanged | Preserve |

### Work Package 1: Freeze The Current Contract

Before refactoring, convert the current behavior inventory into an acceptance matrix and capture fixtures that exercise it.

- record the exact current PDF actions, controls, callbacks, persistence fields, and keyboard behavior
- trace CFI-shaped assumptions through the reader pane, directory reading page, chat store, prompt-selection metadata, annotation summaries, and agent reading context
- add representative PDFs: normal text, scanned/image-only, mixed page sizes, portrait and landscape, rotated pages, outline, page labels, links, no text layer, large page count, malformed file, and password-protected file
- capture baseline desktop and narrow-pane screenshots and current interaction results
- inspect whether real Foliate-backed PDF annotations exist before committing to an expensive migration

The acceptance matrix becomes the cutover checklist. A feature cannot disappear merely because PDF.js exposes it differently.

### Work Package 2: Prove The PDF.js Runtime Internally

Build a development-only vertical slice before changing production routing.

- add an exact direct `pdfjs-dist` dependency to `packages/web`
- centralize API, matching worker, CMaps, standard fonts, WASM, viewer CSS, and image asset configuration
- instantiate `PDFViewer`, `PDFLinkService`, `PDFFindController`, and `EventBus` behind a small Buddy adapter
- load the existing resource blob without an iframe or CDN
- prove continuous vertical rendering, fit-width, explicit zoom, horizontal panning, current-page events, links, and teardown
- verify Vite development and packaged Electron asset loading on macOS and Windows
- verify rapid source replacement and unmount cancel stale loads and destroy PDF.js resources

This checkpoint may use a development-only route or flag. It must not become the default PDF reader.

### Work Package 3: Establish The Neutral Reader Boundary

Introduce the product boundary without performing a big-bang UI rewrite.

- add `DocumentReader` as the only reader entry point
- keep the existing `FoliateReader` working through a thin Foliate adapter
- add neutral `ReaderSource`, `ReaderSnapshot`, `ReaderPositionAnchor`, `ReaderTextAnchor`, `ReaderLocation`, `ReaderSelection`, `ReaderAnnotation`, `ReaderBookmark`, `ReaderSearchResult`, and `ReaderEngineCapabilities` types
- update the directory reader pane, reading page, chat store, prompt metadata, reading trail, and agent context so they accept neutral locations and selections
- keep format-specific modes discriminated rather than forcing Foliate text preferences onto PDF
- extract toolbar/panel/dialog components only when both engines have a concrete shared need

Production PDF routing remains on Foliate throughout this package.

### Work Package 4: Implement Anchors And Versioned State

Complete the data foundation before annotations are cut over.

- implement and unit-test conversion between DOM selection geometry, PDF.js viewports, canonical unrotated PDF coordinates, and rendered overlays
- support multi-page text selections through page-specific segments
- define stable position restoration using page index plus horizontal and vertical page ratios
- introduce a runtime-validated `ReaderStateRepository` with v2 keys and localStorage as its first backend
- require resource/object identity where available and attach a content fingerprint to detect changed bytes
- migrate existing Foliate ebook bookmarks and annotations into CFI position/text anchors
- implement legacy PDF conversion only if the baseline inventory finds meaningful user data; otherwise preserve/export or explicitly discard it without delaying the reader
- write only v2 state after migration while retaining the deliberate v1 read path

### Work Package 5: Complete The PDF Feature Set

Implement the new PDF engine until every row in the current behavior matrix is satisfied.

- continuous, single-page, and two-up layouts
- fit-width, fit-page, numeric zoom, toolbar and keyboard zoom controls, reset, trackpad/pinch zoom where supported, horizontal panning, rotation, and container-resize handling
- current page, page label, page offset, progress, next/previous, reading history, page jump, and restored position
- metadata, outline, page list, external links, loading states, errors, and password-required handling
- text layer selection, copy, selection toolbar placement, cross-page selection, and chat selection
- Buddy-owned highlight and note overlays for all current colors and styles
- annotation create, edit, delete, show, persistence, and annotation summaries
- bookmark add/remove/current state, navigation, and persistence
- cancellable search, result excerpts, active result, match overlays, and result navigation
- shared toolbar, panels, dialogs, preferences, help, keyboard shortcuts, reduced-motion behavior, and theming

Preserve the current PDF theme/filter behavior for the initial cutover so theme changes are not bundled into the engine migration. A separate explicit invert-PDF preference can be considered later.

### Work Package 6: Reliability, Performance, And Accessibility

Harden the complete reader before routing production PDFs to it.

- ensure one scroll owner handles both vertical movement and horizontal panning
- verify the PDF.js rendering queue retains a bounded number of rendered canvases while scrolling a large document
- verify mixed page sizes do not overlap, clip, or cause unstable scroll jumps
- preserve the reading anchor while zooming, rotating, changing layout, opening/closing panels, and resizing the Bench pane
- cancel search, page rendering, source loading, and delayed callbacks when replaced or unmounted
- verify repeated open/close and source-switch cycles do not retain loading tasks, workers, object URLs, page views, or event listeners
- verify keyboard navigation, focus order, screen-reader labels, reduced motion, selection, links, and popover positioning
- verify scanned/image-only PDFs remain viewable and clearly lack text-dependent actions when no text layer exists
- surface malformed, unsupported, and password-required states predictably rather than hanging

Do not introduce TanStack Virtual unless profiling demonstrates that PDF.js page-view retention is the remaining bottleneck. If it becomes necessary, it must preserve the single scroll owner and all selection, navigation, and measurement semantics.

### Work Package 7: Atomic Cutover And Cleanup

Cut over only after the complete acceptance matrix passes.

- run the full parity, new-behavior, persistence, lifecycle, and platform gates
- route PDFs through `PdfJsEngine` in `DocumentReader` in one atomic product change
- continue routing all non-PDF formats through Foliate
- keep the Foliate PDF path available only as a short-lived development comparison until migration confidence is established
- remove the Foliate PDF route, PDF-specific compatibility helpers, CFI assumptions in shared consumers, and the development flag
- update reader documentation so the PDF.js path is the sole supported PDF architecture

No partial PDF reader is released between these work packages.

## Cutover Gates

| Area | Required before PDF.js becomes the default |
| --- | --- |
| Current feature parity | Every item in the current behavior matrix works through the Buddy shell. |
| Continuous reading | Pages render vertically in order with fit-width as the narrow-pane default. |
| Zoom and panning | Fit-width, fit-page, numeric zoom, zoom controls, reset, and horizontal panning work without nested scroll conflicts. |
| Navigation | Next/previous, history, outline, page labels, progress, page jump, bookmarks, and restored position target the correct location. |
| Selection and chat | Text selection, copy, toolbar placement, cross-page selection, staging/removal, and agent context work. |
| Annotations | Every current color/style and note action survives zoom, rotation, layout changes, resize, close/reopen, and app restart. |
| Search | Search is cancellable; excerpts, active match, overlays, and navigation are correct. |
| Persistence | V2 state is validated, document identity is stable, changed bytes are detected, and the chosen migration policy is verified. |
| Reliability | Rapid source changes, errors, password-required files, and repeated mount/unmount cycles settle predictably without stale updates. |
| Performance | Large-document scrolling keeps rendered canvases bounded and does not show sustained unbounded memory growth. |
| Accessibility | Keyboard, focus, labels, reduced motion, text selection, and links remain usable. |
| Platforms | Vite development and packaged Electron pass on macOS and Windows. |
| Non-PDF regression | Production EPUB behavior is unchanged. |

## Verification Plan

Automated verification should include:

- unit tests for coordinate conversion at every rotation, mixed crop boxes/page sizes, multi-page selections, position restoration, identity, schema validation, and migration
- component tests for capability-driven shell controls, source replacement, cleanup, selection/chat callbacks, bookmark state, annotation CRUD, and mode changes
- search tests for cancellation, repeated queries, excerpts, active-result movement, and navigation
- Playwright tests at desktop and narrow Bench widths for nonblank canvas output, continuous layout, zoom, horizontal panning, selection toolbar placement, overlay alignment, and persistence after reopen
- large-document assertions that rendered canvas/page-view retention remains bounded while scrolling forward and backward
- packaged Electron smoke tests for worker/assets, links, selection, zoom, persistence, and teardown on macOS and Windows

For canvas views, include pixel or nonblank checks so visual tests cannot pass with empty pages. Use repeatable bounds and lifecycle assertions rather than relying only on vague heap snapshots.

For all code changes, Buddy's normal completion requirements apply:

- run tests only for the packages changed
- run `bun lint`
- run `bun typecheck` once from the repository root
- run `bun fmt` only after the task is complete and the user is satisfied

## Risks

### Viewer-layer API changes

PDF.js viewer APIs can change between releases.

Mitigation:

- pin one exact `pdfjs-dist` version in `packages/web`
- isolate viewer-layer imports and events behind one adapter
- avoid private or underscored fields
- update the API and worker together

### Text selection accuracy

PDF text layers can have poor ordering, imperfect geometry, or no text at all.

Mitigation:

- persist canonical quads plus exact/prefix/suffix quote context
- support multi-page segments
- treat image-only pages as viewable but without text-dependent actions until OCR/source preparation exists

### Annotation stability

Page-coordinate highlights are stable across display changes but not across changed PDF bytes.

Mitigation:

- use stable resource identity plus content fingerprint
- refuse silent reuse when the fingerprint changes
- keep page label and quote context for diagnosis and recovery

### Memory and rendering cost

Continuous PDF viewers can use too much memory if canvases are retained indefinitely.

Mitigation:

- use PDF.js's rendering queue and page-view buffer
- measure bounded canvas retention with representative large documents
- cancel stale work and destroy document resources on source replacement
- evaluate additional virtualization only after profiling proves it necessary

### Worker and asset packaging

A PDF reader can work in Vite development but fail in packaged Electron because a worker, CMap, font, WASM, CSS, or image asset is missing.

Mitigation:

- centralize locally bundled runtime URLs
- test production packaging early and at the final gate
- test both macOS and Windows artifacts

### Shared-state leaks

CFI assumptions currently extend beyond `FoliateReader` into directory/chat state and prompt metadata.

Mitigation:

- include every consumer in the neutral boundary work package
- keep format-specific anchors discriminated
- add contract tests at the reader-to-chat boundary

### Feature drift during implementation

A new rendering path can appear complete while silently omitting current Buddy behavior.

Mitigation:

- freeze the current behavior matrix first
- keep the new path development-only until all gates pass
- cut over atomically and do not release intermediate partial states

## Resolved Decisions

- Consume an exact direct `pdfjs-dist` dependency from `packages/web`; never reuse Foliate's private bundled copy.
- Use exported PDF.js viewer-layer components behind a Buddy adapter; do not embed the stock viewer application.
- Let PDF.js own page rendering and the single scroll container initially; add TanStack Virtual only if profiling requires it.
- Keep reader state in a versioned localStorage-backed repository during this project; moving it into the source system is separate work.
- Preserve current PDF theme/filter behavior for the cutover; an explicit inversion preference is future work.
- Default PDFs to continuous fit-width, with fit-page, numeric zoom, single-page, and two-up available as user modes.
- For documents above PDF.js's 10,000-page continuous-view safety limit, surface the enforced page-mode fallback instead of silently claiming continuous layout.
- Provide horizontal panning when zoom makes a page wider than the pane; do not introduce horizontal page flow.
- Implement legacy PDF annotation migration only when real stored data justifies it; migration cannot delay the new reader indefinitely.
- Defer PDF forms, signing, embedded annotation editing, file mutation, and OCR. Preserve or improve predictable viewing/error behavior for those files without treating those features as parity requirements.

## Final Position

Buddy should not let Foliate's PDF adapter define Buddy's PDF product.

Foliate remains a good ebook engine. PDF.js is the right PDF rendering foundation. Buddy's own reader shell should be the stable product interface across both.

Highlights, bookmarks, notes, search, chat selection, and preferences should become Buddy reader concepts with format-specific anchors. Foliate modes keep working through CFI anchors. PDF modes work through canonical PDF position and text anchors. The user sees one complete reader; the code gets two engines.
