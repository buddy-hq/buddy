Register and prepare a local learning resource as a Buddy-managed resource object.

What this tool does:
- accepts normal resource source formats, including PDF, EPUB, DOCX, HTML, Markdown, TXT, CSV, JSON/YAML, and code/text files
- copies the source into Buddy-managed object storage under `.buddy/objects/v1/resource/<object_id>/source/`
- builds derived reading output under `.buddy/objects/v1/resource/<object_id>/derived/pack/`
- returns stable `object_id`, mutable `alias`, status, warnings, `managed_source`, `pack`, and `full_text` when available
- optionally waits for preparation to leave `preparing`

Use `object_id` or `alias` as the `resourceKey` in follow-up resource tools. Use exact `pack` and `full_text` paths from the tool result or resource inventory; these model-facing paths are already resolved for the current workspace. Do not rewrite them to `~/.buddy`, `/Users/<name>/.buddy`, `resources/<alias>/`, or `resources/<alias>/processed/`.
