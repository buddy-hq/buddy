# Historical Buddy and Foliate annotation model

> **Status:** description of the superseded Foliate-based implementation and its migration behavior.

## Foliate-js versus the Foliate application

Buddy embeds `foliate-js`, the browser rendering library. It does not embed or copy the GPL Foliate desktop application. Foliate-js resolves locations and draws overlays; it does not own Buddy's durable persistence. Buddy supplied the localStorage records.

Foliate-js supports EPUB and an experimental PDF.js adapter. The PDF adapter presents every PDF page through the same fixed-layout book interface used by pre-paginated EPUB content.

Sources:

- [Foliate-js overview](https://github.com/johnfactotum/foliate-js/blob/main/README.md)
- [Foliate-js PDF adapter](https://github.com/johnfactotum/foliate-js/blob/main/pdf.js)
- [Foliate-js view and CFI resolution](https://github.com/johnfactotum/foliate-js/blob/main/view.js)

## EPUB behavior

For an EPUB selection, Foliate-js generated an EPUB CFI from the selected DOM `Range`:

```text
EPUB spine item + DOM range -> EPUB CFI range
```

Buddy persisted that CFI in the annotation's `value` field. On reload, Foliate resolved the CFI to a new DOM range, called `getClientRects()`, and drew an SVG overlay. Layout coordinates were transient.

## Old PDF behavior

Buddy originally sent PDFs through the same Foliate view. PDF.js generated a page canvas and HTML text layer. Foliate treated the page as a fixed-layout book section and created a synthetic EPUB CFI into that generated text-layer DOM:

```text
PDF page
  -> PDF.js-generated text spans
  -> browser DOM Range
  -> fake section CFI + range CFI
  -> persisted `value`
```

An old PDF highlight looked like:

```json
{
  "value": "epubcfi(/6/2!/4/2/6,/1:14,/1:62)",
  "index": 0,
  "label": "Page 1",
  "text": "Highlighted PDF text",
  "note": "",
  "style": "highlight",
  "color": "#38bdf8",
  "created": "2026-01-01T00:00:00.000Z",
  "modified": "2026-01-01T00:00:00.000Z"
}
```

No PDF page quads, native PDF annotation dictionary, quote context, or content fingerprint were stored. Rectangles were recalculated after resolving the CFI.

## Transition to the dedicated PDF reader

The synthetic CFI addressed the renderer's generated DOM rather than the PDF. It depended on:

- how that PDF.js version split text into spans;
- the exact generated DOM tree;
- Foliate's fake-section CFI convention;
- the same resolution pipeline remaining available.

It was a useful common-renderer shortcut, but it coupled durable data to an implementation detail. Changing the PDF renderer made exact resolution unreliable.

The dedicated PDF engine now stores:

- page indices;
- quads in PDF page space;
- text offsets;
- exact quote plus prefix and suffix;
- the enclosing PDF content fingerprint.

## Legacy migration

The reader-v2 migration recognizes the leading fake CFI step and derives a page index. The old record does not contain enough information to derive precise PDF quads without recreating and resolving the old text-layer DOM.

The migration therefore preserves what it can:

```json
{
  "id": "legacy_pdf_annotation_0",
  "anchor": {
    "kind": "pdf-text",
    "segments": [{ "pageIndex": 0, "quads": [] }],
    "quote": { "exact": "Highlighted PDF text" }
  },
  "text": "Highlighted PDF text",
  "note": "",
  "style": "highlight",
  "color": "sky"
}
```

The migrated record remains listable and retains its page and quote. Its `quads` array is empty because the old record did not contain enough source information to reconstruct exact geometry. As a result, the migrated record cannot reproduce the old visible highlight shape from persisted data alone.
