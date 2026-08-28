---
name: notebooks
description: "Buddy notebooks, Home, Inbox, chats, pin, archive, branch, compact."
---

# Notebooks

Use when the user asks what a notebook is, Buddy Home, Inbox / Quick Chat, or chats (pin, archive, branch, compact, undo).

A **notebook** is a **folder** Buddy has open. **Chats** live inside it. Sidebar chrome → `workspace.md`. First-launch home → `setup.md`.

## Notebooks

Use when the user asks what a notebook is, how to open or create one, Buddy Home, Inbox / Quick Chat, or why a notebook list is empty/broken.

A **notebook** is a **folder** Buddy has open (workspace). Chats live inside a notebook → Chats / sessions below. Sidebar chrome → `workspace.md`. First-launch home pick → `setup.md`.

### Defaults

- **Buddy Home** (managed create root): `Documents/Buddy` under the user’s home, unless they set another folder
- **Inbox**: managed folder named `Inbox` under Buddy Home
- **Quick Chat** = open/create Inbox, then a new chat there
- **Open list**: curated list of open notebooks — not every folder on disk
- Managed create goes under Buddy Home; **Open existing folder** can open any folder as a notebook
- When an opened folder contains Obsidian settings, Buddy asks whether to connect the vault; skipping keeps it as a regular notebook without Obsidian branding or capabilities

### What users do

| Goal | Path |
| --- | --- |
| Quick / throwaway chat | **Quick chat in Inbox** (opens Inbox, new chat) |
| Dedicated space | **New notebook** → name → folder under Buddy Home → opens with a new chat |
| Use an existing project/folder | **Open existing folder** → that folder becomes the notebook |
| Leave a notebook open list | **Close notebook** — removes from open list; **does not delete** the folder on disk |
| Change where new managed notebooks go | Settings → **General** → Buddy Home → **Change Home** |
| Reopen after close | Open existing folder, or create again with same name under Home if folder still exists |

Empty-state intent: **Inbox** for quick chats and loose notes; named notebooks for dedicated work.

### Inbox vs named notebooks

- Sidebar labels the `Inbox` folder **Quick chats** (basename still `Inbox` on disk).
- Named notebooks show the folder name.
- Same object type: both are folders with their own chats, files, and notebook settings.

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

## Chats / sessions

Use for **chats** in the sidebar and history inside a notebook. A **chat is a session** — same object (UI noun vs product noun).

Not for chat input beyond session slashes — `chat.md`. Notebook create/open — Notebooks above.

### Dual

| User | Product |
| --- | --- |
| chat | session |
| Branch / Branch from here | fork history into a new chat |
| Undo message | soft-hide that turn and later turns |
| Restore / redo | bring undone turns back |
| Compact session | summarize earlier context to fit the model window |
| Rename / archive | title change / leave the active list |

### Where

- Left sidebar under each open **notebook**: chat list, **New chat**, context menu.
- History / **All chats** popover: search titles in this notebook’s active chats.
- User-message actions: **Branch from here**, **Undo message**.
- Composer slash: `/new`, `/branch`, `/undo`, `/redo`, `/compact`.

### Defaults

- Chat lives in one notebook. New chat = draft until first send.
- Title starts as **New chat**; may auto-title after first real message. Rename anytime.
- **Pin** and **unread** are local UI prefs on this machine.
- **Archive** drops the chat from the active list (confirm). No in-app unarchive UI found — under-claim recovery.
- Auto-compaction **on** by default. Toggle: Settings → General → **Auto-compaction**. Manual `/compact` still works when off.
- Manual compact needs a selected model and an existing session.

### User paths

#### New / switch

1. Sidebar **New chat** or `/new` → empty draft in this notebook.
2. Click a chat row to open it (clears unread).
3. First send creates the durable session if still draft.

#### Pin, rename, archive, unread

Context menu on a chat row:

| Action | Effect |
| --- | --- |
| Pin / Unpin | Keeps chat high in sort |
| Rename | Dialog → short title |
| Archive | Confirm → remove from active list |
| Mark as unread / read | Unread dot; auto-unread when another session finishes while this one is not focused |

#### Organize list

Sidebar **Organize chats**: by notebook · chronological; sort created · updated; show **All chats** · **Relevant**.

#### Branch

- On a user message: **Branch from here**, or `/branch`.
- Creates a **new root chat** with history up to that point. Not a nested helper-task row.

#### Undo / restore

- **Undo message** or `/undo` → hides that turn and later turns.
- Banner with **Restore**, or `/redo`.
- If the run is busy, undo/restore aborts first.

#### Compact

- `/compact` (or `/summarize`) → shorter context for the model window.
- With auto on, overflow near the limit can compact automatically; may show **Auto-compaction approaching**.
- Context usage may show near the composer.

### Guardrails

- Prefer **chat** for users; **session** when the product noun helps — dual once if needed.
- Do not invent delete/share/cloud-sync for chats.
- Compaction rewrites **context** for the model; do not claim full transcript hard-delete unless the UI shows that.

### Gotchas

- Chat ≠ a different object from session.
- **Pin/unread** do not travel across machines.
- **Archive** is not proven “delete forever,” but users currently lack a restore UI.
- **Branch** = new sibling chat with copied history, not a helper task.
- **Undo** hides turns until restore.
- **Compact** fails without a model/session.
- Empty **New chat** drafts may not show as durable history until the first message.
- Helper-task rows nest under the parent chat.

### Related

- Notebooks above — notebook container / Home
- `chat.md` — composer, other slashes
- `workspace.md` — left sidebar chrome
- `settings.md` — General auto-compaction
