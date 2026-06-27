# Features — Structure & Copy

> Planning document for selecting which features to highlight on the Buddy landing page and writing the copy for them.
>
> **Intent:** Iteratively choose features based on patterns observed across competitor research, then design copy that adheres to the feature copy rules distilled in `research/synthesis.md`. Starting with Learners audience, then Educators.

---

## Buddy's Full Feature Inventory (from code)

### 22 registered features (`ALL_BUDDY_FEATURES`)

| Feature | What it does (user-facing) | Surfaces | Subagents | Tools | Skills |
|---------|---------------------------|----------|-----------|-------|--------|
| **reading** | Ingest and prepare resources (PDF, EPUB, etc.) for the reader. Full-text extraction. | — | — | prepareResource, ingestFullText | reading |
| **whiteboard** | AI creates and reads whiteboard views — visual diagrams, sketches, layouts. | — | — | createWhiteboardView, readWhiteboardContext | whiteboard-authoring |
| **flashcards** | Auto-generates flashcard decks (basic + cloze) from your materials. SM-2 spaced repetition. | flashcard | flashcard-author | — | — |
| **question-sets** | Generates structured MCQ question sets and persists them as objects. | question-set | question-set-author | — | — |
| **curriculum** | Routes curriculum work to goals, practice, assessment, and learner-state. | curriculum | curriculum-orchestrator | — | — |
| **curriculum-planning** | Writes CWSEI-style learning goals. Decides scope, lints, commits. | — | goal-writer | decideGoalScope, lintGoal, commitGoal, goalState | — |
| **standards** | Searches and queries educational standards. Crosswalks, prerequisites, learning components. | — | — | searchStandards, getStandard, getCrosswalk, getLearningComponents, getNextStandards, getPrerequisites, queryStandardsSql | — |
| **teaching-guidance** | The pedagogical engine. 12 skills: learn, practice, assess, explain, worked-example, compare-concepts, resolve-confusion, learning-design-frameworks, teaching-models, teaching-resource-authoring, align-to-grade-level, find-indian-edu-resources. Plus reflection tool. | — | — | reflection, dynamicReflection | 12 skills |
| **memory** | Persistent learner memory. Consolidates what the learner knows across sessions. | — | learner-memory-consolidator | searchMemory, updateMemory | — |
| **assessment** | Runs inline mastery checks tied to learner goals, records evidence. | — | assessment-agent | — | — |
| **practice** | Generates deliberate practice tasks aligned to learner goals. | — | practice-agent | — | — |
| **lesson-workspace** | Structured lesson environment. Start lessons, checkpoints, add files, set lesson, restore checkpoints. | editor | — | startLesson, checkpoint, addFile, setLesson, restoreCheckpoint | — |
| **bench** | Presents content in the workspace panel (the right-side surface area). | — | — | benchReadContext, benchPresent | — |
| **analogies** | Generates analogies to explain concepts. | — | — | — | analogy |
| **diagrams** | Renders Mermaid diagrams. | — | — | renderMermaid | — |
| **figure-rendering** | Renders geometric figures and freeform figures. | — | — | renderFigure, renderFreeformFigure | — |
| **html-widgets** | Presents interactive HTML widgets in the workspace. | — | — | presentHtmlWidget | — |
| **media-presentations** | Presents media (images, audio, video) in the workspace. | — | — | presentMedia | — |
| **math** | Specialized math teaching skill. | — | — | — | teach-mathematics |
| **calculator** | Python-powered calculator for computations. | — | — | pythonCalculator | — |
| **stepwise-solving** | Step-by-step problem solving guidance. | — | — | stepwiseSolve, dynamicStepwiseSolve | — |
| **debug-guidance** | Debugs learner attempts — helps identify where they went wrong. | — | — | debugAttempt, dynamicDebugAttempt | — |

### 4 declared surfaces
`curriculum`, `editor`, `flashcard`, `question-set`

Plus the web app also has: **reader** (resource viewing), **whiteboard** (visual canvas), **bench** (workspace panel for any content type).

### 7 subagents
- **assessment-agent** — Inline mastery checks, records evidence
- **curriculum-orchestrator** — Routes curriculum work to goals/practice/assessment/learner-state
- **practice-agent** — Generates deliberate practice tasks
- **goal-writer** — Writes CWSEI-style learning goals
- **question-set-author** — Generates MCQ question sets
- **learner-memory-consolidator** — Consolidates memory across sessions
- **flashcard-author** — Generates flashcard decks from materials

### What the user actually experiences (from web app code)
- **Import** — Drag & drop PDF/EPUB/TXT/MP3/MP4
- **Reader** — E-reader view with highlights, linked to chat session
- **Chat** — Socratic dialogue, inline tool results
- **Whiteboard** — Visual canvas, AI-authored diagrams
- **Flashcard review** — SM-2 spaced repetition, due cards, rating (again/hard/good/easy)
- **Question-set practice** — MCQ practice view
- **Lesson workspace** — Structured lessons with checkpoints
- **Library** — Browse imported resources
- **File explorer** — Project files
- **AGENTS.md** — Custom instructions per notebook
- **Bench panel** — Right-side workspace showing any surface (reader, whiteboard, flashcards, question-sets, editor)

