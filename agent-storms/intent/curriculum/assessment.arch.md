# Assessment — Architecture

Two architecture options. See [assessment.intent.md](./assessment.intent.md) for the full intent.

---

## Option A: Embedded assessment (no separate agent)

**Philosophy:** Assessment isn't a separate mode — it's woven into the companion's conversation. The companion continuously collects evidence of mastery through natural interaction.

### No dedicated tools

Assessment happens through:

1. **Exercise outcomes** — did the learner complete the practice task? How? What did they struggle with?
2. **Conversational probes** — "Can you explain why you chose that approach?" / "What would happen if the input were null?"
3. **Code review moments** — learner writes code → companion evaluates against the goal's criteria
4. **Self-check prompts** — "Before I review this, does your solution handle the edge case you identified earlier?"

### Evidence collection

The companion writes assessment evidence to the curriculum file using existing curriculum tools:

```typescript
// Evidence entry in curriculum
{
  goalId: "tauri-ipc-1",
  timestamp: "2026-03-03T12:00:00Z",
  type: "exercise_completion" | "explanation" | "code_review" | "self_check",
  outcome: "demonstrated" | "partial" | "not_demonstrated",
  notes: "Learner implemented IPC command correctly but didn't handle validation errors",
  sessionId: "..."
}
```

### When assessment happens

- **After every exercise** — automatic evidence collection from the practice task outcome
- **During conversation** — when the companion detects an opportunity to probe understanding
- **At session boundaries** — brief "what did you learn today?" reflection prompt
- **Periodically** — spaced retrieval: revisit previously-demonstrated goals with a quick check

### Pros

- Zero friction — learner never enters "test mode"
- Natural and conversational
- Continuous evidence stream, not point-in-time snapshots
- Simple — no new agent or tools needed

### Cons

- Companion is already complex — adding assessment awareness increases prompt burden
- Evidence quality depends on companion's judgment
- No standardized assessment format — harder to compare across time
- Subjective: companion might be too generous or too strict

---

## Option B: Dedicated assessment agent with structured checks

**Philosophy:** Assessment is too important to leave to conversational inference. A specialized agent generates structured mastery checks aligned to goals, using CWSEI's "suites of questions" approach.

### Tools

| Tool                  | Input                                       | Output                         | Side effects         |
| --------------------- | ------------------------------------------- | ------------------------------ | -------------------- |
| `assessment_generate` | `{ goalIds: string[], format, difficulty }` | `{ check: MasteryCheck }`      | None                 |
| `assessment_evaluate` | `{ check: MasteryCheck, learnerResponse }`  | `{ result: AssessmentResult }` | None                 |
| `assessment_record`   | `{ result: AssessmentResult }`              | `{ recorded: bool }`           | Writes to curriculum |

### MasteryCheck formats

Based on CWSEI assessment types:

| Format              | When to use                | Example                                                                            |
| ------------------- | -------------------------- | ---------------------------------------------------------------------------------- |
| `concept_check`     | Quick probe during session | "What's the difference between invoke and emit in Tauri IPC?"                      |
| `predict_outcome`   | Application-level check    | "Given this permission config, what happens when the frontend calls this command?" |
| `debug_task`        | Analysis-level check       | "This IPC handler has a bug. Find and fix it."                                     |
| `build_task`        | Synthesis-level check      | "Build an IPC command that validates input and returns structured errors."         |
| `review_task`       | Evaluation-level check     | "Here's two IPC implementations. Which is better and why?"                         |
| `explain_reasoning` | Metacognitive check        | "Walk me through how you'd decide whether to use invoke vs emit."                  |

### Suites of questions implementation

For each goal, the assessment agent generates a **suite** — multiple checks with varied surface features:

```typescript
{
  goalId: "tauri-ipc-1",
  suite: [
    { format: "concept_check", surfaceVariant: "definition" },
    { format: "predict_outcome", surfaceVariant: "permission_error" },
    { format: "build_task", surfaceVariant: "validation_handler" },
    { format: "review_task", surfaceVariant: "compare_approaches" }
  ]
}
```

The same goal is assessed through different lenses. Passing one doesn't mean mastery — consistent performance across the suite does.

### Invocation

The companion invokes the assessment agent when:

- A topic's practice exercises are complete
- The learner asks for a mastery check
- Spaced retrieval is triggered (time since last assessment)
- The learner is about to move to a dependent goal

### Pros

- Structured, consistent assessment quality
- Suites of questions prevent false mastery signals
- Clear evidence trail with standardized format
- Assessment can get progressively harder within a suite

### Cons

- Feels more formal — might break conversational flow
- Another agent to build and maintain
- Risk of over-assessing — learner fatigue
- Generating good varied checks is hard

---

## Shared elements

### Assessment result schema

```typescript
const AssessmentResultSchema = z.object({
  goalId: z.string(),
  timestamp: z.string(),
  format: z.enum(["concept_check", "predict_outcome", "debug_task", "build_task", "review_task", "explain_reasoning"]),
  outcome: z.enum(["demonstrated", "partial", "not_demonstrated"]),
  evidence: z.string(), // what the learner actually did/said
  feedbackGiven: z.string(), // what feedback was provided
  feedbackActedOn: z.boolean(), // did the learner incorporate the feedback?
})
```

### The attend-to-feedback loop

Both options must implement CWSEI's feedback requirement:

1. Assessment reveals a gap → feedback given
2. Learner must **do something** with the feedback (fix code, explain error, attempt a variation)
3. Only after the loop closes does the assessment move on
4. The `feedbackActedOn` field tracks this

### Connection to progress tracking

Assessment results feed directly into the progress tracker. The progress system reads assessment outcomes and updates per-goal status (not_started → in_progress → demonstrated → needs_review).
