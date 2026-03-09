# Sequencing — Intent

Sub-intent of [curriculum system](./curriculum.intent.md). Sequencing determines the order in which topics and goals are presented. Done wrong, it creates isolated knowledge islands. Done right, it builds interconnected expertise.

## Source anchors

Primary sources for this intent:

- [docs/sources/curriculum/principles.md](/Users/prashantbhudwal/Code/buddy/docs/sources/curriculum/principles.md)
- `docs/sources/curriculum/raw/coursetransformationguide-cwsei-cu-sei.txt`
- `docs/sources/curriculum/raw/how-people-learn-implications-for-teac.txt`
- `docs/sources/curriculum/raw/good-examples-of-learning-goals-at-ubc-and-cu.txt`

---

## What CWSEI says about sequencing

### Against isolated sequential coverage

From the memory & retention section of the Course Transformation Guide:

> "Avoid covering material in a separated sequential fashion, where each topic is covered and tested only once and not revisited. While conducive to a well-organized syllabus, this is not conducive to useful learning."

> "Students need to build broader associations and to practice sorting out interference between topics when accessing ideas in long-term memory."

> "Too often students will learn and retain that some concept or solution method is associated with Chapter 4, covered in week 6, but they will not develop the useful expert-like associations."

### For interleaved, connected coverage

- **Interleave topics** — the cognitive effort of sorting between topics during study suppresses interference during later retrieval
- **Make cumulative** — homework and assessments should revisit prior topics in the presence of new material
- **Build multiple associations** — link new material to prior knowledge through explicit connections
- **Show organization** — explicitly show how topics are linked (helps chunking in working memory)

### Spaced retrieval

From the learning science summary:

> "Repeated retrieval and application of the information, spaced out over time, is the most important element for achieving long-term memory."

- **Space practice sessions** — don't cram all practice for one goal into one session
- **Revisit** — demonstrated goals should periodically be re-exercised with new surface features
- **Cumulative exercises** — later exercises should require combining multiple goals

---

## Prerequisites and dependencies

### Course-level goal mapping (from Beth Simon CS model)

After topic-level goals are developed, they're mapped to course-level goals. This reveals:

- **Dependencies** — which topics must come before others
- **Redundancies** — concepts taught identically in multiple places
- **Gaps** — critical concepts never taught

### For Buddy

The sequencing agent/system should:

1. Take the set of learning goals
2. Identify dependencies between them (does goal B require goal A?)
3. Determine a valid ordering (topological sort with flexibility)
4. Build in interleaving and spacing
5. Flag goals that have no dependencies (can be done anytime) vs. those with strict prerequisites

---

## Reducing cognitive load through sequencing

From the working memory section:

- **Front-load vocabulary** with pre-reading/pre-work so teaching time can be higher-level
- **Start simple, add complexity** — scaffolded introduction, then remove supports
- **Don't introduce too many new terms at once** — each unfamiliar term consumes working memory
- **Use worked examples early** — show structure before requiring independent work

The sequence should follow a **scaffold → practice → independence** arc per topic:

```
Worked example  →  Guided exercise  →  Independent problem  →  Transfer/novel context
  (high support)    (medium support)     (low support)          (no support)
```

---

## Adapting for Buddy

| CWSEI concept            | Buddy equivalent                                            |
| ------------------------ | ----------------------------------------------------------- |
| Course syllabus ordering | Learning path with topic sequence                           |
| Cumulative homework      | Later exercises combine multiple goals                      |
| Spaced retrieval         | Periodic "warm-up" on prior goals in new sessions           |
| Interleaved practice     | Exercises mixing goal A and goal B concepts                 |
| Pre-reading              | "Before we start, skim this section"                        |
| Worked examples first    | Buddy walks through a solution before asking learner to try |

---

## Open questions

1. **Who determines the sequence?** The goal-writer when goals are created? A separate sequencing step? The companion ad hoc?
2. **How rigid is the sequence?** Strict prerequisites or flexible recommendations? Can the learner skip ahead?
3. **How does spacing work practically?** A scheduler that resurfaces goals? Or the companion maintaining awareness of time-since-last-practice?
4. **How do we handle the learner who wants to jump around?** Honor their agency or warn about missing prerequisites?
5. **How does interleaving work in conversation?** Mix topics within a session? Or across sessions?
