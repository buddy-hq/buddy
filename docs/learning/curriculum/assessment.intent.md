# Assessment — Intent

Status: Detailed pedagogical evidence for assessment. Concise index: [principles.md](./principles.md). Shipped owner: `assessment-agent` in `packages/buddy/src/learning/features/assessment/` (inline mastery check, not a gradebook).

Sub-intent of the curriculum system in [principles.md](./principles.md). Assessment's purpose is to generate feedback, not grades. It tells both the learner and Buddy what's been mastered and what hasn't.

## Source anchors

Official sources (local `raw/` dumps were removed):

- [principles.md](./principles.md) bibliography: Gibbs & Simpson (2004); Wieman Course Transformation Guide; homework guide.

---

## What CWSEI says about assessment

From "Assessments That Support Student Learning" (Gibbs & Simpson, summarized by CWSEI):

> "What is tested dominates what students think is important and what they do."

> "Effective feedback is the most powerful single element for achieving learning."

> "Students prefer courses with a significant marked assignment component, feeling that such courses provide more practice and feedback."

Key findings:

- **Exam scores correlate weakly with long-term retention.** Assignment scores are better predictors.
- **When assignments are a significant fraction of the course, failure rates are 1/3** of exam-only courses.
- **Students study in more naïve ways** when assessment is exam-only (cramming, memorizing).

### What makes assessment support learning (CWSEI factors)

1. **Tasks are focused on the most important goals** — tied to learning goals, not trivia
2. **Given frequently** — not just 2 midterms and a final
3. **Require extended effort** — not quick recall questions
4. **Engage appropriate forms of study** — require expert thinking, not memorization
5. **Criteria are explicit** — the learner knows what's being assessed and how
6. **Feedback is frequent, timely, specific** — and the learner must act on it

---

## Assessment formats (from CWSEI sources)

| Format                        | CWSEI guidance                                                                                              | Buddy equivalent                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Quizzes (in-class/online)** | Frequent, small, timely feedback. Part of pre-reading JIT approach.                                         | Quick concept checks before/during sessions          |
| **Problem sets**              | Challenging, require showing reasoning. Exercise expert thinking (a–j).                                     | Multi-step exercises in workspace                    |
| **Clicker questions**         | Challenging conceptual questions with plausible wrong answers → peer discussion → revote → expert follow-up | Interactive Q&A in chat: propose → discuss → resolve |
| **2-stage exams**             | Individual attempt → group attempt → instructor addresses widespread gaps                                   | Solo attempt → Buddy reviews → targeted follow-up    |
| **Projects**                  | Extended work with explicit rubrics. Positive and negative examples.                                        | Build-something challenges with clear criteria       |
| **Peer assessment**           | Student-to-student feedback with explicit guidelines                                                        | Learner self-assessment against rubric               |
| **Self-assessment**           | Reflection: "what did I get wrong and why?"                                                                 | Post-exercise reflection prompts                     |

---

## Desired Buddy check taxonomy (design guidance, not a live tool contract)

An earlier assessment-agent sketch named the following seven check types. Keep them as a content taxonomy for varied inline mastery checks; the shipped `assessment-agent` currently chooses one format for one inline check. These names do **not** expose an `assessment_generate`, `assessment_evaluate`, or `assessment_record` tool IDL.

| Check type | Evidence it seeks |
| --- | --- |
| `concept_check` | Recall or explain the key idea in the learner's own words. |
| `predict_outcome` | Predict what happens in a concrete scenario or code path. |
| `debug_task` | Find and fix a conceptual problem in code or a system. |
| `build_task` | Create an artifact that meets explicit criteria. |
| `review_task` | Compare approaches, evaluate trade-offs, and justify a choice. |
| `explain_reasoning` | Articulate the process and decision points used to solve a problem. |
| `transfer_task` | Apply the same underlying concept in a novel context. |

When a check is authored, retain a `surfaceVariant` that distinguishes it from prior checks for the same goal and a concrete `followUp` action. Its evidence rubric has three levels: `demonstrated` (the goal's observable performance is present), `partial` (some criteria are present but a specific gap remains), and `notDemonstrated` (the required performance is not yet shown). This is a desired content shape, not a claim that those fields or a dedicated assessment tool are currently shipped.

---

## Suites of questions (CWSEI's alignment mechanism)

Use the **canonical 5-step** Bentley & Foley method in [alignment.intent.md](./alignment.intent.md) and [principles.md](./principles.md) Section 4. Do not use a shortened 4-step list.

One learning goal → multiple assessment items across settings: choose the goal, determine settings, write an application/prediction seed, vary surface features, then place at least one variant in each setting.

> This prevents learners from feeling assessments are "busy work" — they see the connection between practice and testing.

For Buddy: a goal should have multiple ways to check mastery, with varied surface features so the learner cannot pattern-match.

---

## The attend-to-feedback problem

CWSEI is explicit: giving feedback is not enough. The learner must be _required to act on it_:

1. **Error explanation** — lose points → get some back by explaining what was wrong in your thinking
2. **Reflection problems** — "review your previous work, list what you got wrong, explain what to do differently"
3. **Alignment with future tasks** — future exercises test the same goals, so feedback on past work directly helps

---

## Adapting for Buddy

Buddy doesn't have grades. The stakes are intrinsic motivation. So assessment needs to:

- **Feel useful, not punitive** — "let's check if this clicked" not "quiz time"
- **Be woven into conversation** — not a separate product surface the learner switches into
- **Generate evidence** — observable demonstrations that can update the progress tracker
- **Drive adaptation** — assessment results should change what comes next

In product/runtime terms, Buddy exposes an inline mastery check via `assessment-agent`. That strategy should still feel like a teaching move inside the same conversation, not an exam handoff.

## Historical: open questions

Draft-time questions about timing, formality, and how evidence updates progress are not a live spec. Shipped path: assessment-agent produces evidence; learner memory records `evidence` / `open_loop`; question-set attempts ingest via deterministic memory events.
