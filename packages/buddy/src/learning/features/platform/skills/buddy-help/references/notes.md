---
name: notes
description: "Buddy Notes library, Markdown editing, chat capture, message quotes, search, storage."
---

# Notes

Use when the user asks how to take, find, edit, or organize notes in Buddy. For personal learner memory, use `learner-memory.md`; for ordinary notebook files, use `library.md`.

## Where notes live

- **Notes** is a central library of Markdown (`.md`) files, separate from each notebook folder. Default location: **Buddy Home → Notes**.
- **Settings → General → Notes library → Choose folder…** changes the library location. **Reset to default** restores the default path. Changing the location does not move existing files.
- Buddy also lists ordinary `.md` files placed in the Notes library. Chat captures go into its **Chat notes** subfolder; captured images go into **Attachments**.
- Buddy associates its own notes with the notebook where they were created. A note remains in the central library even if that notebook is closed.

## Find and create

1. In a notebook chat, dock chat if needed and open **Notes** from the right rail.
2. Choose **This notebook** for notes linked to the active notebook or **All notes** for the whole library.
3. Search notes by title, path, notebook name, or content. Results are grouped into **My notes** and **Chat notes**, newest updated first.
4. Click a note to open its Markdown document on the **Bench**. Use **New note** in the Notes drawer or left sidebar to create a blank one.

**This notebook** filters by the note's Buddy notebook association. Plain Markdown files without that association appear under **All notes**. Closing a notebook does not delete its notes.

## Write and edit

- **New note** opens an editable Markdown document on the Bench with its title selected. Rename the title there; body edits save automatically. The Bench shows Saving, Unsaved, Saved, or Conflict when relevant.
- Notes support Markdown, images, and wiki links to other notes in the library. A link to a missing note does not create it automatically.
- In the chat composer, choose **Take a note** (note icon) or `/note`; write and press **Save**. This records the entry in that chat's note, rather than sending a chat message to Buddy. **Return to chat** switches the composer back.
- Note mode can save image attachments. Other attachment types are unsupported there. A capture can contain up to 10 images, each up to 20 MB.
- On a chat message, choose **Quote in note** to put that message into note mode. Add your own text and save; the chat note includes a quote with an **Open message** link. A quote can also be saved without extra text.
- Captures from the same chat append to one chat note, with dates and times. **Open note** on the chat title bar opens it when one exists; a chat note's **Open chat** returns to the source chat when available.

## Delete and recovery

- Use a note's context menu in **Notes**, or **Delete note** on its Bench document. Buddy offers a short **Undo** window before moving the file to the operating system's Trash or Recycle Bin.
- If the source notebook or chat is unavailable, the note stays in the central library; **Open chat** cannot navigate to that source.

## Gotchas

- **Notes** are files the user can edit. **Memory** is a separate, opt-in learner memory feature.
- **Files** browses the active notebook folder. Use **Notes** to find the central library.
- Note mode saves to the chat note; **New note** creates a standalone document.
- If changing the Notes library makes old notes disappear, point the setting back to their original folder; Buddy did not move the files.
