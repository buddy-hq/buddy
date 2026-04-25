import { ulid } from "ulid"
import z from "zod"
import {
  createBuddyTool,
  type BuddyToolContext,
} from "@buddy/backend/learning/tools/create-buddy-tool"
import SAVE_QUESTION_SET_DESCRIPTION from "./save-question-set.md"
import {
  QUESTION_SET_ARTIFACT_KIND,
  QUESTION_SET_SUBAGENT_ID,
  SaveQuestionSetOutputSchema,
  type SaveQuestionSetOutput,
} from "../types"
import { saveQuestionSetArtifact, buildQuestionSetArtifactUrl } from "../save-artifact"

const nonEmptyString = z.string().trim().min(1)
const GroupTypeSchema = z.enum(["quiz", "practice", "assessment"])

const SavedMcqChoiceSchema = z.object({
  id: nonEmptyString,
  content: nonEmptyString,
  correct: z.boolean(),
  rationale: nonEmptyString.optional(),
  isNoneOfTheAbove: z.boolean().optional(),
})

const SavedMcqPayloadSchema = z.object({
  multipleSelect: z.boolean(),
  countChoices: z.boolean().optional(),
  numCorrect: z.number().int().positive().optional(),
  hasNoneOfTheAbove: z.boolean().optional(),
  randomize: z.boolean().optional(),
  choices: z.array(SavedMcqChoiceSchema).min(2),
})

const SavedQuestionSchema = z.object({
  id: nonEmptyString,
  type: z.literal("mcq"),
  prompt: nonEmptyString,
  goalIds: z.array(nonEmptyString).min(1),
  explanation: nonEmptyString.optional(),
  payload: SavedMcqPayloadSchema,
})

const SaveQuestionSetInputSchema = z.object({
  groupType: GroupTypeSchema.optional(),
  title: nonEmptyString,
  instructions: nonEmptyString.optional(),
  contextSummary: nonEmptyString.optional(),
  questions: z.array(SavedQuestionSchema).min(1),
})

type SaveQuestionSetInput = z.infer<typeof SaveQuestionSetInputSchema>

function createdByCallID(ctx: BuddyToolContext): string {
  return typeof ctx.callID === "string" && ctx.callID.trim().length > 0 ? ctx.callID : "unknown"
}

const saveQuestionSetTool = createBuddyTool("save_question_set", {
  description: SAVE_QUESTION_SET_DESCRIPTION,
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

    const saved = await saveQuestionSetArtifact({
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
      artifactUrl: buildQuestionSetArtifactUrl(ctx.directory, saved.artifactID),
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

export { saveQuestionSetTool, SaveQuestionSetInputSchema }
export type { SaveQuestionSetInput }
