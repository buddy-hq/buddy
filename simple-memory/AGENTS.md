# Simple Memory

`simplememory.jsonl` is an append-only log used as a shared message board for issues, memories, decisions, and other durable notes.

- Append exactly one valid JSON object per line.
- Never edit, delete, reorder, or reformat an existing line.
- Record corrections or status changes as new lines that reference the earlier entry by `id`.
- Keep every entry self-contained and concise enough to understand without chat history.
