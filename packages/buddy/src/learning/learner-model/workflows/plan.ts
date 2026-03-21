import {
  buildSessionPlanFromDecision,
  hashDecisionInput,
  recordDecisionArtifact,
} from "../repository/bridge"
import { LearnerArtifactStore } from "../repository/store"
import {
  type DecisionArtifact,
  type DecisionPlanRequest,
  SnapshotPlanSchema,
} from "../repository/types"
import { LearnerSnapshotCompiler, type LearnerSnapshot } from "../projections/snapshot"
import { LearnerDecisionService } from "../decisions/service"
import type { SessionPlan } from "../model/types"
import { ensureWorkspaceContext } from "./workspace"

type EnsurePlanDecisionResult = {
  snapshot: LearnerSnapshot
  plan: SessionPlan
  decision?: DecisionArtifact
}

const pendingPlanDecisions = new Map<string, Promise<EnsurePlanDecisionResult>>()

function planDecisionRequestKey(input: {
  directory: string
  query: DecisionPlanRequest
  allowGenerate?: boolean
}) {
  const stableSortedFocusGoalIds = Array.from(new Set(input.query.focusGoalIds)).toSorted()
  return [
    input.directory,
    input.query.persona,
    input.query.intent ?? "",
    input.query.workspaceState ?? "",
    input.query.sessionId ?? "",
    input.allowGenerate === false ? "no-generate" : "allow-generate",
    stableSortedFocusGoalIds.join(","),
  ].join("::")
}

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

async function readExistingPlanDecision(input: {
  directory: string
  workspaceId: string
  inputHash: string
}) {
  return (
    await LearnerArtifactStore.readArtifacts(input.directory, "decision-plan", {
      workspaceId: input.workspaceId,
      inputHash: input.inputHash,
    })
  )
    .filter((artifact): artifact is DecisionArtifact => artifact.kind === "decision-plan")
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
}

export async function ensurePlanDecision(input: {
  directory: string
  query: DecisionPlanRequest
  allowGenerate?: boolean
}): Promise<EnsurePlanDecisionResult> {
  const pendingKey = planDecisionRequestKey(input)
  const pending = pendingPlanDecisions.get(pendingKey)
  if (pending) {
    return pending
  }

  let runPromise: Promise<EnsurePlanDecisionResult>
  runPromise = (async (): Promise<EnsurePlanDecisionResult> => {
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

    const stableSortedFocusGoalIds = Array.from(new Set(input.query.focusGoalIds)).toSorted()
    const inputHash = hashDecisionInput(
      [
        workspace.workspaceId,
        input.query.persona,
        input.query.intent ?? "",
        input.query.workspaceState ?? "",
        input.query.sessionId ?? "",
        stableSortedFocusGoalIds.join(","),
        snapshot.decisionInputFingerprint,
      ].join("::"),
    )

    const existing = await readExistingPlanDecision({
      directory: input.directory,
      workspaceId: workspace.workspaceId,
      inputHash,
    })
    if (existing) {
      if (existing.disposition === "apply") {
        const decisionPayload = SnapshotPlanSchema.safeParse(existing.payload)
        if (decisionPayload.success) {
          return {
            snapshot,
            plan: buildSessionPlanFromDecision({
              decision: decisionPayload.data,
              constraintsSummary: snapshot.constraintsSummary,
            }),
            decision: existing,
          }
        }
      } else {
        return {
          snapshot,
          plan: fallbackPlan(snapshot),
          decision: existing,
        }
      }
    }

    if (input.allowGenerate === false) {
      return {
        snapshot,
        plan: fallbackPlan(snapshot),
      }
    }

    const result = await LearnerDecisionService.planSession({
      directory: input.directory,
      snapshot,
      focusGoalIds: input.query.focusGoalIds,
      sessionId: input.query.sessionId,
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
  })().finally(() => {
    if (pendingPlanDecisions.get(pendingKey) === runPromise) {
      pendingPlanDecisions.delete(pendingKey)
    }
  })
  pendingPlanDecisions.set(pendingKey, runPromise)

  return runPromise
}
