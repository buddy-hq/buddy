Register and prepare a workspace resource from a source path using the exact same backend pipeline as Add Resource / drag-and-drop in the UI.

What this tool does:
- accepts an absolute path or a workspace-relative path
- stages the source into `resources/<alias>/`
- triggers the standard resource preparation pipeline (same as `/resource add`)
- returns the canonical resource `id`, `alias`, status, and warnings
- optionally waits for preparation to leave `preparing`

Accepted inputs match the normal resource pipeline (for example: PDF, EPUB, DOCX, HTML, Markdown, TXT, CSV, JSON/YAML, and code/text files).
