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
    id: "pedagogy_retrieval_check",
    intent: context.intent,
    goalLabel: target,
    learnerContext: summarizeLearnerContext(context),
    sections: [
      [
        "Check prompt",
        [
          `Ask the learner to recall or apply ${target} without heavy prompting.`,
          "Keep the prompt narrow enough to isolate the target idea.",
        ],
      ],
      ["Interpretation", ["Judge whether the learner can retrieve and use the concept unaided."]],
    ],
  })
}

export const pedagogyRetrievalCheckTool = createBuddyTool("pedagogy_retrieval_check", {
  description: "Generate a lightweight retrieval check for the active goal.",
  parameters: PedagogyToolParameters,
  async execute(params, ctx) {
    await ctx.ask({
      permission: "pedagogy_retrieval_check",
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
      title: "pedagogy_retrieval_check",
      output,
      metadata: {
        intent: context.intent,
        persona: context.persona,
        goalIds: context.goalIds,
      },
    }
  },
})
