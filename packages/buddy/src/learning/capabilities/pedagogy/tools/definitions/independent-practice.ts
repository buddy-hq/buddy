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
  const target = goal?.statement ?? params.topic ?? context.workspaceLabel

  return formatPedagogyOutput({
    id: "pedagogy_independent_practice",
    intent: context.intent,
    goalLabel: target,
    learnerContext: summarizeLearnerContext(context),
    sections: [
      [
        "Practice task",
        [
          goal
            ? `Assign one focused task: ${goal.task}.`
            : `Assign one focused task for ${target}.`,
          goal
            ? `Expected deliverable: ${goal.howToTest}.`
            : "Expected deliverable: one complete learner attempt.",
        ],
      ],
      [
        "Teacher stance",
        [
          "State the deliverable and success criteria clearly.",
          "Hold back hints until the learner responds or asks.",
        ],
      ],
      [
        "Suggested next turn",
        [`Assign one clean independent attempt for ${target} with explicit success criteria.`],
      ],
    ],
  })
}

export const pedagogyIndependentPracticeTool = createBuddyTool("pedagogy_independent_practice", {
  description: "Generate an independent-practice task for the active learning goal.",
  parameters: PedagogyToolParameters,
  async execute(params, ctx) {
    await ctx.ask({
      permission: "pedagogy_independent_practice",
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
      title: "pedagogy_independent_practice",
      output,
      metadata: {
        intent: context.intent,
        persona: context.persona,
        goalIds: context.goalIds,
      },
    }
  },
})
