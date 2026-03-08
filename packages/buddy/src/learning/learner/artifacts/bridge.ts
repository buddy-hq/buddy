import { createHash } from "node:crypto"
import { ulid } from "ulid"
import { LearnerArtifactStore } from "./store.js"
import type { DecisionArtifact } from "./types.js"
import type { SessionPlan } from "../types.js"

export function buildSessionPlanFromDecision(input: {
  decision: {
    primaryGoalId?: string
    suggestedActivity: SessionPlan["suggestedActivity"]
    suggestedScaffoldingLevel: SessionPlan["suggestedScaffoldingLevel"]
    warmupGoalIds: string[]
    alternatives: string[]
    rationale: string[]
    motivationHook?: string
    riskFlags: string[]
  }
  constraintsSummary: string[]
}): SessionPlan {
  return {
    warmupReviewGoalIds: [...input.decision.warmupGoalIds],
    primaryGoalId: input.decision.primaryGoalId,
    suggestedActivity: input.decision.suggestedActivity,
    suggestedScaffoldingLevel: input.decision.suggestedScaffoldingLevel,
    alternatives: [...input.decision.alternatives],
    rationale: [...input.decision.rationale],
    motivationHook: input.decision.motivationHook,
    constraintsConsidered: [...input.constraintsSummary],
    prerequisiteWarnings: [...input.decision.riskFlags],
  }
}

export function hashDecisionInput(content: string) {
  return createHash("sha1").update(content).digest("hex")
}

export async function recordDecisionArtifact(input: {
  directory: string
  workspaceId: string
  goalIds: string[]
  kind: "decision-interpret-message" | "decision-feedback" | "decision-plan"
  decisionType: "interpret-message" | "feedback" | "plan"
  inputHash: string
  disposition: "apply" | "abstain"
  confidence: number
  rationale: string[]
  payload?: unknown
  providerId?: string
  modelId?: string
  usedSmallModel: boolean
  error?: string
}) {
  const now = new Date().toISOString()
  const decisionArtifact: DecisionArtifact = {
    id: ulid(),
    kind: input.kind,
    decisionType: input.decisionType,
    workspaceId: input.workspaceId,
    goalIds: [...input.goalIds],
    createdAt: now,
    updatedAt: now,
    providerId: input.providerId,
    modelId: input.modelId,
    usedSmallModel: input.usedSmallModel,
    inputHash: input.inputHash,
    disposition: input.disposition,
    confidence: input.confidence,
    rationale: [...input.rationale],
    payload: input.payload,
    error: input.error,
  }

  await LearnerArtifactStore.upsertArtifact(input.directory, input.kind, decisionArtifact)
  return decisionArtifact
}
