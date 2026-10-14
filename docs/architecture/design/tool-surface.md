# Buddy Tool Surface

This file lists every Buddy-owned tool the model can call: what it does, where its result goes, and how it relates to the other tools. It also records the rules for when tools should be merged and when a tool description may name another tool. Code is the source of truth for tool behaviour (`packages/buddy/src/learning/features/*/tools/`). This file keeps the design rationale. Update it whenever a tool is added, merged, or removed.

Decisions come from the Teaching on the Bench research ledger (`docs/features/prompt-engineering/teaching-on-the-bench/research-ledger.md`, entries N25–N28). OpenCode's own tools (`question`, `websearch`, `webfetch`, the shell, file tools, `task`, `skill`) are vendored and not covered here.

## Inventory (audited 2026-09-28)

All personas share one feature list (`personas/shared-features.ts`), so all of them get the same tools. Some tools need a local runtime (`python_calculator` and the standards tools), and users can switch individual tools off in config.

| Tool | Feature | Job | Result goes to | Object kind |
|---|---|---|---|---|
| `bench_present` | bench | Show a file, reading resource, or object on the Bench; focus an open tab, including a Browser tab since #103; close the Bench | Bench tab | — |
| `bench_read_context` | bench | Read the Bench summary and tab listing, optionally with a screenshot | Model | — |
| `inapp_browser_open` | browser | Open a URL in a new Browser tab. The page is controlled by the user, and Buddy can't read it | Bench tab | — |
| `whiteboard_create_view` | whiteboard | Create or update an Excalidraw board | Bench tab (auto-opens and takes focus) | `whiteboard` |
| `whiteboard_read_context` | whiteboard | Read a board before editing it | Model | — |
| `render_mermaid` | diagrams | Mermaid source → a finished diagram | Inline | `mermaid` |
| `render_figure` | figure-rendering | Constrained geometry spec (`geometry.v1`) → an exact figure | Inline | `figure` |
| `render_freeform_figure` | figure-rendering | Raw SVG → a figure | Inline | `freeform-figure` |
| `render_svg` | svg-rendering | Chemistry source (`smiles`, `ket`, `chemfig`, …) → an SVG file for documents and exports | File on disk | — |
| `python_calculator` | calculator | Python for maths, data, and plots | Inline (plots) | — |
| `present_html_widget` | html-widgets | An authored HTML, CSS, and JS page in a sandbox | Inline card; large presets also open on the Bench (inline-only under N24) | `html-widget` |
| `imagegen` | image-generation | Generate or edit an image | Inline | `media-presentation` |
| `present_media` | media-presentations | Show 1–12 existing local files as a gallery. Only images, video, and audio are visible; every other file, PDFs included, shows as a file chip (N29) | Inline | `media-presentation` |
| `prepare_resource` | reading | Register a local document (PDF, EPUB, DOCX, …) and build its reading pack | Library / model | `resource` |
| `ingest_full_text` | reading | Load a prepared resource's full text into the model's context | Model | — |
| `reflection` (+ `_dynamic`) | teaching-guidance | Returns a fixed reflection-prompt template for the active goal. **To be removed** (N35) | Model | — |
| `stepwise_solve` (+ `_dynamic`) | stepwise-solving | Returns a fixed maths-coaching template for the active goal. **To be removed** (N35) | Model | — |
| `search_standards`, `get_standard`, `get_crosswalk`, `get_learning_components`, `get_next_standards`, `get_prerequisites`, `query_standards_sql` | standards | Queries on the standards knowledge graph | Model | — |
| `learner_memory_search`, `learner_memory_update` | memory (experimental, opt-in) | Read and write learner memory | Model | — |
| `save_question_set`, `save_flashcard_deck` | question-sets and flashcards subagents | Save practice objects | Inline card | `question-set`, `flashcard-deck` |
| `learning_tool_search`, `learning_tool_load` | runtime | Find and load dynamic tools | Model | — |

Every object kind has a default Bench view (`bench/tools/present.ts`, `DEFAULT_BENCH_VIEW_BY_KIND`). That means any inline object can be moved onto the Bench with `bench_present` `present_object`.

## When one tool may name another (N25)

A tool description names another tool only in two cases:
- the two are **genuinely confusable**: one common request could be served by either, and picking the wrong one has a real cost;
- a **workflow dependency**: call X first, or take the id from X.

Otherwise each description covers only its own tool.

Cross-tool facts that apply to many tools, such as moving an object to the Bench, live in one place: the Bench prompt or the Bench tool.

**Why:** Codex (GPT-6 Sol), claude.ai, and OpenCode name other tools almost only for workflow steps or for tools whose functions truly overlap. When every description points at its siblings, the tools form a web in which any change ripples.

## When tools should be merged (N27)

Merge two tools when they do **the same job, put the result in the same place, and have the same lifecycle**, and differ only in how the input is written. The test is not "both produce the same format". `render_svg` and `render_freeform_figure` both produce SVG, but one writes files for export and the other shows a figure inline.

Sources: Anthropic, "Writing effective tools for agents" (consolidate related operations behind an action parameter); MetaTool (ICLR 2024), where choosing between tools that overlap is the hardest selection task.

| # | Candidate | Status |
|---|---|---|
| M1 | `render_figure` + `render_freeform_figure` → one figure tool with a geometry mode and a freeform mode | **Decided** (N28). This is the pilot merge. Do it carefully, because renaming reaches descriptions, skills, renderers, and evals. |
| M2 | Fold `render_mermaid` into the figure tool | **Deferred** (N28). Too risky before the pilot. Revisit after M1. |
| M3 | `inapp_browser_open` as an action on `bench_present` | **Open.** The Browser may instead become part of a full browser-control suite (N28). |
| M3b | `present_media` (inline) + `bench_present` (Bench) → one `present` tool | **Decided** (N30). "Presented" means the user can see the content. The destination follows what can be shown: images, video, and audio inline (Bench on request); PDFs, text, and Markdown on the Bench; Office documents and EPUB in the reader. The result says what the user sees. Ship the truthful result first, then merge after M1. Saved sessions with the old tool parts must still render. |
| M4 | `present_html_widget` + the planned Browser artifact (N24) | **Open.** Decide when artifacts are built. |
| M5 | The 7 standards tools → one `standards` tool with an `action` parameter | Recommended, low priority. |
| M6 | `reflection` and `stepwise_solve` | **Decided** (N35): remove all four (including the `_dynamic` twins) from the tool list. They return fixed teaching templates, not generated content. The code stays, unregistered. Keep their display metadata so saved sessions still render. |

**Keep separate:**
- read and write on the same resource (whiteboard, Bench, memory);
- pipeline steps (`prepare_resource` → `ingest_full_text`);
- different jobs (`imagegen` generates, `present_media` shows existing files);
- a different destination (`render_svg`);
- `python_calculator`;
- tool discovery.
