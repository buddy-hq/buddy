import {
  PedagogyToolParameters,
  type PedagogyToolContext,
  type PedagogyToolParams,
} from "../orchestration/contracts"
import { createBuddyTool } from "../../../../tools/create-buddy-tool"

const compactLine = (value: string) => value.trim().replace(/\s+/g, " ")

const summarizeLearnerContext = (context: PedagogyToolContext) => {
  const lines = context.learnerSummaryLines
    .map((line) => compactLine(line))
    .filter((line) => line.length > 0)

  return lines.slice(0, 4)
}

const formatPedagogyOutput = (input: {
  id: string
  intent: PedagogyToolContext["intent"]
  goalLabel: string
  learnerContext: string[]
  sections: Array<[string, string[]]>
}) => {
  const learnerContextBlock =
    input.learnerContext.length > 0
      ? `Learner context:\n${input.learnerContext.map((line) => `- ${line}`).join("\n")}`
      : ""

  const sectionBlocks = input.sections
    .map(([label, values]) => {
      const items = values.map((value) => compactLine(value)).filter(Boolean)
      if (items.length === 0) return ""
      return `${label}:\n${items.map((item) => `- ${item}`).join("\n")}`
    })
    .filter(Boolean)
    .join("\n")

  return [
    `<pedagogy_tool_output name="${input.id}">`,
    `Intent: ${input.intent}`,
    `Target: ${input.goalLabel}`,
    learnerContextBlock,
    sectionBlocks,
    "</pedagogy_tool_output>",
  ]
    .filter(Boolean)
    .join("\n")
}

const buildOutput = (params: PedagogyToolParams, context: PedagogyToolContext) => {
  const goal = context.goals[0]
  const conceptA = params.conceptA ?? goal?.statement ?? params.topic ?? context.workspaceLabel
  const conceptB = params.conceptB ?? "the closest confusing alternative"

  return formatPedagogyOutput({
    id: "pedagogy_concept_contrast",
    intent: context.intent,
    goalLabel: `${conceptA} vs ${conceptB}`,
    learnerContext: summarizeLearnerContext(context),
    sections: [
      [
        "Contrast guide",
        [
          `Name ${conceptA} and ${conceptB} explicitly.`,
          "Contrast their purpose, shape, and common failure cases.",
          "End with one memory cue the learner can reuse later.",
        ],
      ],
      [
        "Suggested next turn",
        [
          `Give a crisp comparison between ${conceptA} and ${conceptB}, grounded in the current learning goal.`,
        ],
      ],
    ],
  })
}

export const pedagogyConceptContrastTool = createBuddyTool("pedagogy_concept_contrast", {
  description: "Build a concept-contrast teaching guide for two nearby ideas.",
  parameters: PedagogyToolParameters,
  async execute(params, ctx) {
    await ctx.ask({
      permission: "pedagogy_concept_contrast",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        goals: params.goalIds?.length ?? 0,
      },
    })

    const { resolvePedagogyToolContext } = await import("../orchestration/context")
    const context = await resolvePedagogyToolContext(ctx, params)
    const output = buildOutput(params, context)

    return {
      title: "pedagogy_concept_contrast",
      output,
      metadata: {
        intent: context.intent,
        persona: context.persona,
        goalIds: context.goalIds,
      },
    }
  },
})
