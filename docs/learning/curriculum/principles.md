# Curriculum Principles

Status: concise principles index for Buddy's learning system. It is **not** the sole pedagogical authority. Detailed evidence, methods, examples, and craft rules live in the intent files and [cwsei/artifacts.md](./cwsei/artifacts.md). Shipped runtime owners live under `packages/buddy/src/learning/`.

This index distills evidence-based curriculum principles from the Carl Wieman Science Education Initiative (CWSEI), CU-SEI, and learning-sciences research. Use it to decide what Buddy should do pedagogically. Use the linked intent and craft documents when a principle needs the original procedure, table, or example.

---

## 1. Goals Drive Everything

Learning goals define **what the learner will be able to do**, not what topics will be covered or what the learner will "understand".

- **Course-Level Goals (4–7 outcomes):** Broad capabilities synthesizing an entire learning journey. Learning goals should cover approximately 70–80% of total course content, anchoring core instruction while leaving room for emerging inquiry.
- **Topic-Level Goals (3–7 per module):** Specific operational performances that roll up into course goals.
- **Checklist:** Observable action verb, concrete task, explicit criteria, and clear testability.
- **Deterministic Quality Rules:** Block vague verbs ("understand", "know", "learn"), split compound goals, avoid topic-as-goal labels, verify Bloom level matches verb, eliminate obscure jargon, and keep scope assessable in 1–2 tasks. Shipped lint codes live in `packages/buddy/src/learning/features/curriculum-planning/types.ts` (`VAGUE_VERB`, `MISSING_TESTABILITY`, `COMPOUND_GOAL`, `TOPIC_NOT_TASK`, `TEMPLATE_MISMATCH`, `LEVEL_VERB_MISMATCH`, `TOO_BROAD`, `JARGON_HEAVY`, `WEAK_RELEVANCE`, `COUNT_OUT_OF_RANGE`).

### The 3-Step Goal-Creation Process (Beth Simon CS Model)

1. **Assessment-Driven (Intent-Driven):** Start from what the learner wants to build or achieve. Ask: *"If the learner achieves their goal, what concrete tasks can they now perform?"*
2. **Content-Walk:** Review docs, syllabi, or codebase structures topic by topic. Ask: *"After this material is covered, what can the learner do?"* Push past "understand X" to operational actions (e.g., "rank algorithms", "debug race condition").
3. **Course-Level Synthesis:** Group topic-level goals into 4–7 major capabilities. Map each topic goal to the course goals it supports.

**Buddy product implications**

- Goal setting stays verb-driven, testable, and grounded in the learner's real project and motivation.
- Practice, assessment, progress, question sets, and teaching-guidance tools must link back to **goal IDs**. Shipped artifacts already do this (`goalIds` on question sets, reflection, stepwise-solve, debug-attempt; `goal_commit` writes IDs into the cross-notebook learner store).
- Conversation quality still matters: clarification and synthesis, not form filling.

*Detailed evidence: [goals.intent.md](./goals.intent.md)*

### Bloom's Taxonomy Verb Reference

| Level | Description | Representative Action Verbs |
| --- | --- | --- |
| **Factual Knowledge** | Remember and recall terms and facts | define, list, state, label, name, identify |
| **Comprehension** | Demonstrate understanding and meaning | describe, explain, summarize, interpret, illustrate |
| **Application** | Apply knowledge to novel/unfamiliar situations | apply, demonstrate, use, compute, solve, predict, construct, modify, implement |
| **Analysis** | Break down systems and examine parts | compare, contrast, categorize, distinguish, identify, infer |
| **Synthesis** | Integrate parts to create new solutions | develop, create, propose, formulate, design, invent |
| **Evaluation** | Critically appraise and defend decisions | judge, appraise, recommend, justify, defend, criticize, evaluate |

---

## 2. Practice is Where Most Learning Happens

Expertise develops through strenuous, deliberate practice—not passive lecture.

- **Challenging but Doable:** Tasks must demand concentration and match current learner mastery. Easy repetitive tasks produce little learning.
- **Pre-reading Accountability:** Low-stakes pre-reading checks (~2–5% course weight) drive an 85% completion rate, front-loading vocabulary so live sessions engage higher-order thinking.
- **In-Class / Interactive Activities:** Must be goal-aligned and require a tangible deliverable (decision + justification, prediction, ranking, or judgment).
- **Scaffolding Progression:** `Worked Example` → `Guided Exercise` → `Independent Problem` → `Transfer / Novel Context`.

