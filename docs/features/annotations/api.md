# Proposed annotation APIs

> **Status:** proposed contracts. None of these routes, tools, packages, or types exists yet.

## Package boundary

Create `@buddy/annotation-contract` as the shared dependency for backend, SDK-facing schemas, frontend adapters, importers, and tests. Do not place the general model in `@buddy/reader-contract`; readers are only two consumers.

The package owns:

- Zod schemas and inferred TypeScript types;
- selector discriminators and bounds;
- stable URI parsing/building;
- JSON-LD parsing and serialization;
- canonical text normalization and offset helpers;
- request/response schemas shared with Hono OpenAPI;
- no filesystem, React, PDF.js, Foliate, or agent-runtime dependencies.

## Core contract

The following is representative; implementation should use Zod and infer these exported types rather than maintaining parallel handwritten types.

```ts
type AnnotationMotivation =
  | "highlighting"
  | "commenting"
  | "bookmarking"
  | "tagging"
  | "linking"
  | "replying"

type TextualAnnotationBody = {
  type: "TextualBody"
  purpose: "commenting" | "tagging" | "describing" | "replying"
  value: string
  format: "text/markdown" | "text/plain"
  language?: string
}

type ResourceAnnotationBody = {
  type: "SpecificResource"
  id: string
  purpose: "linking" | "describing" | "replying"
}

type TextQuoteSelector = {
  type: "TextQuoteSelector"
  exact: string
  prefix?: string
  suffix?: string
}

type TextPositionSelector = {
  type: "TextPositionSelector"
  start: number
  end: number
  "buddy:unit": "unicode-code-point"
  "buddy:normalization": "nfc-lf-v1"
}

type PdfQuadSelector = {
  type: "buddy:PdfQuadSelector"
  coordinateSpace: "pdf-user-space"
  segments: readonly PdfTextSegment[]
}

type EpubCfiSelector = {
  type: "buddy:EpubCfiSelector"
  cfi: string
  sectionIndex?: number
}

type AnnotationSelector =
  | TextQuoteSelector
  | TextPositionSelector
  | PdfQuadSelector
  | EpubCfiSelector
  | FragmentSelector
  | SvgSelector
  | HeadingSelector
  | BlockSelector
  | DomSelector
  | CanvasElementSelector

type ContentDigestState = {
  type: "buddy:ContentDigestState"
  algorithm: "sha-256"
  value: string
}

type AnnotationTarget = {
  type: "SpecificResource"
  source: string
  selector?: readonly AnnotationSelector[]
  state?: ContentDigestState
}

type AnnotationDocument = {
  "@context": readonly [
    "http://www.w3.org/ns/anno.jsonld",
    "https://buddy.ai/ns/annotations/v1",
  ]
  id: string
  type: "Annotation"
  motivation: readonly AnnotationMotivation[]
  body: readonly (TextualAnnotationBody | ResourceAnnotationBody)[]
  target: AnnotationTarget | readonly AnnotationTarget[]
  created: string
  modified: string
  "buddy:schemaVersion": 1
  "buddy:presentation"?: {
    style: "highlight" | "underline" | "squiggly" | "strikethrough"
    color: string
  }
}

type StoredAnnotation = {
  annotationID: string
  revisionID: string
  annotation: AnnotationDocument
  resolution: AnnotationResolution
}
```

Selector-specific limits belong in the schema package and must be shared by capture, API validation, import, and storage parsing. Do not reproduce reader-local validation in each surface.

## Repository API

The backend repository is the only code that reads and writes annotation object files:

```ts
type AnnotationRepository = {
  create: (input: CreateAnnotationInput) => Promise<StoredAnnotation>
  createBatch: (input: CreateAnnotationBatchInput) => Promise<CreateAnnotationBatchResult>
  get: (input: GetAnnotationInput) => Promise<StoredAnnotation>
  update: (input: UpdateAnnotationInput) => Promise<StoredAnnotation>
  tombstone: (input: TombstoneAnnotationInput) => Promise<AnnotationTombstone>
  list: (input: ListAnnotationsInput) => Promise<AnnotationPage>
  search: (input: SearchAnnotationsInput) => Promise<AnnotationSearchPage>
  listRevisions: (input: ListAnnotationRevisionsInput) => Promise<AnnotationRevisionPage>
  rebuildIndexes: (input: RebuildAnnotationIndexesInput) => Promise<RebuildIndexesResult>
}
```

Required behavior:

- `create` accepts an optional `clientRequestID` for idempotency.
- `update` requires `expectedRevisionID`; mismatch returns a conflict and does not write.
- `tombstone` requires `expectedRevisionID` and is recoverable from revision files until explicit purge.
- `createBatch` validates all inputs before mutation and coalesces derived/global index writes.
- corrupt annotation files produce typed load errors and do not disappear silently.
- listing and search use a stable cursor, never array offset pagination against a changing collection.

## HTTP API

Routes are Hono OpenAPI routes and generate the `BuddyClient`. Frontend code must use that generated typed client and must not call `fetch` manually.

All routes are notebook-scoped through Buddy's existing directory context.

| Method | Route | Operation |
| --- | --- | --- |
| `POST` | `/api/annotations` | Create one annotation |
| `POST` | `/api/annotations/batch` | Idempotent bulk create/import |
| `GET` | `/api/annotations/:annotationID` | Get current revision and resolution |
| `PATCH` | `/api/annotations/:annotationID` | Create a new revision from validated changes |
| `DELETE` | `/api/annotations/:annotationID` | Write a tombstone |
| `GET` | `/api/annotations/:annotationID/revisions` | List immutable revisions |
| `GET` | `/api/annotations` | List by target, motivation, status, and time |
| `POST` | `/api/annotations/search` | Search body and selected text |

### Create

```ts
type CreateAnnotationInput = {
  motivation: readonly AnnotationMotivation[]
  body: readonly AnnotationBody[]
  target: AnnotationTarget | readonly AnnotationTarget[]
  presentation?: AnnotationPresentation
  clientRequestID?: string
  provenance?: AnnotationProvenance
}
```

The server assigns `annotationID`, `revisionID`, canonical URI, and timestamps. Imports supply external IDs only in provenance; they do not choose filesystem object IDs.

### Update

```ts
type UpdateAnnotationInput = {
  expectedRevisionID: string
  motivation?: readonly AnnotationMotivation[]
  body?: readonly AnnotationBody[]
  target?: AnnotationTarget | readonly AnnotationTarget[]
  presentation?: AnnotationPresentation | null
}
```

An update always creates a new immutable revision. `null` explicitly removes optional presentation; omitted fields are unchanged.

### Delete

```ts
type TombstoneAnnotationInput = {
  expectedRevisionID: string
  reason?: string
}
```

The response contains `annotationID`, deleted revision, tombstone time, and tombstone path metadata. The normal get route returns `ANNOTATION_DELETED`; revision-history access may expose deleted content only to explicit recovery operations.

### List

```ts
type ListAnnotationsInput = {
  targetSource?: string
  motivation?: AnnotationMotivation
  resolutionStatus?: "resolved" | "ambiguous" | "orphaned" | "unknown"
  modifiedAfter?: string
  cursor?: string
  limit?: number
}

type AnnotationPage = {
  items: readonly AnnotationSummary[]
  nextCursor?: string
}
```

The implementation defines and enforces a bounded maximum `limit`. Summaries exclude geometry unless requested through `get`.

### Search

```ts
type SearchAnnotationsInput = {
  query: string
  targetSources?: readonly string[]
  motivations?: readonly AnnotationMotivation[]
  resolutionStatuses?: readonly AnnotationResolutionStatus[]
  cursor?: string
  limit?: number
}
```

