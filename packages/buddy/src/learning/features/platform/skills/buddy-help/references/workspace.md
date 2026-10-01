---
name: workspace
description: "Buddy workspace: layout, sidebar, rail, Bench docked/floating/immersive, Bench tabs, New tab page, Search, what Buddy can do."
---

# Workspace

Use when the user asks what Buddy can do, where panels live, library rail icons, Bench docked/floating/park/close, Bench tabs, the New tab page, or Search.

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
| Search the notebook, start something new | Bench **New tab** page | `workspace.md` |
| Browse web pages in Buddy | Browser tab on Bench | `browser.md` |
| Layout / library rail | Chrome around chat | `workspace.md` |
| Notebooks, Home, Inbox | Open a notebook | `notebooks.md` |
| Chats / history | Sidebar chats | `notebooks.md` |
| PDF/EPUB | Sources | `library.md` |
| Take or find Markdown notes | Notes | `notes.md` |
| Flashcards / quizzes | Practice | `practice.md` |
| Whiteboard | Boards | `library.md` |
| Widgets / diagrams / media | Creations | `library.md` |
| Files | Files explorer | `library.md` |
| Extra agent workflows | Right rail → Skills | `extend.md` |
| Profile / AGENTS.md | Instructions | `instructions.md` |
| Models / keys / OAuth | Providers | `providers.md` |
| Permission prompts | Allow once / always / reject | `trust.md` |
| Remember me | Memory | `learner-memory.md` |
| MCP servers | Settings → MCPs | `extend.md` |
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

- Body: **Notebooks** — each notebook lists **chats** (pin, unread, archive, delete, rename). Create controls can offer **New chat**, **New note**, **New board**, and desktop **Browser** (a blank Browser tab — `browser.md`).
- Hover toolbar: organize (by notebook / chronological), sort (created / updated), create notebook.
- Footer: **Settings**.

Show/hide: titlebar **Expand/Collapse left panel**. Width is resizable; preference persists.

**Narrow docked Bench:** left sidebar may open as an **overlay** (outside click / Esc closes). Resize or collapse the right workspace to pin it again.

**Floating chat:** left sidebar stays hidden until chat is docked.

### Right workspace

Right edge is a vertical **rail**. Icons open drawers (same icon again closes when Bench is open):

| Rail | Drawer |
| --- | --- |
| **Sources** | PDF/EPUB resources |
| **Practice** | Flashcards + question sets |
| **Creations** | Widgets, diagrams, media |
| **Boards** | Whiteboards |
| **Files** | Project file tree |
| **Notes** | Central Markdown notes; filter this notebook or all notes — `notes.md` |
| **Skills** | Your skills and available skills in one catalog — `extend.md` |
| **Notebook Instructions** | Not a list — opens `AGENTS.md` on Bench |

Search is not on the rail: it lives on the Bench **New tab** page (New tab below).

Show/hide whole right side: titlebar **Expand/Collapse right panel**.

- Expand with **no Bench open** → shows a Bench **New tab** page (New tab below).
- Expand with **Bench open** → shows Bench; rail can open a drawer **over** Bench.
- Opening a content result typically closes the drawer and shows it on Bench. A chat result switches chats.

**Create board** in Boards immediately creates and opens an empty whiteboard. See `library.md`.
**Create** in Creations only stages a prompt in the composer — the user still sends it.

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
- **Right panel expand with nothing open** shows a **New tab** page, not a drawer.
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

Not only the right-rail catalogs. Bench is the place large content opens beside or behind chat.

### What it is

Workspace for content that needs more room than chat: files, Markdown notes, reading, Browser tabs, whiteboard, widgets, diagrams, figures, media, flashcards, question sets. Beside or under chat in the notebook.

Bench has a tab strip, like a web browser:

- **+** (desktop: **Cmd/Ctrl+T**) opens a **New tab** page (New tab below). Open as many as needed.
- **Cmd/Ctrl+1** … **Cmd/Ctrl+8** switch to that tab, counting from the left; **Cmd/Ctrl+9** switches to the last tab. A collapsed Bench opens on that tab.
- Desktop **Cmd/Ctrl+W** closes the tab on screen. On Mac, with no tab on screen, **Cmd+W** closes the window (**Cmd+Shift+W** always does). Right-click a tab for **Close**, **Close others**, **Close to the right**, and **Close all**; these also close New tabs, which sit to the right.
- **Immersive mode** (button at the start of the docked strip) expands Bench to the full window, with chat floating over it. In immersive mode the tabs sit in the window titlebar.

