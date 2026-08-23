# Buddy Core Specification

Status: canonical product and implementation spec

This document is the source of truth for Buddy's core architecture going forward.

It defines:

- the runtime teaching ontology
- the learner storage model
- the workspace-local model
- the read/write/query pipeline
- the agent and subagent roles
- the implementation boundaries inside the current Buddy codebase

If future docs conflict with this file, this file wins unless explicitly replaced.

---

## 1. Scope

This spec covers Buddy's learning system at the product and implementation level.

It covers:

- teaching runtime concepts
- canonical learner state
- notebook-local workspace state
- derived views and projections
- prompt injection and query rules
- write paths and background observers
- persona/strategy/adaptivity terminology
- integration with the current Buddy + vendored OpenCode architecture

It does not attempt to fully specify:

- UI visuals
- exact prompt wording
- every subagent prompt
- final database migration mechanics

---

## 2. Assumptions

These assumptions are part of the architecture.

### 2.1 Single user

Buddy is a single-OS-user system. There is one learner store per OS user.

### 2.2 Local-first

Buddy runs locally by default, but may use networked models and services. The learner store is still treated as local canonical state.

### 2.3 Breaking changes are allowed

Backward compatibility is not a design requirement for the current phase.

### 2.4 Vendored OpenCode remains the execution core

Buddy should continue to execute core runtime behavior through vendored OpenCode modules.

Buddy-owned logic should stay in Buddy-owned layers:

- teaching ontology
- learner store
- curriculum logic
- prompt shaping
- product-specific routing and surfaces

Do not design this system assuming direct patches to `vendor/opencode/packages/opencode/**`.

---

## 3. Core Principles

### 3.1 Notebook is a neutral workspace

A notebook or project directory is not a subject, not a curriculum container, and not the owner of learner knowledge.

A notebook provides:

- project files
- notebook-local teaching artifacts
- lightweight workspace context

### 3.2 Learner knowledge belongs to the learner

Goals, evidence, misconceptions, and mastery persist across notebooks.

### 3.3 Runtime teaching state is not learner state

What the tutor is doing right now is not the same as what the learner knows across time.

### 3.4 Goals anchor everything

Goals define what the learner is trying to be able to do.

Practice, assessment, feedback, sequencing, and alignment all attach back to goals.

### 3.5 Practice is the primary learning engine

Practice is the default next step after goal-setting or explanation unless evidence, review pressure, or constraints make another move more appropriate.

### 3.6 Assessment generates evidence and feedback

Assessment exists to gather evidence and select the next action.

It is not a separate grading product or a detached exam flow.

### 3.7 Feedback is a required-action loop

Feedback is not just commentary.

It must produce guidance plus a required follow-up action and remain visible until later evidence resolves it.

### 3.8 Constraints and opportunities are first-class inputs

Buddy plans and teaches against:

- learner-level constraints and opportunities
- workspace-local constraints and opportunities
- motivation and relevance anchors

### 3.9 Derived views are not canonical truth

Progress summaries, curriculum surfaces, review schedules, alignment summaries, and session plans are projections over canonical facts.

### 3.10 Evidence first

When possible, write structured evidence and observations first. Derive progress and review state from those facts.

### 3.11 One strategy at a time

Buddy does not run a giant mixed prompt that simultaneously behaves as explainer, practice coach, and assessor.

For any given turn, Buddy compiles one concrete runtime profile from:

- persona
- strategy
- activity
- workspace state
- learner digest

### 3.12 Product language must stay simple

Internal architecture can be rich. User-facing affordances should stay minimal.

---

## 4. Canonical Terminology

These names are canonical.

### 4.1 Runtime teaching ontology

- `persona`
  Who is teaching and what domain/surface/tool world they belong to.

- `instructionalStrategy`
  How the tutor is teaching in this interaction.

- `adaptivity`
  Whether the strategy is user-selected or system-selected.

- `activity`
  The concrete pedagogical move happening right now.

- `scaffoldingLevel`
  How much support is being given.

- `surface`
  Which UI surface is active.

- `workspaceState`
  Whether an interactive teaching workspace exists.

### 4.2 Curriculum capability ontology

These are curriculum system capabilities, not top-level user modes:

- goal-setting
- practice-generation
- assessment-generation
- feedback-generation
- progress-tracking
- sequencing
- alignment

### 4.3 Storage ontology

- `learner store`
  Cross-notebook canonical learner state.

- `workspace context`
  Notebook-local project-level filter and metadata.

- `teaching workspace`
  Notebook-local lesson/checkpoint/editor artifacts.

- `projection`
  Derived view over canonical state.

---

