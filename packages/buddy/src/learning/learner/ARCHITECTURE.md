# Learner Module Architecture

## One-Line Summary

A heuristic-based tutoring system that tracks learning goals, generates personalized practice, and provides feedback—all without ML models.

---

## What Is This?

It's an intelligent tutoring system for coding education. It watches what you do, remembers your progress, and decides what to teach next.

**Three things it does:**

1. **Tracks** what you're trying to learn (goals) and how you're doing (evidence)
2. **Decides** what to teach next (session planning)
3. **Responds** with targeted feedback after practice/assessments

---

## Core Concept: Everything Links to Goals

Goals are the atomic unit. Every piece of data points to a goal:

```
Goal "Understand React hooks"
    ├── Evidence: 5 records (practice attempts, messages)
    ├── Progress: "demonstrated" (passed 2 assessments)
    ├── Feedback: 2 open items (what to fix next)
    └── Misconceptions: 1 active ("state is confusing")
```

---

## The Data Model (In Brief)

```
┌─────────────────────────────────────────────────────────┐
│  GOAL: What you're learning                            │
│  - statement: "I can use useEffect for data fetching"  │
│  - cognitiveLevel: "Application"                       │
│  - howToTest: "Build a component that fetches on mount"│
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  EVIDENCE: What happened                               │
│  - sourceType: "practice" | "assessment" | "message"    │
│  - outcome: "positive" | "mixed" | "negative"         │
│  - summary: What occurred                              │
└─────────────────────────────────────────────────────────┘
         │
         ├──────────────────┬──────────────────┐
         ▼                  ▼                  ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ MISCONCEPTION│   │  FEEDBACK   │   │  PROJECTION  │
│ (if confused)│   │ (what to do)│   │ (derived view)│
└──────────────┘   └──────────────┘   └──────────────┘
```

---

## How It Works: The Three Flows

### Flow 1: You Say Something

```
User message
     │
     ▼
┌─────────────────┐
│ Signal Detection│  Regex matching for:
│                 │  - "stuck", "confused" → frustration
│                 │  - "explain", "why" → request
│                 │  - "done", "next" → completion
└────────┬────────┘
         │
    has signal?
         │
    ┌──YES──┐
    │       │
    ▼       ▼
Evidence  Misconception
         (if confused)
```

### Flow 2: You Do Practice

```
Practice attempt
     │
     ▼
┌─────────────────┐
│ Record Practice │
│ (template +     │
│  attempt)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Generate        │
│ Evidence        │
│ (outcome based  │
│  on: completed/ │
│  partial/stuck) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Generate        │  Template-based:
│ Feedback        │  - strengths
│                 │  - gaps
│                 │  - guidance
│                 │  - required action
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Auto-Resolve   │  Finds open feedback for
│ old feedback   │  same goal, marks resolved
└─────────────────┘
```

### Flow 3: Session Planning

```
Query for next activity
     │
     ▼
┌─────────────────┐
│ Build Session   │
│ Plan            │
│                 │
│ Score each goal:│
│ +30 open feedback│
│ +20 needs review│
│ +15 in progress │
│ +10 not started │
│ -50 blocked    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Return:         │
│ - primary goal  │
│ - activity type │
│ - scaffolding   │
│ - rationale     │
└─────────────────┘
```

---

## Key Decision Rules

### When does something create a Misconception?

Only when learner message contains: `confused`, `don't understand`, `stuck`, `frustrated`

### When does something create Feedback?

Every practice attempt and assessment generates feedback via templates.

### When does Feedback resolve?

- **Positive evidence** (completed practice, demonstrated assessment) → `resolved`
- **Mixed evidence** (partial) → `acted-on` (needs follow-up)

---

## Feedback Templates (How Responses Are Built)

### Practice Feedback

```
outcomes:
  completed → strengths: "You carried it through"
              scaffolding: "independent"
  partial   → gaps: "Reasoning incomplete"
              guidance: "One targeted fix"
  stuck     → gaps: "Exceeds working range"
              guidance: "Worked example first"
```

### Assessment Feedback

```
results:
  demonstrated → scaffolding: "transfer" (vary surface)
  partial      → scaffolding: "guided" (targeted practice)
  not-demonstrated → scaffolding: "worked-example" (back to basics)
```

---

## Projections: Calculated Views

Three derived views rebuilt after significant events:

### 1. Progress

What's your status on each goal?

```
demonstrated  = passed assessment, no regression
needs-review  = failed after success OR active misconceptions
in-progress   = has some evidence
not-started   = no evidence
```