### The 10 Components of Expert Thinking (CWSEI a–j)

Standard back-of-chapter exercises predominantly exercise routine procedures (component *i*). Buddy practice must target all ten:

| # | Expert-Thinking Component | Pedagogical Implementation |
| --- | --- | --- |
| **a** | Identify relevant vs. irrelevant concepts | Do not state which concept to apply up front |
| **b** | Separate surface features from underlying structure | Present problems with varying surface contexts |
| **c** | Identify needed information vs. extraneous noise | Include irrelevant data or omit non-critical details |
| **d** | Look up, estimate, or deduce missing information | Require active retrieval or documentation lookup |
| **e** | Make appropriate simplifying assumptions | Require learners to frame problem boundaries |
| **f** | Decompose complex problems into sub-problems | Multi-step challenges requiring architectural planning |
| **g** | Plan a solution before executing | Request approach explanation or pseudocode first |
| **h** | Use and translate between multiple representations | Move between diagrams, data models, code, and text |
| **i** | Carry out routine procedures quickly and accurately | Timed or focused procedural checks |
| **j** | Evaluate whether a result makes sense | Require sanity checks, boundary testing, and self-validation |

**Buddy product implications**

- `practice` is the default next move after goals or framing, unless the learner clearly needs explanation repair or evidence generation. The curriculum orchestrator prompt states this explicitly (`packages/buddy/src/learning/features/curriculum/subagents/orchestrator.md`).
- Practice tasks must include realistic context, constraints, a deliverable, and a self-check.
- Prefer one substantial deliberate-practice task over long concept-lecture drift.
- Shipped practice generation: `practice-agent` under `packages/buddy/src/learning/features/practice/`.

*Detailed evidence: [practice.intent.md](./practice.intent.md)*

---

## 3. Feedback Matters More Than Grading

Feedback is the single most powerful driver of learning gains.

> *"Teaching students to monitor their own performance should be the ultimate goal of feedback."* — Gibbs & Simpson

- **Criteria:** Timely (during the task), specific (small chunks), performance-focused (never personal), and actionable.
- **Closed-Loop Rule:** Feedback is incomplete until the learner acts on it (error explanation, revision, or aligned follow-up).
- **Scaffolding Fading:** Provide high hint density and breakdown early; fade support as proficiency grows, requiring autonomous debugging.

### Feedback Modalities

| Modality | Description | Buddy Implementation |
| --- | --- | --- |
| **Instructor, whole-class / pattern** | Common errors identified across many attempts, addressed as a pattern | Buddy identifies recurring misconceptions across session history |
| **Instructor, targeted** | Specific guidance on one attempt | Buddy analyzes code/answer and isolates the exact misconception |
| **Peer** | Learner-to-learner feedback with guidelines. CWSEI: imperfect feedback almost immediately is better than perfect feedback weeks later | No second student in a solo Buddy session; self-review against a rubric is the adaptation |
| **Self-assessment** | Learner evaluates own work against clear criteria | Buddy provides a rubric; learner self-checks before validation |
| **Real-time (clicker / discussion)** | Immediate response during activity | In-conversation micro-checks and prediction validations |
| **Automated** | Machine-graded routine checks | Execution results, test suites, linter output |

### Feedback Anti-Patterns to Avoid

- ❌ Feedback delivered too late to alter current task behavior.
- ❌ Vague praise or critique ("needs improvement" / "good job").
- ❌ Person-focused feedback ("you're not good at this").
- ❌ Feedback provided without requiring the learner to use it.
- ❌ Exclusively negative feedback (must validate working elements).
- ❌ Overwhelming the learner by critiquing everything at once (focus on the single most critical chunk).

**Buddy product implications**

- Feedback must be persisted as an **open required action**, not disposable commentary. The runtime snapshot exposes `openFeedback` with `requiredAction` from learner-memory records of type `open_loop` or `fragile_skill` (`packages/buddy/src/learning/features/memory/runtime/snapshot.ts`). Prompt digests include those lines (`packages/buddy/src/learning/prompt/runtime-context/learner-context/index.ts`).
- Later evidence can mark a loop resolved (`memory_resolved` and related events in learner-memory types). The learning plan / next-move logic must keep unresolved actions visible.
- Do not move on until the feedback loop closes.

