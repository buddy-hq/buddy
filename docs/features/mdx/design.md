# MDX on Markdown Bench

## Product Contract

Markdown Bench is the viewing and editing surface for both `.md` and `.mdx` workspace files. Monaco is reserved for source-oriented file types.

`MarkdownBenchEditor` wraps MDXEditor for rich-text editing. Documents are stored and round-tripped as plain Markdown/MDX text; MDXEditor is not exposed as an application-wide API.

## Supported Document Features

| Feature | Markdown | MDX | Current boundary |
| --- | --- | --- | --- |
| Headings, paragraphs, emphasis, quotes, lists, links, tables, thematic breaks | Yes | Yes | Round-trip through Markdown text. |
| Fenced code blocks and inline/display math | Yes | Yes | CodeMirror and KaTeX renderers. |
| Mermaid blocks and images | Yes | Yes | Mermaid source is preserved; images use the safe media path. |
| YAML frontmatter and container directives | Yes | Yes | Known admonitions are styled; unknown containers remain neutral structural sections. |
| HTML comments | Preserved | Yes | MDX comments are normalized outside fenced/inline code. |
| Safe HTML layout and inline SVG | No raw preview | Yes | Allowlists below; no arbitrary intrinsic execution. |
| Imports and custom components | No | Preserved | Source is retained and rendered as inert labeled blocks. |

The advanced authoring controls live behind the Markdown Bench dock's Advanced action rather than
in a permanent header toolbar. The wrapper keeps editor controls, dialogs, and selection UI out of
print output.

## Documents-Not-Programs Boundary

MDX files are treated as authored educational documents, not executable React programs. Buddy parses JSX syntax but strictly prohibits arbitrary code execution:
- Imports, exports, and custom JSX components are parsed and preserved in source, but rendered as inert labeled blocks.
- JavaScript expressions, event handlers (`onClick`, `onError`), and `srcDoc` are stripped.
- Arbitrary component runtimes (e.g. Sandpack) and eval environments are excluded.

## Safe Rendering Constraints

### Safe HTML and SVG Allowlists
- **HTML**: Structural elements (`section`, `div`, `span`), typography/emphasis, lists, tables, figures, details, and safe images.
- **SVG**: Vector elements (`svg`, `path`, `rect`, `circle`, `line`, `polyline`, `polygon`, `text`, `defs`, `g`, `linearGradient`, `radialGradient`, `mask`, `pattern`), with `href`/`xlink:href` restricted to same-document fragment identifiers (`#id`).

### Style and Resource Restrictions
- Inline styles are restricted to an allowlist of layout and typography CSS properties.
- CSS expressions, JavaScript URLs, and external CSS `url()` references are rejected.
- Images are restricted to safe URLs and `data:image/*` data URIs.
- Scripts, iframes, `foreignObject`, audio, and video elements are blocked.

## Error Recovery and Normalization

If MDX rich-text parsing fails, Markdown Bench switches to source mode, displaying MDXEditor's parser error alongside raw text for manual repair. Syntax normalization automatically converts standard HTML comments (`<!-- -->`) outside code blocks into MDX comments (`{/* */}`).

## Print Behavior

Print/PDF export uses a read-only theme:
- All editor toolbars, dialogs, dock panels, and selection handles are stripped.
- `break-inside: avoid-page` is applied to figures, images, SVG diagrams, Mermaid diagrams, display math, code blocks, tables, and MDX intrinsic blocks.
- Images and SVG are constrained to printable page height so a block that fits on one page moves
  intact to the next page instead of splitting.

## Verification

The stress document covers frontmatter, imports, custom components, rich text, links, quotes,
lists, tables, admonitions, code, math, Mermaid, Markdown images, HTML comments, styled HTML, an
intrinsic image, and labeled SVG. Focused tests cover generic container directives, unsafe
attribute removal, invalid-MDX recovery, advanced-toolbar placement, print serialization,
workspace/resource routing, and `bench_present`.

Relevant implementation:

- `packages/workspace-file-policy/src/index.ts`
- `packages/web/src/components/bench/markdown-bench-editor.tsx`
- `packages/web/src/components/bench/markdown-bench-mdx-intrinsic.tsx`
- `packages/web/src/components/bench/markdown-bench-compatibility.ts`
- `packages/web/src/components/bench/markdown-bench-page.tsx`
- `packages/web/src/lib/markdown-pdf-export.ts`
- `packages/buddy/src/learning/features/bench/tools/present.ts`
