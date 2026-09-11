# Buddy Resource Grounding Design

Status: Historical design rationale for local file packs versus embeddings-first RAG, pure-JS extractors, and Kindle/Calibre policy. The shipped pipeline and condensed decisions are in [docs/features/prepare-resource/design.md](../../features/prepare-resource/design.md).

Date: 2026-03-18 (draft origin). Pack-versus-RAG and extractor strategy remain current product decisions. The layout, entrypoint, and prompt-preflight wording below is a historical sketch, not the current runtime contract. Kindle remains unsupported natively; Calibre is an optional agent `bash` fallback, not a Buddy-owned extractor.

Owner: Buddy product/runtime

## Summary

Buddy should support user-provided resources by preparing opaque or oversized documents into plain files inside the workspace, then letting the agent use the general tools it already has.

### Historical end-state sketch (not the current runtime contract)

The following bullets preserve the 2026-03-18 design sketch. They use the old `.buddy/resources/` layout and automatic prompt-preflight trigger; current preparation is agent-owned by `prepare_resource` and writes an object-backed pack as described below.

- the user drops a resource into the notebook folder
- the user references it in chat
- Buddy prepares a local pack under `.buddy/resources/`
- Buddy rewrites the reference so the model sees the prepared text entrypoint instead of the opaque source file
- the agent uses normal `read`, `grep`, `glob`, `bash`, and subagents to work with the prepared files
- the original source file remains available if the agent wants to process it differently

The main correction from the earlier draft is simple:

- Buddy does not need a new family of resource-specific tools
- Buddy needs a good local text substrate for opaque resources

Once that substrate exists, search and exploration should stay agentic and general-purpose.

## Product Position

This design is opinionated about what Buddy should and should not do.

Buddy should:

- prepare user-provided resources into ordinary local files
- optimize those files for the tools the runtime already has
- keep the structure inspectable by both humans and models
- leave room for the agent to do more processing later if it wants

Buddy should not:

- add a public `resource_search` / `resource_read` / `resource_list` tool family
- turn each resource into a skill
- make embeddings or RAG the default substrate
- hide the prepared resource behind a Buddy-only API
- overdesign this around remote paths or multi-tenant concerns

This is a single-user, single-machine product. The resource model should reflect that directly.

## The Problem Buddy Actually Needs To Solve

Buddy already has strong general tools for reading files, searching files, running shell commands, and delegating work to subagents.

What it does not have is a good representation of opaque resources such as:

- PDF
- EPUB
- DOCX
- very large HTML, Markdown, or text files

That is the missing primitive.

If the model references `book.pdf` today, the runtime can attach the PDF, but it does not gain a stable text-first directory it can inspect with ordinary file tools. Smaller models suffer most from that gap.

The right fix is not to invent a new retrieval interface. The right fix is to give the agent a predictable, text-first local representation.

## Why There Should Not Be A `resource_search` Tool

Buddy should not add a dedicated search tool for prepared resources.

Reasons:

- search is already a capability Buddy has through `grep`, `glob`, `read`, and `bash`
- another tool increases tool-selection burden and prompt noise
- the missing capability is not search logic, it is document preparation
- smaller models benefit more from fewer choices and better file structure than from another custom API
- a prepared pack is still just a directory of files, so a special search tool would duplicate existing behavior

The design target is:

- one good prepared representation
- zero new search primitives

## Why Subagents Do Not Replace Preparation

Subagents are useful here, but not as the substrate.

They help with:

- long exploration of a large book
- comparison across multiple resources
- deeper manual analysis once a resource has already been turned into files

They do not solve:

- extracting text from a PDF
- unpacking an EPUB
- converting DOCX into usable markdown
- giving the main agent or the subagent a stable place to search

The correct layering is:

- preparation service solves the format problem
- general tools solve file navigation
- subagents solve orchestration and cognitive load

If the pack exists, the main agent and any subagent can use the same plain files. If the pack does not exist, spawning a subagent just moves the same format problem somewhere else.

## Historical End-State Behavior (not the current runtime contract)

This section describes the historical prompt-preflight design. The current flow is documented in [Prepare Resource Design](../../features/prepare-resource/design.md): the prompt prelude asks the agent to call `prepare_resource`, which owns registration and background preparation.

