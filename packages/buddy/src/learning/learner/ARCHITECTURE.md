# Learner Module Architecture

## One-Line Summary

Buddy learner is a file-first, artifact-based pedagogy system: every learner record is a standalone Markdown artifact with YAML frontmatter, and pedagogical decisions are produced by a structured LLM decision engine (no deterministic heuristics).

---

## Design Principles

1. **Everything is a file**
   - Workspace-scoped learner artifacts live inside each workspace at `.buddy/learner/`.
   - User-wide learner profile lives at `~/.buddy/profile/learner/profile.md`.
2. **No projection authority**
   - There is no authoritative blob store and no persistent projection pipeline.
   - Snapshot and prompt context are compiled directly from artifact files.
3. **Decision engine for pedagogy**
   - Message interpretation, feedback generation, and next-step planning are decision-engine operations.
   - No silent regex/heuristic fallback for pedagogical state mutation.
4. **Explicit goal relationships only**
   - No auto-derived prerequisite/build/reinforce edges.

---

## Storage Topology

### Workspace root

`<workspace>/.buddy/learner/`

### Workspace artifact layout

- `workspace/context.md`
- `goals/<goalId>.md`
- `messages/<messageId>.md`
- `practice/<practiceId>.md`
- `assessments/<assessmentId>.md`
- `evidence/<evidenceId>.md`
- `feedback/<feedbackId>.md`
- `misconceptions/<misconceptionId>.md`
- `decisions/interpret-message/<decisionId>.md`
- `decisions/feedback/<decisionId>.md`
- `decisions/plan/<decisionId>.md`

### User-wide profile root

`~/.buddy/profile/learner/profile.md`

---

## Artifact Contract

All artifacts include common frontmatter:

- `id`
- `kind`
- `goalIds`
- `createdAt`
- `updatedAt`
- `workspaceId` for workspace-scoped records

Artifact schemas are defined and validated in:

- `packages/buddy/src/learning/learner/artifacts/types.ts`

Storage/parsing lives in:

- `packages/buddy/src/learning/learner/artifacts/path.ts`
- `packages/buddy/src/learning/learner/artifacts/markdown.ts`
- `packages/buddy/src/learning/learner/artifacts/store.ts`

---

## Module Layout

Learner is split into focused Buddy-owned modules:

- `learning/learner/artifacts/`
  - schema definitions, markdown parsing/serialization, path mapping, repository operations
- `learning/learner/compiler/`
  - `snapshot.ts`: factual workspace snapshot compiler
  - `prompt-context.ts`: typed prompt digest compiler
- `learning/learner/decision/`
  - `engine.ts`: structured decision runtime client
  - `prompt.ts`: decision prompts
  - `types.ts`: decision schemas / JSON schema contracts
  - `service.ts`: decision operation wrappers
- `learning/learner/orchestration/`
  - `workspace.ts`: workspace/profile patching and goal-set replacement
  - `observe-message.ts`: learner message observation workflow
  - `record-practice.ts`: practice workflow
  - `record-assessment.ts`: assessment workflow
  - `plan.ts`: plan decision caching and generation
  - `helpers.ts`: shared normalization + mutation helpers
- `learning/learner/service.ts`
  - thin facade only; delegates to artifact/compiler/decision/orchestration modules

---

## Public Learner Service Facade

`packages/buddy/src/learning/learner/service.ts` exposes only:

- `ensureWorkspaceContext(directory)`
- `getWorkspaceSnapshot(input)`
- `listArtifacts(input)`
- `patchWorkspace(input)`
- `replaceGoalSet(input)`
- `recordLearnerMessageEvent(input)`
- `recordPracticeEvent(input)`
- `recordAssessmentEvent(input)`
- `ensurePlanDecision(input)`
- `buildPromptContext(input)`

Legacy facade methods (`readState`, `queryState`, `rebuild*`, `getSessionPlan`, `getCurriculumView`, `queryForPrompt`) are removed.

