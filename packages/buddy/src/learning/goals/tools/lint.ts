import z from "zod"
import { createBuddyTool, type BuddyToolContext } from "../../shared/create-buddy-tool.js"
import {
  GoalLintIssueSchema,
  GoalLintReportSchema,
  GoalSchema,
  createGoalToolResult,
  hasGoalTemplatePrefix,
  inferGoalCognitiveLevel,
  isLikelyCompoundTask,
  isLikelyJargonHeavy,
  isLikelyTestableTask,
  isLikelyTooBroadTask,
  isLikelyTopicLabel,
  isLikelyWeakRelevance,
  normalizeGoalText,
  type GoalScope,
} from "../types.js"

const vagueVerbs = new Set([
  "understand",
  "know",
])

const goalLintTool = createBuddyTool("goal_lint", {
  description:
    "Apply deterministic lint rules to a goal set. Core violations are blocking errors; softer issues become warnings.",
  parameters: z.object({
    scope: z.enum(["course", "topic"]),
    goals: z.array(GoalSchema).min(1),
    explicitlyRequestedSingleGoal: z.boolean(),
  }),
  async execute(params, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "goal_lint",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        scope: params.scope,
        goals: params.goals.length,
        explicitlyRequestedSingleGoal: params.explicitlyRequestedSingleGoal,
      },
    })

    const errors = [] as ReturnType<typeof GoalLintIssueSchema.parse>[]
    const warnings = [] as ReturnType<typeof GoalLintIssueSchema.parse>[]

    function pushIssue(input: {
      goalIndex: number
      field: "statement" | "actionVerb" | "task" | "cognitiveLevel" | "howToTest" | "goal"
      code:
        | "VAGUE_VERB"
        | "MISSING_TESTABILITY"
        | "COMPOUND_GOAL"
        | "TOPIC_NOT_TASK"
        | "TEMPLATE_MISMATCH"
        | "LEVEL_VERB_MISMATCH"
        | "TOO_BROAD"
        | "JARGON_HEAVY"
        | "WEAK_RELEVANCE"
        | "COUNT_OUT_OF_RANGE"
      severity: "error" | "warning"
      message: string
    }) {
      const issue = GoalLintIssueSchema.parse(input)
      if (issue.severity === "error") {
        errors.push(issue)
        return
      }

      warnings.push(issue)
    }

    const scope = params.scope satisfies GoalScope

    for (const [index, goal] of params.goals.entries()) {
      const normalizedVerb = normalizeGoalText(goal.actionVerb).toLowerCase()
      if (vagueVerbs.has(normalizedVerb)) {
        pushIssue({
          goalIndex: index,
          field: "actionVerb",
          code: "VAGUE_VERB",
          severity: "error",
          message: "Replace vague verbs like 'understand' or 'know' with a demonstrable action verb.",
        })
      }

      if (!hasGoalTemplatePrefix(scope, goal.statement)) {
        pushIssue({
          goalIndex: index,
          field: "statement",
          code: "TEMPLATE_MISMATCH",
          severity: "error",
          message: "Use the canonical form: 'At the end of this course/topic, you will be able to …'.",
        })
      }

      if (isLikelyTopicLabel(goal.task)) {
        pushIssue({
          goalIndex: index,
          field: "task",
          code: "TOPIC_NOT_TASK",
          severity: "error",
          message: "The task reads like a topic label rather than a concrete learner performance.",
        })
      }

      if (isLikelyCompoundTask(goal.statement) || isLikelyCompoundTask(goal.task)) {
        pushIssue({
          goalIndex: index,
          field: "goal",
          code: "COMPOUND_GOAL",
          severity: "error",
          message: "Split compound outcomes into separate goals so each goal targets one primary performance.",
        })
      }

      if (isLikelyTooBroadTask(goal.statement) || isLikelyTooBroadTask(goal.task)) {
        pushIssue({
          goalIndex: index,
          field: "task",
          code: "TOO_BROAD",
          severity: "error",
          message: "The goal is too broad to assess cleanly in one or two tasks.",
        })
      }

      if (!isLikelyTestableTask(goal.howToTest)) {
        pushIssue({
          goalIndex: index,
          field: "howToTest",
          code: "MISSING_TESTABILITY",
          severity: "error",
          message: "The mastery check must describe a concrete performance and the conditions for success.",
        })
      }

      const inferredLevel = inferGoalCognitiveLevel(goal.actionVerb)
      if (inferredLevel && inferredLevel !== goal.cognitiveLevel) {
        pushIssue({
          goalIndex: index,
          field: "cognitiveLevel",
          code: "LEVEL_VERB_MISMATCH",
          severity: "error",
          message: `The action verb aligns more closely with ${inferredLevel} than ${goal.cognitiveLevel}.`,
        })
      }

      if (isLikelyTopicLabel(goal.statement)) {
        pushIssue({
          goalIndex: index,
          field: "statement",
          code: "TOPIC_NOT_TASK",
          severity: "error",
          message: "The goal reads like a topic label rather than a concrete learner performance.",
        })
      }

      if (isLikelyJargonHeavy(goal.statement) || isLikelyJargonHeavy(goal.task)) {
        pushIssue({
          goalIndex: index,
          field: "statement",
          code: "JARGON_HEAVY",
          severity: "warning",
          message: "The wording may be too jargon-heavy for a learner-facing goal.",
        })
      }

      if (isLikelyWeakRelevance(goal.task)) {
        pushIssue({
          goalIndex: index,
          field: "task",
          code: "WEAK_RELEVANCE",
          severity: "warning",
          message: "The goal would be stronger if the task were tied to a more concrete, useful outcome.",
        })
      }
    }

    if (params.explicitlyRequestedSingleGoal) {
      if (params.goals.length !== 1) {
        pushIssue({
          goalIndex: -1,
          field: "goal",
          code: "COUNT_OUT_OF_RANGE",
          severity: "error",
          message: "The learner explicitly requested a single goal. Provide exactly 1 goal.",
        })
      }
    } else if (scope === "course") {
      if (params.goals.length < 5 || params.goals.length > 10) {
        pushIssue({
          goalIndex: -1,
          field: "goal",
          code: "COUNT_OUT_OF_RANGE",
          severity: "warning",
          message: "Course goal sets are usually strongest in the 5-10 goal range.",
        })
      }
    } else if (params.goals.length < 3 || params.goals.length > 7) {
      pushIssue({
        goalIndex: -1,
        field: "goal",
        code: "COUNT_OUT_OF_RANGE",
        severity: "warning",
        message: "Topic goal sets are usually strongest in the 3-7 goal range.",
      })
    }

    const summary =
      errors.length === 0
        ? warnings.length === 0
          ? "The goal set passes the core lint checks with no warnings."
          : `The goal set passes the core lint checks with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.`
        : `The goal set has ${errors.length} blocking error${errors.length === 1 ? "" : "s"} and ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.`

    const result = GoalLintReportSchema.parse({
      ok: errors.length === 0,
      errors,
      warnings,
      summary,
    })

    return createGoalToolResult("GoalLintReport", result)
  },
})

export { goalLintTool }

