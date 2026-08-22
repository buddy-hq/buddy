# Question Sets Implementation Findings

Product priorities live in `docs/learning/library/question-sets-product-direction.md`.

## Current strengths

Buddy ships a meaningful MCQ-only question-set core:

- AI authoring through `question-set-author` and `save_question_set`;
- persisted answerful question-set objects and append-only attempts;
- an answerless public projection for the web client;
- deterministic backend grading against saved answers;
- retryable attempts and learner-memory writes;
- sidebar, task-card, and learner review surfaces.

Buddy borrows most usefully from Perseus's separation of public question data, validation data, scoring, and authoring discipline. It is not intended to replicate the complete Perseus article/widget renderer today.

## Confirmed gaps

### Authoring and validation

One-shot AI generation is not enough for production content quality. Missing work includes manual editing, preview, linting, repair, cloning, archival, and stronger malformed-content feedback.

### Runtime contract clarity

Older descriptions treated `render_saved_question_set` as the primary handoff, while the current feature tool group centers `save_question_set` and persisted-object surfaces. Documentation and implementation should converge on one contract before more render paths are added.

### Attempt history

Attempts are stored but not productized into an attempt list, per-question history, retry comparison, or weak-concept summary.

### Accessibility and validation UX

The MCQ flow needs clearer incomplete states, stronger keyboard and screen-reader semantics, systematic accessibility tests, and richer client-side validation before submission.

### Rich content and extensibility

Future growth needs explicit boundaries between interaction data, validation data, and rubrics; versioned migrations; scorer/validator registration; and a stable stored-content upgrade story. Rich markdown, math, images, and media should precede a broad interaction catalog.

### Management surfaces

Search, filtering, duplication, revision, archive/delete, content QA, and library organization remain thin.

## Recommended order

1. Build MCQ authoring, editing, preview, and validation.
2. Resolve the saved-object/runtime contract.
3. Add attempt-history surfaces.
4. Harden validation and accessibility.
5. Add richer content within the MCQ model.
6. Introduce interaction, validator, and scorer registries.
7. Add one high-leverage non-MCQ interaction family.

Perseus remains the useful structural reference. Full rendering parity is intentionally out of scope.
