---
name: obsidian
description: "Buddy Obsidian vault connection, notebook files, wiki links, embeds, callouts."
---

# Obsidian Vaults

Use when the user asks how to open an Obsidian vault in Buddy or what connecting one changes. A vault is an existing folder used as a Buddy notebook; Buddy works with its files in place.

## Connect

1. Choose **Open existing folder** and select the vault root, which contains `.obsidian/`.
2. At **Connect Obsidian**, choose **Connect** to use Obsidian links and previews on the Bench. **Not now** opens the folder as a regular notebook.
3. Work in that notebook. The sidebar shows an Obsidian mark when connected.

Connecting does not install Obsidian, copy the vault, move files, or change its settings and plugins.

## What works

- Markdown documents in **Files** open on the Bench with `[[wiki links]]`, aliases, heading or block targets, and supported `![[embeds]]`.
- Buddy resolves links across vault files and shows supported callouts and embeds while preserving Markdown source during editing.
- Edits on the Bench and file changes made by Buddy operate on the same vault files that Obsidian uses.
- To stop using vault-specific behavior, open the notebook's left-sidebar context menu → **Disconnect Obsidian**. The folder and files remain.

Buddy does not reproduce Obsidian's graph, backlinks index, Canvas view, or community plugins. For a one-off file task, the vault can remain a regular notebook if its location is clear.

## Related

`notebooks.md` — opening folders; `library.md` — Files and Markdown on Bench; `notes.md` — Buddy's separate central Notes library.
