import { createHash } from "node:crypto"
import { ulid } from "ulid"
import { LearnerArtifactStore } from "../artifacts/store.js"
import type {
  EvidenceArtifact,
  FeedbackArtifact,
  MisconceptionArtifact,
  WorkspaceContextArtifact,
} from "../artifacts/types.js"

const STOP_WORDS = new Set(["the", "and", "for", "with", "this", "that", "project", "workspace", "buddy"])

export function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

export function normalizeList(values: readonly string[] | undefined) {
  return Array.from(new Set((values ?? []).map((value) => normalizeText(value)).filter(Boolean)))
}

export function contentDigest(value: string) {
  return createHash("sha1").update(normalizeText(value)).digest("hex")
}

export function inferTags(input: string) {
  return Array.from(
    new Set(
      input
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
    ),
  ).slice(0, 12)
}

export function evidenceStrengthFromOutcome(
  outcome: EvidenceArtifact["outcome"],
): EvidenceArtifact["strength"] {
  if (outcome === "positive") return "strong"
  if (outcome === "mixed") return "weak"
  return "none"
}

export function nowIso() {
  return new Date().toISOString()
}

export function nextId() {
  return ulid()
}

export async function createEvidenceArtifact(input: {
  directory: string
  workspace: WorkspaceContextArtifact
  goalIds: string[]
  sourceKind: EvidenceArtifact["sourceKind"]
  outcome: EvidenceArtifact["outcome"]
  summary: string
  sourceRefId?: string
  sessionId?: string
}) {
  const now = nowIso()
  const evidence: EvidenceArtifact = {
    id: nextId(),
    kind: "evidence",
    workspaceId: input.workspace.workspaceId,
    goalIds: [...input.goalIds],
    sourceKind: input.sourceKind,
    outcome: input.outcome,
    strength: evidenceStrengthFromOutcome(input.outcome),
    sourceRefId: input.sourceRefId,
    sessionId: input.sessionId,
    summary: normalizeText(input.summary),
    createdAt: now,
    updatedAt: now,
  }

  await LearnerArtifactStore.upsertArtifact(input.directory, "evidence", evidence)
  return evidence
}

export async function createFeedbackArtifact(input: {
  directory: string
  workspace: WorkspaceContextArtifact
  goalIds: string[]
  sourceKind: FeedbackArtifact["sourceKind"]
  sourceRefId?: string
  relatedDecisionId?: string
  strengths: string[]
  gaps: string[]
  guidance: string[]
  requiredAction: string
  scaffoldingLevel: FeedbackArtifact["scaffoldingLevel"]
}) {
  const now = nowIso()
  const feedback: FeedbackArtifact = {
    id: nextId(),
    kind: "feedback",
    workspaceId: input.workspace.workspaceId,
    goalIds: [...input.goalIds],
    status: "open",
    sourceKind: input.sourceKind,
    sourceRefId: input.sourceRefId,
    relatedDecisionId: input.relatedDecisionId,
    strengths: normalizeList(input.strengths),
    gaps: normalizeList(input.gaps),
    guidance: normalizeList(input.guidance),
    requiredAction: normalizeText(input.requiredAction),
    scaffoldingLevel: input.scaffoldingLevel,
    createdAt: now,
    updatedAt: now,
  }

  await LearnerArtifactStore.upsertArtifact(input.directory, "feedback", feedback)
  return feedback
}

export async function createMisconceptionArtifact(input: {
  directory: string
  workspace: WorkspaceContextArtifact
  goalIds: string[]
  summary: string
  relatedDecisionId?: string
}) {
  const now = nowIso()
  const misconception: MisconceptionArtifact = {
    id: nextId(),
    kind: "misconception",
    workspaceId: input.workspace.workspaceId,
    goalIds: [...input.goalIds],
    status: "active",
    summary: normalizeText(input.summary),
    relatedDecisionId: input.relatedDecisionId,
    createdAt: now,
    updatedAt: now,
  }

  await LearnerArtifactStore.upsertArtifact(input.directory, "misconception", misconception)
  return misconception
}

export async function closeFeedbackByIds(input: {
  directory: string
  workspaceId: string
  feedbackIds: string[]
  status: "acted-on" | "resolved"
}) {
  if (input.feedbackIds.length === 0) return

  const current = (await LearnerArtifactStore.readArtifacts(input.directory, "feedback"))
    .filter((artifact): artifact is FeedbackArtifact => artifact.kind === "feedback")
  const now = nowIso()

  await Promise.all(
    current
      .filter((artifact) => artifact.workspaceId === input.workspaceId)
      .filter((artifact) => input.feedbackIds.includes(artifact.id))
      .map((artifact) =>
        LearnerArtifactStore.upsertArtifact(input.directory, "feedback", {
          ...artifact,
          status: input.status,
          updatedAt: now,
        }),
      ),
  )
}

export async function resolveMisconceptionsByIds(input: {
  directory: string
  workspaceId: string
  misconceptionIds: string[]
}) {
  if (input.misconceptionIds.length === 0) return

  const current = (await LearnerArtifactStore.readArtifacts(input.directory, "misconception"))
    .filter((artifact): artifact is MisconceptionArtifact => artifact.kind === "misconception")
  const now = nowIso()

  await Promise.all(
    current
      .filter((artifact) => artifact.workspaceId === input.workspaceId)
      .filter((artifact) => input.misconceptionIds.includes(artifact.id))
      .filter((artifact) => artifact.status !== "resolved")
      .map((artifact) =>
        LearnerArtifactStore.upsertArtifact(input.directory, "misconception", {
          ...artifact,
          status: "resolved",
          updatedAt: now,
        }),
      ),
  )
}

export function ensureGoalIds(goalIds: string[]) {
  if (goalIds.length === 0) {
    throw new Error("goalIds must be non-empty")
  }
}
