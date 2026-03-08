import z from "zod"
import { createBuddyTool, type BuddyToolContext } from "../../shared/create-buddy-tool.js"
import { LearnerService } from "../service.js"
import { PERSONA_IDS, TEACHING_INTENT_IDS } from "../../runtime/types.js"

const learnerStateQueryTool = createBuddyTool("learner_snapshot_read", {
  description: "Read the current learner state summary for this workspace from the cross-notebook learner store.",
  parameters: z.object({
    persona: z.enum(PERSONA_IDS).optional(),
    intent: z.enum(TEACHING_INTENT_IDS).optional(),
    focusGoalIds: z.array(z.string()).optional(),
  }),
  async execute(params, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "learner_snapshot_read",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        intent: params.intent,
      },
    })

    const snapshot = await LearnerService.getWorkspaceSnapshot({
      directory: ctx.directory,
      query: {
        persona: params.persona ?? "buddy",
        intent: params.intent,
        focusGoalIds: params.focusGoalIds ?? [],
      },
    })
    const planDecision = await LearnerService.ensurePlanDecision({
      directory: ctx.directory,
      query: {
        persona: params.persona ?? "buddy",
        intent: params.intent,
        focusGoalIds: params.focusGoalIds ?? [],
      },
    })
    const relevantGoalIds = snapshot.goals.map((goal) => goal.id)

    return {
      title: "learner_state",
      output: snapshot.markdown,
      metadata: {
        workspaceId: snapshot.workspace.workspaceId,
        relevantGoalIds,
        latestPlanDecisionId: planDecision.decision?.id,
      },
    }
  },
})

export { learnerStateQueryTool }
