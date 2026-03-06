import z from "zod"
import { createBuddyTool, type BuddyToolContext } from "../../shared/create-buddy-tool.js"
import { LearnerService } from "../service.js"

const assessmentRecordTool = createBuddyTool("assessment_record", {
  description: "Record an inline assessment result for the current workspace.",
  parameters: z.object({
    goalIds: z.array(z.string()).default([]),
    format: z.enum([
      "concept-check",
      "predict-outcome",
      "debug-task",
      "build-task",
      "review-task",
      "explain-reasoning",
      "transfer-task",
    ]),
    summary: z.string().min(1),
    result: z.enum(["demonstrated", "partial", "not-demonstrated"]),
    learnerResponseSummary: z.string().optional(),
    evidenceCriteria: z.array(z.string()).optional(),
    followUpAction: z.string().optional(),
  }),
  async execute(params, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "assessment_record",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        goals: params.goalIds.length,
        result: params.result,
      },
    })

    const recorded = await LearnerService.recordAssessment({
      directory: ctx.directory,
      goalIds: params.goalIds,
      format: params.format,
      summary: params.summary,
      result: params.result,
      learnerResponseSummary: params.learnerResponseSummary,
      evidenceCriteria: params.evidenceCriteria,
      followUpAction: params.followUpAction,
      sessionId: ctx.sessionID,
    })

    return {
      title: "assessment_record",
      output: `Recorded assessment result (${params.result}).`,
      metadata: recorded,
    }
  },
})

export { assessmentRecordTool }
