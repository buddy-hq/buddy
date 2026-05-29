Register and prepare a workspace resource from a source path and make it easily digestible for LLMs. Parses, splits, chunks big resources into digestible chunks and creates a single `{{ full_text_file_prefix }}-*.md` file.
What this tool does:
- uses the exact same backend pipeline as Add Resource / drag-and-drop in the UI or /resource add.
- accepts an absolute path or a workspace-relative path
- stages the source into `resources/<alias>/`
- triggers the standard resource preparation pipeline (same as `/resource add`)
- returns the canonical resource `id`, `alias`, status, and warnings
- optionally waits for preparation to leave `preparing`
- if a resource is prepared, its path appears in <notebook_resources> section.

Accepted inputs match the normal resource pipeline (for example: PDF, EPUB, DOCX, HTML, Markdown, TXT, CSV, JSON/YAML, and code/text files).
