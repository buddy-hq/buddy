import z from "zod"
import { createBuddyTool, type BuddyToolContext } from "../../shared/create-buddy-tool.js"
import {
  GoalScopeSchema,
  GoalScopeDecisionSchema,
  createGoalToolResult,
  deriveGoalContextLabel,
  normalizeGoalText,
} from "../types.js"

const goalDecideScopeTool = createBuddyTool("goal_decide_scope", {
  description:
    "Normalize a learner request into a goal-writing brief. Decide course vs topic scope, target count, and whether clarification is required.",
  parameters: z.object({
    learnerRequest: z.string().min(1).describe("The learner's raw request for goal writing."),
    explicitScope: GoalScopeSchema.optional().describe("Optional caller-provided scope override."),
    contextLabel: z.string().optional().describe("Optional explicit label for the course or topic."),
  }),
  async execute(params, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "goal_decide_scope",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        learnerRequest: params.learnerRequest,
        explicitScope: params.explicitScope,
        contextLabel: params.contextLabel,
      },
    })

    const learnerRequest = normalizeGoalText(params.learnerRequest)
    const lower = learnerRequest.toLowerCase()
    const explicitlyRequestedSingleGoal =
      /\b(one|single)\s+goal\b/.test(lower) || /\ba\s+goal\b/.test(lower)

    const explicitScope = params.explicitScope
    const courseSignals = [
      "curriculum",
      "program",
      "overall",
      "whole course",
      "learning plan",
      "roadmap",
      "outcomes",
    ]
    const topicSignals = [
      "module",
      "unit",
      "lesson",
      "sub-skill",
      "subskill",
      "specific part",
      "one goal",
      "single goal",
    ]

    const courseMatches = courseSignals.filter((signal) => lower.includes(signal)).length
    const topicMatches = topicSignals.filter((signal) => lower.includes(signal)).length
    const hasSpecificGoalTarget =
      /\bgoal(?:s)?\b.*\bfor\b/.test(lower) || /\bfor\b.+\b(in|with|using|about)\b/.test(lower)

    let scope = explicitScope ?? ("topic" as const)
    let needsClarification = false
    const clarifyingQuestions: string[] = []
    const assumptions: string[] = []

    if (!explicitScope) {
      if (courseMatches > topicMatches) {
        scope = "course"
      } else if (topicMatches > courseMatches) {
        scope = "topic"
      } else {
        scope = "topic"
        if (!hasSpecificGoalTarget) {
          needsClarification = true
          assumptions.push("Defaulted to topic-level goals until the learner clarifies scope.")
          clarifyingQuestions.push("Do you want course-level goals or topic-level goals?")
          clarifyingQuestions.push("What specific outcome or end task should these goals cover?")
        }
      }
    }

    const contextLabel = normalizeGoalText(params.contextLabel ?? deriveGoalContextLabel(learnerRequest))
    const targetCount = explicitlyRequestedSingleGoal ? 1 : scope === "course" ? 5 : 3

    const result = GoalScopeDecisionSchema.parse({
      learnerRequest,
      scope,
      contextLabel,
      targetCount,
      explicitlyRequestedSingleGoal,
      needsClarification,
      clarifyingQuestions: clarifyingQuestions.slice(0, 2),
      assumptions,
    })

    return createGoalToolResult("GoalScopeDecision", result)
  },
})

export { goalDecideScopeTool }