## 5. Canonical Types

### 5.1 Runtime teaching types

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

### 5.2 User-facing labels

Internal IDs and user-facing labels intentionally differ in a few places.

- `instruction` -> `Understand`
- `practice` -> `Practice`
- `assessment` -> `Check`
- `adaptive` -> `Auto`

Rationale:

- `understand` is a learner outcome, not a good internal runtime term
- `assessment` is the correct pedagogy term internally
- `Check` is the simpler product affordance

---

## 6. Architectural Layers

Buddy core is organized into five layers.

### 6.1 Runtime teaching layer

Owns:

- persona
- strategy
- adaptivity
- activity
- scaffolding
- surface
- workspaceState
- switching
- runtime profile compilation

### 6.2 Curriculum capability layer

Owns:

- goal logic
- practice logic
- assessment logic
- feedback logic
- progress observation
- sequencing
- alignment

### 6.3 Canonical data layer

Owns:

- learner store
- notebook-local workspace context
- notebook-local teaching artifacts

### 6.4 Projection layer

Owns:

- progress summaries
- curriculum surface view
- review schedule
- alignment gap summaries
- session planning summaries

### 6.5 UI layer

Owns:

- persona selector
- strategy selector
- Auto toggle
- dynamic surfaces

The UI layer does not own pedagogy or learner truth.

---

## 7. State Domains

Buddy has three state domains and one projection domain.

### 7.1 Runtime teaching state

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

  handoff?: HandoffSummary
}
```

This state does not live in the learner store.

### 7.2 Learner store

Cross-notebook canonical learner facts.

```ts
type LearnerStore = {
  meta: LearnerMeta
  goals: GoalRecord[]
  edges: GoalEdge[]
  evidence: EvidenceRecord[]
  practiceTemplates: PracticeTemplate[]
  practiceAttempts: PracticeAttempt[]
  assessments: AssessmentRecord[]
  misconceptions: MisconceptionRecord[]
  constraints: LearnerConstraints
  feedback: FeedbackRecord[]
  projections: {
    progress: ProgressRecord[]
    review: ReviewRecord[]
    alignment: AlignmentRecord[]
  }
}
```

### 7.3 Workspace state

Notebook-local project context and situated artifacts.

```ts
type WorkspaceContext = {
  workspaceId: string
  label: string
  tags: string[]
  pinnedGoalIds: string[]
  projectConstraints: string[]
  localToolAvailability: string[]
  preferredSurfaces: SurfaceId[]
  motivationContext?: string
  opportunities: string[]
  userOverride: boolean
  createdAt: string
  updatedAt: string
}
```

Teaching workspace artifacts are notebook-local:

- lesson files
- checkpoints
- active interactive teaching files

### 7.4 Derived projections

Derived from learner store + workspace context + runtime teaching state.

Examples:

- progress summary
- review schedule
- alignment summary
- curriculum surface
- session plan
- open feedback actions
- constraints summary

These are not canonical truth.

---

## 8. Runtime Ontology

### 8.1 Personas

Personas are domain wrappers.

Canonical personas:

- `buddy`
- `code-buddy`
- `math-buddy`

Persona controls:

- base voice and domain stance
- default surfaces
- allowed strategies
- domain-specific tool defaults
- domain-specific context shaping

### 8.2 Instructional strategies

Strategies are the top-level teaching stance.

Canonical strategies:

- `instruction`
- `practice`
- `assessment`

Important rule:

- `feedback` is not a top-level strategy
- `progress` is not a top-level strategy
- `alignment` is not a top-level strategy
- `sequencing` is not a top-level strategy

Those are curriculum capabilities or derived systems, not primary user-facing teaching stances.

### 8.3 Activities

Activities refine strategy.

Examples:

- `instruction + explanation`
- `instruction + worked-example`
- `practice + guided-practice`
- `practice + independent-practice`
- `assessment + mastery-check`
- `assessment + review`

This keeps `strategy` broad and avoids overloading it.

### 8.4 Scaffolding level

Scaffolding is orthogonal to strategy and activity.

Examples:

- `guided-practice + guided`
- `guided-practice + independent`
- `mastery-check + transfer`

### 8.5 Surfaces

Surfaces are UI affordances, not strategies.

Canonical surfaces:

- `chat`
- `curriculum`
- `editor`
- `figure`
- `quiz`

### 8.6 Workspace state

Workspace state describes whether an interactive teaching artifact exists.

- `chat`
- `interactive`

It is not a teaching strategy.

---

## 9. Runtime Definitions

### 9.1 Persona definition

```ts
type PersonaDefinition = {
  id: PersonaId
  label: string
  description: string
  domain: "general" | "coding" | "math"

  runtimeAgent: PersonaId

  allowedStrategies: InstructionalStrategyId[]
  defaultStrategy: InstructionalStrategyId

  surfaces: Array<"curriculum" | "editor" | "figure">
  defaultSurface: "curriculum" | "editor" | "figure"
  hidden: boolean

  toolDefaults: ToolDelta
  subagentDefaults: SubagentDelta

  contextPolicy: {
    attachCurriculum: boolean
    attachProgress: boolean
    attachTeachingWorkspace: boolean
    attachTeachingPolicy: boolean
    attachFigureContext: boolean
  }
}
```

### 9.2 Strategy definition

```ts
type StrategyDefinition = {
  id: InstructionalStrategyId
  label: string
  userLabel: string

  promptLayer: string
  teachingContract: TeachingContract

  defaultActivities: ActivityKind[]

  toolDelta: ToolDelta
  subagentDelta: SubagentDelta

  switchPolicy: {
    canEnterSoft: boolean
    canEnterHard: boolean
    preferHardWhen?: SwitchTrigger[]
    requiresHandoff: boolean
  }
}
```

### 9.3 Activity definition

```ts
type ActivityDefinition = {
  kind: ActivityKind
  strategy: InstructionalStrategyId

  defaultScaffoldingLevel: ScaffoldingLevel
  allowedSurfaces?: SurfaceId[]

  promptLayerRef?: string
  toolDelta?: ToolDelta
  subagentDelta?: SubagentDelta
}
```

### 9.4 Teaching contract

This replaces vague output style flags.

```ts
type TeachingContract = {
  advanceRule:
    | "never"
    | "after-learner-confirmation"
    | "after-verified-mastery"

  explanationPolicy:
    | "minimal"
    | "conceptual"
    | "worked-example"
    | "analogy-friendly"

  exercisePolicy:
    | "never"
    | "on-request"
    | "prefer-guided"
    | "prefer-independent"

  assessmentPolicy:
    | "none"
    | "informal-check"
    | "formative"
    | "summative"

  feedbackPolicy:
    | "hint-first"
    | "socratic"
    | "direct-correction"
    | "rubric-based"

  contextPolicy:
    | "preserve-session-context"
    | "compact-before-switch"
    | "hard-switch-inline"
}
```

### 9.5 Tool and subagent deltas

Use strongly typed deltas, not free-form string blobs.

```ts
type ToolId = RegisteredToolId
type ToolAccess = "inherit" | "allow" | "deny"
type ToolDelta = Partial<Record<ToolId, ToolAccess>>

