# Alignment — Architecture

Two architecture options. See [alignment.intent.md](./alignment.intent.md) for the full intent.

---

## Option A: Implicit alignment via goal IDs

**Philosophy:** Alignment is maintained by convention — every artifact (exercise, assessment, feedback) carries a `goalId` reference. No separate alignment system. The data is self-aligning.

### How it works

Every curriculum artifact links back to goals:

```
Goal (tauri-ipc-1)
  ↕ referenced by goalId
Exercise (ex-003, goalId: tauri-ipc-1)
  ↕ referenced by goalId
Assessment (assess-007, goalId: tauri-ipc-1)
  ↕ referenced by goalId
Feedback (fb-001, goalId: tauri-ipc-1)
  ↕ referenced by goalId
Progress (prog-tauri-ipc-1, goalId: tauri-ipc-1)
```

### Alignment checks (embedded in other agents)

Each agent validates alignment as part of its own workflow:

- **Practice agent:** When generating an exercise, checks that the `goalId` exists in the curriculum
- **Assessment agent:** When generating a check, verifies the goal is in-scope
- **Companion:** When presenting content, references the relevant goal so the learner sees the connection

### Gap detection

A simple utility function scans the curriculum and reports:

```typescript
function findAlignmentGaps(curriculum: Curriculum): AlignmentGap[] {
  // Goals with no exercises
  // Goals with no assessments
  // Exercises with no valid goal reference
  // Goals with exercises but no assessments (practice without verification)
}
```

This runs as a health check, not a continuous agent.

### Pros

- No new infrastructure — alignment is a property of the data model
- Simple: just enforce `goalId` on everything
- Gap detection is a utility, not a service

### Cons

- Alignment quality depends on each agent correctly referencing goals
- No enforcement of "suites of questions" — same goal might only be assessed one way
- No visibility into alignment for the learner
- Gaps discovered reactively, not prevented proactively

---

## Option B: Alignment map as first-class artifact

**Philosophy:** The alignment map is a structured document that explicitly connects goals ↔ practice ↔ assessment. It's generated after goals are set and updated as exercises and assessments are added.

### Tools

| Tool                 | Input                   | Output                                 | Side effects         |
| -------------------- | ----------------------- | -------------------------------------- | -------------------- |
| `alignment_generate` | `{ goalIds: string[] }` | `{ map: AlignmentMap }`                | None                 |
| `alignment_audit`    | `{ map: AlignmentMap }` | `{ gaps: Gap[], warnings: Warning[] }` | None                 |
| `alignment_commit`   | `{ map: AlignmentMap }` | `{ committed: bool }`                  | Writes to curriculum |

### Alignment map structure

```typescript
const AlignmentMapSchema = z.object({
  entries: z.array(
    z.object({
      goalId: z.string(),
      goalStatement: z.string(),
      cognitiveLevel: CognitiveLevelSchema,
      exercises: z.array(
        z.object({
          id: z.string(),
          format: z.string(),
          difficulty: z.string(),
          componentsTargeted: z.array(z.string()),
        }),
      ),
      assessments: z.array(
        z.object({
          id: z.string(),
          format: z.string(), // concept_check, build_task, etc
          surfaceVariant: z.string(), // how it differs from other assessments for same goal
        }),
      ),
      status: z.enum(["no_coverage", "partial", "full"]),
    }),
  ),
})
```

### Suites of questions enforcement

The alignment map enforces CWSEI's suites approach:

- Each goal should have assessments in **at least 2 different formats**
- Each assessment for the same goal should have **different surface features**
- `alignment_audit` flags goals with only one assessment format

### Workflow

1. Goal agent commits goals
2. `alignment_generate` creates initial map with goals but empty exercise/assessment columns
3. Practice agent generates exercises → references map to ensure coverage
4. Assessment agent generates checks → references map to build suites
5. `alignment_audit` runs periodically to flag gaps
6. Companion can show the learner their alignment map: "Here's what we've covered and what's next"

### Pros

- Explicit, auditable alignment
- Suites of questions are enforced structurally
- Gaps are detected proactively and flagged
- Learner can see the big picture

### Cons

- More infrastructure: map generation, storage, audit
- Another artifact to maintain alongside goals, exercises, assessments
- Risk of the map becoming stale if not updated
- Adds complexity to every agent's workflow

---

## Shared elements

### The "why should anyone care?" test

Both options should ensure exercises and assessments connect to real-world relevance. CWSEI is explicit:

> "A criteria for any homework problem should be that it can pass the 'Why should anyone care about the solution to the problem?' test."

### Learner-visible alignment

Regardless of architecture, the learner should understand _why_ they're doing each exercise:

- "This exercise targets your goal of implementing error handling"
- "This check verifies you can configure IPC permissions"
- Not meta-heavy, but briefly stated so the connection is clear