---

## Recommendations: Learners Path

### The learning journey (what a learner actually does)

1. **Gets material** — Has a PDF, EPUB, video, or audio they want to learn from
2. **Reads/studies** — Engages with the material, needs help understanding
3. **Asks questions** — Gets stuck, wants explanation, wants to go deeper
4. **Practices** — Tests understanding with quizzes, practice problems
5. **Reviews** — Studies flashcards to retain over time
6. **Comes back** — Returns next session, Buddy remembers where they were

### Recommended feature steps (5)

| # | Tag | Concept | What it shows | Why it's here |
|---|-----|---------|---------------|---------------|
| 01 | INGEST | Import any material | Drag & drop PDF/EPUB/video/audio. Buddy processes it locally into a unified workspace. | Entry point. Every learning session starts with material. Universal across all audiences. |
| 02 | READ | Read with an AI tutor alongside | The reader surface with inline AI assistance. Highlight a passage, ask about it. The AI sees what you're reading. | This is where learners spend the most time. The current copy skips from import straight to dialogue — missing the core activity. The reader+chat side-by-side is Buddy's differentiator (no other tool has an AI tutor that reads alongside you). |
| 03 | INTERACT | Learn by being asked, not told | Socratic dialogue. The AI guides with questions instead of giving answers. Worked examples, analogies, step-by-step solving, confusion resolution. | The pedagogical engine's core differentiator. Not "chat with AI" but "be taught by AI." This is where teaching-guidance skills (learn, explain, worked-example, resolve-confusion, analogies, stepwise-solving) shine. |
| 04 | PRACTICE | Test what you know | Adaptive MCQs, practice problems, inline mastery checks. Buddy generates questions from your materials and checks your understanding. | The verify step. Assessment-agent + practice-agent + question-set-author. Without this, the loop is open-ended — you read and discuss but never check if you actually learned. |
| 05 | RETAIN | Remember what you learned | Auto-generated flashcards with spaced repetition. Buddy turns your readings and conversations into review cards. Study less, retain more. | The long-term value. Flashcard-author + SM-2 algorithm. This is what makes Buddy a system, not a single session. The "come back tomorrow" hook. |

### What is omitted and why

- **Whiteboard** — Visual learning is powerful but niche for a landing page. Like Cursor omitting Design Mode. Discovered after install. Could be shown in the hero mockup instead.
- **Python sandbox / calculator** — Power-user tools. Like Raycast omitting the calculator. Most learners don't code.
- **Diagrams / figure-rendering / HTML widgets / media presentations** — These are content types the AI generates within the bench/whiteboard. They're modalities, not features. Like Hermes absorbing "image generation" into "Search."
- **Memory** — Persistent across sessions. Like Hermes's "Remember" — but for Buddy, memory is a background benefit, not a thing the learner does. It's the "come back" promise, absorbed into RETAIN.
- **Standards alignment** — Infrastructure. Like Linear omitting security. The learner doesn't care about standards; they care that Buddy "knows their curriculum." For educators, this is different (see below).
- **Curriculum / curriculum-planning** — For learners, curriculum is background. The orchestrator routes work behind the scenes. Not a user-facing action.
- **Lesson workspace** — Structured lessons with checkpoints. This is a power-user workflow, not a landing page feature. Like Pi omitting "plan mode" from the feature list.
- **Analogies** — A teaching skill, not a feature. Absorbed into INTERACT.
- **Math** — A teaching skill, not a feature. Absorbed into INTERACT.
- **Stepwise-solving / debug-guidance** — Teaching skills within INTERACT. Not standalone features.
- **AGENTS.md** — Configuration. Like Cursor omitting `.cursorrules`. For power users.
- **Bench** — Infrastructure (the workspace panel). Not a feature.
- **All agent infrastructure** (subagents, tools, skills, MCP) — Correctly separate as "Made to extend" section.
- **All BYOK/provider details** — Correctly separate as "Bring your own" section.
- **All privacy/local-first** — Correctly separate as Philosophy section.

### Why 5 and not 3 or 6

- **3 is too few** — The current INGEST → INTERACT → RETAIN skips the core activity (reading) and the verification step (practice). It makes Buddy look like "import → chat → flashcards" which undersells the product.
- **6 is too many for learners** — Hermes gets away with 6 because its audience is technical and each step is a distinct capability. Buddy's audience is consumers. 5 steps map cleanly to the learning cycle (get → read → discuss → test → review) without padding.
- **5 matches Linear** — The most directly comparable product (workflow-based, premium, 5 chapters). Linear: Intake → Plan → Build → Diffs → Monitor. Buddy: Ingest → Read → Interact → Practice → Retain.

