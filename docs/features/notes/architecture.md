# Notes architecture

Read [product-decisions.md](./product-decisions.md) for the product contract. This page explains
where the code lives and how data moves through it.

## Where to start reading

Start with `packages/web/src/features/notes/notes-drawer.tsx`. It is the main user-facing entry:
it lists notes, creates a note, and opens a Notes Bench target.

Then follow one of its two paths:

```text
Open/edit: notes-drawer.tsx
  -> notes-markdown-document.tsx
  -> queries.ts -> api.ts
  -> packages/buddy/src/routes/notes.ts
  -> packages/buddy/src/notes/library.ts

Capture: use-note-capture-workflow.ts
  -> api.ts
  -> packages/buddy/src/routes/notes.ts
  -> packages/buddy/src/notes/chat-capture.ts
```

There is intentionally no barrel or artificial single execution function. The drawer and chat
capture are two real product entries that meet at the same API and filesystem model.

For backend-only reading, start at `packages/buddy/src/routes/notes.ts`. The one exception is the
library-directory setting, which enters through `packages/buddy/src/routes/global.ts` because the
existing global route owns application settings.

## Mental model

Notes is a global Markdown library at a user-selected filesystem path. It is a second file root
beside the active notebook; it is not an Obsidian integration or a separate document database.

Three paths write to the library:

1. The shared Markdown editor saves a note.
2. Composer Note mode or a message annotation appends to a chat's session note.
3. The agent edits files through the ordinary file tools and Notes permission overlay.

The Notes drawer and editor read through the Notes HTTP API. Prompt context and
`bench_read_context` describe or resolve the same files for the agent.

## Backend ownership

`packages/buddy/src/notes/` is arranged by responsibility:

| Module | Owns |
| --- | --- |
| `settings.ts` and `paths.ts` | Resolving the configured Notes library directory |
| `note-file.ts` | Parsing and rendering one Markdown note, including Buddy frontmatter |
| `library-index.ts` | Scanning the library and invalidating the watcher-backed scan cache |
| `library.ts` | Listing, creating, reading, saving, and renaming notes |
| `notebook-identity.ts` | Stable notebook IDs and their current display labels |
| `chat-capture.ts` | Turning composer notes and message annotations into session-note entries |
| `errors.ts` | Mapping Notes domain errors to HTTP responses |

`packages/buddy/src/routes/notes.ts` is only the HTTP boundary: it validates request data, calls
the appropriate Notes operation, and returns its result.

The dependency direction is deliberate:

```text
routes
  +-> library ---------> library-index -> note-file
  +-> chat-capture ----> library-index -> note-file
                      +-> notebook-identity
```

`library-index.ts` does not own note mutations. Mutations happen in `library.ts` or
`chat-capture.ts`, which then invalidate the affected indexed path.

## Frontend ownership

Notes-specific web code lives in `packages/web/src/features/notes/`:

| Module | Owns |
| --- | --- |
| `api.ts` | Typed SDK calls and API response types |
| `queries.ts` | TanStack Query keys, query options, invalidation, and cache publication |
| `create-note.ts` | The shared create-and-cache sequence for New Note entry points |
| `use-note-capture-workflow.ts` | Session preparation, capture, refresh signals, and first-use feedback |
| `capture-activity.ts` | The short-lived signal used by the rail, drawer row, and open tab |
| `notes-drawer.tsx` | Browsing, searching, creating, and opening library notes |
| `notes-markdown-document.tsx` | Adapting a Notes API document to the shared Markdown editor |
| `message-note-action.tsx` | The message action that starts an annotation draft |

Generic Bench and chat code may start a Notes workflow, but it should not implement one. For
example, the directory chat controller delegates capture to `use-note-capture-workflow.ts`, and
the shared Markdown page receives a single `MarkdownBenchDocument` description instead of a set
of Notes-specific optional props.

## Main data flows

### Open and edit a note

```text
Notes drawer
  -> Notes Bench target { root: "notes", path }
  -> notes-markdown-document.tsx
  -> api.ts / queries.ts
  -> MarkdownBenchDocument
  -> shared MarkdownBenchPage
```

The active chat directory remains the Bench context directory. The document's storage directory
is the global Notes library. Keeping both explicit prevents the editor from confusing notebook
paths with Notes paths.

### Create a standalone note

```text
New Note action
  -> create-note.ts
  -> POST /notes
  -> add the returned summary to the Notes cache
  -> open the returned Notes Bench target
```

### Capture from chat

```text
Composer Note mode or message annotation
  -> use-note-capture-workflow.ts
  -> ensure a chat session exists
  -> POST /notes/capture or /notes/annotate-message
  -> chat-capture.ts
  -> append one rendered entry to the session note
  -> invalidate Notes queries and signal affected UI surfaces
```

## Identity and boundaries

- A note is addressed by its path relative to the Notes library.
- A Buddy-created note also has a ULID in its frontmatter for portable identity; its filename is only the readable title.
- `buddy-notebook-id` records notebook membership; the readable notebook name is display data.
- Every in-memory Bench workspace-file target has an explicit `root` of `notebook` or `notes`.
- Only persisted-state and URL parsers translate a missing legacy root to `notebook`.
- The shared Markdown editor owns editing behavior. A `MarkdownBenchDocument` tells it where and
  how to load, save, and rename a particular document.

When adding to Notes, put filesystem policy in the backend Notes modules, cache policy in
`queries.ts`, workflow orchestration in a named feature workflow, and generic editing behavior in
the shared Markdown editor. Avoid threading new Notes conditionals through the directory chat
controller or Bench surface renderer.
