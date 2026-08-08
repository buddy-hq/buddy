---
name: library
description: "Buddy library rail: Sources, Files, Boards, Creations; open on Bench."
---

# Library

Use when the user asks about the right-rail catalogs: **Sources**, **Files**, **Boards**, **Creations**, or how items open on Bench.

**Practice** (flashcards/quizzes) is separate: `practice.md`. Layout of the rail: `workspace.md`.

## Sources / reading

Use when the user asks about Sources, PDFs/EPUBs, the reader, preparing a book/resource, or whole-book reads.

**Sources** (library rail) = notebook reading catalog. Not Files (Files below), not Practice (`practice.md`), not Bench chrome (`workspace.md`).

### User path

1. Open **Sources** (right library rail) or `/resources`.
2. **Add source** or drop a **PDF/EPUB**. Wait until status is **Ready** (not Preparing / Unprocessed / Stale).
3. Click the source → **reader on Bench** (docked chat). Resume via Sources → **Continue** when offered.
4. Chat about the source. Buddy may process it or load more text (permission may ask).

Statuses: Unprocessed · Preparing · Ready · Stale · Unsupported · Error.

| Action | Where |
| --- | --- |
| Process / Rebuild | Row context menu |
| Remove | Context menu → Remove (confirm) |
| Process without object yet | Reader banner **Process for Buddy** |

### Formats

| Path | Formats |
| --- | --- |
| Sources add / drop / visual reader | **PDF, EPUB only** |
| Chat grounding without visual reader | Some other text types may work in chat without a Bench reader |

Invalid/corrupt files fail process.

### Settings

**Settings → Advanced → Behavior → Read entire book** (default on). Off blocks whole-book full-text load into context.

### Slash (user)

- `/resources` — open Sources
- `/resource add|rebuild|remove|use …` when listed in autocomplete

### Gotchas

- **Ready ≠ only “opened in reader.”** Full-text chat work needs a prepared Ready source.
- **Stale:** source file changed after process → Rebuild.
- **Preparing** can take time.
- Whole-book load is limited — large books often stay scoped. Not a broken source.
- Dropzone needs a real path; if drop fails, use Add source.
- Sources list is PDF/EPUB-centric; chat grounding of other files is not the same as the Sources catalog path.

## Files

Browse notebook files from the library rail. Open routes into Bench or reading — not a separate IDE.

Not Sources prepare (Sources / reading above), Bench layout (`workspace.md`), or AGENTS.md meaning (`instructions.md`).

### Open Files

1. Right workspace library rail → **Files**.
2. Search or expand the tree; click a file.
3. **Refresh files** reloads the tree.

Drawer unavailable while Bench is **floating** — dock chat for the rail.

### What opens where

| File | Opens |
| --- | --- |
| `.pdf` / `.epub` | Reading (reader) when available |
| `.md` / `.mdx` | Markdown document on Bench |
| Images, audio, video, csv/tsv, common text/code | File on Bench |
| Office decks/docs, archives, many binary types | **Open in default app** (desktop) |

Unsupported in Buddy: use default app / reveal / copy path.

### Large files (~1 MB text-like)

When size is known, over **~1 MB**, and text-like Bench content:

- Dialog: **Open large file?** → **Open anyway** or **Open in default app** (desktop) or cancel.
- If already on Bench without approval: **Large file** warning → **Open anyway**.
- Approval is one-shot for that open — not permanent.

### File actions (Bench toolbar menu)

Desktop when available:

- **Open in default app**
- **Reveal in Finder** (macOS) / **Reveal in File Explorer** (Windows)
- **Copy path**

### Save as PDF

- Only on **Markdown Bench** (open a `.md` / `.mdx`).
- **Save as PDF** (busy: **Saving PDF**).
- **Desktop only.** Writes into the **notebook folder**. Toast: **Saved PDF to the notebook.**
- Not a general export for arbitrary file types.

### Guardrails

- User path: Files drawer + click.
- Opening a large text-like file may land on the large-file warning until the user chooses **Open anyway**.

## Boards

Use when the user asks about the whiteboard, Boards drawer, drawing on canvas, sharing a board, or how Buddy sketches live.

**Boards** (rail) = catalog of whiteboards in the notebook. Not Creations (widgets, Mermaid, figures, media) — Creations below. Opens on **Bench** — `workspace.md`.

### User paths

- Library rail → **Boards**.
- Empty: **No boards yet** → **Create board** creates and opens an editable empty canvas immediately. It does not fill or send the chat composer.
- With boards: choose any board → open it on Bench (header **Whiteboard**).
- On canvas: pan/zoom; draw when Buddy is not mid-draw. Learner edits autosave.
- **Share board**: encrypts upload to excalidraw.com and opens the share link (network). Disabled while Buddy is still drawing.
- Empty Bench pane: “Ask Buddy to draw on the whiteboard.”

### Defaults

- Whiteboards belong to the notebook and use stable object IDs. Multiple chats can open and edit the same board; opening one never switches chats.
- New topics usually continue on the same board unless the user asked to wipe the whole board.
- For a new Buddy drawing, Bench opens immediately with a temporary loading animation. The animation disappears as soon as the first complete drawable element arrives; later elements appear one by one before the tool finishes. Only the validated finished board is saved.
- Updating an existing board never hides its current content behind the loading animation. The populated canvas stays visible while Buddy's streamed changes compose over it.
- Share is the export path found.

### Gotchas

- **Create board** directly creates a notebook-owned empty board; ask Buddy in chat when you want it to draw for you.
- While Buddy draws, canvas is view-only; edit after the turn settles.
- Denying or failing a new drawing removes its temporary preview and does not leave a board behind.
- If a board is collapsed when an authorized update starts, Buddy reopens that real board; the update does not switch chats.
- Destructive full replace: no in-app restore of the overwritten board.
- Share leaves Buddy (excalidraw.com). Fails offline.
- The Boards catalog is notebook-wide. Every chat in the notebook can open the same boards without switching chats.

### Related

`workspace.md`, Creations below, `workspace.md`, `chat.md`

## Creations

**Creations** is the library-rail catalog of visuals Buddy already made: widgets, Mermaid diagrams, figures, and presented media. Not whiteboards (Boards below) or practice sets (`practice.md`).

Open: right library rail → **Creations**. Search, filter **All types / Widgets / Diagrams / Media**, sort recent. Hover preview; click opens the object on **Bench**.

Empty: “No creations yet” until Buddy presents something. **Create** only stages a chat prompt — it does not create files by itself.

### What lands in the catalog

| User asks for… | Filter |
| --- | --- |
| Interactive HTML / sim | Widgets |
| Flowchart / sequence / architecture diagram (Mermaid) | Diagrams |
| Exact geometry figures | Media → **Figure** |
| Freeform SVG figures | Media |
| Show existing images/PDF/video files | Media |

### Product rules

- Widgets are saved as files in the notebook; sandboxed (no CDN / remote scripts).
- Large widget viewports may auto-open Bench fullscreen.
- **Diagrams filter = Mermaid only.** Geometry/freeform list under **Media** as **Figure**.
- Creations inventory is notebook-local; whiteboards live under **Boards**.

### Gotchas

- Widget source size limits apply; multi-file widgets need a folder entry.
- Opening or updating a creation lands on Bench; the pane may still show load/error in UI.
- Mermaid may auto-repair in the browser.

### Related

Boards below, `workspace.md`, `workspace.md`, `extend.md`, `workspace.md`
