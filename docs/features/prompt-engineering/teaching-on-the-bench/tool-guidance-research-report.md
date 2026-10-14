# Tool guidance in frontier products: contract, fit, craft, size, and cost of first use

Research report for N33 (and O7 gaps) in [research-ledger.md](research-ledger.md). Written 2026-09-28. Read-only research.

**Status:** DONE

## 1. Summary

- **Where guidance lives.** Contract sits in the description and parameters almost everywhere. Fit sits in the description (Codex, OpenCode, Claude Design, claude.ai native widgets) or in a tool-scoped system block (claude.ai Visualizer and image search, Muse Spark, Cowork Docs). Craft is on demand: modules of 3k to 9k words, type SKILL.md files of 2k to 2.7k, skills. Results carry truth about what is visible. Buddy keeps all three layers in the description, and repeats one rule four times (Q1).
- **Sizes.** Frontier siblings of one kind stay within about 1.3x to 2.6x of their family median, and visual tools are short (Visualizer 103 words, Muse and Grok 6 to 60). Buddy's ten display tools have a median of 295 words, a range of 166 to 748, and seven of them name four or more other tools. About 60% of the whiteboard description and 76% of the widget description is input contract; fit is 15% to 30% (Q2, Q4).
- **Cost of first use (N33).** No product equalizes tolls by size. They keep one gate per family (claude.ai `read_me` for every kind, sized about 3.3k, 6.2k and 8.9k words; Cowork types 2k to 2.7k), keep a no-toll path and say when it wins, show something before the toll, load craft after content, and split a core from on-demand references. Buddy runs from 222 to 7,636 words before first use (34x), with hard gates only on the whiteboard and widget (Q3).
- **Bias is offset by the prompt, not by size.** Where a cheap and a rich option compete (Mermaid or HTML, native chart or Visualizer), the cheap one is kept narrow and the prompt or module pushes the richer one ("Prefer interactive visuals when explaining how something works"; "don't chicken out into a flowchart"). This is consistent with N8, N36 and N3 (Q3, Q5).
- **Counterparts (Q4).** No capture has a Mermaid tool with prose, a teaching whiteboard, or a constrained-geometry tool. Frontier "open" and "show" tools carry contract and truth ("only opens Codex UI"), and confusable pairs are named in both directions (Claude Design `show_*` and `done`; claude.ai chart versus Visualizer). Buddy's browser and widget descriptions add teaching-use fit and narration rules that no counterpart has. Buddy's `bench_present` lists a union in prose where Codex varies the description by capability.
- **Template (Q5).** Six parts in fixed order: Does, Fits, Not for, Call it, Result, Craft pointer. 120 to 250 words, parameters up to about 25 words each, no sibling above 2x the family median. The whiteboard would drop from 661 to about 200 to 250 by moving the `boardAction` and `elements` rules into the parameters, where they already are.
- **Gap B.** A description may name use situations (what the learner does with the result: look once, watch it built, return and extend, act on it). It should not carry teacher-side reasons. Frontier writes teaching situations only in system blocks, modules, the base prompt or a tutoring skill, never in a tool description. Buddy's unused `render-mermaid.ideal.md` is the warning case.
- **Gap C.** Craft skills teach craft. Modules and lane-owner skills also choose inside their lane and set "not for" edges by category. Whether to show and where to put it sit in system prompts or a tutoring skill (Cowork `learn`), which names tools only as "if available, else". Buddy's `reading` names three tools unconditionally, and `whiteboard-authoring` holds 3,447 words of teaching policy.
- **Building in segments (Q7).** Frontier has no patch-a-picture tool. It gets steps by several calls with prose between (claude.ai), skeleton then fill (Cowork Docs), file edits, and UI steppers. Buddy's whiteboard supports segmenting fully (update, continue, delete, translate, streaming), but the description does not say calls extend a visible result, the result does not say what is visible, and the first call costs about 7.6k words.

**Open questions:** see section 10 (five, as principles).

## 2. Sources surveyed

