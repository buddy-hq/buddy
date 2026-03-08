import type { LearnerPromptDigest } from "../../runtime/types.js"
import type { GoalArtifact } from "../artifacts/types.js"
import type { LearnerSnapshot } from "./snapshot.js"
import type { SessionPlan } from "../types.js"

function compact(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

function goalLine(goal: GoalArtifact) {
  return `${goal.statement} [test: ${goal.howToTest}]`
}

function recommendedAction(input: {
  plan?: SessionPlan
}) {
  return input.plan?.suggestedActivity ?? "goal-setting"
}

function planSummary(plan?: SessionPlan) {
  if (!plan) {
    return ["No active plan decision is available yet."]
  }

  return [
    `Suggested activity: ${plan.suggestedActivity}`,
    `Scaffolding: ${plan.suggestedScaffoldingLevel}`,
    ...plan.rationale,
  ]
}

function alignmentSummary(input: {
  goalCount: number
  evidenceCount: number
  openFeedbackCount: number
  activeMisconceptionCount: number
}) {
  return [
    `Goals in scope: ${input.goalCount}`,
    `Evidence records: ${input.evidenceCount}`,
    `Open feedback items: ${input.openFeedbackCount}`,
    `Active misconceptions: ${input.activeMisconceptionCount}`,
  ]
}

export function compilePromptContext(input: {
  snapshot: LearnerSnapshot
  plan?: SessionPlan
}): LearnerPromptDigest {
  const relevantGoalIds = input.snapshot.goals.map((goal) => goal.id)
  const openFeedbackActions = input.snapshot.openFeedback.map((artifact) => compact(artifact.requiredAction)).slice(0, 8)
  const activeMisconceptions = input.snapshot.activeMisconceptions.map((artifact) => compact(artifact.summary)).slice(0, 8)
  const summaryPlan = planSummary(input.plan)
  const summaryAlignment = alignmentSummary({
    goalCount: input.snapshot.goals.length,
    evidenceCount: input.snapshot.recentEvidence.length,
    openFeedbackCount: input.snapshot.openFeedback.length,
    activeMisconceptionCount: input.snapshot.activeMisconceptions.length,
  })

  const tier1 = [
    "<learner_state>",
    `Workspace: ${input.snapshot.workspace.label}`,
    relevantGoalIds.length > 0
      ? `Relevant goals: ${relevantGoalIds.join(", ")}`
      : "No relevant goals exist yet. Define goals before sequencing practice.",
    ...input.snapshot.goals.slice(0, 6).map((goal) => `- ${goalLine(goal)}`),
    ...input.snapshot.constraintsSummary.map((line) => `- Constraint: ${compact(line)}`),
    "</learner_state>",
  ]

  const tier2 = [
    "<learner_progress>",
    ...summaryPlan.map((line) => `- ${compact(line)}`),
    ...summaryAlignment.map((line) => `- ${line}`),
    "</learner_progress>",
  ]

  const tier3 = [
    "<learner_feedback>",
    ...(openFeedbackActions.length > 0
      ? openFeedbackActions.map((line) => `- ${line}`)
      : ["- No open feedback actions."]),
    ...(activeMisconceptions.length > 0
      ? activeMisconceptions.map((line) => `- Misconception: ${line}`)
      : ["- No active misconceptions."]),
    "</learner_feedback>",
  ]

  return {
    coldStart: relevantGoalIds.length === 0,
    workspaceLabel: input.snapshot.workspace.label,
    workspaceTags: [...input.snapshot.workspace.tags],
    relevantGoalIds,
    recommendedNextAction: recommendedAction({
      plan: input.plan,
    }),
    constraintsSummary: [...input.snapshot.constraintsSummary],
    openFeedbackActions,
    sessionPlanSummary: summaryPlan,
    alignmentSummary: summaryAlignment,
    tier1,
    tier2,
    tier3,
  }
}
