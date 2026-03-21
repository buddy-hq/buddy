import { recordDecisionArtifact } from "../repository/bridge"
import type { WorkspaceContextArtifact } from "../repository/types"
import type { DecisionEngineResult } from "../decisions/engine"
import type { FeedbackDecision } from "../decisions/types"
import { closeFeedbackByIds, createFeedbackArtifact, resolveMisconceptionsByIds } from "./helpers"

type FeedbackSource = "assessment" | "practice"

export async function applyFeedbackDecision(input: {
  directory: string
  workspace: WorkspaceContextArtifact
  goalIds: string[]
  sourceKind: FeedbackSource
  sourceRefId: string
  decisionHash: string
  decision: DecisionEngineResult<FeedbackDecision>
}): Promise<{ feedbackId?: string }> {
  const decisionArtifact = await recordDecisionArtifact({
    directory: input.directory,
    workspaceId: input.workspace.workspaceId,
    goalIds: input.goalIds,
    kind: "decision-feedback",
    decisionType: "feedback",
    inputHash: input.decisionHash,
    disposition: input.decision.output?.disposition ?? "abstain",
    confidence: input.decision.output?.confidence ?? 0,
    rationale: input.decision.output?.rationale ?? [input.decision.error ?? "No decision output."],
    payload: input.decision.output,
    providerId: input.decision.providerId,
    modelId: input.decision.modelId,
    usedSmallModel: input.decision.usedSmallModel,
    error: input.decision.error,
  })

  let feedbackId: string | undefined
  if (input.decision.output?.disposition === "apply" && input.decision.output.feedbackRecord) {
    const feedback = await createFeedbackArtifact({
      directory: input.directory,
      workspace: input.workspace,
      goalIds: input.goalIds,
      sourceKind: input.sourceKind,
      sourceRefId: input.sourceRefId,
      relatedDecisionId: decisionArtifact.id,
      strengths: input.decision.output.feedbackRecord.strengths,
      gaps: input.decision.output.feedbackRecord.gaps,
      guidance: input.decision.output.feedbackRecord.guidance,
      requiredAction: input.decision.output.feedbackRecord.requiredAction,
      scaffoldingLevel: input.decision.output.feedbackRecord.scaffoldingLevel,
    })
    feedbackId = feedback.id
  }

  await closeFeedbackByIds({
    directory: input.directory,
    workspaceId: input.workspace.workspaceId,
    feedbackIds: input.decision.output?.closeFeedbackIds ?? [],
    status: input.decision.output?.closeFeedbackStatus ?? "acted-on",
  })

  await resolveMisconceptionsByIds({
    directory: input.directory,
    workspaceId: input.workspace.workspaceId,
    misconceptionIds: input.decision.output?.resolveMisconceptionIds ?? [],
  })

  return { feedbackId }
}
