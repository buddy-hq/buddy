---
name: whiteboard-authoring
description: Author clear, editable whiteboards with Buddy's compact append-program tool. Use when the teaching problem depends on canvas workflow, board layout, visual explanation, cumulative lesson records, worked examples, concept maps, diagrams, representation bridging, learner-work comparison, retrieval prompts, error analysis, or preserving a visual trail. Use this whenever the user mentions whiteboard, canvas, Excalidraw, draw, diagram, visual explanation, board work, or how much the agent should write or draw. Do not use for generic lesson planning, classroom management, or artifact authoring unless the visual canvas is central. MUST READ before using any whiteboarding tools.
---
<!-- cspell:disable -->

This skill has 3 sections

1. Buddy Whiteboard Authoring [Product Rules]
2. Whiteboard Teaching [Pedagogy]
3. Excalidraw Element Format [Excalidraw Format]




---

# Buddy Whiteboard Authoring

You are using Buddy's embedded Excalidraw whiteboard on Bench. Depending on the learner's layout, chat may be docked beside it or float over it. The whiteboard may use a light or dark background depending on the current theme. Complete streamed drawing elements become visible to the learner in real time.

Buddy-specific rules:
- Treat `whiteboard_create_view` like Excalidraw MCP's `create_view`: keep the tool input small and format-first. Put strategy and teaching decisions in your reasoning and in this skill, not inside the `elements` JSON.
- Use `objectAction:"create"` and omit `objectID` for a distinct new whiteboard. Use `objectAction:"update"` with a whiteboard's stable `objectID` for every subsequent edit, regardless of which chat is active.
- Give each new whiteboard a short semantic `title` that identifies it in Bench tabs and the Library. On later edits, omit `title` to preserve the current name unless the board should be renamed.
- `elements` must be one compact JSON array. It must be valid JSON: no comments, no trailing commas.
- The tool argument is already a string field, so inside it write plain JSON like `[{"type":"rectangle","id":"a","x":0,"y":0,"width":120,"height":80}]`.
- Do not double-escape quotes inside `elements`.
- Do not wrap the JSON in Markdown fences.
- Do not quote numbers. Write `"width":120`, not `"width":"120"` and not `"width":120"`.
- Set `boardAction` to `continue_current_board` for the first board, normal appends, repairs, local edits, delete/translate operations, new zones below or beside existing work, and anything that should preserve existing content or learner edits.
- Set `boardAction` to `destructively_replace_current_board` only when the user explicitly asks to discard, clear, overwrite, or replace the entire current board.
- Treat `destructively_replace_current_board` as destructive: Buddy has one current board, so the viewer has no in-app way to go back to the overwritten board.
- Do not use `destructively_replace_current_board` merely because a clean canvas, a different layout, a new lesson/topic, or a structurally different visualization would be easier. Continue the board and draw in a new zone unless the user explicitly asks to discard the old board.
- Do not put `restoreCheckpoint` or `replaceCurrentBoard` inside `elements`. Board persistence is controlled by `boardAction`.
- Before precise edits to the current board, call `whiteboard_read_context` with its `objectID`, then use `objectAction:"update"`, the same `objectID`, and `boardAction:"continue_current_board"`.
- The continuation handle resolves to the latest persisted current board, including learner edits.
- Do not invent or include session ids, internal checkpoint ids, or other app state in tool input. Pass only the stable whiteboard `objectID` required by the tool contract; Buddy owns internal board/checkpoint identity.
- Use stable semantic element ids and never reuse a deleted id.
- Progressive rendering is best effort while the tool input streams. Emit complete drawable objects in useful order so the first one can replace the new-board loading state immediately. Only the final validated program saves a durable board.
- Each directory-owned whiteboard object keeps one mutable current board. Multiple chats may open and edit the same object. Small edits should continue from context and change only the local area instead of redrawing the whole board from scratch.

---

# Whiteboard Teaching

This handbook explains how to use an agent-operated teaching canvas well. Use it as the main reference when a visual board is part of the teaching design.

Board means a digital visual surface such as an Excalidraw-like canvas, online whiteboard, diagramming space, sketchpad, projected visual workspace, or persistent lesson canvas. The original evidence comes from classroom board use, but this skill adapts the transferable principles for an AI teaching agent.


## Teaching Workflow
### Teaching Heuristics
- Don't dump everything at the board, at once.
- Go one logical block at a time.
  - Teach frame by frame
- Practice Progressive Disclosure
- Go one frame; ask user for intearaction based on the content.
  - Don't draw more than 2 frames a turn.
- For interaction you can
  - ask them a question - in chat or using 'question' tool.
  - ask them to intearct with the drawing.
  - ask them to draw something and then use `whiteboard_read_context` to see what they did.
- If you are just pushing out diagrams, and user is not interacting, you are NOT doing a good job.
- Optimize for time to first drawing.
  - Start drawing before the full diagram is fully planned.
  - The first visible output can be a heading, section label, rough frame, placeholder, or single block.
  - Use it like an optimistic shell or first token: temporary, but useful.
  - This gives the user immediate feedback that work has started and more is coming.
  - Revise or replace the first drawing later if the structure changes.
  - Prefer early visible progress over waiting for a perfect plan.


### Ideal flow
User: [explain x...]
Assistant:
- Loads Whiteboard skill
- chooses a teaching model
- decides the scope and probable whiteboard flow - without thinking about all the json
- choses a starting point
- draws only what is relavant to the starting point
- uses text to explain what it drew
User: [picks a direction: more depth, more breadth, tangential question, etc]
Assistant:
- mentally adapts the lesson
- chooses the next best frame
- draws the frame
- explains the frame
User: [picks a direction: more depth, more breadth, tangential question, etc]
Assistant:
- adapts the lesson
- chooses a frame
- draws the frame; ensuring doesn't overlap with existing drawings
- explains/answers the user question.

### Drawing Heuristics
- Chat is for writing; Board is for Drawing
  - DON't pollute the board with tonnes of text.
  - Keep labels concise.
- Vertical spacing: When stacking frames vertically, leave at least half the height of the upper frame between them.
  - space below F1 ≥ 0.5 × height(F1)
- Horizontal spacing: When placing frames side by side, leave at least one quarter of the height of the left frame between them.
  - space beside F1 ≥ 0.25 × height(F1)
- A frame end at the location of it's final element, vertically or horizontally.
  - If a container in a frame descripton under it
    - The END of the frame is the end of the 'description label, NOT end of the container itself.
- Separators
  - Separate vertically stacking frames with a horizontal separator.
  - Separate horzontally stacking frames with a horizontal separator.
  - Separators are at the equidistant from the edges of both frames.
  - Separator overlapping a text or container can mean
    - Not enough space between frames
    - Wrong place for the separator
  - Solve the issue by:
    - Pushing the separator, OR
    - Pusing the next frame vertically or horizontally.
