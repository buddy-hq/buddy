# Hermes Skill Library Analysis

## Status

This document began as a recommendation backlog. On 2026-06-29, sixteen API-keyless skills were
selected for the Buddy catalog. Twelve new entries were added and four existing
entries were refreshed through the pinned-source curation pipeline.

Every skill selected for the Buddy library must still pass the existing pinned-source curation,
full-directory scan, manual review, and integrity verification pipeline before it is added to the
catalog.

Internal catalog IDs retain source provenance for debugging. Model-visible skill names and
user-visible display names use the skills' actual names without source branding.

## Sources Reviewed

- Buddy audience and product positioning:
  `packages/site/src/content/site.ts`
- Existing Buddy skill catalog:
  `packages/buddy/src/learning/skill-management/service/catalog.json`
- Existing candidate notes:
  `docs/features/skills/candidates.md`
- Hermes repository:
  `NousResearch/hermes-agent`
- Local Hermes commit reviewed:
  `9a0010fd469f0de6c7e2146f955ed9980d02b397`
- Hermes inventory reviewed:
  173 `SKILL.md` files under `skills/` and `optional-skills/`

The local Hermes worktree had unrelated deleted Gemini provider files. Those deletions did not
affect this review.

## Buddy Audience

Buddy serves two overlapping audiences.

### Learners

The learner product promises to help people:

- ingest PDFs, EPUBs, videos, and lecture recordings;
- understand difficult material while reading;
- explore ideas through diagrams, simulations, and interactive artifacts;
- test their understanding;
- retain knowledge through review and flashcards.

### Educators

The educator product promises to help people:

- align instruction to standards;
- plan lessons and learning goals;
- create differentiated materials;
- produce assessments grounded in the taught curriculum;
- export classroom-ready digital and printable artifacts.

The skill library should extend these workflows. It should not become a general mirror of every
skill available in Hermes.

## Selection Principles

A Hermes skill is a strong Buddy library candidate when it:

1. directly improves a learning, teaching, research, or educational artifact workflow;
2. adds a capability that Buddy does not already provide well as a native feature;
3. is reusable across subjects or represents a coherent optional subject pack;
4. works in Buddy's tool environment, or has a small and well-defined Buddy port;
5. behaves predictably on both macOS and Windows unless explicitly presented as
   platform-specific;
6. keeps destructive filesystem and external-account operations narrow and explicit;
7. has manageable dependencies and a clear setup or failure path;
8. can be pinned to an immutable GitHub commit and reviewed as a complete directory.

Skills are not recommended merely because they describe an academic or technical topic. Static
tool documentation becomes stale and can usually be retrieved from authoritative sources when
needed. Library entries should encode durable workflows or unlock concrete capabilities.

## Existing Hermes Catalog Entries

Buddy already has four approved Hermes entries.

| Skill | Hermes path | Current Buddy status | Recommendation |
| --- | --- | --- | --- |
| `youtube-content` | `skills/media/youtube-content` | Approved | Refresh the existing entry; do not add a duplicate. |
| `concept-diagrams` | `optional-skills/creative/concept-diagrams` | Approved | Keep. |
| `excalidraw` | `skills/creative/excalidraw` | Approved | Keep. |
| `duckduckgo-search` | `optional-skills/research/duckduckgo-search` | Approved | Keep. |

### YouTube refresh

The catalog currently pins `youtube-content` to
`77276070f5a1302908456734f2a5bdfe790260de`.

Hermes subsequently changed the skill to run its transcript helper through `uv`, including changes
to `SKILL.md` and `scripts/fetch_transcript.py`. The refresh should be handled as a replacement of
the existing catalog entry with a newly audited pin, hash, size, and file count.

## Recommended Batch 1: Core Learning Library

These candidates have direct audience fit and relatively contained workflows. "Import" means
"send through the curation and review pipeline," not automatic approval.

