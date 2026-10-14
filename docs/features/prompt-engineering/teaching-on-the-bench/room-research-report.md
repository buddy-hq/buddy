# "The Room": How Frontier Products Describe Their Surfaces, Where Outputs Go, and When to Show Unasked

Research report for the Teaching on the Bench effort (ledger N32). Written 2026-09-28. Read-only survey of `~/Code/CL4R1T4S` plus Buddy's current prompts.

Status: DONE (2026-09-28).

## 1. Summary

- **The room is three things, and products keep them apart.** A factual map of surfaces, a destination policy, and an initiative policy sit in different blocks in Cowork, Codex, and claude.ai. They fold together only in decision procedures, because "where" depends on "whether".
- **The map is short and factual:** what each surface is, what the user sees there, one-at-a-time or not, and the verb that puts something in front of them. Cowork's built-in browser panel is the closest match to the Bench. Nobody writes a long room essay.
- **Destination policies use intent, not content type.** Cowork: "Outputs depend on where they are going to live" (read once, file, or keep and edit). Buddy's "Place it by what the learner will do with it" already has this basis.
- **Initiative is pushed by claude.ai and Codex, always with a brake** ("Most requests are conversational"; "usually skip visuals for single facts"). No product pushes without one.
- **O7.7 is mostly confirmed.** claude.ai keeps the push in a tool-scoped system block (its Visualizer description is neutral). Codex keeps it in the base prompt. Grok is an exception (a cheap tool carries its own triggers), and Cowork puts the teaching push in a tutoring skill. (Partly inference.)
- **Truthfulness is mostly done by tools.** `tabs_context` reports hidden or displayed; `done` returns errors; `open_in_codex` says it "only opens Codex UI". Narration rules forbid naming routing or machinery but allow an outcome clause, like Buddy's "I've put the circuit on the board".
- **The split misses:** the dynamic half of the map (Buddy says nothing when the Bench is closed), continuity (home tab, promotion), tool availability, and a home for teaching-specific initiative.
- **Recommendation:** the persona prompt carries the map (surface properties, no tool names), one visibility-honesty rule, and, if the owner accepts it, one "permission plus brake" sentence on showing unasked. The Bench feature prompt keeps behaviour facts. Tool descriptions say where results appear and what the user can see.

## 2. Sources surveyed

Paths are relative to `~/Code/CL4R1T4S`. Dates are the last git commit date of the file. Older prompts (Claude 4.5 and earlier, ChatGPT 4o, Grok 3/4) were skipped.

| File | Product | Date | Relevance |
|---|---|---|---|
| `ANTHROPIC/CLAUDE-OPUS-5.5.md` | Claude Cowork, Opus 5.5 | 2026-09-22 | Best map and destination policy. Panel rules for the built-in browser. A `learn` (tutor) skill with a visual push. |
| `ANTHROPIC/Claude-Fable-5.1.md` | claude.ai, Fable 5.1 | 2026-09-01 | Visual checklist with brake and proactive triggers. File and artifact rules. |
| `ANTHROPIC/OPUS-5.md`, `Claude-Opus-4.7.txt` | claude.ai, Opus 5 and 4.7 | 2026-07-24, 2026-04-16 | Same checklist as Fable 5.1. Confirms the block is stable across models. |
| `ANTHROPIC/CLAUDE-FABLE-5.md`, `Claude_Opus_4.6.txt` | claude.ai without the Visualizer | 2026-06-15, 2026-02-06 | Control: no Visualizer, no visual checklist. |
| `ANTHROPIC/Claude-Design-Sys-Prompt.txt` | Claude Design | 2026-04-17 | Agent view vs user view. A "show" tool. |
| `OPENAI/Codex_Desktop/GPT-6-Sol_Prompts.txt`, `GPT-6-Sol_Tools.json` | Codex desktop, GPT-6 Sol (the model in session L) | 2026-09-22 | Visualization policy. Desktop media map. `open_in_codex`. |
| `OPENAI/Codex_Desktop/5.6-Sol_SystemPrompt.md` | Codex desktop, 5.6 Sol | 2026-07-14 | Stricter visualization policy. A `visualize` skill. Browser and Sites rules. |
| `OPENAI/Atlas_10-21-25.txt` | ChatGPT Atlas | 2025-10-21 | Three layout modes. Canvas brake. |
| `OPENAI/ChatGPT5-08-07-2025.mkd` | ChatGPT (GPT-5) | 2025-08-07 | About 14 months old. Used only for the canvas tool line. |
| `XAI/GROK-4.20.mkd` | Grok 4.20 | 2026-02-17 | Render components. Initiative written in a tool description. |
| `META/Muse_Spark_Apr-08-26.txt` | Meta AI, Muse Spark | 2026-04-08 | Media tools with visibility facts. Reactive only. |

