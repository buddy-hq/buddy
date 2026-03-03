# Progress & Adaptation — Architecture

Two architecture options. See [progress.intent.md](./progress.intent.md) for the full intent.

---

## Option A: Session-end summarizer (batch processing)

**Philosophy:** Progress tracking is an asynchronous batch operation. After each session, a summarizer agent analyzes the transcript and updates the curriculum. The companion stays lightweight.

### Inspired by

The user's own brainstorm note:

> "OpenAI Codex has a memory system where it analyzes chats and creates memories periodically. I might need an agent that does something similar but for learner progress."

### Tools

| Tool                 | Input                                 | Output                          | Side effects         |
| -------------------- | ------------------------------------- | ------------------------------- | -------------------- |
| `progress_summarize` | `{ sessionTranscript, currentGoals }` | `{ updates: ProgressUpdate[] }` | None                 |
| `progress_commit`    | `{ updates: ProgressUpdate[] }`       | `{ committed: bool }`           | Writes to curriculum |

### How it works

1. Learner has a session with the companion
2. At session end (or periodically), the progress summarizer runs
3. It reads the transcript and the current goals
4. It extracts evidence of mastery demonstrations, struggles, misconceptions
5. Produces structured progress updates
6. Commits to the curriculum

### Progress update schema

```typescript
const ProgressUpdateSchema = z.object({
  goalId: z.string(),
  previousStatus: z.enum(["not_started", "in_progress", "demonstrated", "needs_review"]),
  newStatus: z.enum(["not_started", "in_progress", "demonstrated", "needs_review"]),
  evidence: z.string(), // what happened in the session
  confidence: z.enum(["low", "medium", "high"]),
  misconceptions: z.array(z.string()).optional(),
  nextAction: z.string().optional(), // suggested follow-up
})
```

### Spaced retrieval scheduling

The summarizer also maintains a retrieval schedule:

```typescript
{
  goalId: "tauri-ipc-1",
  status: "demonstrated",
  lastAssessed: "2026-03-01",
  nextReviewDue: "2026-03-08",  // 1 week spacing, increases over time
}
```

The companion reads this from the curriculum at session start and knows to revisit certain goals.

### Adaptation

The companion's system prompt includes the current progress state. It adapts by:

- Skipping mastered goals (no re-teaching)
- Revisiting "needs_review" goals
- Adjusting scaffolding based on per-goal status
- Surfacing spaced retrieval tasks when they're due

### Pros

- Companion stays light — no progress tools in its toolkit
- Batch processing is more thorough (sees the full session, not just one moment)
- Clean separation: companion teaches, summarizer tracks
- Natural fit with the TA memory system concept

### Cons

- Delay between session and progress update (learner might not see immediate update)
- Summarizer quality depends on transcript analysis
- Missed nuance — a batch summary can't capture in-the-moment subtlety
- Extra infrastructure: transcript storage, summarizer agent

---

## Option B: Real-time progress tracking (inline with companion)

**Philosophy:** Progress is updated in real-time as the companion interacts with the learner. Every significant interaction is an opportunity to update goal status.

### Tools (available to companion)

| Tool                       | Input                                      | Output                      | Side effects         |
| -------------------------- | ------------------------------------------ | --------------------------- | -------------------- |
| `progress_update`          | `{ goalId, status, evidence, confidence }` | `{ updated: bool }`         | Writes to curriculum |
| `progress_read`            | `{ goalId? }`                              | `{ goals: GoalProgress[] }` | None                 |
| `progress_schedule_review` | `{ goalId, daysUntilReview }`              | `{ scheduled: bool }`       | Writes schedule      |

### How it works

1. During conversation, companion detects evidence of mastery or struggle
2. Immediately calls `progress_update` with the evidence
3. Can read current progress with `progress_read` to adjust teaching
4. Schedules spaced reviews with `progress_schedule_review`

### Triggers for progress updates

| Trigger                                     | Action                                          |
| ------------------------------------------- | ----------------------------------------------- |
| Learner completes exercise successfully     | Update goal → "in_progress" or "demonstrated"   |
| Learner explains reasoning correctly        | Strengthen confidence on existing status        |
| Learner makes error revealing misconception | Record misconception, possibly downgrade status |
| Assessment check passed                     | Update → "demonstrated" with high confidence    |
| Time-based review succeeds                  | Extend review interval                          |
| Time-based review fails                     | Update → "needs_review"                         |

### Adaptation (real-time)

Because progress is live, the companion can adapt mid-session:

- "You've nailed basic IPC commands. Let's try something harder — configuring custom permissions."
- "I notice you keep mixing up invoke and emit. Let's step back and compare them."

### Pros

- Immediate feedback loop — progress updates as learning happens
- Companion has live awareness of mastery state
- No transcript processing delay
- Can adapt mid-session, not just between sessions

### Cons

- More tools in the companion's toolkit (complexity)
- Risk of noisy updates (every interaction triggers a tool call?)
- Companion needs to judge "is this evidence significant enough to record?"
- Could interrupt conversation flow with tool calls

---

## Shared elements

### Per-goal progress schema

```typescript
const GoalProgressSchema = z.object({
  goalId: z.string(),
  status: z.enum(["not_started", "in_progress", "demonstrated", "needs_review"]),
  confidence: z.enum(["low", "medium", "high"]),
  evidence: z.array(
    z.object({
      timestamp: z.string(),
      type: z.string(),
      description: z.string(),
    }),
  ),
  misconceptions: z.array(z.string()),
  lastAssessed: z.string().optional(),
  nextReviewDue: z.string().optional(),
})
```

### Spaced retrieval intervals

Both options use expanding intervals:

- First review: 1 day after demonstrated
- Second: 3 days
- Third: 1 week
- Fourth: 2 weeks
- Fifth+: 1 month

If a review fails → reset to shorter interval.

### Curriculum injection

Both options inject progress state into the companion's system prompt via `compose-system-prompt.ts`:

```
## Current Progress
- tauri-ipc-1: demonstrated (high confidence, next review: Mar 8)
- tauri-permissions-1: in_progress (medium confidence, misconception: confuses allow/deny)
- tauri-plugins-1: not_started
```
