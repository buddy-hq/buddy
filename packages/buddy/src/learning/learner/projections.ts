import type {
  AlignmentRecord,
  AssessmentRecord,
  FeedbackRecord,
  EvidenceRecord,
  GoalRecord,
  MisconceptionRecord,
  PracticeAttempt,
  ProgressRecord,
  ReviewRecord,
} from "./types.js"

function latestTimestamp(values: string[]): string | undefined {
  return [...values].sort((left, right) => right.localeCompare(left))[0]
}

function reviewIntervalDays(reviewCount: number): number {
  if (reviewCount <= 0) return 1
  if (reviewCount === 1) return 3
  if (reviewCount === 2) return 7
  if (reviewCount === 3) return 14
  return 30
}

function addDays(timestamp: string, days: number): string {
  return new Date(new Date(timestamp).getTime() + days * 24 * 60 * 60 * 1000).toISOString()
}

export function buildProgressProjection(input: {
  goals: GoalRecord[]
  evidence: EvidenceRecord[]
  practiceAttempts: PracticeAttempt[]
  assessments: AssessmentRecord[]
  misconceptions: MisconceptionRecord[]
  feedback: FeedbackRecord[]
}): ProgressRecord[] {
  const now = new Date().toISOString()

  return input.goals
    .filter((goal) => !goal.archivedAt)
    .map((goal) => {
      const goalEvidence = input.evidence.filter((record) => record.goalIds.includes(goal.goalId))
      const goalPractice = input.practiceAttempts.filter((record) => record.goalIds.includes(goal.goalId))
      const goalAssessments = input.assessments.filter((record) => record.goalIds.includes(goal.goalId))
      const goalMisconceptions = input.misconceptions.filter(
        (record) => record.goalIds.includes(goal.goalId) && record.status === "active",
      )
      const goalFeedback = input.feedback.filter(
        (record) => record.goalIds.includes(goal.goalId) && record.status === "open",
      )

      const demonstratedAssessments = goalAssessments.filter((record) => record.result === "demonstrated")
      const failedAssessments = goalAssessments.filter((record) => record.result === "not-demonstrated")
      const latestDemonstratedAt = latestTimestamp(demonstratedAssessments.map((record) => record.createdAt))
      const latestFailureAt = latestTimestamp(failedAssessments.map((record) => record.createdAt))
      const lastWorkedAt = latestTimestamp([
        ...goalEvidence.map((record) => record.createdAt),
        ...goalPractice.map((record) => record.createdAt),
        ...goalAssessments.map((record) => record.createdAt),
      ])
      const reviewCount = Math.max(0, demonstratedAssessments.length - 1)
      const regressedAfterDemonstration =
        !!latestDemonstratedAt &&
        (!!latestFailureAt && latestFailureAt > latestDemonstratedAt ||
          goalMisconceptions.some((record) => record.updatedAt > latestDemonstratedAt))

      let status: ProgressRecord["status"] = "not-started"
      if (latestDemonstratedAt && !regressedAfterDemonstration) {
        status = "demonstrated"
      } else if (regressedAfterDemonstration || goalMisconceptions.length > 0) {
        status = "needs-review"
      } else if (goalEvidence.length > 0 || goalPractice.length > 0 || goalAssessments.length > 0) {
        status = "in-progress"
      }

      const confidence: ProgressRecord["confidence"] =
        status === "demonstrated"
          ? goalFeedback.length > 0
            ? "medium"
            : "high"
          : status === "in-progress"
            ? goalFeedback.length > 0
              ? "low"
              : "medium"
            : "low"

      const nextReviewAt =
        status === "demonstrated" && latestDemonstratedAt
          ? addDays(latestDemonstratedAt, reviewIntervalDays(reviewCount))
          : status === "needs-review" && lastWorkedAt
            ? addDays(lastWorkedAt, 1)
            : undefined

      return {
        goalId: goal.goalId,
        status,
        confidence,
        evidenceRefs: goalEvidence.map((record) => record.evidenceId),
        misconceptions: goalMisconceptions.map((record) => record.summary),
        reviewCount,
        lastDemonstratedAt: latestDemonstratedAt,
        lastWorkedAt,
        nextReviewAt,
        updatedAt: now,
      }
    })
}

export function buildReviewProjection(progress: ProgressRecord[]): ReviewRecord[] {
  const now = Date.now()
  return progress
    .filter((record) => record.nextReviewAt)
    .map((record) => {
      const dueAt = record.nextReviewAt!
      return {
        goalId: record.goalId,
        dueAt,
        reason:
          record.status === "needs-review"
            ? "Needs repair after later difficulty"
            : record.reviewCount > 0
              ? "Scheduled spaced retrieval"
              : "Initial review after demonstration",
        status: new Date(dueAt).getTime() <= now ? "due" : "upcoming",
      }
    })
}

export function buildAlignmentProjection(input: {
  goals: GoalRecord[]
  practiceAttempts: PracticeAttempt[]
  assessments: AssessmentRecord[]
}): AlignmentRecord[] {
  const validGoalIds = new Set(input.goals.map((goal) => goal.goalId))

  return input.goals
    .filter((goal) => !goal.archivedAt)
    .map((goal) => {
      const practice = input.practiceAttempts.filter((record) => record.goalIds.includes(goal.goalId))
      const assessments = input.assessments.filter((record) => record.goalIds.includes(goal.goalId))
      const formats = Array.from(new Set(assessments.map((record) => record.format)))
      const orphanedRefs = [
        ...practice.flatMap((record) => record.goalIds.filter((goalId) => !validGoalIds.has(goalId))),
        ...assessments.flatMap((record) => record.goalIds.filter((goalId) => !validGoalIds.has(goalId))),
      ]
      const coverage =
        practice.length > 0 && assessments.length > 0
          ? "complete"
          : practice.length > 0 || assessments.length > 0
            ? "partial"
            : "missing"
      const suiteComplete = assessments.length === 0 ? false : formats.length >= 2

      const recommendation =
        coverage === "missing"
          ? "Add both deliberate practice and at least one mastery check for this goal."
          : coverage === "partial"
            ? practice.length === 0
              ? "Add practice before relying on assessment alone."
              : "Add an assessment so this goal has explicit evidence of mastery."
            : suiteComplete
              ? "Coverage is healthy; keep future checks varied."
              : "Add a second assessment format so the learner must transfer, not pattern-match."

      return {
        goalId: goal.goalId,
        practiceCount: practice.length,
        assessmentCount: assessments.length,
        assessmentFormats: formats,
        coverage,
        suiteComplete,
        orphanedRefs: Array.from(new Set(orphanedRefs)),
        recommendation,
      }
    })
}
