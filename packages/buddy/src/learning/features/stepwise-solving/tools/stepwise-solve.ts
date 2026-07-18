import STEPWISE_SOLVE_DESCRIPTION from "./stepwise-solve.md"
import z from "zod"
import {
  type PedagogyToolContext,
  type PedagogyToolParams,
} from "../../teaching-guidance/tools/orchestration/contracts"
import {
  createBuddyTool,
  type BuddyToolContext,
  type ToolPresentationDescriptor,
} from "../../../runtime/create-buddy-tool"

const DYNAMIC_STEPWISE_SOLVE_TOOL_ID = "stepwise_solve_dynamic" as const

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
    `<tool_output name="${input.id}">`,
    `Target: ${input.goalLabel}`,
    learnerContextBlock,
    sectionBlocks,
    "</tool_output>",
  ]
    .filter(Boolean)
    .join("\n")
}

const buildOutput = (input: {
  id: string
  params: PedagogyToolParams
  context: PedagogyToolContext
}) => {
  const { params, context } = input
  const goal = context.goals[0]
  const target = goal?.statement ?? params.topic ?? context.workspaceLabel

  return formatPedagogyOutput({
    id: input.id,
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

async function executeStepwiseSolveTool(
  id: string,
  params: z.infer<typeof PedagogyToolParameters>,
  ctx: BuddyToolContext,
) {
  await ctx.ask({
    permission: id,
    patterns: ["*"],
    always: ["*"],
    metadata: {
      goals: params.goalIds?.length ?? 0,
    },
  })

  const { resolvePedagogyToolContext } =
    await import("../../teaching-guidance/tools/orchestration/context")
  const context = await resolvePedagogyToolContext(ctx, params)
  const output = buildOutput({ id, params, context })

  return {
    title: id,
    output,
    metadata: {
      persona: context.persona,
      goalIds: context.goalIds,
    },
  }
}

const stepwiseSolvePresentation = {
  archetype: "activity",
  icon: "tool",
  renderer: "buddy-custom",
  layoutRole: "activity",
  phases: {
    pending: { action: "Preparing stepwise guidance" },
    running: { action: "Preparing stepwise guidance" },
    completed: { action: "Prepared stepwise guidance" },
    error: { action: "Failed to prepare stepwise guidance" },
  },
  summary: {
    category: "prepare-stepwise-guidance",
    pending: "Preparing stepwise guidance",
    running: "Preparing stepwise guidance",
    completed: "Prepared stepwise guidance",
    error: "Failed to prepare stepwise guidance",
  },
} satisfies ToolPresentationDescriptor

export const stepwiseSolveTool = createBuddyTool({
  id: "stepwise_solve",
  description: STEPWISE_SOLVE_DESCRIPTION,
  parameters: PedagogyToolParameters,
  presentation: stepwiseSolvePresentation,
  async execute(params, ctx) {
    return executeStepwiseSolveTool("stepwise_solve", params, ctx)
  },
})

export const dynamicStepwiseSolveTool = createBuddyTool({
  id: DYNAMIC_STEPWISE_SOLVE_TOOL_ID,
  description: STEPWISE_SOLVE_DESCRIPTION,
  parameters: PedagogyToolParameters,
  presentation: stepwiseSolvePresentation,
  dynamic: {
    title: "Pedagogy stepwise solve",
    useCase: "stepwise-solve",
    keywords: ["stepwise", "solve", "math", "proof", "hint", "equation"],
    searchText: "guided next step problem solution derivation equation geometry",
    sideEffects: ["learner-state-read"],
  },
  async execute(params, ctx) {
    return executeStepwiseSolveTool(DYNAMIC_STEPWISE_SOLVE_TOOL_ID, params, ctx)
  },
})
