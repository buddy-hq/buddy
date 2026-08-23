# Proposed general annotation architecture

> **Status:** proposal. No storage, backend, SDK, agent tool, or migration in this document is implemented yet.

## Goals

- Annotate PDFs, EPUBs, chat, Markdown, web content, images, whiteboards, media, whole resources, and other annotations.
- Keep canonical data in normal files under the notebook's existing Buddy object store.
- Make annotations durable, revisioned, searchable, agent-accessible, and recoverable.
- Preserve exact navigation without coupling persistence to the current screen layout or renderer DOM.
- Allow new target surfaces and body types without changing the core lifecycle.
- Remain local-first and single-user while preserving predictable concurrency and failure behavior.

## Non-goals

- Writing annotations into source PDFs or EPUBs as the canonical store.
- Adopting Calibre's library database or any other SQLite store.
- Using one universal coordinate system.
- Treating generated indexes as authoritative.
- Implementing the complete W3C Annotation Protocol or an LDP server in the first version.
- Preserving the current localStorage format indefinitely after migration.

## Core model

Use the [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/) for the common envelope and JSON-LD vocabulary:

```json
{
  "@context": [
    "http://www.w3.org/ns/anno.jsonld",
    "https://buddy.ai/ns/annotations/v1"
  ],
  "id": "buddy://annotations/01K00000000000000000000000",
  "type": "Annotation",
  "motivation": ["highlighting", "commenting"],
  "body": [
    {
      "type": "TextualBody",
      "purpose": "commenting",
      "format": "text/markdown",
      "value": "This is important."
    }
  ],
  "target": {
    "type": "SpecificResource",
    "source": "buddy://objects/01J00000000000000000000000",
    "selector": [],
    "state": {
      "type": "buddy:ContentDigestState",
      "algorithm": "sha-256",
      "value": "SOURCE_CONTENT_HASH"
    }
  },
  "created": "2026-08-08T09:30:00.000Z",
  "modified": "2026-08-08T09:30:00.000Z",
  "buddy:schemaVersion": 1,
  "buddy:presentation": {
    "style": "highlight",
    "color": "sky"
  }
}
```

An annotation may have no body when its motivation is simply `highlighting`. It may have multiple bodies, targets, and motivations. A reply targets another annotation URI.

## Stable source identities

The source answers “which resource?” before a selector answers “where inside it?”

| Resource | Proposed source URI |
| --- | --- |
| Managed object | `buddy://objects/<objectID>` |
| Chat message part | `buddy://sessions/<sessionID>/messages/<messageID>/parts/<partID>` |
| Annotation | `buddy://annotations/<annotationID>` |
| Captured web page | `buddy://objects/<webCaptureObjectID>` |
| External page without capture | canonical `https://` URL plus digest state |
| Obsidian file adapter | vault/file URI plus explicit vault identity |

A workspace path can be recorded as display/provenance metadata, but registered resources should use `objectID` so a rename does not change the target.

Chat message and part IDs must be stable. A finalized message part is a first-class text resource. An annotation created during streaming records the current digest and is re-resolved when the part finalizes; the UI may defer persistence until finalization when exact stability is required.

## Selector registry

Selectors are a discriminated, extensible registry. Multiple selectors on one target describe the same intended segment and provide fallback evidence.

| Selector | Use |
| --- | --- |
| W3C `TextQuoteSelector` | Exact text plus prefix and suffix |
| W3C `TextPositionSelector` | Start/end in a defined canonical text serialization |
| W3C `FragmentSelector` | Standard URL/media fragments such as page or time when available |
| W3C `SvgSelector` | Arbitrary spatial regions |
| `buddy:PdfQuadSelector` | PDF pages and quads in PDF user space |
| `buddy:EpubCfiSelector` | EPUB CFI and optional spine/section evidence |
| `buddy:HeadingSelector` | Markdown/Obsidian heading path |
| `buddy:BlockSelector` | Explicit Markdown/Obsidian block ID |
| `buddy:DomSelector` | Captured-page DOM path; never the sole selector for mutable web content |
| `buddy:CanvasElementSelector` | Stable whiteboard/canvas element identity |

