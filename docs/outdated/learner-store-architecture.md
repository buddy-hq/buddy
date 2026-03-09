# Learner Store Architecture

> Secondary architecture note: this document explains the learner-store design and intent, but [buddy-core.spec.md](/Users/prashantbhudwal/Code/buddy/buddy-core.spec.md) is the canonical source of truth when wording or contracts differ.

This document defines how Buddy stores learning state after combining:

- the runtime teaching ontology
- the curriculum-system architecture
- the current notebook-local teaching workspace model

This replaces the earlier draft that mixed runtime teaching state and persistent learner state too freely.

---

## One Sentence Summary

Buddy has **three state domains**:

1. **Runtime teaching state**: what the tutor is doing _right now_ in this session
2. **Learner store**: cross-notebook canonical facts about the learner's goals, evidence, progress, and misconceptions
3. **Workspace state**: notebook-local project context and teaching artifacts

Everything else is a **derived view**.

---

## Core Principles

### 1. Notebook is a neutral workspace

A notebook/project directory is not a subject and not a curriculum container.

It is a workspace that provides:

- project files
- notebook-local teaching artifacts
- lightweight project context

The active teaching runtime decides how that workspace is used.

### 2. Learner knowledge belongs to the learner

Goals, evidence, misconceptions, and mastery do not belong to one notebook. They persist across projects.

### 3. Runtime teaching state is not learner state

These are different kinds of data:

- `persona`, `strategy`, `adaptivity`, `activity`, `scaffoldingLevel`, `surface`, `workspaceState`
  belong to the runtime session
- `goals`, `edges`, `evidence`, `assessments`, `misconceptions`
  belong to the learner store

### 4. Derived views are not canonical truth

These should be treated as projections or caches, not primary source data:

- curriculum sidebar view
- progress summaries
- review schedules
- alignment gaps
- session plans

### 5. Evidence first, summaries second

Background observers should prefer writing structured evidence and observations. Progress and review state should be derived from that evidence whenever practical.

---

## Canonical Runtime Terms

These terms come from the teaching ontology and stay outside the learner store.

```ts
type PersonaId = "buddy" | "code-buddy" | "math-buddy"

type InstructionalStrategyId =
  | "instruction"
  | "practice"
  | "assessment"

type AdaptivityId = "manual" | "adaptive"

type SurfaceId =
  | "chat"
  | "curriculum"
  | "editor"
  | "figure"
  | "quiz"

type WorkspaceState = "chat" | "interactive"

type ActivityKind =
  | "goal-setting"
  | "explanation"
  | "worked-example"
  | "guided-practice"
  | "independent-practice"
  | "mastery-check"
  | "review"
  | "reflection"

type ScaffoldingLevel =
  | "worked-example"
  | "guided"
  | "independent"
  | "transfer"
```

User-facing labels:

- `instruction` -> `Understand`
- `practice` -> `Practice`
- `assessment` -> `Check`
- `adaptive` -> `Auto`

---

## State Domains

### A. Runtime Teaching State

Per-session, mutable, short-lived.

```ts
type TeachingSessionState = {
  sessionId: string

  persona: PersonaId
  adaptivity: AdaptivityId

  selectedStrategy?: InstructionalStrategyId
  currentStrategy: InstructionalStrategyId

  currentActivity?: ActivityKind
  scaffoldingLevel?: ScaffoldingLevel

  currentSurface: SurfaceId
  workspaceState: WorkspaceState

  currentGoalIds: string[]
  currentTopicId?: string

  handoff?: HandoffSummary
  lastSwitchAt?: string
}
```

This state answers:

- who is teaching?
- how are they teaching right now?
- what activity is happening?
- what surface is active?

This state does **not** live in the learner store.

### B. Learner Store

Cross-notebook canonical learner facts.

