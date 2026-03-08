import { readTeachingSessionState } from "../../../runtime/session-state.js"
import type { TeachingIntentId } from "../../../runtime/types.js"
import type { BuddyToolContext } from "../../../shared/create-buddy-tool.js"
import { LearnerService } from "../../../learner/service.js"
import type { GoalArtifact } from "../../../learner/artifacts/types.js"
import type { ActivityToolContext, ActivityToolParams } from "./contracts.js"

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
  const workspace = await LearnerService.ensureWorkspaceContext(ctx.directory)
  const requestedGoalIds = params.goalIds ?? []
  const focusGoalIds = requestedGoalIds.length > 0 ? requestedGoalIds : runtimeState?.focusGoalIds ?? []
  const digest = await LearnerService.buildPromptContext({
    directory: ctx.directory,
    query: {
      persona: runtimeState?.persona ?? "buddy",
      intent,
      focusGoalIds,
    },
  })
  const goalIds = focusGoalIds.length > 0 ? focusGoalIds : digest.relevantGoalIds
  const goals = ((await LearnerService.listArtifacts({
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
