# Goals — Intent

Status: Detailed pedagogical evidence for goals. Concise index: [principles.md](./principles.md). Shipped tools: `packages/buddy/src/learning/features/curriculum-planning/` (`goal_decide_scope`, `goal_lint`, `goal_commit`, `goal_state`) and the `goal-writer` subagent.

This is a sub-intent of the curriculum system documented in [principles.md](./principles.md). Goals are the anchor — everything else (practice, assessment, feedback, progress) aligns back to them.

## Source anchors

Official sources (local `raw/` dumps were removed):

- [principles.md](./principles.md) bibliography: Simon & Perkins (2010) *Creating and Using Effective Learning Goals*; Simon & Wolfman *How to Develop Learning Goals for an Established Course: The Computer Science Model*; Wieman Course Transformation Guide.
- Course-scale coverage: learning goals should cover approximately **70–80%** of course content (leave room for emerging inquiry). This is a pedagogical coverage rule, not a lint code.

## What goals are (from CWSEI primary sources)

A learning goal describes **what the learner will be able to do** — not what topics they'll cover, not what they'll study, not what they'll "understand."

From the Course Transformation Guide:

> "Learning goals. Defined in operational terms of what students will be able to do that demonstrates they have achieved all elements of the desired mastery, both cognitive and affective. These goals should guide the design of all other course components."

Two scopes:

- **Course-level goals** (5–10 drafted, typically 4–7 after refinement): The major outcomes for an entire learning journey. They should cover about **70–80%** of the journey's content so core instruction is anchored without pretending every curiosity is pre-specified.
  - Form: "At the end of this course, you will be able to `<verb>` `<task>`."
  - These are the "big picture" themes. They often end up as 4–7 after refinement (Beth Simon CS model).
  - Example: "Deduce information about genes, alleles, and gene functions from analysis of genetic crosses and patterns of inheritance."
  - Example (software): "Design and ship a Tauri desktop app that handles IPC, permissions, and system plugins."

- **Topic-level goals** (3–7 per topic, 30–100 total across a course): Specific performances for one module, aligned to course-level goals.
  - Form: "After this topic, you will be able to `<verb>` `<task>`."
  - Each topic-level goal maps to one or more course-level goals.
  - Example: "Draw a pedigree based on information in a story problem."
  - Example: "Design a genetic cross to provide information about gene function."
  - Example (software): "Implement a Tauri command that validates inputs and returns structured errors."

Every goal has:

