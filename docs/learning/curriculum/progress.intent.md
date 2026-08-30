# Progress & Adaptation — Intent

Status: Detailed pedagogical evidence for progress. Concise index: [principles.md](./principles.md). Shipped owner: learner-memory runtime snapshot (`packages/buddy/src/learning/features/memory/runtime/snapshot.ts`), not a standalone progress-tracker agent or service named in older drafts.

Sub-intent of the curriculum system in [principles.md](./principles.md). Progress tracking records what has been demonstrated. Adaptation adjusts the path based on that evidence.

## Source anchors

Official sources (local `raw/` dumps were removed):

- [principles.md](./principles.md) bibliography: Course Transformation Guide; NRC *How People Learn*.

---

## What CWSEI says about tracking and adapting

### Building on prior thinking (Principle 1)

From the Course Transformation Guide:

> "Connect to and build on their prior knowledge, explicitly examine student preconceptions."

> "Probe understanding and adjust teaching as appropriate when find many are not getting it."

The companion must know what the learner already knows to:

- Avoid re-teaching mastered material
- Build on existing knowledge instead of starting from zero
- Detect and address misconceptions early

### Adjusting to mastery level (from expertise research)

> "Tasks must be sufficiently difficult to require intense effort by the learner if progress is to be made, and hence must be adjusted to the current state of expertise of the learner."

Too easy → no growth. Too hard → frustration. The curriculum must continuously calibrate.

### Early and frequent assessment (from self-directed learners section)

> "Periodic, timely assessments give students opportunity to get practice and feedback so that they can determine where their strengths and weaknesses lie — in time to make corrections."

Progress tracking is not a final exam. It's continuous evidence collection.

---

## What progress should track

### Per-goal status

Each learning goal should have a status:

| Status           | Meaning                                                                |
| ---------------- | ---------------------------------------------------------------------- |
| **Not started**  | Goal exists but no practice or assessment has targeted it              |
| **In progress**  | Learner has practiced but not yet demonstrated mastery                 |
| **Demonstrated** | Learner has shown they can do this (evidence recorded)                 |
| **Needs review** | Previously demonstrated but evidence of regression or time-based decay |

### Evidence log

Each status change should link to evidence:

- What task was attempted
- What the outcome was
- What feedback was given
- Whether the learner acted on the feedback

This is the "evidence over vibes" principle. Not "the learner said they get it" but "the learner did X, which demonstrates Y."

### Misconceptions / gaps

When assessment reveals a misconception or gap:

- Record what the misconception is
- Link to which goals it affects
- Flag for targeted follow-up in future sessions

---

## How adaptation works

### Within a session

- **Detect mastery quickly** — if the learner handles a concept easily, skip to harder material
- **Detect struggle** — if the learner is stuck, break down the problem, provide scaffolding
- **Adjust depth** — if the learner is breezing through Application-level tasks, try Analysis or Synthesis

### Across sessions

- **Resume where they left off** — the curriculum persists, so the next session picks up from the last progress point
- **Revisit gaps** — if a goal is "in progress" for a long time, bring it back
- **Spaced retrieval** — periodically re-test demonstrated goals to ensure retention
- **Expand scope** — as topic-level goals are demonstrated, surface course-level progress

### CWSEI's adaptation heuristics

From the Course Transformation Guide:

- **Two-stage review:** Start a session with a quick assessment of prior knowledge → group work on gaps → targeted follow-up on widespread difficulties
- **Just-in-time adjustments:** Pre-session quiz reveals difficulties → adapt session content to address them
- **Modify criteria as proficiency grows:** Early assessments are more forgiving; later ones expect integration and transfer

---

## Current Buddy direction (verified)

Progress tracking behaves like a memory system, not a chatty standalone agent.

- **Evidence-first writes** from goals, practice, assessment, question-set attempts, flashcard reviews, and session extraction (`packages/buddy/src/learning/features/memory/`).
- **Runtime snapshot** (`buildLearnerRuntimeSnapshot`) so personas see a digest: goals, `openFeedback`, misconceptions, evidence, constraints.
- **Prompt/context injection** in `packages/buddy/src/learning/prompt/runtime-context/learner-context/`.

**Historical:** drafts mentioned a separate "progress-tracker service" and periodic "safety sweeps" as named products. Those names are not current module owners. Consolidation and extraction exist; do not document a phantom service.

## Adapting for Buddy

| CWSEI concept                          | Buddy equivalent                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| Diagnostic test at start               | "Let's see where you are — try this quick challenge"                            |
| Review problems                        | Spaced retrieval: revisit previous goals with new surface features              |
| Mid-session adjustment                 | Buddy detects struggle → breaks problem into smaller pieces                     |
| Cumulative exams                       | Exercises that combine multiple goals in one task                               |
| Instructor listens to group discussion | Buddy reads learner's code, questions, and errors to detect understanding level |

---

## Historical: open questions

Draft-time questions about regression weights, dashboard visibility, sweep aggressiveness, and course-level synthesis claims are not a live spec.