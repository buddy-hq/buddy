import REFLECTION_DESCRIPTION from "./reflection.md"
import z from "zod"
import { type PedagogyToolContext, type PedagogyToolParams } from "./orchestration/contracts"
import {
  createBuddyTool,
  type BuddyToolContext,
  type ToolPresentationDescriptor,
} from "../../../runtime/create-buddy-tool"

const DYNAMIC_REFLECTION_TOOL_ID = "reflection_dynamic" as const

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
        "Reflection prompt",
        [
          `Ask the learner to explain how they would approach ${target}.`,
          "Probe one assumption, gap, or confidence claim.",
        ],
      ],
      [
        "Interpretation",
        [
          "Look for grounded reasoning, not confidence theater.",
          "Choose the next move from the learner's explanation quality.",
        ],
      ],
    ],
  })
}

async function executeReflectionTool(
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

  const { resolvePedagogyToolContext } = await import("./orchestration/context")
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

const reflectionPresentation = {
  archetype: "activity",
  icon: "tool",
  renderer: "buddy-custom",
  layoutRole: "activity",
  phases: {
    pending: { action: "Preparing reflection" },
    running: { action: "Preparing reflection" },
    completed: { action: "Prepared reflection" },
    error: { action: "Failed to prepare reflection" },
  },
  summary: {
    category: "prepare-reflection",
    pending: "Preparing reflection",
    running: "Preparing reflection",
    completed: "Prepared reflection",
    error: "Failed to prepare reflection",
  },
} satisfies ToolPresentationDescriptor

export const reflectionTool = createBuddyTool({
  id: "reflection",
  description: REFLECTION_DESCRIPTION,
  parameters: PedagogyToolParameters,
  presentation: reflectionPresentation,
  async execute(params, ctx) {
    return executeReflectionTool("reflection", params, ctx)
  },
})

export const dynamicReflectionTool = createBuddyTool({
  id: DYNAMIC_REFLECTION_TOOL_ID,
  description: REFLECTION_DESCRIPTION,
  parameters: PedagogyToolParameters,
  presentation: reflectionPresentation,
  dynamic: {
    title: "Pedagogy reflection",
    useCase: "reflection",
    keywords: [
      "reflection",
      "metacognition",
      "misconception",
      "reasoning",
      "confidence",
      "explain",
    ],
    searchText:
      "explain reasoning summarize learning assumption learner self explanation next move misconception repair",
    sideEffects: ["learner-state-read"],
  },
  async execute(params, ctx) {
    return executeReflectionTool(DYNAMIC_REFLECTION_TOOL_ID, params, ctx)
  },
})
