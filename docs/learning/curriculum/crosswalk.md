# Curriculum Crosswalk

This crosswalk maps the converted source corpus into Buddy's intent docs, the core spec, active prompt contracts, and shipped runtime/product behavior.

## Goals

| Source principle | Intent docs | Core spec | Active prompt/runtime behavior |
| --- | --- | --- | --- |
| Goals should be phrased as what the learner will be able to do, using explicit action verbs and concrete tasks. | `agent-storms/intent/curriculum/curriculum.intent.md`, `agent-storms/intent/curriculum/goals.intent.md` | `buddy-core.spec.md` sections 3, 14, 20 | `packages/buddy/src/learning/goals/writer/goal-writer.p.md`, deterministic goal linting, `goal_commit`, `GoalRecord` schema |
| Topic-level goals should align to broader arcs and remain testable. | `goals.intent.md`, `alignment.intent.md` | sections 14, 16, 20 | learner store goal sets, alignment projection, session plan derived from active goals |

## Practice

| Source principle | Intent docs | Core spec | Active prompt/runtime behavior |
| --- | --- | --- | --- |
| Most learning happens in practice, not lecture. | `curriculum.intent.md`, `practice.intent.md` | sections 3, 8, 12, 20 | `practice` strategy defaulting after instruction in `runtime/router.ts`, practice-first session-plan rationale in `learner/sequencing.ts` |
| Practice should target expert-thinking components, not only routine procedures. | `practice.intent.md` | sections 3, 14, 20 | `PracticeTemplate`/`PracticeAttempt` store target components, `practice-agent.p.md`, `practice_record` |
| Good tasks need realistic context, constraints, deliverable, self-check, and a reason to care. | `practice.intent.md`, `curriculum.intent.md` | sections 14, 20 | `practice-agent.p.md`, `recordPractice()`, learning-plan rationale and motivation hook |

## Assessment

| Source principle | Intent docs | Core spec | Active prompt/runtime behavior |
| --- | --- | --- | --- |
| Assessment should focus on important goals and make evidence criteria explicit. | `assessment.intent.md`, `alignment.intent.md` | sections 14, 20 | `AssessmentRecord.evidenceCriteria`, `assessment-agent.p.md`, `assessment_record` |
| Assessment should generate evidence and follow-up actions, not just a score. | `assessment.intent.md`, `feedback.intent.md` | sections 3, 14, 19, 20 | `recordAssessment()`, generated feedback record, learning-plan required actions |
| The same goal should be checkable through varied formats over time. | `assessment.intent.md`, `alignment.intent.md` | sections 14, 16, 20 | alignment projection tracks `assessmentFormats` and `suiteComplete` |

## Feedback

| Source principle | Intent docs | Core spec | Active prompt/runtime behavior |
| --- | --- | --- | --- |
| Feedback must be timely, specific, and tied to performance. | `feedback.intent.md`, `curriculum.intent.md` | sections 3, 14, 20 | `learner/feedback.ts`, `FeedbackRecord`, practice/assessment feedback builders |
| Feedback is incomplete until the learner acts on it. | `feedback.intent.md`, `progress.intent.md` | sections 14, 16, 19, 20 | `FeedbackRecord.status`, `markFeedbackActedOn()`, safety sweep, open feedback actions in learning plan |

## Progress, adaptation, and sequencing

| Source principle | Intent docs | Core spec | Active prompt/runtime behavior |
| --- | --- | --- | --- |
| Build on prior thinking and surface misconceptions. | `curriculum.intent.md`, `progress.intent.md` | sections 3, 14, 17, 20 | `observeLearnerMessage()`, misconception records, prompt digest tier 1 |
| Adjust challenge to current mastery level. | `progress.intent.md`, `practice.intent.md` | sections 8, 12, 16, 20 | adaptive router, session-plan suggested scaffolding, progress confidence |
| Use spaced retrieval and revisit demonstrated goals. | `sequencing.intent.md`, `progress.intent.md` | sections 3, 16, 20 | review projection, `reviewCount`/`nextReviewAt`, warm-up review in session plan |
| Respect prerequisites, but avoid isolated chapter-style progression. | `sequencing.intent.md`, `alignment.intent.md` | sections 14, 16, 20 | `GoalEdge`, conservative edge derivation, prerequisite warnings, alternatives in `SessionPlan` |

## Constraints and motivation

| Source principle | Intent docs | Core spec | Active prompt/runtime behavior |
| --- | --- | --- | --- |
| Constraints and opportunities are real pedagogical inputs. | `curriculum.intent.md`, `progress.intent.md` | sections 7, 14, 15, 17 | learner constraints, workspace context overrides, `constraintsSummary` in digests and learning plan |
| Learners need a clear reason why the work matters. | `curriculum.intent.md`, `practice.intent.md` | sections 3, 16, 17 | `whyItMatters` on practice templates, `motivationHook` in session plans, visible in the right sidebar |

## Product and runtime contract

| Source principle | Intent docs | Core spec | Active prompt/runtime behavior |
| --- | --- | --- | --- |
| The learner experience should stay conversational even when the underlying system is rigorous. | `curriculum.intent.md` | sections 6, 25 | persona + strategy + Auto UI, generated learning plan, no top-level feedback/alignment modes |
| Curriculum is a system, not a markdown file. | `curriculum.intent.md` | sections 6, 15, 16, 24, 26 | learner store + projections, `curriculum_read` as read-only generated view, no authored `curriculum.md` path |
