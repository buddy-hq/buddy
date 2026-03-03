# Practice & Exercises — Architecture

Two architecture options. See [practice.intent.md](./practice.intent.md) for the full intent.

---

## Option A: Template-driven generation

**Philosophy:** Practice tasks are generated from structured templates keyed to goals + Bloom's level + expert-thinking components. The LLM fills in domain-specific content, but the structure comes from templates.

### Tools

| Tool                | Input                                                                         | Output                   | Side effects         |
| ------------------- | ----------------------------------------------------------------------------- | ------------------------ | -------------------- |
| `practice_generate` | `{ goalId, cognitiveLevel, targetComponents: ['a','f','g','j'], difficulty }` | `{ exercise: Exercise }` | None                 |
| `practice_commit`   | `{ exercise: Exercise, goalId }`                                              | `{ committed: bool }`    | Writes to curriculum |

### Template system

Templates define the _shape_ of an exercise based on Bloom's level:

| Level             | Template shape                                                               |
| ----------------- | ---------------------------------------------------------------------------- |
| Factual Knowledge | "Define/list/name X" — recall format                                         |
| Comprehension     | "Explain in your own words why X" — explanation format                       |
| Application       | "Given this scenario, implement/solve/predict X" — task format               |
| Analysis          | "Compare X and Y / Find the bug in X / Categorize these" — comparison format |
| Synthesis         | "Design/create/build X that satisfies Y" — open-ended build format           |
| Evaluation        | "Review this code/approach and justify which is better" — judgment format    |

Each template also specifies which expert-thinking components (a–j) it targets:

```typescript
{
  level: "Application",
  components: ["a", "c", "f", "g", "j"],  // identify concepts, filter info, decompose, plan, evaluate
  template: {
    scenario: "...",        // real-world context (must pass "why should anyone care?" test)
    task: "...",             // what to do
    constraints: "...",     // what's NOT given (forces components c, d, e)
    deliverable: "...",     // what to produce (code + explanation, not just a number)
    selfCheck: "..."        // how to verify your answer (component j)
  }
}
```

### How it works

1. Goal agent commits goals with cognitive levels
2. Practice agent receives a goal + desired difficulty
3. Selects appropriate template based on Bloom's level
4. LLM fills template with domain-specific content
5. `practice_generate` validates structure (has scenario, deliverable, self-check)
6. Exercise presented to learner
7. After completion, `practice_commit` records it in curriculum

### Pros

- Consistent structure across all exercises
- Templates enforce expert-thinking components — no accidentally creating routine-only problems
- Easy to scale: new templates → new exercise types

### Cons

- Templates might feel formulaic if the LLM doesn't vary them enough
- Requires building and maintaining the template library
- Template selection logic could be wrong — wrong level for the learner

---

## Option B: Goal-constrained free generation

**Philosophy:** The LLM generates exercises freely, guided by the goal + a constraint checklist. No templates. A validation tool ensures quality.

### Tools

| Tool                | Input                                         | Output                             | Side effects         |
| ------------------- | --------------------------------------------- | ---------------------------------- | -------------------- |
| `practice_validate` | `{ exercise: Exercise, goalId, targetLevel }` | `{ valid: bool, issues: Issue[] }` | None                 |
| `practice_commit`   | `{ exercise: Exercise, goalId }`              | `{ committed: bool }`              | Writes to curriculum |

### Constraint checklist (in prompt)

The prompt tells the LLM to generate exercises that:

- [ ] Map to a specific learning goal
- [ ] Target at least 3 of the 10 expert-thinking components (a–j)
- [ ] Match the goal's cognitive level or one level higher
- [ ] Include a realistic scenario ("why should anyone care?" test)
- [ ] Require showing reasoning, not just producing an answer
- [ ] Don't give all needed information — force the learner to identify/look up/estimate
- [ ] Don't state the simplifying assumptions — let the learner decide
- [ ] Include a self-check mechanism
- [ ] Are challenging but doable given the learner's current level

### Validation tool checks

`practice_validate` runs deterministic checks:

- Exercise references a valid goal ID
- Has scenario, task, deliverable, and self-check fields
- Deliverable is not just "a number" or "true/false"
- Components claim is plausible (e.g., if "all info given" then component c isn't exercised)

### How it works

1. Companion or practice agent decides learner needs practice on goal X
2. LLM generates an exercise freely, following the constraint checklist
3. Calls `practice_validate` to check structure
4. If invalid → revise and re-validate
5. Present to learner
6. After completion → `practice_commit`

### Pros

- More creative, varied exercises — no template rigidity
- LLM can adapt format to the domain naturally
- Simpler infrastructure — no template library to maintain

### Cons

- Quality is more variable — depends on prompt following
- Harder to guarantee coverage of expert-thinking components
- No structural guarantee that exercises feel "right"

---

## Shared elements

### Exercise schema

```typescript
const ExerciseSchema = z.object({
  goalId: z.string(),
  cognitiveLevel: CognitiveLevelSchema,
  targetComponents: z.array(z.enum(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"])).min(1),
  scenario: z.string(), // real-world context
  task: z.string(), // what to do
  constraints: z.string(), // what's NOT given / what to figure out
  deliverable: z.string(), // what to produce
  selfCheck: z.string(), // how to verify
  difficulty: z.enum(["scaffolded", "guided", "independent", "transfer"]),
})
```

### Difficulty progression

Both options use the same scaffold → independence arc:

| Level         | Meaning                       | Support                                |
| ------------- | ----------------------------- | -------------------------------------- |
| `scaffolded`  | Worked example + fill in gaps | High — structure provided              |
| `guided`      | Task given, hints available   | Medium — hints on request              |
| `independent` | Task given, no hints          | Low — learner plans own approach       |
| `transfer`    | Novel context, multiple goals | None — learner identifies what applies |

### Connection to code-teacher

Exercises at `independent` and `transfer` levels should route to the code-teacher workspace where the learner writes and runs code. `scaffolded` and `guided` can happen in chat.
