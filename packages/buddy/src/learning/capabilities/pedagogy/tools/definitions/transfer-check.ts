import { PedagogyToolParameters, type PedagogyToolContext, type PedagogyToolParams } from "../orchestration/contracts"
import { createBuddyTool } from "../../../../tools"

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
      id: "pedagogy_transfer_check",
      intent: context.intent,
      goalLabel: target,
      learnerContext: summarizeLearnerContext(context),
      sections: [
        ["Transfer challenge", [
          `Change one meaningful condition around ${target}.`,
          "Ask the learner to adapt the idea to that new setting.",
        ]],
        ["Interpretation", [
          "Use the result to decide whether understanding survives context changes.",
        ]],
      ],
    })
}

export const pedagogyTransferCheckTool = createBuddyTool("pedagogy_transfer_check", {
  description: "Generate a transfer check that changes one meaningful condition.",
  parameters: PedagogyToolParameters,
  async execute(params, ctx) {
    await ctx.ask({
      permission: "pedagogy_transfer_check",
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
      title: "pedagogy_transfer_check",
      output,
      metadata: {
        intent: context.intent,
        persona: context.persona,
        goalIds: context.goalIds,
      },
    }
  },
})