type SubagentId =
  | "curriculum-orchestrator"
  | "goal-writer"
  | "practice-agent"
  | "assessment-agent"
  | "feedback-engine"
  | "progress-tracker"
  | "sequencer"
  | "alignment-auditor"
  | "exercise-author"
  | "analogy-author"
  | "hint-generator"
  | "rubric-grader"
  | "solution-checker"

type SubagentAccess = "inherit" | "allow" | "deny" | "prefer"
type SubagentDelta = Partial<Record<SubagentId, SubagentAccess>>
```

`RegisteredToolId` means the compile-time union of Buddy/OpenCode tool IDs exposed through the actual runtime registry.

Important distinction:

- registered delegated subagents are `curriculum-orchestrator`, `goal-writer`, `practice-agent`, and `assessment-agent`
- the remaining IDs are helper/service preference labels used by the runtime compiler and prompt shaping
- they are not separate user-facing personas

### 9.6 Prompt digest and injection types

```ts
type LearnerPromptDigest = {
  coldStart: boolean
  workspaceLabel: string
  workspaceTags: string[]
  relevantGoalIds: string[]
  recommendedNextAction: ActivityKind
  constraintsSummary: string[]
  openFeedbackActions: string[]
  sessionPlanSummary: string[]
  alignmentSummary: string[]
  tier1: string[]
  tier2: string[]
  tier3: string[]
}

type ContextInjection =
  | { kind: "curriculum-summary"; text: string }
  | { kind: "progress-summary"; text: string }
  | { kind: "workspace-summary"; text: string }
  | { kind: "teaching-policy"; text: string }
  | { kind: "switch-handoff"; text: string }
  | { kind: "assessment-constraints"; text: string }
