import { ulid } from "ulid"
import type { ActivityKind, ScaffoldingLevel } from "../runtime/types.js"
import type {
  AlignmentRecord,
  AlignmentSummary,
  GoalEdge,
  GoalRecord,
  LearnerConstraints,
  OpenFeedbackAction,
  ProgressRecord,
  ReviewRecord,
  SessionPlan,
  WorkspaceContext,
} from "./types.js"

const COGNITIVE_LEVEL_ORDER = new Map([
  ["Factual Knowledge", 0],
  ["Comprehension", 1],
  ["Application", 2],
  ["Analysis", 3],
  ["Synthesis", 4],
  ["Evaluation", 5],
])

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function cleanDisplayValue(value: string) {
  return value.trim().replace(/^["']+|["']+$/g, "")
}

function overlaps(left: string[], right: string[]) {
  const rightSet = new Set(right.map(normalize))
  return left.some((item) => rightSet.has(normalize(item)))
}

function mentionsFoundation(goal: GoalRecord) {
  const text = normalize([goal.statement, goal.task, goal.howToTest].join(" "))
  return /\b(basics?|fundamentals?|foundation|intro|core|syntax|setup|types?)\b/.test(text)
}

function prerequisitesSatisfied(input: {
  goalId: string
  edges: GoalEdge[]
  progressByGoal: Map<string, ProgressRecord>
}) {
  const blockers = input.edges.filter((edge) => edge.toGoalId === input.goalId && edge.type === "prerequisite")
  const unmet = blockers
    .map((edge) => edge.fromGoalId)
    .filter((goalId) => input.progressByGoal.get(goalId)?.status !== "demonstrated")

  return {
    satisfied: unmet.length === 0,
    unmet,
  }
}

function activityForProgress(record: ProgressRecord | undefined): {
  activity: ActivityKind
  scaffolding: ScaffoldingLevel
} {
  if (!record || record.status === "not-started") {
    return {
      activity: "guided-practice",
      scaffolding: "guided",
    }
  }

  if (record.status === "needs-review") {
    return {
      activity: "review",
      scaffolding: "guided",
    }
  }

  if (record.status === "demonstrated") {
    return {
      activity: "mastery-check",
      scaffolding: "transfer",
    }
  }

  return record.confidence === "high"
    ? {
        activity: "independent-practice",
        scaffolding: "independent",
      }
    : {
        activity: "guided-practice",
        scaffolding: "guided",
      }
}

export function summarizeConstraints(input: {
  constraints: LearnerConstraints
  workspace: WorkspaceContext
}): string[] {
  return [
    ...input.constraints.motivationAnchors.map((value) => `Motivation: ${cleanDisplayValue(value)}`),
    ...input.constraints.availableTimePatterns.map((value) => `Time: ${cleanDisplayValue(value)}`),
    ...input.constraints.toolEnvironmentLimits.map((value) => `Environment: ${cleanDisplayValue(value)}`),
    ...input.workspace.projectConstraints.map((value) => `Project constraint: ${cleanDisplayValue(value)}`),
    ...input.workspace.localToolAvailability.map((value) => `Local tools: ${cleanDisplayValue(value)}`),
    ...(input.workspace.motivationContext
      ? [`Workspace context: ${cleanDisplayValue(input.workspace.motivationContext)}`]
      : []),
    ...input.workspace.opportunities.map((value) => `Workspace opportunity: ${cleanDisplayValue(value)}`),
  ].slice(0, 8)
}

export function deriveWorkspaceGoalEdges(input: {
  goals: GoalRecord[]
  workspaceId: string
  existingEdges: GoalEdge[]
}): GoalEdge[] {
  const goals = input.goals
    .filter((goal) => !goal.archivedAt && goal.workspaceRefs.includes(input.workspaceId))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))

  const next = [] as GoalEdge[]

  for (let index = 0; index < goals.length; index += 1) {
    const left = goals[index]
    for (let offset = index + 1; offset < goals.length; offset += 1) {
      const right = goals[offset]
      if (!overlaps(left.conceptTags, right.conceptTags)) continue

      const leftLevel = COGNITIVE_LEVEL_ORDER.get(left.cognitiveLevel) ?? 0
      const rightLevel = COGNITIVE_LEVEL_ORDER.get(right.cognitiveLevel) ?? 0

      let fromGoalId = left.goalId
      let toGoalId = right.goalId
      let type: GoalEdge["type"] = "reinforces"

      if (mentionsFoundation(left) || leftLevel < rightLevel) {
        type = mentionsFoundation(left) ? "prerequisite" : "builds-on"
      } else if (mentionsFoundation(right) || rightLevel < leftLevel) {
        fromGoalId = right.goalId
        toGoalId = left.goalId
        type = mentionsFoundation(right) ? "prerequisite" : "builds-on"
      }

      const existing = input.existingEdges.find(
        (edge) => edge.fromGoalId === fromGoalId && edge.toGoalId === toGoalId && edge.type === type,
      )

      next.push({
        edgeId: existing?.edgeId ?? ulid(),
        fromGoalId,
        toGoalId,
        type,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      })
    }
  }

  return next
}

export function buildAlignmentSummary(records: AlignmentRecord[]): AlignmentSummary {
  const incomplete = records.filter((record) => record.coverage !== "complete" || !record.suiteComplete)
  const recommendations = [] as string[]
  const seen = new Set<string>()

  for (const record of incomplete) {
    if (seen.has(record.recommendation)) continue
    seen.add(record.recommendation)
    recommendations.push(record.recommendation)
  }

  return {
    records,
    incompleteGoalIds: incomplete.map((record) => record.goalId),
    recommendations,
  }
}