1. The user places a resource into the notebook folder.
2. The user references it in chat by file mention, typed path, or a future file-picker UI.
3. Buddy resolves that reference during prompt preflight.
4. Buddy classifies the file as either directly readable or requiring preparation.
5. If preparation is required, Buddy ensures a prepared pack exists and is fresh.
6. Buddy rewrites the prompt so the model is grounded in the prepared entrypoint file.
7. The model uses the pack through its normal tools.
8. If the default preparation is insufficient, the agent can inspect or re-process the original source with its general tools.

The important property is that preparation gives the model a strong starting point, not a closed workflow.

## Historical Model-Entrypoint Sketch (not the current runtime contract)

The historical sketch expected the model to mostly see normal file references. In the current pipeline, `prepare_resource` returns a pack under `.buddy/objects/v1/resource/<objectID>/derived/pack/`; the current entrypoint is `00-resource.md`, with `10-toc.md`, `20-full-text.md`, and generated unit/page/chunk files when available.

For a prepared resource, the useful default is:

- `RESOURCE.md` as the entrypoint
- `toc.md` when available
- a predictable `chunks/` directory
- `pages/` for PDF fallback
- `full.md` for raw full-text access

This keeps the surface legible to strong models and smaller models without forcing them into a custom retrieval tool.

## Historical Resource Pack Layout (not the current runtime contract)

The draft layout below is retained for rationale only. Each current prepared resource lives under `.buddy/objects/v1/resource/<objectID>/derived/pack/`, as implemented by `resourcePackRootPath` and summarized in [Prepare Resource Design](../../features/prepare-resource/design.md).

The historical sketch placed each prepared resource under:

```text
<workspace>/.buddy/resources/<pack-key>/
```

`<pack-key>` is a local implementation detail derived from the source path. It does not need to be user-facing.

### File layout

```text
<workspace>/.buddy/resources/<pack-key>/
  RESOURCE.md
  full.md
  toc.md
  chunks/
    0001-...
    0002-...
  pages/
    0001.md
    0002.md
```

Rules:

- `RESOURCE.md` always exists
- `full.md` always exists when extraction succeeds
- `toc.md` is optional
- `chunks/` exists whenever `full.md` exists
- `pages/` is required for PDF and optional for other formats

This is intentionally plain. The pack should be understandable without any Buddy-specific runtime knowledge.

## Historical `RESOURCE.md` Entrypoint Sketch (not the current runtime contract)

`RESOURCE.md` was the historical entrypoint for both the model and the user. Current packs use `00-resource.md`; do not treat the frontmatter shape or filenames below as a shipped contract.

It should be markdown with YAML frontmatter rather than a separate manifest file as the primary surface.

Suggested shape:

```md
---
source_path: /absolute/path/to/docs/book.pdf
source_relpath: docs/book.pdf
format: pdf
status: ready
extractor: pdfjs-dist
prepared_at: 2026-03-18T12:34:56.000Z
source_mtime_ms: 123456789
source_size_bytes: 123456
page_count: 312
chunk_count: 87
confidence: medium
warnings:
  - Outline was missing; chunking fell back to page windows.
---

# Resource

Source: `docs/book.pdf`

## How to use this pack

- Start with `toc.md` if it exists.
- Search this directory with `grep`.
- Read matching files in `chunks/`.
- Fall back to `pages/` when the structure is weak.
- Use `full.md` if you want the entire extracted text.
- Use the original source path if you want to run your own conversion flow.
```

That last line is important. The pack should explicitly tell the model that it is allowed to go beyond the default extraction.

## Full Text Access

The earlier draft was too close to a curated retrieval interface.

Buddy should always preserve full-text access:

- keep `full.md`
- keep the original source file untouched
- keep the pack as ordinary files
- let the agent use `read`, `grep`, `glob`, `bash`, or subagents on any of it

`full.md` does not need to fit in a single read call. The current `read` tool already supports `offset` and `limit`, so a large `full.md` is still navigable with existing primitives.

This is the difference between good defaults and rigidity. The pack gives structure, but it does not trap the agent inside that structure.

## Processing Model

Preparation remains a Buddy runtime service, not a noisy public chat tool by default. The current owner is the agent-visible `prepare_resource` tool: it authorizes the source, registers the managed resource object, starts preparation, and returns the object/pack paths. It does not rely on automatic prompt-preflight rewriting.

### Trigger

The current trigger is an agent call to `prepare_resource` for a referenced native resource. The prompt prelude supplies the exact source path and alias, but the agent owns the decision to prepare; a separate automatic preflight trigger is historical.