```ts
type LearnerStore = {
  learnerId: string
  version: number
  updatedAt: string

  goals: GoalRecord[]
  edges: GoalEdge[]
  evidence: EvidenceRecord[]
  practiceTemplates: PracticeTemplate[]
  practiceAttempts: PracticeAttempt[]
  assessments: AssessmentRecord[]
  misconceptions: MisconceptionRecord[]
}
```

This state answers:

- what is the learner trying to learn?
- what have they demonstrated?
- what keeps going wrong?
- what relationships exist between goals?

### C. Workspace State

Notebook-local, project-situated data.

```ts
type WorkspaceContext = {
  workspaceId: string
  directory: string
  label: string
  tags: string[]
  pinnedGoalIds: string[]
  userOverride: boolean
  inferredAt?: string
  updatedAt: string
}
```

Notebook-local teaching artifacts stay here:

- lesson files
- checkpoints
- active editor/figure workspace state

### D. Derived Views

Computed from learner store + workspace context + runtime state.

Examples:

- progress summary
- review schedule
- alignment gaps
- curriculum surface view
- session plan

These may be cached, but are not the canonical source of truth.

---

## Learner Store Schema

### Goals

```ts
type GoalRecord = {
  goalId: string
  statement: string
  actionVerb: string
  task: string
  cognitiveLevel:
    | "knowledge"
    | "comprehension"
    | "application"
    | "analysis"
    | "synthesis"
    | "evaluation"
  scope: "course" | "topic"
  contextLabel: string

  conceptTags: string[]
  workspaceRefs: string[]
  artifactRefs: ArtifactRef[]

  createdAt: string
  archivedAt?: string
}
```

### Goal Relationships

```ts
type GoalEdge = {
  edgeId: string
  fromGoalId: string
  toGoalId: string
  relation: "prerequisite" | "builds-on" | "reinforces" | "transfers-to"
  confidence: number
  source: "user" | "agent" | "derived"
  createdAt: string
}
```

### Evidence

Evidence is the canonical write target for learning outcomes.

```ts
type EvidenceRecord = {
  evidenceId: string
  goalIds: string[]

  kind:
    | "practice-attempt"
    | "assessment-result"
    | "reflection"
    | "feedback-followthrough"
    | "session-summary"

  result:
    | "demonstrated"
    | "partial"
    | "not-demonstrated"
    | "struggling"
    | "improved"

  confidence: number
  summary: string

  misconceptionIds: string[]
  artifactRefs: ArtifactRef[]
  workspaceRefs: string[]

  sessionId?: string
  createdAt: string
}
```

### Practice

```ts
type PracticeTemplate = {
  templateId: string
  linkedGoalIds: string[]
  targetComponents: string[]
  difficulty: "guided" | "independent" | "transfer"
  format: "code-exercise" | "problem" | "worked-example"
  scaffoldingLevel: "high" | "medium" | "low" | "none"

  conceptTags: string[]
  workspaceRefs: string[]
  createdAt: string
}

type PracticeAttempt = {
  attemptId: string
  templateId: string
  goalIds: string[]
  sessionId: string
  workspaceId: string
  outcome: "completed" | "struggled" | "abandoned"
  evidenceSummary: string
  feedbackActedOn?: boolean
  artifactRefs: ArtifactRef[]
  createdAt: string
}
```

### Assessment

```ts
type AssessmentRecord = {
  assessmentId: string
  linkedGoalIds: string[]
  format:
    | "concept-check"
    | "predict-outcome"
    | "debug-task"
    | "build-task"
    | "review-task"
    | "explain-reasoning"
    | "transfer-task"

  result: "demonstrated" | "partial" | "not-demonstrated"
  summary: string

  misconceptionIds: string[]
  artifactRefs: ArtifactRef[]
  workspaceRefs: string[]
  sessionId?: string
  createdAt: string
}
```

### Misconceptions

```ts
type MisconceptionRecord = {
  misconceptionId: string
  description: string
  affectedGoalIds: string[]
  conceptTags: string[]
  firstSeenAt: string
  lastSeenAt: string
  occurrences: number
  resolved: boolean
  remediationNotes?: string
}
```