Search covers selected quotes, textual bodies, target labels, and provenance labels. Results contain matched excerpts and stable target URIs.

### Error contract

Use stable machine-readable codes:

```text
ANNOTATION_NOT_FOUND
ANNOTATION_DELETED
ANNOTATION_CONFLICT
ANNOTATION_INVALID_TARGET
ANNOTATION_INVALID_SELECTOR
ANNOTATION_SOURCE_NOT_FOUND
ANNOTATION_CORRUPT
ANNOTATION_INDEX_UNAVAILABLE
```

Index failure may degrade to a bounded authoritative scan when safe. It must not make create/update success ambiguous; the repository reports whether canonical write succeeded and schedules index rebuild separately.

## Agent tools

Agent tools wrap the repository/API with concise schemas. They do not expose filesystem paths as primary identity.

### `annotation_create`

Creates a highlight, comment, tag, link, bookmark, or reply. Input includes motivations, bodies, and a target. UI-originated selection capture should normally create the target; the agent may create text targets from stable resource IDs and quotes.

### `annotation_get`

Returns the complete current annotation, resolution diagnostics, and human-readable target description.

### `annotation_update`

Updates bodies, motivations, target, or presentation using an expected revision ID.

### `annotation_delete`

Writes a tombstone using an expected revision ID.

### `annotation_list_for_target`

Lists annotations for a stable source URI with optional motivation and resolution filters.

### `annotation_search`

Searches selected quotes and bodies across the notebook. Default output is semantic and compact:

```ts
type AnnotationToolSearchResult = {
  annotationID: string
  revisionID: string
  motivation: readonly AnnotationMotivation[]
  selectedText?: string
  bodyExcerpt?: string
  targetSource: string
  targetLabel?: string
  resolutionStatus: AnnotationResolutionStatus
  modified: string
}
```

Full selector geometry is returned only by `annotation_get` or a surface-specific navigation flow.

Tool creation and prompts must follow Buddy's feature/tool capability model. The annotation feature owns these tools and makes them available to personas through explicit feature configuration.

## Surface adapter API

Each UI surface converts selections to general targets and resolves targets back into current UI locations:

```ts
type AnnotationSurfaceAdapter<TContext, TSelection, TResolved> = {
  supportsSource: (source: string) => boolean
  captureTarget: (input: {
    context: TContext
    selection: TSelection
  }) => Promise<AnnotationTarget>
  resolveTarget: (input: {
    context: TContext
    target: AnnotationTarget
  }) => Promise<AnnotationResolution<TResolved>>
  navigateTo: (input: {
    context: TContext
    resolved: TResolved
  }) => Promise<void>
}
```

Rendering can remain surface-native:

- PDF renders quads in its overlay layer.
- EPUB resolves CFI to ranges and lets Foliate draw.
- Chat resolves message-part text ranges and uses DOM highlights.
- Web uses its capture/live-page adapter.
- Images and whiteboards draw spatial overlays.

The adapter does not persist. It calls the typed annotation API after capture and consumes API results for resolution.

## Frontend data flow

```text
User selection
  -> surface adapter captures AnnotationTarget
  -> generated BuddyClient creates annotation
  -> backend writes revisioned object files
  -> query cache receives StoredAnnotation
  -> surface adapter resolves and renders target
```

After cutover, reader components should depend on an annotation repository/client boundary. They should not read or write annotation localStorage directly. Reader progress, preferences, and bookmarks can remain in reader state until separately redesigned.

## Resolution API boundary

Surface resolution often requires live DOM/PDF state and therefore belongs in the client adapter. Backend resolution handles source existence, digest comparison, canonical text search, and indexable evidence. The client reports derived resolution diagnostics back through a bounded state update endpoint only when the result materially changes.

Do not send transient rectangle coordinates to the backend for chat or reflowable text. Do not rewrite an annotation revision merely because the viewport changed.

