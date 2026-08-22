# Annotation documentation

This directory deliberately separates descriptions of existing systems from Buddy's proposed design. The Obsidian, Calibre, historical Buddy, and current Buddy documents are descriptive. They do not state what Buddy should copy.

## Documents

### Implemented and observed systems

| Document | Purpose |
| --- | --- |
| [Current state](current-state.md) | What Buddy stores and exposes today |
| [Historical Buddy and Foliate model](history.md) | How Buddy's Foliate-based EPUB and PDF annotations were represented |
| [Obsidian](obsidian.md) | Obsidian's core file, highlight, link, and PDF-reference representation |
| [Calibre](calibre.md) | Calibre's ebook annotation records, persistence locations, export, and merge behavior |

### Buddy proposals

| Document | Purpose |
| --- | --- |
| [Proposed architecture](architecture.md) | General schema, identities, selectors, storage, re-anchoring, and rollout |
| [Proposed APIs](api.md) | TypeScript contracts, backend routes, agent tools, and surface adapters |

## Vocabulary

- **Annotation:** the durable record connecting one or more bodies to one or more targets.
- **Body:** the annotation's content, such as a Markdown note, tag, link, or reply.
- **Target:** the resource or resource segment being annotated.
- **Source:** the stable resource identity inside a target.
- **Selector:** a format-appropriate description of a segment inside the source.
- **State:** the source revision or digest against which a selector was created.
- **Surface adapter:** code that captures, resolves, renders, and navigates annotations for one surface.
- **Resolved:** the selector currently identifies one target.
- **Ambiguous:** the selector identifies more than one plausible target.
- **Orphaned:** the selector cannot currently identify a target.

Terms in this index describe the proposal documents. External systems may use different names or may not expose the same concepts.
