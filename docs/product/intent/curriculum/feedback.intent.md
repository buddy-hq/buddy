# Feedback — Intent

Sub-intent of [curriculum system](./curriculum.intent.md). CWSEI is emphatic: feedback is the single most important element for learning. Not content delivery. Not assessment. Feedback.

## Source anchors

Primary sources for this intent:

- [docs/sources/curriculum/principles.md](/Users/prashantbhudwal/Code/buddy/docs/sources/curriculum/principles.md)
- `docs/sources/curriculum/raw/coursetransformationguide-cwsei-cu-sei.txt`
- `docs/sources/curriculum/raw/cwsei-teaching-practices-inventory.txt`
- `docs/sources/curriculum/raw/creating-good-homework-problems-and-grading-them.txt`

---

## What CWSEI says about feedback

From the Course Transformation Guide:

> "Feedback that is timely and specific is critical for learning."

From "Assessments That Support Student Learning":

> "The single most important element of assessment supporting learning is the frequency and type of the feedback provided."

### Feedback that supports learning (CWSEI criteria)

1. **Frequent** — not delayed weeks until a graded assignment is returned
2. **Timely** — close enough to the task that it still matters
3. **Specific and detailed** — addresses small chunks, not vague "good job"
4. **Focused on performance, not person** — "your solution missed X" not "you're bad at Y"
5. **Provides guidance for improvement** — not just what's wrong, but how to fix it
6. **Matches the purpose of the task** — formative feedback for practice, summative for milestones
7. **Requires the learner to act on it** — mechanisms that force attention and incorporation

### The acting-on-feedback problem

CWSEI is explicit that giving feedback is not enough. Three proven mechanisms:

1. **Error explanation for credit** — explain what was wrong in your thinking → get partial credit back
2. **Reflection problems in every set** — "review your last work, list errors, explain what to do differently next time"
3. **Aligned future tasks** — make future exercises test the same goals so feedback directly helps

> "Teaching students to monitor their own performance should be the ultimate goal of feedback." — Gibbs & Simpson

---

## Types of feedback (from CWSEI sources)

| Source                             | Description                                                                                                | Buddy equivalent                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Instructor, whole-class**        | Common errors identified across many students, addressed to all                                            | Buddy identifies pattern in learner's mistakes, addresses the underlying misconception |
| **Instructor, targeted**           | Specific feedback on individual work                                                                       | Buddy reviews code/answer and gives specific guidance                                  |
| **Peer**                           | Student-to-student with guidelines. "Imperfect feedback almost immediately > perfect feedback weeks later" | N/A for solo learner (but self-review against rubric serves similar purpose)           |
| **Self-assessment**                | Learner evaluates own work using instructor-provided rubric                                                | Buddy provides criteria, learner self-checks, Buddy confirms or corrects               |
| **Real-time (clicker/discussion)** | Immediate response during activity                                                                         | In-conversation feedback during interactive sessions                                   |
| **Automated**                      | Computer-graded components for routine checks                                                              | Code execution results, test outcomes, linter output                                   |

---

## Feedback principles for Buddy

### Timeliness

- Feedback should come **during the session**, not after
- Code execution results give instant automated feedback
- Buddy's commentary should follow immediately after the learner attempts something

### Specificity

- Not "that's wrong" but "your function handles the happy path but doesn't account for null inputs — look at line 12"
- Focus on **the smallest chunk that addresses one thing**
- Address strengths as well as weaknesses — learners are often unaware of progress

### Requiring action

- After feedback, the learner should **do something with it**: fix the code, explain the error, attempt a variation
- Don't move on until the feedback loop closes
- Build feedback into the workflow: attempt → feedback → revision → confirmation

### Scaffolding

- Early: more support, break tasks down, provide hints before failure
- Later: less support, let the learner struggle, feedback after attempt
- The goal is to fade scaffolding as proficiency grows

---

## Anti-patterns (from CWSEI)

- ❌ Feedback too late to matter (days/weeks after the task)
- ❌ Feedback too vague ("needs improvement")
- ❌ Feedback focused on person ("you're not good at this")
- ❌ Feedback given but not required to be used
- ❌ Only negative feedback — must note what's working too
- ❌ Feedback on everything at once — pick the most important thing

---

## Open questions

1. **How does Buddy decide when to give feedback?** After every attempt? Only when errors are detected? Learner-triggered?
2. **How detailed?** Risk of overwhelming the learner vs. being too vague
3. **How does feedback connect to progress tracking?** Does receiving and acting on feedback update mastery status?
4. **Self-check prompts?** Should Buddy periodically ask "does this make sense? How would you check?" to build metacognition?