```

---

## 10. Runtime Profile Compilation

Buddy should not hand-author every effective persona x strategy x activity combination as a separate primary agent.

Instead, Buddy compiles a concrete runtime profile for the current turn.

### 10.1 Compile input

```ts
type CompileRuntimeProfileInput = {
  persona: PersonaDefinition
  strategy: InstructionalStrategyId
  activity?: ActivityKind
  workspaceState: WorkspaceState

  learnerDigest: LearnerPromptDigest
  handoff?: HandoffSummary
}
```

### 10.2 Compile output

```ts
type RuntimeProfile = {
  key: `${PersonaId}:${InstructionalStrategyId}`

  persona: PersonaId
  strategy: InstructionalStrategyId
  activity: ActivityKind
  scaffoldingLevel: ScaffoldingLevel

  runtimeAgent: PersonaId

  effectiveTools: Record<ToolId, "allow" | "deny">
  effectiveSubagents: Record<SubagentId, "allow" | "deny" | "prefer">

  visibleSurfaces: Array<"curriculum" | "editor" | "figure">
  defaultSurface: "curriculum" | "editor" | "figure"

  contextInjections: ContextInjection[]
  teachingContract: TeachingContract
}
```

### 10.3 Compile rules

Compilation must:

1. start from persona defaults
2. apply strategy layers and deltas
3. apply activity layers and deltas
4. apply workspace-state gating
5. inject learner digest
6. inject workspace context
7. inject teaching workspace context when available
8. produce exactly one concrete effective profile

---

## 11. Switching Model

### 11.1 Switch targets

```ts
type SwitchTarget = {
  persona?: PersonaId
  strategy?: InstructionalStrategyId
  surface?: SurfaceId
  workspaceState?: WorkspaceState
}
```

### 11.2 Switch kinds

```ts
type SwitchKind = "soft" | "hard" | "recommendation"
```

### 11.3 Switch triggers

```ts
type SwitchTrigger =
  | "learner-request"
  | "goal-state-change"
  | "stuck-detection"
  | "mastery-suspected"
  | "assessment-isolation"
  | "surface-requirement"
  | "persona-domain-mismatch"
  | "context-pollution-risk"
```

### 11.4 Rules

Soft switch by default:

- strategy change within same persona
- activity change
- surface change within same work context
- scaffolding change

Hard switch by default:

- cross-domain persona change
 - inline assessment isolation when the current context is dragging the session off course
- severe context pollution risk

Recommendation instead of automatic switch:

- low-confidence adaptive decisions
- learner-agency-sensitive moments
- exploratory topic jumps

### 11.5 Persona switch

Persona switch is allowed.

It is heavier than strategy switch.

Rule of thumb:

- strategy switch changes how the tutor teaches
- persona switch changes who is teaching and which domain world they operate in

### 11.6 Handoff summary

Real switches must generate a compact handoff summary.

```ts
type HandoffSummary = {
  from: {
    persona: PersonaId
    strategy: InstructionalStrategyId
    activity?: ActivityKind
  }
  to: {
    persona: PersonaId
    strategy: InstructionalStrategyId
    activity?: ActivityKind
  }
  reason: SwitchTrigger

  goalIds: string[]

  learnerState: {
    strengths: string[]
    misconceptions: string[]
    frustrationSignals: string[]
  }
  progressState: {
    acceptedWork: string[]
    pendingWork: string[]
    evidenceRefs: string[]
  }
  summaryText: string
}
```

The handoff summary is a runtime injection, not canonical learner truth.

Hard switches stay inline in the same chat session. Buddy does not automatically fork a new thread.

---

## 12. Adaptivity Model

`adaptive` is a controller, not a giant blended strategy.

For any given turn:

1. the router evaluates learner signals and current state
2. the router chooses one strategy and optionally one activity
3. Buddy compiles one runtime profile
4. if the strategy changed, Buddy emits a handoff

### 12.1 Adaptive decision

```ts
type AdaptiveDecision = {
  nextStrategy: InstructionalStrategyId
  nextActivity?: ActivityKind
  nextScaffoldingLevel?: ScaffoldingLevel

  action: "stay" | "soft-switch" | "hard-switch" | "recommend-switch"
  reason: SwitchTrigger
  confidence: number
}
```

### 12.2 Learner signals

```ts
type LearnerSignals = {
  requestedExplanation?: boolean
  requestedPractice?: boolean
  requestedCheck?: boolean

  completionClaim?: boolean
  frustrationSignal?: boolean
  confusionSignal?: boolean
  masterySignal?: boolean

  repeatedFailureCount: number
  consecutiveSuccessCount: number
}
```

### 12.3 Delivery policy

Current implementation ships both:

- `manual`
- deterministic rule-first `adaptive`

The router may emit:

- `stay`
- `soft-switch`
- `hard-switch`
- `recommend-switch`

---

## 13. Agent and Subagent Roles

### 13.1 Primary teaching agents

These are the user-facing runtime personas:

- `buddy`
- `code-buddy`
- `math-buddy`

They:

- receive learner digest as context
- teach through their runtime profile
- use notebook-local tools
- delegate curriculum work

They should not arbitrarily mutate the learner store.

### 13.2 Real delegated subagents

These are the actual delegated subagents in the runtime:

- curriculum orchestrator
- goal writer
- practice agent
- assessment agent

### 13.3 Curriculum services and engines

These are Buddy-owned services, not chatty user-facing agents:

- feedback engine
- progress tracker
- sequencer
- alignment auditor

### 13.4 Important distinction

`assessment` as a runtime strategy is not the same thing as `assessment-agent` as an implementation role.

Likewise:

- runtime `practice` is not the same thing as `practice-agent`
- runtime `instruction` is not the same thing as `goal-setting` or `feedback-engine`

---

## 14. Learner Store

The learner store is the canonical cross-notebook learner model.

It stores facts, not just summaries.

### 14.1 Canonical entities

#### Goals

```ts
type GoalRecord = {
  goalId: string
  setId: string
  learnerRequest: string
  statement: string
  actionVerb: string
  task: string
  cognitiveLevel:
    | "Factual Knowledge"
    | "Comprehension"
    | "Application"
    | "Analysis"
    | "Synthesis"
    | "Evaluation"
  scope: "course" | "topic"
  contextLabel: string
  howToTest: string

  assumptions: string[]
  openQuestions: string[]
  conceptTags: string[]
  workspaceRefs: string[]

  createdAt: string
  archivedAt?: string
}
```

#### Goal edges

```ts
type GoalEdge = {
  edgeId: string
  fromGoalId: string
  toGoalId: string
  type: "prerequisite" | "builds-on" | "reinforces"
  createdAt: string
}
```

#### Evidence

Evidence is the preferred canonical outcome write target.

```ts
type EvidenceRecord = {
  evidenceId: string
  goalIds: string[]
  workspaceId: string
  sessionId?: string
  sourceMessageId?: string
  sourceType: "practice" | "assessment" | "learner-message" | "teacher-observation"
  summary: string
  outcome: "positive" | "mixed" | "negative" | "neutral"
  misconceptionIds: string[]
  dedupeKey?: string
  createdAt: string
}
```

#### Practice

```ts
type PracticeTemplate = {
  templateId: string
  goalIds: string[]
  workspaceId: string
  prompt: string
  targetComponents: string[]
  difficulty: "scaffolded" | "moderate" | "stretch"
  scenario?: string
  taskConstraints: string[]
  deliverable?: string
  selfCheck?: string
  whyItMatters?: string
  surface?: SurfaceId
  createdAt: string
}

