Render a supported textual source format into a standalone SVG file. Currently, the supported formats are chemistry formats: `smiles`, `cxsmiles`, `reaction-smiles`, `ket`, and `chemfig`.

Use this tool only when another authored file or export needs an actual `.svg` file—for example an MDX document using an image reference, a slide deck, a PDF generation workflow, or another file-based artifact. Do not use it merely to show chemistry in chat or in MDX when a native chemistry Markdown fence is sufficient.

Choose `format` to match the source exactly and provide the complete source without a Markdown fence. Buddy does not infer formats, canonicalize chemistry, or silently repair invalid chemical meaning. The SVG is written atomically to `filePath`; an existing file remains untouched if rendering, sanitization, validation, or writing fails.

This tool creates a normal filesystem file. It does not create a Buddy object, Library entry, revision record, caption, or alternative text. Add accessibility text and captions at the location where the SVG is used.
