import { hashDecisionInput, recordDecisionArtifact } from "../artifacts/bridge.js"
import { LearnerArtifactStore } from "../artifacts/store.js"
import { LearnerSnapshotCompiler } from "../compiler/snapshot.js"
import { LearnerDecisionService } from "../decision/service.js"
import {
  contentDigest,
  createEvidenceArtifact,
  createMisconceptionArtifact,
  nextId,
  nowIso,
  normalizeText,
  resolveMisconceptionsByIds,
} from "./helpers.js"
import { ensureWorkspaceContext } from "./workspace.js"

function evidenceOutcomeFromStrength(strength: "none" | "weak" | "strong") {
  if (strength === "strong") return "positive" as const
  if (strength === "weak") return "mixed" as const
  return "neutral" as const
}

export async function recordLearnerMessageEvent(input: {
  directory: string
  content: string
  goalIds: string[]
  sessionId?: string
  sourceMessageId?: string
}) {
  const workspace = await ensureWorkspaceContext(input.directory)
  const now = nowIso()
  const messageId = input.sourceMessageId ?? nextId()
  const trimmedContent = input.content.trim()

  await LearnerArtifactStore.upsertArtifact(input.directory, "message", {
    id: messageId,
    kind: "message",
    workspaceId: workspace.workspaceId,
    goalIds: [...input.goalIds],
    role: "learner",
    sessionId: input.sessionId,
    sourceMessageId: input.sourceMessageId,
    contentDigest: contentDigest(trimmedContent),
    content: trimmedContent,
    createdAt: now,
    updatedAt: now,
  })

  const snapshot = await LearnerSnapshotCompiler.compile({
    directory: input.directory,
    query: {
      persona: "buddy",
      intent: "learn",
      focusGoalIds: input.goalIds,
      sessionId: input.sessionId,
    },
  })

  const inputHash = hashDecisionInput([
    workspace.workspaceId,
    input.sessionId ?? "",
    input.sourceMessageId ?? "",
    input.goalIds.join(","),
    trimmedContent,
    snapshot.markdown,
  ].join("::"))

  const decision = await LearnerDecisionService.interpretMessage({
    directory: input.directory,
    snapshot,
    message: trimmedContent,
    focusGoalIds: input.goalIds,
    sessionId: input.sessionId,
  })

  if (decision.output) {
    const decisionArtifact = await recordDecisionArtifact({
      directory: input.directory,
      workspaceId: workspace.workspaceId,
      goalIds: input.goalIds,
      kind: "decision-interpret-message",
      decisionType: "interpret-message",
      inputHash,
      disposition: decision.output.disposition,
      confidence: decision.output.confidence,
      rationale: decision.output.rationale,
      payload: {
        messageArtifactId: messageId,
        decision: decision.output,
      },
      providerId: decision.providerId,
      modelId: decision.modelId,
      usedSmallModel: decision.usedSmallModel,
      error: decision.error,
    })

    if (decision.output.disposition === "abstain") {
      return undefined
    }

    let createdMisconceptionId: string | undefined
    if (decision.output.createMisconception) {
      const misconception = await createMisconceptionArtifact({
        directory: input.directory,
        workspace,
        goalIds:
          decision.output.relevantGoalIds.length > 0
            ? decision.output.relevantGoalIds
            : input.goalIds,
        summary: decision.output.createMisconception.summary,
        relatedDecisionId: decisionArtifact.id,
      })
      createdMisconceptionId = misconception.id
    }

    if (decision.output.resolveMisconceptionIds.length > 0) {
      await resolveMisconceptionsByIds({
        directory: input.directory,
        workspaceId: workspace.workspaceId,
        misconceptionIds: decision.output.resolveMisconceptionIds,
      })
    }

    if (decision.output.createEvidence) {
      return createEvidenceArtifact({
        directory: input.directory,
        workspace,
        goalIds:
          decision.output.relevantGoalIds.length > 0
            ? decision.output.relevantGoalIds
            : input.goalIds,
        sourceKind: "message",
        outcome: evidenceOutcomeFromStrength(decision.output.createEvidence.strength),
        summary: normalizeText(decision.output.createEvidence.summary),
        sourceRefId: messageId,
        sessionId: input.sessionId,
      })
    }

    if (createdMisconceptionId) {
      return undefined
    }

    return undefined
  }

  await recordDecisionArtifact({
    directory: input.directory,
    workspaceId: workspace.workspaceId,
    goalIds: input.goalIds,
    kind: "decision-interpret-message",
    decisionType: "interpret-message",
    inputHash,
    disposition: "abstain",
    confidence: 0,
    rationale: ["Decision engine failed; no pedagogical state mutation was applied."],
    payload: {
      messageArtifactId: messageId,
    },
    providerId: decision.providerId,
    modelId: decision.modelId,
    usedSmallModel: decision.usedSmallModel,
    error: decision.error,
  })

  return undefined
}
