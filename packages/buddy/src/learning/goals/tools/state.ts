import z from "zod"
import { createBuddyTool, type BuddyToolContext } from "../../shared/create-buddy-tool.js"
import { LearnerService } from "../../learner/service.js"
import { LearnerArtifactPath } from "../../learner/artifacts/path.js"
import type { GoalArtifact } from "../../learner/artifacts/types.js"
import { GoalStateSchema, createGoalToolResult } from "../types.js"

const goalStateTool = createBuddyTool("goal_state", {
  description: "Debug tool that returns the current relevant learner goals for this workspace.",
  parameters: z.object({}),
  async execute(_params, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "goal_state",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })

    const goals = (await LearnerService.listArtifacts({
      directory: ctx.directory,
      kind: "goal",
      status: "active",
    }) as GoalArtifact[]).map((goal) => ({
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