### Artifact References

Use stable IDs where possible, not absolute paths as identity.

```ts
type ArtifactRef = {
  kind: "session" | "message" | "file" | "exercise" | "assessment"
  id: string
  path?: string
}
```

---

## What Lives Outside The Learner Store

### Workspace-local files

```text
{project}/.buddy/
  context.json
  teaching/
    {sessionId}/
      lesson.ts
      checkpoint.ts
```

### `context.json`

This is a workspace filter hint, not a curriculum database.

```json
{
  "workspaceId": "ws_01hx...",
  "label": "Learning Tauri IPC and plugin architecture",
  "tags": ["tauri", "ipc", "permissions"],
  "pinnedGoalIds": [],
  "inferredAt": "2026-03-06T10:00:00Z",
  "updatedAt": "2026-03-06T10:00:00Z",
  "userOverride": false
}
```

This file helps scope the learner query. It does not define pedagogy or subject identity.

---

## Curriculum Surface

The `curriculum` sidebar surface is a **generated view** over:

- learner store
- workspace context
- runtime teaching state

This is the right place for:

- what to work on next
- active goals for this project
- review-due items
- suggested sequence

But this generated view is not necessarily the only project-local artifact.

Buddy may still keep an optional notebook-local `learning-plan.md` as:

- a human-readable view
- a user-editable project-specific plan
- an override or pinning layer

Canonical learner truth still lives in the learner store.

---

## Read Model

There are two legitimate read paths.

### 1. Prompt Injection

This is the default path for primary teaching agents.

```ts
type LearnerPromptQuery = {
  workspaceId: string
  persona: PersonaId
  strategy: InstructionalStrategyId
  activity?: ActivityKind
  currentGoalIds?: string[]
  tokenBudget: number
}
```

`LearnerService.queryForPrompt()` should:

1. read learner store
2. read workspace context
3. filter by workspace relevance, concept tags, pinned goals, and current goals
4. apply persona/strategy/activity shaping
5. emit a compressed summary under a hard token budget

The summary is intentionally lossy.

### 2. Narrow Read Facade

Primary agents should not get broad raw-store access, but the runtime should still expose one narrow read interface for scoped lookup.

Examples:

- `curriculum_state`
- `learner_state_query`

This avoids overloading prompt injection when the agent needs one more precise read.

---

## Write Model

Primary teaching agents should not write arbitrary learner-store state directly.

They should write through:

- curriculum subagents
- focused write-path tools
- background observers

### Preferred write rule

Write **evidence first** when possible.

Instead of immediately mutating a final progress summary:

- assessment writes assessment result
- observer writes evidence
- projections derive progress / review / alignment views

### Write paths

#### Companion / primary agents

- teach
- use notebook-local tools
- delegate curriculum changes

#### Write-path subagents

- goal-writer
- practice-agent
- assessment-agent
- curriculum planner / path composer

#### Background observers

- progress-tracker
- alignment-auditor
- review-scheduler

---

## Service Layer

```text
packages/buddy/src/learning/learner/
  path.ts
  types.ts
  store.ts
  service.ts
  query.ts
  projections.ts
```

### Store layout

Do not start with one giant `learner.json`.

Start with partitioned files:

```text
~/.buddy/learner/
  meta.json
  goals.json
  edges.json
  evidence.log
  practice.json
  assessments.json
  misconceptions.json
  projections/
    progress.json
    review.json
    alignment.json
```

This keeps writes smaller and reduces semantic collisions.

### Core methods

```ts
LearnerService.queryForPrompt(input: LearnerPromptQuery)
LearnerService.queryState(input: LearnerStateQuery)

LearnerService.writeGoals(goals)
LearnerService.writeEdges(edges)
LearnerService.appendEvidence(evidence)
LearnerService.writePracticeTemplates(templates)
LearnerService.writePracticeAttempts(attempts)
LearnerService.writeAssessments(assessments)
LearnerService.writeMisconceptions(misconceptions)

LearnerService.rebuildProgressProjection()
LearnerService.rebuildReviewProjection()
LearnerService.rebuildAlignmentProjection()
```