- Respect visual hierarchy
  - Use spacing, alignment, size, and grouping to make relationships clear.
  - Related frames, elements, and containers should be closer to each other than unrelated ones.
    - Space within a group < space between groups
  - Labels, captions, buttons, and annotations should be closest to the element they describe.
    - distance(label, its element) < distance(label, other elements)
  - Use consistent spacing levels.
    - Tight spacing: items inside the same control or group
    - Medium spacing: related blocks inside one section
    - Large spacing: different sections or frame groups
    - Extra-large spacing: major layout breaks
  - Make primary content visually dominant.
    - Use larger size, stronger contrast, central placement, or more whitespace.
  - Avoid competing focal points.
    - One primary focus
    - A few secondary items
    - Supporting details with lower emphasis
  - Align related elements.
    - Related frames should share a clear left edge, center line, or baseline.
  - Separate unrelated groups clearly.
    - Use more spacing, a divider, a container, a heading, or a background change.
  - Keep hierarchy consistent across the canvas.
    - Same relationship = same spacing, alignment, and visual treatment.

### Writing Good Board Copy

Board copy should be short enough to see, remember, and use.

Prefer:

- labels over sentences;
- prompts over explanations;
- key relationships over isolated terms;
- steps with verbs;
- examples and nonexamples near the rule they clarify;
- criteria learners can apply immediately;
- arrows, spacing, columns, and grouping to show relationships.

Avoid:

- paragraphs on the board;
- decorative headings that do no teaching work;
- cluttered old marks left behind;
- copying entire spoken explanations;
- writing only the final answer;
- scattering related items randomly;
- unexplained abbreviations;
- text too small to read in the current viewport.

Text layout:

- Do not assume a standalone `text` element's `width` will automatically wrap long copy. The rendered Excalidraw bounds are authoritative.
- For card body copy, bullet lists, or multi-line explanations, choose the visible line structure yourself: use explicit newline characters in one text element, or use separate text elements with stable ids for each line/bullet.
- Size the surrounding card or zone for the rendered lines you chose. If measured feedback says the text is wider or taller than expected, fix the local card/zone by shortening copy, adding line breaks, splitting bullets into separate text elements, widening the card, or increasing local spacing.
- Use shape `label` for short titles or simple shape-attached labels, not as the default for flexible card body copy.

Spatial placement teaches. Vertical lists imply sequence, hierarchy, or step order. Horizontal placement implies parallel items. Left-to-right layout can show time, argument, or development.

### Gotchas
- be aware of overlapping text and elements
  - first, assitatn avoids it by making drawings spacious
    - the space needed is directly propotional to the number of elements that the agent plans to draw.
    - there are some heuristics below for general drawings but the assistant is the final authority on the aspect ratio of a drawing.
- when modifying an existing container
  - consider how making it bigger or smaller affects the neighbors and move them accordingly.
  - first make a list of all the elements you will modify; delete them, then redraw them in new style. replacement is almost always a better strategy for complex drawings with more then 4 closely placed elements.

### User overrides
- all rules/heuristics/formatting guidlines are subject to user instructions and needs.



## Core Idea

A board is not just a place to write. It controls what the learner can see, remember, compare, question, copy, revisit, and act on.

Before writing anything, decide which job the board is doing:

- **Orient:** show the learner what problem, question, or goal the canvas is serving.
- **Model:** show a procedure, diagram, worked example, note format, or agent thinking.
- **Retrieve:** have learners recall, generate, explain, or apply knowledge from memory before answers are supplied.
- **Record:** capture learner ideas, questions, claims, data, examples, hypotheses, or solution methods.
- **Organize:** arrange information into columns, timelines, maps, charts, lists, cause-effect chains, or concept structures.
- **Compare:** make multiple answers, methods, examples, or pieces of evidence visible at once.
- **Check:** ask the learner to produce visible evidence before revealing or correcting.
- **Preserve:** keep a cumulative visual record the learner can revisit during or after the lesson.
- **Focus:** direct attention to the relationship, step, contrast, or error that matters now.

The strongest board work chooses one or two of these jobs deliberately. Weak board work mixes them without a plan, then learners cannot tell what to attend to, copy, ignore, or use.

## Workflow For The Agent

There is no universal rule like "draw three objects, then wait" or "write for 90 seconds." The agent should choose a canvas mode for each segment, then pace drawing, writing, and learner interaction around that mode.

Use these modes deliberately:

- **Focus:** one visible idea, step, example, or diagram part at a time. Use for quick definitions, a single new operation, a local correction, or a short aside.
- **Cumulative:** a growing lesson record that stays visible or reachable. Use for multi-step reasoning, proofs, worked examples, concept development, and comparing methods.
- **Routine:** a scripted thinking workflow with planned frames, covers, or staged regions. Use for inquiry moves such as partial reveal, claim-support-question, tug-of-war, examples/nonexamples, or concept mapping.
- **Answer:** a clean comparison or final-form area. Use after the learner has tried, so the canvas can separate attempted work from the model answer.
- **Frozen:** a stable reference area. Use while the learner practices, explains, or answers in chat without the agent continuing to add marks.

Default for explanation-heavy tutoring: use **Cumulative** for the main arc, brief **Focus** frames for local details, and an **Answer** frame only after the learner has attempted something. Signal mode switches in words: "I am going to keep this visible because we will compare against it later" or "I am moving this aside so we can focus on one step."

Before drawing:

- choose the dominant mode for the next segment;
- create frames or regions for `Goal`, `Work`, `Learner attempt`, `Model`, and `Archive` when needed;
- decide what should be built live versus prestructured;
- decide what the learner will do before the agent uncovers, adds, or moves to the next mark;
- decide what should stay visible, move aside, or be deleted without harming the lesson story;
- decide what final export, summary, or reusable record should remain.

During drawing:

- draw in short bursts, then stop and explain what changed;
- prefer labels, arrows, grouping, and spatial placement over long prose;
- add one relationship at a time when the learner is learning a new structure;
- keep the active viewport limited to the current idea;
- use color only for meaning, such as error, evidence, category, change, or emphasis;
- ask the learner to predict, label, choose, explain, or repair before the canvas gets too complete.

How much to write:

- Write enough for the canvas to be understood later without the full transcript.
- Do not write the whole spoken explanation. Capture the durable parts: problem, givens, diagram labels, key steps, contrast, rule, error, and summary.
- Use phrases instead of sentences when the surrounding structure carries the meaning.
- Use a full sentence only for the final generalization, a misconception warning, or a learner-facing takeaway.

How much to draw:

- Draw when shape, position, sequence, proportion, grouping, or comparison teaches better than text.
- Do not draw decorative objects that do not carry reasoning.
- For complex diagrams, start with the smallest useful structure, then add parts as the learner needs them.
- When a diagram becomes crowded, make a new frame or duplicate the clean base diagram before adding more annotations.

How to pace:

- In **Focus** mode, keep only the current object or step prominent. Move the previous item aside, dim it, or put it in the archive.
- In **Cumulative** mode, do not clear the main reasoning trail. Build left-to-right, top-to-bottom, or center-out so the learner can reconstruct the lesson story.
- In **Routine** mode, pre-plan staged frames, covers, or off-screen regions. Do not show the final image, answer, or classification before the learner has interpreted the partial information.
- In **Answer** mode, show final forms cleanly beside the learner's attempt. Mark differences rather than replacing the attempt.
- In **Frozen** mode, stop editing. Let the learner use the board as a reference while they think, practice, or explain.

