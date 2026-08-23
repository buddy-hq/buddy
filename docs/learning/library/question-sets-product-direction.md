# Question Sets Product Direction

Implementation findings live in `docs/learning/library/question-sets-implementation-details.md`.

Buddy's question sets are closest to Perseus at the question-structure and saved-data layers, not at the full rendering-runtime layer. The current MCQ scope already has answerless client projection, deterministic backend grading, persisted attempts, and a usable learner UI.

The depth-first priorities are:

1. manual authoring, editing, preview, and validation;
2. one clear runtime contract for surfacing persisted sets;
3. learner-facing attempt history and review;
4. accessibility and incomplete-state hardening;
5. richer content, followed by additional interaction types;
6. a versioned interaction/validator/scorer registry when the model grows beyond MCQ.

Do not pursue full Perseus renderer parity or a large interaction catalog before authoring, lifecycle, validation, and history are trustworthy.