Buddy's own files are listed in the task brief and cited by name below. Limits: these are captured prompts. Some are partial, and a block that is missing from a capture may only be missing from the capture. Where I say "conditional", I checked that captures without the tool also lack the block.

## 3. Question 1: a factual map of surfaces

**Every product with more than one surface states the facts somewhere. Almost none writes a single "room" paragraph.** The map is split by surface and attached to the thing that delivers to it.

| Product | What the map says | Where it sits | Size |
|---|---|---|---|
| Cowork (Opus 5.5) | `<workspace_and_tools>` opens: "This section is a reference… When to use it is covered next." (`CLAUDE-OPUS-5.5.md:363`). The workspace is invisible: "the person cannot see into it" (`:370`). An artifact shows as a card (`:392`). Browser availability varies (`:423`). | Always-on system prompt, a separate "reference" block | About 90 lines, mostly plumbing |
| Cowork, built-in browser skill | The closest thing to Buddy's Bench. The pane shares a side panel that "shows one of them at a time"; while another item is open, "the person cannot see it" (`:17755`). `tabs_context` reports displayed, hidden, or not open (`:17757`). | A skill, loaded only when that browser is used | About 4 lines |
| Claude Design | Two views. `show_html` opens the agent's own iframe. `show_to_user` opens the user's tab bar (`Claude-Design-Sys-Prompt.txt:368-369`). "Reading a file does NOT show it to the user." (`:171`) | 3 lines in the prompt, the rest in tool descriptions | Very short |
| Codex desktop | Media renders inline through Markdown image syntax. "Relative paths and plain text will not render the media." (`GPT-6-Sol_Prompts.txt:524-529`). Other content needs `open_in_codex` (`GPT-6-Sol_Tools.json:813`). | A conditional fragment, `desktop.G3`, assembled per session (`:520`, `:626`) | About 10 lines |
| claude.ai (Fable 5.1) | An artifact is a file that "renders in the user interface" (`Claude-Fable-5.1.md:1300`). `present_files` makes a file reachable (`:1296`). No surface description beyond that. | Tool-scoped blocks for file creation | Small |
| Muse Spark | "Media shows automatically." (`Muse_Spark_Apr-08-26.txt:165`). "Generated files are not automatically visible" (`:175`). | Inside each tool's block | 1 line each |

**What a good map contains:** what each surface is; what the user sees there and what they do not; whether it is one-at-a-time; the verb that puts something in front of them (`show_to_user`, `present_files`, `open_in_codex`); and availability ("go by the tools actually present", Cowork `:423`). **What it leaves out:** when to use a surface. Cowork says so: tool descriptions say how, another section says when (`:454`).

**Buddy today.** `product.p.md:2` defines the Bench (tabs, one at a time, docked or floating). `product.p.md:3` defines inline. `bench-feature.p.md:1` and `:16` state the one-tab and parked rules. That is already a map, and a short one. `visual-guidance.p.md` mixes map facts ("a Bench") with policy.

## 4. Question 2: a destination policy

**Yes, several products have one, and it is separate from the map.** The basis is mostly *what the person will do with the output*, not what kind of content it is.

