import { ulid } from "ulid"
import {
  createBuddyTool,
  type BuddyToolContext,
} from "@buddy/backend/learning/tools/create-buddy-tool"
import { QuestionSetService } from "../service"
import {
  QUESTION_SET_ARTIFACT_KIND,
  QUESTION_SET_SUBAGENT_ID,
  SaveQuestionSetInputSchema,
  SaveQuestionSetOutputSchema,
  type SaveQuestionSetInput,
  type SaveQuestionSetOutput,
} from "../types"

function createdByCallID(ctx: BuddyToolContext): string {
  return typeof ctx.callID === "string" && ctx.callID.trim().length > 0 ? ctx.callID : "unknown"
}

const saveQuestionSetTool = createBuddyTool("save_question_set", {
  description:
    "Persist a fully-authored answerful question set artifact and return an artifact id for later rendering.",
  parameters: SaveQuestionSetInputSchema,
  async execute(params: SaveQuestionSetInput, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "save_question_set",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        kind: QUESTION_SET_ARTIFACT_KIND,
      },
    })

    const parsed = SaveQuestionSetInputSchema.parse(params)
    const artifactID = ulid()
    const createdAt = new Date().toISOString()

    const saved = await QuestionSetService.save({
      directory: ctx.directory,
      artifact: {
        artifactID,
        kind: QUESTION_SET_ARTIFACT_KIND,
        groupType: parsed.groupType ?? "quiz",
        title: parsed.title,
        ...(parsed.instructions ? { instructions: parsed.instructions } : {}),
        ...(parsed.contextSummary ? { contextSummary: parsed.contextSummary } : {}),
        createdAt,
        createdBy: {
          sessionID: String(ctx.sessionID),
          messageID: String(ctx.messageID),
          callID: createdByCallID(ctx),
          subagent: QUESTION_SET_SUBAGENT_ID,
        },
        questions: parsed.questions,
      },
    })

    const output: SaveQuestionSetOutput = SaveQuestionSetOutputSchema.parse({
      artifactID: saved.artifactID,
      kind: saved.kind,
      groupType: saved.groupType,
      title: saved.title,
      questionCount: saved.questions.length,
      artifactUrl: QuestionSetService.buildArtifactUrl(ctx.directory, saved.artifactID),
    })

    return {
      title: "Saved question set",
      output: JSON.stringify(output, null, 2),
      metadata: {
        artifact: "SaveQuestionSetOutput",
        value: output,
      },
    }
  },
})

export { saveQuestionSetTool }
