import type { LearnerPromptDigest, PersonaId, TeachingIntentId, WorkspaceState } from "../runtime/types.js"
import { buildSessionPlanFromDecision } from "./artifacts/bridge.js"
import { LearnerArtifactStore } from "./artifacts/store.js"
import type {
  DecisionArtifact,
  DecisionPlanRequest,
  SnapshotQuery,
  WorkspaceRecordArtifactKind,
} from "./artifacts/types.js"
import { compilePromptContext } from "./compiler/prompt-context.js"
import { LearnerSnapshotCompiler, type LearnerSnapshot } from "./compiler/snapshot.js"
import { recordAssessmentEvent as recordAssessmentEventOrchestration } from "./orchestration/record-assessment.js"
import { recordPracticeEvent as recordPracticeEventOrchestration } from "./orchestration/record-practice.js"
import { recordLearnerMessageEvent as recordLearnerMessageEventOrchestration } from "./orchestration/observe-message.js"
import { ensurePlanDecision as ensurePlanDecisionOrchestration } from "./orchestration/plan.js"
import {
  ensureWorkspaceContext as ensureWorkspaceContextOrchestration,
  patchWorkspace as patchWorkspaceOrchestration,
  replaceGoalSet as replaceGoalSetOrchestration,
} from "./orchestration/workspace.js"
import type { SessionPlan } from "./types.js"

type PromptContextQuery = {
  workspaceId?: string
  persona: PersonaId
  intent?: TeachingIntentId
  focusGoalIds: string[]
  tokenBudget?: number
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

  return buildSessionPlanFromDecision({
    decision: decision.payload as {
      primaryGoalId?: string
      suggestedActivity: SessionPlan["suggestedActivity"]
      suggestedScaffoldingLevel: SessionPlan["suggestedScaffoldingLevel"]
      warmupGoalIds: string[]
      alternatives: string[]
      rationale: string[]
      motivationHook?: string
      riskFlags: string[]
    },
    constraintsSummary: input.snapshot.constraintsSummary,
  })
}

export namespace LearnerService {
  export async function ensureWorkspaceContext(directory: string) {
    return ensureWorkspaceContextOrchestration(directory)
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

  export async function patchWorkspace(input: {
    directory: string
    workspace?: Parameters<typeof patchWorkspaceOrchestration>[0]["workspace"]
    profile?: Parameters<typeof patchWorkspaceOrchestration>[0]["profile"]
  }) {
    return patchWorkspaceOrchestration(input)
  }

  export async function replaceGoalSet(input: Parameters<typeof replaceGoalSetOrchestration>[0]) {
    return replaceGoalSetOrchestration(input)
  }

  export async function recordLearnerMessageEvent(input: Parameters<typeof recordLearnerMessageEventOrchestration>[0]) {
    return recordLearnerMessageEventOrchestration(input)
  }

  export async function recordPracticeEvent(input: Parameters<typeof recordPracticeEventOrchestration>[0]) {
    return recordPracticeEventOrchestration(input)
  }

  export async function recordAssessmentEvent(input: Parameters<typeof recordAssessmentEventOrchestration>[0]) {
    return recordAssessmentEventOrchestration(input)
  }

  export async function ensurePlanDecision(input: {
    directory: string
    query: DecisionPlanRequest
  }) {
    return ensurePlanDecisionOrchestration(input)
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
}