| Skill | Hermes path | Audience value | Review focus |
| --- | --- | --- | --- |
| `ocr-and-documents` | `skills/productivity/ocr-and-documents` | Extracts text from scans and difficult PDFs that Buddy's normal PDF extraction cannot read reliably. | Python dependencies, OCR model downloads, large-file behavior, and Hermes tool-name references. |
| `canvas` | `optional-skills/productivity/canvas` | Gives learners and educators read access to Canvas courses and assignments. | Token storage, institution URL validation, read-only guarantees, pagination, and error messages. |
| `arxiv` | `skills/research/arxiv` | Finds papers by subject, author, category, or identifier for research and advanced study. | Query encoding, result limits, citation metadata, rate limits, and network failure behavior. |
| `creative-ideation` | `optional-skills/creative/creative-ideation` | Helps design projects, classroom activities, examples, and alternative explanations. | Ensure the workflow complements Buddy pedagogy instead of producing ungrounded idea lists. |
| `one-three-one-rule` | `optional-skills/communication/one-three-one-rule` | Teaches structured analysis: one problem, three options, one recommendation. | Keep it optional and avoid triggering it for decisions that do not need three alternatives. |
| `maps` | `skills/productivity/maps` | Supports geography, history, field-trip, routing, distance, and time-zone tasks. | Public API terms, request identification, rate limits, caching, and location privacy. |
| `blogwatcher` | `skills/research/blogwatcher` | Lets users follow educational publications, labs, and research feeds. | CLI dependency, Windows support, feed parsing, deduplication, and persistent state location. |
| `fitness-nutrition` | `optional-skills/health/fitness-nutrition` | Provides useful health, nutrition, and physical-education workflows with local calculators and public datasets. | Medical disclaimers, age-sensitive guidance, data-source attribution, and safe calculation boundaries. |
| `drug-discovery` | `optional-skills/research/drug-discovery` | Supports advanced chemistry, pharmacology, and open-science research. | Medical safety, source attribution, API reliability, and separation of educational analysis from clinical advice. |
| `songwriting-and-ai-music` | `skills/creative/songwriting-and-ai-music` | Supports music, language, poetry, meter, structure, and creative-writing education. | Copyright-sensitive requests and over-specific imitation of living artists. |

Batch 1 should be split into small review commits. A practical order is:

1. `arxiv`, `creative-ideation`, and `one-three-one-rule`;
2. `canvas`, `maps`, and `blogwatcher`;
3. `ocr-and-documents`;
4. `fitness-nutrition`, `drug-discovery`, and `songwriting-and-ai-music`.

The health and drug-research candidates need separate safety review even though their scripts are
technically contained.

## Recommended Batch 2: Port to Buddy Before Curation

These skills are valuable, but the raw Hermes directories should not be placed in Buddy's catalog
unchanged.

| Skill | Hermes path | Audience value | Required Buddy work |
| --- | --- | --- | --- |
| `nano-pdf` | `skills/productivity/nano-pdf` | Makes small corrections to worksheets, handouts, and other PDFs. | Default to a new output file, preserve the original, add verification, and replace Hermes tool references. |
| `whisper` | `optional-skills/mlops/whisper` | Transcribes lecture recordings, interviews, and spoken study notes. | Add supported Windows setup, define model/disk expectations, and avoid unbounded downloads. |
| `obsidian` | `skills/note-taking/obsidian` | Reads, searches, creates, and links local study notes. | Replace Hermes `read_file`, `write_file`, `search_files`, and `patch` instructions with Buddy/OpenCode tools. |
| `qmd` | `optional-skills/research/qmd` | Provides local hybrid search across notes, documents, and transcripts. | Add Windows support, bound indexing scope, explain model downloads, and align paths with Buddy's local-first storage model. |
| `google-workspace` | `skills/productivity/google-workspace` | Connects common educator workflows across Gmail, Calendar, Drive, Docs, and Sheets. | Replace Hermes setup paths, narrow OAuth scopes, and require explicit confirmation for writes, sends, and deletes. |
| `notion` | `skills/productivity/notion` | Supports notes, curriculum databases, project trackers, and knowledge bases. | Make the API path cross-platform, narrow mutation behavior, and add explicit confirmation rules. |
| `airtable` | `skills/productivity/airtable` | Supports structured curriculum, research, and classroom workflow data. | Add safe schema discovery, mutation confirmation, and bounded record operations. |
| `siyuan` | `optional-skills/productivity/siyuan` | Connects a local or self-hosted knowledge base. | Add Windows validation, safe block mutations, and clear server/token discovery. |
| `jupyter-live-kernel` | `skills/data-science/jupyter-live-kernel` | Enables iterative data-science, math, and computational learning workflows. | Replace Hermes execution tools, control kernel lifecycle, bound outputs, and define environment isolation. |
| `research-paper-writing` | `skills/research/research-paper-writing` | Provides a serious research-writing workflow for advanced learners and educators. | Generalize beyond ML venues, replace Hermes planning/tool assumptions, add Windows support, and preserve citation integrity. |
| `code-wiki` | `optional-skills/software-development/code-wiki` | Turns codebases into navigable explanations and diagrams for technical learners. | Replace Hermes filesystem tools, bound repository traversal, and integrate generated artifacts with Buddy's Bench. |
| `manim-video` | `skills/creative/manim-video` | Creates animated mathematical and technical explanations. | Add Windows installation and rendering guidance, bound render cost, and present outputs through Buddy's media surface. |
| `p5js` | `skills/creative/p5js` | Creates interactive simulations, visualizations, and creative-coding exercises. | Prefer Buddy's HTML widget pipeline, remove localhost/browser assumptions, and adapt shell scripts for Windows. |
| `baoyu-infographic` | `skills/creative/baoyu-infographic` | Produces high-density visual summaries and educational posters. | Replace Hermes `image_generate` and file tools with a capability Buddy actually exposes. |
| `baoyu-comic` | `optional-skills/creative/baoyu-comic` | Produces educational comics, biographies, and visual tutorials. | Replace Hermes `image_generate`, reference-image handling, and clarification/tool assumptions. |
| `baoyu-article-illustrator` | `optional-skills/creative/baoyu-article-illustrator` | Adds coherent illustrations to educational articles and handouts. | Replace Hermes image and file tools and integrate outputs with Buddy artifacts. |