Preparation may also be invoked from UI or maintenance actions, but the shipped core path is the agent-owned tool call rather than a hidden dashboard or preflight rewrite.

### Execution

The tool uses a bounded wait while the background preparation continues.

Recommended behavior:

- if the object already exposes a ready pack, return its current object-backed paths
- if preparation completes within the wait budget, return the ready pack in the same turn
- if preparation is slower, return `status=preparing` and `timed_out=true` while the generation-specific pack continues in the background

That avoids an unbounded visible ETL turn while preserving the principle that the resource becomes relevant because the agent referenced it.

### Freshness

Freshness can stay simple and local:

- source path
- source mtime
- source size

A content hash can be added later as an internal refinement, but it should not shape the product surface.

## Chunking Policy

Chunking should be deterministic enough to give strong defaults, but loose enough that the agent can override it later.

Chunk precedence should be:

1. explicit document outline or TOC
2. heading hierarchy
3. chapter or spine item boundaries
4. page windows
5. paragraph groups
6. sentence windows

The important correction is this:

- chapter boundaries are preferred
- chapter boundaries are not sacred

If a chapter is too large, Buddy must subdivide it.

### Chunk size target

Chunk files should be optimized for the current `read` limits instead of vaguely being "small enough."

Practical target:

- aim for roughly 20-35 KB of UTF-8 text per chunk
- keep chunks comfortably below 2000 lines
- split at the nearest paragraph boundary when possible

The point is to produce chunks that the existing `read` tool can consume in one pass without immediately hitting truncation.

## Exact Conversion Stack

The earlier draft was too vague here. The default stack should be concrete and should prefer pure JavaScript or Bun-friendly libraries so macOS and Windows both work without external installation.

### Design rule

The default extractor path must be:

- cross-platform
- local-first
- no required system packages
- inspectable from Buddy code

Optional local CLI tools are still valuable, but they should remain optional and agent-invoked, not required for the base product to function.

Dependency position in this repo:

- `turndown` already exists directly in `packages/buddy`
- `@zip.js/zip.js` already exists in the vendored ecosystem and can be adopted directly in Buddy code
- `pdfjs-dist`, `fast-xml-parser`, and `mammoth` should be added as direct backend dependencies instead of being treated as accidental transitive dependencies

### PDF

Default library:

- `pdfjs-dist`

Why:

- pure JavaScript
- widely used
- cross-platform
- can extract page text and outlines without requiring a native PDF stack

What Buddy should extract:

- page text for every readable page
- document outline or bookmarks when available
- document metadata when easy to obtain

What Buddy should generate:

- `pages/<page>.md` for every page with readable text
- `toc.md` from outline when available
- `chunks/` derived from outline first, then headings, then page windows
- `full.md` as the concatenation of extracted text

What Buddy should not pretend to solve:

- OCR
- image-only PDFs
- perfect reconstruction of multi-column or visually complex layouts

Required failure behavior:

- if text yield is extremely low, mark the pack `low_confidence` or `unsupported`
- do not silently present garbage extraction as valid text

### EPUB

Default stack:

- `@zip.js/zip.js`
- `fast-xml-parser`
- `turndown`

Why:

- EPUB is already a zip container with structured XML and XHTML
- `@zip.js/zip.js` is already present in the vendored ecosystem
- `turndown` already exists in `packages/buddy`

What Buddy should parse:

- `META-INF/container.xml`
- OPF package document
- spine order
- `nav.xhtml` or `toc.ncx`
- individual XHTML content documents

What Buddy should preserve:

- spine order
- chapter boundaries
- heading structure when the source exposes it cleanly

What Buddy should generate:

- `toc.md` when navigation data exists
- `chunks/` from spine items, with secondary splitting when a single item is too large
- `full.md` as the concatenated reading order

### DOCX

Default stack:

- `mammoth`
- `turndown`

Why:

- practical DOCX-to-HTML extraction
- far less work than building a useful DOCX semantic converter ourselves
- gives markdown-like text that fits the pack model

Expected limitations:

- table fidelity may degrade
- numbering may drift
- footnotes and endnotes may simplify

Required behavior:

- surface those degradations as warnings in the pack metadata returned by `prepare_resource`
- keep the output text usable even when formatting fidelity is imperfect

### HTML / XHTML

Default stack:

- `turndown`

