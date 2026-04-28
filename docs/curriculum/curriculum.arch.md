# Curriculum — Architecture (Orchestrating Agent)

> Historical reference: this file captures earlier architecture options explored before the learner-store and generated learning-plan cutover. Use the `*.intent.md` files in this folder for pedagogy and [buddy-core.spec.md](/Users/prashantbhudwal/Code/buddy/buddy-core.spec.md) for the shipped runtime/storage model.

The curriculum system is not one of its sub-components — it's the **orchestrator** that decides which sub-agent to invoke, when, and with what context. See [curriculum.intent.md](./curriculum.intent.md) for intent.

---

## The orchestration problem

The companion talks to the learner. But the companion shouldn't know how to write goals, generate exercises, run assessments, track progress, check alignment, and manage sequencing. That's seven distinct responsibilities. The companion becomes incoherent if you overload it.

The curriculum orchestrator sits between the companion and the sub-agents:

```
Learner ↔ Companion ↔ Curriculum Orchestrator ↔ Sub-agents
                                                  ├── Goal Agent
                                                  ├── Practice Agent
                                                  ├── Assessment Agent
                                                  ├── Feedback Engine
                                                  ├── Alignment Checker
                                                  ├── Progress Tracker
                                                  └── Sequencer
```

The companion handles conversation. The orchestrator handles curriculum logic.

---

## Option A: Router-style orchestrator (reactive)

**Philosophy:** The orchestrator is a thin router. The companion detects intent and sends it to the orchestrator. The orchestrator dispatches to the right sub-agent and returns the result.

### Single tool exposed to companion

```typescript
// The only curriculum tool the companion sees
curriculum_dispatch({
  action: "set_goals" | "generate_practice" | "assess" | "check_progress" | "get_next" | "audit_alignment",
  context: {
    /* varies by action */
  },
})
```

The companion doesn't need to know about `goal_lint`, `practice_validate`, `sequence_next`, etc. It calls one tool with an action label, and the orchestrator routes internally.

### Routing logic

```
companion calls curriculum_dispatch({ action, context })
    ↓
orchestrator reads current curriculum state
    ↓
switch (action):
  "set_goals"        → invoke goal agent (plan → lint → commit)
  "generate_practice" → invoke practice agent (generate → validate → present)
  "assess"           → invoke assessment agent (generate check → evaluate → record)
  "check_progress"   → read progress from curriculum, return summary
  "get_next"         → invoke sequencer (next step recommendation)
  "audit_alignment"  → run alignment checker (gap detection)
    ↓
sub-agent runs (possibly multi-step)
    ↓
orchestrator returns result to companion
    ↓
companion presents to learner conversationally
```

### When each action fires

| Trigger                                   | Action dispatched             |
| ----------------------------------------- | ----------------------------- |
| Learner says "I want to learn X"          | `set_goals`                   |
| Goals exist, learner is ready to practice | `generate_practice`           |
| Practice complete, need to verify         | `assess`                      |
| Start of session                          | `check_progress` + `get_next` |
| Periodically / after goal changes         | `audit_alignment`             |

### State management

The orchestrator reads/writes the **curriculum file** — the single source of truth:

```markdown
# Curriculum: Tauri Desktop Apps

## Goals

### Course-Level

1. Design and ship a Tauri desktop app... [Synthesis]

### Topic: IPC Commands

1. Implement a Tauri command with input validation [Application]
2. Configure permissions for IPC commands [Application]

## Progress

- tauri-ipc-1: demonstrated (high, last: Mar 1, review: Mar 8)
- tauri-ipc-2: in_progress (medium, misconception: confuses allow/deny)
- tauri-plugins-1: not_started

## Learning Path

### Phase 1: Foundations

- [x] tauri-basics-1
- [/] tauri-ipc-1
- [ ] tauri-ipc-2

### Phase 2: Advanced

- [ ] tauri-plugins-1
- [ ] tauri-security-1

## Review Schedule

- tauri-basics-1: next review Mar 8
```

Each sub-agent reads and writes its section. The orchestrator ensures they don't conflict.

### Companion prompt injection

At session start, the orchestrator generates a curriculum summary that's injected into the companion's system prompt:

```
## Curriculum State
You're working with a learner on Tauri desktop apps.
- 2 of 5 topic goals demonstrated, 1 in progress, 2 not started.
- Current focus: tauri-ipc-2 (permissions).
- Misconception: confuses allow/deny in permission config.
- Review due: tauri-basics-1 (basic project setup) — quick warm-up.
- Suggested session: warm-up review → tauri-ipc-2 main work.
```

The companion uses this to guide the conversation without needing curriculum tools.

### Pros

- Companion stays simple — one tool, one dispatch point
- Clean separation of concerns
- Each sub-agent is independently testable
- Curriculum file is human-readable and inspectable

### Cons

- Dispatch overhead — every curriculum action passes through the router
- Single-tool interface might not give the companion enough control
- Orchestrator becomes a bottleneck if sub-agents are slow
- Reactive: only fires when the companion asks — doesn't proactively detect needs

---

## Option B: Proactive curriculum agent (autonomous)

**Philosophy:** The curriculum agent is not just a router — it's an autonomous agent that monitors the learning state and proactively drives the curriculum forward. It can initiate actions without the companion asking.

### Two interfaces

**1. Companion-facing tools (synchronous)**

| Tool               | Input                 | Output                                        |
| ------------------ | --------------------- | --------------------------------------------- |
| `curriculum_state` | `{}`                  | Current progress, next steps, review schedule |
| `curriculum_act`   | `{ action, context }` | Result of the requested action                |

