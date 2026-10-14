# Teaching on the Bench — Problem Statement

Read this before changing Buddy's persona prompts, tool descriptions, or skills for visuals, the Bench, or concision. It says what problem we are solving, what has been tried already, and where to look for sources. Research findings live separately in [research-ledger.md](research-ledger.md). Check the ledger before you research anything again.

## The problem in one paragraph

Buddy is a teacher with a classroom. The chat is the conversation. The **Bench** is the room's board, projector, and desk: the place where the teacher puts things for the learner to look at, work on, and come back to. Buddy has many things it can put there: whiteboards, Mermaid diagrams, figures, plots, HTML widgets, a browser, documents, reading resources, flashcards, question sets, generated images, and media files. What Buddy lacks is a **coherent system for deciding, while teaching,** whether to show anything, what to show, whether it belongs inline in chat or on the Bench, when to open, switch, or return to a Bench tab, and how those choices build across a lesson. Today those decisions are scattered across the system prompt, tool descriptions, and skills, and some of them contradict each other.

## The motivating example

A learner asks: *"Can you explain a convolutional neural network to me?"*

What would a good teacher with this classroom do?

- Show a finished picture of the whole architecture: the classroom version of downloading a textbook figure, or rendering a Mermaid diagram.
- Draw it on the board layer by layer, explaining each part as it goes up: the whiteboard.
- Combine the two: sketch the core idea (a kernel sliding over an image), then show the canonical full-architecture diagram.
- Send the learner to real material, such as an interactive CNN explainer or a paper figure: the browser.
- Let the learner try it themselves, for example by dragging a filter across an image and watching the feature map change: an HTML widget.

A teacher picks by **teaching purpose, the learner, and the stage of the lesson**, and the choice changes as the lesson moves on. Buddy should do the same. It should not pick whichever tool its prompt happens to emphasize, or default to prose because every tool says "not me".

## The problems, in priority order

### 1. Teaching with the Bench (the crux)

At first this looked like "whiteboard or another visual tool?" It is really **a question about the Bench**:

- **Whether:** does this moment need a visual or a shown object at all, or is prose enough?
- **What:** which kind of representation does the teaching job need? For example, a finished diagram, one built up step by step, a real source, a manipulable model, a plot, or a worked record.
- **Where:** inline in the chat, where it is read once as part of the reply, or on the Bench, where it can be kept, revisited, extended, or manipulated?
- **When:** when to open the Bench, when to leave it closed, and when to hand focus back to the chat.
- **Across turns:** how to use tabs and the tab switcher. When to extend an existing tab or create a new one, how to return to an earlier tab, and how to avoid assuming that two tabs are visible at once.
- **Agentic teaching:** how Buddy runs a lesson through the space. It should decide, show, point at, build, and hand over, the way a teacher uses a room, rather than making isolated tool calls.

### 2. Concision

The old prompt told Buddy to write like WhatsApp: 1–4 sentences, no headers or bullets. It overfit to one-paragraph answers and cut content learners needed. The branch replaces it with a broader definition: brief but complete, length matched to the task, and never shrinking the scope that was asked for. This is **mostly worked out but not verified**. Confirm it no longer truncates explanations and still keeps casual turns short. Also check how concision interacts with visuals: a good visual can replace paragraphs, and visuals still need prose that tells the learner how to read them.

### 3. Tool descriptions

Tool descriptions are uneven. Some lack what a description must carry, such as when to use the tool, when not to, what it returns, and where the result appears. Parameters are not always defined clearly. Some descriptions are long operator manuals, and others are one line. This is tied to problem 1, because a tool's routing belongs in its description.

### 4. Scattered routing (cross-cutting)

Routing guidance currently sits in three places without a rule for which is which:

- the persona system prompt, which lists media types and when to use each;
- tool descriptions, where each tool also says when to use it and when to use a sibling tool;
- skills, such as `teach-mathematics`, which route to specific tools, and `teaching-resource-authoring`, which routes to Bench documents.

These layers disagree. For example, the shared visual guidance recommends the whiteboard for "model architectures", but the whiteboard tool says a generic request to explain or draw "does not by itself select a whiteboard".

## Principles we are adopting

1. **Work from first principles.** Earlier work in this area (below) is input, not an anchor. If it points the wrong way, drop it.
2. **Think like a teacher in a room.** Base every routing rule on what a good teacher would do with this learner at this moment.
3. **The system prompt does not name tools.** Tools come and go by feature, provider, and permission. The persona prompt can describe teaching moves and kinds of representation. The routing for a specific tool (when to use it, when not to, and its nearest alternatives) lives in that tool's description. Skills follow the same rule. This matches current frontier system prompts; see the ledger.
4. **Give each decision exactly one home.** A choice should not be encoded in two layers that can drift apart.
5. **Leave nothing without an owner.** If every tool disclaims the generic "explain / draw / show me" request, nobody catches it. Something must own the default.

## What has already been done

Treat this as context, not as the answer.