*Detailed evidence: [feedback.intent.md](./feedback.intent.md)*

---

## 4. Assessment Exists to Generate Evidence

Assessment is an ongoing evidence-gathering mechanism to guide instruction, not an administrative grading hurdle.

### Research Evidence (Gibbs & Simpson)

- Exam scores correlate weakly with long-term retention; assignment scores are superior predictors.
- When continuous formative assignments constitute a significant fraction of assessment, course failure rates drop to **one-third (1/3)** compared to exam-only structures.
- Exam-only models induce naïve study habits (cramming, shallow memorization).

### What Makes Assessment Support Learning (CWSEI factors)

1. **Tasks are focused on the most important goals** — tied to learning goals, not trivia.
2. **Given frequently** — not just two midterms and a final.
3. **Require extended effort** — not only quick recall.
4. **Engage appropriate forms of study** — expert thinking, not memorization.
5. **Criteria are explicit** — the learner knows what is being assessed and how.
6. **Feedback is frequent, timely, specific** — and the learner must act on it.

### Attend-to-Feedback Mechanisms

Giving feedback is not enough. CWSEI requires the learner to act:

1. **Error explanation for credit** — explain what was wrong in your thinking to recover part of the demonstration.
2. **Reflection problems** — review prior work, list errors, explain what to do differently next time.
3. **Aligned future tasks** — later exercises test the same goals so past feedback is usable.

### Assessment Formats

| Format | Purpose | Buddy Delivery |
| --- | --- | --- |
| **Concept Checks** | Rapid check of prerequisites / pre-reading | Inline conversational prompts and quick MCQs |
| **Problem Sets** | Multi-step deliberate practice (components a–j) | Interactive exercises in the workspace / Bench |
| **Clicker / Discussion** | Deep conceptual differentiation with plausible distractors | Interactive Q&A: propose → debate → resolve |
| **2-Stage Assessment** | Individual attempt followed by collaborative/guided review | Solo attempt → Buddy diagnostic review → targeted follow-up |
| **Project Milestones** | Extended synthesis with explicit rubrics | Multi-file build tasks with automated verification |
| **Self-Assessment** | Metacognitive reflection against clear criteria | Learner self-checks against explicit rubrics |

### Suites of Questions (Alignment Mechanism)

Every learning goal aligns to a **suite of questions**: multiple tasks testing the identical underlying concept across varied surface features and settings.

**Bentley & Foley 5-step derivation method** (canonical; do not use a shortened 4-step copy):

1. Choose a target learning goal.
2. Determine assessment settings (guided practice, concept check, open challenge, code review).
3. Develop an initial application/prediction question.
4. Identify changeable variables and varied surface features.
5. Create at least one aligned variant per setting so learners cannot pattern-match.

Worked examples (cell biology surface features; software error-handling progression) live in [alignment.intent.md](./alignment.intent.md).

**Alignment map invariants**

- Goal without practice = aspirational (not taught).
- Goal without assessment = unverified (assumed).
- Practice without goal = busy work.

**Buddy product implications**

- Assessment is an **inline mastery-check** teaching move, not a grading mode or a separate exam surface. Shipped owner: `assessment-agent` (`packages/buddy/src/learning/features/assessment/`), whose prompt requires generating one inline check that produces evidence and a follow-up action.
- Assessment records should capture evidence criteria and follow-up actions, then update progress via learner memory rather than a separate gradebook.
- Alignment should encourage varied formats per goal.

*Detailed evidence: [assessment.intent.md](./assessment.intent.md) and [alignment.intent.md](./alignment.intent.md)*

---

## 5. Build on Prior Thinking

Teaching connects to existing knowledge structures and surfaces misconceptions early.

### Adaptation Heuristics

- **Two-Stage Review:** Start sessions with a low-stakes check of prior knowledge; address gaps before introducing new material.
- **Just-In-Time (JIT) Adjustments:** Pre-session diagnostics dynamically shape live session focus.
- **Evolving Criteria:** Early assessments are forgiving on syntax/execution; later assessments demand synthesis, robust error handling, and transfer.

### Per-Goal Evidence Status

