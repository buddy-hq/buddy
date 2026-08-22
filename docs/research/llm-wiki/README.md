# LLM Wiki pattern

Andrej Karpathy’s April 2026 [LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) describes a pattern for making an LLM maintain a personal, compounding knowledge base.

## The key distinction from ordinary RAG

Ordinary retrieval-augmented generation retrieves chunks from raw documents at query time and reconstructs the answer from them. The same synthesis work is repeated for the next question; the corpus itself does not become more organized.

An LLM Wiki adds a persistent synthesis layer between the sources and the user. When a source is ingested, the LLM summarizes it and integrates its claims into an interlinked Markdown wiki. Concepts, entities, relationships, contradictions, and open questions accumulate over time. A later query starts from that compiled context instead of rediscovering everything from raw documents.

The pattern has three responsibilities:

- **Raw sources:** curated, immutable articles, papers, transcripts, data, or other source material. The LLM reads these but does not rewrite them; they remain the provenance layer and source of truth.
- **The wiki:** LLM-maintained Markdown pages containing summaries, concept and entity pages, comparisons, and valuable filed analyses. These pages link to one another and cite their sources.
- **Agent instructions:** a file such as `AGENTS.md` that defines the domain, page conventions, citation rules, and the Ingest → Query → Lint workflow. It turns a general-purpose agent into a consistent wiki maintainer.

## A small, Obsidian-friendly vault

The wiki is only a directory of Markdown files, so Obsidian is optional. It can make `[[wikilinks]]`, graph navigation, and frontmatter queries convenient, but any editor and ordinary relative Markdown links are sufficient.

```text
llm-wiki/
├── AGENTS.md                 # Instructions and maintenance rules
├── index.md                  # Current navigational catalog
├── log.md                    # Append-only activity timeline
├── raw/
│   ├── sources/              # Immutable captured sources
│   └── assets/               # Optional images or other source assets
├── summaries/                # One source summary per important ingest
├── concepts/                 # Topic and idea pages
├── entities/                 # People, organizations, products, etc.
└── queries/                  # Durable analyses worth keeping
```

`raw/` is never edited to “correct” a synthesis. Corrections, uncertainty, and competing claims belong in the maintained wiki pages, with citations back to the raw source.

### `index.md` and `log.md` are different

- **`index.md` is the current, content-oriented catalog.** It lists pages by category with short summaries and links. The agent reads it first to locate relevant wiki pages, and updates it whenever the set or meaning of pages changes.
- **`log.md` is the historical, chronological record.** It is append-only and records ingests, useful query artifacts that were filed, and lint passes (including notable findings). It explains what changed and when; it is not a substitute for the current index.

Consistent headings such as `## [2026-04-02] ingest | Source title` keep the log easy for both people and simple tools to scan.

## The Ingest → Query → Lint loop

### Ingest

When a human adds a source, the agent:

1. Captures it under `raw/` without modifying the source.
2. Writes a source summary under `summaries/` with provenance and useful citations.
3. Finds and updates relevant concept and entity pages, adding interlinks and recording contradictions or uncertainty rather than silently overwriting claims.
4. Adds new or changed pages to `index.md` and appends the ingest and changed paths to `log.md`.

Humans can discuss what matters and guide emphasis while the agent performs the cross-referencing and bookkeeping.

### Query

The agent starts with `index.md`, reads the relevant wiki pages, and synthesizes an answer with citations to the pages and their underlying sources. If the answer contains a durable comparison, connection, or analysis that would be costly to recreate, it can be filed under `queries/` and recorded in `log.md`. Trivial lookups can remain in the conversation.

### Lint

Periodic linting health-checks the knowledge base for:

- contradictions or unresolved competing claims;
- stale claims that newer sources may have superseded;
- orphan pages and broken or missing links;
- important concepts or entities mentioned but lacking a page;
- research gaps and promising questions or sources to investigate next.

The lint report gives humans a review queue and the pass is appended to `log.md`.

## Division of labor and scaling

Humans curate trustworthy sources, guide the analysis, ask the questions, and review important updates. The LLM does the ongoing maintenance: summarizing, cross-referencing, updating pages and navigation, recording activity, and surfacing consistency problems.

At modest scale, a well-maintained index plus explicit links is often enough; no embedding database or search service is required. If the wiki grows, add a local or hybrid search tool later to find candidate pages faster. Search supplements the persistent synthesis layer—it does not replace the wiki.

## Scope and related implementations

Karpathy’s gist is an abstract, adaptable pattern, not a finished product. The exact schema, directory layout, and tooling should be chosen with the agent for the domain. Hermes’ `llm-wiki` skill is an implementation-oriented adaptation of the idea; it should not be assumed to have been authored by Karpathy.

- [Hermes skills catalog](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/skills-catalog.md)
- [Hermes Agent](https://github.com/NousResearch/hermes-agent)
- [Obsidian Dataview](https://blacksmithgu.github.io/obsidian-dataview/) — optional frontmatter query tooling
