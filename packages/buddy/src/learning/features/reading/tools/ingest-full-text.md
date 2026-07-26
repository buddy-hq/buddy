Load a ready resource object's prepared full text into live context after validating context headroom against the active model limits.

What this tool does:
- accepts `resourceKey` as a resource `object_id` or alias
- resolves objectID first and alias second
- requires the resource object to be ready and expose a managed `full_text` file
- recalculates a UTF-8-aware estimate from the prepared body and never uses less than its stored estimate
- estimates live session usage against an input window capped at 250000 tokens for this tool only
- ingests full text only when enough post-ingestion reserve remains
- refuses to duplicate a PDF that is already present as native model input
- returns a scoped-reading fallback when the full text does not fit

Use this when the user needs grounded answers from the entire resource, such as a book, paper, or long-form document, not just individual chunks.
