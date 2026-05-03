# Flashcards And Question Sets Product Direction

Implementation details live in
`docs/flashcards-and-question-sets-implementation-details.md`.

## Bottom Line

- Both systems are good starts, but neither is fully production ready.
- Question sets are closer to production for their current MCQ scope.
- Flashcards need more operational depth before they need more breadth.
- Both systems should go depth-first before breadth-first.

## Clarification On Perseus

For question sets, Buddy is mainly modeled after Perseus at the question
structure and saved-data level.

Buddy is not currently trying to match the full Perseus rendering runtime.

That means the right near-term direction is:

- keep the strong Perseus-inspired question shape
- improve authoring, validation, history, and lifecycle around that shape
- avoid chasing full Perseus runtime parity right now

## Direction

Treat editing, repair, history, validation, and observability as core
product work, not polish.

- For flashcards, do not prioritize more card types yet.
- For question sets, do not prioritize many more interaction types yet.
- Harden the current loops before expanding breadth.

## Flashcards Direction

Current strengths:

- real deck model
- real scheduler and review loop
- real persistence and routes
- usable learner review UI

Current weaknesses:

- weak post-generation management
- weak recovery and history surfaces
- limited scheduler hardening and observability

Prioritized next steps:

1. Browser and editor for decks, notes, and cards.
   Why: this is the biggest gap between generated content and trustworthy
   study content.
2. Review recovery controls like undo, suspend, bury, and reset.
   Why: the review loop should not feel fragile or irreversible.
3. Deck health, review history, and leech or backlog surfaces.
   Why: users need visibility into whether a deck is healthy.
4. Scheduler correctness and persistence hardening.
   Why: scheduling bugs silently damage the learning product.
5. Import or export, study modes, and richer card types.
   Why: breadth matters, but only after the current workflow is reliable.

## Question Sets Direction

Current strengths:

- good saved question structure
- good public vs answerful split
- deterministic backend grading
- attempt persistence
- usable learner UI for the current MCQ scope

Current weaknesses:

- weak authoring and editing workflow
- weak attempt-history product surface
- doc and runtime contract drift
- limited lifecycle tooling around saved sets

Prioritized next steps:

1. Manual authoring, editing, and validation for the current MCQ model.
   Why: the current question structure is good, but one-shot generation is
   not enough for production content quality.
2. Runtime and doc contract cleanup around how saved question sets are
   surfaced.
   Why: the product contract should be clear before more features build on
   top of it.
3. Attempt history and learner-facing review or history surfaces.
   Why: Buddy already stores the data, but barely exposes it.
4. Accessibility and incomplete-state UX hardening.
   Why: the current MCQ path should feel excellent before expanding scope.
5. Richer content and then more interaction types.
   Why: breadth should come after authoring, lifecycle, and trust are solid.

## Sequencing

If only one system gets the next major push, prioritize question sets.

Why:

- they are closer to production for their current scope
- the next steps are more bounded
- better authoring and history will pay off immediately

If both move in parallel:

- question sets should focus on authoring, validation, history, and contract
  cleanup
- flashcards should focus on browser or editor, recovery, and scheduler
  hardening

## Not Yet

- do not chase full Perseus rendering parity
- do not chase a large widget catalog yet
- do not chase many new flashcard types yet
- do not expand breadth before fixing lifecycle and trust

## Reference

For the detailed survey, confirmed runtime or doc drift, and
implementation-oriented prioritization, see
`docs/flashcards-and-question-sets-implementation-details.md`.
