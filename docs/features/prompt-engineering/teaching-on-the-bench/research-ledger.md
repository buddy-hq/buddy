# Research Ledger — Teaching on the Bench

A running record of what has been examined for [the problem](problem.md), so nobody researches it again. Every entry names its source, the observation, and what it implies. Add new entries at the end of the relevant section, and update an entry's status rather than deleting it when later work changes it.

**Status tags:** `fact` (verified in code or source), `finding` (an interpretation of sources), `open` (still to verify), `superseded` (no longer true; say what replaced it).

Last updated: 2026-09-24.

---

## A. Buddy's current state (verified in code on `fix/visuals-prompt`)

**A1 · Where each visual lands** · `fact`
- Inline in chat: `render_mermaid` (`diagrams/tools/render-mermaid.ts:151`), `render_figure`, `render_freeform_figure`, `python_calculator` plots, `imagegen`, `present_media`, flashcard decks, question sets.
- Auto-open on Bench: `whiteboard_create_view` always (`policyID: "whiteboard"`); `present_html_widget` always (inline card plus a Bench auto-open).
- Explicit Bench: `bench_present` (files, reading resources, objects, `focus_tab`, `close`) and `inapp_browser_open` (a new Bench tab on every call).
- **Implication:** choosing a tool is currently also choosing a placement. The model cannot deliberately decide "inline" versus "Bench" for most representations.

**A2 · A code comment says the placement policy is undecided** · `fact`
`features/html-widgets/tools/present-html-widget.ts:26`: "Temporarily auto-open every viewport preset on Bench until we find a better pattern for which widgets stay inline-only vs open on Bench." The "when to open the Bench" problem is a known TODO in code.

**A3 · Every visual tool disclaims the generic request** · `fact`
On this branch:
- Mermaid: "A request for a visual does not by itself select Mermaid."
- Whiteboard: "A generic request to explain, draw, or show a diagram does not by itself select a whiteboard."
- Image generation: "A generic request to explain, draw, or show a diagram does not by itself select image generation."
- HTML widget: only when runtime behavior is needed.

No tool owns the default for "explain X" or "show me X". The persona prompt tries to own it through a media list, but that list names tool families and conflicts with the tools (A4). **Implication:** the most common teaching request has no owner.

**A4 · The system prompt contradicts the whiteboard tool** · `fact`
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

**A19 · Whiteboard pacing contradicts the constitution** · `fact`
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

**G9 · Heath & Heath, *Made to Stick*** (Calibre #874; converted to text in the session scratchpad; not parsed into `chapters/`) · `finding`
- **Curse of Knowledge:** "Once we know something, we find it hard to imagine what it was like not to know it." "Accuracy to the point of uselessness is a symptom of the Curse of Knowledge."
- **Schemas:** "Good teachers intuitively use lots of schemas… start with compact, stripped-down examples." Examples: idealized pulleys, a two-person apple and orange trade, "a pomelo is a supersized grapefruit". The schema is then "stretched along some dimension."
- **Concreteness:** "our brains are wired to remember concrete data."

**Implications:**
1. A complete, expert-grade diagram on a first encounter (the full VGG-16) is Curse-of-Knowledge output.
2. Start with the smallest concrete model, then extend *the same* representation. This argues again for a persistent Bench object (G7).

**G10 · Knaflic, *Storytelling with Data*** (Calibre #2799, converted to text) · `finding`
- "Exploratory vs. explanatory… Concentrate on the pearls." Show the finding, not all the data.
- **Plain text:** "When you have just a number or two… simple text."
- **Tables vs. graphs:** "Tables interact with our verbal system", so they are read. "Graphs interact with our visual system", so they are seen.
- **Chart types:** lines for continuous data or time; slopegraphs for two points in time; bars for comparing categories.

**Implication:** these rules belong in the calculator/plot tool description ("how much" pictures). Proposal 02 already points this way.

**G11 · Orlin, *Math with Bad Drawings*** (Calibre #761, converted to text) · `finding`
Weak source for routing. It says the drawings are deliberately crude, and "statistics are not so different from stick figures. They're bad drawings of reality." It supports G5 (substance over looks) only anecdotally.

**G12 · Tufte, *Visual Explanations*** (Calibre #2802) · `open`
The PDF is scanned images with no text layer, so it can't be searched. It needs OCR before it can be cited. Until then, do not quote Tufte.

---

## H. Product direction stated by the user (2026-09-24)

- **H1:** The Browser can host anything Buddy authors: web apps, artifact-style pages, games. "Eventually, our plan is also to replace the widget tool with the web browser itself." Runtime and interactive teaching should therefore be routed to a *Browser-hosted page* as the long-term instrument. `present_html_widget` is an interim path.
- **H2:** The Browser also opens YouTube videos and many resources at once. Integrations such as a YouTube skill come later. For now, treat the Browser as the instrument for **finding** existing material (video, simulation, article, figure, interactive) as well as for **making** it.
- **H3:** The resource pipeline (`prepare_resource`, the Bench reader, the `reading` skill) can put whole PDFs and books on the Bench. The learner's own library is therefore the first place to *find* a source before the web.

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
