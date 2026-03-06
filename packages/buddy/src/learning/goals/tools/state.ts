import z from "zod"
import { createBuddyTool, type BuddyToolContext } from "../../shared/create-buddy-tool.js"
import { LearnerPath } from "../../learner/path.js"
import { LearnerService } from "../../learner/service.js"
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

    const goals = await LearnerService.getWorkspaceGoals(ctx.directory)
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
      filePath: LearnerPath.goals(),
      exists: goals.length > 0,
      activeSetCount: activeSets.length,
      activeSets,
      raw: goals,
    })

    return createGoalToolResult("GoalState", result)
  },
})

export { goalStateTool }