The three Baoyu skills must remain blocked until Buddy has a supported image-generation capability.
Installing instructions that demand a nonexistent baseline tool would produce predictable runtime
failures.

## Recommended Batch 3: Technical Learner Pack

These are appropriate for programming and software-engineering learners, but they should be a
distinct category rather than dominate the general learning library.

| Skill | Hermes path | Port/review requirement |
| --- | --- | --- |
| `docker-management` | `optional-skills/devops/docker-management` | Add strong confirmation around cleanup and destructive container, image, and volume operations. |
| `codebase-inspection` | `skills/github/codebase-inspection` | Validate its CLI dependency and make results useful for explanation rather than raw metrics only. |
| `rest-graphql-debug` | `optional-skills/software-development/rest-graphql-debug` | Keep credentials out of examples and preserve authorization boundaries. |
| `systematic-debugging` | `skills/software-development/systematic-debugging` | Remove Hermes `delegate_task` assumptions and align the workflow with Buddy's teaching behavior. |
| `test-driven-development` | `skills/software-development/test-driven-development` | Remove forced subagent behavior and avoid applying strict TDD when the task does not benefit from it. |
| `spike` | `skills/software-development/spike` | Ensure throwaway experiments cannot overwrite production work and clearly mark disposable artifacts. |
| `node-inspect-debugger` | `skills/software-development/node-inspect-debugger` | Validate Chrome DevTools Protocol tooling on macOS and Windows. |
| `python-debugpy` | `skills/software-development/python-debugpy` | Add Windows support and safe port/listener defaults. |

## Recommended Batch 4: Optional Subject Packs

These skills are not part of the general learner/educator core. They become reasonable library
entries if Buddy intentionally introduces subject-pack categories.

### Finance

| Skill | Hermes path | Notes |
| --- | --- | --- |
| `stocks` | `optional-skills/finance/stocks` | Read-only market data can support finance education; clearly separate it from financial advice. |
| `3-statement-model` | `optional-skills/finance/3-statement-model` | Useful for accounting and corporate-finance courses. |
| `comps-analysis` | `optional-skills/finance/comps-analysis` | Useful for valuation coursework. |
| `dcf-model` | `optional-skills/finance/dcf-model` | Useful for valuation coursework. |
| `lbo-model` | `optional-skills/finance/lbo-model` | Specialized private-equity coursework. |
| `merger-model` | `optional-skills/finance/merger-model` | Specialized corporate-finance coursework. |

The modeling skills assume Hermes's `excel-author`. Buddy already has an approved workbook authoring
skill, so these workflows must be ported to that capability rather than introducing a second,
overlapping Excel foundation.

### Creative media

| Skill | Hermes path | Notes |
| --- | --- | --- |
| `songsee` | `skills/media/songsee` | Useful for audio visualization and music/signal analysis; requires a Go-installed CLI. |
| `audiocraft-audio-generation` | `skills/mlops/models/audiocraft` | Useful for sound and music experimentation but has a substantial model/runtime footprint. |
| `comfyui` | `skills/creative/comfyui` | Powerful advanced creative workflow with a large installation, model, node, and hardware support surface. |

These should only appear after the library can communicate dependency size and platform/runtime
requirements before installation.

## Skills Not Recommended

### Duplicates or native Buddy capabilities

- `memento-flashcards`: duplicates Buddy's native flashcard storage, scheduling, authoring, and
  review surfaces.
- Hermes `powerpoint` and `pptx-author`: Buddy already has an approved PowerPoint skill.
- Hermes `excel-author`: Buddy already has an approved workbook authoring skill.
- `architecture-diagram`: overlaps Buddy diagrams, HTML widgets, Mermaid, figures, Excalidraw, and
  the approved concept-diagram skill.
- `searxng-search`: substantially overlaps Buddy web search and the approved DuckDuckGo fallback.
- `computer-use`: should be a runtime/tool capability, not a generic library document that may
  advertise an unavailable tool.

### Hermes-specific infrastructure

Do not add skills whose primary purpose is operating Hermes itself or its orchestration model:

- autonomous agent CLI delegation skills;
- `honcho`;
- `hermes-agent`;
- `hermes-agent-skill-authoring`;
- `hermes-s6-container-supervision`;
- `openclaw-migration`;
- `kanban-video-orchestrator`;
- `teams-meeting-pipeline`;
- `petdex`;
- Hermes dogfooding and profile-management workflows.

Buddy should author its own skill-creation guidance instead of installing
`hermes-agent-skill-authoring`.

### Platform-only Apple integrations

Do not add `apple-notes`, `apple-reminders`, `findmy`, or `imessage` to the general catalog while
the product does not have platform-aware library filtering. Presenting them to Windows users would
be misleading.

### High-risk or audience-misaligned automation

Do not add:

- payment and Stripe automation;
- shopping and Shopify administration;
- telephony and autonomous email accounts;
- social-media posting and direct messaging;
- crypto wallet, chain, or trading workflows;
- smart-home control;
- public tunneling;
- broad account administration.

These have weak connection to Buddy's learning and teaching promise and introduce disproportionate
credential, privacy, external-side-effect, and support risk.

### Security and surveillance

Do not add:

- jailbreak or "godmode" skills;
- offensive web penetration testing;
- username hunting;
- broad OSINT investigations;
- supply-chain forensics as a general learner feature;
- Cloudflare-bypass or stealth-scraping workflows.

Security education could eventually have a separately governed pack, but these should not enter
the default education-focused library.

### Static or narrow MLOps reference manuals

Most Hermes MLOps skills document a particular fast-moving framework, cloud service, model, or
training technique. Examples include Accelerate, FSDP, TensorRT-LLM, Pinecone, Qdrant, PEFT,
Lightning, Axolotl, TRL, Unsloth, Modal, and Lambda Labs.

These should not be imported in bulk because:

- they become stale quickly;
- many are Linux/GPU specific;
- several require costly infrastructure or large downloads;
- they are topic/tool references rather than durable educational workflows;
- authoritative current documentation is a better source.

Individual MLOps skills can be reconsidered later as part of a deliberately maintained AI/ML
subject pack.

### Academic-integrity concern

Do not add `humanizer` in its current form. A tool framed around disguising AI-generated writing
creates avoidable academic-integrity and trust problems. Buddy can teach revision, voice, clarity,
and audience-aware writing without promising to conceal authorship.

## Cross-Cutting Port Requirements

Before a Hermes skill is considered Buddy-compatible:

1. Replace Hermes-only tools such as `read_file`, `write_file`, `search_files`, `patch`,
   `execute_code`, `delegate_task`, and `image_generate`.
2. Remove Hermes home-directory, profile, and configuration assumptions.
3. Validate macOS and Windows setup paths.
4. Use non-destructive output defaults for document edits.
5. Require explicit confirmation before remote writes, sends, deletes, or broad local mutations.
6. Bound indexing, downloads, subprocesses, model sizes, render durations, and generated output.
7. Make dependency absence a clear recoverable state.
8. Integrate generated files with Buddy's Bench and media/artifact surfaces where applicable.
9. Align instructional behavior with Buddy's conversational pedagogy rather than generic
   completion-oriented agent behavior.
10. Preserve provenance, citations, and source metadata for research workflows.

## Proposed Decision Sequence

1. Refresh and re-audit the existing `youtube-content` entry.
2. Audit Batch 1 without writing catalog entries; record scanner and runtime-review findings.
3. Approve or reject each Batch 1 skill independently.
4. Define a small Buddy skill-port format for Hermes tool-name and platform adaptations.
5. Port Batch 2 in capability groups:
   - documents and transcription;
   - notes and external workspaces;
   - research and code learning;
   - visual and interactive artifact creation.
6. Decide whether the product wants visible subject-pack categories before adding Batch 3 or
   Batch 4.
7. Keep the remaining Hermes inventory out of the catalog unless a concrete learner or educator
   job justifies reconsideration.

## Recommended Initial Scope

The initial recommendation was:

- refresh one existing entry: `youtube-content`;
- audit ten Batch 1 candidates;
- make no automatic Batch 2 additions;
- make no subject-pack additions until categorization and dependency disclosure are designed.

The final selected batch was broader. The following sixteen API-keyless skills are now represented
in the catalog:

- `youtube-content`;
- `ocr-and-documents`;
- `whisper`;
- `arxiv`;
- `duckduckgo-search`;
- `concept-diagrams`;
- `excalidraw`;
- `manim-video`;
- `obsidian`;
- `qmd`;
- `p5js`;
- `maps`;
- `creative-ideation`;
- `blogwatcher`;
- `research-paper-writing`;
- `jupyter-live-kernel`.

Catalog approval does not erase the runtime portability work identified above. Skills with
Hermes-specific tool names, incomplete Windows support, large local dependencies, or missing
Buddy artifact integration still require the documented follow-up work.
