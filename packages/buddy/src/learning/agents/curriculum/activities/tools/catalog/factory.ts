import { createBuddyTool } from "../../../../../shared"
import { resolveActivityToolContext } from "./context"
import { ActivityToolParameters, type ActivityToolDefinition } from "./contracts"

export function createActivityTool<const Id extends `activity_${string}`>(
  definition: ActivityToolDefinition<Id>,
) {
  return createBuddyTool(definition.id, {
    description: definition.description,
    parameters: ActivityToolParameters,
    async execute(params, ctx) {
      await ctx.ask({
        permission: definition.id,
        patterns: ["*"],
        always: ["*"],
        metadata: {
          intent: definition.intent,
          goals: params.goalIds?.length ?? 0,
        },
      })

      const context = await resolveActivityToolContext(ctx, definition.intent, params)
      const output = definition.buildOutput(params, context)

      return {
        title: definition.id,
        output,
        metadata: {
          intent: definition.intent,
          persona: context.persona,
          goalIds: context.goalIds,
        },
      }
    },
  })
}
