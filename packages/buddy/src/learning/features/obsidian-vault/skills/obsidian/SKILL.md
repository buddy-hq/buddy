---
name: obsidian
description: "Obsidian vault: discover vaults, search/read/write notes, backlinks, Bases, Canvas."
---

# Obsidian

Use this for Obsidian vault work. An Obsidian vault is a normal directory of Markdown files and attachments plus an Obsidian configuration directory such as `.obsidian/`.

## Choose the vault

Do not assume the active Buddy notebook is an Obsidian vault.

1. If the active notebook contains an Obsidian configuration directory, use that notebook as the vault root. It takes precedence over other discovered vaults.
2. If the user supplied a vault path, confirm it is an Obsidian vault and use it.
3. Otherwise, run `obsidian vaults` to discover registered vaults. Use a vault only when the user's wording identifies it or exactly one suitable vault exists.
4. If multiple vaults remain possible, ask the user which one to use. Do not guess.
5. If no vault can be resolved, ask the user to open one as the active Buddy notebook or provide its path. Read [Buddy's Obsidian integration](references/buddy-integration.md) before explaining what opening the vault enables.

Use a concrete absolute vault path after resolving it. Do not rely on a fixed path, environment variable, or fallback vault elsewhere on the machine.

## Buddy integration

Opening the vault root as a Buddy notebook enables Buddy's first-class Obsidian compatibility and anchors the agent, Files explorer, and Bench to the same vault. Use [Buddy's Obsidian integration](references/buddy-integration.md) when the user needs setup guidance or wants to understand the benefits and limits.

## First checks

The official Obsidian CLI provides Obsidian-aware operations that raw filesystem tools cannot. Check it before relying on it:

```bash
obsidian version
obsidian vaults
```

Vault commands resolve the vault from the working directory. Run them from the resolved vault root. Use `obsidian commands`, not `obsidian help`, to discover commands supported by the installed version.

If the CLI is missing or disabled, continue with filesystem tools when the requested work is safe without it. Ask the user to enable Obsidian's command-line interface when the task specifically requires CLI-only behavior. Do not edit application-level CLI settings automatically.

## Read workflow

Prefer the official CLI for Obsidian-aware queries:

```bash
obsidian search query="term" format=json
obsidian search:context query="term" limit=20 format=json
obsidian read path="Folder/Note.md"
obsidian file path="Folder/Note.md"
obsidian outline path="Folder/Note.md" format=json
obsidian backlinks path="Folder/Note.md" format=json
obsidian links path="Folder/Note.md"
obsidian properties path="Folder/Note.md" format=json
```

Use available read, glob, and grep tools when you know the path, need exact file contents, or the CLI is unavailable. Restrict searches to Markdown when attachments are irrelevant. Report which vault or source you used when the choice or freshness matters.

## Write workflow

Choose the narrowest safe operation:

- Read an existing note before changing it.
- Use a focused edit or patch for ordinary note changes.
- Create a note with `obsidian create path="Folder/Note.md" content="..."` when CLI handling is useful.
- Append with `obsidian append path="Folder/Note.md" content="..."` or use a focused file edit for multiline prose.
- Prefer `obsidian move path="Old.md" to="Folder/New.md"` for renames and moves so Obsidian can update links.
- Use `obsidian daily:path`, `obsidian daily:read`, and `obsidian daily:append content="..."` for daily notes.
- Open Obsidian after a write only when useful or requested.

Avoid fragile shell quoting for long content. Preserve YAML frontmatter, wikilinks, embeds, block identifiers, callouts, and unrelated formatting.

## Obsidian authoring

- Link notes with `[[Note]]`.
- Use `[[Note|Label]]` for custom display text.
- Use `[[Note#Heading]]` or `[[Note#^block-id]]` for heading and block targets.
- Embed notes and attachments with `![[Target]]`.
- Write callouts as blockquotes such as `> [!note]`; keep every callout body line blockquoted.
- Store reusable alternate note names in the frontmatter `aliases` property.
- Prefer an explicit vault-relative path when a target name is ambiguous.

Add reciprocal links only when they genuinely improve navigation. Do not manufacture a dense link graph.

## Bases, Canvas, and plugins

Use CLI discovery before assuming commands or file capabilities:

```bash
obsidian bases
obsidian base:views path="Projects.base"
obsidian base:query path="Projects.base" view="Active" format=json
obsidian plugins format=json
obsidian plugins:enabled format=json
obsidian commands filter=workspace:
```

Treat `.canvas`, `.base`, and `.json` files as structured data. Preserve formatting where practical and validate JSON after edits. Buddy may edit these files without being able to render every Obsidian-specific surface.

## Safety

- Stay inside the resolved vault unless the user explicitly requests application-level configuration work.
- Do not edit `.obsidian/` or another Obsidian configuration directory unless the user explicitly asks to change settings or plugins.
- Do not bulk rewrite the vault.
- Do not delete notes unless explicitly asked; prefer Obsidian's trash behavior over permanent deletion.
- If multiple vaults exist, never silently substitute one for another.
- Preserve frontmatter, wikilinks, embeds, and block identifiers unless the task is to change them.
