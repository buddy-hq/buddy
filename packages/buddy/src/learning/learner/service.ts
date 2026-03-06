import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { ulid } from "ulid"
import type { LearnerPromptDigest } from "../runtime/types.js"
import { buildAssessmentFeedback, buildOpenFeedbackActions, buildPracticeFeedback } from "./feedback.js"
import { LearnerPath } from "./path.js"
import { buildAlignmentProjection, buildProgressProjection, buildReviewProjection } from "./projections.js"
import { inferTags, buildCurriculumView, buildLearnerPromptDigest } from "./query.js"
import { buildSessionPlan, deriveWorkspaceGoalEdges } from "./sequencing.js"
import { LearnerStore } from "./store.js"
import type {
  AssessmentRecord,
  EvidenceRecord,
  FeedbackRecord,
  GoalCognitiveLevel,
  GoalEdge,
  GoalRecord,
  GoalScope,
  LearnerConstraints,
  LearnerCurriculumView,
  LearnerMeta,
  LearnerPromptQuery,
  LearnerState,
  LearnerStateQuery,
  MisconceptionRecord,
  PracticeTemplate,
  SessionPlan,
  WorkspaceContext,
} from "./types.js"
import type { WorkspaceState } from "../runtime/types.js"

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

function normalizeList(values: readonly string[] | undefined) {
  return Array.from(new Set((values ?? []).map((value) => normalizeText(value)).filter(Boolean)))
}

async function inferWorkspaceContext(directory: string): Promise<WorkspaceContext> {
  const now = new Date().toISOString()
  const label = path.basename(directory) || "Workspace"
  const packageJson = await fs.readFile(path.join(directory, "package.json"), "utf8").catch(() => undefined)
  const packageTags = packageJson ? inferTags(packageJson) : []
  const tags = Array.from(new Set([...inferTags(label), ...packageTags])).slice(0, 12)

  return {
    workspaceId: ulid(),
    label,
    tags,
    pinnedGoalIds: [],
    projectConstraints: [],
    localToolAvailability: packageJson ? ["package.json"] : [],
    preferredSurfaces: [],
    motivationContext: undefined,
    opportunities: [],
    userOverride: false,
    createdAt: now,
    updatedAt: now,
  }
}

async function loadMeta(): Promise<LearnerMeta> {
  return LearnerStore.readMeta()
}

async function touchMeta(patch?: Partial<LearnerMeta>) {
  const current = await loadMeta()
  await LearnerStore.writeMeta({
    ...current,
    ...patch,
    observerCursors: {
      ...current.observerCursors,
      ...patch?.observerCursors,
    },
    updatedAt: new Date().toISOString(),
  })
}

function dedupeSignature(input: {
  sessionId?: string
  sourceMessageId?: string
  content: string
}) {
  return createHash("sha1")
    .update([input.sessionId ?? "", input.sourceMessageId ?? "", normalizeText(input.content)].join("::"))
    .digest("hex")
}

function isFeedbackFollowThroughEvidence(input: Pick<EvidenceRecord, "sourceType" | "outcome">) {
  if (input.outcome !== "positive" && input.outcome !== "mixed") {
    return false
  }

  return input.sourceType === "practice" || input.sourceType === "assessment" || input.sourceType === "teacher-observation"
}

