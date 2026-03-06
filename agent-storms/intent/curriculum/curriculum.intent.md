# Curriculum System — Intent

> Pedagogy note: the intent docs in this folder define the teaching model. For the current shipped runtime, storage contracts, and naming, use [buddy-core.spec.md](/Users/prashantbhudwal/Code/buddy/buddy-core.spec.md). If an implementation snapshot here is stale, the spec wins on implementation detail and this file wins on pedagogy.

## Source anchors

This intent is grounded in:

- [docs/sources/curriculum/principles.md](/Users/prashantbhudwal/Code/buddy/docs/sources/curriculum/principles.md)
- [docs/sources/curriculum/crosswalk.md](/Users/prashantbhudwal/Code/buddy/docs/sources/curriculum/crosswalk.md)
- `docs/sources/curriculum/raw/coursetransformationguide-cwsei-cu-sei.txt`
- `docs/sources/curriculum/raw/how-people-learn-implications-for-teac.txt`
- `docs/sources/curriculum/raw/creating-good-homework-problems-and-grading-them.txt`
- `docs/sources/curriculum/raw/creating-and-using-effective-learning-goals.txt`

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
- **Modular agents** — Each component may eventually have its own agent or service. Goal writing should not collapse into practice generation, and assessment should not silently become explanation.
- **Incremental buildout** — Goals first (anchor). Then practice. Then assessment and feedback. Each builds on the previous.

---

## The learning lifecycle

```
Learner states intent
    → Buddy clarifies (conversational)
    → Buddy sets goals (goal-writer)
    → Buddy sequences into a path (sequencing)
    → Buddy generates practice (practice agent)
    → Buddy teaches (runtime persona + interactive workspace when needed)
    → Buddy assesses (assessment)
    → Buddy gives feedback (feedback system)
    → Buddy tracks progress (progress tracker service)
    → Buddy adapts the path (adaptation engine)
    → Repeat across sessions
```

Each arrow is a potential agent or subsystem. The companion orchestrates.

---

## How this connects to what exists today

| What exists now                    | What it does                                                     | Why it matters to this intent                                    |
| ---------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| Learner store                      | Persists goals, evidence, feedback, constraints, and projections | Gives curriculum real memory across notebooks and sessions        |
| `compose-system-prompt.ts`         | Injects learner/runtime digests into the active teaching profile | Bridges persistent learner state into live conversation           |
| Runtime compiler + adaptive router | Resolves persona + strategy + activity per turn                  | Keeps teaching stance explicit instead of blending everything     |
| `curriculum-orchestrator`          | Delegates goals, practice, and assessment work                   | Central curriculum execution layer without a new user-facing mode |
| Teaching workspace in `.buddy/`    | Hosts interactive lesson files and checkpoints                   | Gives practice a real workspace when chat alone is insufficient   |

---

## Architecture direction

The curriculum system is **not one agent**. It's a **family of agents + a shared data layer**:

```
┌───────────────────────────────────────────────┐
│              Companion (orchestrator)          │
│  Detects intent, routes to the right agent,   │
│  presents results conversationally            │
├───────────────┬───────────────┬───────────────┤
│ Goal Writer   │ Practice Agent│ Assessment    │
│ Sets goals,   │ Generates     │ Agent         │
│ lints, commits│ exercises     │ Checks mastery│
├───────────────┴───────────────┴───────────────┤
│      Learner Store + Workspace Context        │
│  Persisted goals, evidence, feedback,         │
│  constraints, projections, local artifacts    │
│  (structured storage + local teaching files)  │
└───────────────────────────────────────────────┘
```

---

## Current emphasis

The ontology and learner store now exist. The quality work going forward is to make the curriculum loop truer to these principles:

1. **Practice quality** — richer deliberate-practice generation tied to expert-thinking components
2. **Feedback closure** — required actions that remain open until later evidence resolves them
3. **Sequencing quality** — stronger prerequisite handling, interleaving, and spaced retrieval
4. **Alignment depth** — better coverage across goals, practice, and varied assessment formats

---

## Open questions (curriculum-level)

1. **Data format?** Free-form markdown → needs structure. JSON alongside? Structured frontmatter? SQLite?
2. **How do agents share state?** Read/write conflicts? Event-driven?
3. **When does the companion invoke each agent?** Proactive vs. reactive?
4. **How does the learner see their curriculum?** In-app UI? Markdown? Both?
5. **Scope?** One curriculum per topic? One unified curriculum?