- **Branch `fix/visuals-prompt`:** the persona prompts were restructured into shared sections (`shared/constitution`, `shared/product`, `shared/teaching`, `shared/visual-guidance`). The new concision prompt `concise-response-preference.p.md` replaced the WhatsApp-style one. The visual tool descriptions (Mermaid, whiteboard, HTML widget, figures, image generation, calculator) were rewritten to be stricter about when they apply. Live prompts are changed on this branch; nothing is merged.
- **Seven deep-research reports** in `docs/sources/`, each on one medium or situation: examining the source itself, interactive visualizations, purpose-built static diagrams, geometrically accurate figures, graphs, diagrams built versus revised versus shown complete, and whiteboard use by instructors.
- **The prompt-engineering Easel** (Buddy DevTools → Prompt engineering) at `packages/web/src/components/debug/prompt-reviews/`. It holds two proposals with frozen before/after text:
  - **Proposal 01, whiteboard selection:** lean shared visual guidance, ten positive examples in the whiteboard tool, and a short skill description.
  - **Proposal 02, visual teaching system:** source inspection, Bench continuity, fading support, meaningful widget interaction, geometry accuracy, plots, finished diagrams, and illustration versus evidence.

  Neither proposal has been applied to the live prompts.
- **Pedagogy distillations** in `~/Code/resources`: `visualization/visual-thinking-guide.md` (maps the dominant question to a figure type; its own TODO says it has "too much what, not enough how") and `whiteboard/digital-board-workflow.md` (board modes and zones for digital boards).

## Resources

| Resource | Where | Use it for |
|---|---|---|
| Live prompts | `packages/buddy/src/learning/personas/prompts/` | Persona prompts and shared sections |
| Tool descriptions | `packages/buddy/src/learning/features/*/tools/*.md` and inline `description:` in `*.ts` | Per-tool routing and parameters |
| Skills | `packages/buddy/src/learning/features/*/skills/*/SKILL.md` | Workflows; some contain routing today |
| Feature prompt fragments | `defineBuddyFeature({ prompt: { instructions } })` | Conditional system-prompt text shown only when a feature is enabled |
| Per-turn Bench state | `packages/buddy/src/learning/prompt/user-prelude/index.ts` | What Buddy is told each turn about Bench tabs and visibility |
| Easel proposals | `packages/web/src/components/debug/prompt-reviews/` | Before/after prompt comparisons |
| Deep-research reports | `docs/sources/deep-research-report (1–7).md` | Evidence on each medium |
| Dogfooding | `docs/reviews/dogfooding-feedback.md` | Real complaints: modality choice, reading skill ignores Whiteboard and Browser |
| Teaching library | `~/Code/resources` (books, parsed chapters, distillations; search Calibre first, see its `AGENTS.md`) | Pedagogy grounding |
| System prompts | `~/Code/CL4R1T4S` | How frontier products route visuals and write tool descriptions. **Use only prompts from roughly the last year:** Claude Opus 4.5 and later, Fable 5/5.1, Opus 5/5.5, Claude Design; GPT-5 and later, including GPT-6 in `OPENAI/Codex_Desktop`; Grok 4.1 and 4.20; Meta Muse Spark |
| Skills vaults | `~/Code/agentic/skills_vault` | How other agents package skills |
| Web | Browser and web search | Vendor tool-writing guidance, learning-science sources |
| Research ledger | [research-ledger.md](research-ledger.md) | Everything already observed. Add to it, don't repeat it |
| Routing model | [routing-model.md](routing-model.md) | The contract for choosing what to show, with which instrument, and where: five questions, six shapes, and the Mermaid, whiteboard, SVG, and Browser test |
| Proposed direction | [Teaching on the Bench (artifact)](https://claude.ai/artifact/5A5xgrLMKybWXhLuUDnFKH) | The decision map, placement rule, declared defaults, tool-description template, 12-prompt yardstick, and step-by-step plan drawn from the ledger |

## Vocabulary

- **Bench:** Buddy's workspace for content that needs more room than the chat. One tab is visible at a time. Layouts are docked (Bench on the left, chat on the right) or floating (Bench full width, chat in a movable window). The Bench can be closed, visible, or **parked** (open but hidden). **Drawers** (Search, Sources, Practice, Creations, Boards, Notes, Files, Skills) can cover the loaded tab.
- **Inline:** rendered inside the chat transcript as part of the reply. Mermaid, figures, plots, generated images, media, flashcard and question-set cards appear here.
- **Tab switcher:** the Bench's tab list. The model sees it through the per-turn Bench context and through `bench_read_context`, and moves between tabs with `bench_present`.
- **Easel:** the prototyping space inside Buddy DevTools. The prompt-engineering tab is where prompt changes are reviewed.

## What "done" looks like

By the end of this effort:

- Each decision (whether, what, where, when, across turns) has one home, and the layers agree.
- The generic "explain X" case has a defined owner and a defined default.
- Every tool that puts something in front of the learner has a complete description: purpose, when to use it, when not to, nearest alternative, where the result appears, what it returns, and parameters that are clearly defined.
- Concision is verified against real prompts, including long explanations and casual turns.
- Behavior is checked against a fixed set of teaching prompts (CNN, photosynthesis, a geometry proof, a history source, a data question, a follow-up turn) before and after each change.
