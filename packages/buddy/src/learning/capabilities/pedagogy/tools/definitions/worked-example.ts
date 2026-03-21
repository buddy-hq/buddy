import {
  PedagogyToolParameters,
  type PedagogyToolContext,
  type PedagogyToolParams,
} from '../orchestration/contracts'
import { createBuddyTool } from '../../../../tools'

const compactLine = (value: string) => value.trim().replace(/\s+/g, ' ')

const summarizeLearnerContext = (context: PedagogyToolContext) => {
  const lines = context.learnerSummaryLines
    .map((line) => compactLine(line))
    .filter((line) => line.length > 0)

  return lines.slice(0, 4)
}

const formatPedagogyOutput = (input: {
  id: string
  intent: PedagogyToolContext['intent']
  goalLabel: string
  learnerContext: string[]
  sections: Array<[string, string[]]>
}) => {
  const learnerContextBlock =
    input.learnerContext.length > 0
      ? `Learner context:\n${input.learnerContext.map((line) => `- ${line}`).join('\n')}`
      : ''

  const sectionBlocks = input.sections
    .map(([label, values]) => {
      const items = values.map((value) => compactLine(value)).filter(Boolean)
      if (items.length === 0) return ''
      return `${label}:\n${items.map((item) => `- ${item}`).join('\n')}`
    })
    .filter(Boolean)
    .join('\n')

  return [
    `<pedagogy_tool_output name="${input.id}">`,
    `Intent: ${input.intent}`,
    `Target: ${input.goalLabel}`,
    learnerContextBlock,
    sectionBlocks,
    '</pedagogy_tool_output>',
  ]
    .filter(Boolean)
    .join('\n')
}

const buildOutput = (params: PedagogyToolParams, context: PedagogyToolContext) => {
  const goal = context.goals[0]
  const target = goal?.statement ?? params.topic ?? context.workspaceLabel
  return formatPedagogyOutput({
    id: 'pedagogy_worked_example',
    intent: context.intent,
    goalLabel: target,
    learnerContext: summarizeLearnerContext(context),
    sections: [
      [
        'Example frame',
        [
          `Choose one representative example for ${target}.`,
          'Solve it step by step and name the reasoning at each step.',
          goal
            ? `Call out the reusable pattern that would let the learner satisfy: ${goal.howToTest}.`
            : 'Call out the reusable pattern the learner should copy.',
        ],
      ],
      [
        'Suggested next turn',
        [`Show one complete worked example for ${target}, then invite a guided attempt.`],
      ],
    ],
  })
}

export const pedagogyWorkedExampleTool = createBuddyTool('pedagogy_worked_example', {
  description: 'Build a worked-example teaching plan for the current learning goal.',
  parameters: PedagogyToolParameters,
  async execute(params, ctx) {
    await ctx.ask({
      permission: 'pedagogy_worked_example',
      patterns: ['*'],
      always: ['*'],
      metadata: {
        goals: params.goalIds?.length ?? 0,
      },
    })

    const { resolvePedagogyToolContext } = await import('../orchestration/context')
    const context = await resolvePedagogyToolContext(ctx, params)
    const output = buildOutput(params, context)

    return {
      title: 'pedagogy_worked_example',
      output,
      metadata: {
        intent: context.intent,
        persona: context.persona,
        goalIds: context.goalIds,
      },
    }
  },
})
