import z from "zod"
import { createBuddyTool, type BuddyToolContext } from "../../shared/create-buddy-tool.js"
import { LearnerService } from "../../learner/service.js"
import { GoalCommitResultSchema, GoalSchema, GoalScopeSchema, createGoalToolResult } from "../types.js"

const goalCommitTool = createBuddyTool("goal_commit", {
  description:
    "Persist a goal set to the cross-notebook learner store. Archives any previous active set with the same scope+contextLabel.",
  parameters: z.object({
    scope: GoalScopeSchema,
    contextLabel: z.string().min(1),
    learnerRequest: z.string().min(1),
    goals: z.array(GoalSchema).min(1),
    rationaleSummary: z.string().optional(),
    assumptions: z.array(z.string()).optional(),
    openQuestions: z.array(z.string()).optional(),
  }),
  async execute(params, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "goal_commit",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        scope: params.scope,
        contextLabel: params.contextLabel,
        goals: params.goals.length,
      },
    })

    const commit = await LearnerService.commitGoals({
      directory: ctx.directory,
      scope: params.scope,
      contextLabel: params.contextLabel,
      learnerRequest: params.learnerRequest,
      goals: params.goals,
      rationaleSummary: params.rationaleSummary,
      assumptions: params.assumptions,
      openQuestions: params.openQuestions,
    })

    const result = GoalCommitResultSchema.parse({
      committed: true,
      filePath: commit.filePath,
      setId: commit.setId,
      goalIds: commit.goalIds,
      archivedSetIds: commit.archivedSetIds,
    })

    return createGoalToolResult("GoalCommitResult", result)
  },
})

export { goalCommitTool }
