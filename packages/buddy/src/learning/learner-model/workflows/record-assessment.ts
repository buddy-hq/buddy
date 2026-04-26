import { LearnerArtifactPath } from "../repository/path"
import { hashDecisionInput } from "../repository/bridge"
import { LearnerArtifactStore } from "../repository/store"
import { LearnerSnapshotCompiler } from "../projections/snapshot"
import { LearnerDecisionService } from "../decisions/service"
import {
  createEvidenceArtifact,
  ensureGoalIds,
  nextId,
  nowIso,
  normalizeList,
  normalizeText,
} from "./helpers"
import { applyFeedbackDecision } from "./feedback-decision"
import { ensureWorkspaceContext } from "./workspace"

function evidenceOutcomeFromAssessmentResult(
  result: "demonstrated" | "partial" | "not-demonstrated",
) {
  if (result === "demonstrated") return "positive" as const
  if (result === "partial") return "mixed" as const
  return "negative" as const
}

export async function recordAssessmentEvent(input: {
  directory: string
  goalIds: string[]
  format:
    | "concept-check"
    | "predict-outcome"
    | "debug-task"
    | "build-task"
    | "review-task"
    | "explain-reasoning"
    | "transfer-task"
  summary: string
  result: "demonstrated" | "partial" | "not-demonstrated"
  learnerResponseSummary?: string
  evidenceCriteria?: string[]
  followUpAction?: string
  sessionId?: string
}): Promise<{
  filePath: string
  assessmentId: string
  evidenceId: string
  feedbackId?: string
}> {
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
      focusGoalIds: input.goalIds,
      sessionId: input.sessionId,
    },
  })

  const decisionHash = hashDecisionInput(
    [
      workspace.workspaceId,
      "assessment",
      assessmentId,
      input.goalIds.join(","),
      input.summary,
      input.result,
      snapshot.markdown,
    ].join("::"),
  )

  const decision = await LearnerDecisionService.generateAssessmentFeedback({
    directory: input.directory,
    snapshot,
    goalIds: input.goalIds,
    summary: input.summary,
    outcome: input.result,
    sessionId: input.sessionId,
  })

  const { feedbackId } = await applyFeedbackDecision({
    directory: input.directory,
    workspace,
    goalIds: input.goalIds,
    sourceKind: "assessment",
    sourceRefId: assessmentId,
    decisionHash,
    decision,
  })

  return {
    filePath: LearnerArtifactPath.artifactFile(input.directory, "assessment", assessmentId),
    assessmentId,
    evidenceId: evidence.id,
    feedbackId,
  }
}