**2. Autonomous behaviors (background)**

The curriculum agent runs background processes:

| Behavior                | Trigger                     | Action                                                             |
| ----------------------- | --------------------------- | ------------------------------------------------------------------ |
| **Session planner**     | Session starts              | Read progress → plan session agenda → inject into companion prompt |
| **Progress summarizer** | Session ends                | Analyze transcript → update progress → schedule reviews            |
| **Alignment auditor**   | After goal/exercise changes | Check alignment map → flag gaps                                    |
| **Review scheduler**    | Periodically                | Check demonstrated goals → surface overdue reviews                 |
| **Adaptation engine**   | Progress changes            | Recompute sequencing → adjust difficulty recommendations           |

### Session lifecycle

```
Session Start
    ↓
Curriculum agent reads state, produces session plan
    ↓
Plan injected into companion's system prompt
    ↓
Companion teaches, using curriculum context
    ↓
During session: companion calls curriculum_act for specific needs
    (generate exercise, run assessment, record progress)
    ↓
Session End
    ↓
Curriculum agent runs progress summarizer
    ↓
Updates curriculum file
    ↓
Computes next session recommendations
```

### Proactive detection

The curriculum agent watches for patterns the companion might miss:

| Pattern                                 | Detection                 | Proactive action                                       |
| --------------------------------------- | ------------------------- | ------------------------------------------------------ |
| Goal without exercises                  | Alignment audit           | Generate exercises for uncovered goals                 |
| Demonstrated goal due for review        | Review scheduler          | Add warm-up to next session plan                       |
| Learner stuck on a goal for 3+ sessions | Progress analysis         | Suggest breaking goal down or revisiting prerequisites |
| New topic mentioned by learner          | Intent detection          | Propose new goals for the topic                        |
| Misconception recurring across goals    | Feedback pattern analysis | Surface targeted remediation                           |

### Internal architecture

```
┌──────────────────────────────────────────┐
│         Curriculum Orchestrator          │
│                                          │
│  ┌──────────┐  ┌──────────────────────┐  │
│  │ State    │  │ Session Planner      │  │
│  │ Manager  │  │ (start-of-session)   │  │
│  └──────────┘  └──────────────────────┘  │
│                                          │
│  ┌──────────┐  ┌──────────────────────┐  │
│  │ Router   │  │ Progress Summarizer  │  │
│  │ (sync)   │  │ (end-of-session)     │  │
│  └──────────┘  └──────────────────────┘  │
│                                          │
│  ┌──────────┐  ┌──────────────────────┐  │
│  │ Alignment│  │ Adaptation Engine    │  │
│  │ Auditor  │  │ (on progress change) │  │
│  └──────────┘  └──────────────────────┘  │
│                                          │
├──────────────────────────────────────────┤
│         Curriculum Data Layer            │
│  (curriculum file + structured storage)  │
└──────────────────────────────────────────┘
         ↕               ↕
    Goal Agent    Practice Agent    ...
```

### Sub-agent invocation

The orchestrator invokes sub-agents as **functions, not chat agents**. They don't have their own conversation — they receive structured input and return structured output:

```typescript
// Orchestrator calling goal agent
const goals = await goalAgent.run({
  learnerIntent: "learn Tauri",
  existingGoals: curriculum.goals,
  scope: "topic-level",
})

// Orchestrator calling practice agent
const exercise = await practiceAgent.run({
  goalId: "tauri-ipc-1",
  difficulty: "guided",
  targetComponents: ["a", "f", "g"],
  learnerContext: curriculum.progress["tauri-ipc-1"],
})
```

The companion never talks to sub-agents directly. Everything flows through the orchestrator.

### Pros

- Proactive: detects needs the companion would miss
- Session planning produces coherent learning journeys
- Batch progress summarization is thorough
- Sub-agents as functions = clean, testable, no conversation pollution

### Cons

- Most complex option — autonomous background processes
- Risk of over-engineering: the autonomous behaviors need careful tuning
- Background processes need a runtime (when does the summarizer run?)
- Harder to debug: proactive actions might surprise the learner

---

## Shared elements

### Curriculum data layer

Both options use the same persistence:

- **Curriculum file** (markdown) — human-readable, lives in the project, version-controlled
- **Structured overlay** (JSON/frontmatter) — machine-parseable goal statuses, progress entries, review schedules
- **CurriculumService** — existing service that reads/writes the file

### Companion integration

Both options inject curriculum state into the companion via `compose-system-prompt.ts`. The companion never needs to call curriculum tools just to know "where are we?"

### Build order

Regardless of option:

1. **Goal agent** first — everything anchors to goals
2. **Progress tracking** second — without progress, goals are write-once
3. **Sequencing** third — without ordering, there's no path
4. **Practice generation** fourth — exercises aligned to goals
5. **Assessment** fifth — mastery verification
6. **Feedback** sixth — quality layer on top of assessment
7. **Alignment** last — auditing layer that ensures everything connects

The orchestrator grows incrementally. Start with goals + progress. Add sequencing. Then practice. Each addition is wired through the orchestrator.

### The V1 minimal orchestrator

Before building the full orchestrator, the minimum viable version:

```typescript
// V1: just goals + progress + session context
async function curriculumDispatch(action: string, context: any) {
  switch (action) {
    case "set_goals":
      return await goalAgent.run(context)
    case "check_progress":
      return await readProgress(context.curriculumPath)
    case "session_context":
      return await buildSessionContext(context.curriculumPath)
    default:
      return { error: "unknown action" }
  }
}
```

This is enough to start. Practice, assessment, sequencing, and alignment get added as they're built.
