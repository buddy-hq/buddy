import z from "zod"
import { createBuddyTool, type BuddyToolContext } from "../../shared/create-buddy-tool.js"
import { LearnerService } from "../../learner/service.js"

const curriculumReadTool = createBuddyTool("curriculum_read", {
  description: "Read the generated learning-plan view for the current workspace.",
  parameters: z.object({}),
  async execute(_params: unknown, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "curriculum_read",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        directory: ctx.directory,
      },
    })

    const workspace = await LearnerService.ensureWorkspaceContext(ctx.directory)
    const current = await LearnerService.getCurriculumView(ctx.directory, {
      workspaceId: workspace.workspaceId,
      persona: "buddy",
      intent: "learn",
      focusGoalIds: [],
      tokenBudget: 1200,
    })
    return {
      title: "learning-plan",
      output: current.markdown,
      metadata: {
        workspaceId: current.workspace.workspaceId,
      },
    }
  },
})

export { curriculumReadTool }