| Product | The rule (short quote) | Basis | Where it sits |
|---|---|---|---|
| Cowork | "Outputs depend on where they are going to live." (`CLAUDE-OPUS-5.5.md:312`). Read once here: a reply, and a picture may be inline (`:314-316`). Leaves as a file: a file (`:318`). Keep, return to, edit, or share: an artifact (`:328`). | Lifetime and audience | Top-level system prompt block, `<creating_outputs>` (`:311-345`) |
| Cowork, later change | A whiteboard is for things to "rearrange" or "work on together" (`:333`). If the person later wants to keep or share an inline visual, Claude "makes the fitting artifact" (`:344`). | Co-editing; change of intent | Same block |
| claude.ai (Fable 5.1) | "What matters is standalone artifact vs conversational answer." (`Claude-Fable-5.1.md:1254`). Artifact criteria list "Use artifacts for" and "Do NOT use artifacts for" (`:1302-1316`). | Reuse outside the chat; length | Tool-scoped blocks (file creation) |
| claude.ai, checklist | A file request wins over the Visualizer: "it is not a file tool." (`:1384`). | Explicit words in the request | Tool-scoped checklist block (`:1368`) |
| Codex (GPT-6) | Exports and shared figures: "use standard plotting tools and generate a standalone artifact instead" (`GPT-6-Sol_Prompts.txt:91`). Planning and explanation: "Prefer inline visualizations" (`:93`). | Whether the user will export or share | Always-on base template |
| ChatGPT canvas | "ONLY use if you are 100% SURE the user wants to iterate on a long document" (`ChatGPT5-08-07-2025.mkd:157`). | Whether it will be iterated | Tool description |

**Findings:**
- Anthropic and OpenAI decide by **intent and lifetime** (read once, keep, edit, share, export). Codex Astra adds: "Prefer answering inline in chat unless using local files would make the result more useful." (`GPT-6-Astra_Prompts.md:590`).
- Meta and xAI decide by **tool and content type**: charts go through Python, not the media tools (`Muse_Spark_Apr-08-26.txt:144`, `:171`). Grok's `render_file` shows plots saved to disk (`GROK-4.20.mkd:77`).
- Claude Design has no choice to make: every deliverable goes to the user's tab bar with `done` (`Claude-Design-Sys-Prompt.txt:210`).
- The Anthropic and OpenAI basis is what Buddy's "Place it by what the learner will do with it" (`visual-guidance.p.md:7`) already says.
- The rule sits in the **system prompt** in the two products whose persona owns the decision (Cowork, Codex). It sits in **tool-scoped blocks** where a tool family owns it (claude.ai files). Tool descriptions carry only the tool's own "don't" (canvas).
- Every policy names **the alternative**, so the model can compare: reply vs file vs artifact. A tool description alone cannot do this. (Inference.)
- The inline-to-persistent step is a named move (Cowork `:344`). Buddy has the same move in `bench_present` `present_object` (`bench-feature.p.md:17`).

## 5. Question 3: an initiative policy

**Three product families push unasked visuals. Every push comes with a brake in the same place.** Muse Spark, ChatGPT canvas, and Claude Design do not push: Muse runs media tools only on intent words (`Muse_Spark_Apr-08-26.txt:132`), canvas has only a brake (`ChatGPT5-08-07-2025.mkd:157`), and in Claude Design showing is the job (`Claude-Design-Sys-Prompt.txt:210`).

