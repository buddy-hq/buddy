Load a ready resource object's prepared full text into live context after validating context headroom against the active model limits.

What this tool does:
- accepts `resourceKey` as a resource `object_id` or alias
- resolves objectID first and alias second
- requires the resource object to be ready and expose a managed `full_text` file
- estimates live session usage and compares it with model input/context limits
- ingests full text only when enough post-ingestion reserve remains

Use this when the user needs grounded answers from the entire resource, such as a book, paper, or long-form document, not just individual chunks.