function inferLearnerMessageSignals(content: string) {
  const normalized = content.trim().toLowerCase()

  return {
    requestedExplanation: /\b(explain|what is|why|understand|walk me through|teach me)\b/.test(normalized),
    requestedPractice: /\b(practice|exercise|try one|give me a problem|quiz me lightly)\b/.test(normalized),
    requestedCheck: /\b(check|test me|assess|evaluate|am i right|did i get it)\b/.test(normalized),
    completionClaim:
      /^(done|finished|complete|completed|ready|next|go ahead|go on|move on|continue)\b/.test(normalized) ||
      /\bi think i got it\b/.test(normalized),
    frustrationSignal: /\b(stuck|frustrated|confused|lost|not getting it)\b/.test(normalized),
    confusionSignal: /\b(confused|don't understand|not sure|unclear)\b/.test(normalized),
    masterySignal: /\b(i get it|makes sense|understand now|got it)\b/.test(normalized),
  }
}

function classifyLearnerMessageOutcome(signals: ReturnType<typeof inferLearnerMessageSignals>): EvidenceRecord["outcome"] {
  if (signals.confusionSignal || signals.frustrationSignal) {
    return "negative"
  }

  return "neutral"
}

function filterState(input: {
  state: LearnerState
  query: LearnerStateQuery
}) {
  const explicitGoalIds = new Set(input.query.goalIds)
  const conceptTags = new Set(input.query.conceptTags.map((tag) => normalizeText(tag.toLowerCase())))

  const goals = input.state.goals.filter((goal) => {
    if (input.query.workspaceId && !goal.workspaceRefs.includes(input.query.workspaceId)) return false
    if (explicitGoalIds.size > 0 && !explicitGoalIds.has(goal.goalId)) return false
    if (conceptTags.size > 0 && !goal.conceptTags.some((tag) => conceptTags.has(tag))) return false
    return true
  })
  const scopedGoalIds = new Set(goals.map((goal) => goal.goalId))

  return {
    meta: input.state.meta,
    goals,
    edges: input.state.edges.filter(
      (edge) => scopedGoalIds.has(edge.fromGoalId) || scopedGoalIds.has(edge.toGoalId),
    ),
    evidence: input.state.evidence.filter((record) => {
      if (input.query.workspaceId && record.workspaceId !== input.query.workspaceId) return false
      return record.goalIds.length === 0 || record.goalIds.some((goalId) => scopedGoalIds.has(goalId))
    }),
    practiceTemplates: input.state.practiceTemplates.filter((record) => {
      if (input.query.workspaceId && record.workspaceId !== input.query.workspaceId) return false
      return record.goalIds.length === 0 || record.goalIds.some((goalId) => scopedGoalIds.has(goalId))
    }),
    practiceAttempts: input.state.practiceAttempts.filter((record) => {
      if (input.query.workspaceId && record.workspaceId !== input.query.workspaceId) return false
      return record.goalIds.length === 0 || record.goalIds.some((goalId) => scopedGoalIds.has(goalId))
    }),
    assessments: input.state.assessments.filter((record) => {
      if (input.query.workspaceId && record.workspaceId !== input.query.workspaceId) return false
      return record.goalIds.length === 0 || record.goalIds.some((goalId) => scopedGoalIds.has(goalId))
    }),
    misconceptions: input.state.misconceptions.filter((record) => {
      if (input.query.workspaceId && record.workspaceId !== input.query.workspaceId) return false
      return record.goalIds.length === 0 || record.goalIds.some((goalId) => scopedGoalIds.has(goalId))
    }),
    constraints: input.state.constraints,
    feedback: input.state.feedback.filter((record) => {
      if (input.query.workspaceId && record.workspaceId !== input.query.workspaceId) return false
      return record.goalIds.length === 0 || record.goalIds.some((goalId) => scopedGoalIds.has(goalId))
    }),
    projections: input.query.includeDerived
      ? {
          progress: input.state.projections.progress.filter((record) => scopedGoalIds.has(record.goalId)),
          review: input.state.projections.review.filter((record) => scopedGoalIds.has(record.goalId)),
          alignment: input.state.projections.alignment.filter((record) => scopedGoalIds.has(record.goalId)),
        }
      : {
          progress: [],
          review: [],
          alignment: [],
        },
  } satisfies LearnerState
}

function buildMisconceptionSummary(content: string) {
  const normalized = normalizeText(content)
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized
}

function buildGoalRecords(input: {
  workspaceId: string
  scope: GoalScope
  contextLabel: string
  learnerRequest: string
  goals: Array<{
    statement: string
    actionVerb: string
    task: string
    cognitiveLevel: GoalCognitiveLevel
    howToTest: string
  }>
  rationaleSummary?: string
  assumptions?: string[]
  openQuestions?: string[]
}) {
  const createdAt = new Date().toISOString()
  const setId = ulid()
  const conceptTags = inferTags(
    [input.contextLabel, input.learnerRequest, ...input.goals.map((goal) => goal.statement)].join(" "),
  )

  return input.goals.map<GoalRecord>((goal) => ({
    goalId: ulid(),
    setId,
    scope: input.scope,
    contextLabel: normalizeText(input.contextLabel),
    learnerRequest: normalizeText(input.learnerRequest),
    statement: normalizeText(goal.statement),
    actionVerb: normalizeText(goal.actionVerb),
    task: normalizeText(goal.task),
    cognitiveLevel: goal.cognitiveLevel,
    howToTest: normalizeText(goal.howToTest),
    rationaleSummary: input.rationaleSummary ? normalizeText(input.rationaleSummary) : undefined,
    assumptions: input.assumptions?.map(normalizeText) ?? [],
    openQuestions: input.openQuestions?.map(normalizeText) ?? [],
    workspaceRefs: [input.workspaceId],
    conceptTags,
    createdAt,
  }))
}

async function syncWorkspaceGoalEdges(workspaceId: string) {
  const [goals, edges] = await Promise.all([LearnerStore.readGoals(), LearnerStore.readEdges()])
  const derived = deriveWorkspaceGoalEdges({
    goals: goals.goals,
    workspaceId,
    existingEdges: edges.edges,
  })
  const retained = edges.edges.filter((edge) => {
    const fromGoal = goals.goals.find((goal) => goal.goalId === edge.fromGoalId)
    const toGoal = goals.goals.find((goal) => goal.goalId === edge.toGoalId)
    const workspaceScoped =
      fromGoal?.workspaceRefs.includes(workspaceId) || toGoal?.workspaceRefs.includes(workspaceId)
    return !workspaceScoped
  })
  const nextEdges = [...retained, ...derived]
  await LearnerStore.writeEdges(nextEdges)
  return nextEdges
}

async function writeFeedbackRecords(records: FeedbackRecord[]) {
  await LearnerStore.writeFeedback(records)
  await touchMeta()
  return records
}

async function autoResolveFeedback(input: {
  workspaceId: string
  goalIds: string[]
  evidenceId: string
  sourceType: EvidenceRecord["sourceType"]
  outcome: EvidenceRecord["outcome"]
  createdAt: string
}) {
  if (!isFeedbackFollowThroughEvidence(input)) {
    return
  }

  const feedback = await LearnerStore.readFeedback()
  let changed = false

  for (const record of feedback.records) {
    if (record.workspaceId !== input.workspaceId) continue
    if (record.status !== "open") continue
    if (!record.goalIds.some((goalId) => input.goalIds.includes(goalId))) continue
    if (record.createdAt > input.createdAt) continue

    if (input.outcome === "positive") {
      record.status = "resolved"
      record.actedOnAt = input.createdAt
      record.actedOnByEvidenceId = input.evidenceId
      record.updatedAt = input.createdAt
      changed = true
      continue
    }

    if (input.outcome === "mixed") {
      record.status = "acted-on"
      record.actedOnAt = input.createdAt
      record.actedOnByEvidenceId = input.evidenceId
      record.updatedAt = input.createdAt
      changed = true
    }
  }

  if (changed) {
    await writeFeedbackRecords(feedback.records)
  }
}

export namespace LearnerService {
  export async function ensureWorkspaceContext(directory: string): Promise<WorkspaceContext> {
    const existing = await LearnerStore.readWorkspaceContext(directory)
    if (existing) return existing

    const inferred = await inferWorkspaceContext(directory)
    await LearnerStore.writeWorkspaceContext(directory, inferred)
    return inferred
  }

  export async function updateWorkspaceContext(
    directory: string,
    patch: Partial<
      Pick<
        WorkspaceContext,
        | "label"
        | "tags"
        | "pinnedGoalIds"
        | "projectConstraints"
        | "localToolAvailability"
        | "preferredSurfaces"
        | "motivationContext"
        | "opportunities"
        | "userOverride"
      >
    >,
  ) {
    const current = await ensureWorkspaceContext(directory)
    const nextLabel = patch.label !== undefined ? normalizeText(patch.label) : undefined
    const nextMotivationContext =
      patch.motivationContext !== undefined
        ? normalizeText(patch.motivationContext) || undefined
        : undefined
    const next: WorkspaceContext = {
      ...current,
      ...(nextLabel ? { label: nextLabel } : {}),
      ...(patch.tags !== undefined ? { tags: normalizeList(patch.tags.map((tag) => tag.toLowerCase())) } : {}),
      ...(patch.pinnedGoalIds !== undefined ? { pinnedGoalIds: [...patch.pinnedGoalIds] } : {}),
      ...(patch.projectConstraints !== undefined ? { projectConstraints: normalizeList(patch.projectConstraints) } : {}),
      ...(patch.localToolAvailability !== undefined ? { localToolAvailability: normalizeList(patch.localToolAvailability) } : {}),
      ...(patch.preferredSurfaces !== undefined ? { preferredSurfaces: [...patch.preferredSurfaces] } : {}),
      ...(patch.motivationContext !== undefined ? { motivationContext: nextMotivationContext } : {}),
      ...(patch.opportunities !== undefined ? { opportunities: normalizeList(patch.opportunities) } : {}),
      ...(typeof patch.userOverride === "boolean" ? { userOverride: patch.userOverride } : {}),
      updatedAt: new Date().toISOString(),
    }
    await LearnerStore.writeWorkspaceContext(directory, next)
    return next
  }

  export async function updateLearnerConstraints(
    patch: Partial<Omit<LearnerConstraints, "updatedAt">>,
  ): Promise<LearnerConstraints> {
    const current = (await LearnerStore.readConstraints()).value
    const next: LearnerConstraints = {
      background: patch.background ? normalizeList(patch.background) : current.background,
      knownPrerequisites: patch.knownPrerequisites
        ? normalizeList(patch.knownPrerequisites)
        : current.knownPrerequisites,
      availableTimePatterns: patch.availableTimePatterns
        ? normalizeList(patch.availableTimePatterns)
        : current.availableTimePatterns,
      toolEnvironmentLimits: patch.toolEnvironmentLimits
        ? normalizeList(patch.toolEnvironmentLimits)
        : current.toolEnvironmentLimits,
      motivationAnchors: patch.motivationAnchors ? normalizeList(patch.motivationAnchors) : current.motivationAnchors,
      opportunities: patch.opportunities ? normalizeList(patch.opportunities) : current.opportunities,
      learnerPreferences: patch.learnerPreferences
        ? normalizeList(patch.learnerPreferences)
        : current.learnerPreferences,
      updatedAt: new Date().toISOString(),
    }
    await LearnerStore.writeConstraints(next)
    await touchMeta()
    return next
  }

  export async function readState(): Promise<LearnerState> {
    const [
      meta,
      goals,
      edges,
      evidence,
      practice,
      assessments,
      misconceptions,
      constraints,
      feedback,
      progress,
      review,
      alignment,
    ] = await Promise.all([
      LearnerStore.readMeta(),
      LearnerStore.readGoals(),
      LearnerStore.readEdges(),
      LearnerStore.readEvidence(),
      LearnerStore.readPractice(),
      LearnerStore.readAssessments(),
      LearnerStore.readMisconceptions(),
      LearnerStore.readConstraints(),
      LearnerStore.readFeedback(),
      LearnerStore.readProgressProjection(),
      LearnerStore.readReviewProjection(),
      LearnerStore.readAlignmentProjection(),
    ])

    return {
      meta,
      goals: goals.goals,
      edges: edges.edges,
      evidence,
      practiceTemplates: practice.templates,
      practiceAttempts: practice.attempts,
      assessments: assessments.records,
      misconceptions: misconceptions.records,
      constraints: constraints.value,
      feedback: feedback.records,
      projections: {
        progress: progress.records,
        review: review.records,
        alignment: alignment.records,
      },
    }
  }

  export async function queryState(query: LearnerStateQuery): Promise<LearnerState> {
    return filterState({
      state: await readState(),
      query,
    })
  }

  export async function rebuildProjections() {
    const state = await readState()
    const progress = buildProgressProjection({
      goals: state.goals,
      evidence: state.evidence,
      practiceAttempts: state.practiceAttempts,
      assessments: state.assessments,
      misconceptions: state.misconceptions,
      feedback: state.feedback,
    })
    const review = buildReviewProjection(progress)
    const alignment = buildAlignmentProjection({
      goals: state.goals,
      practiceAttempts: state.practiceAttempts,
      assessments: state.assessments,
    })

    await Promise.all([
      LearnerStore.writeProgressProjection(progress),
      LearnerStore.writeReviewProjection(review),
      LearnerStore.writeAlignmentProjection(alignment),
      touchMeta(),
    ])

    return {
      progress,
      review,
      alignment,
    }
  }

  export async function rebuildProgressProjection() {
    return (await rebuildProjections()).progress
  }

  export async function rebuildReviewProjection() {
    return (await rebuildProjections()).review
  }

  export async function rebuildAlignmentProjection() {
    return (await rebuildProjections()).alignment
  }

  export async function writeEdges(edges: GoalEdge[]) {
    await LearnerStore.writeEdges(edges)
    await touchMeta()
    return edges
  }

  export async function writePracticeTemplates(templates: PracticeTemplate[]) {
    const practice = await LearnerStore.readPractice()
    await LearnerStore.writePractice({
      ...practice,
      templates,
    })
    await touchMeta()
    return templates
  }

  export async function writePracticeAttempts(attempts: Awaited<ReturnType<typeof LearnerStore.readPractice>>["attempts"]) {
    const practice = await LearnerStore.readPractice()
    await LearnerStore.writePractice({
      ...practice,
      attempts,
    })
    await touchMeta()
    return attempts
  }

  export async function writeAssessments(records: AssessmentRecord[]) {
    await LearnerStore.writeAssessments(records)
    await touchMeta()
    return records
  }

  export async function writeMisconceptions(records: MisconceptionRecord[]) {
    await LearnerStore.writeMisconceptions(records)
    await touchMeta()
    return records
  }

  export async function writeFeedback(records: FeedbackRecord[]) {
    return writeFeedbackRecords(records)
  }

  export async function commitGoals(input: {
    directory: string
    scope: GoalScope
    contextLabel: string
    learnerRequest: string
    goals: Array<{
      statement: string
      actionVerb: string
      task: string
      cognitiveLevel: GoalCognitiveLevel
      howToTest: string
    }>
    rationaleSummary?: string
    assumptions?: string[]
    openQuestions?: string[]
  }) {
    const workspace = await ensureWorkspaceContext(input.directory)
    const goalsFile = await LearnerStore.readGoals()
    const now = new Date().toISOString()
    const key = `${input.scope}::${normalizeText(input.contextLabel).toLowerCase()}`

    const nextGoals = goalsFile.goals.map((goal) => {
      const goalKey = `${goal.scope}::${normalizeText(goal.contextLabel).toLowerCase()}`
      if (!goal.archivedAt && goalKey === key) {
        return {
          ...goal,
          archivedAt: now,
        }
      }
      return goal
    })

    const created = buildGoalRecords({
      workspaceId: workspace.workspaceId,
      scope: input.scope,
      contextLabel: input.contextLabel,
      learnerRequest: input.learnerRequest,
      goals: input.goals,
      rationaleSummary: input.rationaleSummary,
      assumptions: input.assumptions,
      openQuestions: input.openQuestions,
    })

    await LearnerStore.writeGoals([...nextGoals, ...created])
    const nextEdges = await syncWorkspaceGoalEdges(workspace.workspaceId)
    await touchMeta()
    await rebuildProjections()

    return {
      filePath: LearnerPath.goals(),
      setId: created[0]?.setId ?? ulid(),
      goalIds: created.map((goal) => goal.goalId),
      edgeIds: nextEdges.map((edge) => edge.edgeId),
      archivedSetIds: Array.from(
        new Set(
          nextGoals
            .filter((goal) => goal.archivedAt === now)
            .map((goal) => goal.setId),
        ),
      ),
    }
  }

  export async function getWorkspaceGoals(directory: string) {
    const workspace = await ensureWorkspaceContext(directory)
    const state = await readState()
    return state.goals.filter(
      (goal) =>
        !goal.archivedAt &&
        (goal.workspaceRefs.includes(workspace.workspaceId) ||
          workspace.pinnedGoalIds.includes(goal.goalId) ||
          goal.conceptTags.some((tag) => workspace.tags.includes(tag))),
    )
  }

  export async function appendEvidence(record: Omit<EvidenceRecord, "evidenceId" | "createdAt">) {
    if (record.dedupeKey) {
      const existing = await LearnerStore.readEvidence()
      const duplicate = existing.find((entry) => entry.dedupeKey === record.dedupeKey)
      if (duplicate) return duplicate
    }

    const evidence: EvidenceRecord = {
      ...record,
      evidenceId: ulid(),
      createdAt: new Date().toISOString(),
    }
    await LearnerStore.appendEvidence(evidence)
    await touchMeta()
    await autoResolveFeedback({
      workspaceId: evidence.workspaceId,
      goalIds: evidence.goalIds,
      evidenceId: evidence.evidenceId,
      sourceType: evidence.sourceType,
      outcome: evidence.outcome,
      createdAt: evidence.createdAt,
    })
    return evidence
  }

  export async function recordFeedback(input: {
    directory: string
    goalIds: string[]
    strengths: string[]
    gaps: string[]
    guidance: string[]
    requiredAction: string
    scaffoldingLevel: FeedbackRecord["scaffoldingLevel"]
    pattern?: string
    sourceType: FeedbackRecord["sourceType"]
    sourceAttemptId?: string
    sourceAssessmentId?: string
    sessionId?: string
  }) {
    const workspace = await ensureWorkspaceContext(input.directory)
    const feedback = await LearnerStore.readFeedback()
    const now = new Date().toISOString()
    const record: FeedbackRecord = {
      feedbackId: ulid(),
      goalIds: [...input.goalIds],
      workspaceId: workspace.workspaceId,
      sessionId: input.sessionId,
      sourceAttemptId: input.sourceAttemptId,
      sourceAssessmentId: input.sourceAssessmentId,
      sourceType: input.sourceType,
      strengths: normalizeList(input.strengths),
      gaps: normalizeList(input.gaps),
      guidance: normalizeList(input.guidance),
      requiredAction: normalizeText(input.requiredAction),
      scaffoldingLevel: input.scaffoldingLevel,
      pattern: input.pattern ? normalizeText(input.pattern) : undefined,
      status: "open",
      createdAt: now,
      updatedAt: now,
    }

    feedback.records.push(record)
    await writeFeedbackRecords(feedback.records)
    return record
  }

  export async function markFeedbackActedOn(input: {
    directory: string
    goalIds: string[]
    evidenceId: string
    outcome: EvidenceRecord["outcome"]
  }) {
    const workspace = await ensureWorkspaceContext(input.directory)
    const feedback = await LearnerStore.readFeedback()
    let changed = false
    const now = new Date().toISOString()

    for (const record of feedback.records) {
      if (record.workspaceId !== workspace.workspaceId) continue
      if (record.status !== "open") continue
      if (!record.goalIds.some((goalId) => input.goalIds.includes(goalId))) continue

      record.status = input.outcome === "positive" ? "resolved" : "acted-on"
      record.actedOnAt = now
      record.actedOnByEvidenceId = input.evidenceId
      record.updatedAt = now
      changed = true
    }

    if (changed) {
      await writeFeedbackRecords(feedback.records)
    }
    return feedback.records
  }

  export async function observeLearnerMessage(input: {
    directory: string
    content: string
    goalIds: string[]
    sessionId?: string
    sourceMessageId?: string
  }) {
    const signals = inferLearnerMessageSignals(input.content)
    const hasSignal =
      signals.requestedExplanation ||
      signals.requestedPractice ||
      signals.requestedCheck ||
      signals.completionClaim ||
      signals.frustrationSignal ||
      signals.confusionSignal ||
      signals.masterySignal

    const observerCursor = input.sourceMessageId ?? `${input.sessionId ?? "session"}:${ulid()}`

    if (!hasSignal) {
      await touchMeta({
        observerCursors: {
          lastProcessedSessionId: input.sessionId,
          lastProcessedMessageId: observerCursor,
        },
      })
      return undefined
    }

    const workspace = await ensureWorkspaceContext(input.directory)
    const misconceptionSummary =
      signals.confusionSignal || signals.frustrationSignal ? buildMisconceptionSummary(input.content) : undefined

    const misconceptions = await LearnerStore.readMisconceptions()
    let misconceptionIds: string[] = []
    if (misconceptionSummary) {
      const existing = misconceptions.records.find(
        (record) =>
          record.workspaceId === workspace.workspaceId &&
          record.status === "active" &&
          record.summary === misconceptionSummary,
      )
      const record: MisconceptionRecord =
        existing ??
        {
          misconceptionId: ulid(),
          goalIds: [...input.goalIds],
          workspaceId: workspace.workspaceId,
          summary: misconceptionSummary,
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      if (!existing) {
        misconceptions.records.push(record)
      } else {
        record.updatedAt = new Date().toISOString()
      }
      await LearnerStore.writeMisconceptions(misconceptions.records)
      misconceptionIds = [record.misconceptionId]
    }

    const evidence = await appendEvidence({
      goalIds: [...input.goalIds],
      workspaceId: workspace.workspaceId,
      sessionId: input.sessionId,
      sourceMessageId: input.sourceMessageId,
      sourceType: "learner-message",
      summary: buildMisconceptionSummary(input.content),
      outcome: classifyLearnerMessageOutcome(signals),
      misconceptionIds,
      dedupeKey: input.sourceMessageId ? `learner-message:${input.sourceMessageId}` : undefined,
    })
    await rebuildProjections()
    await touchMeta({
      observerCursors: {
        lastProcessedSessionId: input.sessionId,
        lastProcessedMessageId: observerCursor,
      },
    })
    return evidence
  }

  export async function observeSessionSummary(input: {
    directory: string
    goalIds: string[]
    sessionId: string
    summary: string
    outcome: EvidenceRecord["outcome"]
  }) {
    const workspace = await ensureWorkspaceContext(input.directory)
    const evidence = await appendEvidence({
      goalIds: [...input.goalIds],
      workspaceId: workspace.workspaceId,
      sessionId: input.sessionId,
      sourceType: "teacher-observation",
      summary: normalizeText(input.summary),
      outcome: input.outcome,
      misconceptionIds: [],
      dedupeKey: `session-summary:${input.sessionId}:${dedupeSignature({ sessionId: input.sessionId, content: input.summary })}`,
    })
    await rebuildProjections()
    return evidence
  }

  export async function recordPractice(input: {
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
    surface?: WorkspaceContext["preferredSurfaces"][number]
    addressedFeedbackIds?: string[]
    sessionId?: string
  }) {
    const workspace = await ensureWorkspaceContext(input.directory)
    const practice = await LearnerStore.readPractice()
    const now = new Date().toISOString()
    const templateId = input.prompt ? ulid() : undefined

    if (templateId && input.prompt) {
      practice.templates.push({
        templateId,
        goalIds: [...input.goalIds],
        workspaceId: workspace.workspaceId,
        prompt: normalizeText(input.prompt),
        targetComponents: input.targetComponents ?? [],
        difficulty: input.difficulty ?? "scaffolded",
        scenario: input.scenario ? normalizeText(input.scenario) : undefined,
        taskConstraints: normalizeList(input.taskConstraints),
        deliverable: input.deliverable ? normalizeText(input.deliverable) : undefined,
        selfCheck: input.selfCheck ? normalizeText(input.selfCheck) : undefined,
        whyItMatters: input.whyItMatters ? normalizeText(input.whyItMatters) : undefined,
        surface: input.surface,
        createdAt: now,
      })
    }

    const attemptId = ulid()
    practice.attempts.push({
      attemptId,
      templateId,
      goalIds: [...input.goalIds],
      workspaceId: workspace.workspaceId,
      sessionId: input.sessionId,
      learnerResponseSummary: normalizeText(input.learnerResponseSummary),
      outcome: input.outcome,
      targetComponents: input.targetComponents ?? [],
      surface: input.surface,
      addressedFeedbackIds: [...(input.addressedFeedbackIds ?? [])],
      createdAt: now,
    })

    await LearnerStore.writePractice(practice)
    const evidence = await appendEvidence({
      goalIds: input.goalIds,
      workspaceId: workspace.workspaceId,
      sessionId: input.sessionId,
      sourceType: "practice",
      summary: normalizeText(input.learnerResponseSummary),
      outcome:
        input.outcome === "completed"
          ? "positive"
          : input.outcome === "partial"
            ? "mixed"
            : input.outcome === "stuck"
              ? "negative"
              : "neutral",
      misconceptionIds: [],
    })

    const feedbackBlueprint = buildPracticeFeedback({
      goalIds: input.goalIds,
      learnerResponseSummary: input.learnerResponseSummary,
      outcome: input.outcome,
      targetComponents: input.targetComponents ?? [],
      difficulty: input.difficulty,
    })
    const feedbackRecord = await recordFeedback({
      directory: input.directory,
      goalIds: input.goalIds,
      strengths: feedbackBlueprint.strengths,
      gaps: feedbackBlueprint.gaps,
      guidance: feedbackBlueprint.guidance,
      requiredAction: feedbackBlueprint.requiredAction,
      scaffoldingLevel: feedbackBlueprint.scaffoldingLevel,
      pattern: feedbackBlueprint.pattern,
      sourceType: "practice",
      sourceAttemptId: attemptId,
      sessionId: input.sessionId,
    })

    if (input.addressedFeedbackIds && input.addressedFeedbackIds.length > 0) {
      await markFeedbackActedOn({
        directory: input.directory,
        goalIds: input.goalIds,
        evidenceId: evidence.evidenceId,
        outcome: evidence.outcome,
      })
    }

    await rebuildProjections()

    return {
      filePath: LearnerPath.practice(),
      templateId,
      attemptId,
      evidenceId: evidence.evidenceId,
      feedbackId: feedbackRecord.feedbackId,
    }
  }

  export async function recordAssessment(input: {
    directory: string
    goalIds: string[]
    format: AssessmentRecord["format"]
    summary: string
    result: AssessmentRecord["result"]
    learnerResponseSummary?: string
    evidenceCriteria?: string[]
    followUpAction?: string
    sessionId?: string
  }) {
    const workspace = await ensureWorkspaceContext(input.directory)
    const assessments = await LearnerStore.readAssessments()
    const record: AssessmentRecord = {
      assessmentId: ulid(),
      goalIds: [...input.goalIds],
      workspaceId: workspace.workspaceId,
      sessionId: input.sessionId,
      format: input.format,
      summary: normalizeText(input.summary),
      result: input.result,
      learnerResponseSummary: input.learnerResponseSummary ? normalizeText(input.learnerResponseSummary) : undefined,
      evidenceCriteria: normalizeList(input.evidenceCriteria),
      followUpAction: input.followUpAction ? normalizeText(input.followUpAction) : undefined,
      createdAt: new Date().toISOString(),
    }

    assessments.records.push(record)
    await LearnerStore.writeAssessments(assessments.records)
    const evidence = await appendEvidence({
      goalIds: input.goalIds,
      workspaceId: workspace.workspaceId,
      sessionId: input.sessionId,
      sourceType: "assessment",
      summary: record.summary,
      outcome:
        record.result === "demonstrated"
          ? "positive"
          : record.result === "partial"
            ? "mixed"
            : "negative",
      misconceptionIds: [],
    })

    const feedbackBlueprint = buildAssessmentFeedback({
      format: input.format,
      summary: input.summary,
      result: input.result,
      evidenceCriteria: normalizeList(input.evidenceCriteria),
      followUpAction: input.followUpAction,
    })
    const feedbackRecord = await recordFeedback({
      directory: input.directory,
      goalIds: input.goalIds,
      strengths: feedbackBlueprint.strengths,
      gaps: feedbackBlueprint.gaps,
      guidance: feedbackBlueprint.guidance,
      requiredAction: feedbackBlueprint.requiredAction,
      scaffoldingLevel: feedbackBlueprint.scaffoldingLevel,
      pattern: feedbackBlueprint.pattern,
      sourceType: "assessment",
      sourceAssessmentId: record.assessmentId,
      sessionId: input.sessionId,
    })

    await rebuildProjections()

    return {
      filePath: LearnerPath.assessments(),
      assessmentId: record.assessmentId,
      evidenceId: evidence.evidenceId,
      feedbackId: feedbackRecord.feedbackId,
    }
  }

  export async function getSessionPlan(directory: string, query: LearnerPromptQuery): Promise<SessionPlan> {
    const workspace = await ensureWorkspaceContext(directory)
    const state = await readState()
    const projections = state.projections.progress.length > 0 ? state.projections : await rebuildProjections()

    return buildSessionPlan({
      goals: state.goals.filter((goal) => !goal.archivedAt),
      edges: state.edges,
      progress: projections.progress,
      review: projections.review,
      alignment: projections.alignment,
      constraints: state.constraints,
      workspace,
      focusGoalIds: query.focusGoalIds,
      openFeedbackActions: buildOpenFeedbackActions(
        state.feedback.filter((record) => record.workspaceId === workspace.workspaceId),
      ),
    })
  }

  export async function runSafetySweep() {
    const state = await readState()
    let changed = false

    for (const record of state.feedback) {
      if (record.status !== "open") continue
      const followThrough = state.evidence
        .filter(
          (evidence) =>
            evidence.workspaceId === record.workspaceId &&
            evidence.createdAt >= record.createdAt &&
            evidence.goalIds.some((goalId) => record.goalIds.includes(goalId)) &&
            isFeedbackFollowThroughEvidence(evidence),
        )
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .find(() => true)

      if (!followThrough) continue
      record.status = followThrough.outcome === "positive" ? "resolved" : "acted-on"
      record.actedOnAt = followThrough.createdAt
      record.actedOnByEvidenceId = followThrough.evidenceId
      record.updatedAt = new Date().toISOString()
      changed = true
    }

    if (changed) {
      await LearnerStore.writeFeedback(state.feedback)
    }

    const projections = await rebuildProjections()
    await touchMeta({
      lastSweepAt: new Date().toISOString(),
    })

    return {
      feedbackUpdated: changed,
      ...projections,
    }
  }

  export async function queryForPrompt(input: {
    directory: string
    query: LearnerPromptQuery
  }): Promise<LearnerPromptDigest> {
    const workspace = await ensureWorkspaceContext(input.directory)
    const state = await readState()
    const projections = state.projections.progress.length > 0 ? state.projections : await rebuildProjections()
    const misconceptions = state.misconceptions
      .filter((record) => record.status === "active" && record.workspaceId === workspace.workspaceId)
      .map((record) => record.summary)

    return buildLearnerPromptDigest({
      workspace,
      goals: state.goals,
      edges: state.edges,
      progress: projections.progress,
      review: projections.review,
      alignment: projections.alignment,
      feedback: state.feedback,
      constraints: state.constraints,
      query: input.query,
      misconceptions,
    })
  }

  export async function getCurriculumView(
    directory: string,
    query: LearnerPromptQuery & {
      workspaceState?: WorkspaceState
    },
  ): Promise<LearnerCurriculumView> {
    const workspace = await ensureWorkspaceContext(directory)
    const state = await readState()
    const projections = state.projections.progress.length > 0 ? state.projections : await rebuildProjections()
    const digest = await queryForPrompt({
      directory,
      query,
    })

    return buildCurriculumView({
      workspace,
      digest,
      goals: state.goals,
      edges: state.edges,
      progress: projections.progress,
      review: projections.review,
      alignment: projections.alignment,
      feedback: state.feedback,
      constraints: state.constraints,
      focusGoalIds: query.focusGoalIds,
      persona: query.persona,
      intent: query.intent,
      workspaceState: query.workspaceState ?? "chat",
    })
  }
}