- An **observable action verb** (never "understand" or "know")
- A **concrete task** describing the performance
- A **cognitive level** (Bloom's)
- A **way to test it** — if you can't assess it, it's not a goal

---

## The CWSEI goal-creation process (Beth Simon CS model)

The primary source (Beth Simon, "How to Develop Learning Goals for an Established Course: The Computer Science Model") defines a 3-step process:

### Step 1: Assessment-driven topic goals

Start from existing assessments (exams, homework, projects). For each question/task, ask:

> "If the learner gets this correct, it shows they can…"

This surfaces what's _actually_ being assessed. It also reveals things that are taught but never tested — and things that are tested but never taught.

### Step 2: Lecture/content-driven topic goals

Walk through the material topic by topic. For each topic, ask:

> "After this material is covered, what can the learner _do_?"

The instinct is to say "understand X." Push past that to concrete performances: "rank algorithms by complexity," "compare disk access patterns," "debug a race condition in concurrent code."

### Step 3: Course-level goals

After topic goals exist, develop 5–12 course-level goals. Then map each topic goal to the course goals it supports. Pare down to 4–7 course goals. Look for course goals with few supporting topic goals (maybe merge), and topic areas that only map to one course goal (maybe split).

### For Buddy's context (self-directed learner, no existing course)

The learner has no existing exams or lectures. So the process adapts:

1. **Intent-driven** (instead of assessment-driven): "If the learner achieves their stated goal, what tasks can they now perform?" Work backwards from what they want to accomplish.
2. **Content-walk** (same as CWSEI but using research): Use docs, syllabi, repo structures to identify what the topic actually contains. For each area, ask "after this, the learner can do what?"
3. **Course-level synthesis**: Group the topic goals into 4–7 major themes.

---

## The checklist (from CWSEI, verbatim from the source)

For every learning goal, check:

- [ ] Does it identify what the learner will be able to do after the topic is covered?
- [ ] Is it clear how you would test achievement of the goal?
- [ ] Do the chosen verbs have a clear meaning?
- [ ] Is the verb aligned with the cognitive level expected? Could you expect a higher level?
- [ ] Is the terminology familiar? If not, is knowing the terminology itself a goal?
- [ ] Is the goal relevant and useful — connected to the learner's real tasks?

---

## Bloom's verb table (from CWSEI)

| Level             | Description                         | Representative verbs                                                |
| ----------------- | ----------------------------------- | ------------------------------------------------------------------- |
| Factual Knowledge | Remember & recall                   | define, list, state, label, name                                    |
| Comprehension     | Demonstrate understanding           | describe, explain, summarize, interpret, illustrate                 |
| Application       | Apply to unfamiliar situations      | apply, demonstrate, use, compute, solve, predict, construct, modify |
| Analysis          | Break down into parts               | compare, contrast, categorize, distinguish, identify, infer         |
| Synthesis         | Combine to create something new     | develop, create, propose, formulate, design, invent                 |
| Evaluation        | Think critically, defend a position | judge, appraise, recommend, justify, defend, criticize, evaluate    |

> "One of the most critical aspects of writing learning goals is choosing a verb that describes exactly what students should be able to do. Many faculty are tempted to use the verb 'understand,' but this is not specific – two faculty members could both say 'understand' but have completely different expectations."

---

## What the current implementation does

Shipped in `packages/buddy/src/learning/features/curriculum-planning/`:

- `goal-writer` subagent (`GOAL_WRITER_AGENT_NAME`)
- Tools: `goal_decide_scope`, `goal_lint`, `goal_commit`, `goal_state` (`GOAL_TOOL_IDS`)
- Deterministic lint codes: `VAGUE_VERB`, `MISSING_TESTABILITY`, `COMPOUND_GOAL`, `TOPIC_NOT_TASK`, `TEMPLATE_MISMATCH`, `LEVEL_VERB_MISMATCH`, `TOO_BROAD`, `JARGON_HEAVY`, `WEAK_RELEVANCE`, `COUNT_OUT_OF_RANGE` (`GoalLintCodeSchema` in `types.ts`). Blocking errors refuse `goal_commit`.
- Persistence through `goal_commit` into the cross-notebook learner store; `goal_state` for visibility.

### Still needs care (quality, not missing tools)

1. **Conversation quality** — goal-setting should feel like clarification and synthesis, not form filling.
2. **Grounding quality** — goals still need enough context from the learner's actual project and motivation.
3. **Scope discipline** — avoid generating too many shallow goals too early.
4. **Language quality** — keep learner-facing wording concrete and direct, never bureaucratic.

## Historical: architecture version menu (not current)

An earlier design compared tool counts (A: `goal_lint`+`goal_commit`; B: add `goal_plan`; C: add `goal_research`; D: subagent orchestration). **Shipped shape is closest to B+D:** `goal_decide_scope` is the brief checkpoint (not named `goal_plan` / `goal_research`), plus `goal_lint` / `goal_commit` / `goal_state`, invoked via the `goal-writer` subagent so the learner does not switch default agents.

Do not treat Versions A–C as an open product decision.

## Historical: open questions (goals-specific)

These were product-UX questions at draft time. They are not a live spec:

1. Clarifying vs proposing first.
2. What triggers goal creation.
3. Per-goal lifecycle location (shipped: goal records + learner-memory evidence statuses).
4. Whether goals can evolve (shipped: commit archives previous active sets with the same scope/contextLabel).
5. Session vs topic/course granularity.
