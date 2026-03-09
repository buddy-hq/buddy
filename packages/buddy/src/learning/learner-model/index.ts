import type { LearnerPromptDigest } from "../agents/core/runtime/types-model"
import type { PersonaId, TeachingIntentId, WorkspaceState } from "../agents/core/runtime/vocabulary"
import { buildSessionPlanFromDecision } from "./repository/bridge"
import { LearnerArtifactStore } from "./repository/store"
import { SnapshotPlanSchema } from "./repository/types"
import type {
  DecisionArtifact,
  SnapshotQuery,
  WorkspaceRecordArtifactKind,
} from "./repository/types"
import { compilePromptContext } from "./projections/prompt-context"
import { LearnerSnapshotCompiler, type LearnerSnapshot } from "./projections/snapshot"
import { recordAssessmentEvent } from "./workflows/record-assessment"
import { recordLearnerMessageEvent } from "./workflows/observe-message"
import { ensurePlanDecision } from "./workflows/plan"
import { recordPracticeEvent } from "./workflows/record-practice"
import { ensureWorkspaceContext, patchWorkspace, replaceGoalSet } from "./workflows/workspace"
import type { SessionPlan } from "./model/types"
export { ensureWorkspaceContext, patchWorkspace, replaceGoalSet }
export { recordLearnerMessageEvent, recordPracticeEvent, recordAssessmentEvent, ensurePlanDecision }
export { learnerTools } from "./tools/tools"
export { ensureLearnerToolsRegistered } from "./tools/register"
export { LearnerArtifactPath } from "./repository/path"
export { LearnerArtifactStore } from "./repository/store"
export { hashDecisionInput } from "./repository/bridge"
export {
  DecisionPlanRequestSchema,
  SnapshotPlanSchema,
  SnapshotQuerySchema,
  WorkspaceRecordArtifactKindSchema,
} from "./repository/types"
export type {
  GoalArtifact,
  SnapshotQuery,
  WorkspaceRecordArtifactKind,
} from "./repository/types"

type PromptContextQuery = {
  persona: PersonaId
  intent?: TeachingIntentId
  focusGoalIds: string[]
  sessionId?: string
  workspaceState?: WorkspaceState
}

function fallbackPlan(snapshot: LearnerSnapshot): SessionPlan {
  return {
    warmupReviewGoalIds: [],
    primaryGoalId: undefined,
    suggestedActivity: "goal-setting",
    suggestedScaffoldingLevel: "guided",
    alternatives: [],
    rationale: ["No plan decision exists yet."],
    motivationHook: undefined,
    constraintsConsidered: [...snapshot.constraintsSummary],
    prerequisiteWarnings: [],
  }
}

function planFromDecisionArtifact(input: {
  snapshot: LearnerSnapshot
  decision?: DecisionArtifact
  override?: SessionPlan
}) {
  if (input.override) {
    return input.override
  }

  const decision = input.decision ?? input.snapshot.latestPlan
  if (!decision || decision.disposition !== "apply") {
    return fallbackPlan(input.snapshot)
  }

  if (!decision.payload || typeof decision.payload !== "object") {
    return fallbackPlan(input.snapshot)
  }

  const parsed = SnapshotPlanSchema.safeParse(decision.payload)
  if (!parsed.success) {
    return fallbackPlan(input.snapshot)
  }

  return buildSessionPlanFromDecision({
    decision: parsed.data,
    constraintsSummary: input.snapshot.constraintsSummary,
  })
}

export async function getWorkspaceSnapshot(input: {
  directory: string
  query: SnapshotQuery
}): Promise<LearnerSnapshot> {
  return LearnerSnapshotCompiler.compile({
    directory: input.directory,
    query: input.query,
  })
}

export async function listArtifacts(input: {
  directory: string
  kind?: WorkspaceRecordArtifactKind
  goalId?: string
  status?: string
  includeRaw?: boolean
}) {
  return LearnerArtifactStore.listArtifacts(input)
}

export async function buildPromptContext(input: {
  directory: string
  query: PromptContextQuery
  sessionPlanOverride?: SessionPlan
}): Promise<LearnerPromptDigest> {
  const snapshot = await getWorkspaceSnapshot({
    directory: input.directory,
    query: {
      persona: input.query.persona,
      intent: input.query.intent,
      focusGoalIds: input.query.focusGoalIds,
      sessionId: input.query.sessionId,
      workspaceState: input.query.workspaceState,
    },
  })

  const plan = planFromDecisionArtifact({
    snapshot,
    override: input.sessionPlanOverride,
  })

  return compilePromptContext({
    snapshot,
    plan,
  })
}

export async function runSafetySweep() {
  await LearnerArtifactStore.ensureProfile()
  return {
    feedbackUpdated: false,
  }
}

export const LearnerService = {
  ensureWorkspaceContext,
  getWorkspaceSnapshot,
  listArtifacts,
  patchWorkspace,
  replaceGoalSet,
  recordLearnerMessageEvent,
  recordPracticeEvent,
  recordAssessmentEvent,
  ensurePlanDecision,
  buildPromptContext,
  runSafetySweep,
}
