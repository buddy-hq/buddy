# Obsidian Vault Compatibility

> **Status:** mixed. Wikilink parsing, round-trip serialization, vault-file resolution, and
> basic embed rendering in the Markdown Bench editor are **shipped**
> (`packages/web/src/components/bench/markdown-bench-obsidian-plugin.tsx`, resolver in
> `packages/buddy/src/learning/features/obsidian-vault/service.ts`). Remaining items below are
> **unimplemented**. This file is an inventory, not an approved spec for new work.

## Asks

- Can Buddy render Obsidian-style `[[note]]` wikilinks in the MDX bench editor so they link to other notes? → **Yes, via Buddy's custom plugin, not natively.** Stock MDX Editor still parses standard Markdown links only.
- What other Obsidian features can be added to make Buddy compatible with Obsidian? → Rendering-only: wikilinks, embeds, inline tags. Index-built: backlinks, orphans. Already in Buddy: frontmatter, callouts, math, mermaid, safe HTML/SVG.
- Can we detect when a user has opened an Obsidian vault as a notebook? → **Yes.** A directory with a `.obsidian/` folder is a vault. That folder is the only marker Obsidian creates. Connecting the vault is a separate user step.

## Shipped (current editor + resolver)

`buddyObsidianWikiLinkPlugin` extends the Bench MDX editor. It is not stock `@mdxeditor/editor`.

- Parse and round-trip `[[target]]`, `[[target|alias]]`, and `![[target]]` (same `[[...]]` body; `!` marks an embed). Stock `linkPlugin` still only handles `[label](url)`.
- Resolve `target` (file part before `#`) against vault-relative paths, filenames without extension, and frontmatter `aliases`. Duplicate names: shortest path wins.
- Keep `#heading` / `#^block-id` (and `#page=…`) as a fragment on the resolved link. Opening a markdown note scrolls to a heading or `^block-id` when the fragment matches. Image embeds render inline. Markdown note embeds show a truncated preview of the target file. Other attachments open as a Bench file rather than an inline PDF/media viewer.
- Wikilink nodes serialize back to `[[...]]` / `![[...]]` on save, so existing vault syntax survives editing in Buddy.

## Unimplemented

- Inline `#tag` tokenizer.
- Backlinks, orphans, graph view, canvas, slides, community plugins.
- Notes-only, last-modified, flat list (Files drawer is a recursive tree, not that list).
- Reading `.obsidian/bookmarks.json` (starred/pinned); still skip — Obsidian app config.
- Obsidian image-size suffix (`![[image.png|640x480]]`); `|` is treated as a display alias, not dimensions.
- Heading/block *section* embeds: `![[note#heading]]` previews the whole note file, not the fragment slice.
- Inline PDF page embed (`![[Paper.pdf#page=14]]` as a viewer in the note); unresolved or non-image/non-markdown embeds are an open-attachment control.

## Findings

### Wikilinks are a rendering problem, not a metadata problem

`[[note]]` is inline in the note body. No external index is required to *render* it as a link. The one prerequisite is a resolver that maps `[[Note Name]]` to an actual file in the vault — Obsidian matches by filename (minus extension), shortest path wins for duplicates.

### "Just render" vs computed

What lives in the note files and only needs rendering: wikilinks, `![[embeds]]`, `#tags`, `aliases` in frontmatter.

What Obsidian computes live and has no metadata file: backlinks (reverse index built by scanning every note), orphans (derived from backlinks), recent notes (filesystem mtime, not Obsidian data).

What is Obsidian app config and should be skipped: starred/pinned, stored in `.obsidian/bookmarks.json`. Reading it couples Buddy to Obsidian internals for little gain.

### The MDX editor does not support `[[...]]` out of the box

Buddy's bench editor uses `@mdxeditor/editor`, which handles standard `[label](url)` links via `linkPlugin`. `[[...]]` wikilinks require extending the parser. Two paths: normalize `[[...]]` to standard links before the editor sees them (import-only), or a custom MDX Editor plugin for first-class authoring. Buddy shipped the custom plugin path; stock MDX Editor still has no native wikilinks.

### The notes list is not missing infrastructure

Buddy already has a Files drawer with a full recursive tree, search-filter, and bench-open. What it lacks is what makes Obsidian's list useful: notes-only (hide attachments/config), sorted by last-modified, flat. A separate vault drawer that just duplicates the tree adds nothing.

### What Buddy already handles

Frontmatter, callouts (`> [!note]`), inline + block math, mermaid diagrams, safe HTML/SVG, code blocks with highlighting. These do not need Obsidian compatibility work.

## Scope

In (shipped): rendering and round-tripping wikilinks and basic embeds; vault detection; alias-aware resolve.

In (still open): tags; a notes-only recent-first list; richer embed fidelity.

Out: backlinks, graph view, canvas, slides, community plugins; reimplementing what Buddy already has; treating `.obsidian/bookmarks.json` as a Buddy feature.