| Status | Definition |
| --- | --- |
| **Not Started** | Goal established; no practice or assessment attempted |
| **In Progress** | Actively practiced; mastery criteria not yet demonstrated |
| **Demonstrated** | Validated through observable task evidence |
| **Needs Review** | Previously demonstrated; scheduled for spaced retrieval or showing regression |

**Buddy product implications**

- Learner memory must persist **across workspaces and sessions**. Durable store: `~/.buddy/learner-memory/` (see `docs/guides/learner-memory.md`). Runtime injection: `buildLearnerRuntimeSnapshot` plus prompt learner-context sections.
- Prompt digests and session plans should include prior evidence, misconceptions, and open feedback — not treat every session as fresh.
- **Learner-level** constraints and preferences belong in the learner store (`preference` / `constraint` memories → `constraintsSummary`).
- **Workspace-specific** constraints belong with notebook/project context, not the cross-notebook store. An earlier draft named `.buddy/context.json` for that split; that path is **not** present in current code. Workspace label and `project_context` memories are the shipped workspace-adjacent signals.

*Detailed evidence: [progress.intent.md](./progress.intent.md)*

---

## 6. Sequence for Retention, Not Just Coverage

Sequencing organizes goals into an interconnected progression that manages cognitive load.

- **Avoid Isolated Sequential Coverage:** Covering a topic once in isolation produces "chapter-bound" memory where learners recall that a concept belongs to Chapter 4 but cannot retrieve it in novel contexts.
- **Interleaving:** Alternating practice across related topics forces learners to discriminate between concepts and suppresses retrieval interference.
- **Spaced Retrieval:** Demonstrated goals resurface periodically in warm-ups and cumulative challenges.
- **Cognitive Load Protection:** Front-load terminology with pre-reading so live sessions focus on concepts; introduce worked examples early before requiring unassisted problem-solving; working memory holds roughly **4–7 new items**, so limit simultaneous novel terms and chunk instruction accordingly.
- **Prerequisites:** Dependencies form a flexible directed acyclic graph (DAG) rather than a rigid linear syllabus.

**Buddy product implications**

- Session planning should include review when due.
- Demonstrated goals should reappear as spaced retrieval, not vanish forever.
- Sequencing should respect prerequisites but still build broader associations.
- There is no separate shipped "sequencing agent" product mode. Ordering is a companion / orchestrator concern informed by goals, evidence, and the learner snapshot.

*Detailed evidence: [sequencing.intent.md](./sequencing.intent.md)*

---

## 7. Motivation and Constraints Are First-Class

- **Why It Matters:** Every task must pass the "Why should anyone care?" test, grounding practice in real problems.
- **Mastery and Agency:** Give learners a sense that mastery is achievable through effort, preserve personal agency over pace and choices, and never use scare tactics. See the [CWSEI artifact guardrails](./cwsei/artifacts.md) for the corresponding craft rule.
- **Persistent Constraints:** Time budgets, environment limits, tooling preferences, and prior background persist across sessions.

**Buddy product implications**

- Learner-level constraints stay in the learner store; workspace-specific opportunity/constraint text stays with the notebook/project, not mixed into cross-notebook memory as if it were a person trait.
- Session plans and practice tasks should explain why the next step matters now.

---

## Historical Implementation Risks That Still Bind

The following guardrails come from the historical build-strategy note. They remain durable design constraints, not a current runtime roadmap. Backticked tool names below are historical sketches unless a shipped owner is named.

1. **Assessment evaluation is the highest-risk component.** The historical `assessment_evaluate` idea depended on an LLM to judge mastery; such judgments can be lenient, inconsistent, and fooled by confident answers. Use structured yes/no rubric checks, require consistency across 2–3 varied checks, and run code or tests where possible—never ask an LLM to simulate execution. Keep learner self-assessment / human-in-the-loop review as a parallel signal and retain the evidence for later review.
2. **Practice generation can collapse to expert-thinking component (i).** Treat prior-exercise context (historically called `previousExercises`) as structural constraints such as targeted components, surface domain, and constraint type; use a surface-feature library and audit generated tasks against all ten components, not just wording changes.
3. **Spaced intervals are a starting hypothesis, not a CWSEI prescription.** A historical Ebbinghaus/Leitner cadence is **1 day, 3 days, 1 week, 2 weeks, 1 month**. Adapt it from review outcomes and learner preference; CWSEI supports spaced retrieval but does not specify these intervals.
4. **Discover prior knowledge through use.** Do not front-load a burdensome prior-knowledge interrogation. Use a small check or task, let gaps surface during work, and adjust from evidence.
5. **Keep goals machine-readable.** Alongside the learner-facing statement, preserve structured `verb`, `object`, `context`, and `criteria` fields so every learning subsystem reads the same contract.
6. **Bridge sessions with a summary.** At session end, capture what was attempted, what went well, struggles and misconceptions, unresolved feedback, and the next action. This is the multi-session bridge, not a separate shipped tracker or tool.
7. **Build the six-stack before optimization.** The build-no-matter-what core is the curriculum schema, deterministic goal linting, learner-state persistence, practice generation, structured feedback, and session-summary/handoff. Orchestration, sequencing, alignment auditing, and pattern detection are valuable optimizations around that core, not prerequisites for a viable learning loop.