Screen coordinates are never persisted for text. Spatial coordinates are appropriate only when the source itself is spatial, such as a PDF page, image, or whiteboard.

Text positions use a canonical plain-text projection, Unicode normalization, line-ending policy, and Unicode code-point offsets defined by the selector version. Surface adapters translate browser UTF-16 offsets at their boundary.

## Surface examples

### Chat

```json
{
  "source": "buddy://sessions/S1/messages/M1/parts/P1",
  "selector": [
    {
      "type": "TextQuoteSelector",
      "exact": "Persistent anchors should target the source",
      "prefix": "The rule is: ",
      "suffix": ", not its current layout."
    },
    {
      "type": "TextPositionSelector",
      "start": 183,
      "end": 226,
      "buddy:unit": "unicode-code-point",
      "buddy:normalization": "nfc-lf-v1"
    }
  ],
  "state": {
    "type": "buddy:ContentDigestState",
    "algorithm": "sha-256",
    "value": "PART_HASH"
  }
}
```

The renderer locates the message and part by ID, resolves the text selectors, and calculates current DOM rectangles. No chat-panel coordinates are stored.

A selection spanning message parts uses multiple targets, one per part. This avoids inventing one unstable global transcript offset.

### PDF

```json
{
  "source": "buddy://objects/PDF_OBJECT_ID",
  "selector": [
    {
      "type": "buddy:PdfQuadSelector",
      "coordinateSpace": "pdf-user-space",
      "segments": [
        {
          "pageIndex": 4,
          "quads": []
        }
      ]
    },
    {
      "type": "TextQuoteSelector",
      "exact": "The highlighted PDF passage",
      "prefix": "preceding text",
      "suffix": "following text"
    }
  ],
  "state": {
    "type": "buddy:ContentDigestState",
    "algorithm": "sha-256",
    "value": "PDF_HASH"
  }
}
```

The PDF adapter must define page boxes, rotation, and coordinate conversion precisely. Quads are not viewport pixels.

### EPUB

Use `buddy:EpubCfiSelector` plus `TextQuoteSelector`. The CFI is the primary locator; quote context helps detect or recover from changed markup.

### Markdown and Obsidian

Use a managed object or vault-file source plus heading/block selectors and text quote/position selectors. The explicit block ID is strong identity; the quote protects against a stale or reused ID.

### Web

Prefer a captured-page Buddy object. Store its source URL and content digest as provenance. Use quote plus text position and an optional DOM selector. For a live URL without a capture, resolution is best effort and must expose content drift.

### Images, whiteboards, and media

- Image: `FragmentSelector` with `xywh` or `SvgSelector`.
- Whiteboard: stable board object plus `buddy:CanvasElementSelector`; use a region only for freehand spatial selection.
- Audio/video: media fragment with a time interval.
- Whole resource: omit the selector.

## Resolution and re-anchoring

Resolution follows strongest stable evidence first while checking redundant evidence:

1. Resolve stable source identity.
2. Compare the stored source digest/revision.
3. Try the format-native selector, such as PDF quads or EPUB CFI.
4. Verify the exact quote when text is available.
5. If source content changed, search for exact quote with prefix and suffix in the bounded source region.
6. Return `resolved`, `ambiguous`, or `orphaned` with diagnostics.

Never silently choose among multiple quote matches. Never attach an annotation to merely similar text. Automatic re-anchoring may update derived resolution state; changing canonical selectors or accepting a new source digest creates a new annotation revision.

The content digest captured at creation remains in the canonical revision. Latest resolution status belongs in mutable object state so opening a document does not rewrite annotation history:

```json
{
  "status": "resolved",
  "resolvedAt": "2026-08-08T10:00:00.000Z",
  "sourceDigest": "CURRENT_HASH",
  "diagnostics": []
}
```

