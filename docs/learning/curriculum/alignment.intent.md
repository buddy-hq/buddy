# Alignment — Intent

Status: Detailed pedagogical evidence for alignment, including worked examples. Concise index: [principles.md](./principles.md). Shipped specialists: `goal-writer`, `practice-agent`, `assessment-agent` (OpenCode subagents via Task / `@`, not default Tab agents).

Sub-intent of the curriculum system in [principles.md](./principles.md). Alignment ensures goals ↔ practice ↔ assessment are coherent. Without it, learners feel they're doing "busy work."

## Source anchors

Official sources (local `raw/` dumps were removed):

- [principles.md](./principles.md) bibliography: Bentley & Foley *Promoting Course Alignment*; Course Transformation Guide; Simon & Perkins (2010); homework guide.

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

- **goal-writer** produces goals with cognitive levels (`packages/buddy/src/learning/features/curriculum-planning/`)
- **practice-agent** generates exercises mapped to specific goal IDs (`packages/buddy/src/learning/features/practice/`)
- **assessment-agent** checks mastery of specific goals as an inline teaching move (`packages/buddy/src/learning/features/assessment/`)
- Learner-memory snapshot records evidence, open feedback, and constraints
- The learner-facing UI should still explain why the next task exists without turning alignment into a top-level mode

These are OpenCode subagents (Task / `@`), not default Tab session agents. See [packages/opencode-adapter/docs/dynamic-tools.md](../../../packages/opencode-adapter/docs/dynamic-tools.md).

## Historical: alignment auditor contract (superseded sketch)

The earlier one-agent design is retained as a dated contract sketch, not as a shipped runtime surface. The auditor reports structural gaps to the curriculum orchestrator; it does **not** talk to the learner, generate exercises or assessments, or fix content. Gaps are recommendations, not blockers.

It checks that every goal has practice and assessment coverage, every exercise and assessment references a valid goal, and assessment suites use varied formats. It also flags cognitive-level mismatch, such as an **Analysis** goal assessed only with `concept_check` recall/comprehension items.

### Historical actionable gap → recommendation mapping

When gaps are found, the auditor recommends specific structural actions to the curriculum orchestrator:

| Gap | Recommendation |
| --- | --- |
| Goal with no exercises | "Generate a practice exercise for [goal]. Start at scaffolded difficulty." |
| Goal with no assessment | "Create an assessment check for [goal]. Use [format] based on the cognitive level." |
| Incomplete suite | "Add a [format] assessment for [goal] — currently only tested via [existing formats]." |
| Orphaned exercise | "Exercise [id] references goal [id] which doesn't exist. Remove or reassign." |
| Level mismatch | "Goal [id] is Analysis-level but only assessed via recall. Add a debug_task or review_task." |

These are structural alignment checks, not subjective quality judgments about individual exercises. The auditor does not create content, talk to the learner, or block learning; gaps remain recommendations, not errors.

Suite completeness follows the original threshold:

| Assessment formats for a goal | Status |
| ---: | --- |
| 1 | Incomplete; only one format is represented |
| 2 | Minimum viable suite |
| 3+ | Strong coverage |

The proposed `alignment_audit` return shape was:

```ts
{
  status: "healthy" | "gaps_found" | "critical_gaps",
  goals: Array<{
    goalId: string,
    goalStatement: string,
    exerciseCount: number,
    assessmentCount: number,
    assessmentFormats: string[],
    coverageStatus: "full" | "partial" | "none",
    issues: string[],
  }>,
  orphans: {
    exercisesWithoutGoals: string[],
    assessmentsWithoutGoals: string[],
  },
  suiteStatus: Array<{
    goalId: string,
    formatsUsed: string[],
    formatsNeeded: string[],
    isSuiteComplete: boolean,
  }>,
  recommendations: string[],
}
```

The companion `alignment_map` sketch returned `{ map: string }` (a table, tree, or brief human-readable view), for orchestrator/debugging use rather than automatic learner-facing content.

## Historical: rejected first-class alignment map (Option A vs Option B)

The shipped direction is **Option A: implicit alignment via `goalIds`**. Practice and assessment artifacts carry goal references, and each workflow validates its own links; a health check can report gaps. This adds no new artifact or infrastructure, but it cannot enforce varied assessment suites, discovers gaps reactively, and gives the learner no explicit map.

**Option B** was a proposed first-class `AlignmentMapSchema` with `alignment_generate`, `alignment_audit`, and `alignment_commit` operations:

```ts
const AlignmentMapSchema = z.object({
  entries: z.array(z.object({
    goalId: z.string(),
    goalStatement: z.string(),
    cognitiveLevel: CognitiveLevelSchema,
    exercises: z.array(z.object({
      id: z.string(),
      format: z.string(),
      difficulty: z.string(),
      componentsTargeted: z.array(z.string()),
    })),
    assessments: z.array(z.object({
      id: z.string(),
      format: z.string(),
      surfaceVariant: z.string(),
    })),
    status: z.enum(["no_coverage", "partial", "full"]),
  })),
})
```

Option B would enforce two-or-more assessment formats and surface variants proactively, and could show the learner the big picture. It was rejected as a live architecture because it adds generation/storage/audit infrastructure, another artifact that can become stale beside goals and evidence, and complexity in every agent workflow. Keep this record to preserve the decision; do not treat these unshipped operations as current tools.

---

## Historical: open questions

Draft-time questions about where the alignment map lives, who maintains it, and learner-visible goal IDs are not a live spec. Shipped linkage is `goalIds` on practice/assessment artifacts plus the learner snapshot.