---

## 8. Conversational Delivery Hides the Machinery

Underlying pedagogical machinery (goal graphs, Bloom's levels, expert-thinking components, and evidence tracking) operates behind the scenes. The learner experiences a focused conversation with a skilled tutor and a structured interactive workspace.

**Buddy product implications**

- Learner-facing chrome stays centered on **persona** (composer persona selector), **model Auto** (model placeholder `prompt.toolbar.placeholders.model`), conversation, and generated next moves — not on alignment, sequencing, or progress as top-level modes.
- Alignment, sequencing, and progress inform subagent and prompt behavior without becoming primary navigation.

---

## 9. Pedagogical Artifact Construction Rubrics

For granular, machine-checkable authoring rubrics ("How to make it" and "What not to do") covering clicker questions, worksheets, case studies, 2-stage exams, worked examples, concept inventories, and project rubrics, refer to the craft authority:

- [cwsei/artifacts.md](./cwsei/artifacts.md)

---

## How These Documents Relate

| Role | Document |
| --- | --- |
| Concise principles index + Buddy product implications | this file |
| Detailed pedagogical evidence and methods | `*.intent.md` in this folder |
| Artifact craft rubrics | [cwsei/artifacts.md](./cwsei/artifacts.md) |
| Directory map | [index.md](./index.md) |

---

## Primary Bibliography & Source Anchors

- Wieman, C. (2014). *Course Transformation Guide*. CWSEI & CU-SEI. [http://cwsei.ubc.ca/resources/files/Course_transformation_case_study.pdf](http://cwsei.ubc.ca/resources/files/Course_transformation_case_study.pdf)
- Wieman, C. *Creating Good Homework Problems (and Grading Them)*. CWSEI. [http://cwsei.ubc.ca/resources/instructor_guidance.htm#assess](http://cwsei.ubc.ca/resources/instructor_guidance.htm#assess)
- Simon, B., & Wolfman, S. *How to Develop Learning Goals for an Established Course: The Computer Science Model*. CWSEI. [http://cwsei.ubc.ca](http://cwsei.ubc.ca)
- Simon, B., & Perkins, K. (2010). *Creating and Using Effective Learning Goals*. Microbiology Australia, 31(1), 35-37. [http://microbiology.publish.csiro.au/?act=view_file&file_id=MA10035.pdf](http://microbiology.publish.csiro.au/?act=view_file&file_id=MA10035.pdf)
- Gibbs, G., & Simpson, C. (2004). *Conditions Under Which Assessment Supports Students' Learning*. Learning and Teaching in Higher Education, 1, 3-31. [http://resources.glos.ac.uk/shareddata/dms/2B70988BBCD42A03949CB4F3CB78A516.pdf](http://resources.glos.ac.uk/shareddata/dms/2B70988BBCD42A03949CB4F3CB78A516.pdf)
- Bjork, R. A. (1994). *Memory and Metamemory Considerations in the Training of Human Beings*. MIT Press. [http://bjorklab.psych.ucla.edu/pubs/RBjork_1994a.pdf](http://bjorklab.psych.ucla.edu/pubs/RBjork_1994a.pdf)
- National Research Council. (2000). *How People Learn: Brain, Mind, Experience, and School*. National Academies Press. [http://www.nap.edu/catalog/9853.html](http://www.nap.edu/catalog/9853.html)
- Bentley, C., & Foley, T. *Promoting Course Alignment: Developing a Systematic Approach to Question Development*. CWSEI.
