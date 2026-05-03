import DEBUG_ATTEMPT_DESCRIPTION from "./debug-attempt.md"
import z from "zod"
import {
  type PedagogyToolContext,
  type PedagogyToolParams,
} from "../../teaching-guidance/tools/orchestration/contracts"
import { createBuddyTool, type BuddyToolContext } from "../../../runtime/create-buddy-tool"

const DYNAMIC_DEBUG_ATTEMPT_TOOL_ID = "debug_attempt_dynamic" as const

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
  const target = goal?.statement ?? params.topic ?? "the current code path"

  return formatPedagogyOutput({
    id: input.id,
    goalLabel: target,
    learnerContext: summarizeLearnerContext(context),
    sections: [
      [
        "Debug loop",
        [
          "Identify the failing behavior before proposing a fix.",
          "Inspect the smallest relevant code region first.",
          "Run one hypothesis and one fix at a time.",
        ],
      ],
      [
        "Workspace hooks",
        [
          "Use the lesson workspace tools when you need to point at the right file or checkpoint accepted work.",
        ],
      ],
      [
        "Suggested next turn",
        [`Turn the learner's bug into a structured debugging lesson for ${target}.`],
      ],
    ],
  })
}

async function executeDebugAttemptTool(
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

export const debugAttemptTool = createBuddyTool({
  id: "debug_attempt",
  description: DEBUG_ATTEMPT_DESCRIPTION,
  parameters: PedagogyToolParameters,
  constraints: {
    teachingWorkspace: "active",
  },
  async execute(params, ctx) {
    return executeDebugAttemptTool("debug_attempt", params, ctx)
  },
})

export const dynamicDebugAttemptTool = createBuddyTool({
  id: DYNAMIC_DEBUG_ATTEMPT_TOOL_ID,
  description: DEBUG_ATTEMPT_DESCRIPTION,
  parameters: PedagogyToolParameters,
  constraints: {
    teachingWorkspace: "active",
  },
  dynamic: {
    title: "Pedagogy debug attempt",
    useCase: "debugging",
    keywords: ["debug", "bug", "error", "failure", "hypothesis", "diagnose"],
    searchText: "failed attempt reproduce diagnose fix code workspace trace inspect",
    sideEffects: ["learner-state-read"],
  },
  async execute(params, ctx) {
    return executeDebugAttemptTool(DYNAMIC_DEBUG_ATTEMPT_TOOL_ID, params, ctx)
  },
})
