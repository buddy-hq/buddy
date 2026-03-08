import z from "zod"
import { createBuddyTool, type BuddyToolContext } from "../../shared/create-buddy-tool.js"
import { LearnerService } from "../../learner/service.js"

const curriculumReadTool = createBuddyTool("learner_snapshot_read", {
  description: "Read the generated learning-plan view for the current workspace.",
  parameters: z.object({}),
  async execute(_params: unknown, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "learner_snapshot_read",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        directory: ctx.directory,
      },
    })

    const snapshot = await LearnerService.getWorkspaceSnapshot({
      directory: ctx.directory,
      query: {
        persona: "buddy",
        intent: "learn",
        focusGoalIds: [],
      },
    })
    const planResult = await LearnerService.ensurePlanDecision({
      directory: ctx.directory,
      query: {
        persona: "buddy",
        intent: "learn",
        focusGoalIds: [],
      },
    })
    const markdown = [
      snapshot.markdown,
      "",
      "## Plan",
      `- Suggested activity: ${planResult.plan.suggestedActivity}`,
      `- Scaffolding: ${planResult.plan.suggestedScaffoldingLevel}`,
      ...planResult.plan.rationale.map((line) => `- ${line}`),
    ].join("\n")
    return {
      title: "learning-plan",
      output: markdown,
      metadata: {
        workspaceId: snapshot.workspace.workspaceId,
        latestPlanDecisionId: planResult.decision?.id,
      },
    }
  },
})

export { curriculumReadTool }