type PracticeAttempt = {
  attemptId: string
  templateId?: string
  goalIds: string[]
  workspaceId: string
  sessionId?: string
  learnerResponseSummary: string
  outcome: "assigned" | "partial" | "completed" | "stuck"
  targetComponents: string[]
  surface?: SurfaceId
  addressedFeedbackIds: string[]
  createdAt: string
}
```

#### Assessments

```ts
type AssessmentRecord = {
  assessmentId: string
  goalIds: string[]
  workspaceId: string
  sessionId?: string
  format:
    | "concept-check"
    | "predict-outcome"
    | "debug-task"
    | "build-task"
    | "review-task"
    | "explain-reasoning"
    | "transfer-task"
  summary: string
  result: "demonstrated" | "partial" | "not-demonstrated"
  learnerResponseSummary?: string
  evidenceCriteria: string[]
  followUpAction?: string
  createdAt: string
}
```

#### Misconceptions

```ts
type MisconceptionRecord = {
  misconceptionId: string
  goalIds: string[]
  workspaceId: string
  summary: string
  status: "active" | "resolved"
  createdAt: string
  updatedAt: string
}
```

#### Constraints and opportunities

```ts
type LearnerConstraints = {
  background: string[]
  knownPrerequisites: string[]
  availableTimePatterns: string[]
  toolEnvironmentLimits: string[]
  motivationAnchors: string[]
  opportunities: string[]
  learnerPreferences: string[]
  updatedAt: string
}
```

#### Feedback

```ts
type FeedbackRecord = {
  feedbackId: string
  goalIds: string[]
  workspaceId: string
  sessionId?: string
  sourceAttemptId?: string
  sourceAssessmentId?: string
  sourceType: "practice" | "assessment" | "reflection" | "teacher-observation"
  strengths: string[]
  gaps: string[]
  guidance: string[]
  requiredAction: string
  scaffoldingLevel: ScaffoldingLevel
  pattern?: string
  status: "open" | "acted-on" | "resolved"
  actedOnByEvidenceId?: string
  actedOnAt?: string
  createdAt: string
  updatedAt: string
}
```

### 14.2 Stable identifiers

Canonical records must use stable IDs.

Do not use absolute filesystem paths as identity.

Paths may exist as metadata, not primary identity.

---

## 15. Workspace-Local State

Notebook-local state owns project-situated context and artifacts.

### 15.1 Workspace context file

`{project}/.buddy/context.json`

```json
{
  "workspaceId": "ws_01hx...",
  "label": "Learning Tauri IPC and plugin architecture",
  "tags": ["tauri", "ipc", "permissions"],
  "pinnedGoalIds": [],
  "projectConstraints": [],
  "localToolAvailability": ["package.json"],
  "preferredSurfaces": ["editor"],
  "motivationContext": "Ship a working plugin integration for the current project.",
  "opportunities": [],
  "createdAt": "2026-03-06T10:00:00Z",
  "updatedAt": "2026-03-06T10:00:00Z",
  "userOverride": false
}
```

This file is:

- a filter hint for learner queries
- a lightweight workspace metadata artifact

It is not:

- a subject binding
- a curriculum database
- the owner of learner progress

### 15.2 Teaching workspace artifacts

Notebook-local teaching artifacts remain project-local.

Example:

```text
{project}/.buddy/
  context.json
  teaching/
    {sessionId}/
      lesson.ts
      checkpoint.ts
