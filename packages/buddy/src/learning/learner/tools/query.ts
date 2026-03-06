import z from "zod"
import { createBuddyTool, type BuddyToolContext } from "../../shared/create-buddy-tool.js"
import { LearnerService } from "../service.js"
import { PERSONA_IDS, TEACHING_INTENT_IDS } from "../../runtime/types.js"

const learnerStateQueryTool = createBuddyTool("learner_state_query", {
  description: "Read the current learner state summary for this workspace from the cross-notebook learner store.",
  parameters: z.object({
    persona: z.enum(PERSONA_IDS).optional(),
    intent: z.enum(TEACHING_INTENT_IDS).optional(),
    focusGoalIds: z.array(z.string()).optional(),
  }),
  async execute(params, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "learner_state_query",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        intent: params.intent,
      },
    })

    const workspace = await LearnerService.ensureWorkspaceContext(ctx.directory)
    const digest = await LearnerService.queryForPrompt({
      directory: ctx.directory,
      query: {
        workspaceId: workspace.workspaceId,
        persona: params.persona ?? "buddy",
        intent: params.intent,
        focusGoalIds: params.focusGoalIds ?? [],
        tokenBudget: 1200,
      },
    })

    return {
      title: "learner_state",
      output: [...digest.tier1, ...digest.tier2, ...digest.tier3].join("\n"),
      metadata: {
        workspaceId: workspace.workspaceId,
        relevantGoalIds: digest.relevantGoalIds,
        coldStart: digest.coldStart,
      },
    }
  },
})

export { learnerStateQueryTool }
