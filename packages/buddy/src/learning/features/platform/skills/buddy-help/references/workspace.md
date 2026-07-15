---
name: workspace
description: "Buddy workspace: layout, sidebar, rail, Bench docked/floating, what Buddy can do."
---

# Workspace

Use when the user asks what Buddy can do, where panels live, library rail icons, or Bench docked/floating/park/close.

Not notebook create/open detail beyond the map (`notebooks.md`). Not chat composer (`chat.md`).

## What Buddy can do

Use when the user asks what Buddy is or what it can do.

Not install/setup (`setup.md`), not Settings tours (`settings.md`).

### Product in one breath

Buddy is a **local-first learning companion** on this machine: chat in a **notebook**, plus **Bench** and the library rail for work that needs more room than the transcript.

No Buddy multi-user accounts. AI providers may still need login or keys — `providers.md`, `trust.md`.

### What users can do (map, not tour)

| Want… | Where | More |
| --- | --- | --- |
| Chat, slash, agent questions | Chat input | `chat.md` |
| Large files, widgets, boards, reading | Bench | `workspace.md` |
| Layout / library rail | Chrome around chat | `workspace.md` |
| Notebooks, Home, Inbox | Open a notebook | `notebooks.md` |
| Chats / history | Sidebar chats | `notebooks.md` |
| PDF/EPUB | Sources | `library.md` |
| Flashcards / quizzes | Practice | `practice.md` |
| Whiteboard | Boards | `library.md` |
| Widgets / diagrams / media | Creations | `library.md` |
| Files | Files explorer | `library.md` |
| Extra agent workflows | Right rail → Skills | `extend.md` |
| Profile / AGENTS.md | Instructions | `instructions.md` |
| Models / keys / OAuth | Providers | `providers.md` |
| Permission prompts | Allow once / always / reject | `trust.md` |
| Remember me | Memory | `learner-memory.md` |
| MCP servers | Settings → MCP | `extend.md` |
| Math/standards packages | Advanced packages | `extend.md` |

### Defaults

- Local-first, single machine.

### Gotchas

- **Allow always** = until restart (`trust.md`).
- Memory is not “remembers everything by default” (`learner-memory.md`).

## Layout

Use when the user asks where panels live, how to show/hide sidebar or right workspace, what the rail icons are, or why the layout changed with Bench.

Not for Bench present/park/close (Bench below), chat history (`notebooks.md`), notebook create/home (`notebooks.md`), or chat docks (`chat.md`).

### Map

Three columns in a notebook chat:

| Region | Holds |
| --- | --- |
| **Left sidebar** | Notebooks + chats, Settings |
| **Center** | Conversation (transcript + composer) |
| **Right workspace** | Library rail, optional drawer, optional Bench |

Titlebar (desktop): **left panel** toggle, **right panel** toggle, optional **Pop out chat** when docked Bench is up.

### Left sidebar

- Body: **Notebooks** — each notebook lists **chats** (pin, unread, archive, rename).
- Hover toolbar: organize (by notebook / chronological), sort (created / updated), create notebook.
- Footer: **Settings**.

Show/hide: titlebar **Expand/Collapse left panel**. Width is resizable; preference persists.

**Narrow docked Bench:** left sidebar may open as an **overlay** (outside click / Esc closes). Resize or collapse the right workspace to pin it again.

**Floating chat:** left sidebar stays hidden until chat is docked.

### Right workspace

Right edge is a vertical **rail**. Icons open drawers (same icon again closes when Bench is open):

| Rail | Drawer |
| --- | --- |
| **Search** | Notebook search |
| **Sources** | PDF/EPUB resources |
| **Practice** | Flashcards + question sets |
| **Creations** | Widgets, diagrams, media |
| **Boards** | Whiteboards |
| **Files** | Project file tree |
| **Skills** | Installable skill packages (Installed / Discover) — `extend.md` |
| **Notebook Instructions** | Not a list — opens `AGENTS.md` on Bench |

Show/hide whole right side: titlebar **Expand/Collapse right panel**.

- Expand with **no Bench open** → usually restores the **last drawer** (default **Sources**).
- Expand with **Bench open** → shows Bench; rail can open a drawer **over** Bench.
- Opening a list item typically **closes the drawer** and puts content on Bench.

**Create** in Boards/Creations: stages a prompt in the composer — user still sends.

### Docked vs floating

| | **Docked** | **Floating** |
| --- | --- | --- |
| Chat | Side column | Movable chat over Bench |
| Left sidebar | Available (or overlay if tight) | Hidden |
| Rail / drawers | Available | Hidden — dock chat first |
| Switch | **Pop out chat** when Bench is docked | **Dock chat** to restore side layout |

Buddy may auto-float if the docked split is dragged past a workable width. Users do not pick a named “layout profile.”

### Gotchas

- **Floating hides the rail.** Sources/Files/Skills/etc. need docked chat again.
- **Right panel expand ≠ empty forever** — with no Bench, last drawer (often Sources) reopens.
- **Notebook Instructions** is on the rail but opens a file, not a catalog drawer.
- Panel toggles live in the **desktop titlebar** (“left panel” / “right panel”), not Settings.
- Users open drawers from the rail; content lands on Bench (Bench below).

### Related

- Bench below — docked/floating, park, close
- `notebooks.md` — notebooks, Home, Inbox
- `notebooks.md` — chats, pin, archive
- `chat.md` — composer, docks
- `settings.md` — Settings (entry is left sidebar footer)

## Bench

Use when the user asks about Bench, docked vs floating chat, present/park/close, or how content leaves the transcript. Capital **B**.

Not Library drawers alone (browsers). Not the chat composer. Bench is the place large content can open.

### What it is

Workspace for content that needs more room than chat: files, Markdown, reading, whiteboard, widgets, diagrams, figures, media, flashcards, question sets. Beside or under chat in the notebook.

### Layout

| Mode | User sees | Controls |
| --- | --- | --- |
| **Docked** | Chat left \| Bench right | **Pop out chat** → floating. **Collapse right panel** parks Bench. |
| **Floating** | Bench full; chat movable window | **Dock chat** → docked. **Minimize pop-out chat** hides chat; **Restore chat** returns it. |
| **Parked** | Right panel collapsed; content may still be open but hidden | **Expand right panel** reveals. |
| **Closed** | No Bench — normal chat | Open something again. |

Mode on open: keep current mode if Bench already open → else last preference for that content type → else defaults (whiteboard / large HTML / some media → floating; most files/reading/practice → docked). User mode changes stick per content type.

Minimize floating chat does **not** close Bench.

### User paths

- Open: Files, library rail (Sources, Practice, Boards, Creations…), or file open → can land on Bench.
- Park: Collapse right panel (docked).
- Close: leave Bench for chat (may prompt if Markdown has unsaved work).
- Float / dock: **Pop out chat** / **Dock chat**.

### Guardrails

- Prefer UI nouns for users: Bench, Pop out chat, Dock chat, Collapse/Expand right panel.
- Close only on explicit user ask; park is collapse, not close.
- Unsaved Markdown can block replace/close.

### Gotchas

- Docked is **Chat left \| Bench right** (not the reverse).
- Parked looks like “gone” but content may still be open under the collapsed panel.
- Opening something on Bench is best-effort; the pane may still show load/error in UI.
- Auto-open (e.g. whiteboard) is best-effort and may skip if something else is already on Bench.

### Related

Layout above, `library.md`, `library.md`, `practice.md`, `library.md`, `library.md`, `chat.md`
