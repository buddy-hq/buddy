import COMMIT_DESCRIPTION from "./commit-goal.md"
import z from "zod"
import { createBuddyTool, type BuddyToolContext } from "../../../runtime/create-buddy-tool"
import { replaceActiveGoalSet } from "../../memory/goals/storage"
import { GoalCommitResultSchema, GoalSchema, GoalScopeSchema, createGoalToolResult } from "../types"
import { createGoalLintReport } from "./lint-goal"

const goalCommitTool = createBuddyTool({
  id: "goal_commit",
  description: COMMIT_DESCRIPTION,
  parameters: z.object({
    scope: GoalScopeSchema,
    contextLabel: z.string().min(1),
    learnerRequest: z.string().min(1),
    explicitlyRequestedSingleGoal: z.boolean(),
    goals: z.array(GoalSchema).min(1),
    rationaleSummary: z.string().optional(),
    assumptions: z.array(z.string()).optional(),
    openQuestions: z.array(z.string()).optional(),
  }),
  presentation: {
    archetype: "activity",
    icon: "goal",
    renderer: "generic",
    layoutRole: "activity",
    phases: {
      pending: { action: "Saving goals" },
      running: { action: "Saving goals" },
      completed: { action: "Saved goals" },
      error: { action: "Failed to save goals" },
    },
    summary: {
      category: "save-goals",
      pending: "Saving goals",
      running: "Saving goals",
      completed: "Saved goals",
      error: "Failed to save goals",
    },
  },
  async execute(params, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "goal_commit",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        scope: params.scope,
        contextLabel: params.contextLabel,
        goals: params.goals.length,
        explicitlyRequestedSingleGoal: params.explicitlyRequestedSingleGoal,
      },
    })

    const lintReport = createGoalLintReport({
      scope: params.scope,
      goals: params.goals,
      explicitlyRequestedSingleGoal: params.explicitlyRequestedSingleGoal,
    })
    if (!lintReport.ok) {
      throw new Error(`goal_commit requires a passing goal_lint report. ${lintReport.summary}`)
    }

    const commit = await replaceActiveGoalSet({
      directory: ctx.directory,
      scope: params.scope,
      contextLabel: params.contextLabel,
      goals: params.goals,
    })

    const result = GoalCommitResultSchema.parse({
      committed: true,
      filePath: commit.filePath,
      setId: commit.setId,
      goalIds: commit.goalIds,
      archivedSetIds: commit.archivedSetIds,
    })

    return createGoalToolResult("GoalCommitResult", result)
  },
})

export { goalCommitTool }