### Layout

| Mode | User sees | Controls |
| --- | --- | --- |
| **Docked** | Chat left \| Bench right | **Pop out chat** → floating. **Collapse right panel** parks Bench. |
| **Floating** | Bench full; chat movable window | **Dock chat** → docked. **Minimize pop-out chat** hides chat; **Restore chat** returns it. |
| **Parked** | Right panel collapsed; content may still be open but hidden | **Expand right panel** reveals. |
| **Closed** | No Bench — normal chat | Open something again. Closing the last tab of a docked Bench leaves a **New tab** page. |

Mode on open: keep the current mode if Bench is already open → else use the content default (whiteboard / large HTML / some media → floating; most files/reading/practice → docked). Float / dock changes belong to the current chat's saved Bench presentation, not a global content-type preference; returning to that chat restores its saved presentation and mode.

Minimize floating chat does **not** close Bench.

### User paths

- Open: Files, library rail (Sources, Notes, Practice, Boards, Creations…), a **New tab** page, or file open → can land on Bench. The sidebar's desktop **Browser** opens a Browser tab (`browser.md`).
- Switch: click a tab or **Cmd/Ctrl+1–9**.
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

## New tab

Use when the user asks about the Bench **New tab** page, the empty Bench, notebook Search, Quick open (Cmd/Ctrl+P), or finding a chat, file, source, creation, practice set, board, note, open tab, or web page.

### Open

- Bench **+**, **Cmd/Ctrl+T** (desktop), or **Expand right panel** with nothing open → a New tab page.
- **Cmd/Ctrl+Shift+F** (Search notebook) → returns to the last New tab used, or opens one.
- **Cmd/Ctrl+P** (Quick open) → the same search in a popup over the current tab. Everything below works the same, except a pick opens in a **new** tab (or runs its command) and the popup closes; **Esc** closes it. With a New tab page on screen, Cmd/Ctrl+P jumps into that page's field instead.
- New tabs are real tabs: each has a **New tab** entry in the strip after the content tabs, and closes like any tab.

### What the page shows

One field: **Search or run a command**.

Empty field:

- Tiles: **New board**, **New note**, desktop **Browser** (blank Browser tab in the default profile; its ▾ menu picks any profile, **Incognito** included), **Files**, **Notes**, **Resources** (the Sources drawer).
- Book shelf: covers of recent books, plus **Add resource** to add a PDF or EPUB.
- **Recent**: recent notebook items and, on desktop, recently visited Browser pages.

Typing (2+ characters):

- Results: chats, Sources, Creations, Practice, Boards, Notes, Files, and tabs already open. **Notes** covers the central Notes library, so it can include notes from other notebooks (`notes.md`).
- Actions matching the words, such as **New note**, **All notes**, **New board**, **Files**, **Practice**.
- Desktop: a URL or search terms offer **Browser** (opens the page or a web search with the default engine), plus matching Recently visited pages. A page already open in a Browser tab switches to that tab. Typing **browser**, a profile name, or **incognito** offers a blank Browser tab in that profile.
- Filter button narrows to **All types**, **Chats**, **Sources**, **Creations**, **Practice**, **Boards**, **Notes**, **Files**, or **Open tabs**.

### Keyboard

- Typing always stays in the field. **Up/Down** move the highlight; **Backspace** and typing keep editing.
- **Enter** opens the highlighted row (the top row while typing). If results are still loading, it opens once they finish, unless the user keeps typing or moves the highlight. Recent rows need an arrow key first.

### What opening does

- Content result, **New note**, **New board**, or a **Browser** choice → opens **in place of this New tab**.
- **Files**, **Notes**, **Resources**, **Practice**, **Creations**, **All boards** → open that drawer over the page; the New tab stays.
- Chat result → switches chats.
- Open tab result → switches to that tab.
- Each New tab keeps its own typed text and filter while the user is on other tabs. The text is not kept after Buddy restarts.

### Buddy and New tabs

Buddy sees when a New tab is showing, sees New tabs in the tab list, and can switch to one. A New tab has no content for Buddy to read.

### Gotchas

- Notebook results need at least two characters.
- A missing file shows an error instead of opening.
- Opening content from a New tab does not add a tab; it replaces the New tab.

### Related

`library.md`, `practice.md`, `notes.md`, `browser.md`, `chat.md`
