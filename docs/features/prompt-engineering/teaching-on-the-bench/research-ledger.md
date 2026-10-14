# Research Ledger — Teaching on the Bench

A running record of what has been examined for [the problem](problem.md), so nobody researches it again. Every entry names its source, the observation, and what it implies. Add new entries at the end of the relevant section, and update an entry's status rather than deleting it when later work changes it.

**Status tags:** `fact` (verified in code or source), `finding` (an interpretation of sources), `open` (still to verify), `superseded` (no longer true; say what replaced it), `locked` (a decision made with the user).

**Decisions:** Every decision made with the user is recorded here, with its date. A later decision supersedes an earlier one. When that happens, tag the earlier entry `superseded by <id>` rather than deleting it. From 2026-09-28, decisions go in section N.

**How the system works:** [system-map.md](system-map.md) records how a turn is put together: personas, prompt layers, features, and where each visual lands. Read it before you trace the code again.

Last updated: 2026-09-28.

---

## A. Buddy's current state (verified in code on `fix/visuals-prompt`)

**A1 · Where each visual lands** · `fact`
- Inline in chat: `render_mermaid` (`diagrams/tools/render-mermaid.ts:151`), `render_figure`, `render_freeform_figure`, `python_calculator` plots, `imagegen`, `present_media`, flashcard decks, question sets.
- Auto-open on Bench: `whiteboard_create_view` always (`policyID: "whiteboard"`); `present_html_widget` always (inline card plus a Bench auto-open).
- Explicit Bench: `bench_present` (files, reading resources, objects, `focus_tab`, `close`) and `inapp_browser_open` (a new Bench tab on every call).
- **Implication:** choosing a tool is currently also choosing a placement. The model cannot deliberately decide "inline" versus "Bench" for most representations.

**A2 · A code comment says the placement policy is undecided** · `superseded` by J: small widgets now stay inline, and the comment is gone
`features/html-widgets/tools/present-html-widget.ts:26`: "Temporarily auto-open every viewport preset on Bench until we find a better pattern for which widgets stay inline-only vs open on Bench." The "when to open the Bench" problem is a known TODO in code.

**A3 · Every visual tool disclaims the generic request** · `superseded` by J: each tool now claims the cases it serves
On this branch:
- Mermaid: "A request for a visual does not by itself select Mermaid."
- Whiteboard: "A generic request to explain, draw, or show a diagram does not by itself select a whiteboard."
- Image generation: "A generic request to explain, draw, or show a diagram does not by itself select image generation."
- HTML widget: only when runtime behavior is needed.

No tool owns the default for "explain X" or "show me X". The persona prompt tries to own it through a media list, but that list names tool families and conflicts with the tools (A4). **Implication:** the most common teaching request has no owner.

**A4 · The system prompt contradicts the whiteboard tool** · `superseded` by J: both layers now use one routing model
`shared/visual-guidance.p.md` recommends the whiteboard for "flowcharts, concept maps, systems, networks, model architectures". `whiteboard/tools/create-view.md` says to prefer "a static renderer for a finished diagram" and that a generic request does not select a whiteboard. For the CNN example, the two layers point different ways.

**A5 · How the pendulum swung** · `fact`
At `HEAD`, the old `show-dont-tell.p.md` said "reach for [visuals] constantly… When in doubt, make it visible" and "HTML widgets — reach for these first for most visuals". The branch swung the other way: tools became restrictive and the shared guidance became conditional. Neither version has a model of *placement* or *lesson flow*.

**A6 · Routing lives inside skills** · `fact`
- `math/skills/teach-mathematics/SKILL.md:11` routes to `render_figure` and `render_freeform_figure` by name.
- `teaching-resource-authoring/SKILL.md:33-38` routes documents to Bench with `bench_present` ("dont present inline").
- `whiteboard-authoring/SKILL.md` (about 7k words) has a routing description plus a full board-teaching method.
- The `reading` skill never mentions Bench, Whiteboard, or Browser (confirmed by grep; matches dogfooding item D2).

**A7 · Features can already own conditional system-prompt text** · `fact`
`runtime/define-buddy-feature.ts` has `prompt?: { instructions }`. `prompt/runtime-context/feature-instructions-context.ts` renders enabled features' instructions inside `<feature_instructions>`. Only `memory` uses it today (`memory/memory-feature.p.md`). **Implication:** Bench and visual guidance can be shown only when those features are enabled, without hard-coding tool names into the persona prompt. This is the same mechanism Anthropic uses (C3).

**A8 · Buddy is told the Bench state on every turn** · `fact`
`prompt/user-prelude/index.ts` (`buildBenchTurnContextPart`) injects the Bench status (closed, visible, or parked), the selected target, whether a drawer covers it, a bounded tab listing, and browser tabs marked as website-controlled metadata. **Implication:** Buddy can already reason about "what's on the board now". The prompts just never tell it how to use that.

**A9 · Bench tools** · `fact`
- `bench_present` (`bench/tools/present.ts:1443`) has these actions: `present_file`, `present_resource`, `present_object`, `focus_tab`, `close`. Its description is mechanical: what it does, not when a teacher would use it.
- `bench_read_context` returns the tab listing and can take an optional screenshot.
- `inapp_browser_open` (`browser/tools/open.ts:43`) opens a user-controlled tab and cannot read the page.

**A10 · Web access exists; image search does not** · `fact`
`config/opencode/overlay-builder.ts:27-28` allows the OpenCode `websearch` and `codesearch` tools, and `webfetch` exists in the vendored tools. There is no image-search tool. The teacher move "find the real textbook figure and show it" currently needs search, fetch, save, and then `present_media`, or `inapp_browser_open` on a page.

**A11 · Concision wiring** · `fact`
- `concise-response-preference.p.md` is inserted into the persona prompt by `render-persona-prompt.ts`.
- `concise-response-control.ts` strips it when concision is off.
- `user-prelude/concise-responses-transition.ts` sends a reminder when the setting changes mid-chat. The "off" reminder explicitly revokes the old WhatsApp rules.

**A12 · The `prompt-engineering` skill is empty** · `fact`
`.agents/skills/prompt-engineering/SKILL.md` is staged with a single `-`. It is a placeholder.

**A13 · Every object kind can be shown on the Bench** · `fact`
`bench/tools/present.ts:172` (`DEFAULT_BENCH_VIEW_BY_KIND`) maps every object kind to a Bench view: `resource` → reader, `whiteboard`, `html-widget` → runtime, `mermaid`/`figure`/`freeform-figure` → rendered, `media-presentation` → gallery (this includes `imagegen` output, which is saved as a media presentation), `question-set` → practice, `flashcard-deck` → review.
- **Implication:** an inline visual can already be *promoted* to the Bench with `bench_present present_object` and the returned object id. Placement can be a separate decision from rendering, with no new tool parameters.
- No prompt or tool description says this.
- Answers Q3.

**A14 · Rules for opening and focusing tabs** (`docs/features/tabs/system-design.md:101-200`) · `fact`
- "If the target already has a tab, focus it. Otherwise, open a new tab and focus it."
- The first whiteboard event in an agent message takes focus. Later events in the same message do not pull focus back if the user has moved away.
- Agent-driven tab switches are visible to the user on purpose: "the selected tab represents the one shared piece of Bench that both the user and the agent are working with."
- Only the selected, visible tab exposes its content to the model.
- **Implication:** the product already has a *joint attention* model (one shared object in focus). The prompts never mention it.

**A15 · Auto-open policy** (`packages/web/src/lib/bench-open-policy-core.ts:239-289`) · `fact`
- Whiteboard and fullscreen-widget auto-opens may replace a different visible target. This fixes dogfooding 19-June D4, where drawing while reading did not switch.
- Any other auto-open is ignored while a different target is visible (`auto-open-not-authorized`).
- `autoOpenSuppressed` is hard-coded `false` (`lib/directory-workspace-controller.ts:1210`), so users cannot turn auto-open off.

**A16 · Placement intent recorded in design docs** · `fact`
- `docs/features/html-widgets/design.md:77`: "Render widgets inline in the transcript with fullscreen support." That was the original intent. Auto-opening on the Bench came later and is temporary (A2).
- `docs/features/bench-mode/unified-bench-ux-design.md` (historical) calls the Bench "one model-visible presentation and interaction surface" that other surfaces converge on.

**A18 · The whiteboard skill holds a Bench-level teaching model** · `fact`
`whiteboard-authoring/SKILL.md:189-205` ("Core Idea") lists nine jobs a board can do: **Orient, Model, Retrieve, Record, Organize, Compare, Check, Preserve, Focus**. It adds: "The strongest board work chooses one or two of these jobs deliberately."
- None of these jobs is specific to the whiteboard. They describe any shared teaching surface.
- **Implication:** the best "teacher using the room" model Buddy has is locked inside one tool's skill. It should move to the Bench level.

**A19 · Whiteboard pacing contradicts the constitution** · `superseded` by J: board pacing now follows the teaching move
- `whiteboard-authoring/SKILL.md:53-64`: "Don't draw more than 2 frames a turn"; "Go one frame; ask user for interaction"; "If you are just pushing out diagrams, and user is not interacting, you are NOT doing a good job."
- `shared/constitution.p.md`: "Do not fragment an explanation, require a reply between ideas, or append a question merely to keep individual messages short."
- The two give opposite pacing instructions whenever a whiteboard is in play.

**A20 · A shell exists, but there is no image workflow** · `fact`
- `vendor/opencode/.../tool/webfetch.ts:107-120` returns an image to the **model** as a base64 attachment and saves nothing to disk. Buddy can *see* a found figure, but cannot show it without extra steps.
- The Buddy persona runs as OpenCode `build` (`personas/buddy.ts`), which has a shell. So "download, then `present_media`" is possible, but nothing tells Buddy to do it.
- `inapp_browser_open` can show the source page as-is.

**A21 · Diagram types Buddy's Mermaid accepts** · `fact`
- `diagrams/service/preflight.ts:19` recognizes: flowchart/graph, sequence, class, state, ER, journey, gantt, pie, mindmap, timeline, gitGraph, quadrantChart, requirement, C4, zenuml, sankey-beta, xychart-beta, block-beta, packet-beta, kanban, architecture.
- The web package pins `mermaid ^11.12.0`.
- At `HEAD`, the tool description listed these families; the branch removed the list (see the diff in section B).
- **Implication:** Mermaid covers *how* and *when*, plus simple *why* (a quadrant 2×2) and simple *how much* (xychart, pie, sankey). Layout is automatic, so position never carries meaning. The description should list the families again.

**A22 · `focus_tab` refuses Browser tabs** · `superseded` by N28: since #103, `focus_tab` can focus Browser tabs
`bench/tools/present.ts:1295` returns `unsupported_target` with "Browser tabs are user-controlled. Use inapp_browser_open to open a URL in a new visible Browser tab." Buddy therefore cannot return to a Browser tab itself. Prompts must tell it to point the user to an open Browser tab rather than open the page again.

**A23 · Math dynamic tools exist** · `fact`
The `learning_tool_search` and `learning_tool_load` tools referenced by `teach-mathematics` are real (`runtime/dynamic-tool-discovery.ts`). The skill's decision tree (calculator first, figure when spatial, text otherwise) is a consistent domain protocol, not a conflict. It was left unchanged.

**A24 · The `question` tool is named in the persona on purpose** · `fact`
`shared/teaching.p.md` principle 16 says "Use the `question` tool only when…". `question` is OpenCode's vendored tool (`vendor/opencode/.../tool/question.ts`). Buddy does not own its description (AGENTS.md: edit vendor only on request), so the persona keeps this one guardrail by name. It is a deliberate exception to "no tool names in the system prompt".

**A17 · No evaluation harness for prompt behavior** · `fact`
There are no prompt evals in the repo; the only evaluation script is `packages/buddy/script/learner-memory-evaluation.ts`. The dogfooding notes (5, 12, and 19 June) contain no complaints about concision length. **Implication:** Q4 cannot be answered from existing evidence. A small fixed prompt suite has to be built and run before and after changes.

---

## B. Earlier internal work (inputs, not anchors)

**B1 · Proposal 01, whiteboard selection** (`prompt-reviews/whiteboard-selection/review.ts`) · `finding`
- Leaner shared guidance that says "each visual tool's description explains when to use it".
- Ten positive examples in the whiteboard tool description.
- A short skill description that just says "load before first draw".
- One-visible-tab rule in `product`.

Direction is compatible with principle 3. It still leaves the generic default without an owner (A3).

**B2 · Proposal 02, visual teaching system** (`prompt-reviews/visual-teaching-system/review.ts`) · `finding`
Eleven edits:
- Start from what the learner must *do* (inspect evidence, compare, see a relationship, test a change, follow developing reasoning).
- Build, complete, or revise as conditional choices.
- Bench as external memory.
- A widget needs a consequential learner action.
- Illustration versus evidence.
- Fade support toward the learner.
- Drop the Socratic default.

This is good evidence-level content. It is organized per tool and does not address placement or lesson flow.

**B3 · The seven deep-research reports** (`docs/sources/`) · `finding`
Shared conclusion: no medium is better in general. Each is justified by the *cognitive job* the learner must do.
1. **Source:** show the real source when its details are the evidence.
2. **Interaction:** helps when the action does a learning job (pacing, intervening on a variable, predict-then-test).
3. **Static diagrams:** help when they make task-relevant structure visible. Labels belong next to what they name (split-attention meta-analysis *g* = 0.63). Simplified beats detailed.
4. **Geometry:** relational accuracy matters, not being to scale.
5. **Graphs:** use them for relations, shape, rate, distribution, and uncertainty; use tables for exact lookup.
6. **Built vs complete:** building progressively helps when the unfolding guides attention (instructor hand-drawing improves transfer for novices). Complete diagrams help repeated reasoning and prediction. Revision helps when paired with comparison and feedback.
7. **Whiteboard:** use it when learners benefit from seeing knowledge *constructed over time*. Transient information hurts, so keep the record visible.

**B4 · `docs/features/prompt-engineering/design.md`** · `finding`
An older pass focused on pedagogical skills (`learn`, `practice`, `assess`). It explicitly put "artifact-generation trigger rules" out of scope. Its working rule was "use Mermaid as the reference pattern for strong trigger descriptions".

---

## C. Frontier system prompts (`~/Code/CL4R1T4S`, last-year prompts only)

**C1 · Claude (Opus 5, `ANTHROPIC/OPUS-5.md:1285-1353`): an ordered routing checklist for visuals** · `fact`
Step 0: is a visual needed at all ("most requests are … fully answered by text")? Step 1: does a connected tool fit this *category* ("fit means category match, not style preference")? Step 2: was a file asked for? Step 3: the default inline Visualizer.
- Proactive triggers include "Educational explainers — 'How does X work' where the concept has spatial, sequential, or systemic structure. Simple definitions don't qualify."
- Rules: interleave text → visual → text; never stack visuals; never narrate routing.
- Worked example: "Explain how the water cycle works → Proactive Visualizer: stage diagram, prose around it."
- **Implication:** one ordered checklist, with one tool as the explicit **default**, solves the ownership gap in A3.

**C2 · Claude (Opus 5.5, `CLAUDE-OPUS-5.5.md:311-345`): "Outputs depend on where they are going to live"** · `fact`
- Read once and move on → answer in the reply. An inline picture is fine when it "helps explain what Claude is saying… read once along with the rest of the reply."
- Something the person will keep, come back to, edit, or share → an artifact.
- Boxes, arrows, and sticky notes "to rearrange together", or a diagram too complex to draw inline → the Whiteboard type.

**Implication for Buddy:** this is the **inline-versus-Bench rule**. Inline is for things read once as part of the explanation. The Bench is for things the learner will keep looking at, return to, build on, manipulate, or edit.

**C3 · Claude: tool-specific system-prompt blocks appear only when the tool exists** · `fact`
`<using_image_search_tool>` (OPUS-5 around line 1521) and the Visualizer checklist appear as conditional blocks. The generic persona text mentions no tools. Buddy's feature `prompt.instructions` (A7) is the matching mechanism.

**C4 · Claude image search: a real image as the default visual for "what does X look like" and for many explainers** · `fact`
- "Explain photosynthesis to me" leads to an image search for "photosynthesis diagram process".
- Placement rules: interleave each image next to the text it illustrates. When the image *is* the answer, lead with it.
- Skip images for code, math, step-by-step instructions, and data.

**Implication:** the teacher move "show a real canonical figure" is first-class in Claude. Buddy has no equivalent (A10).

**C5 · GPT-6 (Codex Desktop, `OPENAI/Codex_Desktop/GPT-6-Astra_Prompts.md:108-116`): a short visualization policy in the system prompt, with no tool names** · `fact`
- Use a visualization when it makes an explanation clearer. Prefer interactive visuals for how something works, cause and effect, comparing options, or change across scenarios, and don't wait to be asked.
- Use tables for mappings. Use Mermaid for small static diagrams "that fully explain the answer".
- Use standalone artifacts for figures that will be exported or shared.
- Skip visuals for single facts, one-step actions, and anything already clear in a short paragraph.

It names *formats* (Mermaid, tables), not tools. **Implication:** this confirms principle 3 and shows how compact a system-prompt layer can be.

**C6 · GPT-6 tool descriptions state boundaries plainly** · `fact`
`open_in_codex`: "Use this after creating or editing an artifact when showing the result would help the user… This only opens Codex UI; use file or terminal tools to inspect or interact with the content." The pattern is to say what it does, when to call it, and what it cannot do, with the neighbouring tool named.

**C7 · GPT-6 writing style as a model for concision** · `fact`
`GPT-6-Astra_Prompts.md:37-49`: "State the main point clearly and early, then develop it with the explanation and detail the reader needs… Develop the points that matter and provide enough support to be useful." Concision is defined as *leading with the point and cutting filler*, not as a length cap. Buddy's new concision prompt follows the same shape.

**C8 · Claude Opus 5.5 register switching** · `fact`
`<chatting_with_person>` versus `<working_with_person>`: conversational turns get prose, few words, and minimal formatting. Work turns get readable structure. "Claude matches its effort to the ask." **Implication:** concision should depend on register, not be one global rule.

**C10 · Claude Learning Mode, shipped as a `learn` skill** (`ANTHROPIC/CLAUDE-OPUS-5.5.md:19289-19363`) · `fact`
This is the closest external analogue to Buddy's learning-companion persona.
- **Trigger description:** explicit learning requests; terse concept names ("transformers, from scratch"); confusion signals; conceptual questions. It does **not** trigger for tasks, lookups, opinions, or resource recommendations.
- **Diagnose before you teach:** one calibrating question, not three. For fluent-expert phrasing, briefly ask "what shape of help would land — overview, derivation, worked example". For broad topics, "just lay it out for me" is a legitimate destination.
- **Rhythm:** "one focused question and one small scaffold… every turn… Keep turns short."
- **A visual is "a move in the same toolkit, not a separate mode you switch into."** It is conditional on the tool: "If the `show_widget` tool is available… If it isn't: render the visual with whatever the environment supports." The widget holds only the picture; teaching prose and the question stay outside it.
- **"Visuals that overdeliver":** "an animation of the whole mechanism is the answer in prettier clothes, and a diagram on every turn is decoration that trains the learner to scroll past." "Show one relationship, one step, one comparison — not the finished picture."
- "A slider the learner drags… *is* the reflective-pause move."

**Implications for Buddy:**
1. Visual guidance belongs inside the teaching-moves toolkit, not in a separate "choose the medium" section.
2. A learning-intent skill is the right home for tutoring rhythm.
3. The "finished picture" warning sits in tension with research B3.6 (a complete diagram helps repeated reasoning). This has to be resolved by teaching purpose, not by a blanket rule.

**C11 · Claude Fable 5.1 on length** (`ANTHROPIC/Claude-Fable-5.1.md:92`) · `fact`
"When asked to explain something, Claude gives a high-level summary unless an in-depth one is specifically requested." Fable 5.1 also carries the same four-step visual checklist as Opus 5 (lines 1372-1435).

**C12 · Grok 4.20 `search_images`: routing lives entirely in the tool description** (`XAI/GROK-4.20.mkd:41`) · `fact`
The description gates on three factors (explicit request, visual relevance, user intent) and says: "Do not use it for abstract concepts or when visuals add no meaningful value." A separate render tool places the images inline ("Interweave render components within your final response").
- **Cross-vendor pattern:** Claude (`image_search`), Grok (`search_images`), and Gemini (curated diagram database, E4) all treat **retrieving a real image** as a first-class visual move, separate from generating one.

