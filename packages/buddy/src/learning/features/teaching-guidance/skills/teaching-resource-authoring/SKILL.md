---
name: teaching-resource-authoring
description: Use when Buddy needs to create, critique, or revise tangible teaching resources - quizzes, item sets, assessments, diagnostics, rubrics, worksheets, worked examples, exemplars, study guides, reading packets, writing prompts, project briefs, lab sheets, discussion protocols, collaboration sheets, feedback forms, or revision trackers. Use when the user asks for an actual artifact, packet, handout, checklist, prompt, rubric, protocol, or review of one. Do not use for broad pedagogy, curriculum alignment, access planning, or teaching-framework selection; use learning-design-frameworks for those. Do not use for choosing a moment-to-moment teaching move during a tutoring session; use teaching-models for that.
---

# Teaching Resource Authoring

Helps you build teaching resources of teachers and learners.

A teaching resource is a **tangible artifact**, not the teaching theory behind it.

Examples:

- quiz, question set, assessment, diagnostic, rubric, score guide;
- worksheet, practice sheet, worked example, study guide;
- reading packet, writing prompt, project brief, lab sheet;
- discussion protocol, collaboration sheet, feedback form, revision tracker.

Not resources:

- Bloom's Taxonomy, DOK, UDL, UbD, explicit instruction, formative assessment, differentiation, scaffolding, metacognition, accessibility.

Those are frameworks, models, or design lenses. Use them to improve the artifact, but do not mistake them for the artifact.

--- [!IMPORTANT] ---

## Buddy Specific Instructions

### Interactive mode
  
When a teacher asks you for a material that is normally a document — a worksheet, quiz, study guide, rubric, reading packet, lab sheet, or anything they would hand out, fill in, or print — build it in interactive mode, not as a plain chat answer.

Interactive mode means you write the material as a document file and present it on Bench. Bench is Buddy's document surface: when you present a document there, the teacher sees a clean, rendered version of it beside the conversation, and it is fully editable by them.

This turns authoring into a back-and-forth instead of a one-shot dump:

1. You produce a draft in .mdx format. [DON'T give the material in the chat response.]
2. Present it on Bench. [use bench_present tool; dont present inline]
3. The teacher reads it, edits it directly if they want, or selects a specific part of the document and sends that selection back to you.
4. You revise based on exactly what they highlighted, then present the updated document.
5. Repeat until the material is right.

The Bench editor also has a Download as PDF button, so the teacher can export the finished material directly. PDF export is available in the desktop app.

### Output format: MDX by default

Use `.mdx` as your default file format for any document-form material.

MDX is a superset of Markdown: everything Markdown can do, MDX can do, plus more. There is no downside to starting with MDX, and you will not have to switch formats later if the material turns out to need richer features.

Use plain `.md` only when the teacher specifically asks for Markdown.

To see exactly what the Bench mdx surface supports and how to use each feature, read `references/buddy-mdx-support.md` (includes a worked `render_svg` → MDX image example). In short, it covers headings, lists, tables, links, code blocks, rendered math, rendered Mermaid and chemistry fences, callout blocks for teacher notes and checks for understanding, YAML frontmatter, images, safe HTML for cards/grids/timelines, and inline safe SVG for labeled diagrams and printable visuals. Prefer native chemistry fences when the visual can remain in MDX. Use `render_svg` only when the resource or export needs an actual standalone SVG file; reference the resulting file from MDX and keep its accessibility text at the usage site. After the file exists, you can manually edit the SVG or the image markup to make it larger or smaller when the teacher asks—do not re-run `render_svg` for size-only tweaks. Custom JSX/MDX components are preserved but shown inertly — they will not execute as code. If the teacher wants something genuinely interactive or application-like, that is a different surface; let them know and use Buddy's HTML widgets for that instead.

### Export and convert

PDF via the Bench download button is the built-in export. But be willing to convert the material into any other format the teacher asks for — DOCX, a styled printable PDF, slides, plain text, or anything else.

You will have skills for some of these conversions already. If a requested format does not have a skill, install and use whatever library is needed to get the job done. Do not refuse a reasonable export request on the grounds of no built-in support — produce the file the teacher asked for.


### Direct asks:
- if the user directly asks for a format like pdf/docx, do the job directly and then when done, educate them on interactive mode.

--- [!IMPORTANT] ---



## General Instructions

The rest of this skill routes tangible teaching-resource work to source-grounded reference handbooks.

Use it when the user wants a concrete resource that a teacher, learner, or instructional designer could hold, distribute, fill in, score with, revise from, or use during instruction.

Read only the reference files needed for the current artifact, usually one and at most three. If the user asks for a full resource package, combine the relevant families explicitly rather than pretending one handbook covers every component.

## Router

### Assessment, Evidence, And Judgment

#### Question And Item Sets

Read `references/question-item-sets.md`.

Use when the artifact is a set of prompts, quiz questions, MCQs, short-answer items, oral questions, source-based item clusters, retrieval questions, or an item bank.

Do not use as the lead for a full test package with blueprint, timing, administration, scoring, and score-use rules; use assessment instruments.

#### Assessment Instruments

Read `references/assessment-instruments.md`.

Use when the resource is a coordinated assessment package: purpose, blueprint, items or tasks, administration directions, scoring materials, and interpretation or follow-up guidance.

Do not use when the user only needs a few questions, a rubric, a diagnostic probe, or a feedback form.

#### Diagnostic Instruments

Read `references/diagnostic-instruments.md`.

Use when the artifact locates starting points, gaps, misconceptions, prerequisite weaknesses, grouping needs, or intervention progress. Look for screeners, pretests, misconception probes, progress-monitoring probes, coding guides, and interpretation bands.

Do not use for grading, ranking, end-of-unit judgment, or high-stakes placement without a stronger assessment design.

#### Criteria And Scoring Materials

Read `references/criteria-scoring-materials.md`.

Use when the artifact defines how quality will be judged: rubrics, mark schemes, score guides, level descriptors, anchor descriptors, moderation sheets, or scoring keys for open work.

Do not use when the task itself is missing; first author the writing task, project brief, lab sheet, or assessment instrument that will elicit the work.

### Learning, Practice, And Improvement Supports

#### Practice Materials And Worksheets

Read `references/practice-materials-worksheets.md`.

Use when the resource is a learner-facing practice sheet, homework task, retrieval sheet, mixed problem set, fluency page, or scaffolded handout for rehearsal after instruction has begun.

Do not use for first teaching, summative evidence, diagnostic placement, or study planning across weeks.

#### Worked-Example Materials

Read `references/worked-example-materials.md`.

Use when the resource shows a procedure, solution path, reasoning process, or faded sequence: worked solutions, annotated examples, completion examples, example-problem pairs, or error-analysis models.

Do not use for model essays or quality exemplars unless the main job is showing step-by-step process.

#### Success And Exemplar Materials

Read `references/success-exemplar-materials.md`.

Use when the resource makes quality visible through success criteria, model answers, annotated exemplars, anchor sets, non-exemplars, comparison prompts, or benchmark samples.

Do not use as a substitute for a rubric, assignment brief, or feedback protocol; pair with those when needed.

#### Study And Revision Materials

Read `references/study-revision-materials.md`.

Use when the artifact helps learners review over time: study guides, flashcards, retrieval packs, revision planners, spaced calendars, knowledge organizers, or "how to study this unit" sheets.

Do not use for initial instruction, immediate practice worksheets, summative mock exams without study design, or feedback on submitted work.

#### Feedback And Revision Materials

Read `references/feedback-revision-materials.md`.

Use when the resource turns information about performance into action: teacher feedback forms, peer-feedback protocols, conference notes, response-to-feedback sheets, error-analysis sheets, feedforward planners, revision logs, or whole-class feedback capture sheets.

Do not use when there is no opportunity to revise or when the main need is to define scoring criteria first.

### Text, Writing, Inquiry, And Collaboration Artifacts

#### Reading Materials

Read `references/reading-materials.md`.

Use when the artifact is built around texts: reading packets, passages, text sets, vocabulary sheets, comprehension sets, annotation guides, document-based inquiry packets, digital-source evaluation tasks, or intervention reading packets.

Do not use when talk protocol, extended writing product, study review, or assessment scoring is the dominant artifact.

#### Writing-Task Materials

Read `references/writing-task-materials.md`.

Use when the artifact asks learners to produce writing: prompts, assignment briefs, planning sheets, drafting scaffolds, source-based writing packets, peer-review sheets inside a writing cycle, revision logs, or self-evaluation tools.

Do not use for isolated grammar drills, reading packets without a writing product, full rubrics, or project briefs where extended inquiry dominates.

#### Project And Performance Materials

Read `references/project-performance-materials.md`.

Use when the artifact structures extended work toward a product, performance, presentation, exhibition, portfolio, public audience, client, or authentic problem: project briefs, milestone trackers, collaboration packs, inquiry supports, critique protocols, performance-task packets, and exhibition guides.

Do not use for short writing prompts, standalone rubrics, simple worksheets, or single lab sheets unless they are part of an extended project arc.

#### Investigation And Lab Materials

Read `references/investigation-lab-materials.md`.

Use when the artifact structures empirical or engineering work: lab sheets, inquiry planners, data tables, CER organizers, experiment-design templates, fieldwork forms, engineering design packets, safety/materials notes, or virtual-lab investigation sheets.

Do not use for non-empirical reading, writing, practice, or assessment tasks unless the investigation is the spine of the work.

#### Discussion And Collaboration Materials

Read `references/discussion-collaboration-materials.md`.

Use when the artifact structures talk, listening, group reasoning, seminar work, debate, collaborative source evaluation, jigsaw work, peer critique, or discourse participation.

Do not use for unstructured group work, classroom management routines, individual practice, or project collaboration packs where the project brief is the lead artifact.

## Common Combinations

Use combinations when the user is building a real classroom packet:

- **Assessment package:** `assessment-instruments.md` + `question-item-sets.md` + `criteria-scoring-materials.md`.
- **Diagnostic package:** `diagnostic-instruments.md` + `question-item-sets.md`; add `feedback-revision-materials.md` if results trigger correction.
- **Writing unit:** `writing-task-materials.md` + `success-exemplar-materials.md` + `criteria-scoring-materials.md` + `feedback-revision-materials.md`; add `reading-materials.md` for source-based writing.
- **Project unit:** `project-performance-materials.md` + `criteria-scoring-materials.md` + `success-exemplar-materials.md` + `feedback-revision-materials.md`; add `discussion-collaboration-materials.md` for team protocols.
- **Investigation sequence:** `investigation-lab-materials.md` + `criteria-scoring-materials.md`; add `writing-task-materials.md` for lab reports or `discussion-collaboration-materials.md` for argument-from-evidence talk.
- **Reading-to-discuss:** `reading-materials.md` + `discussion-collaboration-materials.md`.
- **Novice procedure support:** `worked-example-materials.md` + `practice-materials-worksheets.md`; add `feedback-revision-materials.md` when learners revise attempts.
- **Exam preparation:** `study-revision-materials.md` + `question-item-sets.md`; add `assessment-instruments.md` only when building a true mock exam package.

## Relationship To Other Teaching Skills

Use `learning-design-frameworks` when the user needs a design lens or audit question: alignment, rigor, access, learner variability, formative evidence, metacognition, classroom culture, or technology use.

Use `teaching-models` when the user needs Buddy to choose a concrete way to teach in the moment, especially after confusion, boredom, or a failed explanation.

Use `teach-chemistry` when the artifact (or in-session explanation) needs chemistry equations, structure fences, reaction schemes, or `render_svg` chemistry file assets—display rules and format contracts live there; this skill owns Bench MDX resource workflow.

Use this skill when the result should be an artifact or a review of an artifact.

## Output Defaults

When authoring, produce a usable draft of the resource, not a lecture about the resource family. Include teacher-facing notes only when they are needed to use, adapt, score, or revise the artifact.

When reviewing, lead with the highest-impact fixes: boundary mismatch, missing purpose, weak evidence target, unusable workflow, missing feedback or interpretation path, fairness/access issues, and nearby-family confusion.

Keep framework names in the background unless the user asks for the rationale. The artifact should be clear enough that a teacher or learner can use it directly.
