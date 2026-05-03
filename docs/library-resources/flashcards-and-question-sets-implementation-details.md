# Flashcards And Question Sets Implementation Details

Product direction summary:
`docs/flashcards-and-question-sets-production-survey.md`

## Scope

This document captures the detailed findings behind the product-direction
summary.

Research basis:

- Buddy docs, especially `docs/quiz.md`,
  `docs/quiz/perseus-data-model.md`,
  `docs/guides/flashcard-subagent-backend-flow.md`, ppand
  `docs/product/flashcard/flashcard-feature.md`
- Buddy backend and web implementation under
  `packages/buddy/src/learning/capabilities/{flashcard,question-set}` and
  the corresponding `packages/web` surfaces
- sampled Anki source under `~/Code/anki`
- sampled Perseus source under `~/Code/perseus`

## Perseus Clarification

The main framing correction is this:

- Buddy question sets are primarily modeled after Perseus at the question
  structure and saved-data level
- Buddy is not currently modeled after the full Perseus rendering runtime,
  article runtime, or widget surface

That is consistent with Buddy's own docs, especially
`docs/quiz/perseus-data-model.md`.

The practical implication is:

- the right comparison for Buddy today is mostly against Perseus's data
  modeling, validation, scoring separation, and authoring discipline
- the wrong comparison is expecting Buddy to already behave like a full
  Perseus renderer or editor stack

## Confirmed Buddy State

### Flashcards Today

Buddy already ships a meaningful flashcard core.

Implemented capabilities:

- AI authoring via `flashcard-author` and `save_flashcard_deck`
- persisted `flashcard-deck.v1` artifacts under
  `.buddy/flashcard-decks/<deckID>/deck.json`
- basic and cloze note support
- SM-2-like scheduling with `new`, `learning`, `review`, and
  `relearning`
- due-count computation and next-card selection
- review submission with append-only daily JSONL review logs
- HTTP routes for list, read, next-card, and submit-review
- workspace, library, and task-card review surfaces in the web app

Key references:

- `packages/buddy/src/learning/capabilities/flashcard/types.ts`
- `packages/buddy/src/learning/capabilities/flashcard/save-deck.ts`
- `packages/buddy/src/learning/capabilities/flashcard/scheduler.ts`
- `packages/buddy/src/learning/capabilities/flashcard/review.ts`
- `packages/buddy/src/learning/capabilities/flashcard/read-deck.ts`
- `packages/buddy/src/routes/flashcard-decks.ts`
- `packages/web/src/components/layout/workspace-flashcard-panel.tsx`
- `packages/web/src/components/flashcard/flashcard-review-dialog.tsx`
- `packages/web/src/components/chat/tools/render/task/`
  `flashcard-author-task-card.tsx`

Important runtime note:

- `docs/product/flashcard/flashcard-feature.md` still describes a two-tool
  pattern with `render_flashcard_deck`
- the current flashcard tool group I verified only registers
  `save_flashcard_deck` in
  `packages/buddy/src/learning/capabilities/flashcard/tools/tools.ts`
- the actual learner-facing path today is task-card projection plus the
  workspace and library UI

### Question Sets Today

Buddy already ships a strong MCQ-only question-set core.

Implemented capabilities:

- AI authoring via `question-set-author` and `save_question_set`
- persisted answerful `question-set.v1` artifacts and append-only
  `question-set-attempt.v1` attempt records
- public answerless projection for the client
- deterministic backend grading from saved answerful artifacts
- retryable attempts
- learner-memory writes on attempt submission
- sidebar and dialog-based learner UI for taking and reviewing sets

Key references:

- `packages/buddy/src/learning/capabilities/question-set/types.ts`
- `packages/buddy/src/learning/capabilities/question-set/save-artifact.ts`
- `packages/buddy/src/learning/capabilities/question-set/submit-attempt.ts`
- `packages/buddy/src/routes/question-set-artifacts.ts`
- `packages/web/src/components/chat/tools/render/question-set/`
  `question-set-inline-view.tsx`
- `packages/web/src/components/chat/tools/render/question-set/`
  `saved-question-set-tool.tsx`
- `packages/web/src/components/layout/workspace-question-set-panel.tsx`
- `packages/web/src/components/chat/tools/render/task/`
  `question-set-author-task-card.tsx`

Important runtime notes:

- `docs/quiz.md` still describes `render_saved_question_set(artifactID)` as
  the main parent-session render flow
- the web app still has a `render_saved_question_set` renderer
- the current backend question-set tool group I verified only registers
  `save_question_set` in
  `packages/buddy/src/learning/capabilities/question-set/tools/tools.ts`
