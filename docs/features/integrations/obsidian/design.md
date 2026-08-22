# Obsidian Vault Compatibility

> **Status: exploratory.** Nothing here is decided. These are preliminary asks and findings from an initial discussion, not a spec. Everything is fluid and subject to change with more research and thinking. Do not treat this as an approved design or implement directly from it.

## Asks

- Can Buddy render Obsidian-style `[[note]]` wikilinks in the MDX bench editor so they link to other notes? → **Yes, but not natively.** MDX Editor parses standard Markdown links only; `[[...]]` needs either a pre-processing pass or a custom plugin.
- What other Obsidian features can be added to make Buddy compatible with Obsidian? → Rendering-only: wikilinks, embeds, inline tags. Index-built: backlinks, orphans. Already in Buddy: frontmatter, callouts, math, mermaid, safe HTML/SVG.
- Can we detect when a user has opened an Obsidian vault as a notebook? → **Yes.** A directory with a `.obsidian/` folder is a vault. That folder is the only marker Obsidian creates.

## Findings

### Wikilinks are a rendering problem, not a metadata problem

`[[note]]` is inline in the note body. No external index is required to *render* it as a link. The one prerequisite is a resolver that maps `[[Note Name]]` to an actual file in the vault — Obsidian matches by filename (minus extension), shortest path wins for duplicates.

### "Just render" vs computed

What lives in the note files and only needs rendering: wikilinks, `![[embeds]]`, `#tags`, `aliases` in frontmatter.

What Obsidian computes live and has no metadata file: backlinks (reverse index built by scanning every note), orphans (derived from backlinks), recent notes (filesystem mtime, not Obsidian data).

What is Obsidian app config and should be skipped: starred/pinned, stored in `.obsidian/bookmarks.json`. Reading it couples Buddy to Obsidian internals for little gain.

### The MDX editor does not support `[[...]]` out of the box

Buddy's bench editor uses `@mdxeditor/editor`, which handles standard `[label](url)` links via `linkPlugin`. `[[...]]` wikilinks require extending the parser. Two paths: normalize `[[...]]` to standard links before the editor sees them (import-only), or a custom MDX Editor plugin for first-class authoring. Authoring is out of scope — users keep writing wikilinks in Obsidian.

### The notes list is not missing infrastructure

Buddy already has a Files drawer with a full recursive tree, search-filter, and bench-open. What it lacks is what makes Obsidian's list useful: notes-only (hide attachments/config), sorted by last-modified, flat. A separate vault drawer that just duplicates the tree adds nothing.

### What Buddy already handles

Frontmatter, callouts (`> [!note]`), inline + block math, mermaid diagrams, safe HTML/SVG, code blocks with highlighting. These do not need Obsidian compatibility work.

### Simple additions that ride along with `[[...]]` support

All of these share the same wikilink resolver, so they come cheaply once wikilinks work:

- `![[image.png]]` embeds — same bracket syntax, `!` prefix. Same resolver, just renders as an image instead of a link.
- `[[note|custom label]]` — pipe alias. Display the label, link to the note.
- `[[note#heading]]` — heading fragment. Same resolver plus a heading-slug match.
- `#tag` inline tags — separate tokenizer, but cheap and common in vaults.
- `aliases:` frontmatter — the resolver should accept an alias as a wikilink target, not just the filename.

## Scope

In: rendering wikilinks, embeds, tags; vault detection; a notes-only recent-first list.

Out: authoring Obsidian syntax in Buddy; backlinks, graph view, canvas, slides, community plugins; reimplementing what Buddy already has.
