import z from "zod"
import { createBuddyTool, type BuddyToolContext } from "../../shared/create-buddy-tool.js"
import { LearnerService } from "../service.js"

const practiceRecordTool = createBuddyTool("practice_record", {
  description: "Record a practice activity or learner attempt for the current workspace.",
  parameters: z.object({
    goalIds: z.array(z.string()).default([]),
    prompt: z.string().optional(),
    learnerResponseSummary: z.string().min(1),
    outcome: z.enum(["assigned", "partial", "completed", "stuck"]),
    targetComponents: z.array(z.string()).optional(),
    difficulty: z.enum(["scaffolded", "moderate", "stretch"]).optional(),
    scenario: z.string().optional(),
    taskConstraints: z.array(z.string()).optional(),
    deliverable: z.string().optional(),
    selfCheck: z.string().optional(),
    whyItMatters: z.string().optional(),
    surface: z.enum(["chat", "curriculum", "editor", "figure", "quiz"]).optional(),
    addressedFeedbackIds: z.array(z.string()).optional(),
  }),
  async execute(params, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "practice_record",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        goals: params.goalIds.length,
        outcome: params.outcome,
      },
    })

    const recorded = await LearnerService.recordPractice({
      directory: ctx.directory,
      goalIds: params.goalIds,
      prompt: params.prompt,
      learnerResponseSummary: params.learnerResponseSummary,
      outcome: params.outcome,
      targetComponents: params.targetComponents,
      difficulty: params.difficulty,
      scenario: params.scenario,
      taskConstraints: params.taskConstraints,
      deliverable: params.deliverable,
      selfCheck: params.selfCheck,
      whyItMatters: params.whyItMatters,
      surface: params.surface,
      addressedFeedbackIds: params.addressedFeedbackIds,
      sessionId: ctx.sessionID,
    })

    return {
      title: "practice_record",
      output: `Recorded practice outcome (${params.outcome}).`,
      metadata: recorded,
    }
  },
})

export { practiceRecordTool }