**C9 · Meta Muse Spark (Apr 2026)** · `finding`
Its media tools (`create_image`, `edit_image`, `animate_image`) carry routing in their descriptions, with ID-copying rules ("Never fabricate IDs"). Its formatting guidance leans the other way ("use headings… flat bullets"). It is a product for a different register and has little to teach about visual pedagogy.

---

## D. Product and pedagogy sources

**D1 · Dogfooding: modality choice** (`docs/reviews/dogfooding-feedback.md:11-12`) · `fact`
"Buddy has several ways to work with content, including the reader, writer, and Bench, but needs a coherent way to choose and introduce the right one for the user's goal." The suggested experience: choose the modality, make the thing, place it on the Bench, and explain how to interact with it.

**D2 · Dogfooding: the reading skill** (`docs/reviews/dogfooding-feedback.md:50`) · `fact`
"The reading skill feels incomplete and too primitive, and does not account for newer surfaces such as Whiteboard and Browser."

**D3 · `~/Code/resources/whiteboard/digital-board-workflow.md`** · `finding`
Lists board modes: **Focus** (one visible step), **Cumulative record** (a Japanese-style board that builds left to right and is rarely erased), **Board = Paper**, **Routine** (Zoom In and similar), **Partial reset**, **Answer board**. It also defines zones (anchor, work, student, archive), Sousa's layout rule (vertical for sequence, horizontal for comparison), and a proposed agent state machine (`FOCUS | CUMULATIVE | ROUTINE | ANSWER | FROZEN`). Sources: *The Teaching Gap*, *Teach Like a Champion 2.0*, *Making Thinking Visible*, *How the Brain Learns*. **Implication:** "pick a mode per lesson segment" is a teacher-level model for the Bench, not only for the whiteboard.

**D4 · `~/Code/resources/visualization/visual-thinking-guide.md`** (from Roam, *The Back of the Napkin*) · `finding`
Maps the dominant question to a figure: who/what → portrait; how much → chart; where → map; when → timeline; how → flowchart; why → multi-variable plot. It adds five stance sliders (simple/elaborate, qualitative/quantitative, vision/execution, individual/comparison, change/status quo). The guide's own TODO says it is "too much what, not enough how". Useful as the *what* layer of a routing model.

**D5 · The resources repo holds the relevant primary books** · `fact`
Among them: *The Teaching Gap*, *Teach Like a Champion 2.0*, *Teaching in the Online Classroom*, *Making Thinking Visible*, *How the Brain Learns*, *Visible Learning*, *How Learning Works*, *Make It Stick*, *Models of Teaching*, *Instruction: A Models Approach*, the Cartoon Guides, and *Thinking in Systems*. Parsed chapters are in `~/Code/resources/chapters/`, and findings files are in `whiteboard/*.findings.mnd`.

---

## E. Web research