## Plain-file object storage

Add `annotation` to Buddy's managed-object kinds. Each annotation is one revisioned object:

```text
.buddy/objects/v1/annotation/<annotationID>/
  object.json
  source/
    import.json                       # optional original external payload
  revisions/
    <revisionID>/
      annotation.jsonld              # authoritative immutable revision
  state/
    resolution.json                  # latest derived resolution status
  derived/
    searchable-text.txt              # optional rebuildable projection
  tombstone.json                     # present after deletion
```

`object.json.currentRevisionID` selects the current immutable revision. The manifest uses lifecycle `revisioned`. `annotationID` and `revisionID` use the existing path-safe 26-character ULID contract.

The write path must use the object store's staging and atomic rename behavior. Updates require an expected current revision to prevent lost updates. Deletion writes a tombstone; hard purge is a separate maintenance operation.

### Indexes

Indexes are rebuildable from manifests and current annotation revisions:

- by target source;
- by motivation;
- by created/modified time;
- selected quote and body text for search;
- resolution status.

Index files live under the annotation kind's `_index/` directory or another object-store-owned derived index root. They are caches, never authority.

The current global object index is rewritten on every individual object upsert. Bulk annotation import or agent-created batches must not cause quadratic index rewrites. Before shipping, the object store needs a batched/coalesced index mutation path that writes object records atomically and updates affected indexes once per batch.

## Imports and migration

### Reader-v2 import

For each current reader annotation:

1. Resolve the enclosing reader source to a managed resource `objectID` where possible.
2. Convert `pdf-text` to PDF quad plus quote selectors.
3. Convert `cfi-text` to EPUB CFI plus quote selectors.
4. Preserve note, style, color, and timestamps.
5. Generate an idempotency key from source identity, legacy ID, and normalized payload hash.
6. Write one annotation object.
7. Record original payload/provenance when useful for recovery.

Legacy Foliate PDF records with empty quads are imported as unresolved page-bounded quote targets. They are not given fabricated geometry.

The cutover should be an idempotent importer followed by one authoritative backend write path. Do not maintain indefinite localStorage/object-store dual writes.

### Obsidian and Calibre

- Obsidian import maps files, headings, blocks, and PDF pages without inventing missing exact ranges.
- Calibre import preserves UUID, quote, notes, style, timestamp, CFI, and original payload.
- External IDs are provenance and idempotency inputs; Buddy annotation IDs remain local object identities.

## Agent access

The agent reads annotation files through typed tools rather than receiving an unbounded prompt dump. Active-surface context may include a small recent/relevant summary, but that summary is not authoritative.

Search results should emphasize semantic content:

- annotation ID;
- selected quote;
- body excerpt;
- target source and human label;
- motivation;
- resolution status;
- created/modified timestamps.

Geometry is returned only on full retrieval or when a tool specifically needs it.

## Old versus proposed architecture

```text
Today
  reader component
    -> one document-state JSON value
      -> localStorage / Electron LevelDB
        -> transient ten-item agent summary

Proposed
  PDF / EPUB / chat / web / canvas adapters
    -> shared annotation contract
      -> one revisioned plain-file object per annotation
        -> rebuildable indexes
          -> typed frontend SDK and agent tools
```

## Rollout

1. Add `@buddy/annotation-contract` with schemas, selector registry, and JSON-LD serialization.
2. Add the `annotation` object kind, manifests, revision files, tombstones, and batched index updates.
3. Add repository tests for atomic create/update/delete, idempotency, conflict handling, rebuild, and corrupt files.
4. Add Hono OpenAPI routes and regenerate `BuddyClient`.
5. Add agent tools and concise active-context integration.
6. Move PDF and EPUB adapters from localStorage to the service with idempotent import.
7. Add chat-part annotations.
8. Add Markdown/Obsidian, web capture, and spatial/media adapters independently.

The annotation platform should be implemented after the current PDF-reader merge-preparation branch is accepted, unless explicitly chosen as part of this branch's scope.

