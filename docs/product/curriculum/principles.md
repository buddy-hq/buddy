# Source-Backed Principles

These are the curriculum principles Buddy should actively implement. They are distilled from the CWSEI/CU-SEI source set in this folder, especially:

- `creating-and-using-effective-learning-goals.txt`
- `creating-good-homework-problems-and-grading-them.txt`
- `coursetransformationguide-cwsei-cu-sei.txt`
- `cwsei-teaching-practices-inventory.txt`
- `how-people-learn-implications-for-teac.txt`
- `how-to-develop-learning-goals-for-an-established-course-the-computer-science-model1.txt`

## 1. Goals drive everything

- Learning goals should be written as what the learner will be able to do, not what content will be covered.
- Good goals use a specific action verb plus a concrete task.
- Topic-level goals should roll up into a smaller course/topic arc rather than existing as disconnected checklists.
- If a goal cannot be tested, it is not a good operational goal for Buddy.

Buddy implication:

- goal setting must stay verb-driven, testable, and grounded in the learner's real project/context
- practice, assessment, and progress must all link back to goal IDs

## 2. Practice is where most learning happens

- The homework guide is explicit that most learning happens during prolonged practice, not explanation.
- Practice should exercise components of expert thinking, not only routine procedures.
- Good tasks do not provide all needed information, assumptions, or concept labels up front.
- Good tasks should pass the "Why should anyone care?" test.

Buddy implication:

- `practice` is the default next move after goals or framing
- practice tasks must include realistic context, constraints, deliverable, and self-check
- Buddy should prefer one substantial deliberate-practice task over long concept lecture drift

## 3. Feedback matters more than grading

- Feedback that supports learning is timely, specific, performance-focused, and action-oriented.
- Feedback is not complete until the learner has done something with it.
- Reflection, correction, and aligned future tasks are part of the feedback loop.

Buddy implication:

- feedback must be persisted as an open required action, not as disposable commentary
- later evidence should be able to mark feedback as acted on or resolved
- the learning plan should keep unresolved actions visible

## 4. Assessment exists to generate evidence

- What gets assessed dominates what learners think matters.
- Assessment should focus on important goals, not trivia.
- Criteria must be explicit.
- Multiple formats for the same goal are better than repeating one surface form.

Buddy implication:

- `assessment` is an inline mastery-check strategy, not a grading mode
- assessment records should capture evidence criteria and follow-up actions
- alignment should encourage varied assessment formats per goal

## 5. Build on prior thinking

- Teaching should connect to what learners already know and surface misconceptions early.
- Tasks should be calibrated to the learner's current level of expertise.
- Progress is not a final score; it is a memory of what has been demonstrated and what still needs work.

Buddy implication:

- learner memory must persist across workspaces and sessions
- prompt digests and session plans should include prior evidence, misconceptions, and open feedback
- adaptivity should use those signals instead of treating every session as fresh

## 6. Sequence for retention, not just coverage

- Isolated sequential coverage produces weak retrieval and poor transfer.
- Interleaving, cumulative work, and spaced retrieval improve durable learning.
- Worked examples and scaffolding should fade toward independence and transfer.

Buddy implication:

- session planning should include review when due
- demonstrated goals should reappear as spaced retrieval, not vanish forever
- sequencing should respect prerequisites but still build broader associations

## 7. Motivation and constraints are first-class

- Motivation, relevance, and a sense that mastery is achievable influence effort.
- Time, tools, environment, and background knowledge shape what is realistic.
- A course or learning path should reflect both opportunities and constraints.

Buddy implication:

- learner-level constraints belong in the learner store
- workspace-specific constraints/opportunities belong in `.buddy/context.json`
- session plans and practice tasks should explain why the next step matters now

## 8. Conversational delivery should hide the machinery

- The pedagogical system can be rigorous without forcing the learner through form filling.
- Good course design is visible in what happens, not in bureaucracy shown to the learner.

Buddy implication:

- the UI should stay centered on persona, strategy, Auto, and a generated learning plan
- alignment, sequencing, and progress should inform behavior without becoming top-level modes
