Register and prepare a local learning resource as a Buddy-managed resource object.

What this tool does:
- accepts normal resource source formats, including PDF, EPUB, DOCX, PPTX, XLSX, XLS, XLSM, XLSB, ODS, Numbers, HTML, Markdown, TXT, CSV, JSON/YAML, and code/text files
- copies the source into Buddy-managed object storage under `.buddy/objects/v1/resource/<object_id>/source/`
- builds derived reading output under `.buddy/objects/v1/resource/<object_id>/derived/pack/`
- converts PPTX slides into ordered Markdown units with text, tables, notes, and available alt text
- converts spreadsheet sheets into Markdown row windows plus linked CSV artifacts under the pack's `sheets/` directory; it does not calculate formulas, extract or execute macros, or follow external links
- returns stable `object_id`, mutable `alias`, status, warnings, `managed_source`, `pack`, and `full_text` when available
- optionally waits for preparation to leave `preparing`

Use `object_id` or `alias` as the `resourceKey` in follow-up resource tools. Use exact `pack` and `full_text` paths from the tool result or resource inventory; these model-facing paths are already resolved for the current workspace. Do not rewrite them to `~/.buddy`, `/Users/<name>/.buddy`, `resources/<alias>/`, or `resources/<alias>/processed/`.
