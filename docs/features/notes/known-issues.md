# Notes known issues

This page contains only unresolved behavior risks and accepted product trade-offs. Resolved
implementation cleanup belongs in Git history, not in the current architecture documentation.

## A missed watcher event can leave the Notes list stale

Status: Open.

The library index in `packages/buddy/src/notes/library-index.ts` is invalidated by a recursive
`fs.watch`. The watcher only marks the index dirty; a later read performs the filesystem scan.
That separation is intentional because a watcher event is not a reliable description of the
final filesystem state.

If the operating system drops an event, however, the watcher still exists and the index remains
clean. `scanNotes` can then serve cached summaries indefinitely. Buddy-side creates, saves, and
renames explicitly invalidate the affected path, so the vulnerable case is an edit made in
Obsidian, Finder, or another external editor.

The existing fallback covers a watcher that could not be created, not a working watcher that
missed an event.

Suggested future fix: record when an index was built and force a rescan after a short age ceiling.
That would bound staleness without restoring a directory walk on every read. It is deliberately
not part of the readability refactor because it changes refresh behavior and performance.

## Query refresh does not directly update a mounted Markdown editor

Status: Worked around; the general constraint remains.

`MarkdownBenchPage` initializes editor state from `document.initialFile`. It does not replace
mounted editor state whenever React Query returns a new object, because doing so previously wiped
unsaved typing.

External writers therefore synchronize through the guarded editor lifecycle:

- activating a Bench surface calls its registered `synchronize` operation;
- completed agent turns synchronize the current workspace file;
- `packages/web/src/features/notes/use-note-capture-workflow.ts` synchronizes after a composer
  capture or message annotation.

The guarded path compares versions, reloads a clean editor, and raises a conflict instead of
overwriting dirty content. Any future writer that changes an open note outside the editor must use
the same lifecycle.

A future general solution could react to `document.initialFile.version`, but it must still route
through `synchronize`; assigning content directly is unsafe. That is intentionally excluded from
the readability refactor because it changes editor synchronization behavior.

## Note images may not render on the Bench outside the default Buddy Home

Status: Suspected from code; not reproduced.

Composer notes and message annotations save image attachments to `Attachments/` and link them
with relative Markdown image paths. The Bench loads those paths through `/api/file/raw` with the
Notes library as the directory, and that route only serves directories inside the backend's
allowed roots. The desktop app allows only the default Buddy Home, so a Notes library elsewhere,
such as a folder inside an Obsidian vault, would show a broken image on the Bench even though the
file and link are correct on disk and render in Obsidian.

Suggested future fix: serve note images through a Notes route that resolves paths against the
active Notes library and reads only inside `Attachments/`, and use it from
`notes-markdown-document.tsx`.

## Accepted trade-offs

These are decisions, not defects.

- **Notes writes are not absolutely gated.** Direct file reads in the library are allowed and
  direct edits ask, but shell, grep, and glob follow the user's normal policy. Buddy deliberately
  does not parse shell command strings to infer filesystem effects.
- **`buddy-session-id` has no portable counterpart.** The field references a Buddy conversation.
  The annotation's quoted text is what survives outside Buddy; the ID is retained as the join
  point for a future explicit export.
- **Captured images stay after their link is removed.** Composer notes and message annotations
  write images to `Attachments/` under generated names. Deleting an image link from a note does
  not delete the image file.
