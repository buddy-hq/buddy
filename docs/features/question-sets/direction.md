# Question Sets — Product Direction

## Shipped Foundation

Buddy ships an MCQ-first question-set engine:

- AI authoring via `question-set-author` and `save_question_set`.
- Persisted answerful question-set objects with append-only attempt logs.
- Answerless public projection for web clients preventing answer leakage.
- Deterministic backend grading against stored solutions.
- Resilient attempt recording and learner-memory reconciliation.
- Sidebar, task-card, and learner review surfaces.

Buddy aligns with Perseus at the data architecture level (strict separation of public presentation, validation data, scoring rules, and authoring discipline). Full Perseus article/widget rendering parity is explicitly out of scope. The layered item/renderer/widget model, container widgets, and answerful vs answerless split are documented in [perseus-data-model.md](./perseus-data-model.md).

The durable quiz defaults, attempt/review semantics, learner-memory summary,
and parent/subagent handoff invariant are preserved in [quiz-contract.md](./quiz-contract.md).

## Known management gap

The content engine is stronger than its library management surfaces. Search and filtering, cloning/duplication, revision history, archive/delete, content QA, and library organization remain thin and should be treated as explicit product work.

## Depth-First Priorities

1. **Authoring & Validation Tooling:** Manual editing, live preview, deterministic linting, cloning, and malformed-content diagnostics.
2. **Runtime Contract Convergence:** Unify saved-object surfaces and subagent handoffs onto a single persisted-object contract.
3. **Attempt History & Review:** Surface attempt logs, per-question history, retry comparisons, and identified concept weaknesses in the UI.
4. **Accessibility & State Hardening:** Improve incomplete-state validation, keyboard navigation, screen-reader semantics, and pre-submission checks.
5. **Rich Content Expansion:** Support rich markdown, LaTeX/math expressions, and diagrams within the core MCQ model before introducing new interaction types.
6. **Interaction Registry:** Implement versioned interaction, validator, and scorer registries when expanding into non-MCQ question formats.
7. **One high-leverage non-MCQ family:** Add a single useful non-MCQ interaction only after authoring, attempt history, accessibility, and the management/validation foundations above are in place.
