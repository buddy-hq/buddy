# Buddy MDX Bench Support

## Supported Authoring Surface

| Need | Use | Notes |
| --- | --- | --- |
| Normal document structure | Markdown headings, paragraphs, emphasis, lists, quotes, thematic breaks | Rich-text editing and Markdown shortcuts work. |
| Tables | Markdown tables | Editable in normal mode; read-only in print mode. |
| Links | Markdown links | The advanced tools include link editing. |
| Code | Fenced code blocks | CodeMirror editing is enabled for common web and scripting languages. |
| Math | Inline and display math | Renders through Buddy's KaTeX-backed math nodes and round-trips to source. |
| Process or concept diagrams | Mermaid fenced blocks | Renders as diagrams while preserving Mermaid source. |
| Chemical structures and reaction schemes | Chemistry fenced blocks: `smiles`, `cxsmiles`, `reaction-smiles`, `ket`, or `chemfig` | Renders the declared source while preserving it. Add optional `alt="…"` metadata after the fence language. |
| Callouts and named sections | Directive containers such as `:::tip` and `:::answer-key` | Use known admonitions for teacher notes, misconceptions, warnings, worked-example callouts, and checks for understanding. Use other container names for durable named sections that should remain editable and round-trip. |
| Metadata | YAML frontmatter | Parsed, editable, and preserved. |
| Images | Markdown images or safe MDX `<img>` | Prefer Markdown images unless MDX attributes are useful. |
| Rich layout | Safe HTML elements | Use for cards, grids, timelines, labeled sections, and compact classroom handouts. |
| Precise visuals | Inline safe SVG | Use for labeled diagrams, axes, cycles, manipulatives, and printable visual models. |
| Existing MDX custom JSX | Custom/imported components | Preserved and shown inertly; not executed as React. |

## What "Safe HTML/SVG" Means

Buddy treats MDX as an authored document, not as trusted application code. It parses JSX but does not evaluate imports, JavaScript expressions, event handlers, or custom components.

Allowed in practice:

- structural HTML such as sections, `div`, `span`, lists, tables, figures, details, and images;
- text formatting and basic layout styles from an allowlist;
- SVG geometry, paths, groups, text labels, definitions, gradients, masks, patterns, and same-document fragment references.

Stripped or blocked:

- scripts, iframes, `foreignObject`, audio, video, `srcDoc`, event attributes, expression-valued attributes, and unsafe URLs;
- JavaScript URLs, CSS expressions, and external CSS `url()` references;
- external SVG `href` / `xlink:href`; only `#local-fragment` references are allowed.

Nested Markdown text inside HTML/SVG is preserved, so labeled SVGs and HTML cards should show their text instead of becoming blank shapes.

If the user needs full HTML, scripting, or interactivity, use Buddy's native HTML widget pipeline instead of MDX and explain that boundary.

## Authoring Defaults

- Use Mermaid for flowcharts, sequences, state changes, and relationship diagrams.
- Use chemistry fences for structures and reaction schemes that can remain native to the MDX document. Do not create a separate SVG merely to make chemistry visible in MDX.
- Use `render_svg` only when the resource or its export genuinely needs a standalone `.svg` file, then reference that file with a Markdown image or safe MDX `<img>`. The tool needs an absolute destination path plus the exact chemistry `format` and `source`; it creates a normal file, not a Buddy object. Put alt text at the image usage site.
- After `render_svg` writes the file, you may **manually edit that SVG** (or the MDX image markup that points at it) to resize it, crop presentation, or adjust layout for the handout—especially when the teacher asks for bigger/smaller graphics. Prefer editing the existing asset over re-running the tool when only size or display scale changes.
- Use inline SVG for precise static diagrams where labels and shapes matter.
- Use safe HTML for layout that Markdown cannot express cleanly, such as card grids or timelines.
- Use math blocks for equations and symbolic worked examples.
- Use admonitions for classroom-facing callouts, not for every paragraph.
- Use generic container directives sparingly for structural sections that need a durable source marker, such as an answer key or teacher-only extension.
- Do not rely on imported React components for the visible artifact. They are preserved but inert.
- Keep HTML and SVG well-formed. Invalid JSX/MDX switches the editor into source/error mode instead of producing a blank board.
- Use MDX comments: `{/* comment */}`. Raw HTML comments are normalized for compatibility, but author new documents with MDX comments.
- You can use wikipedia for images. You can also use other reputed sources or local images.

## Example: `render_svg` for an MDX worksheet asset

**When:** the MDX needs a real image file (e.g. print layout, PDF export, or an image slot that should not use a live chemistry fence).
**When not:** the structure only needs to appear in Bench/chat—use a chemistry fence instead.

1. Call `render_svg` with absolute `filePath` ending in `.svg`, matching `format`, and unfenced `source`:

```json
{
  "filePath": "/Users/teacher/Buddy/Notebook/handouts/assets/ethanol.svg",
  "format": "smiles",
  "source": "CCO"
}
```

2. Reference the file from the MDX. Put alt text at the usage site:

```mdx
## Ethanol

![Ethanol structure](./assets/ethanol.svg)

Condensed formula: $\ce{C2H5OH}$.
```

Or with MDX image attributes when useful:

```mdx
<img src="./assets/ethanol.svg" alt="Ethanol structure" width="240" />
```

3. **Resize later without re-rendering chemistry** when the teacher asks for bigger/smaller:
   - Prefer adjusting display size in MDX (`width` / layout) or editing the SVG file’s `width` / `height` / `viewBox` (or a wrapper style) so the same asset scales in the handout.
   - Re-call `render_svg` only if the **chemical source or format** must change, not merely the printed size.

Default still: chemistry fence in MDX when a standalone file is unnecessary.