- the current `question-set-author` prompt says saved sets are surfaced
  automatically from persisted state, which matches the task-card and
  sidebar flow better than the older doc does

Relevant prompt:

- `packages/buddy/src/learning/question-set-author/prompt.p.md`

## Cross-Cutting Findings

### Contract Drift

Confirmed examples:

- flashcard docs still describe `render_flashcard_deck`, but the current
  backend flashcard tool registration only includes `save_flashcard_deck`
- question-set docs still describe `render_saved_question_set` as the
  primary contract, but the current backend question-set tool registration
  only includes `save_question_set`

Why it matters:

- the supported architecture is less clear than it should be
- persisted-session and tool-render behavior are harder to reason about
- future work can accidentally target stale contracts

### Artifact Lifecycle Tooling Is Thin

Both systems are good at generation and initial consumption, but weak at
management after creation.

Missing classes of capability:

- editing
- repair
- duplication handling
- archival or delete workflows
- search and filtering
- historical browsing of attempts or reviews

### Persistence Is Functional But Not Hardened

Current persistence is simple file I/O.

That fits Buddy's single-user model, but it still leaves work around:

- atomic writes
- concurrent windows or sessions
- crash safety
- repair or corruption handling

### Observability Is Thin

Buddy stores useful learning data, but exposes relatively little of it back
to the learner.

Examples:

- flashcard review logs exist, but there is no strong review-history or
  deck-health surface
- question-set attempts exist, but there is no strong attempt-history
  surface

## Flashcards Missing Pieces

### Content Management Surface

Buddy can generate and review decks, but it does not yet have an Anki-like
browser or editor surface for:

- searching cards and notes
- editing bad cards
- deleting or archiving bad cards
- tagging and filtering
- spotting duplicates
- inspecting deck contents before review

Why this matters:

- generated decks are never perfect
- the biggest flashcard quality gap is post-generation control

Relevant external references:

- `~/Code/anki/qt/aqt/browser/browser.py`
- `~/Code/anki/rslib/src/storage/schema11.sql`

### Review Recovery And Safety

Current Buddy flashcard review mutates deck state and appends review logs,
but there is no first-class surface for:

- undo last review
- suspend or bury
- forget or reset scheduling
- set due date
- inspect card-level review history

Why this matters:

- a production review loop cannot feel one-way and fragile

### Deck Health, Analytics, And Leech Workflows

Buddy has due counts and leech detection, but it does not yet turn those
into a deck-health product.

Still missing:

- due backlog views
- recent review counts
- lapse and leech summaries
- retention-oriented indicators
- drill-down into chronically bad cards

### Learner-Model Integration

Question sets already write learner-memory summaries on attempt submission.

I did not find analogous learner-model writes in the flashcard review flow.

Relevant comparison:

- question sets:
  `packages/buddy/src/learning/capabilities/question-set/submit-attempt.ts`
- flashcards:
  `packages/buddy/src/learning/capabilities/flashcard/review.ts`

### Scheduler Hardening And Test Depth

The scheduler is real and reasonably substantial, but it is still
under-hardened compared with what a production spaced-repetition product
needs.

Notable concerns:

- limited direct lifecycle tests for rating transitions across all states
- limited testing for leech progression and daily-limit behavior
- interval fuzzing currently uses `Math.random()`, which makes
  deterministic replay and exact test coverage harder

Relevant reference:

- `packages/buddy/src/learning/capabilities/flashcard/scheduler.ts`

### Import, Export, And Interop

Buddy is currently a closed island for flashcards.

Still missing:

- CSV import or export
- Anki-oriented interoperability
- media packaging
- stronger backup and restore workflows

Relevant external reference:

- `~/Code/anki/rslib/src/import_export/`

### Controlled Study Modes

Buddy currently offers the default queue, but not stronger study operations
like:

- filtered or custom study
- leech-only review
- cross-notebook review
- tag or source-based review subsets

### Richer Card Types

Buddy currently supports basic and cloze only.

Still missing:

- image occlusion
- reversed or multi-template behavior
- richer media-heavy cards
- more advanced scheduling like FSRS

## Flashcards Priority Order

1. Build a browser and editor.
   Why: this is the biggest gap between a compelling demo and a usable
   flashcard product.
2. Add review recovery.
   Why: the current review loop is too irreversible for production trust.
3. Add deck health and review history.
   Why: Buddy already stores useful review data; surfacing it is high
   leverage.
4. Harden scheduler correctness and persistence.
   Why: correctness and durability should be solid before advanced
   scheduler work.
