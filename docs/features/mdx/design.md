# MDX on Markdown Bench

## Product contract

Markdown Bench is the editing and rendering surface for both `.md` and `.mdx` workspace files. Monaco is reserved for source-oriented file types. A `bench_present` request for an MDX path uses the Markdown viewer, so agent-presented MDX and user-opened MDX follow the same route.

MDXEditor remains behind Buddy's `MarkdownBenchEditor` wrapper. Files are persisted as Markdown or MDX text; MDXEditor is not exposed as an application-wide API.

## Supported document features

| Feature | Markdown | MDX | Notes |
| --- | --- | --- | --- |
| Headings, paragraphs, emphasis, strong text, block quotes | Yes | Yes | Rich-text editing and Markdown shortcuts are enabled. |
| Ordered and unordered lists | Yes | Yes | Serialized back to Markdown. |
| Links and link editing | Yes | Yes | The advanced tools include the link dialog. |
| Tables | Yes | Yes | Editable in normal view and read-only in print view. |
| Thematic breaks | Yes | Yes | Standard `---` syntax. |
| Fenced code blocks | Yes | Yes | CodeMirror editing is enabled for common web and scripting languages. |
| Inline and display math | Yes | Yes | Buddy math nodes render with KaTeX and round-trip to source. |
| Mermaid blocks | Yes | Yes | `mermaid` code fences render as diagrams and preserve their source. |
| Images | Yes | Yes | Standard Markdown images and safe MDX `<img>` elements render. |
| Frontmatter | Yes | Yes | YAML frontmatter is parsed, editable, and preserved. |
| Container directives | Yes | Yes | Known admonitions such as `:::tip` render as styled callouts; other containers such as `:::answer-key` render as neutral structural sections and round-trip. |
| HTML comments | Preserved | Yes | In MDX, `<!-- -->` comments are normalized to MDX comments before parsing. |
| Safe HTML layout | No raw preview | Yes | An allowlist of structural and inline elements renders as an inert preview. |
| Inline SVG | No raw preview | Yes | Safe SVG geometry, gradients, labels, and grouped content render inline. |
| Imports and custom components | No | Preserved | They are displayed and round-tripped, but never executed. |

The advanced authoring controls are intentionally not a permanent top toolbar. The minimal Bench dock contains an Advanced button. Activating it opens a horizontally scrollable, separately spaced row above the minimal dock. Markdown Bench has no document header shell.

## Safe MDX rendering boundary

MDX files are treated as authored documents, not trusted React programs. Buddy parses JSX but does not evaluate imports, JavaScript expressions, event handlers, or custom components.

Safe HTML elements include document sections, `div`, `span`, text emphasis, lists, tables, figures, details, and images. Safe SVG elements include `svg`, shapes, paths, lines, polygons, groups, text, definitions, gradients, masks, patterns, and fragment-local `use` references.

The intrinsic renderer:

- preserves nested Markdown text nodes inside HTML and SVG, including text below diagrams;
- strips event attributes and `srcDoc`;
- ignores expression-valued attributes;
- permits only an allowlist of layout and typography CSS properties;
- rejects CSS expressions, JavaScript URLs, and external CSS `url()` values;
- permits image data URLs only when they are `data:image/*`;
- restricts SVG `href` and `xlink:href` to same-document fragment references;
- does not allow scripts, iframes, `foreignObject`, audio, or video.

Unknown or imported components render as inert labeled blocks. Their child Markdown remains editable and their source is preserved. Sandpack and arbitrary component execution are intentionally excluded because an educational document should not gain application privileges merely by being opened.

## Errors and recovery

An invalid MDX document must not produce a blank Bench surface. If rich-text parsing fails, Markdown Bench switches to source mode and shows MDXEditor's parser error with the original source available for repair.

Compatibility normalization is limited to syntax that MDX rejects but existing educational files commonly contain. In particular, HTML comments are converted to MDX comments outside fenced and inline code. Valid source is otherwise left intact.

## Print behavior

Print mode is read-only and uses the dedicated PDF theme. Editor toolbars, dialogs, table controls, selection affordances, the advanced dock panel, and the hidden MDXEditor toolbar root are excluded from exported markup.

Figures, images, SVG diagrams, Mermaid diagrams, display math, code blocks, tables, and safe MDX intrinsic blocks use `break-inside: avoid-page`. Images and SVG are constrained to the printable page height so a block that fits on one page moves to the next page instead of being split.

## Verification

The MDX editor stress test covers one document containing frontmatter, an import, a custom component, rich text, a link, quote, list, table, admonition, code, math, Mermaid, a Markdown image, an HTML comment, styled HTML, an intrinsic image, and labeled SVG. Separate tests cover generic container directives, unsafe attribute removal, invalid-MDX recovery, advanced-toolbar placement, print serialization, workspace routing, resource routing, and `bench_present`.

Relevant implementation:

- `packages/workspace-file-policy/src/index.ts`
- `packages/web/src/components/bench/markdown-bench-editor.tsx`
- `packages/web/src/components/bench/markdown-bench-mdx-intrinsic.tsx`
- `packages/web/src/components/bench/markdown-bench-compatibility.ts`
- `packages/web/src/components/bench/markdown-bench-page.tsx`
- `packages/web/src/lib/markdown-pdf-export.ts`
- `packages/buddy/src/learning/features/bench/tools/present.ts`
