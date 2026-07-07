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
- Use inline SVG for precise static diagrams where labels and shapes matter.
- Use safe HTML for layout that Markdown cannot express cleanly, such as card grids or timelines.
- Use math blocks for equations and symbolic worked examples.
- Use admonitions for classroom-facing callouts, not for every paragraph.
- Use generic container directives sparingly for structural sections that need a durable source marker, such as an answer key or teacher-only extension.
- Do not rely on imported React components for the visible artifact. They are preserved but inert.
- Keep HTML and SVG well-formed. Invalid JSX/MDX switches the editor into source/error mode instead of producing a blank board.
- Use MDX comments: `{/* comment */}`. Raw HTML comments are normalized for compatibility, but author new documents with MDX comments.
- You can use wikipedia for images. You can also use other reputed sources or local images.
