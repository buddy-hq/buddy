import { readTeachingSessionState } from "../../../../../agent-execution"
import type { TeachingIntentId } from "../../../../../agent-execution"
import type { BuddyToolContext } from "../../../../../shared"
import { buildPromptContext, ensureWorkspaceContext, listArtifacts } from "../../../../../learner-model"
import type { GoalArtifact } from "../../../../../learner-model"
import type { ActivityToolContext, ActivityToolParams } from "./contracts"

export function compactLine(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

export function pickPrimaryGoal(context: ActivityToolContext) {
  return context.goals[0]
}

export function summarizeLearnerContext(context: ActivityToolContext) {
  const lines = [...context.tier1, ...context.tier2, ...context.tier3]
    .map((line) => compactLine(line))
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith("<") && !line.endsWith(">"))

  return lines.slice(0, 4)
}

export async function resolveActivityToolContext(
  ctx: BuddyToolContext,
  intent: TeachingIntentId,
  params: ActivityToolParams,
): Promise<ActivityToolContext> {
  const runtimeState = readTeachingSessionState(ctx.directory, ctx.sessionID)
  const workspace = await ensureWorkspaceContext(ctx.directory)
  const requestedGoalIds = params.goalIds ?? []
  const focusGoalIds = requestedGoalIds.length > 0 ? requestedGoalIds : runtimeState?.focusGoalIds ?? []
  const digest = await buildPromptContext({
    directory: ctx.directory,
    query: {
      persona: runtimeState?.persona ?? "buddy",
      intent,
      focusGoalIds,
    },
  })
  const goalIds = focusGoalIds.length > 0 ? focusGoalIds : digest.relevantGoalIds
  const goals = ((await listArtifacts({
    directory: ctx.directory,
    kind: "goal",
    status: "active",
  })) as GoalArtifact[])
    .filter((goal) => goalIds.includes(goal.id))
    .slice(0, 3)

  return {
    workspaceLabel: workspace.label,
    persona: runtimeState?.persona ?? "buddy",
    intent: runtimeState?.intentOverride,
    goalIds,
    goals,
    tier1: digest.tier1,
    tier2: digest.tier2,
    tier3: digest.tier3,
  }
}