Dates are the last commit to each file in `~/Code/CL4R1T4S` (`git log -1 --format=%cs`). Paths below are relative to `~/Code/CL4R1T4S` unless they start with `vendor/` (Buddy's repo). "Cowork file" means `ANTHROPIC/CLAUDE-OPUS-5.5.md`, which is not only a system prompt: it also carries captured tool results, skill bodies loaded on demand, the claude.ai Visualizer's `read_me` modules, and Artifact-type SKILL.md files. That makes it the single most useful source for this question.

| File | Product | Date | Relevance |
|---|---|---|---|
| `ANTHROPIC/CLAUDE-OPUS-5.5.md` | Claude (Cowork harness, Opus 5.5) | 2026-09-22 | Highest. `<creating_outputs>`, `<artifacts>`, `<skills>`, `<building>`; the Artifact tool (3,224-word description); Artifact-type results that return a SKILL.md; the `read_me` result for every Visualizer module (lines 3723–5121); skill bodies: `artifact-design`, `artifact-diagramming`, `dataviz`, `learn`, `canvas-design`, `paint`, `frontend-design`, `pptx`, `docx`, and more |
| `ANTHROPIC/Claude-Fable-5.1.md` | claude.ai (Fable 5.1) | 2026-09-01 | High. `<functions>` block (46 tools, measured), `<request_evaluation_checklist>`, `<when_to_use_visualizer_for_inline_visuals>`, `<using_image_search_tool>`, `<skills>`, `<artifact_usage_criteria>`, `<available_skills>` |
| `ANTHROPIC/OPUS-5.md` | claude.ai (Opus 5) | 2026-07-24 | Same Visualizer text as Fable 5.1 (line 1327); used to confirm stability |
| `ANTHROPIC/CLAUDE-FABLE-5.md`, `ANTHROPIC/Claude-Opus-4.7.txt` | claude.ai | 2026-06-15, 2026-04-16 | Earlier versions of the same blocks; Opus 4.7 has the same `read_me` rule (line 558) |
| `ANTHROPIC/Claude-Design-Sys-Prompt.txt` | Claude Design | 2026-04-17 | `show_to_user` and visibility truth; design craft in the prompt |
| `OPENAI/Codex_Desktop/GPT-6-Sol_Prompts.txt`, `GPT-6-Sol_Tools.json` | Codex desktop (GPT-6 Sol) | 2026-09-22 | Visualization policy (lines 87–95), desktop fragments (`desktop.G3`…), 56 frontend tools plus 13 MCP catalog tools, 69 in all (measured for this report; the room report said 67), `imagegen` description (line 750) |
| `OPENAI/Codex_Desktop/GPT-6-Astra_Prompts.md`, `GPT-6-Astra_Tools.json` | Codex desktop (GPT-6 Astra) | 2026-09-22, 2026-09-09 | Same visualization policy (line 108); `open_in_codex`, `getTabContext` tool descriptions |
| `OPENAI/Codex_Desktop/5.6-Sol_SystemPrompt.md`, `5.6-Sol_Tools.json` | Codex desktop (GPT-5.6 Sol) | 2026-07-14 | The `visualize` **skill** (line 3919 on, about 2,700 words), the `imagegen` skill, the Browser skill, skill descriptions with sibling routing |
| `OPENAI/ChatGPT5-08-07-2025.mkd` | ChatGPT (GPT-5) | 2025-08-07 | Canvas and python tools; older than the one-year window, used for contrast only |
| `OPENAI/Atlas_10-21-25.txt` | ChatGPT Atlas browser | 2025-10-21 | Browser tab tools |
| `XAI/GROK-4.20.mkd` | Grok 4.20 | 2026-02-17 | Render components and tool JSON in the prompt |
| `META/Muse_Spark_Apr-08-26.txt` | Meta AI (Muse Spark) | 2026-04-08 | Tool descriptions for media and visuals |
| `ZAI/ZCode/Prompts.md`, `Skills.md`, `Tools.json` | ZCode | 2026-08-14 | Skill bodies and tool descriptions of a coding agent |
| `MOONSHOT/Kimi_K2_Thinking.txt` | Kimi K2 | 2025-11-06 | Tiny (955 bytes); no tool guidance of note |
| `vendor/opencode/packages/opencode/src/tool/*.txt`, `src/session/prompt/*.txt` | OpenCode (Buddy's runtime) | vendored | Sibling descriptions (read, grep, glob, bash, task, …) |
| `OPENAI/Codex_Desktop/5.6-Sol_Tools.json` (148 tools) | Codex desktop (GPT-5.6 Sol) | 2026-07-14 | Size measurements; `image_gen__imagegen` 288 words; `sites_*` family spread |
| Buddy working tree on `fix/visuals-prompt` | Buddy | working tree at time of writing (unstaged edits included) | The ten display tools, `create-view.ts` schema and result, skills under `packages/buddy/src/learning/features/*/skills/`, `visual-guidance.p.md`, `bench-feature.p.md`, `diagrams/tools/render-mermaid.ideal.md` |
| Live cross-check: this session's `mcp__visualize__read_me` (modules `art` and `interactive`) | claude.ai Visualizer (same text as the captures) | 2026-10-01 | Confirmed which shared sections each module carries, to estimate module sizes; the diagram module size is inferred, not loaded |

Method notes. Word counts are `len(text.split())`. Tool descriptions were parsed from the JSON in each capture with a script, so counts exclude JSON syntax and include only the `description` field unless "parameters" is stated. Skill and module sizes are whitespace-split words of the captured text between the line ranges cited. Medians are over the tools parsed in each file; files with an unusual layout (Muse Spark, Grok) parsed fewer tools, as noted.


## 3. Q1: Where does a tool's guidance live?

Terms. **Contract** is what the tool does, its inputs and outputs, and where results appear. **Fit** is when to use it and when not. **Craft** is how to do it well. **Result** is what the tool says back. Buddy paths below are relative to `packages/buddy/src/learning/features/`.

**Short answer.** Contract sits in the description and parameters almost everywhere. Fit and craft are where products differ. Fit has three homes. Craft is nearly always on demand. Results carry truth about what happened.

| Product | Contract | Fit | Craft | Result |
|---|---|---|---|---|
| claude.ai Visualizer (Fable 5.1) | Description, 103 words (`Claude-Fable-5.1.md:1807`); parameters 282 words | Tool-scoped system block, about 850 words (`:1368-1419`) | `read_me` modules, required "before your first show_widget call" (`:1806-1807`) | Not captured |
| claude.ai image search | Description, 30 words (`:1771`) | Same block, 983 words (`:1679-1745`) | Same block: query length, placement | Not captured |
| claude.ai native widgets (chart, quiz, step card) | Description | Description, with "DON'T use" lists (`:1764`, `:1787`, `:1795`) | Parameters; chart has a "Capabilities and limits" paragraph | Not captured |
| Cowork artifacts (Opus 5.5) | Tool description, 3,224 words (`CLAUDE-OPUS-5.5.md:19`) | `<creating_outputs>` destination policy (`:311-345`); one sentence per type in the type list (`:1252-1258`) | `artifact-design` skill, required before the first publish (`:19`, `:2002-2112`); each type's SKILL.md comes back in the create result (`:390`) | Create result carries the SKILL.md |
| Cowork Docs connector | Descriptions, 11 to 24 words (`:50-52`) | Server instructions, 294 words (`:1137`) | `guide` topics, 9,403 words in all (`:3094-3722`) | Acks link the doc |
| Codex desktop | Descriptions, median 39 words; `open_in_codex` has 8 variants by enabled capability (`GPT-6-Sol_Tools.json:809-1700`, variants at `:812`, `:888`, `:965`…) | Base prompt "Visualizations" (`GPT-6-Sol_Prompts.txt:87-95`); one sentence per skill in the skill list (`5.6-Sol_SystemPrompt.md:276-292`) | Skills: `visualize` 2,681 words (`:3920-4270`), `imagegen` 3,364 (`:666-1023`), Browser 1,544 (`:1747-1864`) | `fire_confetti`: "Only claim it fired when the result has fired: true" (`Tools.json:1861`) |
| Claude Design | Descriptions, median 48 words (`Claude-Design-Sys-Prompt.txt:357-396`) | Descriptions separate siblings (`:368-370`) | Skill catalog loaded by `invoke_skill` (`:316-332`) | `done` returns console errors (`:370`, `:208-212`) |
| Muse Spark | Descriptions, 6 to 35 words (`Muse_Spark_Apr-08-26.txt:233-253`) | `<triggering>` per tool family (`:123-150`) | `<execution>` (`:151-163`) | `<output>` (`:164-168`) |
| Grok 4.20 | Description | Same description (`search_images`, 206 words, `GROK-4.20.mkd:41`) | Render components' "Do NOT" list (`:53-55`) | Not captured |
| OpenCode (Buddy's runtime) | `tool/*.txt`, 68 to 412 words | Same file, for example "When NOT to use" (`task.txt:5-9`) | Same file; a skill arrives as a tool result (`tool/skill.ts:45-58`) | Skill result = SKILL.md plus a sampled file list |
| Buddy today | `.md` description plus zod `.describe` | Same `.md`; persona `visual-guidance.p.md` (495 words) and Bench prompt (337) add policy | Skills of 1.0k to 7.0k words, gated by the description | Result repeats edit rules and adds measured layout (`whiteboard/tools/create-view.ts:322-349`) |

What the table shows:

1. **Contract is never far from the tool.** The exceptions are Muse Spark and claude.ai image search. They leave a one-line description and move even "how to call" into a system block. So "description = contract only" is not universal.
2. **Fit has three homes.** (a) The description: Codex, OpenCode, Claude Design, claude.ai native widgets. (b) A tool-scoped system block: claude.ai Visualizer, image search and artifacts, Muse Spark, Cowork's Docs server. (c) A base-prompt policy plus a one-sentence catalog entry: Cowork's destination rule, Codex's visualization rule. The block in (b) is conditional (inference, partly confirmed by the room report: captures without the Visualizer lack it).
3. **The split follows initiative.** Tools the vendor wants used unprompted (Visualizer, image search, media generation) keep fit in a system block, and often push in the one-line description too: "Default to using image search for any query where visuals would enhance the user's understanding" (`Claude-Fable-5.1.md:1771`). Tools used on request keep fit in the description. This extends O7.7 with Muse Spark.
4. **Craft is on demand and sized by the product.** Module 3k to 9k words, type SKILL.md 2k to 2.7k, skill 0.2k to 4.6k. Nobody puts that much craft in a description. The one big description (Artifact, 3,224 words) covers a tool with about seven actions, and it still demands a skill before the first publish.
5. **Results carry truth, not teaching.** Examples: visible or not (`open_in_codex`: "This only opens Codex UI", `Tools.json:813`), errors (`done`), what the tool cannot do. Buddy's whiteboard result repeats edit mechanics and adds a layout check (`create-view.ts:183-203`). It does not say what the learner can now see (N30).
6. **Three ways to stay pluggable.** Conditional blocks; per-capability description variants (Codex); "go by the tools actually present" wording (`CLAUDE-OPUS-5.5.md:423`). Variants are the closest match to N12: the tool's own text changes when capabilities change, and the base prompt does not.
7. **One rule repeated is normal; four times is not.** Buddy states "never destructively replace the board" in the description (`whiteboard/tools/create-view.md:17`), a parameter (`create-view.ts:42`), the result (`:340`) and the skill (`whiteboard/skills/whiteboard-authoring/SKILL.md:32-34`). Frontier duplicates only its one or two critical rules, in two places (Codex, O1).

## 4. Q2: How big are descriptions, and are siblings balanced?

Method. I parsed the tool JSON in each capture and counted words in the `description` field. Parameter descriptions are counted separately. For Buddy I counted the `.md` description or the inline `description:` array, plus zod `.describe()` strings in the tool file (schemas defined elsewhere are not counted, so parameter totals are a floor).

**Short answer.** Frontier products keep siblings of the same kind within about 1.3x to 2.6x of their family median. The big outliers are explained by a different shape (a multi-action tool, a large schema, a whole REPL), not by one sibling getting more prose. Buddy's display tools run about twice as long as claude.ai's widget family and far longer than Codex's tools, and the gap inside Buddy's own family is wider.

| Product (source) | Tools | Median words | Range | Outliers and families |
|---|---|---|---|---|
| claude.ai Fable 5.1 (`Claude-Fable-5.1.md:1761-1808`) | 46 | 132 | 7 to 739 | `suggest_research` 739, `chart_display_v0` 385 |
| Same, its 14 widget tools | 14 | 150 | 36 to 385 | 10 of 14 between 105 and 170 |
| Cowork Opus 5.5 (`CLAUDE-OPUS-5.5.md:17-81`) | 63 | 141 | 7 to 3,224 | `Artifact` 3,224; the next is 522 |
| Codex GPT-6 Sol (`GPT-6-Sol_Tools.json`) | 69 (56 frontend, 13 MCP) | 39 | 6 to 430 | computer-use `js` 430 |
| Codex 5.6 Sol (`5.6-Sol_Tools.json`) | 148 | 41 | up to 1,558 | `web__run` 1,558; the 19 `sites_*` tools run 268 to 634, median 354 |
| Claude Design (`Claude-Design-Sys-Prompt.txt:357-396`) | 37 | 48 | 14 to 425 | `web_search` 425; `show_html` 42, `show_to_user` 48, `done` 69 |
| ZCode (`ZAI/ZCode/Tools.json`) | 24 | 87 | 6 to 612 | `EnterPlanMode` 612 |
| OpenCode (`vendor/.../tool/*.txt`) | 15 | 130 | 68 to 412 | `task` 412 |
| Muse Spark (`Muse_Spark_Apr-08-26.txt:233-253`) | 11 parsed | 23 | 6 to 234 | media tools 6 to 35 |
| Grok 4.20 (`GROK-4.20.mkd:25-45`) | 11 | 18 | 6 to 206 | `search_images` 206; render components 40 to 60 |
| **Buddy display tools** | 10 | **295** | **166 to 748** | `present_html_widget` 748, `whiteboard_create_view` 661 |

Buddy's ten, with parameter words and the other tools each one names:

| Tool | Description | Parameters | Total | Names other tools |
|---|---|---|---|---|
| `present_html_widget` (`html-widgets/tools/present-html-widget.md`) | 748 | 235 | 983 | 3, plus 2 skills |
| `whiteboard_create_view` (`whiteboard/tools/create-view.md`) | 661 | 262 | 923 | 4, plus 1 workflow |
| `bench_present` (`bench/tools/present.ts:1432`) | 301 | 190 | 491 | 4 |
| `imagegen` (`image-generation/imagegen-description.md`) | 355 | 86 | 441 | categories only |
| `render_mermaid` | 345 | 69 | 414 | 5 |
| `render_freeform_figure` | 288 | 33 | 321 | 6, plus 2 skills |
| `inapp_browser_open` (`browser/tools/open.ts:43`) | 264 | 32 | 296 | 2 |
| `render_figure` | 225 | 44 | 269 | 4 |
| `python_calculator` | 222 | 31 | 253 | 4 |
| `present_media` (`media-presentations/tools/present-media.ts:34`) | 166 | 30 | 196 | 4 |

What this says.

1. **Families stay tight when they are really siblings.** claude.ai's widget tools sit at 131 to 169 words between the quartiles. Codex's 19 `sites_*` tools span 2.4x. Claude Design's three "show" tools span 1.6x. Buddy's six competing picture tools (whiteboard, Mermaid, freeform, figure, calculator, widget) span 222 to 748, which is 3.4x.
2. **Outliers have a reason.** `Artifact` is one tool with about seven actions (`CLAUDE-OPUS-5.5.md:19`). `chart_display_v0` carries 611 words of schema. `web__run` and the REPL tools are languages. Buddy's widget and whiteboard are not languages: they have 5 to 7 fields, and most of their words are prose rules and examples (the widget has a six-item field-ownership list and three JSON examples, `present-html-widget.md:11-52`).
3. **Frontier visual tools have short descriptions.** The Visualizer is 103 words (`Claude-Fable-5.1.md:1807`). Muse Spark's media tools are 6 to 24. Grok's render components are 40 to 60. Their guidance sits in system blocks and skills (Q1), so the description stays small. Codex has no visual tool at all.
4. **Codex balances the routing surface, not the bodies.** Its skill catalog has 16 entries of median 37 words, range 9 to 83 (`5.6-Sol_SystemPrompt.md:277-292`). The skills behind them run from about 1.5k to 5.3k words. Claude Design's catalog is about 3 to 10 words per skill (`Claude-Design-Sys-Prompt.txt:320-332`).
5. **Size cuts two ways.** It gives prominence (N8's worry) and it costs reading (N33's worry). I found no frontier evidence that a longer description wins a choice between siblings. I found frontier products that push a choice from the prompt instead (Q3 and Q5).
6. **Standing cost.** Buddy's ten display tools put about 3,600 words of description and 1,000 of parameters in every request. claude.ai's whole inline-visual path (Visualizer, `read_me`, and its system block) is about 1,500 words. The scopes differ (one tool versus ten), so read this as direction, not proof.

Seven of Buddy's ten descriptions name four or more other tools; Mermaid, freeform and the calculator each route to 4 to 6. Frontier descriptions name another tool only for a confusable pair or a workflow step, which N25 already records. Claude Design's pair is the model: `show_html` says "call show_to_user when you want to surface a file in their view", and `show_to_user` says "For end-of-turn delivery, use `done` instead" (`Claude-Design-Sys-Prompt.txt:368-370`).

## 5. Q3: Cost of first use

**Short answer.** Yes, some frontier tools make the model read a lot before the first use. The toll is uniform in its gate, not in its size. No product tries to equalize tolls by size. Where two options compete (Mermaid or HTML in Codex, the native chart tool or the Visualizer in claude.ai), the cheap one is kept narrow and named, and the prompt pushes toward the richer one. Nobody shrinks the heavy one to match the light one.

**Buddy today** (words the model must read before the first call; description plus the skill its description tells it to load):

| Tool | Description | Skill | Total | Gate |
|---|---|---|---|---|
| `whiteboard_create_view` | 661 | `whiteboard-authoring` 6,975 | 7,636 | Hard: "Load the `whiteboard-authoring` skill before the first `whiteboard_create_view` call" (`whiteboard/tools/create-view.md:15`) |
| `present_html_widget` | 748 | `interactive-pages` 1,039 | 1,787 | Hard (`html-widgets/tools/present-html-widget.md:3`) |
| `render_freeform_figure` | 288 | `explanatory-drawing` 1,595 | 1,883 | Soft: "before composing a new kind of figure" (`figure-rendering/freeform/tools/render-freeform-figure.md:5`) |
| Mermaid, figure, calculator, imagegen, media, browser, `bench_present` | 166 to 355 | none | 166 to 355 | None |

The spread is 34x (222 to 7,636). The whiteboard skill has three parts: product rules 562 words, "Whiteboard Teaching" 3,447, Excalidraw element format 2,966 (`whiteboard-authoring/SKILL.md:1-44`, `:45-427`, `:428-850`). Only the first and third are contract. The middle is teaching policy.

**Frontier** (words read before first use, beyond the always-present description):

| Path | Words before first use | Gate and parity |
|---|---|---|
| claude.ai Visualizer, every kind | `read_me` module: art about 3.3k, interactive about 6.2k, diagram about 8.9k | One gate for every kind: "Call before your first show_widget call" (`Claude-Fable-5.1.md:1807`). Sizes differ 2.7x. These are estimates built from the section sizes at `CLAUDE-OPUS-5.5.md:3724-5121`. I confirmed the art and interactive compositions by calling this session's own `read_me`; the diagram figure is inferred |
| claude.ai native widgets (chart, quiz, step card) | 0 | No gate. The chart tool names itself the cheap path: "it renders immediately, needs no code" (`:1764`) |
| Cowork typed artifacts | SKILL.md in the create result: Docs 1,959, Slides 2,693, Design 2,645, Design System 2,737 (`CLAUDE-OPUS-5.5.md:1264-1994`) | One mechanism, sizes within 1.4x. Extra references (about 2k each) load only when a page says "Read this if…" (`:12041`) |
| Cowork hand-built page | `artifact-design`, 4,600 | Required by the tool description (`:19`) |
| Cowork Docs | 0 for the first call. "make it FIRST ... send it before any search, file read, plan, `guide`" (`:1137`). `topic.index` is 4,039 words, read later | The first visible output comes before the toll |
| Codex `visualize` | Skill 2,681, to be read "completely" (`5.6-Sol_SystemPrompt.md:123`, `:3920-4270`) | Mermaid needs no skill: the base prompt already says to prefer it for small static diagrams (`GPT-6-Sol_Prompts.txt:93`). Uneven by design |
| Codex Browser | 1,544 | Read once per session (`5.6-Sol_SystemPrompt.md:1780`) |
| ZCode `pdf` | Light tasks load SKILL.md plus one brief; standard tasks load more on demand | Graduated by task weight (`Skills.md:541-550`) |
| Muse Spark, Grok | 0 | Guidance already sits in the system prompt |

**What products do about uneven tolls.**

1. **One gate per family, sizes free.** claude.ai gates every Visualizer kind the same way and lets the modules differ.
2. **A no-toll path, with a stated reason.** The chart tool says when it beats the Visualizer and why it is cheap (`Claude-Fable-5.1.md:1764`).
3. **The toll arrives with the thing being made.** "A type is a skill delivered through the tool" (`CLAUDE-OPUS-5.5.md:390`). Every type pays about 2k to 2.7k in the same way.
4. **First visible output before the toll.** The Docs skeleton goes first (`:1137`). Claude Design previews mid-task with `show_to_user` (`Claude-Design-Sys-Prompt.txt:170-171`). Buddy's own skill already says "Optimize for time to first drawing" (`whiteboard-authoring/SKILL.md:62`), yet the description demands the skill before the first call.
5. **Material first, craft second.** Cowork: "Opened first, the skill's instructions pull the work toward layouts and templates while there is nothing yet to put in them" (`:473`). The claude.ai prompt, captured three weeks earlier, says the opposite: "first `view` the relevant SKILL.md files. This check is unconditional" (`Claude-Fable-5.1.md:1365`). Two Anthropic prompts for different products disagree on order, and only the Cowork one gives a quality reason.
6. **A small core plus opt-in references.** Each Slides reference opens with its own trigger (`CLAUDE-OPUS-5.5.md:12041`). `dataviz` points to a reference per step (`:2267-2300`). ZCode triages by task weight.
7. **Amortize, then re-pay.** Read once per session (Codex Browser). Re-read after compaction: "Reload the full visualize skill before creating or updating a visualization" (`5.6-Sol_SystemPrompt.md:3941`).
8. **A minimum contract in the description, as insurance.** Cowork's Artifact description restates title, CDN, and theming rules "If Claude writes a page before that skill has loaded" (`CLAUDE-OPUS-5.5.md:19`).
9. **Offset the cost bias from the prompt or module.** Codex: "Prefer interactive visuals when explaining how something works" (`GPT-6-Sol_Prompts.txt:89`). Cowork's diagram module: "don't chicken out into a flowchart because it feels safer" (`CLAUDE-OPUS-5.5.md:3966`).

**For N33 (my inference, not a decision).**

- Frontier does not support "equalize tolls by size". It supports one mechanism per family, the heavy part kept off the critical path, and a narrow cheap sibling.
- Buddy's asymmetry is larger than any frontier pair I found. claude.ai's heaviest module (about 8.9k) is bigger than Buddy's whiteboard skill, but every Visualizer kind pays one. Buddy's cheapest competitors pay nothing.
- Options, from most to least frontier-like: (a) make the skill advisory, and carry the contract in the description, parameters and the first result; (b) cut the skill to a core of about 1.5k to 2.5k words (the size of a Cowork type's SKILL.md or Codex's `visualize`) plus references loaded on demand; (c) return the core in the first result; (d) let the first call be a frame before any reading. The 3,447-word pedagogy part is N3's question, not a size question. Its nearest frontier relative is a teaching skill (Cowork `learn`, 2,232 words), not a drawing-craft skill.
- Also possible (inference): the skill's layout templates, such as "Cumulative Lesson Map" and "Three-Column Reasoning Board" (`whiteboard-authoring/SKILL.md:268-317`), pull first boards toward templates in the way Cowork describes.

## 6. Q4: Per-tool counterpart study

For each Buddy tool: what the closest counterparts say (short quotes), what Buddy's says, and the gap. Paths for Buddy files are relative to `packages/buddy/src/learning/features/`. Word shares come from counting the lines of Buddy's descriptions by purpose.

### 6.1 Mermaid: `render_mermaid` (345 words, `diagrams/tools/render-mermaid.md`)

- **Counterparts.** No capture has a Mermaid tool with a prose description. Codex points at the format: "For small, static software or engineering diagrams that fully explain the answer, prefer Mermaid" (`GPT-6-Sol_Prompts.txt:93`). Its skill says the same in one line: "Use Mermaid when labeled nodes and edges fully explain a static structure" (`5.6-Sol_SystemPrompt.md:3927-3928`). Inside claude.ai's diagram module, one row routes an ERD to Mermaid: "`erDiagram` syntax. Not SVG." (`CLAUDE-OPUS-5.5.md:3964`). ZCode caps diagram size: over 12 nodes, draw "a stripped-down flowchart/Mermaid" of at most 8 nodes (`Skills.md:745-748`).
- **Buddy.** Line 3 lists about 20 diagram types as capabilities. Line 5 routes to four other tools. Line 7 is craft ("Keep each diagram to one idea"). Line 9 says the diagram is saved as an object.
- **Gap.** Frontier fit is one clause with a built-in brake ("fully explain", "small", "static"). It names no sibling. Buddy's fit is a catalog plus four routes. Only two of the four are real confusions (whiteboard and freeform, N22 and N23). There is also an unused 551-word draft of a teaching-situation fit list for this tool (`diagrams/tools/render-mermaid.ideal.md`); see Q5.

### 6.2 Whiteboard: `whiteboard_create_view` (661 words, `whiteboard/tools/create-view.md`)

- **Counterparts.** No frontier product ships a teacher-operated whiteboard. Cowork names a Whiteboard artifact type only in its destination policy: "a brainstorm or retro board, a flowchart, an architecture sketch — boxes, arrows and sticky notes to rearrange together", and any diagram "that people need to work on together" (`CLAUDE-OPUS-5.5.md:333`). Its SKILL.md is not in the capture, and the type list captured in that session had four types, none of them Whiteboard (`:1253-1258`). ChatGPT's canvas (14 months old, contrast only) says create it only "if you are 100% SURE the user wants to iterate" (`ChatGPT5-08-07-2025.mkd:157`), and its update tool says to rewrite code documents with one `.*` pattern (`:198`). Claude Design treats a napkin sketch as read-only input (`Claude-Design-Sys-Prompt.txt:263-265`).
- **Buddy.** About 60% of the words are input contract (lines 1, 15 to 23: 397 words). Fit is 136 words in five bullets plus 68 words of examples. Routing is 60 words (line 13).
- **Gap.** Counterpart fits are about what people do with the thing: iterate, rearrange, work on together. Buddy's first fit bullet (`create-view.md:5`) is about how the learner comes to understand: "seeing it assembled piece by piece, as you explain each part". That is new ground (Q5, gap B). The second (`:6`) is an extend-and-return situation, close to the canvas's "iterate". The contract is the largest part and is partly repeated in the parameters and the result (Q1 point 7).

### 6.3 Constrained figure: `render_figure` (225 words, `figure-rendering/geometry/tools/render-figure.md`)

- **Counterparts.** None for a spec-to-SVG geometry tool. Two precedents for "compute, don't eyeball": Codex maps, "Always project published GeoJSON/TopoJSON ... never hard-code or hand-draw geographic outlines" (`5.6-Sol_SystemPrompt.md:4055-4056`), and Cowork `dataviz`, "the color part is computable, so compute it" (`CLAUDE-OPUS-5.5.md:2264`).
- **Buddy.** "A plausible-looking sketch is not evidence that a relation holds" (`render-figure.md:3`). It names freeform, the calculator and the whiteboard.
- **Gap.** Consistent in stance, nothing to borrow for size. It sits at the family median, which is where the others should be.

### 6.4 Freeform figure: `render_freeform_figure` (288 words, `figure-rendering/freeform/tools/render-freeform-figure.md`)

- **Counterparts.** The nearest is the Visualizer's SVG mode. Its craft is in the diagram module: "Draw the mechanism, not a diagram about the mechanism" (`CLAUDE-OPUS-5.5.md:4185`), a brake ("if the drawing doesn't make the mechanism clearer, don't draw it", `:4181`), and "These are schematics, not illustrations" (`:4183`). Cowork's `artifact-diagramming` adds "If a sentence says it faster, write the sentence" (`:2117`). Other products keep image generators away from SVG by an exclusion in the generator: Muse Spark, "Source code for visuals (SVG, vector graphics)" (`Muse_Spark_Apr-08-26.txt:145`); Grok, "DO NOT USE this for SVG requests" (`GROK-4.20.mkd:62`).
- **Buddy.** Line 1 is a sharp fit: "position carries meaning and the picture is read once". Line 3 names five siblings. Line 5 is drawing craft. Line 7 forbids chemistry.
- **Gap.** Frontier SVG craft lives in a module or skill; Buddy's line 5 puts it in the description. Frontier chooses the kind of drawing inside one tool by intent ("is the user trying to *document* this, or *understand* it?", `:3942`), not by naming other tools.

### 6.5 Widget: `present_html_widget` (748 words, `html-widgets/tools/present-html-widget.md`)

- **Counterparts.** claude.ai's `show_widget` is 103 words: "Use for flowcharts, architecture diagrams, dashboards, forms, calculators, data tables, games, illustrations, or any visual content" (`Claude-Fable-5.1.md:1807`). It takes code in the call. Its fit sits in the system block ("Educational explainers", `:1402`) and its craft in modules. Codex has no tool: the model writes a fragment file and emits one directive line, `::codex-inline-vis{file="<title>.html"}` (`5.6-Sol_SystemPrompt.md:3985`). Cowork sends a kept or shared interactive page to an artifact (`CLAUDE-OPUS-5.5.md:338`).
- **Buddy.** Fit is 111 words (15%). 76% is contract: the two-step file workflow, a six-item field-ownership list, three JSON examples, lifecycle and sandbox rules (lines 5 to 56). Line 1 holds the one situational fit: "understanding comes from the user's own action".
- **Gap.** The contract is long because the tool takes a path, not code. Fit is richer than any counterpart. Craft (the 1,039-word skill) is lighter than claude.ai's 3.3k to 8.9k modules, the one place Buddy's toll is lower.

### 6.6 Browser: `inapp_browser_open` (264 words, `browser/tools/open.ts:43-50`)

- **Counterparts.** Atlas's `open_tabs` is conservative and honest: "Only call this when the user explicitly asks to open tabs or confirms that you should do so", and it "won't return anything" (`Atlas_10-21-25.txt:335`). Codex's `open_in_codex` adds a workflow fit and a limit: "Use this after creating or editing an artifact when showing the result would help the user ... This only opens Codex UI" (`GPT-6-Sol_Tools.json:813`). Cowork keeps room facts in a skill: the side panel "shows one of them at a time" and the model should say what it did "because the person may not have been watching the pane" (`CLAUDE-OPUS-5.5.md:17755-17757`). The same skill "does not decide which browser to use" (`:17742`); the system prompt does (`:416-426`).
- **Buddy.** Fit is broad and pedagogical ("when seeing the real page would serve the user better than a description or a recreation of it"). It adds a narration rule ("Say in a short clause that you opened it") and a truth rule ("do not claim that opening a URL proves what the page contains").
- **Gap.** Frontier "open" verbs are conservative or neutral on initiative and carry contract and truth only. Buddy's truth rule matches frontier practice. Its narration and teaching-use lines are extra, and its initiative is wider than Atlas's.

### 6.7 Media: `present_media` (166 words, `media-presentations/tools/present-media.ts:34`)

- **Counterparts.** Codex has no tool, only a rule: relative paths "will not render the media" (`GPT-6-Sol_Prompts.txt:529`). Muse Spark states visibility as a fact: "Media shows automatically" (`:165`) and "Generated files are not automatically visible to the user" (`:175`). claude.ai's `present_files` has when, when-not and how-it-works lists (190 words, `Claude-Fable-5.1.md:1785`). Grok's `render_file` is 34 words: "Use this to display plots, charts, and images saved to disk" (`GROK-4.20.mkd:77`).
- **Buddy.** The shortest of the ten. Structure: what and where (inline), inputs, not-for (four siblings), save note.
- **Gap.** Good size and shape. The not-for line names four tools where a frontier description would name none or one.

### 6.8 Bench: `bench_present` (301 words, `bench/tools/present.ts:1432`)

- **Counterparts.** Claude Design splits "show" into three tools of 42, 48 and 69 words, each naming the other where they are confusable: `show_to_user` is "Open a file in the USER's tab bar so they can see and interact with it" (`Claude-Design-Sys-Prompt.txt:369`). `done` "guarantees the user lands on a working view" (`:370`). Codex uses one tool with a `target` union and eight capability variants of the description (`GPT-6-Sol_Tools.json:809-1700`).
- **Buddy.** One tool, five actions, described in prose. It also lists seven object kinds and seven things not to use it for. The object-kind list repeats the Bench prompt (`bench/bench-feature.p.md:17`).
- **Gap.** Frontier either splits by verb or puts the union in the schema and varies the description by what exists. Buddy's prose list must be edited whenever an object kind comes or goes, which is the fragility N12 and N25 want to avoid.

### 6.9 Image generation and search: `imagegen` (355 words, `image-generation/imagegen-description.md`)

- **Counterparts.** Codex's description is about 260 words and lists "a diagram" as a scene to generate (`GPT-6-Sol_Prompts.txt:750-753`). Its skill excludes the opposite: "diagrams, wireframes, or icons that are better produced directly in SVG" (`5.6-Sol_SystemPrompt.md:724`). Grok's is about 40 words (`GROK-4.20.mkd:62`). Muse Spark's is 19 words, with the exclusions in the system block: "Data visualization (charts, graphs)" (`:144`). For search: claude.ai `image_search` is 30 words and a 983-word block (`Claude-Fable-5.1.md:1771`, `:1679-1745`); Grok's `search_images` is 206 words with three trigger factors (`GROK-4.20.mkd:41`).
- **Buddy.** Bullets derived from Codex (lines 3 to 4 and 10 to 20) plus one fit paragraph (line 6): "A generated image is an illustration, not an authentic source". Buddy has no search tool; `find-and-show-resources` (911 words) covers it.
- **Gap.** The exclusion of diagrams and charts is the same move Muse Spark makes, phrased by category rather than tool id, which fits N25. The provenance rule has no frontier counterpart I found.

### 6.10 Calculator and plots: `python_calculator` (222 words, `calculator/tools/python-calculator.md`)

- **Counterparts.** claude.ai's `chart_display_v0` (385 words, plus 611 of schema) states its own boundary: "Use the Visualizer or an artifact instead when the request needs anything this tool cannot draw" and "Never draw the same chart with both tools" (`Claude-Fable-5.1.md:1764`). Muse Spark keeps the trigger in the system block: "calculate, compute, or verify any numerical result" (`:171`). Grok's `code_execution` is 88 words, mostly libraries (`GROK-4.20.mkd:25`). Chart craft goes to a skill: Cowork `dataviz`, 1,116 words plus references (`CLAUDE-OPUS-5.5.md:2244-2361`).
- **Buddy.** Line 1 is the execution contract, line 3 is plotting craft ("Use a line for continuous change or time"), line 5 is display handling. Mermaid line 3 also advertises `xychart-beta` and `pie`, which overlap the calculator (N26 pair 3).
- **Gap.** Frontier draws a capability boundary in the chart tool only ("anything this tool cannot draw"). It does not route by teaching purpose. Chart craft lives in a skill or in parameters.

### 6.11 What the ten have in common

1. Frontier descriptions are short because fit and craft sit elsewhere. Buddy keeps all three layers in the description.
2. Frontier fit is capability or request shaped. Only Buddy's whiteboard and widget give learner-side reasons.
3. Truth about visibility and limits is a frontier habit Buddy already has in the browser and media tools, and lacks in the whiteboard result.
4. Sibling names appear for confusable pairs only. Claude Design's `show_*`/`done` and claude.ai's chart-versus-Visualizer are the clean examples.
5. Where a tool takes a union (Codex `open_in_codex`), the frontier varies the description by capability. Buddy lists the union in prose.

## 7. Q5: A description template for Buddy

**Short answer.** Six parts in a fixed order, 120 to 250 words, the same parts and similar counts for every sibling. The contract shrinks, the fit stays, craft becomes an advisory pointer. On gap B: a description may name **use situations** (what the user does with the result). It should not name **teacher-side reasoning** (why a novice needs assembly, which teaching model applies). Frontier writes teaching situations, but in the layer that owns "whether to show", not in the tool description.

### The template

| # | Part | What goes in it | Words | Where frontier does it |
|---|---|---|---|---|
| 1 | **Does** | Verb, object, where the result appears, what the user can see when the call returns | 25 to 45 | `show_widget` (`Claude-Fable-5.1.md:1807`); Design `show_to_user` (`Claude-Design-Sys-Prompt.txt:369`) |
| 2 | **Fits** | 2 to 4 items. Every sibling gets one content item (the kind of idea it expresses). It may also get one use-situation item | 40 to 80 | Quiz: "when the user asks for a quiz, practice questions, self-assessment" (`Fable:1787`); Codex `open_in_codex` (`Tools.json:813`) |
| 3 | **Not for** | The brake ("a sentence or table is enough"). At most one named sibling, only for a confusable pair, with the reason in a clause, written in both descriptions | 20 to 50 | chart versus Visualizer (`Fable:1764`); Design trio (`:368-370`); `task.txt:5-9` |
| 4 | **Call it** | Only what the schema cannot say: call order, where ids come from, one example if the input is a union | 0 to 60 | "use the Read tool first"; Codex capability variants (`Tools.json:812`) |
| 5 | **Result** | What comes back and what the user now sees, including "displayed automatically, don't repeat it" | 0 to 25 | Muse "Media shows automatically" (`:165`); `fire_confetti` (`Tools.json:1861`) |
| 6 | **Craft pointer** | Optional. One sentence that a skill has composition guidance. Advisory, not a gate | up to 20 | Cowork: a `quickstart` result "counts as loading" the skill (`CLAUDE-OPUS-5.5.md:19`) |

**Size and balance rules** (from Q2):

- Description 120 to 250 words, median near 175. Ceiling about 300 only for a tool with a structured input.
- Parameter descriptions up to about 25 words each. Per-field rules, enums and the one example live there.
- Whole tool text (description plus parameters) up to about 450 words.
- No sibling above 2x the family median. Frontier max-over-median: Codex `sites_*` 1.8x, claude.ai widgets 2.6x at the single outlier, typical 1.3x to 2.4x.
- Every sibling gets the same six parts, and "Fits" counts within one of each other. That keeps N8: nothing wins by having more fit text.

**How the template meets the locked rules.**

- **N8.** Same parts and similar counts. Size stops being a signal.
- **N12.** Parts 1 to 5 are the tool's own. Part 6 points to craft but does not gate on it. The system prompt still only points.
- **N25.** Part 3 names a tool only for a confusable pair (whiteboard with Mermaid and freeform; freeform with figure; calculator plots with Mermaid charts, N26). Workflow ids go in part 4.
- **N30.** Part 1 says where the result appears and what is visible. Part 5 says what the result tells you.

**What today's whiteboard text would map to** (an illustration of the template, not a wording proposal):

| Today (`whiteboard/tools/create-view.md`) | Words | Would go to |
|---|---|---|
| Line 1: create or continue, title rules | 83 | Does; the rest is already in the parameters (`create-view.ts:35-66`) |
| Lines 3 to 9: fit list | 136 | Fits (3 to 4 items) |
| Line 11: seven examples | 68 | Drop, or keep one |
| Line 13: routes to four tools | 60 | Not for (Mermaid and freeform only, per N22 and N23) |
| Line 15: home tab, skill gate | 50 | Does (where it appears) and Craft pointer |
| Line 17: `boardAction` rule | 93 | Parameter (already at `create-view.ts:42`) |
| Line 19: `elements` JSON rules | 73 | Parameter (already at `:65-67`) |
| Line 21: read context before update | 57 | Call it |
| Line 23: text width, prose-only | 41 | Not for, or a parameter |

That is about 200 to 250 words, down from 661. The widget's 748 would fall to about 250 to 300 the same way: modes and field rules move into parameters, and three JSON examples become one.

### Gap B: teaching situations or capability fit?

What frontier fit statements are made of:

| Kind of fit | Example | Home |
|---|---|---|
| Capability or content | "flowcharts, architecture diagrams, dashboards, forms, calculators" (`Fable:1807`); "labeled nodes and edges fully explain a static structure" (`5.6-Sol:3927`) | Description, or skill |
| Request or use situation | Quiz "to test their knowledge" (`Fable:1787`); canvas "wants to iterate" (`ChatGPT5:157`); Whiteboard type "that people need to work on together" (`CLAUDE-OPUS-5.5.md:333`); "keep, come back to, edit or share" (`:328`) | Description or destination policy |
| Teaching situation, learner side | "Educational explainers — 'How does X work' where the concept has spatial, sequential, or systemic structure" (`Fable:1402`); "I don't get X", "give me an intuition for X" (`CLAUDE-OPUS-5.5.md:3942-3949`); "Prefer interactive visuals when explaining how something works" (`GPT-6-Sol_Prompts.txt:89`); an inline visual is "the move when the concept has shape" (`CLAUDE-OPUS-5.5.md:19339`) | System block, module, base prompt, teaching skill |

**Finding.** Frontier does write teaching situations, but always in the layer that decides *whether and why to show*: a system block, a module, the base prompt, or a tutoring skill. The tool description decides *which tool*, and it states fit as content or as a use situation. Even the products that push hardest on showing ideas keep the description neutral (Visualizer, 103 words). This matches N3 and N36: persona carries the push, tools carry fit.

**Recommendation on gap B (for the owner to accept or change).**

- **Allowed in a description:** use situations, meaning what the user or learner does with the result afterwards. Examples in the same family as N22 (b) and N24: look at once; watch it built while you explain; come back to and extend; act on it; work through together; real thing rather than a recreation. Each sibling should get one, so the set stays balanced.
- **Not in a description:** teacher-side reasons and diagnoses. "Seeing it assembled piece by piece is what makes it understandable" (`create-view.md:5`) is the edge case. Its first half is a use pattern (built while you explain). Its second half is a pedagogical claim. The claim can move to the persona or a teaching skill; the use pattern can stay.
- **N22 already sets a precedent** in the whiteboard's routing: reason (a) "build" is teaching-flavored, (b) "keep" is a use situation, (c) "free drawing" is capability. Frontier has the same three kinds, but spread across homes. So N22 fits frontier in kind, not in location.
- **Warning case.** `diagrams/tools/render-mermaid.ideal.md` is an unused 551-word draft of a pure teacher-side fit list ("Surface confusion", "Cognitive overload", "Blank slate") plus a map from learning need to diagram type. It is the opposite pole. It would make Mermaid the largest description again (N8) and encodes teaching rules that N3 declines. It is a useful test: anything in that style belongs in a teaching skill or the persona, if anywhere.

## 8. Q6: What do frontier skills and modules prescribe? (gap C)

**Short answer.** Mixed, in three tiers. Craft skills teach craft only. Modules and lane-owner skills also choose *inside their own lane* (which diagram type, which format, which route) and draw the lane's edge with "not for". Whether to show and where to put it sit in system prompts or in a tutoring skill. No craft skill picks another lane's tool. The option-A answer from the ledger (craft only) is stricter than frontier practice.

**Tier 1: craft only.**
- Cowork `artifact-design` (4,600 words, `CLAUDE-OPUS-5.5.md:2002-2112`): "Calibrate treatment, not whether to design" (`:2034`). It calibrates treatment, never tool choice.
- Cowork `artifact-diagramming` (606 words, `:2113-2140`): one brake ("If a sentence says it faster, write the sentence", `:2117`) plus mechanics. It defers routing: a markdown page draws diagrams "in whatever fence that lane's renderer supports, and the skill that owns the lane says which" (`:2131`).
- Cowork `dataviz` (1,116 words, `:2244-2361`): picks the chart *form* and allows "not a chart" (`:2272-2273`). Color is computed by script.
- `canvas-design`, `frontend-design`, `paint`: craft. `paint` draws its edge by category, not tool id: "Do not use for charts, diagrams, UI mockups" (`:19798`).

**Tier 2: modules and lane owners choose inside the lane.**
- claude.ai `read_me` diagram module (`CLAUDE-OPUS-5.5.md:3942-3974`): "The decision is about *intent*, not subject matter" (`:3942`); a "Route on the verb, not the noun" table (`:3951`); the illustrative route "is the default ... don't chicken out into a flowchart" (`:3966`); "if the real-world system has a control, give the diagram that control" (`:4179`); ERD goes to mermaid.js (`:3964`). This is teaching-intent routing ("I don't get X", `:3949`), but only among forms of the same tool.
- Codex `visualize` skill opens with both *whether* and *which*: "Create a visual only when it materially improves the explanation"; Mermaid for static node-and-edge structure, HTML for "dynamics, spatial motion, adjustable inputs" (`5.6-Sol_SystemPrompt.md:3926-3929`). The base prompt repeats the same rule (`GPT-6-Sol_Prompts.txt:89-93`). Duplicated on purpose.
- Codex `imagegen` skill: "When not to use" points to SVG or HTML (`:722-726`), and it even sets a placement rule, "If the image is only for preview or brainstorming, render it inline" (`:701`).
- Codex Browser skill: "Stop: choose the right surface before any browser action" (`:1748-1757`). It forces a connector search before the browser.
- ZCode `pdf` Triage and pre-routing checks (`Skills.md:541-560`), `docx` "Quick Route" (`:345-353`), and the "Complex Diagram Strategy" (`:743-750`) all route within their lane.
- Counter-example: Cowork's built-in-browser skill says it "does not decide which browser to use" (`:17742`). The system prompt's `<browsers>` block decides (`:416-426`).

**Tier 3: whether and why to show lives in a tutoring skill or the prompt.**
- Cowork `learn` (2,232 words, `:19287-19366`) is the only tutoring skill in the set. It treats an inline visual as a move in a toolkit: "the move when the concept has shape" (`:19339`). It names the tool *conditionally with a fallback*: "If the `show_widget` tool is available: ... If it isn't: render the visual with whatever the environment supports" (`:19345-19347`). It adds brakes and a coupling to teaching: pair the visual with one question, "Show one relationship, one step, one comparison — not the finished picture", and "don't reach for it every turn" (`:19351`); "Visuals that overdeliver" is listed as a failure (`:19361`).
- claude.ai keeps Step 0 ("does the request need a visual at all?") in the system prompt (`Claude-Fable-5.1.md:1372`), and the diagram module handles the rest.

**Buddy, skill by skill.**

| Skill (size) | What it decides | Frontier analog |
|---|---|---|
| `whiteboard-authoring` (6,975) | Board format (2,966 words) and product rules (562) are craft. "Whiteboard Teaching" (3,447, `SKILL.md:45-427`) is teaching policy, including an "Ideal flow" that has the agent choose a teaching model and scope (`:71-91`). Its last section defers the choice of move to `teaching-models` (`:413-425`) | The craft part matches `artifact-design`. The teaching part matches Cowork `learn`, which is a teaching skill, not a tool-craft skill |
| `explanatory-drawing` (1,595) | Picks the frame by the idea's shape (`SKILL.md:10-31`). Lines 86 to 92 point to five other skills and tools | Tier 2 (like the diagram module's intent routing). The cross-pointers go further than frontier; `artifact-diagramming` defers to "the skill that owns the lane" and names none |
| `interactive-pages` (1,039) | When interaction earns its place, with a brake: name the action, or "show a picture or explain in words instead" (`SKILL.md:8-21`) | Tier 2, like the `visualize` opening bullet. It names no tool |
| `find-and-show-resources` (911) | Find before make: use "when the real thing or a proven resource would teach better than a drawing or description" (`SKILL.md:3`). Body says to open the reader on the Bench or the Browser | No skill analog. Nearest: Codex `imagegen` "When not to use" (lane edge) and claude.ai's image-search block (system level) |
| `reading`, "Source as Learner-Facing Evidence" (`reading/skills/reading/SKILL.md:22-25`) | Decides placement and names three tools unconditionally: `bench_present`, "build it on a whiteboard", "open it in the Browser" | Codex Browser "choose the right surface" is the nearest, but that skill owns the browser. `reading` owns neither the whiteboard nor the Browser. Cowork `learn`'s "if available, else" is the frontier form for a non-owner |
| `teach-mathematics` (526), `teach-chemistry` (1,386) | Domain routing that names `python_calculator`, `render_figure`, `render_freeform_figure`, `render_svg` (`math/skills/teach-mathematics/SKILL.md:10-11`; `teaching-guidance/skills/teach-chemistry/SKILL.md:13`, `:38-39`) | ZCode `pdf` and `docx` route inside their domain the same way |

Six of Buddy's 24 skills name a visual tool id (`whiteboard-authoring`, `teach-mathematics`, `teach-chemistry`, `teaching-resource-authoring`, `find-indian-education-resources`, `reading`).

**Answer to gap C (a recommendation for the owner).**
- A craft skill may: teach craft; choose inside its own lane (frame, mode, form); set the lane's "not for" edge by category, not by tool id.
- A domain or teaching skill may also say when a visual is a good move and how to pair it with a question, as `learn` does. It should name other lanes' tools only as "if available, else ..." so a missing tool does not break it (N12).
- Placement (inline versus Bench) and the base "whether to show" belong to the persona or Bench prompt (room report), not to a craft skill. Codex's `imagegen` save-path rule is the lone frontier exception.
- For Buddy, the clean cuts are: move the 3,447-word pedagogy out of `whiteboard-authoring` (or decide it is dead under N3/N14), and rewrite `reading`'s three-tool placement paragraph in the conditional form.

## 9. Q7: Building in segments (ledger N21)

**Short answer.** Nobody ships a teaching whiteboard, so there is no direct counterpart. Frontier gets "built in steps with explanation between" in four ways: several calls with prose between (claude.ai), a skeleton that fills section by section (Cowork Docs), file-level edits and republish (Cowork artifacts, Claude Design), and UI steppers the user clicks. The only picture surface with update-and-continue semantics is Buddy's whiteboard. Its mechanics fully support segmenting. Its description never says so; the push to segment sits in the skill.

**How frontier does it.**
- **Several calls, prose between (claude.ai Visualizer).** "For complex topics, use multiple SVG calls" (`CLAUDE-OPUS-5.5.md:3970`). "Always add prose between diagrams ... explains what the next diagram shows and connects it to the previous one" (`:3972`). "Promise only what you deliver" (`:3974`). When a subject needs an intuition picture and a reference picture, draw the intuition first and the reference "as a second tool call with prose between" (`:3968`). One SVG per call (`:3869`). The system block says the same: "text → Visualizer → text → Visualizer. Claude never stacks calls back-to-back" (`Claude-Fable-5.1.md:1410`). There is no update parameter on `show_widget` (title, loading messages, code only, `:1807`), so each segment is a new card, not a growing picture. Streaming helps the first segment appear early: "Structure code so useful content appears early" (`CLAUDE-OPUS-5.5.md:3756-3763`). This is the closest frontier match to "drawing coordinated with narration", and it is written as craft in a module, not in the description.
- **Skeleton first, fill later (Cowork Docs).** "make it FIRST ... its skeleton (title, byline, a `pending` block per section)", then "keep them posted in a short line naming what you're on", then replace each pending block (`:1137`). The tool descriptions are 11 to 24 words; the pattern lives in the server instructions. Cowork's `<building>` adds: "For long files, Claude builds in stages, outline first and then the sections" (`:473`).
- **Files as segments (Cowork Slides, Claude Design).** One file per slide. "People edit live: start from what you just read", change only the named slides, send one call with only those files, and on a conflict re-read and redo once (`:1418-1426`). Claude Design previews mid-task with `show_to_user` and delivers at the end with `done` (`Claude-Design-Sys-Prompt.txt:170-171`, `:369-370`).
- **User-driven steps.** One call, the user clicks through: "explain the Krebs cycle ... HTML stepper — Click through stages" (`CLAUDE-OPUS-5.5.md:3962`); `step_card_display_v0` with `view: 'stepper'` "reveals one step at a time" (`Claude-Fable-5.1.md:1795`).
- **Pedagogy, not mechanics (Cowork `learn`).** One step per turn: "one focused question and one small scaffold" (`:19323`); "Show one relationship, one step, one comparison — not the finished picture" (`:19351`).
- **Counter-examples.** Codex `visualize` says work silently and let the final response be the first user-facing message (`5.6-Sol_SystemPrompt.md:3930-3933`); one fragment per visualization. ChatGPT canvas has an update tool but tells the model to rewrite whole documents with one `.*` pattern (`ChatGPT5-08-07-2025.mkd:198`; 14 months old).

**What Buddy's whiteboard allows** (`whiteboard/tools/create-view.md`, `create-view.ts`).
- `objectAction: create | update` with a stable `objectID`; `boardAction: continue_current_board` for "normal appends ... and anything that should preserve existing content or learner edits" (`create-view.md:1`, `:17`; `create-view.ts:41-44`).
- `elements` may contain `delete`, `translate` and `cameraUpdate` as well as drawing elements (`create-view.md:19`).
- Elements stream to the learner as the tool input arrives ("Progressive rendering is best effort while the tool input streams", `whiteboard-authoring/SKILL.md:40`; client side `web/src/components/whiteboard/whiteboard-progressive.ts`).
- `whiteboard_read_context` before any update that preserves content (`create-view.md:21`), so learner edits between calls survive.
- Nothing limits calls per message. The result tells the model how to continue (`create-view.ts:339`) and returns a measured-layout check, with "at most one follow-up ... repair" on failure (`:183-203`).
- Where the segmenting advice lives: the skill. "Go one logical block at a time, and explain each block as it appears" and "draw the blocks ... one at a time as you explain them, and stop at a coherent point" (`SKILL.md:55-56`), "Optimize for time to first drawing" (`:62`), "Frame completed segments" and end each segment with "a visible consolidation move" (`:263-266`). `explanatory-drawing` has the same idea: "Then add while you explain. Add one element or group per idea" (`teaching-guidance/skills/explanatory-drawing/SKILL.md:45`).
- In the description, the closest line is a fit reason: "seeing it assembled piece by piece, as you explain each part, is what makes it understandable" (`create-view.md:5`). It does not say that a build can span several calls with talk in between.

**Gaps (inference marked).**
1. The description states the reason for a segmented build but not the fact that makes it possible. A contract sentence such as "each call shows on the board when it finishes; later calls extend the same board" would let the model infer segmenting without a teaching rule (keeps N3).
2. The result does not say what the learner can see (N30). Claude Design's `done` and Codex's confetti result show the pattern: the result says what the user now sees.
3. The toll works against segmenting. Segmenting needs a cheap first call and cheap follow-ups. Follow-ups are cheap (append a zone). The first call costs about 7.6k words (Q3). Cowork Docs shows the alternative: frame first, read later.
4. The result's own push is toward repair, not toward the next step: it asks for "at most one follow-up ... repair" (`create-view.ts:202`) and restates edit mechanics. Nothing in the result nudges a next segment. Inference: a short "visible now, continue with update" line would do that without teaching rules.
5. Evidence in N21 says the benefit needs narration with each step. The only frontier line that couples calls to narration is claude.ai's "prose between diagrams" (`:3972`). Buddy's skill already holds both the pacing and the consolidation idea, so the missing piece is mostly where it lives and how costly the first call is, not the content.

## 10. Open questions for the product owner

1. **Gates.** Should any tool's first use require reading a skill, or should the contract live in the description, parameters and first result, with craft offered but never required?
2. **Balance.** Do we equalize sibling effort and size, or accept the frontier approach: keep the cheap sibling narrow, and let the persona push the richer option?
3. **Fit wording (gap B).** May a description name use situations (what the learner does with the result) but never teacher-side reasons (why that helps a novice)?
4. **Skill scope (gap C).** May a domain or teaching skill route to other lanes' tools only in an "if available, else" form, and where does teaching policy like "Whiteboard Teaching" (3,447 words) live: craft skill, teaching skill, or nowhere?
5. **Segments.** Should a tool's contract state that calls extend a visible result, so segmenting follows from the mechanics, or should every mention of segmenting stay in craft skills?
