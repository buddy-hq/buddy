# Calibre annotation model

> **Status:** external-system research, checked 2026-08-08.

## Summary

Calibre's ebook viewer uses structured JSON-compatible records for highlights, bookmarks, and last-read positions. Its schema and persistence are book/viewer-specific Calibre formats.

## Highlight record

A highlight record contains fields such as:

```json
{
  "type": "highlight",
  "uuid": "STABLE_UUID",
  "timestamp": "2026-08-08T09:30:00Z",
  "spine_index": 4,
  "start_cfi": "epubcfi(/6/8!/4/2,/1:10,/1:56)",
  "highlighted_text": "Selected passage",
  "notes": "My note",
  "style": {
    "kind": "color",
    "which": "yellow"
  },
  "toc_family_titles": ["Chapter 3", "Important section"]
}
```

The exact optional fields vary by annotation type and viewer version. Recurring highlight fields include:

- stable UUID;
- annotation type;
- timestamp;
- CFI and spine position;
- duplicated highlighted text;
- notes;
- style;
- table-of-contents context;
- removed state for merging/deletion.

Calibre groups records in a map keyed by annotation type. The viewer code handles at least `highlight`, `bookmark`, and `last-read` records.

## Local viewer-file persistence

The desktop viewer has a local annotation directory. In the current source, `annotations_dir()` resolves to an `annots` directory under the viewer configuration directory. A book-specific `annotations_path_key` selects the file within that directory.

The viewer serializes the annotation collection as JSON bytes. The stored top-level payload is an array/tuple of annotation records, not the exported `calibre_highlights` wrapper shown below. The book identity is supplied by the viewer's path key rather than repeated as a general target URI inside every record.

## Embedded-book persistence

For writable EPUB and KEPUB files, Calibre can embed annotations in the book container. The current viewer persistence code writes:

- `META-INF/calibre_bookmarks.txt`, containing a Calibre file-type marker followed by a line-wrapped base64 encoding of the serialized JSON;
- `calibre-book-annotations.json`, containing the serialized JSON bytes.

The viewer writes these entries when the source format supports embedding and the file is writable.

## Calibre-library persistence and sync

When the opened book is associated with a Calibre library record, the viewer can also save its annotation list through the library annotation APIs. The surrounding library identity contains the library ID, book ID, and book format. Synchronization also carries a user identity where the Content server path requires it.

This path is separate from the viewer's local annotation file and the optional embedded-book copies.

## Export format

Calibre exports a custom JSON wrapper:

```json
{
  "version": 1,
  "type": "calibre_highlights",
  "highlights": []
}
```

It also exports HTML, Markdown, and plain text. See [Calibre highlight export](https://github.com/kovidgoyal/calibre/blob/master/src/calibre/gui2/viewer/highlights.py).

This is Calibre's highlight-export envelope. It is different from both the local viewer array and the embedded annotation payload. Calibre also supports rendered HTML, Markdown, and plain-text exports.

## Merge behavior

Calibre's merge helpers use type-specific identity:

- highlights are matched by `uuid`;
- bookmarks are matched by `title`;
- when matching records differ, the record with the newer timestamp wins;
- merged records are ordered using their CFI position.

The database indexing helper also uses a highlight's `uuid` as its searchable annotation identity and indexes normalized highlighted text plus notes. The viewer exposes a `removed` state used when filtering or reconciling records.

See [Calibre annotation merge helpers](https://github.com/kovidgoyal/calibre/blob/master/src/calibre/db/annotations.py).

## Target representation and scope

The target book identity is supplied by context: the viewer annotation path key, embedded book file, or Calibre library tuple. Within that book, a highlight stores ebook-specific location data such as `start_cfi`, `spine_index`, and table-of-contents context, together with copied selected text.

Calibre does not wrap each record in a general source-and-selector object for arbitrary resources. The format is a Calibre ebook annotation schema rather than the [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/).

## Sources

- [Calibre viewer annotation persistence](https://github.com/kovidgoyal/calibre/blob/master/src/calibre/gui2/viewer/annotations.py)
- [Calibre ebook viewer manual](https://manual.calibre-ebook.com/viewer.html#highlighting-text)
- [Calibre highlight export](https://github.com/kovidgoyal/calibre/blob/master/src/calibre/gui2/viewer/highlights.py)
- [Calibre annotation merge helpers](https://github.com/kovidgoyal/calibre/blob/master/src/calibre/db/annotations.py)
