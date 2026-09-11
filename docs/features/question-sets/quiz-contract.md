# Question-set quiz contract

Status: canonical decision supplement

This document preserves the durable product decisions recovered from the removed
question-set implementation plan. The current managed-object identity, storage,
and HTTP routes remain authoritative in the linked implementation record and
smoke guide. This file keeps only the decisions that must not disappear when
those implementation details change.

Related authorities:

- [Question Sets — Product Direction](./direction.md)
- [Perseus data model](./perseus-data-model.md)
- [Managed Objects Implementation Log](../bench-mode/managed-objects-implementation-log.md)
- [Buddy HTTP curl smoke](../../guides/buddy-http-curl-smoke.md)

## Durable product decisions

- V1 question sets are MCQ-first and support single-select and multi-select
  questions.
- When no group type is supplied, `groupType` defaults to exactly `"quiz"`.
- After submission, the learner receives a full review immediately: total score,
  per-question correctness, selected answers, correct answers, explanations,
  and the choice-level rationales available for that question.
- Each distinct learner submission creates one new append-only attempt record.
  A transport retry with the same idempotency key replays the existing result
  and must not create a duplicate attempt; a new submission/key creates a new
  attempt.
- Grading is deterministic backend work against the saved answerful payload.
  The rubric is derived from that payload, selected IDs are validated, choice
  counts and `none of the above` exclusivity are enforced when configured, and
  grading is never delegated to a model.
- Every submitted attempt, including `partial` and `stuck` attempts, produces
  exactly one summarized learner-memory record rather than copying the raw
  question-set payload. The summary includes the question set, goal IDs when
  present, score, weak concepts, completion status, and
  `surface: "question-set"`. The statuses are `completed`, `partial`, and
  `stuck`.
- A `practice` group uses `learner_practice_record`; an `assessment` group uses
  `learner_assessment_record`; an unspecified `quiz` uses the practice record
  by default.

The question-set object is immutable after authoring, while attempts and
learner-memory records are separate mutable/evidence streams. Public reads
must use an answerless projection before submission so `correct` flags and
hidden rationales do not reach the learner-facing client early.

## Parent/subagent handoff invariant

Buddy remains the learner-facing orchestrator. Before delegation it prepares a
narrow context bundle: the learner request, relevant recent turns, learner
highlights and goals when relevant, explicitly identified resources, and
question-set constraints such as count, difficulty, topic boundaries, and
`groupType`. The authoring subagent must not discover the whole notebook by
default.

`question-set-author` owns specialized authoring. It generates the complete
answerful MCQ payload for the group and saves it through `save_question_set`.
The parent receives only small persisted-object metadata (current managed-object
metadata includes `objectID`, title, and question count), then renders from the
saved object. The parent must not re-emit the full answerful payload merely to
display the question set. This preserves the separation between authoring,
learner-facing display, deterministic grading, and answerless public reads.

The earlier plan called the identity `artifactID` and described a separate
`render_saved_question_set` step. The managed-object cutover uses `objectID`,
`revisionID`, task metadata, and `/api/objects/question-set/:objectID/*`
routes instead. Those names are superseded implementation details; the
parent/subagent handoff and no-answer-leakage invariants above are the durable
contract.
