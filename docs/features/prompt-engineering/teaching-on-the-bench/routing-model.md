# Routing Model — how Buddy picks what to show, with what, and where

This is the contract for visual and Bench routing. It answers "when Mermaid, when the whiteboard, when the Browser, when nothing?" Evidence IDs (A1, G1, …) point into [research-ledger.md](research-ledger.md). The problem is framed in [problem.md](problem.md).

## The idea in one paragraph

A teacher does not pick a tool. They decide whether words are enough; whether something real or already excellent exists to show; what the learner will *do* with what they see; what *shape* the idea has; and how rough or complete it should be. Buddy asks the same five questions in order and stops as soon as one settles the matter. The tool falls out of the answers.

## The five questions

### 1. Are words enough?

Look at the sentence you are about to write (G3, *Blah Blah Blah*'s "Vivid Grammar"). Does it contain any of these?
- a process or cause (complex verbs);
- a spatial relation (prepositions like *inside*, *between*, *feeds into*);
- a sequence over time (tense);
- quantities to compare;
- several interacting variables.

If none of these is present, answer in words. If the answer is one or two numbers, words still win (G10). A simple definition or small talk needs no picture (C1 step 0, C5).

### 2. Find, or make?

Before drawing anything, ask whether something real or proven already *is* the thing the learner should see:

- **The learner's own source.** A book, PDF, or article in their library, opened in the Bench reader through the resource pipeline and the `reading` skill (H3). Look here first.
- **The authentic object.** A photograph, specimen, primary document, or real figure, when appearance or wording is the evidence (B3.1).
- **A proven teaching resource.** A PhET simulation, a well-known explainer video, CNN Explainer, Desmos or GeoGebra, an encyclopedia figure (E4, E8, E11, H2).

If one fits, **find it and open it** on the Bench, in the reader or the Browser. Gemini Guided Learning made this choice on purpose: vetted diagrams and videos rather than generated ones (E4).

**Make it** only when nothing fits the exact need, or when the learner needs a version shaped to their current step.

Finding does not hand the teaching off. Open the resource at the right moment and give the learner a task: a timestamp to watch, a region to look at, a question to test (E10, E11).

### 3. What will the learner do with it?

This question decides the *surface*.

| The learner will… | Surface | Instrument family |
|---|---|---|
| Look once to understand this reply | Inline in chat | A render: diagram, figure, plot, table, image |
| Watch it being built while you explain | Bench (home tab) | Whiteboard |
| Keep extending it across turns (the lesson's record) | Bench (home tab) | Whiteboard |
| Act on it: change a value, run it, play it | Bench (Browser) | An authored web page. Today this is `present_html_widget`; long term, a Browser-hosted page (H1) |
| Inspect a source closely | Bench (reader or Browser) | Keep the source selected; reason in chat |
| Keep and use it later (notes, handout, worksheet) | Bench (document) | Document (`teaching-resource-authoring`) |
| Practice or recall | Inline card, Bench practice | Question set, flashcards |

A render that the learner keeps returning to can be moved from inline to the Bench (`bench_present present_object`, A13).

### 4. What shape is the idea?

This question decides the *notation*: the specific instrument inline, and what to draw on the board or build in the page.

Dan Roam's rule: each of the six ways we see has one way of showing, and each way of showing has its own **coordinate system** (G1). An instrument fits when its native coordinate system matches the idea's.

| The idea is about… | Picture (Roam) | Coordinate system | Inline instrument | Examples |
|---|---|---|---|---|
| **Who/what**: the parts, what it looks like | Portrait | Pictorial | A real image (find) or a labelled illustration | Mitochondrion, a cell, an instrument |
| **How much**: quantities | Chart | Quantitative axes | Table for exact lookup; plot for a pattern (G10) | Populations, test scores, function values |
| **Where**: how things fit together in space | Map | Free spatial (position means something) | Freeform SVG; constrained figure for exact geometry | Anatomy, circuit layout, CNN feature maps shrinking |
| **When**: order, stages, history | Timeline | Temporal | Mermaid timeline; table | Causes → revolution → aftermath |
| **How**: process, steps, states, cause → effect | Flowchart | Topological (position is arbitrary; only the connections matter) | Mermaid (flowchart, sequence, state) | Water cycle, TCP handshake, algorithm steps |
| **Why**: several variables interacting | Multivariable plot | Several axes at once | Plot (scatter, 2×2) | Trade-offs, cost versus features |

Two combinations come up often (G1): a time series (*how much × when*: a line plot) and a process over time (*how × when*: a sequence or swim-lane diagram).

### 5. How rough, and how complete?

Roam's SQVID sliders set the *version* of the picture (G2):

- **Simple vs. elaborate.**
  - For a first encounter, use the smallest concrete model with few elements (G9 schemas, G7). A rough board sketch beats a polished render (G5).
  - For a reference the learner will consult, use the elaborate, exact version.
- **Quality vs. quantity.** Use a qualitative sketch when meaning is the point; use exact values when precision is.
- **Individual vs. comparison.** When comparing, put the things side by side on the same scale.
- **Change vs. status quo.**
  - To show a change, use a before/after pair.
  - When the change *itself* is the lesson, let the learner drive it (question 3: act on it).
- **Complete but not done** (G4, C10).
  - When the learner should construct part of the picture, leave that part for them.
  - When they need the whole configuration to reason about or predict from, show it complete (B3.6).
- **Show the pearls, not the oysters** (G10): the finding, not every data point.

## The Mermaid / whiteboard / SVG / Browser test

Most confusion is among these four. The short test is below. Stop at the first "yes".

1. **Will the learner act on it** (change a value, run it, play it)? → An authored page on the Bench Browser (today: `present_html_widget`).
2. **Will it be built while you explain, or extended across turns?** → The whiteboard.
3. **Does position carry meaning** (size, distance, containment, direction, layout)?
   - Yes, and it is exact geometry → a constrained figure.
   - Yes, and it is a finished picture read once → freeform SVG.
   - (If it will be built up or revised, test 2 already sent it to the whiteboard.)
4. **Is it only connections, order, or hierarchy**, where the layout could be rearranged without changing the meaning? → Mermaid.

Quantities go to a table or plot, and appearance goes to a real image, before this test applies (question 4).

Question 2 still comes first: if a great version already exists, open it rather than make one.

## Where each rule lives in the prompts

The system prompt stays free of tool names (problem.md, principle 3). Routing works because the persona prompt and the tool descriptions share **one vocabulary**:

- the six *shapes*: who/what, how much, where, when, how, why;
- the learner *actions*: look once, watch it built, extend it, act on it, inspect the source, keep it, practice it.

| Rule | Home |
|---|---|
| Questions 1, 3, and 5, and the find-before-make principle from question 2 | Persona prompt, "Teach with the room" section: the vocabulary, no tool names |
| Which instrument serves which shape and action (question 4, the four-way test) | Each tool's description claims its cell: "Choose this for *how* ideas where only connections matter, read once…" |
| Finding sources (question 2) | The Browser and reader tool descriptions, and the `reading` skill |
| Tabs, the home tab, promoting inline objects, returning to earlier work | Bench feature `prompt.instructions` |
| How to draw or author well | Skills (`whiteboard-authoring`, `teach-chemistry`, `teach-mathematics` protocols) |

## Worked routes

| Request | Q1 words enough? | Q2 find/make | Q3 learner does | Q4 shape | Result |
|---|---|---|---|---|---|
| "Explain a CNN to me" | No: process, and the layers shrink in space | Make the frame first; open CNN Explainer once the idea lands | Watch it built, then extend | *How* plus *where* (position means something) | Whiteboard home tab, built left to right; the Browser later |
| "What's a CNN?" | Nearly; one picture helps | Make | Look once | *How* (the connections are enough at this level) | Two to four sentences plus an inline Mermaid |
| "Explain photosynthesis" | No | Find, if the chloroplast's appearance matters; otherwise make | Look once | *How* (inputs → process → outputs) | Inline Mermaid, or a real diagram |
| "Why do a triangle's angles sum to 180°?" | No | Make | Look once (or watch the derivation) | *Where*, exact geometry | Constrained figure inline; proof in prose |
| "How does the interest rate change my payment?" | No | Make | Act on it (or look once) | *How much* × *why* | Browser page with a slider, or one inline plot |
| "What does figure 3 show?" (book open) | No | Find: it is already on the Bench | Inspect the source | Whatever the figure is | Keep the reader selected; point at the region in chat |
| "And pooling?" (after the CNN board) | No | Make | Extend | *How* plus *where* | Refocus the home board and extend it |
| "Causes of the French Revolution, quickly" | Mostly | Make | Look once | *Why* / *when* | Structured prose or a table; perhaps an inline timeline |
| "hey, how's it going?" | Yes | — | — | — | Words |
| "Make a grade-4 fractions worksheet" | — | Make | Keep and use | — | Document on the Bench |
| "Show me a mitochondrion" | No | Find: appearance is the evidence | Look once | *Who/what* | A real image; any generated illustration labelled as one |
| "Compare TCP and UDP" | No | Make | Look once | Comparison on shared dimensions | Inline table |

## Gaps this model exposes

- **Finding images (Q1 in the ledger):** Buddy cannot yet save and show a real image found on the web. Use the Browser page until a figure-finding tool exists.
- **Widgets move to the Browser (H1):** as authored pages move to the Browser, the "act on it" row changes instrument, but not its routing rule.
- **Mermaid's description** stopped listing the diagram families it supports. Without that list, question 4 can't be matched reliably. Restore it.
  - Buddy accepts about 25 types (A21).
  - Besides *how* and *when* (flowchart, sequence, state, timeline, gantt), Mermaid covers simple *why* (a `quadrantChart` 2×2) and simple *how much* (`xychart-beta`, `pie`, `sankey-beta`).
  - Mermaid's layout is automatic, so it never serves ideas where position carries meaning.
  - When the values are computed, prefer the calculator's plot over a Mermaid chart.
