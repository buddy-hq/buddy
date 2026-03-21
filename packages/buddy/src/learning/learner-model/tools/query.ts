import z from 'zod'
import { PERSONAS, INTENTS } from '@buddy/backend/learning/shared/teaching-vocabulary'
import { createBuddyTool, type BuddyToolContext } from '../../tools'
import { ensurePlanDecision } from '..'

const learnerStateQueryTool = createBuddyTool('learner_snapshot_read', {
  description:
    'Read the current learner state summary for this workspace from the cross-notebook learner store.',
  parameters: z.object({
    persona: z.enum(PERSONAS).optional(),
    intent: z.enum(INTENTS).default('auto'),
    focusGoalIds: z.array(z.string()).optional(),
  }),
  async execute(params, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: 'learner_snapshot_read',
      patterns: ['*'],
      always: ['*'],
      metadata: {
        intent: params.intent,
      },
    })

    const planDecision = await ensurePlanDecision({
      directory: ctx.directory,
      query: {
        persona: params.persona ?? 'buddy',
        intent: params.intent,
        focusGoalIds: params.focusGoalIds ?? [],
      },
    })
    const relevantGoalIds = planDecision.snapshot.goals.map((goal) => goal.id)

    return {
      title: 'learner_state',
      output: planDecision.snapshot.markdown,
      metadata: {
        workspaceId: planDecision.snapshot.workspace.workspaceId,
        relevantGoalIds,
        latestPlanDecisionId: planDecision.decision?.id,
      },
    }
  },
})

export { learnerStateQueryTool }
