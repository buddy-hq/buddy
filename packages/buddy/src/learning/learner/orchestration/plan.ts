import { buildSessionPlanFromDecision, hashDecisionInput, recordDecisionArtifact } from "../artifacts/bridge.js"
import { LearnerArtifactStore } from "../artifacts/store.js"
import type { DecisionArtifact, DecisionPlanRequest } from "../artifacts/types.js"
import { LearnerSnapshotCompiler, type LearnerSnapshot } from "../compiler/snapshot.js"
import { LearnerDecisionService } from "../decision/service.js"
import type { SessionPlan } from "../types.js"
import { ensureWorkspaceContext } from "./workspace.js"

function fallbackPlan(snapshot: LearnerSnapshot): SessionPlan {
  return {
    warmupReviewGoalIds: [],
    primaryGoalId: undefined,
    suggestedActivity: "goal-setting",
    suggestedScaffoldingLevel: "guided",
    alternatives: [],
    rationale: ["No applicable plan decision is available yet."],
    motivationHook: undefined,
    constraintsConsidered: [...snapshot.constraintsSummary],
    prerequisiteWarnings: [],
  }
}

export async function ensurePlanDecision(input: {
  directory: string
  query: DecisionPlanRequest
}): Promise<{
  snapshot: LearnerSnapshot
  plan: SessionPlan
  decision?: DecisionArtifact
}> {
  const [workspace, snapshot] = await Promise.all([
    ensureWorkspaceContext(input.directory),
    LearnerSnapshotCompiler.compile({
      directory: input.directory,
      query: {
        persona: input.query.persona,
        intent: input.query.intent,
        focusGoalIds: input.query.focusGoalIds,
        sessionId: input.query.sessionId,
        workspaceState: input.query.workspaceState,
      },
    }),
  ])

  const inputHash = hashDecisionInput([
    workspace.workspaceId,
    input.query.persona,
    input.query.intent ?? "",
    input.query.workspaceState ?? "",
    input.query.sessionId ?? "",
    input.query.focusGoalIds.join(","),
    snapshot.decisionInputFingerprint,
  ].join("::"))

  const existing = (await LearnerArtifactStore.readArtifacts(input.directory, "decision-plan"))
    .filter((artifact): artifact is DecisionArtifact => artifact.kind === "decision-plan")
    .filter((artifact) => artifact.workspaceId === workspace.workspaceId)
    .filter((artifact) => artifact.inputHash === inputHash)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]

  if (existing) {
    if (existing.disposition === "apply" && existing.payload && typeof existing.payload === "object") {
      const decisionPayload = existing.payload as {
        primaryGoalId?: string
        suggestedActivity: SessionPlan["suggestedActivity"]
        suggestedScaffoldingLevel: SessionPlan["suggestedScaffoldingLevel"]
        warmupGoalIds: string[]
        alternatives: string[]
        rationale: string[]
        motivationHook?: string
        riskFlags: string[]
      }

      return {
        snapshot,
        plan: buildSessionPlanFromDecision({
          decision: decisionPayload,
          constraintsSummary: snapshot.constraintsSummary,
        }),
        decision: existing,
      }
    }

    return {
      snapshot,
      plan: fallbackPlan(snapshot),
      decision: existing,
    }
  }

  const result = await LearnerDecisionService.planSession({
    directory: input.directory,
    snapshot,
    focusGoalIds: input.query.focusGoalIds,
    sessionId: input.query.sessionId,
    persona: input.query.persona,
    intent: input.query.intent,
  })

  if (result.output) {
    const decision = await recordDecisionArtifact({
      directory: input.directory,
      workspaceId: workspace.workspaceId,
      goalIds: input.query.focusGoalIds,
      kind: "decision-plan",
      decisionType: "plan",
      inputHash,
      disposition: result.output.disposition,
      confidence: result.output.confidence,
      rationale: result.output.rationale,
      payload: result.output,
      providerId: result.providerId,
      modelId: result.modelId,
      usedSmallModel: result.usedSmallModel,
      error: result.error,
    })

    if (result.output.disposition === "apply") {
      return {
        snapshot,
        plan: buildSessionPlanFromDecision({
          decision: result.output,
          constraintsSummary: snapshot.constraintsSummary,
        }),
        decision,
      }
    }

    return {
      snapshot,
      plan: fallbackPlan(snapshot),
      decision,
    }
  }

  const decision = await recordDecisionArtifact({
    directory: input.directory,
    workspaceId: workspace.workspaceId,
    goalIds: input.query.focusGoalIds,
    kind: "decision-plan",
    decisionType: "plan",
    inputHash,
    disposition: "abstain",
    confidence: 0,
    rationale: ["Decision engine failed; no pedagogical state mutation was applied."],
    providerId: result.providerId,
    modelId: result.modelId,
    usedSmallModel: result.usedSmallModel,
    error: result.error,
  })

  return {
    snapshot,
    plan: fallbackPlan(snapshot),
    decision,
  }
}
