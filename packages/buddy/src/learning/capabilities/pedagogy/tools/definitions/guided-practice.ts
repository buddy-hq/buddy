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
    id: 'pedagogy_guided_practice',
    intent: context.intent,
    goalLabel: target,
    learnerContext: summarizeLearnerContext(context),
    sections: [
      [
        'Practice task',
        [
          goal
            ? `Ask the learner to perform: ${goal.task}.`
            : `Ask for one concrete step toward ${target}.`,
          goal
            ? `Success signal: ${goal.howToTest}.`
            : 'Success signal: a concrete learner step with reasoning.',
        ],
      ],
      [
        'Hint ladder',
        [
          'Hint 1: restate the target and the next smallest step.',
          'Hint 2: narrow the subproblem or show the expected shape of the answer.',
          'Hint 3: reveal one concrete correction, then return agency to the learner.',
        ],
      ],
      [
        'Suggested next turn',
        [
          `Run guided practice for ${target} with one step at a time and minimal corrective feedback.`,
        ],
      ],
    ],
  })
}

export const pedagogyGuidedPracticeTool = createBuddyTool('pedagogy_guided_practice', {
  description: 'Generate a guided-practice plan for the active learning goal.',
  parameters: PedagogyToolParameters,
  async execute(params, ctx) {
    await ctx.ask({
      permission: 'pedagogy_guided_practice',
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
      title: 'pedagogy_guided_practice',
      output,
      metadata: {
        intent: context.intent,
        persona: context.persona,
        goalIds: context.goalIds,
      },
    }
  },
})