```

This matches the fact that editor-based lessons work with project files.

---

## 16. Projections and Views

The following are derived views over canonical state.

### 16.1 Progress projection

Derived from:

- evidence
- assessments
- practice attempts
- misconceptions
- feedback follow-through

Example:

```ts
type ProgressRecord = {
  goalId: string
  status: "not-started" | "in-progress" | "demonstrated" | "needs-review"
  confidence: "low" | "medium" | "high"
  evidenceRefs: string[]
  misconceptions: string[]
  reviewCount: number
  lastDemonstratedAt?: string
  lastWorkedAt?: string
  nextReviewAt?: string
  updatedAt: string
}
```

### 16.2 Alignment projection

Derived from:

- goals
- practice templates
- assessments

### 16.3 Review projection

Derived from:

- progress projection
- evidence timing
- spaced retrieval policy

### 16.4 Curriculum surface projection

Generated from:

- learner store
- workspace context
- runtime state

The curriculum sidebar is a generated view, not the canonical learner store.

### 16.5 Session plan projection

Generated from:

- learner state
- workspace context
- open feedback actions

### 16.6 Alignment summary and open feedback projections

The curriculum view also exposes:

- alignment summary
- open feedback actions
- constraints summary

---

## 17. Read Model

There are two valid read paths.

### 17.1 Prompt injection path

Default path for primary teaching agents.

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

`LearnerService.queryForPrompt()` must:

1. read canonical learner state
2. read workspace context
3. filter by relevance
4. shape results for persona + strategy + activity
5. emit a lossy digest under a token budget

### 17.2 Narrow read facade

The runtime may expose one safe read tool or facade for precise lookups.

Examples:

- `curriculum_state`
- `learner_state_query`

This is preferable to granting broad raw-store access.

### 17.3 Important rule

Do not rely on one free-text workspace label to determine relevance.

Prompt query scoping must use:

- workspaceId
- workspace tags
- pinned goal IDs
- concept tags
- current goal IDs when available

Semantic similarity may be added later, but must not be the only scoping mechanism.

---

## 18. Prompt Query Budgeting

Prompt injection is intentionally lossy.

`queryForPrompt()` should use a tiered token budget.

### 18.1 Tier 1

Always include:

- active relevant goals
- short progress summary
- active misconceptions
- open feedback actions when present

### 18.2 Tier 2

Include if budget allows:

- review-due goals
- recent practice outcomes
- suggested session focus
- constraints and opportunities summary

### 18.3 Tier 3

Include only if strongly relevant and budget allows:

- deeper alignment recommendations
- motivation hooks
- longer historical evidence summaries

The full learner store remains available to projections and controlled read facades.

---

## 19. Write Model

### 19.1 Primary rule

Primary teaching agents do not write arbitrary learner state directly.

They:

- teach
- use notebook-local tools
- delegate curriculum work

### 19.2 Write paths

Canonical learner-state writes happen through:

- write-path subagents
- focused learner service methods
- background observers

### 19.3 Preferred write target

Where possible, write:

- evidence
- assessments
- misconceptions
- practice attempts

Then derive:

- progress
- review
- alignment summaries

### 19.4 Direct summary mutation

Direct writes to derived projections should be avoided unless explicitly treated as cache rebuild output.

---

## 20. Agent Responsibilities

### 20.1 Primary teaching personas

- `buddy`
- `code-buddy`
- `math-buddy`

Responsibilities:

- receive learner digest
- teach using compiled runtime profile
- use notebook-local workspace tools
- delegate curriculum work

### 20.2 Curriculum orchestrator

Coordinates curriculum actions and context routing.

### 20.3 Goal agent

Historical term. Current runtime uses `goal-writer`.

### 20.4 Goal writer

Owns:

- goal creation
- goal refinement
- goal linting
- goal commits

### 20.5 Practice agent

Owns:

- practice generation
- practice validation
- practice template creation

Practice should carry goal linkage, expert-thinking targets, realistic context, deliverable, self-check, and why-it-matters context.

### 20.6 Assessment agent

Owns:

- mastery-check generation
- structured assessment recording

Assessment should carry evidence criteria and follow-up action.

### 20.7 Feedback engine

Owns:

- structured feedback generation
- required-action tracking
- feedback follow-through state

Feedback is not a primary strategy toggle.

### 20.8 Progress tracker

Owns evidence-first progress rebuilding, review scheduling, and safety-sweep observation.

### 20.9 Sequencer

Owns sequencing projections and next-step recommendations.

### 20.10 Alignment auditor

Owns structural goal/practice/assessment alignment checks.

---

## 21. Service Layer

Buddy should own a learner service package.

Recommended location:

```text
packages/buddy/src/learning/learner/
  path.ts
  types.ts
  store.ts
  feedback.ts
  sequencing.ts
  service.ts
  query.ts
  projections.ts
