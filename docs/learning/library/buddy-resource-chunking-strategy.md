# Buddy Resource Chunking Strategy

Date: 2026-03-20
Status: Proposed

## Size Heuristic

Use a fast estimate only for chunking decisions:

```text
estimated_tokens = ceil(character_count / 4)
```

## Thresholds

| Unit | Max Size Before Split |
|---|---:|
| Chapter | 20,000 tokens |
| Everything else | 10,000 tokens |

Key rule:

- Do not shrink a chapter to small chunks just because it crossed the threshold.
- If a chapter must be split, split it into chapter parts that stay as close as possible to the same `20k` limit.
- Use `10k` for all non-chapter units, including heading sections, page windows, and generic fallback chunks.

## Pipeline

1. Extract normalized text.
2. Detect the strongest structure available.
3. Estimate size for each structural unit.
4. If the unit is under its threshold, emit it intact.
5. If the unit is over threshold, split only inside that unit.
6. When splitting a structural unit, use Chonkie `RecursiveChunker` only to find clean boundaries near that unit's own limit.
7. If strong structure is unavailable, fall back to weaker structure, but keep using the `10k` non-chapter threshold.

## Structure Order

### EPUB

1. Spine/nav chapters
2. Headings inside chapters
3. Generic recursive chunking

### PDF

1. PDF outline chapters
2. Inferred chapter/part headings
3. Page windows
4. Generic recursive chunking

### HTML / Markdown / DOCX / Plain Text

1. Top-level headings
2. Nested headings
3. Generic recursive chunking

## Splitting Rule For Structured Units

When a chapter or section is too large:

- Keep the part size near the same threshold as the intact limit for that unit.
- Example: a `20,100` token chapter becomes roughly `20,000` + `100`, not `10,000` + `10,000` + `100`.
- Use Chonkie to find the cleanest split boundary near the threshold.
- Repeat until the whole structural unit is emitted.

This preserves semantic cohesion while still enforcing a cap.

For this pipeline there are only two size constants:

- `CHAPTER_MAX_TOKENS = 20000`
- `NON_CHAPTER_MAX_TOKENS = 10000`

## Metadata Rule

Store chunk metadata in YAML front matter at the top of each markdown file.

Rules:

- The linked-list pointers live in front matter, not in a footer.
- Every chunk gets structural metadata, even if it is not split.
- Split chapter parts point to `prev_part` and `next_part`.
- Titles, part numbers, and size estimates should be visible both in the front matter and in the file body heading.

## Progressive Disclosure

Directory listing should already communicate the pack structure.

Rules:

- Use short numeric prefixes so files sort in reading order.
- Put high-level navigation first, detailed content later.
- Make chunk filenames descriptive enough that an agent can choose a file before opening it.
- Avoid semantic labels like `chapter` in filenames. Use neutral labels like `unit` and `pages`.
- Prefer explicit words over abbreviations in filenames.

## Naming

If a title is available, use it.

Recommended label shape:

```text
<title> | chars=<n> | est_tokens=<n>
```

If the unit is split:

```text
<title> | Part i/n | chars=<n> | est_tokens=<n>
```

## File Naming Templates

### Pack-Level Files

```text
00-resource.md
10-toc.md
20-full-text-est-tokens-<est_tokens>-chars-<chars>.md
```

### Structured Units

Use for chapter-like or heading-like units:

```text
30-unit-<unit_index:03>-<title_slug>-part-<part_index:03>-of-<part_count:03>-est-tokens-<est_tokens>-chars-<chars>.md
```

Examples:

```text
30-unit-003-appetite-part-001-of-002-est-tokens-19803-chars-79210.md
30-unit-003-appetite-part-002-of-002-est-tokens-00297-chars-01190.md
30-unit-007-goals-est-tokens-09420-chars-37680.md
```

Rules:

- Omit the `part-...-of-...` segment when `part_count = 1`.
- `title_slug` should be short and stable.
- Cap slug length so filenames stay readable.

### Page Windows

Use when PDF fallback reaches page-window mode:

```text
40-pages-<start_page:04>-<end_page:04>-est-tokens-<est_tokens>-chars-<chars>.md
```

Example:

```text
40-pages-0021-0034-est-tokens-03880-chars-15520.md
```

### Generic Fallback Chunks

Use only when no stronger structure is available:

```text
50-chunk-<chunk_index:03>-est-tokens-<est_tokens>-chars-<chars>.md
```

Example:

```text
50-chunk-007-est-tokens-02840-chars-11360.md
```

## Chonkie Role

Use Chonkie as the boundary finder, not as the top-level policy.

- default splitter: `RecursiveChunker`
- use it inside the current structural unit
- do not drop chapter-sized units down to generic small chunks unless chapter detection failed

## Front Matter For Generated Files

Use front matter on all generated markdown files, not only split chunks.

Recommended `file_kind` values:

- `resource_index`
- `toc`
- `full_text`
- `unit`
- `page_window`
- `generic_chunk`

This keeps the pack self-describing even when the filename is abbreviated.

## Front Matter Template

```yaml
---
file_kind: unit

resource_alias: shape-up
source_relpath: resources/shape-up/book.epub
format: epub

unit_kind: chapter
unit_title: "Chapter 3: Appetite"
unit_index: 3

part_index: 1
part_count: 2
part_key: chapter-003-part-001
prev_part: null
next_part: chapter-003-part-002

chars: 79210
est_tokens: 19803

threshold_tokens: 20000
split_reason: over_threshold

---
```

## Field Population

- `resource_alias`: Buddy resource alias.
- `source_relpath`: relative path of the original source file.
- `format`: extracted source format such as `pdf`, `epub`, `docx`, `html`, `markdown`, `text`.
- `file_kind`: kind of generated file, such as `resource_index`, `toc`, `full_text`, `unit`, `page_window`, `generic_chunk`.
- `unit_kind`: strongest structure used for this chunk, one of `chapter`, `section`, `page_window`, `generic`.
- `unit_title`: detected chapter or section title. If unavailable, use a generated label such as `Pages 21-34` or `Chunk 7`.
- `unit_index`: ordinal position of the structural unit within the document when known.
- `part_index`: 1-based index of this emitted part within the structural unit.
- `part_count`: total emitted parts for the same structural unit.
- `part_key`: stable key for this part.
- `prev_part`: `part_key` of the previous part, or `null`.
- `next_part`: `part_key` of the next part, or `null`.
- `chars`: character count of this emitted part after splitting.
- `est_tokens`: estimated token count of this emitted part using `ceil(chars / 4)`.
- `threshold_tokens`: threshold that governed the current structural unit.
- `split_reason`: `intact` when emitted without splitting, `over_threshold` when split because the unit crossed the threshold, `fallback_structure` when a weaker structure was used because stronger structure was unavailable.

## Minimal Front Matter By File Type

### `00-resource.md`

```yaml
---
file_kind: resource_index
resource_alias: shape-up
source_relpath: resources/shape-up/book.epub
format: epub
chars: 184320
est_tokens: 46080
---
```

### `10-toc.md`

```yaml
---
file_kind: toc
resource_alias: shape-up
source_relpath: resources/shape-up/book.epub
format: epub
---
```

### `20-full-text-...md`

```yaml
---
file_kind: full_text
resource_alias: shape-up
source_relpath: resources/shape-up/book.epub
format: epub
chars: 184320
est_tokens: 46080
---
```
