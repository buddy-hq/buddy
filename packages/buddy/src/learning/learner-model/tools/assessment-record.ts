import ASSESSMENT_RECORD_DESCRIPTION from "./assessment-record.md"
import z from "zod"
import { createBuddyTool, type BuddyToolContext } from "../../tools/create-buddy-tool"
import { recordAssessmentEvent } from ".."

const assessmentRecordTool = createBuddyTool("learner_assessment_record", {
  description: ASSESSMENT_RECORD_DESCRIPTION,
  parameters: z.object({
    goalIds: z.array(z.string()).min(1),
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
      permission: "learner_assessment_record",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        goals: params.goalIds.length,
        result: params.result,
      },
    })

    const recorded = await recordAssessmentEvent({
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
      title: "learner_assessment_record",
      output: `Recorded assessment result (${params.result}).`,
      metadata: recorded,
    }
  },
})

export { assessmentRecordTool }