export function buildSessionPlan(input: {
  goals: GoalRecord[]
  edges: GoalEdge[]
  progress: ProgressRecord[]
  review: ReviewRecord[]
  alignment: AlignmentRecord[]
  constraints: LearnerConstraints
  workspace: WorkspaceContext
  focusGoalIds: string[]
  openFeedbackActions: OpenFeedbackAction[]
}): SessionPlan {
  const activeGoals = input.goals.filter((goal) => !goal.archivedAt)
  if (activeGoals.length === 0) {
    return {
      warmupReviewGoalIds: [],
      suggestedActivity: "goal-setting",
      suggestedScaffoldingLevel: "guided",
      alternatives: [],
      rationale: [
        "No active learning goals exist for this workspace yet.",
        "Define concrete goals before generating more practice or assessment work.",
      ],
      motivationHook:
        input.workspace.motivationContext ?? input.constraints.motivationAnchors[0] ?? "Ground the goals in a real project outcome.",
      constraintsConsidered: summarizeConstraints({
        constraints: input.constraints,
        workspace: input.workspace,
      }),
      prerequisiteWarnings: [],
    }
  }

  const progressByGoal = new Map(input.progress.map((record) => [record.goalId, record]))
  const alignmentByGoal = new Map(input.alignment.map((record) => [record.goalId, record]))
  const scopedGoalIds = input.focusGoalIds.length > 0 ? input.focusGoalIds : activeGoals.map((goal) => goal.goalId)
  const scopedGoals = activeGoals.filter((goal) => scopedGoalIds.includes(goal.goalId))
  const sortedReview = input.review
    .filter((record) => record.status === "due" || record.status === "upcoming")
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt))
  const warmupReviewGoalIds = sortedReview.slice(0, 1).map((record) => record.goalId)
  const feedbackGoalIds = new Set(input.openFeedbackActions.flatMap((record) => record.goalIds))

  const candidateGoals = scopedGoals.filter((goal) => {
    const progress = progressByGoal.get(goal.goalId)
    return progress?.status !== "demonstrated" || feedbackGoalIds.has(goal.goalId)
  })

  const ranked = candidateGoals
    .map((goal) => {
      const progress = progressByGoal.get(goal.goalId)
      const prereqState = prerequisitesSatisfied({
        goalId: goal.goalId,
        edges: input.edges,
        progressByGoal,
      })
      const alignment = alignmentByGoal.get(goal.goalId)
      const score =
        (feedbackGoalIds.has(goal.goalId) ? 30 : 0) +
        (progress?.status === "needs-review" ? 20 : 0) +
        (progress?.status === "in-progress" ? 15 : 0) +
        (progress?.status === "not-started" || !progress ? 10 : 0) +
        (alignment?.coverage !== "complete" ? 5 : 0) -
        (prereqState.satisfied ? 0 : 50)

      return {
        goal,
        progress,
        prereqState,
        score,
      }
    })
    .sort((left, right) => right.score - left.score || left.goal.createdAt.localeCompare(right.goal.createdAt))

  const primary = ranked[0] ?? {
    goal: scopedGoals[0] ?? activeGoals[0],
    progress: progressByGoal.get((scopedGoals[0] ?? activeGoals[0]).goalId),
    prereqState: {
      satisfied: true,
      unmet: [],
    },
    score: 0,
  }

  const activity = warmupReviewGoalIds.length > 0
    ? {
        activity: "review" as const,
        scaffolding: "guided" as const,
      }
    : activityForProgress(primary.progress)

  const prerequisites = primary.prereqState.unmet
  const alternatives = ranked
    .slice(1, 3)
    .map((entry) => entry.goal.statement)
  const evidenceCount = primary.progress?.evidenceRefs.length ?? 0
  const constraintsSummary = summarizeConstraints({
    constraints: input.constraints,
    workspace: input.workspace,
  })

  const rationale = [
    warmupReviewGoalIds.length > 0 ? "A spaced review item is due and should be used as a warm-up." : "Practice remains the default learning engine for this session.",
    evidenceCount > 0
      ? `Prior evidence already exists for this goal (${evidenceCount} linked record${evidenceCount === 1 ? "" : "s"}).`
      : "There is little or no direct evidence for this goal yet, so the next step should create usable evidence.",
    primary.progress?.status === "needs-review"
      ? "Recent evidence shows the learner needs repair on this goal."
      : primary.progress?.status === "in-progress"
        ? "This goal already has momentum and should be pushed forward before switching topics."
        : "This goal is the next valid target in the active path.",
    feedbackGoalIds.has(primary.goal.goalId)
      ? "An open feedback action is still unresolved for this goal."
      : alignmentByGoal.get(primary.goal.goalId)?.coverage !== "complete"
        ? "Coverage is still incomplete across practice and assessment."
        : "The goal is structurally ready for the next cycle of work.",
    constraintsSummary.length > 0
      ? `Constraints considered: ${constraintsSummary.slice(0, 2).join(" | ")}`
      : "No active constraints are forcing a different path right now.",
  ]

  return {
    warmupReviewGoalIds,
    primaryGoalId: primary.goal.goalId,
    suggestedActivity: activity.activity,
    suggestedScaffoldingLevel: activity.scaffolding,
    alternatives,
    rationale,
    motivationHook:
      input.workspace.motivationContext ??
      input.constraints.motivationAnchors[0] ??
      `This work matters because it moves ${input.workspace.label} toward a real usable outcome.`,
    constraintsConsidered: constraintsSummary,
    prerequisiteWarnings: prerequisites.map((goalId) => `Goal ${goalId} should be revisited before pushing this one further.`),
  }
}
