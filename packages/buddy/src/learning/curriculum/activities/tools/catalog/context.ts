import { readTeachingSessionState } from "../../../../agent-execution/state"
import type { Intent } from "@buddy/backend/learning/shared/teaching-vocabulary"
import type { BuddyToolContext } from "../../../../tools"
import { ensureWorkspaceContext, getWorkspaceSnapshot, listArtifacts } from "../../../../learner-model"
import type { GoalArtifact } from "../../../../learner-model"
import type { ActivityToolContext, ActivityToolParams } from "./contracts"

export function compactLine(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

export function pickPrimaryGoal(context: ActivityToolContext) {
  return context.goals[0]
}

export function summarizeLearnerContext(context: ActivityToolContext) {
  const lines = context.learnerSummaryLines
    .map((line) => compactLine(line))
    .filter((line) => line.length > 0)

  return lines.slice(0, 4)
}

export async function resolveActivityToolContext(
  ctx: BuddyToolContext,
  intent: Intent,
  params: ActivityToolParams,
): Promise<ActivityToolContext> {
  const runtimeState = readTeachingSessionState(ctx.directory, ctx.sessionID)
  const workspace = await ensureWorkspaceContext(ctx.directory)
  const requestedGoalIds = params.goalIds ?? []
  const focusGoalIds = requestedGoalIds.length > 0 ? requestedGoalIds : runtimeState?.focusGoalIds ?? []
  const snapshot = await getWorkspaceSnapshot({
    directory: ctx.directory,
    query: {
      persona: runtimeState?.persona ?? "buddy",
      intent,
      focusGoalIds,
      workspaceState: runtimeState?.workspaceState,
    },
  })
  const goalIds = focusGoalIds.length > 0 ? focusGoalIds : snapshot.goals.map((goal) => goal.id)
  const goals = ((await listArtifacts({
    directory: ctx.directory,
    kind: "goal",
    status: "active",
  })) as GoalArtifact[])
    .filter((goal) => goalIds.includes(goal.id))
    .slice(0, 3)
  const learnerSummaryLines = [
    `Workspace: ${workspace.label}`,
    snapshot.goals.length > 0
      ? `Primary goal: ${compactLine(snapshot.goals[0]?.statement ?? "")}`
      : "No active goals in scope.",
    `Open feedback items: ${snapshot.openFeedback.length}`,
    `Active misconceptions: ${snapshot.activeMisconceptions.length}`,
    `Recent evidence records: ${snapshot.recentEvidence.length}`,
    ...snapshot.constraintsSummary.map((line) => `Constraint: ${compactLine(line)}`),
  ]

  return {
    workspaceLabel: workspace.label,
    persona: runtimeState?.persona ?? "buddy",
    intent: runtimeState?.intent ?? "auto",
    goalIds,
    goals,
    learnerSummaryLines,
  }
}
