# Obsidian annotation model

> **Status:** external-system research, checked 2026-08-08.

## Summary

Obsidian does not define one core, general annotation object or cross-surface annotation schema. Core content is stored in a vault: an ordinary directory containing Markdown files, attachments, and an `.obsidian` configuration directory.

## Inline Markdown highlights

Text highlights are stored directly in the Markdown file by surrounding the text with `==` delimiters:

```md
This phrase is ==highlighted==.
```

The highlighted text is part of the document being edited. Core Obsidian does not create a separate highlight record with its own ID, timestamps, note body, or target locator.

## Links to files, headings, and blocks

Internal links are also stored directly in Markdown. A target consists of a vault-relative file reference plus an optional heading or block fragment:

```md
[[Research note]]
[[Research note#Important result]]
[[Research note#^experiment-result]]
```

An explicit block ID is written into the target Markdown document, for example:

```md
The result of the experiment. ^experiment-result
```

The link and the explicit block ID are plain text in their respective Markdown files. Obsidian resolves and indexes them when the vault is open.

## PDF references

Obsidian stores a PDF page reference as a Markdown link or embed with a page fragment:

```md
[[Paper.pdf#page=14]]
![[Paper.pdf#page=14]]
```

The persisted data is the link text in the Markdown file. The PDF remains an attachment in the vault. A page fragment identifies a page; it does not encode an exact text range, PDF quadrilaterals, or a separate highlight body.

## URI representation

The `obsidian://` URI scheme can address a vault and file. Obsidian's documented `open` action accepts a file name or path and supports heading and block fragments in the file value. The URI is an invocation/navigation format; it is not a stored annotation record.

## Vault and configuration boundary

The core persisted representations described above are:

- Markdown content, including inline `==highlight==` markup;
- Markdown or wikilink text that names a file and optional fragment;
- explicit block IDs written in Markdown;
- PDF files and other attachments stored as normal vault files;
- configuration and plugin data under `.obsidian`.

Obsidian maintains indexes needed for features such as links and backlinks, but the documented content representation remains the vault files. The public Vault API exposes file operations over those files.

## Core versus community plugins

Community plugins can implement separate PDF annotations, comments, highlights, databases, or sidecar files. Those schemas and storage locations belong to the individual plugin. There is no single community-plugin format that can be described as Obsidian's core annotation schema.

## Core record shape

Core Obsidian therefore has no standalone record equivalent to:

```json
{
  "id": "...",
  "body": "...",
  "target": { "source": "...", "selector": {} }
}
```

Its core representations are edits and references inside ordinary files:

| User action | Persisted representation |
| --- | --- |
| Highlight Markdown text | `==selected text==` in the source `.md` file |
| Link to a note | `[[Note]]` or a Markdown link in the referring `.md` file |
| Link to a heading | A link fragment such as `#Heading` |
| Link to a block | A `#^block-id` fragment plus the block ID in the target `.md` file |
| Link or embed a PDF page | A `#page=N` fragment in the referring `.md` file |

These representations do not form a common object carrying annotation identity, creator, creation/modification timestamps, a separate body, deletion state, or exact-text re-anchoring evidence.

## Official sources

- [Internal links, headings, and blocks](https://obsidian.md/help/links)
- [Embedding files and PDF page fragments](https://obsidian.md/help/embeds)
- [Obsidian URI](https://obsidian.md/help/Extending%2BObsidian/Obsidian%2BURI)
- [Vault file API](https://docs.obsidian.md/Plugins/Vault)
