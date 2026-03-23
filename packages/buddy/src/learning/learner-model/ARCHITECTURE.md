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
   - Message interpretation and feedback generation are decision-engine operations.
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

- `packages/buddy/src/learning/learner-model/repository/types.ts`

Storage/parsing lives in:

- `packages/buddy/src/learning/learner-model/repository/path.ts`
- `packages/buddy/src/learning/learner-model/repository/markdown.ts`
- `packages/buddy/src/learning/learner-model/repository/store.ts`

---

## Module Layout

Learner is split into focused Buddy-owned modules:

- `learning/learner-model/repository/`
  - schema definitions, markdown parsing/serialization, path mapping, repository operations
- `learning/learner-model/projections/`
  - `snapshot.ts`: factual workspace snapshot compiler
- `learning/learner-model/decisions/`
  - `engine.ts`: structured decision runtime client
  - `prompt.ts`: decision prompts
  - `types.ts`: decision schemas / JSON schema contracts
  - `service.ts`: decision operation wrappers
- `learning/learner-model/workflows/`
  - `workspace.ts`: workspace/profile patching and goal-set replacement
  - `observe-message.ts`: learner message observation workflow
  - `record-practice.ts`: practice workflow
  - `record-assessment.ts`: assessment workflow
  - `helpers.ts`: shared normalization + mutation helpers
- `learning/learner-model/api.ts`
  - explicit named exports for learner API entrypoints
  - orchestration ownership stays in `orchestration/*`; service composes snapshot/prompt-facing behavior

---

## Public Learner Service API

`packages/buddy/src/learning/learner-model/api.ts` exposes only:

- `ensureWorkspaceContext(directory)`
- `getWorkspaceSnapshot(input)`
- `listArtifacts(input)`
- `patchWorkspace(input)`
- `replaceGoalSet(input)`
- `recordLearnerMessageEvent(input)`
- `recordPracticeEvent(input)`
- `recordAssessmentEvent(input)`
- `runSafetySweep()`

These are exported as named functions; `LearnerService` object export remains as a compatibility alias for existing call sites.

Legacy facade methods (`readState`, `queryState`, `rebuild*`, `getSessionPlan`, `getCurriculumView`, `queryForPrompt`) are removed.

---

## Route Surface

Learner API surface:

- `GET /api/learner/snapshot`
- `GET /api/learner/artifacts`
- `PATCH /api/learner/workspace`

Implemented in:

- `packages/buddy/src/routes/learner.ts`
- `packages/buddy/src/learning/learner-model/workflows/http-request.ts`

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

- `packages/buddy/src/learning/learner-model/tools/query.ts`
- `packages/buddy/src/learning/learner-model/tools/practice-record.ts`
- `packages/buddy/src/learning/learner-model/tools/assessment-record.ts`

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
- constraints summary
- intent-bound capability permissions (tools + skills)
- sections and markdown digest

It does **not** compute heuristic progress/review/alignment projections or auto-resolve pedagogical state.

---

## Decision Engine

Decision engine contracts are schema-driven structured outputs for:

- `interpretMessage`
- `generatePracticeFeedback`
- `generateAssessmentFeedback`

### Model resolution strategy

`learning/learner-model/decisions/engine.ts` resolves model in this order:

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

## Prompt Integration

Session message transform consumes `getWorkspaceSnapshot(...)`.

Prompt context is assembled directly from factual snapshot fields.

No legacy learner projection/query templates are used.

---

## Retired Components

Retired heuristic/blob-era files:

- `learning/learner-model/path.ts`
- `learning/learner-model/store.ts`
- `learning/learner-model/projections.ts`
- `learning/learner-model/sequencing.ts`
- `learning/learner-model/feedback.ts`
- `learning/learner-model/query.ts`

---

## Verification Baseline

Rewrite verification commands used by this module:

- `bun test packages/buddy`
- `bun run --cwd packages/web test`
- `bun run typecheck`
- `bun run sdk:generate`
- `bun run --cwd packages/desktop predev`

No files under `vendor/opencode/**` are modified by learner rewrite work.
