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

function evidenceOutcomeFromPracticeOutcome(
  outcome: "assigned" | "partial" | "completed" | "stuck",
) {
  if (outcome === "completed") return "positive" as const
  if (outcome === "partial") return "mixed" as const
  if (outcome === "stuck") return "negative" as const
  return "neutral" as const
}

export async function recordPracticeEvent(input: {
  directory: string
  goalIds: string[]
  prompt?: string
  learnerResponseSummary: string
  outcome: "assigned" | "partial" | "completed" | "stuck"
  targetComponents?: string[]
  difficulty?: "scaffolded" | "moderate" | "stretch"
  scenario?: string
  taskConstraints?: string[]
  deliverable?: string
  selfCheck?: string
  whyItMatters?: string
  surface?: "chat" | "curriculum" | "editor" | "figure" | "quiz"
  addressedFeedbackIds?: string[]
  sessionId?: string
}) {
  ensureGoalIds(input.goalIds)

  const workspace = await ensureWorkspaceContext(input.directory)
  const now = nowIso()
  const practiceId = nextId()

  await LearnerArtifactStore.upsertArtifact(input.directory, "practice", {
    id: practiceId,
    kind: "practice",
    workspaceId: workspace.workspaceId,
    goalIds: [...input.goalIds],
    sessionId: input.sessionId,
    outcome: input.outcome,
    prompt: input.prompt ? normalizeText(input.prompt) : undefined,
    learnerResponseSummary: normalizeText(input.learnerResponseSummary),
    targetComponents: normalizeList(input.targetComponents),
    difficulty: input.difficulty,
    scenario: input.scenario ? normalizeText(input.scenario) : undefined,
    taskConstraints: normalizeList(input.taskConstraints),
    deliverable: input.deliverable ? normalizeText(input.deliverable) : undefined,
    selfCheck: input.selfCheck ? normalizeText(input.selfCheck) : undefined,
    whyItMatters: input.whyItMatters ? normalizeText(input.whyItMatters) : undefined,
    surface: input.surface,
    addressedFeedbackIds: [...(input.addressedFeedbackIds ?? [])],
    createdAt: now,
    updatedAt: now,
  })

  const evidence = await createEvidenceArtifact({
    directory: input.directory,
    workspace,
    goalIds: input.goalIds,
    sourceKind: "practice",
    outcome: evidenceOutcomeFromPracticeOutcome(input.outcome),
    summary: input.learnerResponseSummary,
    sourceRefId: practiceId,
    sessionId: input.sessionId,
  })

  const snapshot = await LearnerSnapshotCompiler.compile({
    directory: input.directory,
    query: {
      persona: "buddy",
      intent: "practice",
      focusGoalIds: input.goalIds,
      sessionId: input.sessionId,
    },
  })

  const decisionHash = hashDecisionInput([
    workspace.workspaceId,
    "practice",
    practiceId,
    input.goalIds.join(","),
    input.learnerResponseSummary,
    input.outcome,
    snapshot.markdown,
  ].join("::"))

  const decision = await LearnerDecisionService.generatePracticeFeedback({
    directory: input.directory,
    snapshot,
    goalIds: input.goalIds,
    summary: input.learnerResponseSummary,
    outcome: input.outcome,
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
      sourceKind: "practice",
      sourceRefId: practiceId,
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
    filePath: LearnerArtifactPath.kindDirectory(input.directory, "practice"),
    practiceId,
    evidenceId: evidence.id,
    feedbackId,
  }
}