| Product | Trigger to show unasked | Brake | Where the push lives | Conditional on the tool? |
|---|---|---|---|---|
| claude.ai (Fable 5.1, Opus 5, Opus 4.7) | "Educational explainers: How does X work where the concept has spatial, sequential, or systemic structure" (`Claude-Fable-5.1.md:1402`). Also data shape and architecture (`:1403-1404`). Example: the water cycle gets a diagram (`:1431-1432`). | Step 0: "Most requests are conversational and fully answered by text." (`:1372`). "Simple definitions don't qualify." (`:1402`) | A tool-scoped system block, `<when_to_use_visualizer_for_inline_visuals>` (`:1394`), after the checklist (`:1368`). The tool description has no push (`:1807`). | Yes. `CLAUDE-FABLE-5.md` and `Claude_Opus_4.6.txt` have no Visualizer and no checklist. |
| claude.ai, image search | "Would images enhance the person's understanding…? … USE images" (`:1682`). | "only if they add value or understanding" (`:1683`) | A 70-line tool-scoped block (`:1679-1745`). | Yes |
| Codex GPT-6 Sol and Astra | "The user does not need to explicitly request a visualization." (`GPT-6-Sol_Prompts.txt:89`). Prefer interactive visuals for how-it-works and cause and effect. | "Usually skip visuals for single facts… Compact notation and small examples do not count" (`:95`) | The always-on base template, in the formatting section. It names formats (table, Mermaid, inline), not tools. | No |
| Codex 5.6 Sol (Jul 2026) | Same idea, but stricter: "only when it makes an important relationship materially easier to understand" (`5.6-Sol_SystemPrompt.md:62`). A list of "good candidates" (`:64-70`). | "Do not add one merely because an answer has components or steps." (`:62`) | System prompt, plus a `visualize` skill whose description triggers on "show how something works" (`:292`, `:3921`). | No for the policy. Yes for the skill. |
| Cowork (Opus 5.5), general | "when a diagram, chart or small illustration helps explain what Claude is saying… draws it inline… where this session offers that" (`CLAUDE-OPUS-5.5.md:316`). | "read once along with the rest of the reply" (`:316`) | Top-level `<creating_outputs>` block | Yes: "where this session offers that" |
| Cowork, `learn` skill (a tutor) | "When a concept has structure… a small diagram or interactive rendered in the chat will carry it further than a paragraph" (`:19343`). | "A visual that isn't carrying the concept is decoration… skip it for pure procedure" (`:19351`) | A skill, loaded when the user wants to learn something (`:19289-19305`). | Yes: "If the `show_widget` tool is available" (`:19345`). If not: a table, ASCII, or code block (`:19347`). |
| Grok 4.20, image search | Use when a web image would help; "Only trigger image search when the following factors are met" (`GROK-4.20.mkd:41`). | "Do not use it for abstract concepts" (`:41`) | The tool description | The tool is the description |

**O7.7 ("a vendor that wants a tool used proactively puts the push in the system prompt, not only the tool description"): mostly confirmed, with two exceptions and one refinement.**
- **Confirmed for claude.ai.** The Visualizer description is neutral (`Claude-Fable-5.1.md:1807`). The push and its brake are in a tool-scoped block, which appears only when the tool exists. Image search follows the same pattern.
- **Confirmed for Codex.** The push is in the base template, before any tool is chosen. The image-generation description is purely reactive: its first trigger is "The user requests an image" (`GPT-6-Sol_Prompts.txt:751-752`).
- **Refuted for Grok.** The push and its brake live in the `search_images` description (`GROK-4.20.mkd:41`). The exception is explained by the cost of the tool. It is one cheap call, not a read-the-guidance-then-write-code flow. (Inference.)
- **Refinement from Cowork.** The push for *teaching* lives in a skill that is triggered by learning intent, not in the base prompt or the tool (`CLAUDE-OPUS-5.5.md:19289-19351`). The general prompt carries only a mild, conditional line (`:316`).
- **Codex differs by model.** 5.6 Sol (Jul 2026) is strict; GPT-6 (Sep 2026) says "does not need to explicitly request". These are different models, so this may be tuning, not policy. (Inference.)

**Pattern:** the heavier the tool (read the guidance, then write SVG or HTML), the more likely the push lives outside its description. The push is always paired with a brake, and the brake is always in the same block. A push without a brake appears nowhere in this set.

