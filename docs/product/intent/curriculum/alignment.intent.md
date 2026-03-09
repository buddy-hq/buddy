# Alignment — Intent

Sub-intent of [curriculum system](./curriculum.intent.md). Alignment ensures goals ↔ practice ↔ assessment are coherent. Without it, learners feel they're doing "busy work."

## Source anchors

Primary sources for this intent:

- [docs/sources/curriculum/principles.md](/Users/prashantbhudwal/Code/buddy/docs/sources/curriculum/principles.md)
- `docs/sources/curriculum/raw/coursetransformationguide-cwsei-cu-sei.txt`
- `docs/sources/curriculum/raw/creating-and-using-effective-learning-goals.txt`
- `docs/sources/curriculum/raw/creating-good-homework-problems-and-grading-them.txt`

---

## What CWSEI says about alignment

From "Promoting Course Alignment" (Bentley & Foley):

> "When students cannot easily determine the connection between assessments in a course, they often complain that such assignments are 'busy work' and 'do not help in preparing for the upcoming exam.'"

The fix: **every element of a course must be aligned with a set of well-defined learning goals.**

From the Course Transformation Guide:

> "Faculty use learning goals as they plan class time, develop homework, and create exams. All aspects of the course become better aligned, and focus on what faculty most want students to achieve."

---

## Suites of questions (CWSEI's alignment mechanism)

This is the concrete technique CWSEI recommends. One learning goal → multiple assessment items across different settings:

### Steps for developing suites

1. **Choose a learning goal** to assess
2. **Determine settings** where you'll assess (practice, exercise, quiz, project)
3. **Develop an initial question** — application/prediction type works best for creating variants
4. **Identify changeable variables** — what surface features can vary while the same concept is tested?
5. **Create at least one variant per setting** — e.g., one exercise, one quiz, one project task for the same goal

### Example from CWSEI (cell biology)

**Goal:** Predict whether a molecule will move across a cell membrane and by what mechanism.

- **Homework:** Given a membrane diagram with ion X+ concentrations, determine gradient direction
- **Clicker:** Same scenario, different question about the same gradient
- **Exam:** Different ion, different voltage, same underlying concept — predict gradient forces

**Same concept, varied surface features.** The learner can't pattern-match — they have to actually understand.

### For Buddy (software example)

**Goal:** After this topic, you'll be able to implement error handling that distinguishes user errors from system errors.

- **Guided exercise:** Given a function, add error handling using the project's error type system
- **Quiz:** "Here's code with a bug in error handling — what happens when the network is down?"
- **Open challenge:** "Refactor this API endpoint to return structured error responses instead of string messages"
- **Code review:** "Here's a PR with error handling — identify what's missing"

All test the same goal. Different surface, different setting, increasing difficulty.

---

## Alignment map

Every learning goal should have:

| Goal | Practice task(s)             | Assessment item(s)     | Cognitive level |
| ---- | ---------------------------- | ---------------------- | --------------- |
| ...  | What exercises practice this | How mastery is checked | Bloom's level   |

If a goal has no practice → it's aspirational, not taught.
If a goal has no assessment → it's assumed, not verified.
If practice exists without a goal → it's busy work.

---

## Benefits of alignment (CWSEI observations)

- **Writing exam questions becomes easier** when aligned to explicit goals
- **Cognitive level of assessments increases** as faculty align to higher-level goals
- **Student complaints about "busy work" disappear** when connections are visible
- **Departmental gaps are discovered** — some concepts taught in multiple courses identically, others never

---

## How alignment works in Buddy

- The **goal-writer** produces goals with cognitive levels
- The **practice agent** must generate exercises mapped to specific goals
- The **assessment** must check mastery of specific goals
- **Progress tracking** records per-goal status
- The **learner** should be able to see why they're doing what they're doing

The alignment map is the connective tissue. Without it, each agent operates in isolation and the curriculum fragments.

---

## Open questions

1. **Where does the alignment map live?** In the learner store, generated dynamically, or both?
2. **Who maintains it?** The goal-writer creates goals and the practice agent creates exercises — who ensures they're actually aligned?
3. **Is alignment visible to the learner?** Should Buddy say "this exercise targets goal #3" or is that too meta?
4. **How do we handle gaps?** If a goal has no exercises, does the system flag it? Auto-generate?
