import z from "zod"
import { createBuddyTool, type BuddyToolContext } from "../../shared/create-buddy-tool.js"
import { listActiveGoalSets, readGoalsV1File } from "../goals-v1.js"
import { GoalsV1Path } from "../path.js"
import { GoalStateSchema, createGoalToolResult } from "../types.js"

const goalStateTool = createBuddyTool("goal_state", {
  description: "Debug tool that returns the current active goal sets and the raw goals.v1 JSON document.",
  parameters: z.object({}),
  async execute(_params, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "goal_state",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })

    const file = await readGoalsV1File(ctx.directory)
    const activeSets = file ? listActiveGoalSets(file.data) : []

    const result = GoalStateSchema.parse({
      filePath: file?.path ?? GoalsV1Path.file(ctx.directory),
      exists: Boolean(file),
      activeSetCount: activeSets.length,
      activeSets: activeSets.map((set) => ({
        setId: set.setId,
        scope: set.scope,
        contextLabel: set.contextLabel,
        goalCount: set.goals.length,
        createdAt: set.createdAt,
      })),
      raw: file?.data,
    })

    return createGoalToolResult("GoalState", result)
  },
})

export { goalStateTool }