```

### 21.1 Core methods

```ts
LearnerService.queryForPrompt(input: LearnerPromptQuery)
LearnerService.queryState(input: LearnerStateQuery)

LearnerService.ensureWorkspaceContext(directory)
LearnerService.updateWorkspaceContext(directory, patch)
LearnerService.updateLearnerConstraints(patch)

LearnerService.commitGoals(input)
LearnerService.writeEdges(edges)
LearnerService.writePracticeTemplates(templates)
LearnerService.writePracticeAttempts(attempts)
LearnerService.writeAssessments(assessments)
LearnerService.writeMisconceptions(misconceptions)
LearnerService.writeFeedback(records)

LearnerService.appendEvidence(evidence)
LearnerService.recordPractice(input)
LearnerService.recordAssessment(input)
LearnerService.recordFeedback(input)
LearnerService.markFeedbackActedOn(input)
LearnerService.observeLearnerMessage(input)
LearnerService.observeSessionSummary(input)

LearnerService.rebuildProgressProjection()
LearnerService.rebuildReviewProjection()
LearnerService.rebuildAlignmentProjection()
LearnerService.rebuildProjections()
LearnerService.getSessionPlan(directory, query)
LearnerService.getCurriculumView(directory, query)
LearnerService.runSafetySweep()
```

### 21.2 Query state type

```ts
type LearnerStateQuery = {
  workspaceId?: string
  goalIds?: string[]
  conceptTags?: string[]
  includeDerived?: boolean
}
```

### 21.3 Backend API surface

The service interface is internal. Buddy should also expose a UI-facing HTTP surface.

Recommended read endpoints:

- `GET /api/learner/state`
  Full learner state or scoped learner state for dashboards and debugging
- `GET /api/learner/goals`
  Goal records, optionally scoped by workspace or concept
- `GET /api/learner/progress`
  Progress projection
- `GET /api/learner/review`
  Review projection
- `GET /api/learner/curriculum-view`
  Generated curriculum surface for the active workspace

Recommended write/update endpoints:

- `POST /api/learner/context`
  Create or update notebook-local `context.json`
- `POST /api/learner/rebuild`
  Rebuild one or more projections

Direct arbitrary mutation endpoints for canonical learner facts should be avoided in favor of:

- curriculum subagent tools
- dedicated internal service calls
- background observer writes

---

## 22. Physical Storage Layout

Do not start with one giant `learner.json`.

Start with partitioned files.

Recommended layout:

```text
~/.buddy/learner/
  meta.json
  goals.json
  edges.json
  evidence.log
  practice.json
  assessments.json
  constraints.json
  feedback.json
  misconceptions.json
  projections/
    progress.json
    review.json
    alignment.json