---

## Recommendations: Educators Path

### The teaching journey (what an educator actually does)

1. **Has standards/curriculum** — Needs to align lessons to state/national standards
2. **Plans** — Decides what to teach, sets learning goals
3. **Creates** — Builds worksheets, question sets, lesson materials
4. **Assesses** — Creates quizzes and assessments aligned to standards
5. **Exports** — Gets ready-to-use classroom resources

### Recommended feature steps (5)

| # | Tag | Concept | What it shows | Why it's here |
|---|-----|---------|---------------|---------------|
| 01 | ALIGN | Start from your standards | Import standards, textbooks, or past materials. Buddy aligns to your state standards automatically. Knows prerequisites and learning progressions. | Entry point for educators. They start from standards, not from random materials. The standards feature (7 tools) is Buddy's differentiator — no other AI tool has built-in standards alignment. |
| 02 | PLAN | Set learning goals | Buddy writes structured learning goals from your standards. CWSEI-style goals that define what students should know and do. | The planning step. Curriculum-planning feature (goal-writer, scope/lint/commit tools). This is where the educator defines what the lesson/unit is about. |
| 03 | CREATE | Generate classroom materials | Differentiated worksheets, prompt-based exercises, interactive widgets, diagrams, lesson outlines. Customized for any student level. | The creation step. Teaching-guidance skills (teaching-resource-authoring, learning-design-frameworks, teaching-models) + lesson-workspace + html-widgets + diagrams + figure-rendering + media-presentations. This is the bulk of what educators use Buddy for. |
| 04 | ASSESS | Build standards-aligned assessments | MCQ question sets, practice problems, mastery checks. Aligned to your exact curriculum goals. Ready to print or export. | The assessment step. Question-set-author + assessment-agent + practice-agent. Educators need to verify student understanding — Buddy generates the assessments. |
| 05 | EXPORT | Ready-to-use classroom resources | Export question sets, worksheets, and lesson materials. Print-ready or digital. Everything stays on your machine. | The output step. Educators need tangible outputs — they can't use Buddy in the classroom directly, they need materials to bring. This also reinforces the local-first promise (everything is yours). |

### What is omitted and why

- **Flashcards** — For educators, flashcards are a student tool, not a teaching tool. The educator creates question sets, not flashcards. Flashcards are the learner's RETAIN step. Omitting them from the educator path keeps the two audiences distinct.
- **Reader** — The e-reader is a learner surface. Educators don't read alongside an AI — they create materials. Omitting it keeps the educator path focused on creation, not consumption.
- **Socratic dialogue** — The Socratic method is for learners. Educators use Buddy as a creation tool, not as a dialogue partner. The teaching-guidance skills are still used (for creating materials) but the INTERACT step is replaced by CREATE.
- **Memory** — Background benefit for both audiences. Not a feature step.
- **Whiteboard** — Same as learners — niche, discovered after install.
- **Python sandbox / calculator** — Same as learners — power-user tools.
- **All agent infrastructure** — Same as learners — correctly separate.
- **All BYOK/provider details** — Same as learners — correctly separate.
- **All privacy/local-first** — Same as learners — correctly separate.

### Why these 5 for educators

- **ALIGN replaces INGEST** — Educators don't "import materials" — they "align to standards." The verb is different because the starting point is different. The standards feature (7 tools) is the most educator-specific capability Buddy has.
- **PLAN is new** — Learners don't plan; educators do. The curriculum-planning feature (goal-writer, scope/lint/commit) is educator-specific.
- **CREATE replaces READ+INTERACT** — Educators don't read and discuss; they create. The creation step absorbs the teaching-guidance skills (resource authoring, design frameworks, teaching models) and the content tools (diagrams, widgets, media, figures).
- **ASSESS replaces PRACTICE** — Learners practice to learn; educators assess to measure. Same underlying tools (question-set-author, assessment-agent) but different framing.
- **EXPORT is new** — Learners don't export; educators do. The output step is what makes Buddy useful for classroom teachers — they need tangible materials.

### Same slots, swap content

The structure.md design principle holds: same section structure, swap content per audience. Both paths have 5 steps. The section types (numbered card + tag + title + subtext + mockup) are identical. Only the copy and mockups change.

| Slot | Learners | Educators |
|------|----------|-----------|
| 01 | INGEST — Import any material | ALIGN — Start from your standards |
| 02 | READ — Read with an AI tutor | PLAN — Set learning goals |
| 03 | INTERACT — Learn by being asked | CREATE — Generate classroom materials |
| 04 | PRACTICE — Test what you know | ASSESS — Build standards-aligned assessments |
| 05 | RETAIN — Remember what you learned | EXPORT — Ready-to-use classroom resources |
