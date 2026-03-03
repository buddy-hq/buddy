# Curriculum System — Intent

The curriculum system is the backbone of Buddy's learning experience. It turns "I want to learn X" into structured, persistent, adaptive learning — and keeps it going across sessions, days, and months.

This is the **umbrella intent doc**. Each major component has its own `*.intent.md` with deeper intentions and architecture.

---

## What "curriculum" means here

In CWSEI, a curriculum is **not** a syllabus or topic list. It's a coherent system where every element aligns back to learning goals. The Course Transformation Guide (Carl Wieman, 2014) defines 5 primary course components:

1. **Learning goals** — Defined in operational terms: what learners will be _able to do_ that demonstrates mastery. These guide the design of everything else.
2. **In-class activities** — Active engagement tasks: exercises, discussions, interactive problem-solving. Not passive listening.
3. **Homework / practice** — Pre-reading, problem sets, projects. Where most actual learning happens (the guide is explicit about this).
4. **Assessment & feedback** — Both formal (exams, quizzes) and informal (discussions, peer review). Feedback is the single most important element for learning.
5. **Constraints & opportunities** — Learner background, prerequisites, available tools, time budget.

> The key CWSEI insight: **no element exists in isolation.** An exercise without a goal is busywork. A goal without assessment is a wish. Assessment without feedback is a test, not teaching.

---

## The 5 principles of learning (from "How People Learn" / CWSEI)

These are the non-negotiable principles that every part of Buddy's curriculum system must honor:

1. **Build on prior thinking** — Recognize and connect to what the learner already knows. Probe for misconceptions early.
2. **Explicit practice of expert thinking** — Extended, strenuous practice of the _specific cognitive processes_ that define expertise. The brain develops like a muscle: only what is intensively practiced gets learned.
3. **Motivation** — Relevance/usefulness, sense that mastery is achievable through effort, personal agency. Never scare tactics.
4. **Reduce unnecessary cognitive load** — Working memory holds 4–7 new items. Minimize jargon, use analogies, chunk information, provide scaffolding early.
5. **Retention through spaced retrieval** — Repeated retrieval and application, spaced over time. Cumulative exercises. Interleaved topics, not isolated sequential coverage.

---

## Components of expert thinking (from CWSEI homework guide)

These are the 10 generic expert-thinking components that CWSEI says practice should target. They're originally written for science/engineering but adapt directly to software engineering and other domains:

> A learner should practice being able to:
>
> a) Identify which concepts are relevant and which are not  
> b) Separate surface features from underlying structural elements  
> c) Identify what information is needed vs. what is irrelevant  
> d) Look up, estimate, or deduce information that is needed but not given  
> e) Make appropriate simplifying assumptions  
> f) Break down a complex problem into appropriate pieces  
> g) Plan a solution  
> h) Use and move between multiple representations  
> i) Carry out routine procedures quickly and correctly  
> j) Evaluate whether a result makes sense

**Typical back-of-chapter problems only exercise (i).** They give all needed info, remove extraneous info, state the assumptions, and organize by chapter so concept selection is trivial. This is exactly what Buddy must _not_ do.

---

## The CWSEI component map

These are the major artifact categories from the CWSEI framework (see `cwsei/artifacts.md` for the full catalog with "how to make" and "not to do" for each):

| Component                 | What it produces                                                      | Key CWSEI principle                                                                                   | Sub-intent doc         |
| ------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------- |
| **Goals**                 | Course-level and topic-level learning goals                           | Goals drive everything — all other components align to them                                           | `goals.intent.md`      |
| **Practice & exercises**  | Deliberate practice tasks that build expert thinking components (a–j) | "Challenging but doable" tasks requiring intense effort; where most learning happens                  | `practice.intent.md`   |
| **Assessment**            | Mastery checks, quizzes, varied assessment formats                    | "What is tested dominates what students think is important"                                           | `assessment.intent.md` |
| **Feedback**              | Timely, specific, actionable responses to learner work                | "The single most important element for achieving learning" (Gibbs & Simpson)                          | `feedback.intent.md`   |
| **Alignment**             | Ensures goals ↔ practice ↔ assessment are coherent                  | "Suites of questions" — same goal assessed across homework/exercise/quiz with varied surface features | `alignment.intent.md`  |
| **Progress & adaptation** | Tracks mastery and adjusts the path                                   | Build on prior thinking; adjust challenge to current mastery level                                    | `progress.intent.md`   |
| **Sequencing**            | Orders topics by dependencies and cognitive load                      | Interleaved (not isolated sequential) coverage; spaced retrieval                                      | `sequencing.intent.md` |

---

## The core problem

AI learning tools today have no curriculum. Every session is a blank slate. There's no structure, no tracking, no evidence-based adaptation. Progress lives in the learner's head.

