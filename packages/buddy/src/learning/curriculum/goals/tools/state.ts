import STATE_DESCRIPTION from "./state.md"
import z from "zod"
import { createBuddyTool, type BuddyToolContext } from "../../../tools/create-buddy-tool"
import { LearnerArtifactPath } from "../../../learner-model/repository/path"
import { LearnerArtifactStore } from "../../../learner-model/repository/store"
import type { GoalArtifact } from "../../../learner-model/repository/types"
import { GoalStateSchema, createGoalToolResult } from "../types"

const goalStateTool = createBuddyTool({
  id: "goal_state",
  description: STATE_DESCRIPTION,
  parameters: z.object({}),
  async execute(_params, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "goal_state",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })

    const goals = (
      (await LearnerArtifactStore.listArtifacts({
        directory: ctx.directory,
        kind: "goal",
        status: "active",
      })) as GoalArtifact[]
    ).map((goal) => ({
      goalId: goal.id,
      setId: goal.setId ?? "unspecified",
      scope: goal.scope,
      contextLabel: goal.contextLabel,
      createdAt: goal.createdAt,
    }))
    const activeSets = Array.from(
      new Map(
        goals.map((goal) => [
          goal.setId,
          {
            setId: goal.setId,
            scope: goal.scope,
            contextLabel: goal.contextLabel,
            goalCount: goals.filter((entry) => entry.setId === goal.setId).length,
            createdAt: goal.createdAt,
          },
        ]),
      ).values(),
    )

    const result = GoalStateSchema.parse({
      filePath: LearnerArtifactPath.kindDirectory(ctx.directory, "goal"),
      exists: goals.length > 0,
      activeSetCount: activeSets.length,
      activeSets,
      raw: goals,
    })

    return createGoalToolResult("GoalState", result)
  },
})

export { goalStateTool }