5. Feed outcomes into the learner model.
6. Add import and export.
7. Add controlled study modes.
8. Add richer card types and scheduling breadth.

## Question Sets Missing Pieces

### Authoring, Editing, And Validation Workflow

Buddy can generate and take question sets, but it does not yet have a
strong production authoring workflow for them.

Still missing:

- manual editing
- preview before publish
- linting and validation feedback
- repair of weak or malformed questions
- clone, archive, and republish flows

Why this matters:

- the current question structure is good, but one-shot AI generation is not
  enough for production content quality

Relevant Buddy and Perseus references:

- `docs/quiz/perseus-data-model.md`
- `~/Code/perseus/packages/perseus-editor/src/item-editor.tsx`

### Runtime Contract Cleanup

The question-set runtime works, but the architectural story is blurred.

Current confirmed state:

- docs still describe a backend `render_saved_question_set` tool as the
  main learner-facing handoff
- the web app still supports that renderer
- the backend question-set tool registration I verified only includes
  `save_question_set`
- the current shipped learner flow is largely task-card projection plus
  persisted-artifact reads and sidebar opening

Why this matters:

- the product contract is harder to explain and maintain than it should be

### Attempt History Is Persisted But Not Productized

Buddy saves attempts and grades them deterministically, but there is no
strong attempt-history surface.

Still missing:

- attempt list
- per-question history over time
- retry history
- weak-concept summaries
- comparison across attempts

### Current MCQ Validation And Accessibility

Buddy's MCQ flow is good for a v1, but it still lacks some of the
production discipline Perseus treats as normal.

Still missing or weak:

- richer client-side validation before submit
- clearer incomplete-state handling
- stronger keyboard and screen-reader semantics
- more systematic accessibility checks
- stronger authoring-time validation for malformed content

Relevant external references:

- `~/Code/perseus/packages/perseus-core/src/validation.types.ts`
- `~/Code/perseus/packages/perseus-score/src/widgets/widget-registry.ts`

### Rich Content Support

Buddy's current question sets are structurally sound, but still
conceptually simple.

Still missing:

- richer markdown and math expectations
- image-heavy prompts and choices
- media support
- content blocks beyond plain prompt plus choices

### Interaction Architecture For Growth

Buddy's current MCQ wrapper is a good v1, but it does not yet have the
infrastructure needed to scale cleanly into a broader assessment system.

Still missing:

- interaction registries
- versioned migrations
- explicit validation-data vs rubric-data splits per interaction
- stable parser and upgrade story for stored content

This is where Perseus is still a useful reference, but mainly for
structure and validation or scoring separation rather than for full
rendering parity.

### Question-Set Management Surfaces

Buddy has list and open behavior, but not a strong management surface for:

- search and filtering
- duplication and revision
- archive and delete
- content QA workflows
- library-level organization

### Workspace Panel Cleanup

The question-set sidebar and inline view are stronger than the workspace
panel implementation.

Observed implementation debt:

- `artifactStub: any`
- direct `console.error` handling
- unused state and props in
  `packages/web/src/components/layout/workspace-question-set-panel.tsx`

## Question Sets Priority Order

1. Build MCQ authoring, editing, and validation.
   Why: this is the biggest production gap around the current question
   structure.
2. Resolve runtime contract drift.
   Why: this reduces architectural confusion before more features pile on.
3. Add attempt history and review surfaces.
   Why: the hard data already exists; the product surface does not.
4. Harden current MCQ validation and accessibility.
5. Add richer content on top of the current MCQ model.
6. Build the interaction registry layer.
7. Add one high-leverage non-MCQ interaction family.
8. Add richer grouping and inline check patterns.

## Borrow And Avoid

### Borrow From Anki

- browser and editor as a core surface
- reversible review operations
- strong review history and deck-health tooling
- import and export as real infrastructure

### Borrow From Perseus

- discipline around question structure
- answerless vs validation vs rubric separation
- scorer and validator registries
- authoring-time linting and accessibility checks

### Avoid For Now

- copying Anki's full profile, sync, plugin, and template complexity before
  Buddy needs it
- copying full Perseus rendering parity before Buddy has stronger
  authoring, lifecycle, and interaction architecture

## Synthesis

The high-level result of this survey is:

- question sets are closer to production for their current scope
- flashcards need stronger operational depth before broader expansion
- both systems should prioritize lifecycle, validation, history, and trust
  over breadth

The main refinement is the Perseus framing:

- Buddy question sets should keep borrowing from Perseus mainly at the
  structure, validation, and scoring-architecture level
- they should not be judged as incomplete merely because they do not yet
  replicate the full Perseus rendering system