Behavior:

- normalize to markdown-style text
- chunk when large
- keep `full.md`

### Markdown / text / JSON / YAML / CSV

Behavior:

- if the file is small enough, do not prepare it; use the normal file path
- if the file is large, normalize and chunk it into the same pack layout

The key idea is not "all resources must be packed." The key idea is "resource-like or oversized files should gain a predictable local structure."

### AZW / AZW3 / KFX

Buddy should not promise first-party built-in support for Kindle formats in the default path.

Finished-product position:

- if a reliable local converter such as Calibre's `ebook-convert` is already installed, the agent may invoke it through `bash` and then use the normal EPUB or HTML pipeline
- if no such converter exists, Buddy should mark the format unsupported

That is the honest design. These formats should not distort the default stack for every user.

## Edge Cases

The design must acknowledge the ugly cases explicitly.

### PDF edge cases

- scanned PDFs with no text layer
- broken outlines
- multi-column extraction that interleaves text badly
- giant sections with no usable headings

Required behavior:

- produce page files whenever there is readable page text
- fall back to page-window chunking when section inference is weak
- mark low-confidence extraction clearly

### EPUB edge cases

- missing or broken nav
- malformed OPF
- huge XHTML content documents
- weak or missing titles

Required behavior:

- preserve spine order even when nav quality is bad
- subdivide oversized spine items into smaller chunks
- record navigation-quality warnings

### DOCX edge cases

- flattened tables
- damaged list numbering
- simplified notes or references

Required behavior:

- keep the text usable
- record the lossiness in the pack metadata returned by `prepare_resource`

### Large plain-text edge cases

- one giant chapter
- no headings
- very long lines

Required behavior:

- split by paragraph groups first
- fall back to sentence windows when needed

## Why This Is Better Than RAG As The Default

Embeddings-first RAG is the wrong base layer here.

Reasons:

- it adds indexing and invalidation complexity immediately
- it hides failure modes behind retrieval scores
- it does not match Buddy's existing file-and-tool runtime very well
- it is harder for users to inspect and harder for agents to override

If semantic retrieval is added later, it should sit on top of the prepared files, not replace them.

The prepared pack is the base substrate.

## How The Agent Should Use A Current Pack

The current pack itself should teach the default workflow through `00-resource.md` and the paths returned by `prepare_resource`.

The intended flow is:

1. read `00-resource.md`
2. read `10-toc.md` if present
3. search the pack with `grep`
4. read relevant `30-unit-*`, `40-pages-*`, or `50-chunk-*` files
5. fall back to `pages/` or page files when structure is weak
6. use `20-full-text.md` or the original source if custom processing is needed

That is enough guidance for strong models and for smaller models.

If later we want stronger runtime guidance, the right addition is a small instruction snippet or skill that explains the pack convention. The resource itself should still remain a plain local pack, not a skill.

## Repo Integration

This design fits the current Buddy seams without vendoring changes.

Buddy-owned integration points:

- agent-owned preparation in `packages/buddy/src/learning/features/reading/tools/prepare-resource.ts`
- object-backed pack registration in `packages/buddy/src/resources/resource-registry-service.ts`
- session input shape in `packages/buddy/src/routes/session.ts`
- web mention serialization in `packages/web/src/components/prompt/prompt-composer.tsx`

Implementation rule:

- do not patch vendored OpenCode core for this
- keep preparation in Buddy-owned code; do not claim that current runtime automatically rewrites references during prompt preflight

OpenCode already knows how to inline text file parts into the model turn. Buddy's current path lets the agent call `prepare_resource`, then read the returned object-backed Markdown entrypoint with normal tools.

## Final Position

Buddy should not ship a resource-specific tool family.

Buddy should ship:

- a local preparation service
- a plain file-based resource pack under `.buddy/objects/v1/resource/<objectID>/derived/pack/`
- `00-resource.md` as the current pack entrypoint (not the historical `RESOURCE.md`)
- agent-owned preparation through `prepare_resource`, not automatic prompt-preflight rewriting
- concrete built-in converters for PDF, EPUB, DOCX, and large text-like formats
- honest warnings and unsupported states for bad documents
- full-text access and original-source access so the agent can keep going beyond the defaults

That gives Buddy:

- good defaults
- low tool overhead
- smaller-model friendliness
- local transparency
- cross-platform practicality
- room for the agent to take over when the default conversion is not enough