Because the canvas is infinite, the agent usually should not erase in the physical-board sense. Instead:

- **Archive** material by moving it to a labeled side frame when it may be needed later.
- **Reset partially** by preserving anchor items and moving rough work away.
- **Duplicate** a clean diagram before annotating it heavily.
- **Frame** completed segments so the learner can find them again.
- **Delete** only clutter, false starts with no teaching value, or duplicate marks that make the record harder to use.

End each substantial canvas segment with a visible consolidation move: box the main generalization, label the final model, summarize the contrast, or export/preserve the clean record. The learner should be able to answer, "What did this canvas help me understand?"

## Board Layout Patterns

### Orientation And Goal Zone

Use a predictable area for the current question, goal, or task. Keep it short enough that the learner can use it while looking at the rest of the canvas.

Use this zone when learners need the goal, purpose, success target, or connection to the larger idea.

Avoid institutional objective wording that learners cannot use. Prefer concise public language: "Explain why two methods give the same answer" is more useful than a long standards sentence.

### Canvas = Notes

When the canvas should become a study artifact, structure it so the learner can revisit it without the conversation transcript. If something is meant to be copied, exported, or remembered, make it clean enough to stand on its own.

Use this pattern for headings, diagrams, labels, worked steps, tables, definitions, graphic organizers, and example-problem pairs.

Separate rough work from final notes. The canvas can hold messy reasoning during the explanation, but the learner should be able to identify the final model, rule, diagram, or summary.

### Cumulative Lesson Map

Use a left-to-right, top-to-bottom, or center-out record when the lesson depends on relationships across time: multiple solution methods, inquiry evidence, concept development, cause-effect analysis, interpretation, or representation bridging. Keep earlier parts visible or reachable so learners can compare, connect, and return to them.

### Three-Column Reasoning Board

Use columns when the learner must discriminate, compare, or test ideas.

Useful column sets:

- `Examples / Nonexamples / Hypotheses`
- `Claim / Support / Question`
- `Observation / Inference / Evidence`
- `Connect / Extend / Challenge`
- `Method A / Method B / What stays the same`
- `Learner idea / Evidence for / Evidence against`
- `Cause / Prior cause / Effect`

Keep rejected hypotheses visible when they are part of the reasoning trail. Cross out or annotate rather than erasing when learners need to see how thinking changed.



### Retrieval Board

Use the board to make retrieval and generation visible. This is different from copying notes or watching the agent solve.

Use this pattern when learners need to pull ideas forward from memory before the agent supplies the answer. Post a higher-order prompt, have the learner generate an answer, diagram, explanation, or application, then place the attempt beside a stronger version and mark what is correct, missing, or confused.

This works best with conceptual prompts, not recall trivia. Good prompts ask learners to integrate ideas, apply a principle, explain a relationship, compare cases, or diagnose an error.



## Capturing Learner Thinking

When collecting ideas, keep the first pass open. Write brief learner contributions before judging them so the learner has material to analyze.

Use neutral capture when you want a culture of error:

- write plausible wrong answers and correct answers in the same tone;
- avoid writing only the answer you like;
- do not reveal correctness with wording, highlighting, or placement before analysis;
- later box, label, revise, or cross out as the learner analyzes.

Once ideas are visible:

- ask what patterns appear;
- connect similar responses;
- contrast competing claims;
- ask what evidence supports or challenges a claim;
- fill gaps after learner thinking is on the board;
- press learners to explain how they know;
- return to earlier ideas when new evidence arrives.

Capture only the dialogue that needs to be seen again: claims, questions, contrasts, decisions, and revisions. The canvas should not become a transcript.

## Checking Understanding On Canvas

Use the canvas to check understanding when the learner's answer benefits from drawing, arranging, labeling, comparing, or showing steps.

A strong canvas check has three features:

- **Objective evidence:** the learner produces an answer, diagram, explanation, step, label, or choice, not just a confidence rating.
- **Visible comparison:** the learner's response and the target idea can be compared on the canvas.
- **Instructional response:** the agent changes the next move based on the evidence.

After checking:

- if the response shows a core misconception, redraw the idea differently or break the task into smaller steps;
- if the response is partially correct, mark what works before repairing what does not;
- if the learner is ready, remove scaffolds or move to a harder case;
- if an error is useful, keep it visible long enough to explain why it is tempting and how to avoid it.

Do not ask for a visual response unless the visual form adds value. If a short typed answer is enough, use chat. Use the canvas when spatial arrangement, sequence, comparison, or structure matters.

## Inquiry, Concepts, And Representations

Boards are especially useful when learners must build or revise mental models.

For concept attainment:

- keep examples and nonexamples visible;
- record hypotheses in a separate area;
- cross out eliminated hypotheses rather than erasing the trail;
- use the board to test boundaries, not just list definitions.

For concept development:

- generate many items first;
- group and label visibly;
- regroup when learners see a better structure;
- end by looking over the whole board for a generalization.

For inquiry:

- reserve space for observations, data, questions, and hypotheses;
- write the current hypothesis clearly;
- keep evidence visible while testing;
- separate "what we saw" from "what we think it means."

For representation bridging:

- place real-world context, table, graph, verbal rule, and symbolic form where learners can see their correspondence;
- point across representations deliberately;
- mark changes and repeated relationships visually;
- use the same context long enough for learners to connect forms.

For argument or interpretation:

- keep claims, support, questions, and counterevidence visible;
- ask how new evidence supports, extends, challenges, or revises earlier thinking;
- make the learner's source of knowing visible, not only the conclusion.

## Common Anti-Patterns

- **No orientation:** the learner sees marks but cannot tell what question the canvas is answering.
- **Wallpaper canvas:** old, irrelevant material stays visible and competes with the lesson.
- **Erase-and-forget:** earlier reasoning disappears even though later comparison depends on it.
- **Everything visible at once:** clutter makes the canvas unusable as a thinking tool.
- **Only correct answers drawn:** the learner never sees why tempting wrong ideas fail.
- **Visual performance:** the agent makes an impressive diagram that the learner does not use.
- **Copying as learning:** the learner copies canvas text without explaining, applying, or connecting it.
- **Retrieval bypass:** the agent supplies the polished answer before the learner tries to recall, generate, or test an idea.
- **Sloppy unexplained marks:** drawing is visible but not taught.
- **Confidence polling as evidence:** the learner rates understanding instead of showing work.
- **Pan-and-zoom maze:** useful ideas exist somewhere on the canvas, but the learner cannot find or connect them.
- **Feature swapping:** using a digital canvas without changing the explanation, practice, or feedback it supports.

## Relationship To Other Skills

Use `teaching-models` when Buddy needs to choose the teaching move: direct instruction, inquiry, worked examples, Socratic questioning, case/problem-based teaching, or another model.

Use `learning-design-frameworks` when the user needs a broader design or audit lens: alignment, rigor, accessibility, learner variability, formative assessment, technology integration, metacognition, SEL, or visible thinking as a framework.