---

## Route Surface

Learner API surface:

- `GET /api/learner/snapshot`
- `POST /api/learner/plan`
- `GET /api/learner/artifacts`
- `PATCH /api/learner/workspace`

Implemented in:

- `packages/buddy/src/routes/learner.ts`
- `packages/buddy/src/routes/handlers/learner.ts`

Removed route surface:

- `learner.state`
- `learner.goals`
- `learner.progress`
- `learner.review`
- `learner.curriculumView`
- `learner.rebuild`
- `goals.get`

---

## Learner Tool Surface

Current learner tool IDs:

- `learner_snapshot_read`
- `learner_practice_record`
- `learner_assessment_record`

Implemented in:

- `packages/buddy/src/learning/learner/tools/query.ts`
- `packages/buddy/src/learning/learner/tools/practice-record.ts`
- `packages/buddy/src/learning/learner/tools/assessment-record.ts`

---

## Compiler Behavior

Snapshot compiler is factual and artifact-derived only.

It compiles:

- workspace context
- profile
- active goals
- active misconceptions
- open feedback
- recent evidence
- latest plan decision
- constraints summary
- activity bundles
- sections and markdown digest

It does **not** compute heuristic progress/review/alignment projections or auto-resolve pedagogical state.

---

## Decision Engine

Decision engine contracts are schema-driven structured outputs for:

- `interpretMessage`
- `generatePracticeFeedback`
- `generateAssessmentFeedback`
- `planSession` (plan-next-step)

### Model resolution strategy

`learning/learner/decision/engine.ts` resolves model in this order:

1. Use model context from current session (if session ID is available and resolvable)
2. Else use project-configured model
3. Resolve via small-model preference:
   - `Provider.getSmallModel(providerID)`
   - fallback `Provider.getModel(providerID, modelID)`

This mirrors the vendored title-generation model preference flow without patching vendor code.

### Fallback behavior

If model resolution fails or structured output parsing fails:

- persist decision artifact with `disposition: abstain`
- do not apply pedagogical mutations beyond source artifact persistence

---

## Workflow Rules

### Learner message observation

1. Persist message artifact
2. Compile factual context
3. Call `interpretMessage`
4. Persist interpretation decision
5. Apply explicit decision payload mutations only:
   - optional evidence creation
   - optional misconception creation
   - optional misconception resolution by explicit IDs

### Practice recording

1. Persist practice artifact
2. Persist evidence artifact
3. Compile feedback context
4. Call `generatePracticeFeedback`
5. Persist feedback decision
6. Apply decision payload only:
   - optional feedback creation
   - feedback closure by explicit IDs only
   - misconception resolution by explicit IDs only

### Assessment recording

1. Persist assessment artifact
2. Persist evidence artifact
3. Compile feedback context
4. Call `generateAssessmentFeedback`
5. Persist feedback decision
6. Apply explicit close/resolve IDs only

### Plan generation

1. Compile scoped plan context
2. Hash exact input context
3. Reuse existing plan decision when hash matches
4. Else call plan decision engine and persist

---

## Prompt Integration

Session message transform consumes `LearnerService.buildPromptContext(...)`.

Prompt context is typed and assembled from factual snapshot + latest plan decision summary.

No legacy learner projection/query templates are used.

---

## Retired Components

Retired heuristic/blob-era files:

- `learning/learner/path.ts`
- `learning/learner/store.ts`
- `learning/learner/projections.ts`
- `learning/learner/sequencing.ts`
- `learning/learner/feedback.ts`
- `learning/learner/query.ts`

---

## Verification Baseline

Rewrite verification commands used by this module:

- `bun test packages/buddy`
- `bun run --cwd packages/web test`
- `bun run typecheck`
- `bun run sdk:generate`
- `bun run --cwd packages/desktop predev`

No files under `vendor/opencode/**` are modified by learner rewrite work.