---

## Projection Layer

These are derived from canonical facts.

### Progress projection

Derived from:

- evidence
- assessment results
- practice attempts

Example shape:

```ts
type GoalProgressView = {
  goalId: string
  status: "not-started" | "in-progress" | "demonstrated" | "needs-review"
  confidence: number
  lastAssessedAt?: string
  nextReviewAt?: string
  evidenceIds: string[]
}
```

### Alignment projection

Derived from:

- goals
- practice templates
- assessments

### Review projection

Derived from:

- progress view
- evidence timing
- spaced retrieval policy

---

## Concurrency Model

Single-user does not mean “ignore concurrency”.

Buddy can still have:

- multiple sessions
- background observers
- explicit assessment writes

### v1 rule

- writes are per-file, not monolithic
- each file has a `version`
- write path uses:
  1. read current file
  2. validate version
  3. merge change
  4. write temp file
  5. atomic rename

### Evidence log

For high-frequency updates, prefer append-like writes or idempotent event writes over mutating summary state directly.

### Observer idempotency

Background observers must store cursors such as:

- `lastProcessedSessionId`
- `lastProcessedMessageId`

This prevents duplicate evidence when the observer runs at session end and again in a safety sweep.

---

## Integration With Current Buddy

### What changes

- `composeLearningSystemPrompt()` stops reading notebook-local goals and curriculum directly as canonical truth
- a new `LearnerService.queryForPrompt()` becomes the primary learner-state read path
- notebook-local teaching workspace stays as-is

### What current services become

#### `CurriculumService`

Today it owns project-local canonical markdown.

Under this architecture it should become one of:

- a facade over a generated curriculum view
- an optional workspace-local learning plan service

It should no longer be the canonical learner store.

#### `goals-v1`

Today it owns notebook-local goals.

Under this architecture:

- canonical goal records move into learner store
- existing goal-writing tools write via `LearnerService`
- old files can be read only as migration input or temporary compatibility input

#### Teaching workspace services

No change in ownership.

These remain notebook-local because they are project-situated artifacts.

---

## Query Scoping Rules

This is the critical part of the design.

Cross-notebook awareness is only useful if relevance filtering is explicit.

### Required relevance signals

- `workspaceId`
- workspace `tags`
- `pinnedGoalIds`
- `conceptTags` on goals, evidence, and misconceptions
- explicit `goalRefs` when a session already has active goals

### Nice-to-have later

- inferred semantic similarity
- transfer suggestions across domains
- multi-hop graph traversal

### Important rule

Do not rely on one free-text notebook label to determine relevance.

`context.json` helps scope the query, but it is not enough by itself.

---

## Runtime Compilation Join Point

The learner store should join the teaching runtime here:

```ts
compileRuntimeProfile({
  persona,
  strategy,
  activity,
  workspaceState,
  learnerPromptDigest,
  workspaceContext,
})
```

That means the runtime compiler consumes a digest from the learner store, not the raw store itself.

---

## Implementation Stance

Buddy was cut over to this architecture in one breaking pass.

This document is descriptive now rather than a migration plan:

- learner truth lives in the learner store
- workspace context stays notebook-local
- runtime teaching state stays session-local
- projections remain rebuildable outputs
- explicit writes plus the in-process safety sweep keep learner state current

---

## Final Architecture

### Runtime plane

- persona
- strategy
- adaptivity
- activity
- scaffolding
- surface
- workspaceState

### Data plane

- learner store as canonical cross-notebook learner model
- workspace context as notebook-local filter and artifact owner

### Projection plane

- curriculum surface
- progress summaries
- alignment gaps
- review schedules
- session plans

This is the architecture Buddy should optimize for.
