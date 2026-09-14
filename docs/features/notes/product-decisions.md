# Buddy Notes V1 — product decisions

## Product boundary

Notes is a built-in Buddy feature. Obsidian is optional and requires no adapter: a user can point Buddy at a folder inside an Obsidian vault.

The Notes library contains ordinary Markdown. Buddy does not require a database, manifest, `buddy://` URL, or Buddy-only link syntax. Files remain useful when Buddy is not running.

V1 deliberately does not create chat transcript or rollout files. A session note stores its chat session ID so a future export feature can build on it without expanding the current capture path.

## Library location

The Notes library is a global folder chosen by the user.

- The default is `<Buddy Home>/Notes`.
- The configured path is stored separately from Buddy Home.
- Changing the Notes path changes a pointer and never moves files.
- Changing Buddy Home does not move or repoint Notes. On the first Buddy Home change, an implicit default Notes path is pinned to the previous `<Buddy Home>/Notes` location.
- `Attachments/` is reserved for note attachments.

There is no `Sessions/` folder in V1.

## What counts as a note

Every non-hidden `.md` file under the library is visible and openable, except files below reserved attachment storage. Symlink entries are not scanned.

Two forms coexist:

1. **Plain note** — any Markdown file without valid Buddy note frontmatter. It is addressed by its path, and the editor reads and writes the complete file.
2. **Stamped note** — a Buddy-created Markdown file with valid Buddy frontmatter. It is still addressed by path, but the editor presents the Markdown body while Buddy preserves the stamp.

Invalid or incomplete Buddy frontmatter does not hide a file; the file is treated as plain Markdown.

## Buddy-created metadata

Standalone notes use:

```yaml
---
type: buddy-note
buddy-id: 01K...
buddy-notebook-id: 01K...
notebook: Physics
---
```

Chat collection notes use:

```yaml
---
type: buddy-session-note
buddy-id: 01K...
buddy-notebook-id: 01K...
notebook: Physics
buddy-session-id: ses_...
---
```

The stable ULID lives only in frontmatter. A Buddy-created filename is the readable title, numbered the way Obsidian numbers duplicates when that name is taken:

```text
Readable title.md
Readable title 1.md
```

The filename is the note's only title. Buddy does not write the title into the body as a heading, and renaming changes only the filename. Older notes whose filenames end in ` — <ULID>` keep their title and lose the suffix when renamed. Until then, their displayed title reserves the equivalent bare filename, so a new note uses the next available numbered title instead of creating two identically named rows.

Windows-reserved device names are never written on any platform. Creation advances to the first safe numbered title (`NUL` becomes `NUL 1.md`); an explicit rename to a reserved title is rejected so Buddy does not silently substitute a different name during a rename.

The ULID preserves portable identity. It is not the Notes API or Bench address. Plain notes need no ULID, so all files use library-relative paths for opening, reading, updating, and renaming.

`buddy-notebook-id` provides durable notebook membership. The readable `notebook` label is display metadata. Listing Notes resolves the current notebook label from the identity registry without rewriting files.

## Notebook identity

The global notebook identity registry remains the source of stable notebook IDs.

- Prompt construction and note listing only read the registry.
- Creating a Buddy note or saving a chat capture may create or update an identity.
- Directory renames retain identity through filesystem identity when the platform exposes it.
- Corrupt registry JSON is renamed to a quarantined file before Buddy starts a clean registry.

## Capture model

One chat has at most one `buddy-session-note`.

Composer Note mode appends:

```markdown
## Note — 14:30

Text entered by the user.
```

Message annotation appends the readable message text plus the annotation:

```markdown
## Annotation — 14:32

> Readable message text

The user's annotation.
```

Synthetic prompt context and hidden text parts are not copied. Annotation text is never written into chat history.

New Note always creates an independent `buddy-note`; it never reuses the chat collection note.

## Bench behavior

Bench `workspace-file` targets declare their root:

```ts
{
  type: "workspace-file",
  root: "notebook" | "notes",
  path: "relative/path.md",
  viewer: "markdown"
}
```

Missing `root` on previously persisted targets is interpreted as `notebook`.

Notes targets contain real library-relative paths. There is no synthetic path and no ID lookup while opening a tab. Root participates in Bench target and tab identity, so a notebook file and a Notes file with the same relative path remain distinct.

Renaming changes a path-addressed target. After the file move succeeds, Buddy replaces the former target with the renamed target in place across every saved chat slot that references it. The current tab keeps its position, inactive chats do not retain the deleted path, and blocked or failed navigation leaves their slots unchanged.

Both roots use the shared MDX editor through an explicit `MarkdownBenchDocument` description.

## Permissions

The runtime overlay adds only these Notes-specific rules:

- `external_directory` for the Notes root and descendants: `allow`
- direct `read` for the Notes root and descendants: `allow`
- direct `edit` for the Notes root and descendants: `ask`

Shell, grep, glob, and every unrelated permission follow the user's normal policy. Buddy does not parse shell command strings to infer filesystem effects. Permission changes exist only in the runtime overlay and are not persisted into project configuration.

A future Notes setting may allow direct edits without prompting. It must remain a runtime policy choice.

## Linking and portability

Markdown links and Obsidian wikilinks use ordinary relative paths. Buddy adds no proprietary link form.

Wiki-style folders such as `raw/`, plus `index.md`, `log.md`, and `AGENTS.md`, are ordinary Notes-library content and remain visible without Buddy stamps.

## Deferred work

The following are outside Notes V1:

- portable full-chat transcript export;
- generated or continuously synchronized session transcripts;
- Obsidian-specific sync or adapters;
- automatic file movement when either global folder setting changes;
- agent write-policy UI beyond the current direct-edit prompt behavior;
- a fully incremental file index; V1 uses a watcher-invalidated scan cache with a safe rescan fallback.
