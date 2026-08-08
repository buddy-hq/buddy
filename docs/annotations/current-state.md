# Current annotation state

> **Status:** implemented behavior as of 2026-08-08.

## Summary

Buddy does not yet have a general annotation service. The only durable user annotations in this area are reader annotations. They are custom JSON embedded in per-document reader state and serialized into renderer `localStorage`.

There is currently:

- no `annotation` Buddy object kind;
- no annotation JSON-LD file;
- no backend annotation repository;
- no typed HTTP annotation API;
- no durable agent annotation tools;
- no shared annotation support for chat, web pages, Markdown, images, or media.

## Reader annotation record

The current shared reader type is:

```ts
type ReaderAnnotation = {
  id: string
  anchor: ReaderTextAnchor
  text: string
  note: string
  style: "highlight" | "underline" | "squiggly" | "strikethrough"
  color: "amber" | "mint" | "sky" | "rose"
  created: string
  modified: string
}
```

It is defined in `packages/web/src/components/readers/reader-types.ts`. The anchor union is defined in `packages/reader-contract/src/index.ts`.

The record is useful to the reader but is not a general annotation schema:

- the containing document state supplies the target;
- `text` and `note` are fixed fields rather than general bodies;
- presentation is mixed into the semantic record;
- the selector union is closed to EPUB and PDF;
- there is no creator, provenance, motivation, reply, tag, external body, or target revision model;
- there is no per-annotation schema version or revision history.

## PDF anchor

PDF highlights store source-page geometry and text evidence:

```ts
type PdfTextAnchor = {
  kind: "pdf-text"
  segments: Array<{
    pageIndex: number
    quads: PdfQuad[]
    startOffset?: number
    endOffset?: number
  }>
  quote: {
    exact: string
    prefix?: string
    suffix?: string
  }
}
```

`PdfQuad` contains four points: `topLeft`, `topRight`, `bottomRight`, and `bottomLeft`. These are PDF-page coordinates, not the reader's position on the screen. Zooming or moving the reader does not change the stored points.

PDF creation currently records:

- an `annotation_<UUID>` identifier when `crypto.randomUUID()` is available;
- one or more page segments;
- the selected text, offsets, and page quads;
- exact quote plus bounded prefix and suffix context;
- note, style, color, and ISO timestamps.

The PDF content fingerprint is stored at the enclosing document-identity level. A mismatched fingerprint prevents state from being loaded against different PDF bytes.

## EPUB anchor

EPUB annotations use a Foliate/EPUB CFI:

```ts
type CfiTextAnchor = {
  kind: "cfi-text"
  cfi: string
  sectionIndex?: number
}
```

The persisted CFI is resolved to a live DOM `Range` when the EPUB section loads. Browser rectangles are calculated at render time, so font, margin, and viewport changes do not require stored coordinates.

The Foliate component still uses its legacy payload internally:

```ts
type FoliateAnnotation = {
  value: string // CFI
  text?: string
  note?: string
  style?: string
  color?: string
  created?: string
  modified?: string
  index?: number
  label?: string
}
```

The adapter converts this to `ReaderAnnotation`. For workspace EPUBs, the transition layer currently mirrors both the Foliate-compatible record and the newer reader-v2 record.

## Document envelope

All reader annotations for one source are stored together with bookmarks, reading position, and PDF mode:

```json
{
  "version": 2,
  "identity": {
    "sourceId": "[\"workspace-reader\",\"object\",\"OBJECT_ID\"]",
    "format": "pdf",
    "contentFingerprint": "CONTENT_HASH"
  },
  "lastLocation": {
    "kind": "pdf-position",
    "pageIndex": 0,
    "xRatio": 0,
    "yRatio": 0
  },
  "bookmarks": [],
  "annotations": [],
  "pdfMode": {}
}
```

The storage key is:

```text
buddy:reader:document:v2:<percent-encoded-source-id>
```

When a registered resource object is available, the source ID contains its stable `objectID`. The fallback contains the normalized notebook directory and resource path. A move or rename can therefore produce a new state record when no object ID is available.

## Physical persistence

The web renderer calls `window.localStorage.setItem(key, JSON.stringify(state))`. In Electron, Chromium backs local storage with LevelDB. The development app uses:

```text
~/Library/Application Support/ai.buddy.desktop.dev/Local Storage/leveldb/
```

Production uses a different Electron application-data directory. Consequently:

- the logical value is JSON;
- the physical store is not a normal JSON file;
- development and production state are separate;
- annotations are not in the notebook;
- they are not naturally visible to Buddy's object tools or filesystem search;
- browser storage eviction, corruption, or profile replacement can lose them;
- saving an annotation rewrites the entire per-document state value.

## Validation and limits

The reader manually validates parsed JSON. Invalid records are discarded. Current bounds include:

- at most 20,000 annotations per document;
- text and note strings up to 100,000 characters;
- PDF quotes up to 32,768 characters;
- PDF quote prefix and suffix up to 1,024 characters each;
- at most 64 PDF text segments;
- at most 1,024 quads per PDF segment.

The envelope has version `2`; individual annotations do not have their own schema version.

## Agent visibility

While a reader is active, the frontend copies only the ten most recent annotation summaries into active-reading context:

```ts
type AnnotationSummaryEntry = {
  text: string
  note?: string
}
```

That summary is deliberately removed from persisted active-reading state. The agent therefore receives transient recent text and notes while the surface is open, but cannot durably list, retrieve, search, update, or delete annotations.

## Current failure boundaries

- All annotations for a document share one write and failure domain.
- There is no lost-update protection between multiple renderer instances.
- Deletion removes an array entry; there is no tombstone or recovery history.
- A changed fingerprint rejects the complete reader state rather than attempting controlled re-anchoring.
- EPUB CFI annotations and PDF quad annotations cannot be consumed through one backend selector contract.
- The annotation record cannot target a chat part, web snapshot, block, region, time range, or another annotation.

The PDF selection-toolbar click bug fixed on 2026-08-08 was an event-boundary bug, not a schema bug: pointer handlers installed on the broad reader root dismissed the selection before the toolbar click completed. The handlers now accept selection events only from the PDF viewer container.

