# Yardstick — Teaching on the Bench

A fixed set of prompts for checking visual routing, Bench use, and concision before and after prompt changes. Run every prompt the same way each time so the before and after transcripts can be compared.

The "before" prompts are the staged snapshot of 2026-09-24 on `fix/visuals-prompt`. The "after" prompts are the working-tree edits made on top of it.

## How to run

1. Use a fresh chat for each prompt unless **Setup** says otherwise. Use the persona named in the table (Buddy unless stated) and keep concise responses at the default (on).
2. Save each transcript as `evals/<before|after>/<nn>-<slug>.md`. Include tool calls, what the Bench showed, and the final reply.
3. Grade each transcript on the rubric below. Don't average the scores. Read the failures.

## In-app runner

DevTools → **Evals** runs conversations end to end in the app window. Each one starts a new chat in the open notebook with the Bench cleared, and sends its turns through the real composer, so the Bench, the per-turn Bench context, and auto-open behave as they do for a person. The runner reads the stored transcript and scores what it can from tool calls; judgment items are marked **review**.

- **Two kinds of case**, both in `packages/web/src/lib/evals/teaching-evals.ts`:
  - **Scripted** cases send fixed messages, so identical inputs can be compared across prompt versions: #16 (the neural-networks replay), #14 (the water cycle), and a small-talk guard.
  - **Simulated-learner** cases give a fixed opening message and a learner profile. Four profiles: a lost beginner, a test crammer, a stuck misconception, and a learner who hates being quizzed. After each Buddy turn, a hidden `eval-learner` agent reads the conversation, including what Buddy showed on screen, and writes the next message or `DONE`. Its sessions are archived, so they stay out of the chat list.
- **Buddy's blocking questions** (the question tool) are answered by the learner: the case's profile, or a neutral curious beginner in scripted cases.
- **Controls:**
  - several Buddy models, run one after another;
  - an effort level, applied where the model supports it and recorded per turn;
  - a separate learner model, kept fixed while Buddy's model varies;
  - 1–3 runs per case.
- **Parallel runs:** open another window (File → New Window) on a different notebook and run there. A single window runs one conversation at a time, because the Bench belongs to the visible chat.
- Use notebooks kept for evals, because every conversation leaves a chat behind. **Copy results** puts the full JSON on the clipboard.

## Rubric

Score each dimension **pass**, **partial**, or **fail**.

| Dimension | Pass means |
|---|---|
| **Whether** | A visual, source, or activity appears only when it does a job words can't. Brief answers stay brief. |
| **Initiative** | On a teaching turn whose idea has structure, Buddy shows it without being asked. A first encounter with a structure is built on the whiteboard. The learner never has to say "I can't picture it" to get a picture. |
| **Find or make** | When a real or proven resource is the thing (the learner's source, the actual object, an established simulation or video), Buddy shows it rather than recreating it. When it opens one, it gives the learner a task. |
| **Placement** | Things read once appear inline. Things built, extended, manipulated, or kept appear on the Bench. The Bench is not opened for things read once. |
| **Instrument** | The notation fits the idea's shape. Only-connections ideas get a Mermaid-style diagram. Ideas where position carries meaning get a figure, SVG, or board. Quantities get a table or plot. Appearance gets an image. |
| **Across turns** | Follow-ups extend the home tab instead of starting over. Earlier tabs are refocused before Buddy refers to them. Buddy never assumes two tabs are visible at once. |
| **Rhythm** | Explanations reach a complete stopping point, followed by at most one purposeful check. There is no question after every step unless a guided model was chosen. |
| **Length** | Length matches the kind of exchange. Nothing requested is missing, and there is no padding. |
| **Voice** | No tool names, no narration of the process, no "here's a diagram showing…" captions. The prose says what to look at. |

## Prompts

| # | Prompt | Setup | Good looks like |
|---|---|---|---|
| 1 | "Can you explain how a convolutional neural network works?" | Fresh | Short orientation in chat. A structure built up on the Bench as the home tab. No finished full-architecture dump. Ends at a coherent point, with at most one question. |
| 2 | "What's a CNN?" | Fresh | Two to four sentences; at most one inline diagram. The Bench stays closed. |
| 3 | "Explain photosynthesis." | Fresh | One inline diagram of inputs → process → outputs, or a real diagram when appearance matters. The prose says what to look at. |
| 4 | "Why do the angles of a triangle add up to 180 degrees?" | Fresh | An exact geometry figure inline (the parallel-line construction), with the proof steps in prose. |
| 5 | "How does the interest rate change my monthly loan payment?" | Fresh | The formula plus either a plot of the pattern or something the learner can vary, and a prediction to make. |
| 6 | "What does the figure on this page show?" | A prepared book open in the Bench reader | The source stays selected. Chat points at the exact region. No recreated diagram. |
| 7 | "Wait, what does pooling do?" | Directly after #1 | The same board is refocused or extended. No new board. |
| 8 | "Give me the causes of the French Revolution, quickly." | Fresh | Structured prose or a table, perhaps an inline timeline. No Bench. |
| 9 | "hey, how's it going?" | Fresh | One or two natural sentences. No tools. |
| 10 | "Make me a grade-4 worksheet on equivalent fractions." | Teaching Buddy persona | A complete document on the Bench in one turn. |
| 11 | "Show me what a mitochondrion looks like." | Fresh | A real image or a source page. A generated illustration is labelled as one. |
| 12 | "Compare TCP and UDP." | Fresh | An inline table. No Bench. |
| 13 | "Walk me through how a bill becomes law in the US." | Fresh | A process: an inline flow diagram, or a board if it is built step by step. Not a wall of text. |
| 14 | "Help me understand the water cycle — I have a test tomorrow." | Fresh | A complete explanation with one inline diagram. Perhaps an existing animation or simulation, opened with a task. |
| 15 | "What's the time complexity of binary search?" | Code persona | A direct answer. No Bench and no teaching scaffolding. General-purpose tools behave neutrally. |
| 16 | Replay of session `ses_f2c36268dffep0DBOtziwfplQA`: "help me understand neural networks" → "sure" → "how to build one" → "help me understand architecture" → "i can't imagine it" → "can you make this interactive" | One chat, in order | Turn 1 or turn 4 builds the network on the whiteboard without being asked, and later turns extend it. The interactive page lets the learner change something that matters (weights, hidden units, or training), not only toggle the inputs. The first failing run is in ledger L. |

Prompts 13–15 guard against tuning the prompts to one example: a civics process, a science cycle under time pressure, and a non-teaching technical question in the code persona.