## What Buddy's curriculum system should do

1. **Set goals** — Turn learner intent into CWSEI-style learning goals (observable, testable, verb-driven)
2. **Build a learning path** — Sequence goals into modules with dependencies
3. **Generate practice** — Create exercises that target specific expert-thinking components, aligned to goals. Must be "challenging but doable."
4. **Assess mastery** — Check whether the learner can actually do what the goals claim, through varied formats
5. **Deliver feedback** — Timely, specific, require the learner to act on it (not just "good job")
6. **Track progress** — Record demonstrated performances against goals
7. **Adapt** — Adjust based on evidence: skip mastered material, revisit gaps, increase difficulty as proficiency grows
8. **Persist** — Everything survives across sessions

---

## Key design principles

- **Goals are the anchor** — No practice, assessment, or feedback without goals. This is the CWSEI foundation.
- **Alignment is non-negotiable** — Every exercise maps to a goal. Every assessment maps to a goal. CWSEI calls misaligned content "busy work" and learners will sense it.
- **Evidence over vibes** — Progress claims must trace to demonstrated performances. Not "the learner said they get it."
- **Feedback > assessment** — The point of assessment is to generate feedback, not to generate grades. Feedback must be timely, specific, and require the learner to act on it.
- **Deliberate practice, not repetition** — Practice must be challenging, require intense thought, and target specific expert-thinking components. Easy repetitive tasks produce little learning.
- **Conversational, not bureaucratic** — The underlying machinery is rigorous. The learner-facing experience is a conversation with a thoughtful tutor.
- **CWSEI rigor, learner-friendly language** — "After this, you can…" not "Students will be able to…"
- **Modular agents** — Each component may eventually have its own agent. Goal agent can't write exercises. Exercise agent can't conduct assessments.
- **Incremental buildout** — Goals first (anchor). Then practice. Then assessment and feedback. Each builds on the previous.

---

## The learning lifecycle

```
Learner states intent
    → Buddy clarifies (conversational)
    → Buddy sets goals (goal agent)
    → Buddy sequences into a path (sequencing)
    → Buddy generates practice (practice agent)
    → Buddy teaches (companion + code-teacher)
    → Buddy assesses (assessment)
    → Buddy gives feedback (feedback system)
    → Buddy tracks progress (progress tracker)
    → Buddy adapts the path (adaptation engine)
    → Repeat across sessions
```

Each arrow is a potential agent or subsystem. The companion orchestrates.

---

## How this connects to what exists today

| What exists                | What it does                                        | What it will become                                           |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| `CurriculumService`        | Reads/writes a curriculum markdown file per project | Persistence layer for the whole curriculum system             |
| `compose-system-prompt.ts` | Injects curriculum into companion's system prompt   | Bridge between persisted curriculum and live agent context    |
| `goals/` (new, untracked)  | 5-tool goal-writing agent                           | Simplified per `goals.intent.md`                              |
| `teaching/` (code-teacher) | Interactive workspace teaching sessions             | One delivery mechanism for practice — needs to align to goals |
| `curriculum/` (existing)   | Curriculum subagent for reading/updating curriculum | Will evolve to handle structured curriculum data              |

---

## Architecture direction

The curriculum system is **not one agent**. It's a **family of agents + a shared data layer**:

```
┌───────────────────────────────────────────────┐
│              Companion (orchestrator)          │
│  Detects intent, routes to the right agent,   │
│  presents results conversationally            │
├───────────────┬───────────────┬───────────────┤
│  Goal Agent   │ Practice Agent│ Assessment    │
│  Sets goals,  │ Generates     │ Agent         │
│  lints, commits│ exercises    │ Checks mastery│
├───────────────┴───────────────┴───────────────┤
│           Curriculum Data Layer                │
│  Persisted goals, progress, exercises,        │
│  assessment results, adaptation state         │
│  (CurriculumService + structured storage)     │
└───────────────────────────────────────────────┘
```

---

## What to build first

1. **Goals** — Already in progress. Simplify per `goals.intent.md`. Make it persist.
2. **Progress tracking** — Companion needs to record demonstrated performances. Without this, goals are write-once artifacts.
3. **Practice generation** — Exercises aligned to goals, targeting expert-thinking components, using code-teacher workspace.

Assessment, feedback, alignment, and sequencing come later.

---

## Open questions (curriculum-level)

1. **Data format?** Free-form markdown → needs structure. JSON alongside? Structured frontmatter? SQLite?
2. **How do agents share state?** Read/write conflicts? Event-driven?
3. **When does the companion invoke each agent?** Proactive vs. reactive?
4. **How does the learner see their curriculum?** In-app UI? Markdown? Both?
5. **Scope?** One curriculum per topic? One unified curriculum?