**E1 · Anthropic, "Writing effective tools for agents"** ([source](https://www.anthropic.com/engineering/writing-tools-for-agents)) · `fact`
- "More tools don't always lead to better outcomes." Consolidate workflows into fewer tools.
- Use namespacing to show where one tool's job ends and another's begins.
- Name parameters unambiguously ("`user_id`" rather than "`user`").
- Return meaningful context, not low-level identifiers.
- "Think of how you would describe your tool to a new hire on your team." "Even small refinements to tool descriptions can yield dramatic improvements."

**E2 · Anthropic, "Effective context engineering for AI agents"** ([source](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)) · `fact`
- **Prompt altitude:** avoid both "hardcoding complex, brittle logic" and "vague, high-level guidance".
- **Overlapping tools:** "If a human engineer can't definitively say which tool should be used in a given situation, an AI agent can't be expected to do better."
- **Examples:** "curate a set of diverse, canonical examples"; "examples are the 'pictures' worth a thousand words."

**Implication:** Buddy's five static-visual tools overlap (Mermaid, freeform SVG, whiteboard, `render_figure`, HTML widget). The overlap itself is part of the routing problem, not just the wording.

**E3 · Claude API docs, "Define tools"** ([source](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)) · `fact`
"Provide extremely detailed descriptions. This is by far the most important factor in tool performance." A description should cover:
- what the tool does;
- when it should be used, and when it shouldn't;
- what each parameter means;
- caveats, including what the tool does not return.

"Aim for at least 3–4 sentences." Use `input_examples` for complex or format-sensitive inputs, and consolidate related operations behind an `action` parameter.

**This is the tool-description checklist for problem 3.**

**E4 · Google Gemini Guided Learning** ([source](https://blog.google/products-and-platforms/products/gemini/guided-learning-google-gemini/)) · `fact`
- "Guided Learning pulls from a database of high-quality diagrams and images and finds relevant videos on YouTube."
- "Quality had to be high to help students learn, just like a teacher choosing a helpful visual."
- Interactive images ([source](https://blog.google/products-and-platforms/products/education/gemini-interactive-images/)): tap a labelled part of a diagram to open an explanation panel.

**Implication:** a leading tutoring product chose **retrieving vetted canonical visuals** over generating them.

**E5 · Google "Learn Your Way" RCT** ([source](https://research.google/blog/learn-your-way-reimagining-textbooks-with-generative-ai/), [paper](https://arxiv.org/pdf/2509.18664)) · `fact`
- Multiple generated representations of the same content: immersive text with images and embedded questions, section quizzes, slides with narration, audio lessons, and mind maps.
- Retention was 78% versus 67% for a standard digital reader (+11 points).
- The design is grounded in Mayer's multimedia theory and Paivio's dual coding.

**Implication:** several representations of *one* concept that learners can move between is evidence-backed. The Bench's tabs are the natural place for them.

**E6 · Instructor drawing** (Fiorella & Mayer 2016, *J. Ed. Psych.* 108(4); Fiorella, Stull, Kuhlmann & Mayer 2019, *J. Ed. Psych.* 111(7)) · `fact`
Learners understood the Doppler effect, kidney function, and probability distributions better when diagrams were drawn during the explanation than when they were shown already drawn. This agrees with deep-research report 6. **Implication:** "build it on the board while explaining" is a justified default when learners are new to the structure.

**E7 · Ainsworth, DeFT (2006), the functions of multiple representations** ([source](https://eric.ed.gov/?id=EJ737858)) · `fact`
Multiple representations help in three ways:
- **Complement:** each shows different information or supports different processes.
- **Constrain:** a familiar representation limits how the learner reads an unfamiliar one.
- **Construct:** translating between representations builds deeper abstraction.

**Implication:** a second visual (or a second Bench tab) is justified only when it does one of these three jobs. Otherwise it is redundant.

**E8 · CNN Explainer (Wang et al., IEEE TVCG 2020)** ([paper](https://poloclub.github.io/papers/20-vis-cnnexplainer.pdf), [tool](https://poloclub.github.io/cnn-explainer/)) · `fact`
From interviews with CNN instructors and a student survey, the learning challenges are:
- C1: the intricate model structure;
- C2: complex layer operations ("the most challenging part is learning the math behind it");
- **C3: connecting the structure to the layer operations, which the paper calls "one of the cruxes".**

The design answer is to put "a visual summary of CNN models and data flow" (G1), interactive formulas (G2), and **"fluid transition between different levels of abstraction"** (G3) in one tool, with a focus-plus-context display.

**Implication for the motivating example:** a good CNN lesson keeps a persistent *overview* (the whole pipeline) and zooms into a *detail* (one convolution) and back out. That is two representations with a transition between them: an overview tab and a working tab, or one board with an overview zone. CNN Explainer itself is a real, high-quality resource worth opening in the Browser tab.

**E9 · OpenAI guidance** ([GPT-5 guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide), [GPT-5.5 summary](https://simonwillison.net/2026/apr/25/gpt-5-5-prompting-guide/)) · `fact`
- "keep instructions clear and distinct so the model doesn't waste limited reasoning on deciding which tool to use."
- The verbosity parameter scales length and depth separately from the prompt.
- For GPT-5.5: "Begin migration with a fresh baseline instead of carrying over every instruction from an older prompt stack", and "Start with the smallest prompt that preserves the product contract, then tune … tool descriptions … against representative examples."

**Implication:** this supports the user's "first principles, don't anchor" rule and a fixed evaluation set.

---

## G. Books in `~/Code/resources` (objective: how a teacher picks the picture and the instrument)

Parsed chapters live in `~/Code/resources/chapters/<book>/`. Books not yet parsed are in Calibre (`~/Documents/Calibre Mac`, queried with `calibredb list --with-library`). Calibre also holds, unparsed: *Made to Stick* (#874), Tufte's *Visual Display* (#1993, #2803) and *Visual Explanations* (#2802), *Math with Bad Drawings* (#761), *Storytelling with Data* (#2799), *Presentation Zen* (#1366), and the Gonick Cartoon Guides (#1469–1479).

**G1 · Roam, *The Back of the Napkin*, ch. 7 "Frameworks for Showing"** (`chapters/the-back-of-the-napkin/008-*.md`) · `finding`
- **The <6><6> rule:** each way of seeing has one way of showing: "*Who/what* becomes a **portrait**, *how many* becomes a **chart**, *where* becomes a **map**, *when* becomes a **timeline**, *how* becomes a **flowchart**, and *why* becomes a **multiple-variable plot**."
- **Each framework is defined by its coordinate system,** "whether spatial, temporal, conceptual, or causal", together with how its objects relate and where the picture starts.
- **Two hybrids come up often:** the time series (how much × when) and the value chain (when × how).
- **Choosing the framework comes first.** "Select the right framework… then… create our picture… then explain our picture." Only the middle step involves drawing.

**Implication for routing:** an instrument fits when its *native coordinate system* matches the idea's.
- Mermaid has only topological and temporal coordinates, with automatic layout.
- A figure has Euclidean coordinates.
- A plot has quantitative axes.
- The whiteboard and SVG have free spatial coordinates.
- A web app adds time and input.

This is the crispest routing test found so far.

**G2 · Roam, SQVID** (`…/007-*.md`) · `finding`
Five sliders that set the *version* of a picture:
- **S**imple vs. elaborate. The opposite of simple is "elaborate", not "complex".
- **Q**uality vs. quantity.
- **V**ision vs. execution.
- **I**ndividual vs. comparison.
- **Δ** change vs. status quo.

The sliders are tuned "like a graphic equalizer" to the audience. **Implication:** the slider settings pick the instrument *within* a framework:
- Simple and qualitative → sketch (board).
- Elaborate and quantitative → exact render (plot or figure).
- Comparison → side by side.
- Change → before/after, animation, or manipulation.

**G3 · Roam, *Blah Blah Blah*, "The Grammar of Vivid Thinking"** (`chapters/blah-blah-blah/013-*.md`) · `finding`
- **Vivid Grammar maps parts of speech to pictures:** nouns → portraits; adjectives of quantity → charts; prepositions and conjunctions → maps; tense → timelines; complex verbs → flowcharts; complex subjects → multivariable plots.
- The six pictures stack. "Portraits… are the initial building blocks of *anything*." The others layer onto them.
- **Rule 1:** "When we say a word, we should draw a picture."
- **Rule 2:** "If we don't know which picture to draw, we look to Vivid Grammar."

**Implication:** Buddy can route from the *language of its own explanation*. The verbs, prepositions, and tenses in the sentence it's about to write tell it which picture that sentence wants.

**G4 · Roam: evolving ideas and live showing** (`blah-blah-blah/019-*.md`; `the-back-of-the-napkin/016-*.md`) · `finding`
- "Vivid ideas are complete but not done."
- "When we polish our slides to a high finish, we leave our audience with nothing left to add. Since they can't evolve the idea in their own minds, they never fully engage."
- **Show-and-tell practice:** draw "the title, coordinates, key, and first five variables" on the whiteboard *before* the meeting. Then build the rest live, "interactive… live (but that doesn't mean unscripted)".

**Implication:** the whiteboard's value is a prepared frame plus live completion. This supports "build it while explaining" and "leave room for the learner" (C10).

**G5 · Roam: substance over looks** (`unfolding-the-napkin/006-*.md`) · `finding`
"We're not trying to show… what things look like 'out there'… we're trying to show what things look like 'in here'… Don't worry about what your picture looks like; concentrate on what it shows." **Implication:** a rough board sketch is often better teaching than a polished render.

**G6 · LeFever, *The Art of Explanation*, ch. 15 "Right Medium for the Message"** (`chapters/the-art-of-explanation/022-*.md`) · `finding`
LeFever splits the choice in three:
- **media:** text, image, audio, video, or live demonstration;
- **presentation mode:** document, slides, website, webinar, or video;
- **distribution:** recording and sharing.

"Media decisions aren't and *shouldn't* be prescriptive". Constraints decide. **Implication:** this matches Buddy's split between *instrument* (the media) and *placement* (the mode: inline or Bench, document, browser).

**G7 · LeFever, ch. 16 "Visuals"** (`…/023-*.md`) · `finding`
- **Goal of a visual:** "they make ideas memorable and reproducible."
- **The long-tail curve example:** "spend 10 seconds drawing a simple demand curve"; then "plot points on the curve to illustrate case studies… use the curve to ask questions"; students "could take the idea and draw it on a notepad at home."
- **He adopts Roam's 6×6 rule** to choose the type of visual.
- **Visuals support the script,** not the other way round. They mix literal and symbolic (metaphor) images.
- **Remove noise:** no faces on figures, and a browser drawn with no buttons.

**Implications:**
1. Prefer the simplest picture the learner could *redraw* themselves.
2. A good teaching visual becomes a reusable tool that later turns extend (plot the next case on the same curve). That argues for a persistent Bench object.

**G8 · Brown, Roediger, McDaniel, *Make It Stick*** (`chapters/make-it-stick/make-it-stick/`) · `finding`
- **Generation effect:** filling in "foot–s _ _ e" beats studying "foot–shoe". "The modest effort required to generate… strengthened memory."
- **Structure building:** "extracting the salient ideas and constructing a coherent mental framework." Low structure-builders catch up when "questions are embedded… to help focus readers on the main ideas."
- **The book rejects learning styles** (ch. 6). Visuals are justified by the content's structure, not by a "visual learner".

**Implications:**
1. A partial picture the learner completes beats a finished one when recall is the goal (C10, G4).
2. An explicit overview structure helps weaker learners (E8, CNN overview).
3. The prompt must never route by "learning style".

**G9 · Heath & Heath, *Made to Stick*** (Calibre #874; text at `~/Code/resources/books/Made to Stick - Heath/made-to-stick.txt`) · `finding`
- **Curse of Knowledge:** "Once we know something, we find it hard to imagine what it was like not to know it." "Accuracy to the point of uselessness is a symptom of the Curse of Knowledge."
- **Schemas:** "Good teachers intuitively use lots of schemas… start with compact, stripped-down examples." Examples: idealized pulleys, a two-person apple and orange trade, "a pomelo is a supersized grapefruit". The schema is then "stretched along some dimension."
- **Concreteness:** "our brains are wired to remember concrete data."

**Implications:**
1. A complete, expert-grade diagram on a first encounter (the full VGG-16) is Curse-of-Knowledge output.
2. Start with the smallest concrete model, then extend *the same* representation. This argues again for a persistent Bench object (G7).

**G10 · Knaflic, *Storytelling with Data*** (Calibre #2799; text at `~/Code/resources/books/Storytelling with Data - Knaflic/storytelling-with-data.txt`) · `finding`
- "Exploratory vs. explanatory… Concentrate on the pearls." Show the finding, not all the data.
- **Plain text:** "When you have just a number or two… simple text."
- **Tables vs. graphs:** "Tables interact with our verbal system", so they are read. "Graphs interact with our visual system", so they are seen.
- **Chart types:** lines for continuous data or time; slopegraphs for two points in time; bars for comparing categories.

**Implication:** these rules belong in the calculator/plot tool description ("how much" pictures). Proposal 02 already points this way.

**G11 · Orlin, *Math with Bad Drawings*** (Calibre #761; text at `~/Code/resources/books/Math with Bad Drawings - Orlin/math-with-bad-drawings.txt`) · `finding`
Weak source for routing. It says the drawings are deliberately crude, and "statistics are not so different from stick figures. They're bad drawings of reality." It supports G5 (substance over looks) only anecdotally.

**G12 · Tufte, *Visual Explanations*** (Calibre #2802) · `finding`
The scanned PDF was OCR'd on 2026-09-24 (pdftoppm at 200 dpi, then tesseract) into `~/Code/resources/books/Visual Explanations - Tufte/visual-explanations.ocr.txt` (about 59k words, with page markers).
- **Pictures of verbs:** "Assessments of change, dynamics, and cause and effect are at the heart of thinking and explanation. To understand is to know what cause provokes what effect, by what means, at what rate." The book is "about pictures of verbs".
- **The smallest effective difference** (ch. 4): "Make all visual distinctions as subtle as possible, but still clear and effective." His example: 25 heavy pointer lines on an ear diagram are noise.
- **Parallelism** (ch. 5): paired images at the same size and stance make comparison easy. "Comparisons are usually more effective when the information is adjacent in space rather than stacked in time." Spatial parallelism works because images sit "simultaneously within our eyespan".
- **Small multiples** (ch. 6): many slices displayed within the eyespan make "uninterrupted visual reasoning" possible.
- **Evidence displays:** his dual principles for reasoning and design are documenting sources, enforcing appropriate comparisons, demonstrating mechanisms of cause and effect, expressing them quantitatively, recognizing that problems are multivariate, and inspecting alternative explanations (John Snow's cholera map).

**Applied:** the first three went into `explanatory-drawing`. The space-versus-time finding also supports the Bench rule that two tabs are never visible together, so comparisons belong on one board.

---

## H. Product direction stated by the user (2026-09-24)

- **H1:** The Browser can host anything Buddy authors: web apps, artifact-style pages, games. "Eventually, our plan is also to replace the widget tool with the web browser itself." Runtime and interactive teaching should therefore be routed to a *Browser-hosted page* as the long-term instrument. `present_html_widget` is an interim path.
- **H2:** The Browser also opens YouTube videos and many resources at once. Integrations such as a YouTube skill come later. For now, treat the Browser as the instrument for **finding** existing material (video, simulation, article, figure, interactive) as well as for **making** it.
- **H3:** The resource pipeline (`prepare_resource`, the Bench reader, the `reading` skill) can put whole PDFs and books on the Bench. The learner's own library is therefore the first place to *find* a source before the web.
- **H4:** Evals must run end to end in the app window, not headless: "this system is such a complex system that trying to fix independent parts will not help us predict how the system behaves." The goal is to define evals in DevTools and have the user press play.
  - Verified: Buddy's per-turn Bench context comes from Bench state that the web client synchronizes to the server (`readSynchronizedBenchContext`, `learning/prompt/context.ts:629`), so a headless run never sees it.
  - Pieces an in-app runner can reuse:
    - `sendPrompt` in `web/src/state/chat-actions.ts:1677`, the composer's own path, which carries persona and model;
    - Electron `capturePage` (`desktop-electron/src/main/ipc.ts:420`);
    - the dev-only Vite plugin that writes `.traces/` to the repo;
    - the DevTools tab host in `buddy-devtools.tsx`.

---

## E (continued). Web research on interactive explanation

**E10 · Bret Victor, "Explorable Explanations"** ([source](https://worrydream.com/ExplorableExplanations/)) · `fact`
- There are three forms: reactive documents (change an assumption and see the consequence), explorable examples ("By watching the result change as we adjust parameters, we can develop an intuition"), and contextual information.
- "The author must guide the reader, and provide a structure."
- **Implication:** an authored Browser page (H1) should be an *explanation with controls*, not a bare toy. This matches B3.2 and C10.

**E11 · PhET implicit scaffolding** ([PhET research](https://phet.colorado.edu/en/research), [arXiv 1306.6544](https://arxiv.org/pdf/1306.6544)) · `fact`
Simulations are "designed to provide implicit guidance, so that students follow productive paths of exploration, without feeling guided", through their choice of scope, object placement, feedback, and sequence.
- **Implication:** when Buddy *finds* a simulation, PhET is a vetted source.
- When Buddy *makes* one, the page must narrow its scope and build in feedback.
- Either way, give the learner a task to do with it (B3.2, E4).

---

## F. Tool-description audit against the E3 checklist (branch state, 2026-09-24)

Key: ✓ present · ~ partial · ✗ missing. "Where" means the description tells the model where the result appears (inline or Bench).

| Tool id | What | When | When not | Nearest alternative | Where | Returns / next step | Parameters described |
|---|---|---|---|---|---|---|---|
| `bench_present` | ✓ | ~ mechanical only | ✓ | ✓ | ✓ | ✓ | ✓ all |
| `bench_read_context` | ✓ | ~ | ✗ | ✗ | ✓ | ✓ | ✓ |
| `inapp_browser_open` | ✓ | ~ "when showing a relevant webpage would help" | ✓ | ✗ | ~ "on Bench" | ✓ cannot read the page | ✓ |
| `present_media` | ✓ | ~ | ✗ | ✗ | ~ "conversation UI" | ✗ | ✗ `items[].path` has no description; no title or caption field |
| `render_mermaid` | ✓ | ✓ | ✓ | ~ | ✓ inline | ✓ | ✓ all |
| `render_figure` | ✓ | ✓ | ~ | ✓ | ✓ inline | ✓ | ✗ `spec` and `caption` undescribed; the geometry spec schema has no `.describe()` at all |
| `render_freeform_figure` | ✓ | ✓ | ✓ | ✓ | ✓ inline | ✓ | ✗ `source` and `caption` undescribed |
| `python_calculator` | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ✗ `code` undescribed |
| `present_html_widget` | ✓ | ✓ | ✓ | ✓ | ✗ never says it auto-opens on Bench | ✓ | ✓ all (about 600 words) |
| `whiteboard_create_view` | ✓ | ✓, but contradicts the persona prompt (A4) | ✓ | ✓ | ✓ Bench tab | ~ | ✓ |
| `imagegen` | ✓ | ✓ | ✓ | ~ | ✓ inline | ✓ | ✓ |
| `render_svg` | ✓ | ✓ file-only | ✓ | ✓ | ✓ | ✓ | ✓ |

Findings:
- **F1 · Nobody owns the default.** See A3.
- **F2 · "Present" means three different things.**
  - `present_media`: inline.
  - `bench_present`: Bench.
  - `present_html_widget`: inline plus a Bench auto-open.

  The names come from four different families (`present_*`, `render_*`, `bench_*`, `whiteboard_*`), plus `inapp_browser_open`. E1 recommends namespacing by resource. Renaming is expensive, so fix the descriptions first.
- **F3 · Placement is missing where it matters most.** The widget and media descriptions don't say where the result appears. No description mentions that an inline object can be moved to the Bench (A13).
- **F4 · Undescribed parameters cluster in the math and figure tools.** Those tools rely on `teach-mathematics` to supply the missing parameter meaning, which is routing living in a skill (A6).
- **F5 · Descriptions vary from 1 sentence to 600 words,** with no shared structure. A fixed template (E3) would make them comparable and reviewable in the Easel.

---

## Open questions

- **Q1** `answered` (product decision still needed): Buddy lacks a way to find a real image. Claude, Grok, and Gemini all have one (C4, C12, E4). Today the move needs search, a shell download, then `present_media` (A20), or `inapp_browser_open` on the source page.
  - **Near term:** route "show the real thing" through the Browser, which opens the page with its provenance intact.
  - **Later:** a small `find_figure` tool (search images, save the file, present it with attribution).
- **Q2** `answered`: Placement does not need a new parameter. Render inline by default. Promote to the Bench with `bench_present present_object` when the representation will be kept, returned to, built on, or manipulated (A13, C2). The whiteboard is inherently a Bench object. HTML widgets need an explicit policy to replace the temporary "always auto-open" (A2): inline for a small single-idea interactive; Bench for a workspace the learner will operate.
- **Q3** `answered`: Yes. Every object kind has a default Bench view (A13).
- **Q4** `answered, negative`: There is no evidence either way (A17). The concision prompt must be checked with a fixed prompt set before it is called solved.
- **Q5** `open`: Should Buddy follow Claude Learning Mode's rhythm by default (short turns, one question, one scaffold, C10)? Or should that rhythm apply only once teaching intent is detected, with longer answers otherwise (constitution, Proposal 02)? This decides both the concision prompt and the visual pacing (A19).
- **Q6** `open`: How should the tension between "complete diagram for repeated reasoning" (B3.6) and "don't show the finished picture" (C10) be resolved? Proposed answer: by the lesson segment. Orient with the complete picture when the learner needs the map; withhold when the learner is supposed to construct it.

## Examined and closed

- `docs/features/tabs/system-design.md`: see A14.
- `docs/features/bench-mode/unified-bench-ux-design.md`: historical; see A16.
- `whiteboard-authoring/SKILL.md` teaching sections: see A18 and A19.
- `docs/features/html-widgets/design.md`: see A16. `docs/features/whiteboard/design.md` is about ownership and runtime and has no placement policy.
- Fable 5.1 and Grok 4.20: see C11 and C12.

---

## I. Decisions and principles locked with the user (2026-09-24)

**Decisions** (made with the question tool):
- **Rhythm:** finish, then check. One step per turn applies only inside a deliberately chosen guided model (guided practice, Socratic questioning, a worked example the learner completes). The "when in doubt, choose socratic" default is removed. The user asked that `teaching-models` be treated as a routing mechanism too (see J).
- **Browser:** open it and announce it. Buddy opens an existing resource itself, says so in a clause, and gives a task. The timing and task guidance lives in the persona; the Browser description stays neutral.
- **Widgets:** small ones stay inline. `compact_4_3` and `square` stay inline; `standard_16_10`, `wide_16_9`, and `tall_mobile` still open on the Bench.
- **Baseline:** edit now and run the baseline later from the staged snapshot. The yardstick is in [evals.md](evals.md).

**Principles the user added mid-pass:**
- **Don't overfit to the CNN example.** Examples in prompts span subjects, and the yardstick adds a civics process, a science cycle, and a non-teaching code question (#13–15).
- **Refactor freely.** Follow current frontier practice (CL4R1T4S) rather than existing prompt habits.
- **Keep general-purpose tools unopinionated.** The Bench, Browser, media, calculator, and Mermaid serve non-teaching questions and the code persona too. Their descriptions say "the user", describe capabilities and fit, and carry no teaching judgment. Explanatory tools (whiteboard, widgets) may be framed around explaining. Teaching judgment lives in the persona and in `teaching-models`.
- **Skill or system prompt: choose what works.** Decision: the five routing questions stay in the system prompt, because they are needed before any tool is chosen and a skill loads only after that judgment. Tab rules go in the Bench feature prompt. Craft goes in skills that load before a tool is used (`whiteboard-authoring`). Candidates for later skills: finding and presenting existing resources; authoring interactive pages once the Browser replaces widgets.

**Decision after the first live session (2026-09-24, ledger L):** the system prompt owns one teaching algorithm that ends in a single plan: where the learner is, the move, what they'll see, and what they'll do. Skills (teaching models, drawing, interactive pages, resources, and later learning science) are sources consulted for parts of that plan. None of them controls the turn. The user's reasoning: a teacher picks up a teaching model and uses it with the tools already in hand, so the two have to work together, and more skills will keep arriving. The eval harness on OpenCode's APIs is a separate effort.

## J. What the first editing pass changed (2026-09-24, unstaged on top of the staged snapshot)

**Persona (both teaching personas):**
- `shared/visual-guidance.p.md` is rewritten as "Teach with the whole room": the five questions, no tool names, no "learning style".
- `concise-response-preference.p.md` sets length by the kind of exchange.
- The heading "Teach through conversation; don't lecture" becomes "Answer fully, without padding."
- `learning-companion.p.md` swaps "Pick a Teaching Model" for "Choose the teaching move": finish-then-check, no skill name, no Socratic default.
- `shared/teaching.p.md` gains the fading paragraph from Proposal 02. It loses the skill-name pointer to resource authoring, because that skill's own description triggers it.
- `shared/product.p.md` gains the Bench's Browser and reader, "one tab at a time", and a definition of "inline".

**Bench feature prompt (new):**
- `features/bench/bench-feature.p.md`, loaded through `benchFeature.prompt.instructions`.
- It is persona-neutral and covers the home tab, keeping sources selected, `focus_tab` (except Browser tabs), `present_object` promotion, announcing changes, and not opening the Bench for things read once.

**Tool descriptions:**
- `render_mermaid`: claims ideas where only connections or order matter, and lists its diagram types again (A21).
- `whiteboard_create_view`: claims building up, extending, deliberate layout, and mixed notation, with varied examples.
- `present_html_widget`: centered on a meaningful learner action, and states where the widget appears.
- `render_freeform_figure` and `render_figure`: finished figures where position matters, relationships preserved, placement stated.
- `python_calculator`: rules for plot versus table versus text.
- `imagegen`: illustration versus evidence.
- `present_media`: a neutral rewrite.
- `inapp_browser_open`: neutral. Covers what the Browser can show, announcing the tab, not duplicating tabs (A22), and the reader-first rule.
- `bench_present` and `bench_read_context`: when to use them, and promotion to the Bench.

**Parameters:** new `.describe()` text for `python_calculator.code`, `render_freeform_figure.source` and `caption`, `render_figure.spec` and `caption`, and `present_media.items` and `items[].path`.

**Skills:**
- `teaching-models`: the description carries the session-start trigger. A new "What the Learner Sees" table maps each model to a representation. The default output encodes finish-then-check.
- `whiteboard-authoring`: the Proposal 01 description, examples, and skill relationships; pacing now follows the teaching move instead of "2 frames a turn".
- `reading`: a new "Source as Learner-Facing Evidence" section covering the Bench, whiteboard, and Browser (D2).

**Code:** `present-html-widget.ts` has a smaller auto-open preset set, and the stale "temporarily" comment is removed.

**Verification:**
- `bun lint` and `bun typecheck` pass.
- 84 focused tests pass across 10 files: persona prompts, tool schemas, runtime context, Bench present/read/turn context, Browser open, external file permissions, `present_media`, and HTML widgets.
- The rendered persona prompt was read end to end, and the concision strip still works in both personas.

**Not changed:**
- `teach-mathematics` (A23) and `teach-chemistry`: their tool names enforce domain correctness.
- The Easel proposals: the staged snapshot plus `git diff` now serves as the review.
- Tool names: renaming waits for evaluation results.
- **Still to do:** the board's teaching jobs (Orient, Model, Retrieve, Record, Organize, Compare, Check, Preserve, Focus; A18) still live only in `whiteboard-authoring`. Lifting them to the Bench level is still open.

## K. Second pass (2026-09-24): skills, board jobs, consistency, Tufte, rebase

**New skills.** All three are registered, and the bundled-skill check now counts 17 registrations.
- `teaching-guidance/skills/explanatory-drawing`: composition craft for custom pictures. It covers Roam's six frames with coordinate systems and starting points (G1, and chapters 9–14 of *The Back of the Napkin*), the SQVID versions (G2), frame-first then live build (G4), redrawable and noise-free pictures (G7), compact schemas first (G9), and Tufte's smallest effective difference, comparisons adjacent in space, small multiples, and "draw the verbs" (G12).
  - The freeform figure description tells Buddy to load it before composing a new kind of figure.
  - `whiteboard-authoring` points to it before a new picture is drawn.
- `html-widgets/skills/interactive-pages`: design craft for pages the learner acts on (B3.2, E10, E11), plus the real runtime limits: a sandboxed iframe with an opaque origin, no storage, no third-party network, CPU caution, and the viewport presets.
  - The widget description now points to it instead of carrying the craft paragraph.
  - It is written so the same craft applies once pages move to the Browser (H1).
- `teaching-guidance/skills/find-and-show-resources`: the learner's library first, then vetted places on the web by kind of resource, how to judge what was found, and how to present it with a frame and a task (E4, E11, H2, H3).
  - It defers Indian board and exam sources to the existing Indian-resource skills.
  - It carries an honesty rule: Buddy can't watch videos, so it describes only what it has confirmed.

**Board jobs lifted to the Bench (A18).** `bench-feature.p.md` now asks for one or two clear jobs per tab: orient, model, prompt recall, record, organize, compare, check, preserve, focus. The wording is neutral because the code persona loads it too.

**Consistency fixes found in the sweep:**
- `shared/product.p.md` put the docked Bench on the left. The layout code (`packages/web/src/lib/bench-layout-policy.ts`, `ResolvedDockedBenchRightWorkspaceLayout`) and the Buddy Help doc both put chat on the left and the Bench on the right. The persona now says so.
- `buddy-help/references/workspace.md` said whiteboard auto-open "may skip if something else is already on Bench". The open policy (A15) now switches the Bench for whiteboards and large widgets, and the line was corrected.
- Every tool that produces an object now names the same `bench_present present_object` path for moving it to the Bench.
- The skills reference each other consistently: `explanatory-drawing`, `interactive-pages`, `whiteboard-authoring`, `teach-chemistry`.

**Browser-hosted pages** are not possible yet. `/api` routes require basic auth in the desktop app (`packages/buddy/src/app.ts`), and the Browser can't open `file:` paths. The user chose to keep widgets for now; the gap is recorded in problem.md under Known issues.

**Rebase.** The branch had no commits of its own. It was fast-forwarded from `2338887f9` to `origin/main` `aededefc9` (#96 Buddy Help refresh, #97 Notes, #98 web HMR).
- The staged snapshot, the unstaged edits, and the untracked files were carried over with `git stash push --include-untracked` and `git stash pop --index`.
- Four files overlapped with upstream: `bench/tools/read-context.ts`, `buddy-help/SKILL.md`, `buddy-help/references/workspace.md`, and `web/src/i18n/en.ts`. All merged cleanly, and each now differs from the new base only by our change.
- Backups of all three layers are kept in the session scratchpad (`rebase-backup/`).

**Verification after the rebase:**
- `bun lint` passes, with 17 bundled skill registrations.
- `bun typecheck` passes.
- 101 focused tests pass across 14 files: skill registration, tool visibility, command transcript, persona prompts and permissions, tool schemas, runtime context, Bench present, read, and turn context, Browser open, external file permissions, `present_media`, and HTML widgets.

## L. First live session on the branch: routing did not fire (2026-09-24)

Session `ses_f2c36268dffep0DBOtziwfplQA`, "Understanding neural networks". GPT-6 Sol through the user's ChatGPT sign-in, in the `buddy` persona. The rows were read from the dev `opencode.db` (read-only). The saved trace recorded 0 messages, so it is not usable evidence.

**The new prompts were live.** At the time of the session, the built backend contained "Teach with the whole room", the Bench tab-jobs paragraph, and "Choose the teaching move". The `explanatory-drawing` and `interactive-pages` skills loaded in this session. The materialized `teaching-models` copy in `~/.buddy/skills/.system` matches the repo.

**Delivery is not the cause.** OpenCode sends the persona prompt to OpenAI OAuth models as the top-level `instructions` (`vendor/opencode/.../session/llm/request.ts:99`). It is not demoted.

What happened, turn by turn:

| User | Buddy did | Expected by `routing-model.md` |
|---|---|---|
| "help me understand neural netwroks" | Loaded `teaching-models`, then read `direct-instruction.md` (a long theory reference). Replied in text only; the one "picture" was a bolded text arrow. Ended with a menu question. | Draw the structure; finish, then check |
| "sure" | Numeric table plus an equation | Fine |
| "hwo to bild one" | PyTorch XOR code inline | Fine |
| "help me undsrantd architectuer" | Loaded `teaching-models` again, then read `advance-organizer.md`. Replied with an ASCII `text` block, `2 → 4 → 1`. | Advance organizer = "a compact overview kept within reach" = a board or Bench tab |
| "i can't imagine it" | Loaded `teaching-models` and `explanatory-drawing`. Drew an inline freeform SVG (good quality). | This should have been turn 1 or 4, unprompted |
| "can you make this interactive" | Loaded `interactive-pages` and `explanatory-drawing`, wrote `neural-network-explorer.html` into the notebook root, then presented it as a `standard_16_10` widget. The only action was toggling the 0/1 inputs, with fixed weights. | A meaningful variable to act on (weights, hidden units, the decision boundary) |
| "how isthat interactive" | Conceded it was limited | — |

The whiteboard was never considered. The only Bench use was the widget's auto-open.

Diagnosis:

1. **The visual guidance is written as a brake.** It opens with "most of the time you talk". Its first question, "Are words enough?", is judged by the model itself, and it says "stop as soon as one decides the matter", "show something only when it does the job better than a sentence", and "don't add one to every turn". A text-trained model settles each judgment call toward text. "Build a structure up while you explain it when the learner is meeting it for the first time" sits in question 5, which is never reached.
2. **The turn is actually run by `teaching-models`, which has no representation step.** It loaded at every new topic. Its Workflow goes diagnose → router → read reference → "continue teaching following Output Default". The "What the Learner Sees" table sits at line 248 and is not a workflow step. The reference files the model reads next (e.g. `direct-instruction.md`) say nothing about pictures near the top.
3. **The board is four decisions deep and carries a toll.** Show something → put it on the Bench → choose the whiteboard → load `whiteboard-authoring` (57 KB, about 14k tokens) → learn the format → draw. A freeform SVG is one call, so when the model finally drew, it drew that.
4. **The rules that did fire were concrete and local.** Once asked, the model loaded the right skill and produced a competent figure. Capability is not the gap; initiative is.

Implication: judgment-based routing in the always-on prompt does not produce proactive visuals, even on a frontier model. The default has to be set by structure (the workflow the model actually follows, the cost of the board, or the app itself), not by a question the model answers for itself.

**Fix applied (third pass, same day):**
- `shared/teaching-plan.p.md` is rendered into both teaching personas under "## Teaching".
- `visual-guidance.p.md` was rewritten as "Show the idea", with showing structure as the default.
- In `teaching-models`, workflow step 5 now returns to the plan, the "What the Learner Sees" table was folded into a `Learner sees` line in each router entry (sharpened for direct instruction and the advance organizer), and each of the 10 reference files opens with an "In Buddy" note carrying that line. This targets recency: the reference is the last thing the model reads before it writes.
- The Skills section of `product.p.md` says teaching skills inform the plan rather than run the turn.
- Not changed yet: the 57 KB `whiteboard-authoring` load before the first board call (cause 3); an app-opened board. Both are the next levers if replay #16 in `evals.md` still falls back to text.


---

## M. Eval frameworks: adopt one or keep the in-app runner? (2026-09-25)

**M1 · Anthropic, "Demystifying evals for AI agents"** (anthropic.com/engineering/demystifying-evals-for-ai-agents) · `finding`
- Vocabulary: a *task* has inputs and success criteria; a *trial* is one attempt; a *grader* scores one aspect; a *transcript* is the full record; the *outcome* is the final environment state; the *evaluation harness* runs tasks end to end and aggregates.
- Frameworks named: Harbor, Braintrust, LangSmith, Langfuse, Arize/Phoenix. Advice: frameworks are "only as good as the eval tasks you run through them"; pick one that fits the workflow and put the effort into the tasks.
- Conversational agents usually need a second model playing the user (τ2-Bench).
- Graders come in three kinds: code (cheap, reproducible), model (flexible), and human (the reference). Model rubrics must be calibrated against human judgment. Reading transcripts is how you find out whether the graders work.

**M2 · Promptfoo simulated user** (promptfoo.dev/docs/providers/simulated-user) · `finding`
- `stateful: true` sends only the latest user message and lets the target hold history, which suits Buddy's sessions.
- The docs say the user is played by Promptfoo's hosted conversation models and don't mention substituting another provider.
- Assumes the target accepts OpenAI chat format. Stops at `maxTurns` or when the user says `###STOP###`.
- Promptfoo runs from Node/CLI; a custom JS provider is the integration point.

**M3 · Fit with Buddy's harness** · `analysis`
- The harness itself can't come from a framework: Bench context exists only in the renderer (H4), and frameworks run from a terminal and call an API. Adopting one means a bridge from the Node runner to the open window, for example through the Vite dev server's websocket.
- Our learner (and any model grader) runs through Buddy's own backend on the free models chosen in the tab; a framework's judges and simulated user need their own provider keys or hosted models.
- The rest of our design already has the standard shape: cases = tasks, runs per case = trials, turn records = transcripts, checks = code graders, "review" = human graders. What's missing compared with a framework is saved runs, comparing runs, and model graders.

**M4 · Promptfoo OpenCode SDK provider and model-graded rubrics** (promptfoo.dev/docs/providers/opencode-sdk, …/model-graded/llm-rubric) · `finding`
- The OpenCode SDK provider can target a running server (`baseUrl`) and select `agent`, `provider_id`/`model`, `variant` (effort), `working_dir`, `session_id`, and `persist_sessions`.
- Skill invocations come back in `response.metadata.skillCalls` (read from the session's message history) so assertions can check them.
- The docs don't mention combining it with the simulated-user provider.
- `llm-rubric` returns `{pass, score, reason}`, and the grader can be overridden per assertion.
- Buddy's server has its own session routes (`routes/session.ts`, including `/:sessionID/prompt_async`) and accepts both `x-buddy-directory` and `x-opencode-directory` (`http/directory.ts:42`). Whether the OpenCode SDK client works against it unchanged is **untested**.
- Where it would fit: a fast headless check of the *first* decision on an empty Bench (the turn-1 routing failure in L), side-by-side prompt versions via two backends, a results viewer, and rubric graders. It can't see the Bench, so it doesn't replace the in-app runner (H4). Any spike must use a backend with temporary data roots (AGENTS.md local-state rule).

**M5 · What the in-app runner "sees" (verified in code)** · `fact`
- The runner doesn't look at pixels. Checks read tool calls only: `usesWhiteboardBy` looks for `whiteboard_create_view` in a turn's tools, and `extendsWhiteboard` counts turns with a board tool (`web/src/lib/evals/teaching-evals.ts:234`). The learner gets a one-line text description of each visual. Nothing judges drawing quality.
- What the window adds: the whiteboard tool waits up to 4 s for the renderer to report measured layout (`RENDER_REPORT_WAIT_TIMEOUT_MS`, `whiteboard/service/store.ts:56`). It returns the issues (text too small, text overflow, occlusion, sibling collision) and allows one repair call (`whiteboard/tools/create-view.ts:311`). Headless, no report arrives, so that feedback loop never runs. Per-turn Bench context is also real only in the window (H4).
- Ways to judge quality: per-turn screenshots (`capturePage`, H4), recording the renderer's layout issues from the tool output as a deterministic check, and a vision-capable grader.

---

## N. Convergence: defining what Buddy should do (from 2026-09-28)

This effort spans several sessions. The three editing passes (J, K, L) moved in many directions without an agreed end state, so no fix could be judged. From here the order is:

1. Define the expected behaviour for each area, one question at a time.
2. Lock the invariants.
3. Triage the branch against them.
4. Evaluate the whole system.

Every answer is recorded below as an N entry. A later N entry supersedes an earlier one, and also supersedes anything in sections A–M it contradicts.

**N0 · Method and working agreements** · `locked` (2026-09-28)

*The user's framing, at the start of the 2026-09-28 session.*
- The branch has gone in many directions trying to fix things. None of those fixes can work until the direction is defined: what behaviour we expect from each part of Buddy.
- The user can answer some questions directly. Others need research, and the deep-research reports in `docs/sources/` came out of that kind of research.
- **The sequence:**
  1. Define the expected behaviour.
  2. Fix the invariants and lock them as done.
  3. Evaluate the whole system and improve it.
- Locking down what we want counts as a successful session, even if nothing ships.

*The session objective (the user, 2026-09-28).* By the end of the convergence work, every change in the working tree has a direction. A direction can be:
- keep it as it is;
- change it in a stated way;
- revert it;
- do more research first;
- or it is already covered elsewhere.

Every change must have one. The inventory and directions are in section P.

*Process.*
- No new prompt fixes until the expected behaviour for an area is locked.
- **Questions go to the user one at a time.** Each question:
  - carries the context needed to answer it;
  - may be multiple choice, checkbox, or open;
  - can be answered, changed, or marked for research by the user.
- **Decisions live only in this ledger, section N.**
  - A later entry supersedes an earlier one. The earlier entry is tagged `superseded by <id>`, not deleted.
  - A separate `expected-behavior.md` spec was proposed and dropped, so each decision has one home.
- **Entries must stand alone.** Future agents won't have the session transcript. Each entry records the question, the user's reasoning, and the consequences.
- How the system works is recorded in [system-map.md](system-map.md). Read it before asking about behaviour.

*How to ask. Lessons from the user's corrections on 2026-09-28; each rule names the question it came from.*
1. **Understand the system first.**
   - A question about when Buddy should switch into teaching was rejected: the explicit persona choice already answers it (N1).
   - A question framing skills as "optional or mandatory" was rejected, because skills trigger from their descriptions (N6).
2. **Ask about how Buddy responds to what the user says** (prompt-level behaviour), not about UI. A question about whether Buddy should announce Bench changes was rejected as a UI question outside this effort.
3. **Don't ask how Buddy should teach.** How big a lesson turn is, rhythm, and so on are the model's call (N3). A question about how much the first lesson reply should cover was rejected on these grounds.
4. **Don't ask about behaviour any capable model already gets right** (N4). A checklist of "use the medium asked for / honor opt-outs / answer plain facts plainly" was rejected as obvious.
5. **Don't add opinions or evals the user never asked for.** The question-ending checks are the example (N10).
6. **Rank questions by ease × impact × risk, easiest high-impact questions first**, to build momentum.
7. **Draw examples from many subjects.** Repeated CNN examples were called out as overfitting. The CNN is a motivating case, not the reference.
8. **Put the details in the scratchpad and ask with the question tool** (the user's pattern, 2026-09-28).
   - Write the details of the current question into [question-scratchpad.md](question-scratchpad.md). Do not open the file for the user; they look at it when they choose. The file holds only the current question and must always stay **under 200 words**: short lists, no essays (the user, 2026-09-28). The answers live in the ledger, not there.
   - Then ask with the question tool: a one-line question and short options.
   - The reasons, from two screenshots: text written before a tool call is collapsed into a one-line summary row in the user's UI (T3 Code), and a long question inside the tool renders as a wall of text.

   This supersedes three earlier notes on the same point.
9. **When the user asks to read a file:**
   - open it in their default Markdown editor with `open -a MarkEdit <file>`, but only when they ask;
   - give line numbers;
   - quote short samples in the chat text before the question.

   Don't ask the user to go through many files.
10. **If the user doesn't know the effect of an option, don't press.** Record the default that follows from the locked entries, and send the question to eval.
11. **Ask about principles, never about wording** (the user, 2026-09-28: "how am I supposed to decide the exact wording without evaluating and having a base principle"). The order is:
    1. settle a principle with the user;
    2. apply it to the wording yourself;
    3. confirm the wording by eval.

    When a locked principle already covers a line, apply it and record the direction; don't ask. Ask only when no principle covers the case.
12. **One item per question, in plain words.**
    - Never bundle several items into one question or one scratchpad. A "what next?" that listed nine P rows was rejected.
    - Never use internal labels (P29, "trace route", "stray line") without saying in plain words what the thing is and why it matters. The user needs to understand an item before deciding on it.
13. **Ask only about unlocked decisions on how Buddy behaves.** (The user, 2026-09-28, angry: "I am asking you on locking the decisions of things we have not already locked… why are you distracting me with these mechanical changes? These can be fixed later.")
    - Don't ask about mechanical, out-of-scope, or text-choice changes. Examples: whether to keep or revert a rewrite, a stray line, code tidy-ups.
    - Record them in section P as `later` (or with the default that follows from the locked entries), and move on.
    - The trigger was a question about restoring `main`'s teacher-persona text, which had been rewritten in the pre-effort restructure.

*Agenda.*
- **Superseded:** the original eight-area Part 1 agenda (mode, turn shape, whether to show, find or make, placement, instrument, across turns, personas). After N3 and N4, Part 1 no longer defines teaching behaviour.
- **Current agenda:**
  - **Part 1:** Buddy-specific, risky behaviours (the question queue below) and the split of tool guidance (N12, N13), reviewed tool by tool.
  - **Part 2:** where each behaviour lives (persona prompt, feature prompt, tool description, skill, prelude, or app code; [system-map.md](system-map.md) §5).
  - **Part 3:** triage the branch's changes against the locked entries.
  - **Part 4:** rebuild the evals (N11) and evaluate the whole system.

**N1 · The persona is the mode switch** · `locked` (2026-09-28)
- **Fact** (see [system-map.md](system-map.md) §1):
  - The user chooses Learn or Teach at onboarding and can change it in Settings. That choice selects `buddy` or `teaching-buddy`.
  - The composer's persona picker, and the `code` persona, exist only in development builds.
- **Decision:** Buddy does not detect learning intent inside a persona. The user's persona choice is the declaration. In `buddy`, the user is a learner. In `teaching-buddy`, the user is an educator.
- **This supersedes** the intent gate in `shared/teaching-plan.p.md` ("When someone wants to understand or get better at something…") as the switch between teaching and answering. The question that remains inside a persona is how large the response should be, not whether to teach.

**N2 · In the Learn persona, reply size scales with the ask** · `superseded by N3` (2026-09-28): how big a reply is, and whether it grows into a lesson, is for the model to decide
- The wording of the request sets the size of the reply.
- **A quick question** ("What's X?", "Compare X and Y", "Is it true that…?") gets a short, direct answer with at most one inline visual. The Bench stays closed.
- **A request to learn** ("help me understand", "teach me", "walk me through", "how does X work", "explain X") starts a lesson. What a lesson shows, and where, is decided in the later entries on showing, placement, and instrument.
- **A short answer grows into a lesson** when the learner follows up, asks to go deeper, or shows confusion.
- **Known risk:** this depends on Buddy judging the wording, and ledger L showed that Buddy's judgment calls lean toward text. The evals must cover both sides: lesson requests that have to produce a lesson, and quick questions that must not.
- Consistent with yardstick prompts #1, #2, #12, and #16 in [evals.md](evals.md).

**N3 · Buddy is an unopinionated teacher** · `locked` (2026-09-28, the user's direction)
- **For now, Buddy is a capable teacher with good teaching tools.** The model decides how to teach:
  - whether to show anything, and what;
  - inline or on the Bench;
  - how much to cover per reply;
  - when to check understanding;
  - how a lesson unfolds.
- We do not encode our own version of best teaching as rules.
- **Why:**
  - Prescribing behaviour for every kind of request overfits to whatever the user or an agent happened to think of, and it doesn't make a better teacher.
  - It also limits stronger models, because it caps them at our idea of good teaching.
- **What we still own is decided next.** The next question sorts which layers remain ours, for example accurate knowledge of the room (what each surface and tool does), product rules, and optional craft skills.
- **In conflict with N3.** To be resolved in Part 3 triage (not deleted yet):
  - `routing-model.md` as a prescriptive contract;
  - the `shared/teaching-plan.p.md` algorithm and the L decision that "the system prompt owns one teaching algorithm";
  - the defaults in `shared/visual-guidance.p.md` ("Show the idea");
  - the rhythm rule in ledger I ("finish, then check");
  - the procedures for pacing and hand-back in `teaching-models` and `whiteboard-authoring`;
  - the behaviour-specific rubric and yardstick in `evals.md`.
- **Supersedes** N2, and the "Rhythm" decision in section I as a rule Buddy is told to follow.
- **Method note:** questions in this process stay at the level of the product and the system. Examples span subjects, and no single example (such as the CNN) is the reference case.

**N4 · Define only what is Buddy-specific and risky** · `locked` (2026-09-28)
- **Nothing is defined for behaviour a capable model already gets right.** No rule and no eval for:
  - using the medium the learner asked for;
  - honoring an opt-out;
  - answering a plain fact plainly;
  - general conversational sense.
- **Questions are ranked by ease × impact × risk.** Risk means how likely it is that Buddy's own prompts, tools, or skills push the model away from what it would do well unaided.

**N5 · Small talk stays small talk** · `locked` (2026-09-28), eval needed
- "hey, how's it going?" gets a short, natural reply: no tools, no visuals, no steering toward a lesson.
- **Why it needs an eval:** Buddy's teaching-heavy system prompt is the risk. It could turn casual turns into lessons.

**Question queue** (ranked by ease × impact × risk; update as answers arrive):
1. ~~**When should `teaching-models` trigger?**~~ Answered by N7.
   - Its description currently fires at the start of every session and whenever the learner is stuck.
   - In L, it loaded at every new topic and decided the move each time.
2. ~~**Concise responses on:** what the setting means.~~ Answered by N9.
3. ~~**Endings.**~~ Answered by N10.
4. ~~**Something already on the Bench.**~~ Closed by N18: it is the model's call under N3.
5. ~~**Unprompted showing.**~~ Reframed by N12. The question is where each piece of information lives, not whether the persona tells Buddy to show things.
6. ~~**Choosing a method for the split in N12.**~~ Answered by N13. The study itself is section O.

**N6 · Skills are specified by when they trigger** · `locked` (2026-09-28)
- Every skill description is in the system prompt, and the model loads a skill when the situation matches the description. That is how skill triggering works.
- "Optional or mandatory" is therefore not a design choice.
- A skill's expected behaviour is stated as "in situation S, skill X loads (or doesn't)". It is measured from session traces, and the lever is the skill's description.

**N7 · `teaching-models` is a vocabulary of proven methods, not a controller** · `locked` (2026-09-28)
- **When it loads:**
  - when Buddy is unsure how best to teach something;
  - as a fallback when one method is failing and another might work.
- **What it is for:** teaching has only a few proven methods. Naming them, and saying when each fits, gives the agent a vocabulary to choose from. The skill is brainstorming help, drawn from the established methods a teacher would use for a subject or topic.
- **Requirements:**
  - **It routes without favouring one method.** The same model must not win every time, and no method may be favoured by being longer or more prominent than the others.
  - **Buddy may choose none.** If no method fits, Buddy teaches without one. That is the agent's call.
- **Measured by:**
  - it loads on uncertainty or failure, not on every new topic;
  - across varied subjects and learners, the methods chosen vary;
  - straightforward teaching turns proceed without it.
- **Supersedes** the current description's "at session start" trigger. It also supersedes the workflow steps that require reading a reference and returning to the teaching plan (the plan itself is under review by N3).
- **Fact (2026-09-28):** the 10 reference files are fairly balanced, at 2.7k–4.0k words each. The 10 router entries in `SKILL.md` are about the same size.

**N8 · No sibling is favoured by size or prominence** · `locked` (2026-09-28), derived from the user's statement of why this branch exists
- The branch began because Buddy overfit to Mermaid. Mermaid had the largest description, and so it was treated as the preferred diagram.
- **Rule:** among options that compete for the same job (visual tools, teaching methods, skills), none gets more weight because of how long or prominent its description is. Descriptions say what each one does and what it fits, at comparable weight.
- **Measured by:** across varied requests, the choice of sibling varies with the request, rather than one sibling dominating.

**N9 · Concise responses are about digestibility** · `locked` (2026-09-28, the user's statement of intent)
- **Purpose.** Agents read a lot: books, tool results, searches. Their replies tend to grow with how much they took in, not with how much a person can digest in one turn. Many models over-explain and aim for a *complete* output rather than a *digestible* one. With concise responses on (the default), the reply should be sized to what the learner can take in and act on from one message, in proportion to the question and not to the input. Bullets and structure are fine. A 300-word reply to a single simple question is not.
- **Failure on `main`:** the WhatsApp prompt (1–4 sentences, about 15–60 words). It mostly worked but overfit. Big questions got about 50 words. "Can you explain Dostoevsky's philosophy?" may need about 200 words, a heavy distillation, but still more than 50.
- **Failure on this branch:** `concise-response-preference.p.md` sets no limits and no boundaries. With concise mode on, simple questions can still get long replies because the model took in a lot.
- **Expected behaviour (concise on):**
  - A simple question gets a short reply, even straight after a large ingestion or many tool calls.
  - A big question gets a proportionate distillation (Dostoevsky: about 200 words, not 50 and not 1,000).
  - The requested scope is never dropped.
- **Concise off:** the model's natural length.
- **The setting stays** (the user declined "drop the setting").
- **Fact: a regression on this branch.** The staged diff removed the "Long Response Caution" that `reading/tools/ingest-full-text.ts` added to the ingestion result whenever concise mode was on. It existed because reading a book made Buddy produce huge replies. The branch also changed the tests in `ingest-full-text-plugin.test.ts` to expect it to be gone. It has to be restored or replaced in triage. Its old wording ("1-4 sentences, ~15-60 words… WhatsApp-style") carries the overfitting from `main` and needs new wording.
- **Open for Part 2:** what form the boundary takes. Candidates: soft length ranges scaled to the size of the question, or a digestibility rule with contrasting examples. Either way it must bound replies without the hard cap from `main`.
- **Evals:**
  - a simple question after a large ingestion (short);
  - a big conceptual question (proportionate);
  - a casual turn (short).

**N10 · How a reply ends is not defined** · `locked` (2026-09-28)
- Ending in a question is not required. Ending without one is not required either. No behaviour is defined and there is no eval for it.
- **Not requested:** the ending checks in `web/src/lib/evals/teaching-evals.ts` were never asked for (`finishesWithoutQuestion`, `questionEndingsAtMost`). Neither was the "Rhythm" row of the `evals.md` rubric. Remove them in Part 4.
- **Where the habit came from:** Buddy ended replies with questions reflexively because of the check-for-understanding line in the system prompt. The user wanted to reduce that. The fix is to remove the cause in triage (principle 16 in `shared/teaching.p.md` and the related lines), not to add a rule against questions.

**N11 · Teaching is judged by outcome and quality, not by the steps Buddy took** · `locked` (2026-09-28)
- **Deterministic checks are the weakest fit for teaching.** Quality will be judged by an LLM judge, or by a human, using a rubric. The LLM judge is calibrated against the user's own judgement.
- **Code checks are used only for facts they can verify.** For example:
  - a skill loaded;
  - no tool was called on small talk;
  - reply length under concise mode.
- Aggregate trace metrics across many runs are also fine, such as whether choices between siblings vary (N7, N8).
- No pass/fail check on a specific tool sequence.
- **Source:** Anthropic, "Demystifying evals for AI agents" (read 2026-09-28):
  - "There is a common instinct to check that agents followed very specific steps like a sequence of tool calls in the right order. We've found this approach too rigid and results in overly brittle tests… it's often better to grade what the agent produced, not the path it took."
  - Code graders are "brittle to valid variations" and "lacking in nuance".
  - Model graders "handle open-ended tasks" but "should be closely calibrated with human experts".
  - For conversational agents, "the quality of the interaction itself is part of what you're evaluating."
  - "A good task is one where two domain experts would independently reach the same pass/fail verdict."
  - "20-50 simple tasks drawn from real failures is a great start."
  - "We do not take eval scores at face value until someone digs into the details of the eval and reads some transcripts."
- **Supersedes:**
  - the deterministic checks in `teaching-evals.ts` as the main grader (the in-app runner stays; its graders change in Part 4);
  - the behaviour-specific rubric in `evals.md`;
  - the N0 wording "two people grading the same transcript would agree". That still holds for rubric items, but those items describe the quality of the outcome, not the steps.

**N12 · Tools own their use; the system prompt only points** · `locked` as the user's working theory (2026-09-28)
- **A tool owns its own usage guidance:** when to use it, how, why, and when not to. The tool description and the parameter schema carry this, which keeps tools pluggable.
- **The system prompt may point toward a tool, but must not define its usage.** It may say "use Mermaid for…"-level pointers. It must not restate a tool's when, why, or how, because that overfits and breaks pluggability.
- **The system prompt stays stable** for prompt caching. It isn't edited ad hoc when tools come and go.
  - A brief mention of a tool that isn't available is tolerable, because the model understands the tool is absent.
  - A full description of an absent tool in the system prompt is not tolerable, because the model may then look for another way to do the same thing.
- **Supersedes, in part, problem.md principle 3** ("The system prompt does not name tools"). A brief pointer is allowed. Defining usage is not.
- **Open:** the exact split between system prompt, tool description, and parameter descriptions. There are three ways to settle it:
  1. First principles (the user's stance: an unopinionated system prompt, pluggable tools);
  2. analogy: how frontier products split this in `~/Code/CL4R1T4S` (and the agent sources in `~/Code/agentic`), including how much the system prompt steers tools and how they handle tools that may be absent;
  3. deciding by eval.

  The user has stated the intent but has not chosen a method.

**N13 · The split is settled by analogy, then eval** · `locked` (2026-09-28)
- **Step 1, analogy.** Study how frontier products and open agents divide tool guidance between the system prompt, the tool description, and the parameter descriptions. Record the findings in section O.
- **Step 2, propose.** Draw up a split for Buddy that satisfies N3, N8, and N12.
- **Step 3, eval.** Confirm the split with the rebuilt graders (N11).

**N14 · The teaching plan leaves the persona prompt, and is archived** · `locked` (2026-09-28)
- **What it was.** `shared/teaching-plan.p.md` was added in pass 3 after session L. Both teaching personas rendered it under "## Teaching". It is a four-part algorithm that Buddy must settle before any teaching reply:
  1. where the learner is;
  2. the teaching move;
  3. what the learner will see ("when the idea has structure, show it… build it on the whiteboard");
  4. what the learner will do ("finish an explanation before checking it").

  It also said teaching skills inform the plan and never replace it.
- **Decision.** Remove it from the persona prompt now. It is too rigid, and by N3 it should not exist. A verbatim copy is kept at [archive/teaching-plan.p.md](archive/teaching-plan.p.md).
- **The user's uncertainty, recorded as an open question.** The plan may be too restrictive for strong models and yet needed by weaker ones. In an earlier conversation, Claude made reasonable arguments that structure of this kind is part of how good teaching (and Claude's own teaching skill) works. Possible homes if it returns:
  - a skill;
  - a "strict teaching mode" that is switched on deliberately;
  - scaffolding used only for weaker models.
- **How to settle it.** A human check. Compare transcripts with and without the plan, on both stronger and weaker models, in Part 4.
- **Consequence for Part 4.** Evals must span model strengths, not only one frontier model. N3's "for now" may turn out to depend on the model.

**N15 · The teaching principles are Buddy's teaching constitution** · `locked` (2026-09-28)
- **Intent (the user).** Principles 1–15 in `shared/teaching.p.md` are meant as a constitution for teaching, "like the Declaration of Independence", with amendments over time. They set Buddy's core values as a teacher. They are not procedures. That is why they stay despite N3, which is about not prescribing how to teach move by move.
- **Provenance (recorded at the user's request).**
  - The user distilled the principles from the teaching books in `~/Code/resources`: books, parsed chapters, and distillations. Search Calibre first; see its `AGENTS.md`.
  - The text points mainly to Ken Bain, *What the Best College Teachers Do* (`~/Code/resources/books/What the Best College Teachers Do - Bain`). It mentions Saari, "Who gives a damn?", the "natural critical learning environment", and stereotype threat.
  - Bain's *What the Best College Students Do* and *Super Courses* sit alongside it.
  - No written distillation artifact for the principles was found in `~/Code/resources/distilled` (checked 2026-09-28).
  - The text first entered the repo in `ec3944f72a` (2026-04-14, "add reading-buddy persona…").
- **Decision:**
  - Keep principles 1–15 (lines 3–31) for now.
  - Remove principle 16 (lines 33–48, "Check understanding when the evidence will guide your next teaching move"). Its predecessor on `main` ("Check for Understanding… Check after key concepts and before advancing") caused the reflexive question endings (N10).
- **Watch after removal.** Line 42, inside principle 16, held the only guardrail on OpenCode's blocking `question` tool: "Use the `question` tool only when a verbal answer is the most useful way to gather that evidence" (A24). Watch for overuse of the `question` tool in evals. Restore a one-line guardrail if it appears.
- **Open, by analogy then eval (the N13 method).**
  - Study how other agents state their principles: coding agents' "how you work" sections, published model constitutions and specs.
  - Decide whether Buddy's principles are the right ones and in the right form, and whether more research is needed.
  - The user built them from first principles and is not sure they are correct.

**N16 · The "Learner sees" lines in `teaching-models`: default by N3, settle by eval** · `locked` (2026-09-28)

**What they are.** Pass 3 added them after session L to push Buddy toward drawing. They are:
- step 5 of the workflow (line 16): "Return to your teaching plan. Use the model's `Learner sees` line to decide what the learner sees and where…";
- an intro at line 59;
- one "Learner sees" line per model, at lines 74, 95, 116, 137, 158, 179, 200, 221, 242, and 263;
- an "In Buddy" note at the top of each of the 10 reference files.

The per-model lines mix two kinds of content:
- *method-intrinsic*. Concept attainment: "Examples and non-examples side by side, arranged so the deciding feature can be spotted."
- *Buddy placement*. Direct instruction: "built on the whiteboard as you explain when the structure is new to them, or one inline picture when a glance is enough." Advance organizer: "on the Bench, usually a whiteboard frame".

**The user's answer:** "I do not know what the effects of this are." The lines have never been run, so there is no evidence.

**Direction:**
- Remove the plumbing (step 5, line 59, and the "In Buddy" notes), because it points to the teaching plan removed by N14.
- Default the per-model lines to the method-only version: keep what the method needs, and strip whiteboard, Bench, and inline. This is what N3 already implies, since placement is the model's call.
- In Part 4, compare with and without the lines. The comparison checks whether dropping the placement lines brings back the text-only failure seen in L.

**N17 · "Facts in the system prompt, opinions in skills" is rejected** · `locked` (2026-09-28)
- **The idea.** The user floated it while deciding P18 as a way to sort content between layers.
- **Why it was rejected.** The user: the whole system prompt is opinion. Choosing what to say at all is an opinion, so "fact versus opinion" can't sort content between layers.
- **The real criterion for P18 and similar lines is N3.** Does a line decide something N3 leaves to the model (whether to show, placement, pacing, how a lesson uses tabs)? Or does it describe how a capability behaves, so the model can decide?
- **Process lesson.** The P18 question was first framed as "facts versus opinions". That label was imprecise and wasted the user's time. Frame each triage question by the locked entry it tests.

**N18 · Principles first; wording follows and is settled by eval** · `locked` (2026-09-28)
- **The user:** "Aren't we talking principles here first? How am I supposed to decide the exact wording without evaluating and having a base principle for something?"
- **Rule:**
  - User decisions are about principles.
  - When a locked principle covers a line, the agent applies it and records the direction without asking.
  - Wording that no principle settles is decided by eval, not by the user choosing between phrasings.
- **Applied the same day:**
  - P18: N3 removes the four teaching-choice lines from the Bench prompt.
  - P11: the form of the concision boundary goes to eval.
  - P7 and P30: defaults recorded, which the user can override.
- **The question queue's item 4** (does a follow-up build on what's already on the Bench) is closed by N3 and P18. It is the model's call, informed by the description of how the Bench behaves.

**N19 · This branch is prompt engineering; code changes are out of scope for now** · `locked` (2026-09-28)
- **The user:** "We are on the prompt engineering branch. We have to prompt engineer."
- **Out of scope in these sessions.** Don't raise or execute non-prompt changes. That means P5, P6, P9, P28–P33: the trace route (including its security issue, still recorded in P29), the eval runner code, DevTools, the skill validator, docs cleanups, and test churn. They keep their recorded directions for later.
- **The working question.** Does every *prompt* change on the branch have a direction concrete enough to edit it correctly? That audit is section Q.

**N20 · Whiteboard versus Mermaid: route by teaching purpose, not by kind of diagram** · the user's position is `locked` (2026-09-28); its proposed routing is `superseded by N22`

*The user's position.* They gave it to an earlier agent, but it was never recorded, so it is written down here.
- Anything Mermaid can draw, the whiteboard can draw too. The whiteboard also handles sketches, architecture diagrams, layers, spaces, "a pelican". So the two **cannot be told apart by the kind of diagram**.
- The routing must come from the deep research. It decides where iterative, built-up teaching (the whiteboard) is best, and where a quick Mermaid diagram does the job.
- Forcing an idea into Mermaid when it doesn't render well in Mermaid is also wrong.
- This supersedes shape-based routing *between the whiteboard and Mermaid*: option B, and the shape half of option C, in the question log. It also supersedes the whiteboard description's shape bullets ("position carries meaning and needs deliberate layout", "mixes notations") as reasons to choose the *board*.

*What the deep research says* (`docs/sources/`):
- **Report 7 (whiteboard).** "The key branch is **process versus product**."
  - Use the board "when the instructional value comes from construction, sequencing, adaptation, or shared student thinking".
  - Use a prepared display "when the value comes from precision, permanence, density, or advance preparation".
  - Switch *to* the board, triggered by an event rather than by the clock, when:
    1. the learner needs to see a reasoning sequence unfold;
    2. the explanation must adapt to the learner's question;
    3. a shared surface is needed to generate or compare thinking;
    4. a complex explanation must be segmented into states that stay visible.
  - Switch *away* from it for stable reference material, when a precise visual matters more than its construction, or for independent practice.
  - "Do not copy a slide onto the board merely to change media."
- **Report 6 (built, revised, or complete).**
  - Building progressively helps "when the unfolding itself guides attention and coordinates the visual with the explanation". The gain is mainly for learners with little prior knowledge; experts gain little (Fiorella & Mayer 2016; Tian et al. 2025).
  - Merely animating the appearance does not help.
  - A complete diagram is best when the learner must reason repeatedly over a stable configuration, especially to predict (Hegarty et al. 2003).
  - Revision helps when the learner externalizes a model and then compares it with a reference or gets feedback (Van Meter 2001, 2006).
- **Report 3 (static diagrams).** A finished diagram helps when it makes task-relevant structure visible: simplified, relational, parts together with causal steps, labels next to what they name.

*The routing this implies* (`proposed`):
1. **Whiteboard: the process is the teaching value.**
   - The structure is new to the learner, and building it alongside the explanation guides attention.
   - It will be extended or adapted as questions come.
   - The learner will add to it, predict on it, or correct it.
   - Intermediate steps must stay visible while later steps depend on them.
2. **A finished picture: the product is the teaching value.** The learner needs a stable, complete representation to look at once, consult, or reason over. The board adds nothing here ("don't copy a slide onto the board").
3. **Choosing among finished pictures:**
   - **Mermaid** only when its automatic layout renders the idea cleanly, which means graphs of connections or order.
   - Otherwise a freeform or constrained figure.

   This is where shape and rendering quality matter. They don't decide between the board and Mermaid.
4. **Prior knowledge shifts the balance.** Novices benefit more from a picture that is built. Knowledgeable learners are often fine with a finished one.

*The research's limits.*
- The studies involve human instructors, classrooms, and video lessons. Mapping "instructor hand-drawing" onto an agent drawing a board step by step is an adaptation.
- Report 6 found no benefit when a diagram merely appeared progressively without the drawing hand.

**N21 · Attempt to falsify the N20 routing** · `finding` (2026-09-28, done at the user's request before locking)

Sources:
- the deep-research reports in `docs/sources/`;
- the user's whiteboard distillations in `~/Code/resources/whiteboard/*.findings.mnd`, plus `digital-board-workflow.md`;
- Buddy's whiteboard renderer;
- the `explanatory-drawing` skill, which is uncommitted and draws on Roam and Tufte.

1. **Refined: the board is a record, not only a process.**
   - *The Teaching Gap* (Stigler & Hiebert; `the-teaching-gap.findings.mnd` §1.3): "Japanese teachers use visual aids … to provide a record of the problems and solution methods and principles that are discussed during the lesson." The board is built left to right, is not erased, and is complete at the end.
   - The U.S. pattern of revealing and erasing ("information of the moment") uses the same board with no such benefit.
   - "Teaching is a system… If all teachers in the United States started using the chalkboard… teaching would not change much" (§1.4, §2.3).
   - So "process versus product" is incomplete. The board earns its place as the lesson's **persistent, growing record**: steps that stay visible, several methods compared on one surface, and a whole to review at the end. That record is itself a product.
   - *Instruction: A Models Approach* (the Yes/No columns for concept attainment) and *Making Thinking Visible* (documenting thinking) point the same way.
2. **Agent-specific: a board drawn in one call may give no known benefit.**
   - Report 6: diagrams that appeared progressively *without the instructor's drawing hand* did not outperform already-drawn diagrams on transfer (Fiorella & Mayer 2016). The active ingredient is drawing coordinated with the narration of each step.
   - Buddy's whiteboard does stream elements as the tool input arrives (`web/src/components/whiteboard/whiteboard-progressive.ts`, presentation-only pacing). But one tool call draws the whole picture before any prose explains it.
   - So a one-call board is closest to "appeared without the hand": a slower finished picture.
   - The benefit needs **segmenting**: draw a piece, explain it, draw the next. That means several board calls with prose between them, within a turn or across turns.
3. **Holds: prior knowledge.** Novices gain from built pictures; knowledgeable learners gain little (report 6: Fiorella & Mayer 2016, experiment 1; Tian et al. 2025).
4. **Holds: don't copy a finished picture onto the board just to change medium.** Report 7 says this directly, and *The Teaching Gap* agrees ("feature swap").
5. **Refined: progressive reveal doesn't require drawing.** In *Making Thinking Visible*, the "Zoom In" routine reveals a *prepared* image in stages for inquiry ("each new part revealed should add significantly to the meaning"). Gradual disclosure is a technique, not a reason by itself to pick the board.
6. **Not falsified: Mermaid only when its layout renders cleanly.** No study contradicts this. It is a claim about rendering quality. `explanatory-drawing` says the same: "Diagrams where only the connections matter are laid out automatically by Mermaid and don't need hand composition."
7. **Observed cost, not evidence.** The board costs a skill load of about 7k words plus several calls. Mermaid is one call. That pushes the model toward the cheaper tool whatever the teaching need (L, cause 3). It is a balance problem of the N8 kind, measured in effort rather than description length.

**Revised routing** (`superseded by N22`):
1. **Whiteboard: the lesson needs a record that is built and kept.**
   - A structure new to the learner, built in explained segments.
   - A picture that is extended as questions come.
   - The learner adds to it, predicts on it, or corrects it.
   - Earlier steps must stay visible for later ones.
   - Several ideas or methods are compared on one surface.

   *Condition:* build it in segments, with explanation between the calls. A board drawn in one call has no evidence behind it.
2. **Finished picture:** a stable, complete picture that is not part of an ongoing record, whether looked at once, consulted, or reasoned over.
3. **Among finished pictures:** Mermaid when its automatic layout renders the idea cleanly; otherwise a figure.
4. **Prior knowledge:** novices lean toward a built picture, knowledgeable learners toward a finished one.

**N22 · Whiteboard versus Mermaid: three independent reasons for the board** · `locked` (2026-09-28; the user locked the combined routing below). Supersedes the proposed routings in N20 and N21

*The user.* They agree with the "record" finding from *The Teaching Gap* (N21), with a warning: an agent may overfit to "the board is for records". It would then pick Mermaid for simple things that a quick board sketch explains faster. So the board has **three reasons, and any one is enough**:
1. **The idea gains from iterative building.**
2. **It needs a durable artifact afterwards:** a record to keep, extend, or return to.
3. **Mermaid can't draw it:** unstructured, free drawing. Examples:
   - the actual layers of a CNN, a transformer, or a neural network, with neurons firing (not a flowchart of its data flow);
   - stick figures explaining a situation;
   - war maps;
   - positions.

   The visual skill (`explanatory-drawing`, distilled from Roam's *The Back of the Napkin*) exists for exactly this kind of drawing.
   - Some of these could also be widgets, but none can be Mermaid.
   - Routing by diagram type alone ("just locking at two diagrams") is rejected.

*Supporting facts.*
- **Mermaid's grammar is narrow (A21).** It expresses nodes and connections (flowchart, sequence, state, class, ER, mindmap), a timeline or gantt, and a few simple charts, all with automatic layout. Where something sits never carries meaning.
- **Roam's portrait and map frames need drawing by hand** (G1, `explanatory-drawing` §1).
- **Report 3** shows teaching diagrams where the spatial layout is the point, such as the simplified heart and mechanical parts with their causal steps.

*Combined routing* (`locked`):
- **Whiteboard when any of the following holds:**
  - **(a) Build.** The idea gains from being built in explained segments: a structure new to the learner, especially for novices (N21).
  - **(b) Keep.** It should stay as a record to extend, compare on, or come back to (N21, *The Teaching Gap*).
  - **(c) Free drawing.** It needs placement or pictures outside Mermaid's grammar: stick figures and scenes, maps and positions, layers and spatial arrangements, sketches mixed with labels and equations.

  **Exceptions:** exact geometry goes to the constrained figure; data or functions go to the calculator's plot; motion, or a variable the learner changes, goes to the widget.
- **Mermaid when all of the following hold:**
  - the meaning is only connections or order;
  - its automatic layout renders the idea cleanly;
  - none of (a), (b), or (c) applies.

  In other words, a quick finished diagram, read once.
- **Guarding against overfitting (N8).**
  - Each board reason stands on its own.
  - The examples in the tool descriptions must span all three reasons, including small, quick sketches, not only large lesson records.
  - The Mermaid description must not present Mermaid as the default diagram.

*Still open (the next sibling pairs).* Whiteboard versus freeform SVG figure: both draw freely. The likely line is a sketch that is kept or built versus a polished figure read once, inline (G5: a rough sketch often teaches better). Then whiteboard versus widget, for motion such as "neurons firing".

**N23 · Free drawing read once goes inline as a freeform SVG, not on the board** · `locked` (2026-09-28)
- **The case.** A picture outside Mermaid's grammar (N22 reason c) that is read once, with no build (a) and no keep (b). Example: while reading a book on the Bench, the learner asks "what does a synapse look like?"
- **Decision.** Use an inline freeform SVG figure. Use the board only when build (a) or keep (b) also applies.
- **Why:**
  - Things read once belong inline (C2).
  - A board auto-opens and takes the Bench over (A15). It would push the book the learner is reading off screen.
- **Refines N22.** Reason (c), free drawing, still rules Mermaid out. On its own, though, it no longer sends a picture to the board. The routing for free drawing:
  - built or kept → whiteboard;
  - read once → freeform SVG, inline.

  The worry in N22, that Buddy would force Mermaid onto simple drawings, is still covered, because Mermaid is excluded either way.
- **The freeform figure is judged by N8 balance as well.** Its description must not call it "a last resort", which is what `main`'s prompt said.

**N24 · Inline widgets and Browser artifacts: the direction for interactive content** · `locked` (2026-09-28, the user: "lock this in as a decision"; to ship by the end of this effort)
- **Widget:** always inline and always small. It never opens on the Bench.
- **Artifact:** anything bigger is an *artifact*, a full page presented in a Browser tab on the Bench rather than inline. Artifacts can be:
  - simulations;
  - games;
  - substantial authored pages;
  - "it can literally start up servers".
- **The model.** "Everything that is inline, a small thing, will be a widget; everything that is on the whole browser inside a tab would be an artifact." The user notes that Claude works the same way: inline widgets, and artifacts in their own tab.
- **Why:** it gives the agent far more room for interactive teaching, which also serves the user.
- **What has to change** (the user acknowledges all of it):
  - the skills (`interactive-pages`);
  - the tool descriptions (`present_html_widget`, `inapp_browser_open`);
  - the widget's behaviour (remove its Bench auto-open);
  - how artifacts are stored and served.
- **Supersedes:**
  - decision I "Widgets: small ones stay inline; larger presets still open on the Bench", and so the P21 direction: widgets become inline-only;
  - H1's "replace the widget tool with the web browser itself". The widget stays for small inline pieces, and the Browser hosts artifacts.
- **Known blocker (problem.md, Known issues).** The Browser can't open pages Buddy authors yet:
  - `inapp_browser_open` accepts only `http(s)` and localhost;
  - the widget runtime sits behind basic auth on the backend `/api`.

  Serving artifacts carries a trust decision, since pages would run outside the widget sandbox.
- **Still open.** When Buddy builds something interactive (a widget or an artifact) instead of a picture. The research (report 2) says interaction helps when the learner's action does a learning job:
  - pacing a process;
  - changing a variable;
  - predicting, then testing;
  - running contrasts.

  "A click whose only function is to reveal an outcome… adds little." The user has not decided this yet.

**N25 · Separate only the tools that are genuinely confusable; everything else stands alone** · `locked` (2026-09-28, the user's principle, confirmed by the audit below)
- **The user.** "Confusions only happen when things are actually supposed to be confused." Mermaid versus whiteboard is a real confusion point; widget versus image is not. Adding a "versus" for every pair means permutations across about 40 tools. The system might perform slightly better, but it becomes fragile, because every tool is linked to every other tool.
- **Where the habit came from.** OpenCode's descriptions separate tools that really overlap (bash, glob, grep, read, task). Buddy then drifted to a point where every description, and even the skills, carried such separations.
- **The audit** (2026-09-28): does the tool description name another tool?
  - **Codex Desktop, GPT-6 Sol** (`GPT-6-Sol_Tools.json`, 56 frontend tools). 11 descriptions name another tool, 11 references in all. Every one is a workflow dependency, such as `create_thread → list_projects` ("call list_projects before using project").
  - **claude.ai, Opus 5** (30 tools). 14 descriptions, 19 references. Almost all are within one family or are workflow steps: the `memory_*` tools pointing to each other, `view` ↔ `str_replace`, `create_file → str_replace/bash_tool`, `places_search ↔ places_map_display_v0`, `web_fetch → web_search`.
  - **OpenCode** (`vendor/.../tool/*.txt`). "Use X instead" appears only among the search tools that really overlap (grep, glob, read, task, and bash with `rg`), plus workflow steps ("use the Read tool first").
  - **Buddy** (the branch, 11 display tools). Nearly every visual tool names 3–5 visual siblings ("use Mermaid when…, the calculator for…, the whiteboard when…, an HTML widget when…"). The visual family is fully connected. In addition, 8 descriptions each repeat the `bench_present present_object` pointer, which the Bench feature prompt already states once. Skills also name tools: `teach-mathematics`, `teach-chemistry`, `reading`, `teaching-resource-authoring`, `find-indian-education-resources`, `whiteboard-authoring`.
- **Rule:**
  1. A tool description names another tool only when the two are genuinely confusable (a real overlap in what they do), or for a workflow dependency (call X first, take the id from X).
  2. Otherwise each description says what its own tool does and fits, and stands alone.
  3. Cross-tool facts that apply to many tools, such as moving an object to the Bench, live in one place: the Bench prompt or tool.
- **Supersedes** the pass-2 consistency sweep (ledger K), in which "every tool that produces an object now names the same `bench_present present_object` path". It also supersedes the "nearest alternative" column of the E3 checklist (section F) as a requirement for every tool.
- **Next.** Settle which pairs are genuinely confusable. Only those carry "versus" routing (N22 and N23 are the first two).

**N26 · Which pairs are genuinely confusable: research and recommendations** · `finding` (2026-09-28); the status of each pair is noted below

*Test for a pair (from N25).* Two tools are genuinely confusable when both of these hold:
- one common request could be served by either tool (their capabilities really overlap);
- picking the wrong one has a real cost (correctness, quality, or placement).

*Evidence:*
- **Published research.** MetaTool (Huang et al., ICLR 2024, [arXiv 2310.03128](https://arxiv.org/abs/2310.03128)) found that choosing among tools *with overlapping functionality* is the hardest tool-selection task. ChatGPT scored 69.1% on the "similar choices" split, and the authors advise refining the descriptions of those tools. Anthropic's advice points the same way (E1, E2): consolidate or namespace overlapping tools. "If a human engineer can't definitively say which tool should be used… an AI agent can't be expected to do better."
- **Buddy's real usage** (read-only aggregate over the dev database `~/.local/share/buddy/opencode/opencode.db`: 78 sessions, Aug–Sep 2026, mostly the developer's own testing):

  | Tool | Calls |
  |---|---|
  | `websearch` | 119 |
  | `webfetch` | 51 |
  | `bench_present` | 44 |
  | `whiteboard_create_view` | 39 |
  | `render_mermaid` | 18 |
  | `present_html_widget` | 11 |
  | `inapp_browser_open` | 8 |
  | `present_media` | 3 |
  | `render_figure`, `render_freeform_figure`, `render_svg`, `python_calculator`, `imagegen` | **0** |

  - All 18 Mermaid calls were flowcharts or graphs, plus one sequence diagram. None was a chart.
  - The competition actually observed is between the whiteboard, Mermaid, and the widget. There is no usage evidence either way for the figure tools.

*The pairs:*
1. **Freeform SVG versus constrained figure** · `decide`.
   - The overlap is real: both draw figures inline, and freeform can hand-place geometry.
   - A wrong pick costs correctness. Report 4 says relational accuracy is what matters, and the constrained tool exists because "a plausible-looking sketch is not evidence that a relation holds".
   - Options: one versus line in each description, or consolidating the two into a single figure tool (E1).
2. **Mermaid versus freeform SVG** · `set` by N22. Mermaid when only connections or order matter and its automatic layout renders cleanly; otherwise a figure. One line in each, taken from N22. No new decision needed.
3. **Calculator plot versus Mermaid charts** · `decide`.
   - The overlap: `xychart-beta` and `pie` plot values given literally; the calculator computes them.
   - A wrong pick costs accuracy, since the numbers go unchecked.
   - Usage shows no Mermaid charts at all.
   - Options: one line in Mermaid only ("values that must be computed → calculator"), or stop advertising Mermaid's chart types.
4. **`render_svg` versus freeform SVG** · `set` by N25: **not confusable**.
   - `render_svg` renders only chemistry formats (`smiles`, `cxsmiles`, `reaction-smiles`, `ket`, `chemfig`) into an SVG *file* for documents and exports. Freeform forbids chemistry.
   - No versus lines. Chemistry routing belongs to `teach-chemistry`.
5. **Widget versus artifact** · `set` by N24: small and inline versus a page in a Browser tab. The lines get written when the artifact tool exists.
6. **Browser versus `bench_present`** · `decide`.
   - The inputs mostly separate them already: a URL versus a file, resource, or object.
   - The one real choice is a document on the web: show the page, or bring its text into the reader. That is arguably a workflow for the reading and find-and-show skills, not a line in a tool description.

**N27 · Merge audit of every Buddy tool** · `finding` (2026-09-28, at the user's request, before they decide pair 1 of N26)

*The merge test.* Two tools are one tool in different modes when they do **the same job, put the result in the same place, and have the same lifecycle**, and differ only in how the input is written. Sources:
- Anthropic (E1, E3): "consolidate related operations behind an action parameter".
- MetaTool: tools that overlap are the hardest to choose between.

The test is *not* "both produce the same format". `render_svg` also outputs SVG, but it writes a chemistry file for exports.

*Tools audited.* Everything in the shared features:
- `bench`, `browser`, `whiteboard`, `diagrams`, `figure-rendering`, `svg-rendering`, `calculator`, `html-widgets`, `image-generation`, `media-presentations`, `reading`, `teaching-guidance`, `stepwise-solving`, `standards`, `memory`;
- the subagent save tools;
- dynamic tool discovery.

OpenCode's own tools are vendored and out of scope.

| # | Candidate | Test result | Recommendation |
|---|---|---|---|
| M1 | `render_figure` + `render_freeform_figure` | Same job (a finished static figure), same place (inline), same lifecycle (an object shown by the Bench "rendered" view, A13). Only the input differs: a solved geometry spec versus raw SVG. | **Merge** into one figure tool with modes. |
| M2 | M1 + `render_mermaid` | Also a finished static figure, inline, stored as an object with the same "rendered" Bench view. Only the input differs: Mermaid text. | **Candidate:** one inline figure tool with `format: mermaid \| geometry \| svg` (`render_svg` already takes a `format` parameter). The N22 and N23 routing would become mode guidance inside one description. **Risk:** one mode could dominate inside the tool (N8). Mermaid and geometry have different repair paths. |
| M3 | `bench_present` + `inapp_browser_open` | Same destination (a Bench tab). Different targets: file, resource, or object versus a URL. | **Candidate:** a `present_url` action on `bench_present`. That puts all Bench placement in one tool and would allow returning to Browser tabs (A22). **Caveat:** Browser tabs are controlled by the user and can't be read. |
| M4 | `present_html_widget` + the planned Browser artifact (N24) | Same job (an authored interactive page), different place (inline versus a Browser tab). | Decide when N24 is built: a placement mode on one tool, or a separate artifact tool. |
| M5 | 7 standards tools (`search_standards`, `get_standard`, `get_crosswalk`, `get_learning_components`, `get_next_standards`, `get_prerequisites`, `query_standards_sql`) | Operations on one knowledge graph. Their descriptions all refer to each other (the N25 fragility). | **Merge** into one `standards` tool with an `action` parameter. This follows the letter of E3, but has low priority for this effort. |
| M6 | `reflection` + `stepwise_solve` (and their `_dynamic` duplicates) | They share one parameter schema (`PedagogyToolParameters`) and both generate coaching for the active goal. | Before merging, **review whether they should exist at all under N3**: they generate teaching moves. That is a separate question. |
| — | Keep separate | Read versus write on the same resource (`whiteboard_create_view`/`whiteboard_read_context`, `bench_present`/`bench_read_context`, `learner_memory_search`/`learner_memory_update`): frontier products keep reads and writes as separate tools (claude.ai `memory_*`, OpenCode read/edit). Pipeline steps (`prepare_resource` → `ingest_full_text`). Different jobs (`imagegen` generates, `present_media` shows existing files). Different destination (`render_svg` writes files). Stand-alone tools (`python_calculator`). Discovery (`learning_tool_search`/`learning_tool_load`). | No merge. |

**N28 · The figure merge is the pilot; Mermaid, the Browser, and the present tools are for later** · `locked` (2026-09-28)
- **Merge `render_figure` and `render_freeform_figure`** into one figure tool with two modes: a solved geometry spec, and freeform SVG (N27 M1).
  - The user: the merge "needs to be very careful because it will have many second-order effects across the prompting system". Such effects are to be avoided once the prompt system ships, but are acceptable now.
  - It is a **pilot** for merging tools.
- **Mermaid stays separate for now.** Merging it would add too much risk. It may be folded in later (M2).
- **Browser versus `bench_present`: undecided.** The user plans a whole browser-control suite (see the T3 Code project at `~/Code/t3code`, which has full browser control). The Browser may become part of that rather than an action on `bench_present`.
- **A new candidate from the user: merge the "present" tools.** Make one `present` tool, with *Bench* and *inline* as a placement setting instead of two tools. The data the user asked for:
  - **`bench_present`** (44 calls in the dev database):
    - actions `present_file` (a local file; Markdown opens in the Bench editor), `present_resource` (a prepared resource in the reader), `present_object` (any Buddy object in its default Bench view), `focus_tab` (including Browser tabs since #103), and `close`;
    - result: a Bench tab;
    - authors nothing; files outside the workspace ask for folder permission.
  - **`present_media`** (3 calls):
    - input: 1–12 existing local files (images, PDFs, video, audio);
    - result: an **inline** gallery that is saved as a `media-presentation` object, which `bench_present present_object` can later move to the Bench;
    - files outside the workspace ask for permission.
  - **The overlap.** Both take local files and show them to the user. They differ only in where the result goes. A PDF can currently be shown **three** ways:
    - `present_media` (inline gallery);
    - `bench_present present_file` (a Bench tab);
    - `prepare_resource` + `present_resource` (the reader).
  - **What a merge would look like.** `present(target: files | resource | object, placement: inline | bench)`. `focus_tab` and `close` would stay as Bench navigation.
  - **Second-order effects:**
    - tool names appear across descriptions and skills (`reading`, `teaching-resource-authoring`, `find-indian-education-resources`, and 8 descriptions name `bench_present`);
    - the web renderers are keyed by tool id (inline gallery card versus Bench activity);
    - evals and traces use tool names.
- **The durable audit** is in `docs/architecture/design/tool-surface.md`, at the user's request.

**A22 superseded (fact, 2026-09-28).** `bench_present` `focus_tab` **can focus Browser tabs**, since main's commit `5cb46f0e4f` ("fix(bench): Let Buddy focus open Browser tabs", #103). The code handles `target.type === "browser"`.
- The line in the branch's Bench prompt, "Browser tabs belong to the user and can't be focused this way", is **false**. It has to be corrected when P18 is applied.
- problem.md's known issue "Buddy can't refocus Browser tabs" is stale.
- Focusing a Browser tab only brings it to the front. Buddy still can't read, click, type into, or capture the page.

**N29 · How the present tools behave: what the user can actually see** · `finding` (2026-09-28, evaluated in code at the user's request before deciding whether to merge the present tools)

*The user's concern.* After an inline present, Buddy says "I've presented the file, you can see it", but the user sees only a chip with the file's icon, not the file itself.

*What the user sees, by file type* (verified in code):

| File type | `present_media` (inline) | `bench_present present_file` (Bench) | `prepare_resource` + `present_resource` (reader) |
|---|---|---|---|
| Image | **Visible** (gallery) | **Visible** | — |
| Video, audio | **Playable** | **Playable** | — |
| PDF | **A chip only** (a file row with open actions, plus "process as resource") | **Visible** (source viewer) | **Visible**, with reading context and citations |
| Text, code, CSV | Chip only | **Visible** (source) | — |
| Markdown | Chip only | **Visible** (the Bench editor) | — |
| DOCX, PPTX, XLSX | Chip only | **"This file cannot be opened in Buddy"** | **Visible** once prepared (converted) |
| EPUB | Chip only | Not previewable (EPUB opens in the reader) | **Visible** |

Where this comes from in the code:
- `web/src/components/media/presented-media-content.tsx`: the image, video, and audio branches, and `PresentedFileMediaList` for everything else.
- `web/src/components/bench/surfaces/file-bench-surface.tsx`.
- `canOpenWorkspaceFileOnBench` in `packages/workspace-file-policy`.

*Why Buddy overclaims:*
- The `present_media` result tells the model only "Presented N media items." (`media-presentations/service/object-result.ts`). It gives no signal of whether the content is visible or shown as a chip.
- The branch's description says it shows "images, PDFs, video, audio, or other media" inline, which is false for PDFs and everything that isn't media.

*Options:*
- **A. "Present" means the user can see it (one tool).**
  - A single `present` tool where the destination follows from what can actually be shown:
    - images, video, and audio inline (or on the Bench when asked);
    - PDFs, text, and Markdown on the Bench;
    - documents in the reader, through the resource pipeline.
  - The result states exactly what the user sees.
  - This is the user's merge idea, with the placement driven by what can be displayed rather than chosen by the model.
- **B. Two tools, made truthful.**
  - `present_media` accepts only images, video, and audio. It refuses other files and points to the Bench or the reader.
  - Its description and result say what is visible.
  - `bench_present` handles the rest.
- **C. Descriptions only.** Correct the `present_media` description and leave behaviour as it is.

Under A or B, the first step is the same: make the result state what the user can see.

**N30 · "Present" means the user can see it** · `locked` (2026-09-28; the user chose option A of N29)

*The decision.* Buddy has one way to show an existing file or resource, and "presented" always means the user can see the content, not just an icon. This settles tool-surface candidate M3b (`present_media` + `bench_present`) as a merge.
- **One `present` tool.** The destination follows from what can actually be displayed:
  - images, video, and audio: inline by default, on the Bench when the user asks or the job needs a surface;
  - PDFs, text, code, CSV, and Markdown: the Bench;
  - DOCX, PPTX, XLSX, and EPUB: the reader, through the resource pipeline (`prepare_resource`, then present the resource).
- **The model doesn't pick a placement that can't show the file.** Where only one destination can show a type, the tool routes there. The model chooses only where both work (images, video, audio).
- **The result states exactly what the user sees**, per item. For example: "The image is visible inline", "The PDF is open on the Bench", or "The DOCX must be prepared before it can be shown".
- **Bench navigation stays as it is:** `focus_tab`, `close`, and `present_object`, which moves an inline object to the Bench. Whether they live in the same tool is a design choice made at build time.

*Order of work.*
1. **Ship first (a prompt-level fix, independent of the merge):**
   - make the `present_media` result say what is visible and what shows only as a chip;
   - remove the false PDF claim from its description (`media-presentations/tools/present-media.ts`).

   This fixes Buddy's "you can see it" overclaim on its own.
2. **Then the merge,** after the figure-tool pilot (M1, N28), so the pilot's lessons about renaming apply here.

*Second-order effects to plan for* (from N28 and N29):
- tool names appear in skills (`reading`, `teaching-resource-authoring`, `find-indian-education-resources`) and in 8 descriptions that name `bench_present`;
- web renderers are keyed by tool id (the inline gallery card versus the Bench activity);
- evals and traces use tool names;
- **saved sessions hold `present_media` and `bench_present` tool parts. They are user data and must still render after the merge** (AGENTS.md).

*Why.* The user's concern (N29): after an inline present, Buddy tells the user they can see a file when they see only a chip. A truthful result fixes the claim. The merge removes the choice that leads to it, because a destination that can't show the file is never on offer.

**N31 · Data charts: the calculator's future is open, so chart routing stays light** · `locked` as a default (2026-09-28; N26 pair 3)

*The question.* Who draws data charts (bar, line, pie)? Both tools claim them on the branch. Mermaid's description has "simple two-axis and proportional pictures (quadrantChart, xychart-beta, pie, sankey-beta)", and the calculator's has bars, lines, scatters, and distributions. A request like "show India's population by decade as a bar chart" fits both. The options were: A, the calculator, with Mermaid only when the calculator isn't installed; B, a split by the data (computed or many values to the calculator, a few given numbers to Mermaid); C, no routing.

*The user's answer.*
- The calculator's runtime is available only on macOS, not on Windows. The code has a Windows build target (`local-runtimes/advanced-math/service.ts`), but the user says Windows users don't get it. The tool also appears only when the runtime is installed (`toolMatchesRuntimeConstraints`).
- **The Buddy-managed Python runtime may not last.** The user may replace it with a skill that runs Python through the shell, plus a way to show the images it produces inside the app, instead of Buddy managing the runtime and its dependencies. This is not decided.
- The user didn't pick an option.

*The default,* recorded under N0 rule 10 and following from N22 and N8:
- **Charts of data are drawn from code when Buddy can run code** (today, the calculator). Where it can't (Windows, or the runtime not installed), Mermaid's simple charts or a freeform SVG are acceptable.
- **Mermaid's description lists its chart types as a capability, not a main use.** Under N22, Mermaid's job is connections and order.
- **Neither description builds routing around the calculator's name.** It may become a skill, and a description that names it would then point at a missing tool (N12, N25).
- If the calculator becomes a skill, the images it writes are shown with the `present` tool (N30), so their result must also say what the user sees.

*Revisit* when the calculator's future is decided. This doesn't block Part 3.

**N32 · "The room": what it is, whether it was locked, and what frontier products do** · `finding` (2026-09-28, at the user's request before gap A)

*The user's question.* Asked whether the persona prompt should encourage Buddy to show things unasked, the user stepped back: "Let's work on the room concept itself first, because without that we might not be able to decide the routing at all." Is the room locked? Is it even needed? Does it need research in CL4R1T4S?

*Was it locked? No.*
- "The room" is a metaphor from `problem.md` (line 7): Buddy is a teacher with a classroom, the chat is the conversation, and the Bench is the room's board, projector, and desk.
- Pass 1 (J) wrote it into the prompt as "Teach with the whole room". Pass 3 (L) rewrote that as "Show the idea".
- N3 mentions "accurate knowledge of the room (what each surface and tool does)" as a layer Buddy might still own. P13's "a neutral description of the room" was derived from that line. The user never locked either.

*What Buddy tells the model about the room today* (three places):
1. `shared/product.p.md`, "Buddy Vocabulary": what the Bench is (tabs, one visible at a time, docked or floating layout) and what "inline" means.
2. `features/bench/bench-feature.p.md`: how the Bench behaves (per-turn status, `focus_tab`, promoting inline objects), plus the four teaching-choice lines that P18 removes.
3. `shared/visual-guidance.p.md` ("Show the idea"): when to show, where to place it ("Place it by what the learner will do with it"), and how to shape it. N3 removes its rules. P13 is its open row.

*What frontier products do* (`~/Code/CL4R1T4S`, prompts from the last year):
- **Every product with more than one surface describes them in the system prompt**, as facts: what each surface is, what the user sees there, and how to get something in front of them.
  - **Claude Cowork** (`ANTHROPIC/CLAUDE-OPUS-5.5.md`, `<workspace_and_tools>`) opens with: "This section is a reference: what each thing is and how to use it. When to use it is covered next." It covers the workspace ("the person cannot see into it, so anything they are meant to have must be sent"), delivering files, artifacts ("the person sees a card"), and the two browsers.
  - **ChatGPT Atlas** (`OPENAI/Atlas_10-21-25.txt:421-426`) names its two layouts: full-page chat, and a web page with ChatGPT in a side panel.
  - **ChatGPT** (`OPENAI/ChatGPT5-08-07-2025.mkd:152`): the canvas is "shown … next to the conversation".
  - **Codex desktop** (`GPT-6-Sol_Prompts.txt`, `desktop.G3`) lists what displays inline (images, video, audio) and what needs a preview tool.
- **Being truthful about visibility is a recurring rule.** This is the same problem as N29 and N30.
  - Claude Design (`Claude-Design-Sys-Prompt.txt:171`): "Reading a file does NOT show it to the user… use show_to_user."
  - claude.ai (`Claude-Fable-5.1.md`, `<sharing_files>`): "A file that is written but never presented is unreachable."
- **Most also carry a destination policy, separate from the map.**
  - Cowork, `<creating_outputs>`: "Outputs depend on where they are going to live." Read once → the reply (an inline picture is allowed). Leaving as a file → a file. Kept, returned to, edited, or shared → an artifact. Its artifact types include a Whiteboard, for "boxes, arrows and sticky notes to rearrange together — and any diagram too complex to draw inline in a reply or that people need to work on together".
  - claude.ai: artifact criteria ("Use artifacts for… Do NOT use artifacts for…").
  - ChatGPT canvas: "ONLY use if you are 100% SURE the user wants to iterate on a long document".
- **Some carry an initiative policy for visuals.**
  - claude.ai, `<request_evaluation_checklist>`: Step 0 is a brake ("Most requests are conversational… answers in prose and stops here"). It also lists proactive triggers, the first being "Educational explainers — 'How does X work' where the concept has spatial, sequential, or systemic structure."
  - Codex: "The user does not need to explicitly request a visualization… Usually skip visuals for single facts."
  - Both also say not to narrate routing.

*Implications for Buddy.*
- The room is three separate things, and each needs its own decision:
  1. **a factual map:** surfaces, what the user sees in each, and how to put something there;
  2. **a destination policy:** where an output should live;
  3. **an initiative policy:** whether to show unasked.
- The map is standard, and Buddy already has one, split across `product.p.md` and the Bench feature prompt.
- A destination policy would amend N3, which lists "inline or on the Bench" as the model's call. N22's "keep" reason is already a destination rule for the whiteboard.
- Initiative is the failure L documented.

*Status (the user, 2026-09-28).* Not locked. Asked to lock the room as a factual map, the user wanted a full research report first: a subagent surveys all of CL4R1T4S and answers the three questions above. The report goes to [room-research-report.md](room-research-report.md). Lock the room, the destination policy, and initiative only after the user has read it. Until then, P13 (`visual-guidance.p.md`) and gap A wait on the report.

**N33 · Should sibling tools cost about the same to use? Research first** · `open` (2026-09-28)

*The question.* N8 stops a tool from winning because its description is bigger. The opposite bias also exists: a tool loses when it is expensive to reach. Session L named this as cause 3 for why the board was never used.

Words the model must read before a tool's first use, on the branch (description plus any skill the description says to load first):

| Tool | Description | Required skill | Total |
|---|---|---|---|
| Whiteboard | 661 | `whiteboard-authoring`, 6,975 | ~7,600 |
| Widget | 748 | `interactive-pages`, 1,039 | ~1,800 |
| Freeform SVG | 288 | `explanatory-drawing`, 1,595 ("before composing a new kind of figure") | ~1,900 |
| Imagegen | 355 | — | 355 |
| Mermaid | 345 | — | 345 |
| Figure | 225 | — | 225 |
| Calculator | 222 | — | 222 |

The proposal was to extend N8: balance siblings by the cost of first use, and shrink the board's required reading to a small core, with depth optional or delivered in the tool's first result.

Frontier hints, not yet a study:
- the claude.ai Visualizer loads a `read_me` module for every visual kind, so every sibling pays the same toll;
- when Claude Cowork creates an artifact from a type, the type's SKILL.md comes back in the tool result.

*The user's answer.* Decide this by analogy and research first, as a separate research task, and lock it later. The descriptions will probably be rewritten anyway (P19), so today's word counts are a symptom, not the design.

*Research commissioned.* A subagent is writing [tool-guidance-research-report.md](tool-guidance-research-report.md). It covers:
- where frontier products put a tool's contract, fit, and craft (description, parameters, a tool-scoped block, an on-demand module or skill, or the tool's result);
- how big sibling descriptions are, and whether products balance them;
- whether a first use requires reading, and whether that toll is uniform across siblings;
- a per-tool counterpart study for every Buddy visual tool, `bench_present`, `present_media`, and the Browser (the O7 gaps);
- a proposed description template.

This report also unblocks gap B and P19 (descriptions) and part of P24 (`whiteboard-authoring`'s size).

**N34 · Research in flight: three reports** · `open` (2026-09-28)

*History.*
- The first two research subagents (room, tool guidance) hit the account's session rate limit and stopped before writing anything.
- After the limit reset, the user asked for research to be launched for every locked or pending decision that needs it, with at most three new subagents.
- Each new subagent writes its report as it goes, so partial work survives an interruption.

| Report | Answers | Unblocks |
|---|---|---|
| [room-research-report.md](room-research-report.md) | N32: the room as three things (a factual map of surfaces, a destination policy, initiative), whether that split holds, truthfulness about what the user sees, narration | Gap A, P13 (`visual-guidance.p.md`), the initiative question |
| [tool-guidance-research-report.md](tool-guidance-research-report.md) | N33 (cost of first use); where contract, fit, and craft live; description sizes; per-tool counterparts (the O7 gaps); a description template; **gap C** (what a skill may prescribe); **N21** (how products get a board built in segments) | Gap B, gap C, P19, P24, P25, P26 |
| [principles-research-report.md](principles-research-report.md) | N15: how frontier agents state principles or constitutions; amendments; teaching-mode precedents; which of Buddy's 15 principles read as values and which as procedures under N3 | P15 (the content of the principles) |

*Gap C was asked and not answered.* The question was whether a skill may decide placement or tool choice, or teach craft only; option A, craft only, was recommended. The user redirected to the subagents instead, so gap C is now also covered by the tool-guidance report (question 6).

*Not sent to research, because it is settled by eval or by the user rather than by analogy:*
- N9, the form of the concision bound;
- N14, whether the teaching plan returns;
- N16, the "Learner sees" lines;
- N5, small talk;
- N31, the calculator's future;
- M3, the Browser suite;
- N24 and M4, the artifact build.

**N35 · Remove the reflection and stepwise-maths tools** · `locked` (2026-09-28; the user chose A; settles tool-surface candidate M6)

*What they are.*
- **`reflection`** and `reflection_dynamic` (feature `teaching-guidance`): "Generate a reflection-based assessment prompt for the active goal."
- **`stepwise_solve`** and `stepwise_solve_dynamic` (feature `stepwise-solving`): "Generate stepwise mathematical coaching for the active goal."
- Neither generates anything. Each returns a fixed template with the topic filled in. For example, `reflection` returns "Ask the learner to explain how they would approach {topic}. Probe one assumption, gap, or confidence claim… Look for grounded reasoning, not confidence theater."
- They come from the older "goals" design.
- Usage in the dev database (read-only aggregate): `reflection` 0 calls, `stepwise_solve` 1 call.

*Decision.* Unregister all four from the tool list. The code stays in the repo, unregistered, like the shelved skills in `teaching-guidance/feature.ts`.

*Why.* Each is a teaching procedure disguised as a tool, which is what N3 rules out. The methods they stand for (reflection, Socratic probing, guided practice) are already in the `teaching-models` skill, which the model consults when unsure (N7).

*Where they are referenced, to handle in Part 3:*
- `teaching-guidance/feature.ts` and `stepwise-solving/feature.ts` (registration);
- `runtime/dynamic-tool-metadata.ts`;
- `web/src/components/chat/tools/tool-info.ts` (display metadata). Keep it, so that saved sessions containing these tool calls still render;
- tests: `subagent-tool-forwarding`, `runtime-tool-registration`, `opencode-runtime/session-live`.

**N36 · Showing ideas is a product value** · `locked` (2026-10-01; the user chose A)

*The question.* N3 leaves whether to show anything to the model. Session L showed that, left to its judgment, the model answers in text. Removing the teaching plan (N14) and the "Show the idea" defaults (P13) removes the only push toward showing. Is "Buddy shows ideas, not just tells" part of the product, or purely the model's call?

*Decision.* It is a product value, like the teaching constitution (N15). The persona prompt carries a short push toward showing ideas.
- **Only the push is ours.** How to show, what to show, and where (inline or Bench, which tool) stay the model's call under N3, informed by the room map and the tool descriptions (N12).
- **It is a value, not a procedure.** No checklist, no algorithm, no "settle the plan first" (N14 stays).

*Why.* Session L: with nothing pushing it, a strong model explained a structural topic in text and never used the whiteboard. A short push is what products do when they want visuals shown unasked (O7.7; confirmation pending in the room report).

*Consequences.*
- **Amends N3:** whether to show is no longer purely the model's call; Buddy leans toward showing. Small talk and plain facts still get words (N5, N4).
- **P13 (`visual-guidance.p.md`):** is no longer "no rules about when to show". It becomes the room map plus a short value-level push. The wording is settled by eval.
- **Where the push lives** (persona prompt versus a tool-scoped block) follows the room report (N32).
- **Evals:** add cases where a structural idea should be shown unasked, and check that casual turns stay unvisual (N5).

**N37 · The "show ideas" push applies in both personas, unchanged** · `locked` (2026-10-01; the user chose A)
- The N36 push is Buddy's value in Learn (`buddy`) and Teach (`teaching-buddy`) alike, with the same wording. There is no per-persona framing.
- It stays in the shared section both personas render (`shared/visual-guidance.p.md`, rewritten under P13).
- **Evals:** include educator requests (for example, "how do I explain photosynthesis to grade 7?") alongside learner requests.

**N34 addendum (2026-10-01).** The three research reports were still empty stubs. At the user's request they are re-run one at a time with Sonnet subagents: room first, then tool guidance, then principles.
- The room report is done (2026-10-01).
- The principles report is done (2026-10-01). It recommends keeping the constitution, shrunk to about 8 value entries, and lists 5 open questions for the user. Findings are not locked; they are evidence.
- The tool-guidance report is done (2026-10-01). It proposes answers to gaps B and C, a description template, and 5 open questions. Findings are not locked; they are evidence.
- Midway, the user had both running agents drop the formatting rules.

**N38 · Buddy places what it presents; rendering gaps are fixed in code, not in the prompt** · `open` (2026-10-01; proposed amendment to N30, shown as Tool design 02)
- **The user's point.** N30 has the `present` tool route by file type (PDFs to the Bench, images inline or Bench). That is a product limit written as a rule, and every rendering change would mean tuning the prompt again.
- **Proposal.** Every `show` takes `where: inline | bench`, chosen by Buddy. The description only says what each place is. The tool shows the item there, and the result says per item what the user can actually see, so Buddy can adjust.
- **Temporary fact.** The description keeps one line, "Inline currently plays only images, video, and audio", until inline rendering covers more. That is a code change outside this branch (N19).
- **Kept from N30:** "presented" means the user can see it; truthful per-item results; the build still waits for the figure-tool pilot; saved sessions must still render.

---

## O. How products split tool guidance: system prompt, tool description, parameters (2026-09-28, for N13)

Question: where do shipping products put a tool's usage guidance (when, how, why, when not), what stays in the system prompt, and how do they cope with tools that come and go without breaking the prompt cache? Sources: `~/Code/CL4R1T4S` (prompts from the last year only), Buddy's vendored OpenCode, and the Claude Code harness as observed in this session.

**O1 · Codex Desktop, GPT-6 Sol (the model in session L)** (`OPENAI/Codex_Desktop/GPT-6-Sol_Prompts.txt`, `GPT-6-Sol_Tools.json`) · `fact`
- **The system prompt is assembled from feature fragments** (`desktop.K3`, `desktop.Y3`, …). A fragment points to a tool and defers to its schema: "search for the `automation_update` tool first, then follow its schema instead of writing raw automation directives by hand."
- **A few critical rules appear in both places.** "Only use `create_thread` when the user explicitly asks" is in the fragment and also in the tool description.
- **Tool descriptions carry when, how, never, and prefer.** Across 69 tools the median description is about 240 characters. Complex tools run to 1–3k characters (`automation_update`, the computer-use `js` tool). Examples:
  - "Use this when the user asks for a scheduled task…"
  - "Never write raw automation directives by hand…"
  - "Prefer updating an existing automation over creating a duplicate."
- **Parameter descriptions carry per-field rules.** For `create_thread.model`: "Do not specify a model unless the user explicitly requests a specific model."
- **Visuals get a short policy in the system prompt that names formats, not tools:** "The user does not need to explicitly request a visualization… For small, static software or engineering diagrams that fully explain the answer, prefer Mermaid… Usually skip visuals for single facts."
- **Skills trigger by judgment:** "use reasonable judgement… Do not use a skill based solely on keywords, superficial relevance, or the availability of a potentially applicable skill." Buddy's `shared/product.p.md` still has the older Codex wording: "If … the task clearly matches a skill's description… you must use that skill."

**O2 · Claude Cowork, Opus 5.5** (`ANTHROPIC/CLAUDE-OPUS-5.5.md:299-452`) · `fact`
- **Two layers in the system prompt:**
  - *Policy by destination*, in `<creating_outputs>`: "Outputs depend on where they are going to live." Read once → the reply (an inline picture is allowed). Leaving as a file → a file. Kept, returned to, edited, or shared → an artifact type.
  - *Reference*, in `<workspace_and_tools>`: "This section is a reference: what each thing is and how to use it. When to use it is covered next."
- **It names tools and types, and says outright that availability varies:**
  - "Bridge tools change over time, so Claude goes by their tool descriptions."
  - "Claude goes by the browser tools actually present rather than assuming either one exists."
  - "If a `chrome-browser` … skill is listed, Claude reads that skill's SKILL.md before its first step."
- **Deferred tools** appear by name in `<system-reminder>` messages and load through ToolSearch. The tool set can change without editing the system prompt.

**O3 · claude.ai, Opus 5** (`ANTHROPIC/OPUS-5.md:1521-1588`, `:1618`) · `fact`
- **Image search's guidance is a conditional block in the system prompt,** `<using_image_search_tool>`, about 70 lines. It has a core principle ("Would images enhance the person's understanding…? … USE images"), when to use, when not, how (query length, placement: interleave, or lead when "the image IS the answer"), and examples.
- **The tool description itself is one line:** "Default to using image search for any query where visuals would enhance the user's understanding; skip when the deliverable is primarily textual."
- **The Visualizer's craft** sits in `read_me` modules that load on demand (`diagram`, `interactive`, `chart`, …). These play the role of skills.
- **So the consumer product puts usage guidance for tools that should be used on the model's own initiative into a tool-scoped system block,** which appears only when the tool exists. This is the same mechanism as Buddy's feature `prompt.instructions` (A7).

**O4 · OpenCode, Buddy's runtime** (`vendor/opencode/packages/opencode/src/session/prompt/gpt.txt`, `tool/*.txt`) · `fact`
- The system prompt is about 1.5k words and points at tools briefly: "prefer using Glob and Grep tools".
- Tool descriptions run 90–410 words and carry the usage notes. `question.txt`, for example, says when to ask and how to format the options.

**O5 · Grok 4.20** (`XAI/GROK-4.20.mkd`) · `fact`
- Tool JSON and "render components" are written out inside the system prompt.
- The "use this when…" guidance lives in each tool's description (C12).

**O6 · Claude Code harness** (observed in this session, 2026-09-28) · `fact`
- The system prompt carries short pointers, such as "prefer the dedicated tools over shell commands".
- Tool descriptions are long and carry when and when-not rules. A few critical rules appear in both places (for example, "don't spawn agents unless the user asks").
- Deferred tools are listed by name in system reminders and fetched on demand.

**O7 · Early cross-product patterns** · `finding`, **provisional, not a synthesis** (the user, 2026-09-28: "we have not even touched individual tools here")

**What this is based on.** Two or three example tools per product and the overall shape of each prompt.

**Not yet examined:**
1. **How each product describes the tools that match Buddy's.** For each Buddy tool, find its counterpart in other products and read that counterpart's description and parameters in full:
   - diagrams (Codex's Mermaid pointer, the claude.ai Visualizer);
   - a whiteboard (Claude's Whiteboard artifact type);
   - interactive widgets (the Visualizer and `show_widget`);
   - a browser (Claude's two browsers, Codex `getTabContext`);
   - media display (Codex's media rules, `present_files`);
   - image search and generation (claude.ai, Grok);
   - calculators and plots;
   - document and artifact surfaces (Claude artifact types, Codex `open_in_codex`).
2. **Buddy's own tools, one by one:** what each description and parameter schema says today, measured against the split.

The patterns below are hypotheses for that per-tool work to confirm or overturn.

1. **Guidance travels with the tool; its exact location varies.**
   - OpenAI, OpenCode, Grok, and Claude Code put usage in the tool description.
   - claude.ai puts it in a tool-scoped block that is present only when the tool is.

   Both are pluggable. This supports the intent of N12: the guidance is packaged with the tool, so it comes and goes with it.
2. **What every system prompt carries:**
   - identity;
   - a map of the product (which surfaces exist and where outputs go);
   - short pointers to tools or formats;
   - a few cross-tool policies;
   - how to handle availability ("go by the tools actually present").

   None puts one tool's full manual in the always-on prompt.
3. **Parameter descriptions carry per-field meaning and constraints** ("do not … unless"). None carries judgment about the domain.
4. **A few critical rules are deliberately duplicated** in the system prompt and the tool description.
5. **Tools can change without breaking the cache** in three ways:
   - session-scoped assembly (Codex fragments, claude.ai blocks; Buddy's feature prompts work this way);
   - deferred tools named in messages rather than in the system prompt (Anthropic);
   - wording such as "go by what is present".
6. **Skill triggering has moved from mandatory to judgment** (O1).
7. **Proactive use and system-prompt salience.** When a vendor wants a tool used without being asked (claude.ai image search, Codex visualizations), the push sits in the system prompt, in a tool-scoped block or a short policy, not only in the tool description. This bears directly on the initiative failure in L.

---

## P. A direction for every change on the branch (inventory taken 2026-09-28)

**Scope.** Everything that differs from `HEAD` (`f4f2368`, `main`) in the `fix/visuals-prompt` working tree: staged, unstaged, and untracked. That is roughly 140 tracked files and 26 untracked paths.

**How to use this section.**
- Each unit groups related files and gives them one direction: keep, change, revert, research, or decide.
- **Basis** cites the locked entry the direction comes from.
- **Status:**
  - `set`: the direction follows from locked entries.
  - `decide`: needs a user decision.
  - `research`: needs study first.
- When a unit's direction changes, update its row and cite the new N entry.

### Docs and research

| # | Unit (files) | What it is | Direction | Basis | Status |
|---|---|---|---|---|---|
| P1 | `docs/features/prompt-engineering/teaching-on-the-bench/{problem,research-ledger,system-map}.md` | The effort's problem statement, ledger, and system map | Keep. Update `problem.md` wherever N entries supersede it: principle 3 (N12), "What done looks like" (N3, N11), and the history of the passes. | N0, N3, N11, N12 | `set` |
| P2 | `…/teaching-on-the-bench/routing-model.md` | The five questions, six shapes, and four-way instrument test, written as a contract | Keep as a **research reference**. Mark it as not a contract and point to N3. Use its shape and instrument analysis only as input to the per-tool descriptions. | N3, N12 | `set` |
| P3 | `…/teaching-on-the-bench/evals.md` | The 16-prompt yardstick, a behaviour rubric, and the in-app runner docs | Rewrite in Part 4:<br>• outcome and quality rubrics with LLM or human judges;<br>• drop the "Rhythm" row and the step-specific expectations;<br>• add the N5 and N9 cases;<br>• keep the runner docs. | N10, N11 | `set` |
| P4 | `docs/sources/deep-research-report (1–7).md` | Seven deep-research reports on media for teaching (B3) | Keep as research inputs. They are evidence, not rules. | N3 | `set` |
| P5 | `docs/reviews/dogfooding-feedback.md` and two PNGs | Dogfooding issues from 2026-09-23 | Keep, but commit it separately from this effort. Only issues 01 (choosing a modality) and 12 (the reading skill) bear on this effort. The others belong to other work. | — | `set` |
| P6 | `docs/guides/commands/cmd.explorer.md` | A stray line: `[test](https://www.google.com)` | Revert. | — | `set` |

### Agent development skills (`.agents/skills`, used by coding agents rather than by Buddy)

| # | Unit | What it is | Direction | Basis | Status |
|---|---|---|---|---|---|
| P7 | `.agents/skills/prompt-engineering/SKILL.md` | A placeholder whose body is a single `-` | Leave it out of any commit until Part 2 settles. Then write it from the locked method entries (N0, N4, N6, N8, N11, N12, N17), so future agents do prompt work the same way. This is the default; the user can override it. | N18 | `set` |
| P8 | `.agents/skills/writing-buddy-tests/SKILL.md` | A new rule: prompt tests assert delivery contracts, not prompt prose | Keep. It is what lets prompt prose change freely. Several web and buddy test edits already follow it (P31). | N11 | `set` |
| P9 | `.agents/skills/head-first/` (untracked) | The developer's cross-worktree session-resume tool | Not part of this effort. Move it to its own commit or branch. | — | `set` |

### Persona prompts (`packages/buddy/src/learning/personas/prompts/`)

| # | Unit | What it is | Direction | Basis | Status |
|---|---|---|---|---|---|
| P10 | Restructure into `shared/{constitution,product,teaching,visual-guidance}.p.md`, the new `render-persona-prompt.ts`, and deletion of the old `sections/**` files | Mechanical consolidation of both teaching personas' prompts | Keep the structure. The content of each piece is governed by P11–P16. | — | `set` |
| P11 | `concise-response-preference.p.md`, `concise-response-control.ts`, `user-prelude/concise-responses-transition.ts`, and the i18n label (`settings.personalization.conciseResponsesDescription`) | The concision preference, rewritten with no limits | Change. The reply must be bounded by digestibility and scaled to the question, not to the input, without the hard cap from `main`. Keep the setting and the strip/transition wiring. The form of the boundary is wording, so it is settled by eval against the N9 cases. | N9, N18 | `set` (form: eval) |
| P12 | `shared/constitution.p.md` | Respect, not narrating the process, "guidance is not law", answering coherently | Keep. Review one line against N3: "Let explanations reach coherent stopping points. Do not fragment an explanation…" is a pacing opinion. | N3 | `set` (one line to review) |
| P13 | `shared/visual-guidance.p.md` ("Show the idea") | Tells Buddy when to show, where, and in what shape, with defaults | Rewrite as a neutral description of the room, with at most brief pointers, plus a short value-level push toward showing ideas (N36). No procedures for when or how to show. The final wording depends on the room report and the per-tool study, then eval. | N3, N12, N13, N36 | `research` |
| P14 | `shared/teaching-plan.p.md` (untracked) | A four-part teaching algorithm that governs every teaching reply | Remove it from both personas: delete the file, its `{{shared_teaching_plan}}` insertions (`learning-companion.p.md:21`, `teaching-assistant.p.md:61`), and its import in `render-persona-prompt.ts`. A verbatim archive is at `archive/teaching-plan.p.md`. Whether it comes back (as a skill, a strict teaching mode, or scaffolding for weaker models) is decided by a human check across model strengths. | N14 | **`done` (2026-10-01)**: file deleted, insertions and import removed, plus its references in `product.p.md` and `teaching-models` (line 7 sentence, step 5, the router intro, the 10 "In Buddy" notes). The per-model `Learner sees` lines remain for P23. (return: `research`) |
| P15 | `shared/teaching.p.md` | Fifteen teaching principles (Bain), plus principle 16 on checking understanding | Keep principles 1–15 (lines 3–31) for now. Remove principle 16 (lines 33–48). Then settle the principles' content through analogy and eval. | N15 | **Principle 16 `done` (2026-10-01).** Watch for overuse of the `question` tool in evals (N15). Content of 1–15: `research` |
| P16 | `shared/product.p.md` | Bench and inline vocabulary, formatting, how to use skills | Keep the vocabulary and formatting. Change the skill-trigger wording from "you must use that skill" to judgment-based (as in GPT-6 Sol, O1). Remove "Teaching skills inform your teaching plan". Fix typos. | N6, N7, O1 | `set` |
| P17 | `learning-companion.p.md`, `teaching-assistant.p.md` | The composition templates for the two teaching personas | These follow P11–P16. The "Answer fully, without padding" heading goes with P11. | — | `set` |
| P17b | `teaching-assistant.p.md`: the teacher persona's own sections ("Working as a teaching assistant", "How you respect their expertise", "What you produce") | Rewritten in the pre-effort staged restructure from `main`'s specific, voiced text into generic wording. One change of stance: `main` says "assume a constraint you can't see and ask" when an educator's plan looks wrong, while the branch says "offer advice and constructive disagreement". No decision covers the rewrite. | **Out of scope for this effort** (the user, 2026-09-28: "don't work on this… these can be fixed later"). Leave it as it is. Decide keep or restore in a later teacher-persona pass. | N0 rule 13 | `later` |

### Feature prompt

| # | Unit | What it is | Direction | Basis | Status |
|---|---|---|---|---|---|
| P18 | `features/bench/bench-feature.p.md` and `bench/feature.ts` | How the Bench behaves (one tab visible, per-turn status, `focus_tab`, Browser tabs can't be refocused, promoting inline objects), plus four lines that decide teaching choices and one line about telling the user when the Bench changes | Apply N3: remove the four teaching-choice lines (tab jobs, keeping a home tab, keeping a source selected, "don't open the Bench for something read once"). Keep the behaviour description (a feature-scoped block is the right home under N12 and O3) and the short-clause line, which is about communication, not teaching. Eval confirms the wording. | N3, N12, N18 | **`done` (2026-10-01)**, via Easel Proposal 03. Also removed the `focus_tab` line: its usage repeats the `bench_present` description, "don't open a duplicate" repeats the Browser description, "one tab visible" repeats line 1, and "Browser tabs can't be focused" was false since #103 (N12, N25). |

### Tool descriptions and schemas

| # | Unit | What it is | Direction | Basis | Status |
|---|---|---|---|---|---|
| P19 | Description text: `diagrams/tools/render-mermaid.md`, `figure-rendering/**/render-*.md`, `calculator/tools/python-calculator.md`, `html-widgets/tools/present-html-widget.md`, `image-generation/imagegen-description.md`, `whiteboard/tools/create-view.md`, `media-presentations/tools/present-media.ts`, `bench/tools/present.ts`, `bench/tools/read-context.ts`, `browser/tools/open.ts` | Rewritten in passes 1–3 to claim the cases each tool serves | Review tool by tool against N8 (comparable weight) and N12 (the tool owns when, how, why, and when not; no teaching judgment). Use the per-tool analogy study (the O7 gaps). | N8, N12, N13 | `research`, except for Mermaid and whiteboard: rewrite both to N22 |
| P20 | New parameter `.describe()` text: `python_calculator.code`, `render_figure.spec` and `caption`, `render_freeform_figure.source` and `caption`, `present_media.items` and `items[].path` | Parameter meaning | Keep. Parameter meaning is the schema's job (O1, O7). Recheck the wording in the P19 review. | N12 | `set` |
| P21 | `html-widgets/tools/present-html-widget.ts` auto-open presets | `compact_4_3` and `square` now stay inline; larger presets still open on the Bench | Change as part of N24: widgets become inline-only (remove the Bench auto-open), and larger interactive pages become Browser artifacts. | N24 | `set` (N24 build) |
| P22 | `reading/tools/ingest-full-text.ts` and `test/learning/ingest-full-text-plugin.test.ts` | The branch **removed** the "Long Response Caution" that was added to ingestion results when concise mode was on | Restore the caution, reworded to the N9 digestibility rule (not the WhatsApp cap). Restore the test of the delivery contract. | N9 | `set` |

### Skills

| # | Unit | What it is | Direction | Basis | Status |
|---|---|---|---|---|---|
| P23 | `teaching-guidance/skills/teaching-models/SKILL.md` and the "In Buddy" notes in its 10 references | Router over 10 teaching models. It triggers at session start, requires reading a reference, hands back to the plan, and carries "Learner sees" lines. | Change:<br>• trigger on uncertainty or failure;<br>• no forced read of a reference;<br>• choosing none is allowed;<br>• remove the plumbing to the removed plan (step 5 at line 16, line 59, and the 10 "In Buddy" notes).<br>For the "Learner sees" lines, the default is the method-only version: keep what the method itself needs (e.g., line 137, contrasting examples); strip placement (lines 74 and 200: whiteboard, Bench, inline). The effect is unknown, so Part 4 compares with and without the lines. | N3, N7, N14, N16 | `set` (the lines' effect: `research`) |
| P24 | `whiteboard/skills/whiteboard-authoring/SKILL.md` (about 7k words) | Board format, teaching jobs, pacing | Review in the per-tool pass: format craft stays; pacing procedures conflict with N3; its size is a cost (L, cause 3). | N3, N8, N12 | `research` |
| P25 | New skills: `teaching-guidance/skills/explanatory-drawing`, `html-widgets/skills/interactive-pages`, `teaching-guidance/skills/find-and-show-resources` | Craft for composing pictures, building interactive pages, and finding and presenting existing resources | Keep as craft references (skills are the right home for craft). Review each trigger description (N6) and their relative weight (N8). | N6, N8 | `set` (review) |
| P26 | Reading: `reading/skills/reading/SKILL.md` rewrite (on Adler's levels: inspectional, analytical, syntopical, kinds of reading), new `references/**`, deleted `references/nonfiction.md`, new `summarise` skill, registration in `reading/feature.ts`, `index.ts` short description | A broad rewrite of the reading skill (dogfooding issue 12) plus a summary skill | Keep; it addresses issue 12. Review the "Source as Learner-Facing Evidence" section against N3 and N12, and check how summaries interact with N9. | N3, N9, N12 | `set` (review) |
| P27 | Small skill edits: `math/skills/teach-mathematics/SKILL.md`, `platform/skills/buddy-help/{SKILL.md,references/about.md,references/workspace.md}` | Consistency fixes (e.g., the auto-open behaviour in Help) | Keep. | — | `set` |

### Code: evals, dev tooling, DevTools

| # | Unit | What it is | Direction | Basis | Status |
|---|---|---|---|---|---|
| P28 | In-app eval runner: `web/src/lib/evals/*`, `components/debug/devtools-evals-tab.tsx`, the eval driver in `use-directory-chat-page-controller.ts`, `features/evals/subagents/eval-learner.*`, `subagent-manifest.ts`, `web/test/teaching-evals.test.ts` | Runs scripted and simulated-learner conversations end to end in the app window | Keep the runner. Rework it in Part 4:<br>• remove the step and ending checks (`finishesWithoutQuestion`, `questionEndingsAtMost`, and similar);<br>• add LLM-judge rubrics calibrated to the user;<br>• keep code checks only for verifiable facts. | N10, N11 | `set` |
| P29 | Dev session traces: `buddy/src/dev-trace.ts` plus the `POST /api/dev/session-trace` route in `buddy/src/app.ts`; `web/scripts/{session-trace-saver,create-dev-trace-vite-plugin}.ts`, `web/vite.ts`, `web/src/vite-env.d.ts`, the save helpers in `chat-debug-helpers.ts`, and tests | Saves a chat trace to `.traces/` from DevTools. There are two implementations: a backend route and Vite dev middleware. | Change: **remove the backend route** (or gate it to dev builds and put it on the authenticated `api` router) and keep the Vite dev middleware. The route is registered on the root `app`, not on `api`, so it has **no basic auth, CORS `*`, in every build**, and it writes a file under a directory taken from the request body (`worktree`). | Security (AGENTS.md: address concrete risks at deployed boundaries) | `set` |
| P30 | Prompt-review Easel: `components/debug/prompt-review-workbench.tsx`, `components/debug/prompt-reviews/**` (Proposals 01 and 02, with before and after text), `web/test/prompt-review-registry.test.ts` | A DevTools tab for comparing prompt proposals | Keep the tool, which is working code with a test. Mark Proposals 01 and 02 as historical, since both predate N3. Prompt changes are judged by eval transcripts (N11), not by side-by-side proposals. This is the default; the user can override it. | N11, N18 | `set` |
| P31 | DevTools plumbing: `buddy-devtools.tsx`, `devtools-navigation-store.ts` and its test, `devtools-easel-tab.tsx`, `ui/components/ui/tabs.tsx` (passes `orientation`) | Tab navigation for the Evals and Prompt engineering tabs, and a Tabs orientation fix | Keep with P28 (and P30 if kept). | — | `set` |
| P32 | Skill validator: `buddy/script/{skill-validator,validate-skill}.ts`, `check-bundled-skills.ts`, the `skill:validate` script in the root `package.json`, `skill-management/README.md`, and tests | Validates skill YAML, metadata, naming, and description length during `bun lint` | Keep. This is tooling, independent of the teaching direction. | — | `set` |
| P33 | Test edits that follow the prompt changes: `persona-prompts`, `buddy-runtime-plugin`, `tool-schema-compatibility`, `bench-turn-context`, `native-resource-prompt`, `model-runtime-context`, `flashcard-edit-context`, `image-edit-prompt`, `imagegen`, `resource-context`, `learner-context-delivery`, `svg-rendering/*`, `parity/agent`, `skills/*`, `web/test/{get-started-chats,slash-autocomplete,bench-surface-render,user-section-native-resource,chat-debug-helpers,vite-config}` | Mostly remove prose assertions (P8) or follow the moved files | Keep. Re-run them after each triage change. P22's test is restored separately. | P8 | `set` |

### Added during the convergence sessions (2026-09-28)

| # | Unit | What it is | Direction | Basis | Status |
|---|---|---|---|---|---|
| P34 | `docs/architecture/design/tool-surface.md` and its line in `docs/README.md` | The durable audit of every Buddy tool, with the merge and cross-reference rules | Keep. Update it whenever a tool is added, merged, or removed. | N25, N27, N28, N30, N35 | `set` |
| P35 | `…/teaching-on-the-bench/archive/teaching-plan.p.md` | Verbatim archive of the removed teaching plan | Keep until N14's human check decides whether the plan returns. | N14 | `set` |
| P36 | `…/teaching-on-the-bench/question-scratchpad.md` | The working file for the current question (N0 rule 8) | Keep while the convergence work runs. Leave it out of any commit. | N0 | `set` |
| P37 | `…/teaching-on-the-bench/{room,tool-guidance,principles}-research-report.md` | Research reports in progress (N34) | Keep as research inputs, like P4. They are evidence, not rules. | N34 | `set` |
| P38 | DevTools "Tool design" tab: `web/src/components/debug/tool-design-workbench.tsx`, `tool-designs/**`, the `tool-design` tab and `toolPromptID` in `devtools-navigation-store.ts`, and tests (2026-10-01) | Shows each tool as the model reads it (description, arguments, example returns), today's tools beside a proposed one. Tool design 01 proposed the N30 `present` merge (now historical); Tool design 02 proposes N38. | Keep. Frozen text, like the prompt Easel; update a design when its tools change. **Locked (2026-10-01): parameters are shown as a prompt-script signature generated from the JSON schema: TypeScript-like structure, with each description shown verbatim (its own line breaks kept, never re-wrapped) as a `//` note above its field. It conveys the point; it need not be valid TypeScript. Structure is syntax-coloured; descriptions are readable prose, not dimmed. The raw JSON schema sits behind a toggle.** | N30 | `set` |
| P39 | Prompt Easel Proposals 03 (Bench prompt, applied) and 04 (`present_media` visibility, proposed), and the dropdown sidebar in `prompt-review-workbench.tsx` (2026-10-01) | Reviews for P18 and N30 step 1 | Keep. | N18, N30 | `set` |

### Status for this session's objective (2026-09-28)

Every unit P1–P33 now has a direction. None is left at `decide`.

**Waiting on research, then eval:**
- P13: the persona's description of the room;
- P19: tool descriptions;
- P24: whiteboard-authoring.

All three depend on the per-tool analogy study (the O7 gaps, N13 step 1).

**Waiting on eval (Part 4):**
- P11: the form of the concision boundary (N9 cases);
- P14: whether the teaching plan returns (N14);
- P15: the content of the principles (N15, analogy then eval);
- P23: the effect of the "Learner sees" lines (N16).

**Can be executed now** (Part 3, the `set` rows), in this order:
1. **Security.** P29: the backend trace route.
2. **Revert.** P6.
3. **Regression.** P22: the ingestion caution.
4. **Prompt edits:**
   - P14: remove the teaching plan;
   - P15: remove principle 16;
   - P16: skill-trigger wording;
   - P18: Bench prompt lines;
   - P23: `teaching-models` trigger and plumbing.
5. **Rework.** P28: the eval runner graders.
6. **Separate commits.** P5 and P9.

---

## Q. Prompt-change audit: does each prompt change have a direction concrete enough to edit? (2026-09-28)

A prompt change here is anything the model reads:
- persona prompts;
- the feature prompt;
- tool descriptions and parameter descriptions;
- skills and their references;
- prompt text inside tool results.

Status key:
- ✓ means a locked entry says exactly what to do.
- **gap** means the governing principle is missing or ambiguous, so editing now would be guessing.

**Persona prompts**
| Change | Status | Direction |
|---|---|---|
| `shared/teaching-plan.p.md` and its two insertions | ✓ | Remove it (N14). It is archived. |
| `shared/teaching.p.md` | ✓ | Keep principles 1–15 and remove 16 (N15). |
| `shared/product.p.md` | ✓ | Keep the vocabulary and formatting. Make skill triggering a judgment call (N6, O1). Remove "Teaching skills inform your teaching plan" (N14). |
| `shared/constitution.p.md` | ✓ | Keep. Treat its "Let explanations reach coherent stopping points…" line as part of the concision question (N9 eval). |
| `concise-response-preference.p.md`, the concision transition reminder, the settings label | ✓ | N9: bound replies by digestibility, in proportion to the question. Write candidate wordings and choose by eval. |
| `shared/visual-guidance.p.md` ("Show the idea") | **gap A** | N3 removes the when-to-show rules. N12 allows the system prompt to point to tools. Nothing says what, if anything, the persona prompt should say about the room. |
| Deleted `sections/**` files | ✓ | Their content moved or was dropped consistently with the N entries:<br>• `show-dont-tell`, with its "reach for them constantly" and "HTML widgets first": dropped by N3 and N8;<br>• the learner's `teach-through-conversation` (Socratic, one idea per turn): dropped by N3, and its example moved into the `socratic-diagnostic-questioning` reference;<br>• the teacher's version: carried into `teaching-assistant.p.md`;<br>• `about-buddy`: moved to `buddy-help/references/about.md`;<br>• `formatting` and `vocabulary`: moved to `product.p.md`;<br>• `resources`: its skill pointer dropped (N6);<br>• `pick-a-teaching-model` ("when in doubt, choose socratic"): replaced under N7. |

**Feature prompt**
| Change | Status | Direction |
|---|---|---|
| `features/bench/bench-feature.p.md` | ✓ | Remove the four teaching-choice lines. Keep the description of how the Bench behaves and the short-clause line (N18). |

**Tool descriptions and schemas**
| Change | Status | Direction |
|---|---|---|
| Parameter `.describe()` additions | ✓ | Keep (N12). |
| `ingest-full-text.ts`: the caution was removed | ✓ | Restore it with N9 wording (P22). |
| Description text for the 12 tools in P19 | **gap B** | N12 says a tool owns when, how, why, and why-not. N3 says the model decides whether to show, what, and where. It is undecided whether a tool's "when to use" is allowed to claim teaching situations (for example, the whiteboard's "building up a structure while explaining") or only capability fit ("position carries meaning"). There is no agreed template or size. |
| **Balance finding (N8).** Word counts, `main` → branch | — | Widget 565 → 748; whiteboard 350 → 661; Mermaid 416 → 345; imagegen 274 → 355; freeform 86 → 288; figure 115 → 225; calculator 84 → 222. The whiteboard and widget descriptions are now the largest by a wide margin. That is the same kind of imbalance that caused the Mermaid overfitting. Resolve it under gap B. |

**Skills**
| Change | Status | Direction |
|---|---|---|
| `teaching-models` and its references | ✓ | Change the trigger to uncertainty or failure. Don't force reading a reference, and allow choosing none (N7). Remove the plumbing to the teaching plan. Keep the "Learner sees" lines as method only (N16). |
| `teach-mathematics` ("nontrivial" calculator use), `buddy-help` (the Help doc on auto-open) | ✓ | Keep. |
| `whiteboard-authoring`: the "2 frames a turn" pacing rule removed | ✓ | Keep the removal (N3). |
| `whiteboard-authoring`: description, examples, routing, and its 7k-word size | **gap C** | Unclear what a skill may prescribe. |
| `reading`: the "Source as Learner-Facing Evidence" section (present the source on the Bench, build on the whiteboard, open the Browser) | **gap C** | These are placement and tool-choice instructions inside a skill. N16 removed placement from `teaching-models` under N3, but no general rule for skills exists. |
| New skills `explanatory-drawing`, `interactive-pages`, `find-and-show-resources` | **gap C** | They are craft, which is fine. But `find-and-show-resources` prescribes "find before you make", and all three carry routing into their descriptions. |
| Rest of the `reading` rewrite, and `summarise` | ✓ | Keep. Summaries must follow N9. |

**The three missing principles**, each to be asked as a separate question:
- **A.** What is the persona prompt's job with respect to the room and its tools?
- **B.** What does a tool description contain? May its "when to use" name teaching situations, or only capability fit? How big may it be?
- **C.** What may a skill prescribe: methods and craft only, or also placement and tool choice?

B affects the most files.
