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
      id: "pedagogy_explanation",
      intent: context.intent,
      goalLabel: target,
      learnerContext: summarizeLearnerContext(context),
      sections: [
        ["Teaching plan", [
          `State ${target} in plain language before using jargon.`,
          `Connect the explanation to ${goal?.task ?? "the learner's current task"}.`,
          "Use only one compact example if it removes confusion.",
        ]],
        ["Suggested next turn", [
          `Explain ${target} directly, then bridge to one concrete next action.`,
        ]],
        ["Bridge", [
          goal
            ? `End by inviting either guided practice or a short check for: ${goal.howToTest}.`
            : "End by inviting a concrete next step.",
        ]],
      ],
    })
}

export const pedagogyExplanationTool = createBuddyTool("pedagogy_explanation", {
  description: "Build a concise explanation plan grounded in the current learner state and active goals.",
  parameters: PedagogyToolParameters,
  async execute(params, ctx) {
    await ctx.ask({
      permission: "pedagogy_explanation",
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
      title: "pedagogy_explanation",
      output,
      metadata: {
        intent: context.intent,
        persona: context.persona,
        goalIds: context.goalIds,
      },
    }
  },
})