### 2. Review (Spaced Repetition)

When should you revisit?

```
demonstrated once → review in 1 day
demonstrated twice → review in 3 days
demonstrated 3x   → review in 7 days
demonstrated 4x+  → review in 14-30 days
```

### 3. Alignment

Does each goal have enough practice + assessment?

```
complete  = has practice AND assessment
partial   = has one or the other
missing   = has neither
suiteComplete = 2+ assessment formats (prevents pattern-matching)
```

---

## Storage: Where Things Live

```
~/.buddy/learner/
├── goals.json         # All learning goals
├── edges.json         # Goal relationships (prerequisite, builds-on, reinforces)
├── evidence.log       # Append-only log of everything
├── practice.json      # Templates + attempts
├── assessments.json  # Mastery checks
├── misconceptions.json
├── feedback.json
├── constraints.json   # Your preferences, time availability, etc.
└── projections/
    ├── progress.json
    ├── review.json
    └── alignment.json
```

Per-workspace context:

```
<project>/.buddy/context.json
```

---

## Module Structure

```
learner/
├── service.ts        # Main logic: observe, record, plan (1100 lines)
├── store.ts          # File I/O
├── projections.ts    # Progress, review, alignment calculations
├── sequencing.ts     # Goal edges, session planning
├── feedback.ts       # Feedback templates
├── query.ts         # Prompt digest, curriculum view
├── types.ts         # All schemas
├── path.ts          # File paths
├── tagging.ts       # Extract tags from text
└── tools/           # Agent-facing tools
    ├── query.ts            → learner_state_query
    ├── practice-record.ts  → practice_record
    └── assessment-record.ts → assessment_record
```

---

## Signal Detection Patterns (Exact Regex)

```typescript
// Detection
frustrationSignal: /\b(stuck|frustrated|confused|lost|not getting it)\b/
confusionSignal: /\b(confused|don't understand|not sure|unclear)\b/
masterySignal: /\b(i get it|makes sense|understand now|got it)\b/
completionClaim: /^(done|finished|complete|ready|next|move on)\b/
requestedExplanation: /\b(explain|what is|why|understand|walk me through)\b/
requestedPractice: /\b(practice|exercise|try one|give me a problem)\b/
requestedCheck: /\b(check|test me|assess|evaluate|am i right)\b/
```

---

## Goal Scoring (Session Planning)

```
score =
  +30  if has open feedback
  +20  if status = needs-review
  +15  if status = in-progress
  +10  if status = not-started
  +5   if coverage incomplete
  -50  if prerequisites not met
```

Activity selection:

```
status = not-started     → guided-practice
status = needs-review    → review (guided)
status = demonstrated    → mastery-check (transfer)
confidence = high        → independent-practice
confidence = low/medium  → guided-practice
```

---

## Limitations

1. **Heuristics only** — No ML. Regex patterns miss nuance.
2. **Single user** — No multi-learner support.
3. **Local files** — No sync/backup.
4. **Fixed intervals** — Spaced repetition uses fixed days, not adaptive.
5. **Auto edges** — Goal relationships auto-derived, not manually editable.

---

---

## Appendix: Complete Reference

### Service API (Full)

```typescript
LearnerService {
  // Context
  ensureWorkspaceContext(directory) → WorkspaceContext
  updateWorkspaceContext(directory, patch)
  updateLearnerConstraints(patch)

  // Reading
  readState() → LearnerState
  queryState(query) → filtered state

  // Observation
  observeLearnerMessage({ content, goalIds, sessionId, sourceMessageId })
  observeSessionSummary({ summary, outcome, goalIds, sessionId })

  // Recording
  recordPractice({ outcome, goalIds, learnerResponseSummary, ... })
  recordAssessment({ result, goalIds, format, summary, ... })
  recordFeedback({ strengths, gaps, guidance, requiredAction, ... })
  appendEvidence({ sourceType, outcome, summary, ... })

  // Projections
  rebuildProjections()

  // Planning
  getSessionPlan() → SessionPlan
  getCurriculumView() → LearnerCurriculumView
  queryForPrompt(query) → LearnerPromptDigest

  // Maintenance
  runSafetySweep()
}
```

---

### All Assessment Formats

```
concept-check     - Multiple choice / true-false
predict-outcome   - What happens if X?
debug-task        - Find and fix the bug
build-task        - Build something from scratch
review-task       - Review and critique code
explain-reasoning - Explain why something works
transfer-task     - Apply to new context
```

---

### All Scaffolding Levels