Use `teaching-resource-authoring` when the output should be a durable artifact such as a worksheet, quiz, rubric, exemplar set, project brief, reading packet, or lab handout.

Use this skill when the visual canvas itself is the teaching surface. In combined work, first choose the teaching model or framework if needed, then use this skill to decide how the agent should draw, write, pace, compare, preserve, and check understanding on the canvas.


---

# Excalidraw Element Format

Thanks for calling whiteboard-authoring skill! Do NOT call it again in this conversation — you will not see anything new. Now use whiteboard_create_view to draw.

## Color Palette (use consistently across all tools)

### Primary Colors
| Name | Hex | Use |
|------|-----|-----|
| Blue | \`#4a9eed\` | Primary actions, links, data series 1 |
| Amber | \`#f59e0b\` | Warnings, highlights, data series 2 |
| Green | \`#22c55e\` | Success, positive, data series 3 |
| Red | \`#ef4444\` | Errors, negative, data series 4 |
| Purple | \`#8b5cf6\` | Accents, special items, data series 5 |
| Pink | \`#ec4899\` | Decorative, data series 6 |
| Cyan | \`#06b6d4\` | Info, secondary, data series 7 |
| Lime | \`#84cc16\` | Extra, data series 8 |

### Excalidraw Fills (pastel, for shape backgrounds)
| Color | Hex | Good For |
|-------|-----|----------|
| Light Blue | \`#a5d8ff\` | Input, sources, primary nodes |
| Light Green | \`#b2f2bb\` | Success, output, completed |
| Light Orange | \`#ffd8a8\` | Warning, pending, external |
| Light Purple | \`#d0bfff\` | Processing, middleware, special |
| Light Red | \`#ffc9c9\` | Error, critical, alerts |
| Light Yellow | \`#fff3bf\` | Notes, decisions, planning |
| Light Teal | \`#c3fae8\` | Storage, data, memory |
| Light Pink | \`#eebefa\` | Analytics, metrics |

### Background Zones (use with opacity: 30 for layered diagrams)
| Color | Hex | Good For |
|-------|-----|----------|
| Blue zone | \`#dbe4ff\` | UI / frontend layer |
| Purple zone | \`#e5dbff\` | Logic / agent layer |
| Green zone | \`#d3f9d8\` | Data / tool layer |

---

## Excalidraw Elements

### Required Fields (all elements)
\`type\`, \`id\` (unique string), \`x\`, \`y\`, \`width\`, \`height\`

### Defaults (skip these)
strokeColor="#1e1e1e", backgroundColor="transparent", fillStyle="solid", strokeWidth=2, roughness=1, opacity=100
Canvas background is white.

### Element Types

**Rectangle**: \`{ "type": "rectangle", "id": "r1", "x": 100, "y": 100, "width": 200, "height": 100 }\`
- \`roundness: { type: 3 }\` for rounded corners
- \`backgroundColor: "#a5d8ff"\`, \`fillStyle: "solid"\` for filled

**Ellipse**: \`{ "type": "ellipse", "id": "e1", "x": 100, "y": 100, "width": 150, "height": 150 }\`

**Diamond**: \`{ "type": "diamond", "id": "d1", "x": 100, "y": 100, "width": 150, "height": 150 }\`

**Labeled shape**: Add `label` to a shape for short auto-centered titles or simple shape-attached labels. Do not use this as the default for card body copy, bullet lists, or flexible multi-line explanations.
\`{ "type": "rectangle", "id": "r1", "x": 100, "y": 100, "width": 200, "height": 80, "label": { "text": "Hello", "fontSize": 20 } }\`
- Works on rectangle, ellipse, diamond
- Text auto-centers and container auto-resizes to fit
- Useful for short labels; use standalone text elements when you need manual line layout or multiple independent bullets

**Labeled arrow**: \`"label": { "text": "connects" }\` on an arrow element.

**Standalone text**:
\`{ "type": "text", "id": "t1", "x": 150, "y": 138, "text": "Hello", "fontSize": 20 }\`
- x is the LEFT edge of the text. To center text at position cx: set x = cx - estimatedWidth/2
- estimatedWidth ≈ text.length × fontSize × 0.5
- Do NOT rely on `width` to wrap long standalone copy. Use explicit newline characters or separate text elements when you need visible line breaks.

**Arrow**: \`{ "type": "arrow", "id": "a1", "x": 300, "y": 150, "width": 200, "height": 0, "points": [[0,0],[200,0]], "endArrowhead": "arrow" }\`
- points: [dx, dy] offsets from element x,y
- endArrowhead: null | "arrow" | "bar" | "dot" | "triangle"

### Arrow Bindings
Arrow: \`"startBinding": { "elementId": "r1", "fixedPoint": [1, 0.5] }\`
fixedPoint: top=[0.5,0], bottom=[0.5,1], left=[0,0.5], right=[1,0.5]

**cameraUpdate** (pseudo-element — controls the viewport, not drawn):
\`{ "type": "cameraUpdate", "width": 800, "height": 600, "x": 0, "y": 0 }\`
- x, y: top-left corner of the visible area (scene coordinates)
- width, height: size of the visible area — MUST be 4:3 ratio (400×300, 600×450, 800×600, 1200×900, 1600×1200)
- Animates smoothly between positions — use multiple cameraUpdates to guide attention as you draw
- No \`id\` needed — this is not a drawn element

**delete** (pseudo-element — removes elements by id):
\`{ "type": "delete", "ids": "b2,a1,t3" }\`
- Comma-separated list of element ids to remove
- Also removes bound text elements (matching \`containerId\`)
- Place AFTER the elements you want to remove
- Never reuse a deleted id — always assign new ids to replacements

### Drawing Order (CRITICAL for streaming)
- Array order = z-order (first = back, last = front)
- **Emit progressively**: background → shape → its label → its arrows → next shape
- BAD: all rectangles → all texts → all arrows
- GOOD: bg_shape → shape1 → text1 → arrow1 → shape2 → text2 → ...

### Layout Discipline (CRITICAL for readability)

Before drawing non-trivial scenes, plan the board as zones. Do not place elements opportunistically.

For every diagram with more than 6 visible items:
- Use a 1200x900 or 1600x1200 camera unless the user explicitly asks for a compact close-up.
- Divide the visible area into named zones before placing details.
- Keep at least 40px between labeled shapes.
- Keep at least 30px between standalone text labels.
- Do not place text on top of arrows, arrowheads, dense crossings, or unrelated shapes.
- Put explanatory prose in side callout boxes or a bottom summary band, not inside the main action area.
- If the diagram is a map or battlefield, use sparse map labels and a separate legend/callout area for explanations.
- If the diagram is a simplified map, battlefield map, or geographic sketch, start with a 1200x900 camera; use 1600x1200 when it includes several movements, labels, or callouts. Reserve the roomy map zone in the first cameraUpdate instead of expanding it after collisions appear.

Overlap is a failure unless it is intentional and visually meaningful. Before emitting final elements, mentally check every text label, shape label, arrow label, and arrowhead. If any label touches another label, crosses an arrow, or sits inside the wrong shape, move it or increase the camera size.

If the layout feels crowded, do not squeeze. Use a larger camera, split into multiple board sections, or draw fewer details and summarize the rest in a legend.

### Text And Label Placement

- Prefer \`label\` inside simple shapes only when the text is short enough to fit comfortably.
- For labels longer than about 18 characters, either enlarge the shape or use a nearby callout.
- Keep arrow labels short, 1-3 words. For longer explanations, use a separate note box.
- For maps, do not label every arrow inline. Use numbered markers plus a legend when there are many movements.

### Example: Two connected labeled boxes
\`\`\`json
[
  { "type": "cameraUpdate", "width": 800, "height": 600, "x": 50, "y": 50 },
  { "type": "rectangle", "id": "b1", "x": 100, "y": 100, "width": 200, "height": 100, "roundness": { "type": 3 }, "backgroundColor": "#a5d8ff", "fillStyle": "solid", "label": { "text": "Start", "fontSize": 20 } },
  { "type": "rectangle", "id": "b2", "x": 450, "y": 100, "width": 200, "height": 100, "roundness": { "type": 3 }, "backgroundColor": "#b2f2bb", "fillStyle": "solid", "label": { "text": "End", "fontSize": 20 } },
  { "type": "arrow", "id": "a1", "x": 300, "y": 150, "width": 150, "height": 0, "points": [[0,0],[150,0]], "endArrowhead": "arrow", "startBinding": { "elementId": "b1", "fixedPoint": [1, 0.5] }, "endBinding": { "elementId": "b2", "fixedPoint": [0, 0.5] } }
]
\`\`\`

### Camera & Sizing (CRITICAL for readability)

The diagram displays inline at ~700px width. Design for this constraint.

**Recommended camera sizes (4:3 aspect ratio ONLY):**
- Camera **S**: width 400, height 300 — close-up on a small group (2-3 elements)
- Camera **M**: width 600, height 450 — medium view, a section of a diagram
- Camera **L**: width 800, height 600 — standard full diagram (DEFAULT)
- Camera **XL**: width 1200, height 900 — large diagram overview. WARNING: font size smaller than 18 is unreadable
- Camera **XXL**: width 1600, height 1200 — panorama / final overview of complex diagrams. WARNING: minimum readable font size is 21

ALWAYS use one of these exact sizes. Non-4:3 viewports cause distortion.

**Font size rules:**
- Minimum fontSize: **16** for body text, labels, descriptions
- Minimum fontSize: **20** for titles and headings
- Minimum fontSize: **14** for secondary annotations only (sparingly)
- NEVER use fontSize below 14 — it becomes unreadable at display scale

**Element sizing rules:**
- Minimum shape size: 120×60 for labeled rectangles/ellipses
- Leave 40px gaps between labeled shapes when space allows; 20-30px is the absolute minimum only for sparse diagrams
- Prefer fewer, larger elements over many tiny ones

ALWAYS start with a \`cameraUpdate\` as the FIRST element. For example:
\`{ "type": "cameraUpdate", "width": 800, "height": 600, "x": 0, "y": 0 }\`

- x, y: top-left corner of visible area (scene coordinates)
- ALWAYS emit the cameraUpdate BEFORE drawing the elements it frames — camera moves first, then content appears
- The camera animates smoothly between positions
- Leave padding: don't match camera size to content size exactly (e.g., 500px content in 800x600 camera)

Examples:
\`{ "type": "cameraUpdate", "width": 800, "height": 600, "x": 0, "y": 0 }\` — standard view
\`{ "type": "cameraUpdate", "width": 400, "height": 300, "x": 200, "y": 100 }\` — zoom into a detail
\`{ "type": "cameraUpdate", "width": 1600, "height": 1200, "x": -50, "y": -50 }\` — panorama overview

Tip: For large diagrams, emit a cameraUpdate to focus on each section as you draw it.

## Diagram Example

Example prompt: "Explain how photosynthesis works"

Uses 2 camera positions: start zoomed in (M) for title, then zoom out (L) to reveal the full diagram. Sun art drawn last as a finishing touch.

- **Camera 1** (400x300): Draw the title "Photosynthesis" and formula subtitle zoomed in
- **Camera 2** (800x600): Zoom out — draw the leaf zone, process flow (Light Reactions → Calvin Cycle), inputs (Sunlight, Water, CO2), outputs (O2, Glucose), and finally a cute 8-ray sun

\`\`\`json
[
  {"type":"cameraUpdate","width":400,"height":300,"x":200,"y":-20},
  {"type":"text","id":"ti","x":280,"y":10,"text":"Photosynthesis","fontSize":28,"strokeColor":"#1e1e1e"},
  {"type":"text","id":"fo","x":245,"y":48,"text":"6CO2 + 6H2O --> C6H12O6 + 6O2","fontSize":16,"strokeColor":"#757575"},
  {"type":"cameraUpdate","width":800,"height":600,"x":0,"y":-20},
  {"type":"rectangle","id":"lf","x":150,"y":90,"width":520,"height":380,"backgroundColor":"#d3f9d8","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#22c55e","strokeWidth":1,"opacity":35},
  {"type":"text","id":"lfl","x":170,"y":96,"text":"Inside the Leaf","fontSize":16,"strokeColor":"#15803d"},
  {"type":"rectangle","id":"lr","x":190,"y":190,"width":160,"height":70,"backgroundColor":"#fff3bf","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#f59e0b","label":{"text":"Light Reactions","fontSize":16}},
  {"type":"arrow","id":"a1","x":350,"y":225,"width":120,"height":0,"points":[[0,0],[120,0]],"strokeColor":"#1e1e1e","strokeWidth":2,"endArrowhead":"arrow","label":{"text":"ATP","fontSize":14}},
  {"type":"rectangle","id":"cc","x":470,"y":190,"width":160,"height":70,"backgroundColor":"#d0bfff","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#8b5cf6","label":{"text":"Calvin Cycle","fontSize":16}},
  {"type":"rectangle","id":"sl","x":10,"y":200,"width":120,"height":50,"backgroundColor":"#fff3bf","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#f59e0b","label":{"text":"Sunlight","fontSize":16}},
  {"type":"arrow","id":"a2","x":130,"y":225,"width":60,"height":0,"points":[[0,0],[60,0]],"strokeColor":"#f59e0b","strokeWidth":2,"endArrowhead":"arrow"},
  {"type":"rectangle","id":"wa","x":200,"y":360,"width":140,"height":50,"backgroundColor":"#a5d8ff","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#4a9eed","label":{"text":"Water (H2O)","fontSize":16}},
  {"type":"arrow","id":"a3","x":270,"y":360,"width":0,"height":-100,"points":[[0,0],[0,-100]],"strokeColor":"#4a9eed","strokeWidth":2,"endArrowhead":"arrow"},
  {"type":"rectangle","id":"co","x":480,"y":360,"width":130,"height":50,"backgroundColor":"#ffd8a8","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#f59e0b","label":{"text":"CO2","fontSize":16}},
  {"type":"arrow","id":"a4","x":545,"y":360,"width":0,"height":-100,"points":[[0,0],[0,-100]],"strokeColor":"#f59e0b","strokeWidth":2,"endArrowhead":"arrow"},
  {"type":"rectangle","id":"ox","x":540,"y":100,"width":100,"height":40,"backgroundColor":"#ffc9c9","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#ef4444","label":{"text":"O2","fontSize":16}},
  {"type":"arrow","id":"a5","x":310,"y":190,"width":230,"height":-50,"points":[[0,0],[230,-50]],"strokeColor":"#ef4444","strokeWidth":2,"endArrowhead":"arrow"},
  {"type":"rectangle","id":"gl","x":690,"y":195,"width":120,"height":60,"backgroundColor":"#c3fae8","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#22c55e","label":{"text":"Glucose","fontSize":18}},
  {"type":"arrow","id":"a6","x":630,"y":225,"width":60,"height":0,"points":[[0,0],[60,0]],"strokeColor":"#22c55e","strokeWidth":2,"endArrowhead":"arrow"},
  {"type":"ellipse","id":"sun","x":30,"y":110,"width":50,"height":50,"backgroundColor":"#fff3bf","fillStyle":"solid","strokeColor":"#f59e0b","strokeWidth":2},
  {"type":"arrow","id":"r1","x":55,"y":108,"width":0,"height":-14,"points":[[0,0],[0,-14]],"strokeColor":"#f59e0b","strokeWidth":2,"endArrowhead":null,"startArrowhead":null},
  {"type":"arrow","id":"r2","x":55,"y":162,"width":0,"height":14,"points":[[0,0],[0,14]],"strokeColor":"#f59e0b","strokeWidth":2,"endArrowhead":null,"startArrowhead":null},
  {"type":"arrow","id":"r3","x":28,"y":135,"width":-14,"height":0,"points":[[0,0],[-14,0]],"strokeColor":"#f59e0b","strokeWidth":2,"endArrowhead":null,"startArrowhead":null},
  {"type":"arrow","id":"r4","x":82,"y":135,"width":14,"height":0,"points":[[0,0],[14,0]],"strokeColor":"#f59e0b","strokeWidth":2,"endArrowhead":null,"startArrowhead":null},
  {"type":"arrow","id":"r5","x":73,"y":117,"width":10,"height":-10,"points":[[0,0],[10,-10]],"strokeColor":"#f59e0b","strokeWidth":2,"endArrowhead":null,"startArrowhead":null},
  {"type":"arrow","id":"r6","x":37,"y":117,"width":-10,"height":-10,"points":[[0,0],[-10,-10]],"strokeColor":"#f59e0b","strokeWidth":2,"endArrowhead":null,"startArrowhead":null},
  {"type":"arrow","id":"r7","x":73,"y":153,"width":10,"height":10,"points":[[0,0],[10,10]],"strokeColor":"#f59e0b","strokeWidth":2,"endArrowhead":null,"startArrowhead":null},
  {"type":"arrow","id":"r8","x":37,"y":153,"width":-10,"height":10,"points":[[0,0],[-10,10]],"strokeColor":"#f59e0b","strokeWidth":2,"endArrowhead":null,"startArrowhead":null}
]
\`\`\`

Common mistakes to avoid:
- **Camera size must match content with padding** — if your content is 500px tall, use 800x600 camera, not 500px. No padding = truncated edges
- **Center titles relative to the diagram below** — estimate the diagram's total width and center the title text over it, not over the canvas
- **Arrow labels need space** — long labels like "ATP + NADPH" overflow short arrows. Keep labels short or make arrows wider
- **Overlaps are layout failures unless intentional** — check that text, boxes, labels, arrows, and arrowheads do not stack on top of each other. If anything overlaps accidentally, move it, shorten it, or use a larger camera.
- **Draw art/illustrations LAST** — cute decorations (sun, stars, icons) should appear as the final drawing step so they don't distract from the main content being built

## Sequence flow Diagram Example

Example prompt: "show a sequence diagram explaining MCP Apps"

This demonstrates a UML-style sequence diagram with 4 actors (User, Agent, App iframe, MCP Server), dashed lifelines, and labeled arrows showing the full MCP Apps request/response flow. Camera pans progressively across the diagram:

- **Camera 1** (600x450): Title "MCP Apps — Sequence Flow"
- **Cameras 2–5** (400x300 each): Zoom into each actor column right-to-left — draw header box + dashed lifeline for Server, App, Agent, User. Right-to-left so the camera snakes smoothly: pan left across actors, then pan right following the first message arrows
- **Camera 6** (400x300): Zoom into User — draw stick figure (head + body)
- **Camera 7** (600x450): Zoom out — draw first message arrows: user prompt → agent, agent tools/call → server, tool result back, result forwarded to app iframe
- **Camera 8** (600x450): Pan down — draw user interaction with app, app requesting tools/call back to agent
- **Camera 9** (600x450): Pan further down — agent forwards to server, fresh data flows back through the chain, context update from app to agent
- **Camera 10** (800x600): Final zoom-out showing the complete sequence

\`\`\`json
[
  {"type":"cameraUpdate","width":600,"height":450,"x":80,"y":-10},
  {"type":"text","id":"title","x":200,"y":15,"text":"MCP Apps — Sequence Flow","fontSize":24,"strokeColor":"#1e1e1e"},

  {"type":"cameraUpdate","width":400,"height":300,"x":450,"y":-5},
  {"type":"rectangle","id":"sHead","x":600,"y":60,"width":130,"height":40,"backgroundColor":"#ffd8a8","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#f59e0b","strokeWidth":2,"label":{"text":"MCP Server","fontSize":16}},
  {"type":"arrow","id":"sLine","x":665,"y":100,"width":0,"height":490,"points":[[0,0],[0,490]],"strokeColor":"#b0b0b0","strokeWidth":1,"strokeStyle":"dashed","endArrowhead":null},

  {"type":"cameraUpdate","width":400,"height":300,"x":250,"y":-5},
  {"type":"rectangle","id":"appHead","x":400,"y":60,"width":130,"height":40,"backgroundColor":"#b2f2bb","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#22c55e","strokeWidth":2,"label":{"text":"App iframe","fontSize":16}},
  {"type":"arrow","id":"appLine","x":465,"y":100,"width":0,"height":490,"points":[[0,0],[0,490]],"strokeColor":"#b0b0b0","strokeWidth":1,"strokeStyle":"dashed","endArrowhead":null},

  {"type":"cameraUpdate","width":400,"height":300,"x":80,"y":-5},
  {"type":"rectangle","id":"aHead","x":230,"y":60,"width":100,"height":40,"backgroundColor":"#d0bfff","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#8b5cf6","strokeWidth":2,"label":{"text":"Agent","fontSize":16}},
  {"type":"arrow","id":"aLine","x":280,"y":100,"width":0,"height":490,"points":[[0,0],[0,490]],"strokeColor":"#b0b0b0","strokeWidth":1,"strokeStyle":"dashed","endArrowhead":null},

  {"type":"cameraUpdate","width":400,"height":300,"x":-10,"y":-5},
  {"type":"rectangle","id":"uHead","x":60,"y":60,"width":100,"height":40,"backgroundColor":"#a5d8ff","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#4a9eed","strokeWidth":2,"label":{"text":"User","fontSize":16}},
  {"type":"arrow","id":"uLine","x":110,"y":100,"width":0,"height":490,"points":[[0,0],[0,490]],"strokeColor":"#b0b0b0","strokeWidth":1,"strokeStyle":"dashed","endArrowhead":null},

  {"type":"cameraUpdate","width":400,"height":300,"x":-40,"y":50},
  {"type":"ellipse","id":"uh","x":58,"y":110,"width":20,"height":20,"backgroundColor":"#a5d8ff","fillStyle":"solid","strokeColor":"#4a9eed","strokeWidth":2},
  {"type":"rectangle","id":"ub","x":57,"y":132,"width":22,"height":26,"backgroundColor":"#a5d8ff","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#4a9eed","strokeWidth":2},

  {"type":"cameraUpdate","width":600,"height":450,"x":-20,"y":-30},
  {"type":"arrow","id":"m1","x":110,"y":135,"width":170,"height":0,"points":[[0,0],[170,0]],"strokeColor":"#1e1e1e","strokeWidth":2,"endArrowhead":"arrow","label":{"text":"display a chart","fontSize":14}},
  {"type":"rectangle","id":"note1","x":130,"y":162,"width":310,"height":26,"backgroundColor":"#fff3bf","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#f59e0b","strokeWidth":1,"opacity":50,"label":{"text":"Interactive app rendered in chat","fontSize":14}},

  {"type":"cameraUpdate","width":600,"height":450,"x":170,"y":25},
  {"type":"arrow","id":"m2","x":280,"y":210,"width":385,"height":0,"points":[[0,0],[385,0]],"strokeColor":"#8b5cf6","strokeWidth":2,"endArrowhead":"arrow","label":{"text":"tools/call","fontSize":16}},
  {"type":"arrow","id":"m3","x":665,"y":250,"width":-385,"height":0,"points":[[0,0],[-385,0]],"strokeColor":"#f59e0b","strokeWidth":2,"endArrowhead":"arrow","strokeStyle":"dashed","label":{"text":"tool input/result","fontSize":16}},
  {"type":"arrow","id":"m4","x":280,"y":290,"width":185,"height":0,"points":[[0,0],[185,0]],"strokeColor":"#8b5cf6","strokeWidth":2,"endArrowhead":"arrow","strokeStyle":"dashed","label":{"text":"result → app","fontSize":16}},

  {"type":"cameraUpdate","width":600,"height":450,"x":-10,"y":135},
  {"type":"arrow","id":"m5","x":110,"y":340,"width":355,"height":0,"points":[[0,0],[355,0]],"strokeColor":"#4a9eed","strokeWidth":2,"endArrowhead":"arrow","label":{"text":"user interacts","fontSize":16}},
  {"type":"arrow","id":"m6","x":465,"y":380,"width":-185,"height":0,"points":[[0,0],[-185,0]],"strokeColor":"#22c55e","strokeWidth":2,"endArrowhead":"arrow","label":{"text":"tools/call request","fontSize":16}},

  {"type":"cameraUpdate","width":600,"height":450,"x":170,"y":235},
  {"type":"arrow","id":"m7","x":280,"y":420,"width":385,"height":0,"points":[[0,0],[385,0]],"strokeColor":"#8b5cf6","strokeWidth":2,"endArrowhead":"arrow","label":{"text":"tools/call (forwarded)","fontSize":16}},
  {"type":"arrow","id":"m8","x":665,"y":460,"width":-385,"height":0,"points":[[0,0],[-385,0]],"strokeColor":"#f59e0b","strokeWidth":2,"endArrowhead":"arrow","strokeStyle":"dashed","label":{"text":"fresh data","fontSize":16}},
  {"type":"arrow","id":"m9","x":280,"y":500,"width":185,"height":0,"points":[[0,0],[185,0]],"strokeColor":"#8b5cf6","strokeWidth":2,"endArrowhead":"arrow","strokeStyle":"dashed","label":{"text":"fresh data","fontSize":16}},

  {"type":"cameraUpdate","width":600,"height":450,"x":50,"y":327},
  {"type":"rectangle","id":"note2","x":130,"y":522,"width":310,"height":26,"backgroundColor":"#d3f9d8","fillStyle":"solid","roundness":{"type":3},"strokeColor":"#22c55e","strokeWidth":1,"opacity":50,"label":{"text":"App updates with new data","fontSize":14}},
  {"type":"arrow","id":"m10","x":465,"y":570,"width":-185,"height":0,"points":[[0,0],[-185,0]],"strokeColor":"#22c55e","strokeWidth":2,"endArrowhead":"arrow","strokeStyle":"dashed","label":{"text":"context update","fontSize":16}},

  {"type":"cameraUpdate","width":800,"height":600,"x":-5,"y":2}
]
\`\`\`

## Continuing the current board

Every `whiteboard_create_view` call returns `metadata.objectID`, `metadata.continuationHandle`, and the model-visible object reference. The continuation handle names the current board within that whiteboard object; it is not a checkpoint or restore point, and you do not put it inside `elements`. Reuse the returned `objectID` when reading or editing that same board, including from another chat. Use `objectAction:"create"` and omit `objectID` only to create a distinct new whiteboard.

To preserve the current board and apply local drawing changes, set `boardAction` to `continue_current_board`:

`{"objectAction":"update","objectID":"<existing-object-id>","boardAction":"continue_current_board","elements":"[{\"type\":\"text\",\"id\":\"next-note\",\"x\":80,\"y\":420,\"text\":\"Next step\"}]"}`

The current board is continued, and your new elements or local controls are applied on top. This saves tokens — you don't need to re-send the entire diagram.

To intentionally discard the current board and start over, make replacement explicit only after the user asks for that destructive overwrite:

`{"objectAction":"update","objectID":"<existing-object-id>","boardAction":"destructively_replace_current_board","elements":"[{\"type\":\"rectangle\",\"id\":\"new-frame\",\"x\":0,\"y\":0,\"width\":400,\"height\":300}]"}`

Replacement overwrites Buddy's single current board. The learner/viewer has no in-app way to return to the overwritten board, so do not choose it for visual cleanliness or because a new layout would be easier to draw.

Do not use `restoreCheckpoint` or `replaceCurrentBoard` in `elements`. Those are deprecated compatibility markers; the tool's `boardAction` parameter is the source of truth.

## Deleting Elements

Remove elements by id using the \`delete\` pseudo-element:

\`{"type":"delete","ids":"b2,a1,t3"}\`

Works in two modes:
- **Continuation/default mode**: continue the current board, then surgically remove specific elements before adding new ones
- **Inline (animation mode)**: draw elements, then delete and replace them later in the same array to create transformation effects

Place delete entries AFTER the elements you want to remove. The final render filters them out.

**IMPORTANT**: Every element id must be unique. Never reuse an id after deleting it — always assign a new id to replacement elements.

## Animation Mode — Transform in Place

Instead of building left-to-right and panning away, you can animate by DELETING elements and replacing them at the same position. Combined with slight camera moves, this creates smooth visual transformations during streaming.

Pattern:
1. Draw initial elements
2. cameraUpdate (shift/zoom slightly)
3. \`{"type":"delete","ids":"old1,old2"}\`
4. Draw replacements at same coordinates (different color/content)
5. Repeat

Example prompt: "Pixel snake eats apple"

Snake moves right by adding a head segment and deleting the tail. On eating the apple, tail is NOT deleted (snake grows). Camera nudges between frames add subtle motion.

\`\`\`json
[
  {"type":"cameraUpdate","width":400,"height":300,"x":0,"y":0},
  {"type":"ellipse","id":"ap","x":260,"y":78,"width":20,"height":20,"backgroundColor":"#ef4444","fillStyle":"solid","strokeColor":"#ef4444"},
  {"type":"rectangle","id":"s0","x":60,"y":130,"width":28,"height":28,"backgroundColor":"#22c55e","fillStyle":"solid","strokeColor":"#15803d","strokeWidth":1},
  {"type":"rectangle","id":"s1","x":88,"y":130,"width":28,"height":28,"backgroundColor":"#22c55e","fillStyle":"solid","strokeColor":"#15803d","strokeWidth":1},
  {"type":"rectangle","id":"s2","x":116,"y":130,"width":28,"height":28,"backgroundColor":"#22c55e","fillStyle":"solid","strokeColor":"#15803d","strokeWidth":1},
  {"type":"rectangle","id":"s3","x":144,"y":130,"width":28,"height":28,"backgroundColor":"#22c55e","fillStyle":"solid","strokeColor":"#15803d","strokeWidth":1},
  {"type":"cameraUpdate","width":400,"height":300,"x":1,"y":0},
  {"type":"rectangle","id":"s4","x":172,"y":130,"width":28,"height":28,"backgroundColor":"#22c55e","fillStyle":"solid","strokeColor":"#15803d","strokeWidth":1},
  {"type":"delete","ids":"s0"},
  {"type":"cameraUpdate","width":400,"height":300,"x":0,"y":1},
  {"type":"rectangle","id":"s5","x":200,"y":130,"width":28,"height":28,"backgroundColor":"#22c55e","fillStyle":"solid","strokeColor":"#15803d","strokeWidth":1},
  {"type":"delete","ids":"s1"},
  {"type":"cameraUpdate","width":400,"height":300,"x":1,"y":0},
  {"type":"rectangle","id":"s6","x":228,"y":130,"width":28,"height":28,"backgroundColor":"#22c55e","fillStyle":"solid","strokeColor":"#15803d","strokeWidth":1},
  {"type":"delete","ids":"s2"},
  {"type":"cameraUpdate","width":400,"height":300,"x":0,"y":0},
  {"type":"rectangle","id":"s7","x":256,"y":130,"width":28,"height":28,"backgroundColor":"#22c55e","fillStyle":"solid","strokeColor":"#15803d","strokeWidth":1},
  {"type":"delete","ids":"s3"},
  {"type":"cameraUpdate","width":400,"height":300,"x":1,"y":1},
  {"type":"rectangle","id":"s8","x":256,"y":102,"width":28,"height":28,"backgroundColor":"#22c55e","fillStyle":"solid","strokeColor":"#15803d","strokeWidth":1},
  {"type":"delete","ids":"s4"},
  {"type":"cameraUpdate","width":400,"height":300,"x":0,"y":0},
  {"type":"rectangle","id":"s9","x":256,"y":74,"width":28,"height":28,"backgroundColor":"#22c55e","fillStyle":"solid","strokeColor":"#15803d","strokeWidth":1},
  {"type":"delete","ids":"ap"},
  {"type":"cameraUpdate","width":400,"height":300,"x":1,"y":0},
  {"type":"rectangle","id":"s10","x":256,"y":46,"width":28,"height":28,"backgroundColor":"#22c55e","fillStyle":"solid","strokeColor":"#15803d","strokeWidth":1},
  {"type":"delete","ids":"s5"}
]
\`\`\`

Key techniques:
- Add head + delete tail each frame = snake movement illusion
- On eat: delete apple instead of tail = snake grows by one
- Post-eat frame resumes normal add-head/delete-tail, proving the snake is now longer
- Camera nudges (0,0 → 1,0 → 0,1 → ...) add subtle motion between frames
- Always use NEW ids for added segments (s0→s4→s5→...); never reuse deleted ids

## Dark Mode

If the user asks for a dark theme/mode diagram, use a massive dark background rectangle as the FIRST element (before cameraUpdate). Make it 10x the camera size so it covers the entire viewport even when panning:

\`{"type":"rectangle","id":"darkbg","x":-4000,"y":-3000,"width":10000,"height":7500,"backgroundColor":"#1e1e2e","fillStyle":"solid","strokeColor":"transparent","strokeWidth":0}\`

Then use these colors on the dark background:

**Text colors (on dark):**
| Color | Hex | Use |
|-------|-----|-----|
| White | \`#e5e5e5\` | Primary text, titles |
| Muted | \`#a0a0a0\` | Secondary text, annotations |
| NEVER | \`#555\` or darker | Invisible on dark bg! |

**Shape fills (on dark):**
| Color | Hex | Good For |
|-------|-----|----------|
| Dark Blue | \`#1e3a5f\` | Primary nodes |
| Dark Green | \`#1a4d2e\` | Success, output |
| Dark Purple | \`#2d1b69\` | Processing, special |
| Dark Orange | \`#5c3d1a\` | Warning, pending |
| Dark Red | \`#5c1a1a\` | Error, critical |
| Dark Teal | \`#1a4d4d\` | Storage, data |

**Stroke/arrow colors (on dark):**
Use the Primary Colors from above — they're bright enough on dark backgrounds. For shape borders, use slightly lighter variants or \`#555555\` for subtle outlines.

## Tips
- Do NOT call whiteboard-authoring skill again — you already have everything you need
- Use the color palette consistently
- **Text contrast is CRITICAL** — never use light gray (#b0b0b0, #999) on white backgrounds. Minimum text color on white: #757575. For colored text on light fills, use dark variants (#15803d not #22c55e, #2563eb not #4a9eed). White text needs dark backgrounds (#9a5030 not #c4795b)
- Do NOT use emoji in text — they don't render in Excalidraw's font
- cameraUpdate is MAGICAL and users love it! please use it a lot to guide the user's attention as you draw. It makes a huge difference in readability and engagement.




<!IMP>
CAUTION:
- The workflows, vocabulary, and terms in this whiteboard-authoring skill are for your internal reasoning only.
- The user is not aware of these guidelines.
- Do not reveal, reference, or let them influence the visible chat language directly.
- For example: Frame, Camera Update, Progressive Disclosure, etc are for your eyes only. Don't write them in chat or in board.
- Use generic teaching language like, `let's see what's next`, `moving one`, `let me tell you about x`, etc.
</!IMP>