**Connection to session L.** GPT-6 Sol ships in Codex with "does not need to explicitly request a visualization" in its own base prompt (`:89`). Buddy's prompt at the time opened with "most of the time you talk" (ledger L, cause 1). That is a brake without a push, which matches what the model did. (Inference: Codex's own push is not present in Buddy, so the model had only Buddy's brake.) If N3 removes Buddy's push and leaves no initiative text at all, the model falls back on whatever default it has outside Codex, and session L suggests that default is text.

## 6. Truthfulness about visibility; narration

**Truthfulness is handled three ways, and the strongest one is in the tool, not in a rule.**

1. **State the fact where the agent could get it wrong.**
   - "Reading a file does NOT show it to the user." (`Claude-Design-Sys-Prompt.txt:171`)
   - "A file that is written but never presented is unreachable" (`Claude-Fable-5.1.md:1296`).
   - "Generated files are not automatically visible to the user." (`Muse_Spark_Apr-08-26.txt:175`). The same block says media "shows automatically" (`:165`), so the two cases are contrasted.
   - The working directory is invisible: "the person cannot see into it" (`CLAUDE-OPUS-5.5.md:370`).
2. **Make the tool report what the user can see.**
   - `tabs_context` ends by saying whether the pane is displayed, hidden, or not open (`CLAUDE-OPUS-5.5.md:17757`).
   - `done` opens the file and returns console errors, so "the user should always land on a view that doesn't crash" (`Claude-Design-Sys-Prompt.txt:210`).
   - `open_in_codex` says "This only opens Codex UI" (`GPT-6-Sol_Tools.json:813`). For a hidden thread it returns "queued" rather than success (same line).
   - `SendUserFile` has a `display` parameter: `render` opens it "inline in the side panel right now", `attach` shows only a card (`CLAUDE-OPUS-5.5.md:32`).
3. **Do not act as if the user sees it when they may not.**
   - When the pane is hidden, Cowork asks the person to bring it back. Using the browser "does not bring the pane back, and what the panel shows is the person's choice" (`:17757`).
   - Afterwards it says what it found in the conversation, "because the person may not have been watching the pane" (`:17757`).
   - Codex skips `open_in_codex` in a background or invisible thread and says why (`5.6-Sol_SystemPrompt.md:3271`). If it fails, "report it and continue" (`:3269`).

**Narration: products separate routing from outcome.**
- **Do not narrate routing or machinery:**
  - "Claude does not narrate routing" (`Claude-Fable-5.1.md:1391`).
  - "Claude never exposes machinery." (`:1415`)
  - "Never announce this skill, a visualization surface, widgets, HTML" (`5.6-Sol_SystemPrompt.md:3935`).
  - Cowork on browser choice: "There is nothing to announce or offer" (`CLAUDE-OPUS-5.5.md:423`).
- **Do say the outcome in a natural clause.** claude.ai's own example is: "Here's a diagram of that flow." (`Claude-Fable-5.1.md:1415`). Cowork says to tell the person right away about a draft or a limitation (`:469`).
- **Buddy already has both halves.** `constitution.p.md:11` ("Don't narrate your process or announce which tool you're using") and `bench-feature.p.md:18` ("I've put the circuit on the board," without naming tools). They do not conflict, because the second names the outcome, not the tool. No change seems needed.

## 7. Does the three-way split hold?

**Yes, as a decomposition of the prompt. No, as three independent decisions.**

**Where it holds.**
- Every product with both a map and a policy keeps them apart. Cowork labels the split outright: the workspace block is "a reference", and "when to use it is covered next" (`CLAUDE-OPUS-5.5.md:363`).
- Codex puts the map (`GPT-6-Sol_Prompts.txt:520`) and the visualization policy (`:87`) in different places. claude.ai keeps file rules (`Claude-Fable-5.1.md:1299`) apart from the visual checklist (`:1368`).