```
worked-example  - Show them how, then they replicate
guided          - Step-by-step with prompts
independent     - On their own
transfer        - Vary surface features, prevent pattern-matching
```

---

### All Surface Types

```
chat        - Conversational
curriculum  - Structured learning path
editor      - In-code exercises
figure     - Diagram-based
quiz       - Formal assessment
```

---

### Cognitive Levels (Bloom's Taxonomy)

```
Factual Knowledge → Comprehension → Application → Analysis → Synthesis → Evaluation
```

---

### Learner Constraints

```
background             - What they already know
knownPrerequisites    - Prior skills
availableTimePatterns - When they study
toolEnvironmentLimits - IDE/terminal constraints
motivationAnchors     - Why they're learning
opportunities         - Real projects to apply skills
learnerPreferences    - Learning style preferences
```

---

### Complete Feedback Template Logic

**Practice - Completed:**

```
strengths: "You carried the practice through to a full attempt"
gaps: "This was successful, but should transfer to less scaffolded variation"
guidance: "Tighten self-check so learner verifies why it worked"
requiredAction: "Do one transfer variation and explain what would break"
```

**Practice - Stuck:**

```
gaps: "The task currently exceeds the learner's independent working range"
guidance: "Switch to a worked example or guided practice"
requiredAction: "Work through one guided step, then retry independently"
pattern: "challenge exceeds current scaffolding level"
```

**Assessment - Demonstrated:**

```
strengths: "The learner produced evidence that matches mastery check"
scaffoldingLevel: "transfer" (vary surface features)
requiredAction: "Do one varied mastery check later to confirm transfer"
```

**Assessment - Not Demonstrated:**

```
gaps: "Learner has not yet demonstrated the goal"
scaffoldingLevel: "worked-example"
requiredAction: "Return to guided practice before another mastery check"
```

---

### Auto-Resolution Logic

```typescript
autoResolveFeedback(evidence) {
  if (evidence.outcome !== "positive" && "mixed") return  // Only positive/mixed triggers

  for each feedback where:
    - same workspace
    - status = "open"
    - same goalIds
    - feedback.createdAt < evidence.createdAt  // feedback came before evidence

    if evidence.outcome === "positive":
      feedback.status = "resolved"
      feedback.actedOnByEvidenceId = evidence.evidenceId
    if evidence.outcome === "mixed":
      feedback.status = "acted-on"
}
```

---

### Goal Edge Derivation

Edges auto-created based on:

1. **Concept tag overlap** - If goals share tags, relate them
2. **Cognitive level** - Lower level → prerequisite
3. **Foundation mentions** - If goal mentions "basics", "fundamentals", "intro" → prerequisite

```
Edge types:
- prerequisite   - Must complete first
- builds-on     - Next step after
- reinforces    - Same level, different angle
```

---

### Deduplication

Evidence uses SHA1 hash to prevent duplicates:

```typescript
dedupeKey = sha1(sessionId + sourceMessageId + normalizedContent)
```

---

### Observer Cursors

Tracks last processed message to support resumable observation:

```typescript
observerCursors: {
  lastProcessedSessionId: string
  lastProcessedMessageId: string
}
```

---

### Tool Parameters

**learner_state_query:**

```
persona?: "buddy" | "teacher" | ...
intent?: "learn" | "practice" | "assess" | ...
focusGoalIds?: string[]
```

**practice_record:**

```
goalIds: string[]
learnerResponseSummary: string
outcome: "assigned" | "partial" | "completed" | "stuck"
targetComponents?: string[]
difficulty?: "scaffolded" | "moderate" | "stretch"
surface?: "chat" | "curriculum" | "editor" | "figure" | "quiz"
addressedFeedbackIds?: string[]
```

**assessment_record:**

```
goalIds: string[]
format: "concept-check" | "debug-task" | "build-task" | ...
summary: string
result: "demonstrated" | "partial" | "not-demonstrated"
evidenceCriteria?: string[]
followUpAction?: string
```

---

### State Transitions

**Goal Status:**

```
not-started → in-progress → demonstrated → [needs-review] → demonstrated
                    ↓
              needs-review (if regression)
```

**Feedback Status:**

```
open → acted-on → resolved
      (partial)   (positive)
```

**Misconception Status:**

```
active → resolved (mastery evidence or manual)
```

---

## Future Enhancements

- **Knowledge Tracing (DKT/AKT)** — Replace heuristics with trained models
- **Affect Detection** — Use clickstream (time, hints, backtracking) not just text
- **Adaptive Spacing** — ML-tuned intervals
- **LLM Router** — Small LLM for ambiguous message classification
