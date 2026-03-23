import { createHash } from "node:crypto"
import { ulid } from "ulid"
import { LearnerArtifactStore } from "./store"
import type { DecisionArtifact } from "./types"

export function hashDecisionInput(content: string) {
  return createHash("sha1").update(content).digest("hex")
}

export async function recordDecisionArtifact(input: {
  directory: string
  workspaceId: string
  goalIds: string[]
  kind: "decision-interpret-message" | "decision-feedback"
  decisionType: "interpret-message" | "feedback"
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
