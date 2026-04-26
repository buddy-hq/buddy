import { readTeachingSessionState } from "../../../../agent-execution/state/session-state"
import type { BuddyToolContext } from "../../../../tools/create-buddy-tool"
import { LearnerSnapshotCompiler } from "../../../../learner-model/projections/snapshot"
import { LearnerArtifactStore } from "../../../../learner-model/repository/store"
import type { GoalArtifact } from "../../../../learner-model/repository/types"
import { ensureWorkspaceContext } from "../../../../learner-model/workflows/workspace"
import type { PedagogyToolContext, PedagogyToolParams } from "./contracts"

const compactLine = (value: string) => value.trim().replace(/\s+/g, " ")

export async function resolvePedagogyToolContext(
  ctx: BuddyToolContext,
  params: PedagogyToolParams,
): Promise<PedagogyToolContext> {
  const runtimeState = readTeachingSessionState(ctx.directory, ctx.sessionID)
  const workspace = await ensureWorkspaceContext(ctx.directory)
  const requestedGoalIds = params.goalIds ?? []
  const focusGoalIds =
    requestedGoalIds.length > 0 ? requestedGoalIds : (runtimeState?.focusGoalIds ?? [])
  const snapshot = await LearnerSnapshotCompiler.compile({
    directory: ctx.directory,
    query: {
      persona: runtimeState?.persona ?? "buddy",
      focusGoalIds,
      workspaceState: runtimeState?.workspaceState,
    },
  })
  const goalIds = focusGoalIds.length > 0 ? focusGoalIds : snapshot.goals.map((goal) => goal.id)
  const goals = (
    (await LearnerArtifactStore.listArtifacts({
      directory: ctx.directory,
      kind: "goal",
      status: "active",
    })) as GoalArtifact[]
  )
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
    goalIds,
    goals,
    learnerSummaryLines,
  }
}
