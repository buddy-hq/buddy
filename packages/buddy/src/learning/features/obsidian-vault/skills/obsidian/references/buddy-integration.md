# Buddy's Obsidian integration

Use this reference when an Obsidian vault is not the active Buddy notebook, or when the user asks what Buddy's first-class Obsidian support provides.

## How to open a vault

Tell the user to open the vault root as a notebook in Buddy:

1. Choose Buddy's option to open an existing folder.
2. Select the vault root—the directory containing `.obsidian/` or another Obsidian configuration directory—not the configuration directory itself.
3. Continue the conversation inside that notebook.

Buddy uses the existing directory in place. It does not import, copy, convert, or relocate the vault. Obsidian and Buddy continue working with the same files.

## What opening the vault enables

When Buddy detects an Obsidian vault as the active notebook:

- The notebook is identified with the Obsidian mark in Buddy's sidebar.
- The vault root becomes the deterministic boundary for agent file reads, searches, and edits; the agent does not need to guess among vaults.
- Markdown notes open in Bench with Obsidian wikilinks such as `[[Note]]`, aliases such as `[[Note|Label]]`, heading or block fragments, and embeds such as `![[Target]]` preserved during editing.
- Buddy resolves wikilinks against vault-relative paths, filenames, and frontmatter aliases so users can follow them between notes in Bench.
- Supported note and attachment embeds can be previewed from the vault.
- Obsidian callouts are displayed in Bench and serialized back to their original blockquote syntax.
- File changes made by the agent and edits made in Bench operate on the same vault files the Obsidian app uses.

This is usually preferable for ongoing work, cross-note navigation, or any task involving several notes. A one-off CLI operation can still be performed without opening the vault if the intended vault is resolved safely.

## What it does not do

Opening a vault in Buddy does not:

- install Obsidian or enable its CLI;
- modify `.obsidian/` settings or plugins;
- create a second copy of the vault;
- reproduce Obsidian's graph view, backlink index, Canvas renderer, or community-plugin runtime.

Use the official Obsidian CLI for Obsidian-computed operations such as backlinks or link-aware moves when it is available. Treat Canvas, Bases, and plugin configuration as structured files unless Buddy has an explicit surface for them.

## How to guide the user

Explain the benefit before asking the user to switch notebooks. A concise recommendation is:

> Open the vault folder as a Buddy notebook if you want wikilinks, embeds, callouts, and note navigation to work in Bench while keeping the agent anchored to that vault. Buddy uses the files in place, so nothing is imported or copied.

If the user does not want to open it, continue through the CLI or filesystem only after identifying the vault unambiguously. Never imply that opening the vault is required for every Obsidian operation.
