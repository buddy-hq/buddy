---
name: notebooks
description: "Buddy notebooks, Home, Inbox, threads, pin, archive, branch, compact."
---

# Notebooks

Use when the user asks what a notebook is, Buddy Home, Inbox / Quick Chat, or threads (pin, archive, branch, compact, undo).

A **notebook** is a **folder** Buddy has open. **Threads** live inside it. Sidebar chrome → `workspace.md`. First-launch home → `setup.md`.

## Notebooks

Use when the user asks what a notebook is, how to open or create one, Buddy Home, Inbox / Quick Chat, or why a notebook list is empty/broken.

A **notebook** is a **folder** Buddy has open (workspace). Threads live inside a notebook → Threads / sessions below. Sidebar chrome → `workspace.md`. First-launch home pick → `setup.md`.

### Defaults

- **Buddy Home** (managed create root): `Documents/Buddy` under the user’s home, unless they set another folder
- **Inbox**: managed folder named `Inbox` under Buddy Home
- **Quick Chat** = open/create Inbox, then a new thread there
- **Open list**: curated list of open notebooks — not every folder on disk
- Managed create goes under Buddy Home; **Open existing folder** can open any folder as a notebook

### What users do

| Goal | Path |
| --- | --- |
| Quick / throwaway chat | **Quick chat in Inbox** (opens Inbox, new thread) |
| Dedicated space | **New notebook** → name → folder under Buddy Home → opens with a new thread |
| Use an existing project/folder | **Open existing folder** → that folder becomes the notebook |
| Leave a notebook open list | **Close notebook** — removes from open list; **does not delete** the folder on disk |
| Change where new managed notebooks go | Settings → **Advanced** → Buddy Home → **Change Home** |
| Reopen after close | Open existing folder, or create again with same name under Home if folder still exists |

Empty-state intent: **Inbox** for quick chats and loose notes; named notebooks for dedicated work.

### Inbox vs named notebooks

- Sidebar labels the `Inbox` folder **Quick chats** (basename still `Inbox` on disk).
- Named notebooks show the folder name.
- Same object type: both are folders with their own threads, files, and notebook settings.

### Buddy Home

- Default: `Documents/Buddy`.
- New **managed** notebooks are child folders there.
- Changing Home does **not** move old folders; it only retargets new managed creates.
- You can still open notebooks outside Home via **Open existing folder**.
- Onboarding may set Home then open Inbox — `setup.md`.

### Recovery

Rare: Buddy cannot restore the previous open-notebook list.

1. **Find in Buddy Home** — scan Home; multi-select → restore  
2. **Open folder** — pick one manually  
3. **Start fresh** — empty open list  

Do not invent other recovery UIs.

### Guardrails

- Answer users with **notebook**, **Buddy Home**, **Inbox**, **Quick Chat**.
- Dual once if needed: notebook ≈ workspace folder.
- **Close notebook** ≠ delete folder.
- Do not invent rename/delete-notebook-from-disk product flows.
- Notebook settings (memory, MCP for this notebook) → sibling leaves as needed.
- One open notebook is the active folder for that chat.

### Gotchas

- **Close ≠ delete**: folder and files remain on disk.
- **Home change**: old managed notebooks stay at the previous path.
- **Create name rules**: invalid characters / reserved names → create fails with a clear error.
- Dialog copy may say “documents folder” even if Home was customized — truth is under Buddy Home.
- Any folder is a notebook once opened: projects, notes folders, etc.

## Threads / sessions

Use for **threads** in the sidebar and history inside a notebook. A **thread is a session** — same object (UI noun vs product noun).

Not for chat input beyond session slashes — `chat.md`. Notebook create/open — Notebooks above.

### Dual

| User | Product |
| --- | --- |
| thread | session |
| Branch / Branch from here | fork history into a new thread |
| Undo message | soft-hide that turn and later turns |
| Restore / redo | bring undone turns back |
| Compact session | summarize earlier context to fit the model window |
| Rename / archive | title change / leave the active list |

### Where

- Left sidebar under each open **notebook**: thread list, **New thread**, context menu.
- History / **All threads** popover: search titles in this notebook’s active threads.
- User-message actions: **Branch from here**, **Undo message**.
- Composer slash: `/new`, `/branch`, `/undo`, `/redo`, `/compact`.

### Defaults

- Thread lives in one notebook. New thread = draft until first send.
- Title starts as **New thread**; may auto-title after first real message. Rename anytime.
- **Pin** and **unread** are local UI prefs on this machine.
- **Archive** drops the thread from the active list (confirm). No in-app unarchive UI found — under-claim recovery.
- Auto-compaction **on** by default. Toggle: Settings → Advanced → **Auto-compaction**. Manual `/compact` still works when off.
- Manual compact needs a selected model and an existing session.

### User paths

#### New / switch

1. Sidebar **New thread** or `/new` → empty draft in this notebook.
2. Click a thread row to open it (clears unread).
3. First send creates the durable session if still draft.

#### Pin, rename, archive, unread

Context menu on a thread row:

| Action | Effect |
| --- | --- |
| Pin / Unpin | Keeps thread high in sort |
| Rename | Dialog → short title |
| Archive | Confirm → remove from active list |
| Mark as unread / read | Unread dot; auto-unread when another session finishes while this one is not focused |

#### Organize list

Sidebar **Organize threads**: by notebook · chronological; sort created · updated; show **All threads** · **Relevant**.

#### Branch

- On a user message: **Branch from here**, or `/branch`.
- Creates a **new root thread** with history up to that point. Not a nested helper-task row.

#### Undo / restore

- **Undo message** or `/undo` → hides that turn and later turns.
- Banner with **Restore**, or `/redo`.
- If the run is busy, undo/restore aborts first.

#### Compact

- `/compact` (or `/summarize`) → shorter context for the model window.
- With auto on, overflow near the limit can compact automatically; may show **Auto-compaction approaching**.
- Context usage may show near the composer.

### Guardrails

- Prefer **thread** for users; **session** when the product noun helps — dual once if needed.
- Do not invent delete/share/cloud-sync for threads.
- Compaction rewrites **context** for the model; do not claim full transcript hard-delete unless the UI shows that.

### Gotchas

- Thread ≠ a different object from session.
- **Pin/unread** do not travel across machines.
- **Archive** is not proven “delete forever,” but users currently lack a restore UI.
- **Branch** = new sibling thread with copied history, not a helper task.
- **Undo** hides turns until restore.
- **Compact** fails without a model/session.
- Empty **New thread** drafts may not show as durable history until the first message.
- Helper-task rows nest under the parent thread.

### Related

- Notebooks above — notebook container / Home
- `chat.md` — composer, other slashes
- `workspace.md` — left sidebar chrome
- `settings.md` — Advanced auto-compaction