**Where products fold them together.**
- **Destination and initiative are one decision in practice.** claude.ai's checklist asks "is a visual needed?" (initiative), "is there a file request?" (destination), and "which tool?" in one ordered walk (`:1368-1392`). Codex's section answers "whether" and "inline, Mermaid, or standalone artifact" in the same paragraphs (`GPT-6-Sol_Prompts.txt:89-95`). The answer to "where" depends on "whether".

**What the split misses.**
1. **A static half and a dynamic half of the map.** Which surfaces exist is stable. Whether the Bench is open right now is not. Cowork reads it through a tool (`tabs_context`, `:17757`). Buddy sends it in the per-turn prelude, but only when the Bench is open or parked. When it is closed, Buddy is told nothing (`system-map.md` section 2). (Inference: the model has no way to know that the user is seeing the chat only.)
2. **Truthfulness about visibility** spans all three (section 6).
3. **Continuity.** Extending a home tab and promoting an inline object are moves between destinations (Cowork `:344`; Buddy `bench-feature.p.md:14`, `:17`). They are neither map nor policy nor initiative.
4. **Availability.** "Go by the tools actually present" (Cowork `:423`). The system prompt must not assume a surface exists. This matters for Buddy because the tool set varies by machine and config.
5. **A fourth location for a teaching-specific push.** Cowork puts it in a tutoring skill (`:19343`), not in the base prompt. Buddy's analogue is the persona prompt.

### Recommendation for Buddy

Under N3 (the model decides) and N12 (tools own their usage):

**Persona prompt (stable, cached): carry the map and one honesty rule, with no routing.**
- Keep the short facts in `product.p.md`: what the Bench is, one tab at a time, docked or floating, and what "inline" means. Name no tools.
- Describe the *properties* of each place, not a rule for choosing. Inline is read in the reply and scrolls away with the chat. A Bench tab stays until closed and is seen by both. (Inference: this lets the model derive the destination itself. It is the same basis Cowork states, "where they are going to live", without telling Buddy what to do.)
- Add one visibility rule, in the style of Muse's and Claude Design's: something is seen by the user only if it is in the reply or in the selected Bench tab. A tool result alone does not show that.
- Delete the imperative "Place it by…" and "Match the shape…" paragraphs (`visual-guidance.p.md:7-9`) under N3. Keep the "no narration of tools" rule as it is.
- **Initiative is the one real decision.** The evidence says the default does not hold by itself. Every vendor that wants unasked visuals states the push and a brake together, in always-visible text, and none leaves it to a tool description for a heavy tool. The smallest form that fits N3 is a *permission with a brake* in the persona prompt, for example Codex's shape: "the user need not ask", plus "usually skip for single facts". It names formats, not tools, so it stays valid when tools change. Whether that counts as guidance or as an opinion is the owner's call (question 1). An eval replay of session L should settle whether it is needed, not vendor habits.

**Bench feature prompt (present only with the Bench):** keep the behaviour facts: per-turn status, `focus_tab`, Browser tabs cannot be refocused, promoting an inline object, and the short-clause announcement. Remove the four tab-job lines, as P18 already proposes. This prompt is shared by every persona, so it must not carry teaching initiative.

**Tool descriptions:** where the result appears, whether the user can see it, what the tool returns, and when not to use it (N30). Follow Codex's `open_in_codex` and Claude Design's `done`: have the result say what the user can see. Keep initiative out of heavy tools. A cheap tool may carry its own triggers (Grok's `search_images`).

## 8. Open questions for the product owner

1. Is a one-line permission with a brake ("you may show without being asked; skip it when a sentence does the job") guidance that N3 allows, or an opinion it forbids?
2. Should the persona describe the *properties* of inline and the Bench (what persists, what scrolls away) as facts, accepting that they imply a destination criterion?
3. Who owns teaching initiative: the teaching personas only, the Bench feature prompt (every persona), or nobody, accepting a text-first default?
4. Should "the user sees only the reply and the selected tab" be a global honesty rule in the persona prompt, or live only in tool results (N30)?
5. When the Bench is closed, should Buddy be told so each turn, or keep hearing nothing about it?
