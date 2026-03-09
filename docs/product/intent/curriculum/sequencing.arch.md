# Sequencing — Architecture

> Historical reference: this file captures earlier architecture options explored before the learner-store and generated learning-plan cutover. Use the `*.intent.md` files in this folder for pedagogy and [buddy-core.spec.md](/Users/prashantbhudwal/Code/buddy/buddy-core.spec.md) for the shipped runtime/storage model.

Two architecture options. See [sequencing.intent.md](./sequencing.intent.md) for the full intent.

---

## Option A: Static dependency graph (generated once, referenced always)

**Philosophy:** After goals are set, generate a dependency graph once. The companion follows it. The graph is a data artifact, not an active agent.

### Tools

| Tool                | Input                        | Output                       | Side effects         |
| ------------------- | ---------------------------- | ---------------------------- | -------------------- |
| `sequence_generate` | `{ goals: Goal[] }`          | `{ graph: DependencyGraph }` | None                 |
| `sequence_commit`   | `{ graph: DependencyGraph }` | `{ committed: bool }`        | Writes to curriculum |

### How it works

1. Goal agent commits goals
2. LLM analyzes goals and generates a dependency graph
3. `sequence_generate` validates the graph (no cycles, all goals reachable)
4. `sequence_commit` writes it to the curriculum

### Dependency graph structure

```typescript
const DependencyGraphSchema = z.object({
  nodes: z.array(
    z.object({
      goalId: z.string(),
      topic: z.string(),
      prerequisites: z.array(z.string()), // goalIds that must come first
      cognitiveLevel: CognitiveLevelSchema,
    }),
  ),
  suggestedOrder: z.array(z.string()), // topological sort result
  phases: z.array(
    z.object({
      // groupings for the learner
      name: z.string(), // "Phase 1: Foundations"
      goalIds: z.array(z.string()),
      estimatedSessions: z.number(),
    }),
  ),
})
```

### How the companion uses it

The companion reads the graph from the curriculum at session start:

1. Check progress: which goals are demonstrated?
2. Find the "frontier" — goals whose prerequisites are all met but are not yet started/demonstrated
3. Suggest next goal from the frontier
4. If learner wants to skip ahead, warn about missing prerequisites but allow it (learner agency)

### Spaced retrieval overlay

The static graph gets a time-based overlay for spaced retrieval:

- Demonstrated goals enter a review schedule
- When a review is due, it gets added to the session alongside new material
- This creates the interleaving that CWSEI recommends

### Pros

- Simple: generate once, reference always
- No ongoing sequencing agent — just a data artifact
- Companion logic is straightforward: "what's next on the graph?"
- Learner can see the full path at any time

### Cons

- Static: doesn't adapt to what the learner actually struggles with
- Dependency detection by LLM might be wrong
- If goals change, the graph must be regenerated
- No interleaving intelligence — just follows topological order

---

## Option B: Adaptive sequencer (adjusts path based on progress)

**Philosophy:** The sequence is a living plan that adjusts based on evidence. Fast learners skip ahead. Struggling learners get prerequisites surfaced. The sequencer actively manages the learning path.

### Tools

| Tool              | Input                                           | Output                              | Side effects         |
| ----------------- | ----------------------------------------------- | ----------------------------------- | -------------------- |
| `sequence_next`   | `{ currentProgress, availableTime? }`           | `{ recommendation: NextStep }`      | None                 |
| `sequence_replan` | `{ currentProgress, newGoals?, removedGoals? }` | `{ updatedGraph: DependencyGraph }` | None                 |
| `sequence_commit` | `{ graph: DependencyGraph }`                    | `{ committed: bool }`               | Writes to curriculum |

### How it works

1. Initial graph generated same as Option A
2. At each decision point (start of session, after completing a goal), companion calls `sequence_next`
3. The sequencer considers:
   - Current progress (what's demonstrated, what's struggling)
   - Time since last practice on each demonstrated goal (spaced retrieval)
   - Learner's stated preference or interest
   - Cognitive load (don't introduce too many new topics at once)
4. Returns a recommendation: which goal to work on next, and why

### NextStep schema

```typescript
const NextStepSchema = z.object({
  primaryGoal: z.string(), // main focus for this session
  reason: z.string(), // "prerequisite for X" / "spaced review due" / "learner requested"
  spacedReviews: z.array(z.string()), // demonstrated goals due for review
  warmUp: z.string().optional(), // quick retrieval exercise before main work
  estimatedDuration: z.string(), // "30 min" / "1 hour"
})
```

### Adaptation rules

| Situation                                  | Adaptation                                                  |
| ------------------------------------------ | ----------------------------------------------------------- |
| Goal demonstrated quickly, high confidence | Skip scaffolded exercises, go to transfer-level             |
| Goal stuck after 3 sessions                | Surface prerequisite goals, check if they're truly mastered |
| Learner wants to jump ahead                | Check prerequisites → warn or allow based on mastery        |
| New goals added                            | `sequence_replan` recomputes dependencies                   |
| Long gap between sessions                  | Front-load spaced retrieval for demonstrated goals          |

### Interleaving

The adaptive sequencer actively interleaves:

- Main goal work (new learning) interleaved with review of prior goals
- Within a session: warm-up (review) → main topic → cool-down (retrieval check of earlier topic)
- Across sessions: don't repeat the same goal pattern — vary which reviews are included

### Pros

- Dynamic: adapts to actual learning evidence
- Handles real-world messyness (variable sessions, changing goals, gaps)
- Interleaving and spacing are built into the recommendations
- Learner gets personalized pacing

### Cons

- More complex: active agent, not just a data artifact
- Recommendation quality depends on progress tracking accuracy
- Another tool call at every decision point
- Risk of over-optimizing: learner might want to just explore

---

## Shared elements

### Scaffolding arc (per goal)

Both options follow the same within-goal progression:

```
Worked example → Guided exercise → Independent problem → Transfer to novel context
```

The difference is who decides when to advance: Option A = companion judgment, Option B = sequencer recommendation.

### Learner agency

Both options must respect learner choice:

- Learner can skip ahead (with prerequisite warning)
- Learner can go back to review
- Learner can say "I want to explore X instead"
- The sequence is a recommendation, not a mandate

### Curriculum file representation

```markdown
## Learning Path

### Phase 1: Foundations

- [x] tauri-basics-1: Set up a Tauri project (demonstrated)
- [/] tauri-ipc-1: Implement IPC commands (in progress)
- [ ] tauri-ipc-2: Configure permissions

### Phase 2: Advanced

- [ ] tauri-plugins-1: Use system plugins
- [ ] tauri-security-1: Implement security policies

### Review Schedule

- tauri-basics-1: next review Mar 8
```
