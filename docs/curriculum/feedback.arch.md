# Feedback — Architecture

> Historical reference: this file captures earlier architecture options explored before the learner-store and generated learning-plan cutover. Use the `*.intent.md` files in this folder for pedagogy and [buddy-core.spec.md](/Users/prashantbhudwal/Code/buddy/buddy-core.spec.md) for the shipped runtime/storage model.

Two architecture options. See [feedback.intent.md](./feedback.intent.md) for the full intent.

---

## Option A: Prompt-driven feedback (no dedicated tools)

**Philosophy:** Feedback is a companion behavior, not a system feature. The companion's prompt encodes CWSEI feedback principles. Every interaction is a feedback opportunity.

### Implementation

No new tools. Feedback quality comes from prompt engineering:

```
companion prompt additions:
├── Feedback principles (7 CWSEI criteria)
├── Scaffolding rules (more support early, fade later)
├── Feedback templates per situation
├── Anti-patterns to avoid
└── Acting-on-feedback requirement
```

### Feedback templates embedded in prompt

| Situation      | Template                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Correct answer | Note what's right + push to next level: "Your solution works. Can you explain why you chose X over Y?"                                           |
| Partial answer | Identify the working part + guide the gap: "Your error handling catches network errors but not validation errors. What other inputs could fail?" |
| Wrong answer   | Focus on thinking, not result: "Walk me through your reasoning. Where did you decide to use X?"                                                  |
| Stuck          | Reduce scope: "Let's break this down. What's the first thing this function needs to do?"                                                         |
| After exercise | Require reflection: "What was the hardest part? What would you do differently next time?"                                                        |

### Acting-on-feedback enforcement

The companion tracks whether it gave feedback and whether the learner acted on it:

1. Companion gives feedback → sets internal flag "feedback_pending"
2. Next learner action must relate to the feedback
3. If learner ignores feedback and moves on → companion redirects: "Before we continue, let's address the validation issue I mentioned"
4. Only after the learner demonstrates incorporation → move forward

### Scaffolding via curriculum context

The companion reads the learner's progress from the curriculum. Scaffolding level adjusts:

| Progress state     | Scaffolding level                                            |
| ------------------ | ------------------------------------------------------------ |
| Goal not started   | High: worked examples, step-by-step hints, provide structure |
| Goal in progress   | Medium: hints available on request, don't pre-solve          |
| Goal demonstrated  | Low: let learner struggle, feedback only after attempt       |
| Transfer exercises | None: learner identifies approach independently              |

### Pros

- Zero infrastructure. Feedback flows naturally in conversation.
- No mode switching — feedback is always on.
- Adapts organically to conversation context.

### Cons

- Quality depends entirely on prompt following.
- No structured record of what feedback was given and whether it was acted on.
- Hard to audit or improve systematically.
- Companion prompt gets increasingly large.

---

## Option B: Feedback engine with structured tracking

**Philosophy:** Feedback is too important to be implicit. A structured system tracks what feedback was given, whether it was acted on, and what patterns emerge in the learner's mistakes.

### Tools

| Tool                | Input                                    | Output                                | Side effects           |
| ------------------- | ---------------------------------------- | ------------------------------------- | ---------------------- |
| `feedback_log`      | `{ goalId, type, content, taskContext }` | `{ feedbackId: string }`              | Writes to feedback log |
| `feedback_check`    | `{ feedbackId }`                         | `{ actedOn: bool, evidence: string }` | None                   |
| `feedback_patterns` | `{ goalId? }`                            | `{ patterns: Pattern[] }`             | None (reads log)       |

### How it works

1. **Companion gives feedback** → calls `feedback_log` to record what was said and in what context
2. **Learner responds** → companion calls `feedback_check` to evaluate whether the feedback was incorporated
3. **Periodically** → companion calls `feedback_patterns` to identify recurring issues

### Feedback log entry

```typescript
{
  feedbackId: "fb-001",
  goalId: "tauri-ipc-1",
  timestamp: "...",
  type: "error_correction" | "scaffolding" | "extension" | "reflection_prompt",
  content: "Your function doesn't handle null inputs — see line 12",
  taskContext: "exercise-003",
  actedOn: null,  // updated by feedback_check
  actedOnEvidence: null
}
```

### Pattern detection

`feedback_patterns` analyzes the log to identify:

- **Recurring misconceptions** — same type of error across multiple goals
- **Feedback resistance** — feedback consistently not acted on (adjust approach)
- **Growth signals** — errors decreasing over time for a goal area
- **Scaffolding readiness** — consistently correct → ready to reduce support

These patterns feed into the companion's system prompt so it can adapt its feedback style.

### Reflection mechanisms (from CWSEI)

The feedback engine supports three CWSEI-proven mechanisms:

1. **Error explanation prompts** — after getting something wrong, learner must explain the error
2. **Reflection problems** — periodic "review your recent work and identify what to improve"
3. **Aligned follow-up** — next exercise targets the same goal, so feedback directly helps

### Pros

- Structured evidence of feedback quality and learner response.
- Pattern detection enables adaptive feedback style.
- Audit trail for debugging learning gaps.
- Explicit tracking of the "acting on feedback" requirement.

### Cons

- More infrastructure: log storage, pattern analysis.
- `feedback_log` adds latency to every feedback moment.
- Risk of over-instrumenting the conversation.
- Pattern detection logic is complex to get right.

---

## Shared elements

### CWSEI feedback criteria (both options enforce)

1. Timely (within the session, not days later)
2. Specific (addresses a concrete chunk, not vague)
3. Performance-focused (not person-focused)
4. Provides guidance for improvement
5. Matches the task's purpose
6. Requirements the learner to act on it
7. Notes strengths as well as weaknesses

### Anti-patterns (both options avoid)

- Feedback too late to matter
- Feedback too vague
- Only negative feedback
- Feedback given but not required to be used
- Overwhelming with too many issues at once