```

Rationale:

- smaller write surfaces
- less semantic collision
- easier rebuilds
- easier future migration to SQLite

---

## 23. Concurrency and Idempotency

Single-user does not mean concurrency-free.

Buddy may have:

- multiple sessions
- session-end observers
- periodic safety sweeps
- explicit writes from curriculum subagents

### 23.1 v1 write protocol

Current storage discipline uses:

- temp-file plus atomic rename for JSON partitions
- append-only NDJSON writes for `evidence.log`
- service-owned rebuilds for derived projections

### 23.2 Evidence log

High-frequency or observer-driven writes prefer idempotent evidence records with dedupe keys.

### 23.3 Observer cursors

Observers must store cursors such as:

- lastProcessedSessionId
- lastProcessedMessageId

Current implementation also treats cursors as an optimization only.

Dedupe keys are the real correctness mechanism for repeated observation and safety sweeps.

### 23.4 Upgrade path

If write frequency, query complexity, or file size become painful, the service interface should be preserved while storage moves to SQLite.

---

## 24. Integration With Current Buddy

### 24.1 Current `mode` terminology

Current Buddy `mode` is overloaded.

Canonical replacement:

- current Buddy `mode` -> `persona`
- new runtime axis -> `instructionalStrategy`

### 24.2 Current mode registry

The old `packages/buddy/src/modes/*` layout has already been replaced by `packages/buddy/src/personas/*`.

Personas should continue to own:

- surfaces
- default workspace shape
- base runtime agent

### 24.3 `composeLearningSystemPrompt()`

Current prompt assembly reads notebook-local curriculum and goals.

Future canonical read path:

- `LearnerService.queryForPrompt()`
- workspace context
- runtime profile compilation

`composeLearningSystemPrompt()` should stop treating notebook-local goals or curriculum markdown as canonical learner truth.

### 24.4 `CurriculumService`

The old notebook-local curriculum markdown service has been removed.

Generated curriculum views now come from the learner store, workspace context, and runtime state.

### 24.5 `goals-v1`

The old notebook-local goals implementation has been removed.

Canonical goals now live in the learner store.

### 24.6 Teaching workspace services

Current notebook-local ownership remains correct and should remain in place.

---

## 25. UI Contract

The product UI should stay simple.

### 25.1 Primary user controls

- persona picker
- strategy segmented control
- Auto toggle

### 25.2 Surface behavior

Surfaces should appear automatically based on:

- persona
- runtime profile
- workspace state

Surfaces are not user-facing teaching modes.

### 25.3 Hidden complexity

The UI should not expose:

- alignment
- feedback engine
- progress recorder
- sequencer

Those are system capabilities.

---

## 26. Source-of-Truth Rules

These rules resolve ambiguity.

### 26.1 Canonical fact precedence

When sources disagree:

1. canonical learner store facts win
2. workspace context is a filter hint, not canonical truth
3. runtime state controls the current teaching behavior
4. projections are disposable and rebuildable

### 26.2 Evidence precedence

When progress summaries disagree with evidence:

- evidence wins
- projections must be rebuilt

### 26.3 Workspace context precedence

When workspace context conflicts with the learner store:

- learner store remains canonical
- workspace context only affects relevance and presentation

### 26.4 Curriculum surface precedence

The curriculum sidebar is a projection.

It must not silently become the canonical learner database.

---

## 27. Implementation Stance

Buddy core was cut over in one breaking pass.

This spec describes the shipped architecture, not a phased migration plan.

Implementation rule going forward:

- update the learner/runtime contracts and this spec together
- keep notebook-local teaching artifacts local
- keep learner truth in the learner store
- treat projections as rebuildable outputs

---

## 28. Non-Negotiable Decisions

These are fixed by this spec.

1. Notebook is not a subject.
2. Learner knowledge is cross-notebook.
3. Runtime teaching state is separate from learner store state.
4. `persona` and `instructionalStrategy` are separate axes.
5. `feedback`, `progress`, `alignment`, and `sequencing` are not top-level user strategies.
6. Prompt injection is the default read path, but a narrow read facade is allowed.
7. Evidence is the preferred canonical write target.
8. Curriculum surface is a projection, not the canonical learner database.
9. Notebook-local teaching workspace remains local.
10. Do not start with one giant learner JSON blob.

---

## 29. Final Model

Buddy core consists of:

### Runtime plane

- persona
- strategy
- adaptivity
- activity
- scaffolding
- surface
- workspaceState

### Canonical data plane

- learner store
- workspace context
- notebook-local teaching artifacts

### Projection plane

- curriculum view
- progress view
- review view
- alignment view
- session plan

### Execution plane

- primary teaching personas
- curriculum subagents
- background observers
- vendored OpenCode runtime

This is the architecture Buddy should implement against.
