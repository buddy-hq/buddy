# Goals — Architecture

> Historical reference: this file captures earlier architecture options explored before the learner-store and generated learning-plan cutover. Use the `*.intent.md` files in this folder for pedagogy and [buddy-core.spec.md](/Users/prashantbhudwal/Code/buddy/buddy-core.spec.md) for the shipped runtime/storage model.

Two architecture options for the goal-setting component. See [goals.intent.md](./goals.intent.md) for the full intent.

---

## Option A: Prompt-heavy, 2 tools

**Philosophy:** The LLM is the engine. Tools only exist for what the LLM provably can't do — deterministic validation and file I/O.

### Tools

| Tool          | Input                               | Output                              | Side effects              |
| ------------- | ----------------------------------- | ----------------------------------- | ------------------------- |
| `goal_lint`   | `{ goals: Goal[], scope, context }` | `{ passed: bool, issues: Issue[] }` | None                      |
| `goal_commit` | `{ goals: Goal[], scope, context }` | `{ committed: bool, path: string }` | Writes to curriculum file |

### Prompt structure

The prompt carries the full CWSEI rubric, Bloom's verb table, the checklist, and the 3-step process (intent-driven → content-walk → course-level synthesis). The LLM does scope decision, evidence gathering, and drafting through reasoning — no tool call needed.

```
prompt.md
├── Role & mission
├── CWSEI goal rubric (verbatim checklist)
├── Bloom's verb table
├── 3-step process (adapted for self-directed learner)
├── Good/bad examples
├── Language rules (learner-friendly, no "students")
└── Workflow: converse → draft → lint → present → commit
```

### Data flow

```
Learner: "I want to learn Tauri"
    ↓
Agent reasons: scope = topic-level, context = desktop app dev
    ↓
Agent converses: "What do you want to build? What do you already know?"
    ↓
Agent drafts goals internally (LLM reasoning, no tool)
    ↓
Agent calls goal_lint({ goals, scope, context })
    ↓
lint returns { passed: false, issues: ["goal 3: vague verb 'understand'"] }
    ↓
Agent fixes goal 3, re-lints
    ↓
lint returns { passed: true }
    ↓
Agent presents goals to learner in markdown
    ↓
Learner: "looks good" / "change goal 2 to..."
    ↓
Agent calls goal_commit({ goals, scope, context })
    ↓
Goals written to curriculum file
```

### What `goal_lint` checks (deterministic)

- Vague verbs (understand, know, learn, appreciate, be aware of)
- Compound goals (multiple distinct performances joined by "and")
- Topic-not-task (goal labels a topic instead of describing a performance)
- Level-verb mismatch (verb doesn't match claimed Bloom's level)
- Jargon density (too many unfamiliar terms for a single goal)
- Testability (is there a plausible way to assess this?)
- Breadth (too broad to assess in one or two tasks)

### What `goal_commit` does

1. Reads existing curriculum file via CurriculumService
2. Appends/updates the goals section
3. Each goal is stored with: statement, verb, task, cognitive level, scope, timestamp
4. Returns the file path

### Pros

- 2 round-trips maximum. Fast, natural conversation.
- Easy to make a subagent later — small tool surface.
- Learner doesn't feel a pipeline.

### Cons

- LLM might skip evidence gathering or scope analysis.
- No structured audit trail of how goals were derived.
- Quality depends heavily on prompt engineering.

---

## Option B: Checkpoint-gated, 3 tools

**Philosophy:** Trust but verify. The LLM reasons, but must show its work at a structured checkpoint before drafting goals.

### Tools

| Tool          | Input                                                                 | Output                              | Side effects              |
| ------------- | --------------------------------------------------------------------- | ----------------------------------- | ------------------------- |
| `goal_plan`   | `{ scope, context, evidence: EvidenceItem[], assumptions: string[] }` | `{ brief: Brief, issues: Issue[] }` | None                      |
| `goal_lint`   | `{ goals: Goal[], brief: Brief }`                                     | `{ passed: bool, issues: Issue[] }` | None                      |
| `goal_commit` | `{ goals: Goal[], brief: Brief }`                                     | `{ committed: bool, path: string }` | Writes to curriculum file |

### The `goal_plan` checkpoint

Before the LLM drafts any goals, it must submit a structured plan:

```typescript
{
  scope: "course-level" | "topic-level",
  context: "what the learner wants and why",
  evidence: [
    { label: "Build a desktop app", kind: "user_stated_outcome", taskStatement: "Design and ship a Tauri app" },
    { label: "IPC security", kind: "representative_task", taskStatement: "Configure permissions for IPC commands" }
  ],
  assumptions: ["Learner has basic Rust knowledge", "Targeting macOS"]
}
```

The tool validates:

- Evidence items are task-like (not topic labels) — uses heuristic + structure check
- At least 3 evidence items for course-level, 2 for topic-level
- Scope is consistent with learner's request
- Returns a structured brief the LLM uses for drafting

### Data flow

```
Learner: "I want to learn Tauri"
    ↓
Agent converses to understand intent
    ↓
Agent calls goal_plan({ scope, context, evidence, assumptions })
    ↓
plan returns { brief: {...}, issues: [] }  OR  { brief: null, issues: ["evidence too vague"] }
    ↓
Agent drafts goals using the brief
    ↓
Agent calls goal_lint({ goals, brief })
    ↓
Fix if needed, re-lint
    ↓
Present to learner → goal_commit
```

### What `goal_plan` adds over Option A

- **Forces evidence gathering** — the LLM can't skip "what does the learner actually need to do?"
- **Creates an audit trail** — the brief records how goals were derived
- **Catches vague intent early** — if evidence is all topic-like ("security", "IPC"), the tool pushes back before goals are drafted
- **Brief feeds into lint** — lint can check goals against the evidence (does every evidence item have a corresponding goal?)

### Pros

- Structured reasoning produces more consistent quality.
- Audit trail for debugging or learner review.
- Brief enables alignment checking later (practice agent can reference it).

### Cons

- 3 round-trips instead of 2.
- `goal_plan` validation is still heuristic — "is this task-like?" is hard to check deterministically.
- More complex prompt and tool surface.

---

## Shared infrastructure (both options)

### Schemas (Zod)

```typescript
const GoalSchema = z.object({
  statement: z.string(), // "After this topic, you'll be able to..."
  verb: z.string(), // "implement"
  task: z.string(), // "a Tauri command with input validation"
  cognitiveLevel: CognitiveLevelSchema,
  scope: GoalScopeSchema,
})

const GoalSetSchema = z.object({
  goals: z.array(GoalSchema).min(1).max(10),
  scope: GoalScopeSchema,
  context: z.string(),
})
```

### Lint rules (shared module)

Both options use the same deterministic lint. Lives in `lint-rules.ts`, not `types.ts`.

### Curriculum persistence

Both options write to the same curriculum file via CurriculumService. Goals section format:

```markdown
## Learning Goals

### Course-Level Goals

1. After learning Tauri, you'll be able to design and ship a desktop app... [Application]

### Topic: IPC Commands

1. After this topic, you'll be able to implement a Tauri command... [Application]
2. After this topic, you'll be able to configure permissions for... [Application]
```

### Read access

Both options give the agent read access to the existing curriculum so it can see prior goals and avoid duplication.
