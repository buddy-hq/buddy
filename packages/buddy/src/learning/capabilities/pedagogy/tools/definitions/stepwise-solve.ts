import STEPWISE_SOLVE_DESCRIPTION from "./stepwise-solve.md"
import z from "zod"
import { type PedagogyToolContext, type PedagogyToolParams } from "../orchestration/contracts"
import { createBuddyTool } from "../../../../tools/create-buddy-tool"

const PedagogyToolParameters = z.object({
  goalIds: z.array(z.string()).default([]),
  topic: z.string().optional(),
  learnerRequest: z.string().optional(),
  conceptA: z.string().optional(),
  conceptB: z.string().optional(),
  analogyDomain: z.string().optional(),
})

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
    id: "pedagogy_stepwise_solve",
    intent: context.intent,
    goalLabel: target,
    learnerContext: summarizeLearnerContext(context),
    sections: [
      [
        "Solve guide",
        [
          `Restate the target quantity or proof goal for ${target}.`,
          "Ask for the next justified step, not the whole solve.",
          "Use a figure only if it materially reduces ambiguity.",
        ],
      ],
      [
        "Suggested next turn",
        [`Coach a stepwise solve for ${target} without taking over the full solution.`],
      ],
    ],
  })
}

export const pedagogyStepwiseSolveTool = createBuddyTool("pedagogy_stepwise_solve", {
  description: STEPWISE_SOLVE_DESCRIPTION,
  parameters: PedagogyToolParameters,
  async execute(params, ctx) {
    await ctx.ask({
      permission: "pedagogy_stepwise_solve",
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
      title: "pedagogy_stepwise_solve",
      output,
      metadata: {
        intent: context.intent,
        persona: context.persona,
        goalIds: context.goalIds,
      },
    }
  },
})
