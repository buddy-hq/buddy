# Goals — Intent

This is a sub-intent of the broader [curriculum system](./curriculum.intent.md). Goals are the anchor — everything else (practice, assessment, feedback, progress) aligns back to them.

---

## What goals are (from CWSEI primary sources)

A learning goal describes **what the learner will be able to do** — not what topics they'll cover, not what they'll study, not what they'll "understand."

From the Course Transformation Guide:

> "Learning goals. Defined in operational terms of what students will be able to do that demonstrates they have achieved all elements of the desired mastery, both cognitive and affective. These goals should guide the design of all other course components."

Two scopes:

- **Course-level goals** (5–10): The major outcomes for an entire learning journey.
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

The current goal agent (`packages/buddy/src/learning/goals/`) has:

- **5 tools**: `decide_scope` → `build_evidence_pack` → `draft_set` → `lint_set` → `submit_set`
- **Standalone agent** (`goal-writer`) registered in `buddy-agents.ts`
- **Zod schemas** for Brief, EvidencePack, Draft, LintReport, Result
- **Deterministic lint rules** checking vague verbs, testability, compounds, topic-not-task, level-verb mismatch, jargon, breadth
- **No persistence** — goals exist only in chat message history

## What's wrong

1. **Too many tools doing LLM work** — Scope detection and evidence gathering are reasoning tasks. They don't need tool calls with regex heuristics.
2. **No persistence** — Goals vanish after the conversation.
3. **Too mechanical** — 10-step pipeline feels like a form.
4. **Isolated** — Can't read curriculum, can't search web.
5. **Academic language** — "students" instead of "you."

---

## Proposed architecture versions

### Common elements (all versions)

- **Lint rules** — Deterministic CWSEI checks: vague verbs, compounds, topic-not-task, level-verb mismatch, jargon, breadth, testability. These are valuable.
- **Bloom's verb table** — Hard-coded verb → level mapping. Reusable.
- **Zod schemas** — Structure for goals. Keep but simplify.
- **Curriculum persistence** — Goals must be written to the curriculum file.
- **Curriculum read access** — Agent must see existing goals.

### Version A: Minimal (2 tools)

`goal_lint` + `goal_commit`

- LLM does all thinking through prompt-guided reasoning
- Fewest round-trips, most natural conversation
- Risk: LLM might skip quality steps

### Version B: Guided (3 tools)

`goal_plan` + `goal_lint` + `goal_commit`

- LLM must submit a structured brief before drafting
- Forces "think before you draft" checkpoint
- One extra round-trip

### Version C: Research-first (4 tools)

`goal_research` + `goal_plan` + `goal_lint` + `goal_commit`

- Research step assembles source pack from docs/syllabi
- Goals grounded in real sources
- Slower, more complex

### Version D: Subagent (same tools, different orchestration)

- Companion invokes goal-writer internally
- Learner never switches agents
- Stated end-state

---

## Open questions (goals-specific)

1. **Clarifying vs. proposing?** Should the agent ask questions first, or propose goals and let the learner react?
2. **What triggers goal creation?** Learner asks? Companion detects no goals? First message?
3. **Goal lifecycle?** Status per goal (not-started / in-progress / demonstrated)? Where does that live?
4. **Can goals evolve?** Add/remove/edit as learning progresses?
5. **Granularity?** Every 30-minute session? Or just topic/course arcs?
