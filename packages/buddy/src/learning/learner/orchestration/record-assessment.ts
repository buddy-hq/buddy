import { LearnerArtifactPath } from "../artifacts/path.js"
import { hashDecisionInput, recordDecisionArtifact } from "../artifacts/bridge.js"
import { LearnerArtifactStore } from "../artifacts/store.js"
import { LearnerSnapshotCompiler } from "../compiler/snapshot.js"
import { LearnerDecisionService } from "../decision/service.js"
import {
  closeFeedbackByIds,
  createEvidenceArtifact,
  createFeedbackArtifact,
  ensureGoalIds,
  nextId,
  nowIso,
  normalizeList,
  normalizeText,
  resolveMisconceptionsByIds,
} from "./helpers.js"
import { ensureWorkspaceContext } from "./workspace.js"

function evidenceOutcomeFromAssessmentResult(result: "demonstrated" | "partial" | "not-demonstrated") {
  if (result === "demonstrated") return "positive" as const
  if (result === "partial") return "mixed" as const
  return "negative" as const
}

export async function recordAssessmentEvent(input: {
  directory: string
  goalIds: string[]
  format: "concept-check" | "predict-outcome" | "debug-task" | "build-task" | "review-task" | "explain-reasoning" | "transfer-task"
  summary: string
  result: "demonstrated" | "partial" | "not-demonstrated"
  learnerResponseSummary?: string
  evidenceCriteria?: string[]
  followUpAction?: string
  sessionId?: string
}) {
  ensureGoalIds(input.goalIds)

  const workspace = await ensureWorkspaceContext(input.directory)
  const now = nowIso()
  const assessmentId = nextId()

  await LearnerArtifactStore.upsertArtifact(input.directory, "assessment", {
    id: assessmentId,
    kind: "assessment",
    workspaceId: workspace.workspaceId,
    goalIds: [...input.goalIds],
    sessionId: input.sessionId,
    format: input.format,
    summary: normalizeText(input.summary),
    result: input.result,
    learnerResponseSummary: input.learnerResponseSummary
      ? normalizeText(input.learnerResponseSummary)
      : undefined,
    evidenceCriteria: normalizeList(input.evidenceCriteria),
    followUpAction: input.followUpAction ? normalizeText(input.followUpAction) : undefined,
    createdAt: now,
    updatedAt: now,
  })

  const evidence = await createEvidenceArtifact({
    directory: input.directory,
    workspace,
    goalIds: input.goalIds,
    sourceKind: "assessment",
    outcome: evidenceOutcomeFromAssessmentResult(input.result),
    summary: input.summary,
    sourceRefId: assessmentId,
    sessionId: input.sessionId,
  })

  const snapshot = await LearnerSnapshotCompiler.compile({
    directory: input.directory,
    query: {
      persona: "buddy",
      intent: "assess",
      focusGoalIds: input.goalIds,
      sessionId: input.sessionId,
    },
  })

  const decisionHash = hashDecisionInput([
    workspace.workspaceId,
    "assessment",
    assessmentId,
    input.goalIds.join(","),
    input.summary,
    input.result,
    snapshot.markdown,
  ].join("::"))

  const decision = await LearnerDecisionService.generateAssessmentFeedback({
    directory: input.directory,
    snapshot,
    goalIds: input.goalIds,
    summary: input.summary,
    outcome: input.result,
    sessionId: input.sessionId,
  })

  const decisionArtifact = await recordDecisionArtifact({
    directory: input.directory,
    workspaceId: workspace.workspaceId,
    goalIds: input.goalIds,
    kind: "decision-feedback",
    decisionType: "feedback",
    inputHash: decisionHash,
    disposition: decision.output?.disposition ?? "abstain",
    confidence: decision.output?.confidence ?? 0,
    rationale: decision.output?.rationale ?? [decision.error ?? "No decision output."],
    payload: decision.output,
    providerId: decision.providerId,
    modelId: decision.modelId,
    usedSmallModel: decision.usedSmallModel,
    error: decision.error,
  })

  let feedbackId: string | undefined
  if (decision.output?.disposition === "apply" && decision.output.feedbackRecord) {
    const feedback = await createFeedbackArtifact({
      directory: input.directory,
      workspace,
      goalIds: input.goalIds,
      sourceKind: "assessment",
      sourceRefId: assessmentId,
      relatedDecisionId: decisionArtifact.id,
      strengths: decision.output.feedbackRecord.strengths,
      gaps: decision.output.feedbackRecord.gaps,
      guidance: decision.output.feedbackRecord.guidance,
      requiredAction: decision.output.feedbackRecord.requiredAction,
      scaffoldingLevel: decision.output.feedbackRecord.scaffoldingLevel,
    })
    feedbackId = feedback.id
  }

  await closeFeedbackByIds({
    directory: input.directory,
    workspaceId: workspace.workspaceId,
    feedbackIds: decision.output?.closeFeedbackIds ?? [],
    status: decision.output?.closeFeedbackStatus ?? "acted-on",
  })

  await resolveMisconceptionsByIds({
    directory: input.directory,
    workspaceId: workspace.workspaceId,
    misconceptionIds: decision.output?.resolveMisconceptionIds ?? [],
  })

  return {
    filePath: LearnerArtifactPath.kindDirectory(input.directory, "assessment"),
    assessmentId,
    evidenceId: evidence.id,
    feedbackId,
  }
}
