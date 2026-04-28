import QUERY_DESCRIPTION from "./query.md"
import z from "zod"
import { PERSONAS } from "@buddy/backend/learning/shared/teaching-vocabulary"
import { createBuddyTool, type BuddyToolContext } from "../../tools/create-buddy-tool"

const learnerStateQueryTool = createBuddyTool({
  id: "learner_snapshot_read",
  description: QUERY_DESCRIPTION,
  parameters: z.object({
    persona: z.enum(PERSONAS).optional(),
    focusGoalIds: z.array(z.string()).optional(),
  }),
  async execute(params, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "learner_snapshot_read",
      patterns: ["*"],
      always: ["*"],
      metadata: {},
    })

    const { LearnerSnapshotCompiler } = await import("../projections/snapshot")
    const snapshot = await LearnerSnapshotCompiler.compile({
      directory: ctx.directory,
      query: {
        persona: params.persona ?? "buddy",
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
      },
    }
  },
})

export { learnerStateQueryTool }
