import z from "zod"
import {
  createBuddyTool,
  type BuddyToolContext,
} from "@buddy/backend/learning/runtime/create-buddy-tool"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectResultSchema,
  formatBuddyObjectRefLines,
  generateObjectID,
  nonEmptyString,
  objectSummaryBaseFromManifest,
  type BuddyObjectResult,
} from "../../../../objects"
import SAVE_QUESTION_SET_DESCRIPTION from "./save-question-set.md"
import { QUESTION_SET_SUBAGENT_ID, type PublicQuestionSetObject } from "../types"
import { saveQuestionSetObject, toPublicQuestionSetObject } from "../storage/save-object"

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

function parseToolInputString<TValue>(value: TValue): string | undefined {
  const parsed = z.string().safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function createdByCallID(ctx: BuddyToolContext): string {
  const callID = ctx.callID
  if (callID !== undefined && callID.trim().length > 0) return callID
  return "unknown"
}

function buildSaveQuestionSetObjectResult(input: {
  questionSet: PublicQuestionSetObject
}): BuddyObjectResult {
  const { questionSet } = input
  const ref = {
    kind: BUDDY_OBJECT_KINDS.questionSet,
    objectID: questionSet.objectID,
    revisionID: questionSet.revisionID,
    itemID: null,
  }
  return BuddyObjectResultSchema.parse({
    version: 1,
    status: "ok",
    reason: null,
    message: `Saved question set ${questionSet.title}.`,
    primaryRef: ref,
    objects: [
      objectSummaryBaseFromManifest({
        kind: BUDDY_OBJECT_KINDS.questionSet,
        objectID: questionSet.objectID,
        title: questionSet.title,
        status: "ready",
        lifecycle: "revisioned",
        sourceRoot: null,
      }),
    ],
    presentations: [
      {
        ref,
        viewID: "practice",
        surface: "inline",
        data: {
          renderer: "question-set",
          questionSet,
        },
        autoOpen: null,
      },
    ],
  })
}

const saveQuestionSetTool = createBuddyTool({
  id: "save_question_set",
  produces: {
    buddyObjectResult: true,
  },
  description: SAVE_QUESTION_SET_DESCRIPTION,
  parameters: SaveQuestionSetInputSchema,
  presentation: {
    archetype: "inline-output",
    icon: "book",
    renderer: "question-set",
    layoutRole: "card-output",
    phases: {
      pending: {
        action: "Saving question set",
        detail: ({ input }) => parseToolInputString(input.title),
      },
      running: {
        action: "Saving question set",
        detail: ({ input }) => parseToolInputString(input.title),
      },
      completed: {
        action: "Saved question set",
        detail: ({ input }) => parseToolInputString(input.title),
      },
      error: {
        action: "Failed to save question set",
        detail: ({ input }) => parseToolInputString(input.title),
      },
    },
  },
  async execute(params: SaveQuestionSetInput, ctx: BuddyToolContext) {
    await ctx.ask({
      permission: "save_question_set",
      patterns: ["*"],
      always: ["*"],
      metadata: {
        kind: BUDDY_OBJECT_KINDS.questionSet,
      },
    })

    const parsed = SaveQuestionSetInputSchema.parse(params)
    const objectID = generateObjectID()
    const createdAt = new Date().toISOString()

    const saved = await saveQuestionSetObject({
      directory: ctx.directory,
      payload: Object.assign(
        {
          objectID,
          kind: BUDDY_OBJECT_KINDS.questionSet,
          groupType: parsed.groupType ?? "quiz",
          title: parsed.title,
          createdAt,
          createdBy: {
            kind: "tool" as const,
            sessionID: String(ctx.sessionID),
            messageID: String(ctx.messageID),
            callID: createdByCallID(ctx),
            subagent: QUESTION_SET_SUBAGENT_ID,
          },
          questions: parsed.questions,
        },
        parsed.instructions ? { instructions: parsed.instructions } : undefined,
        parsed.contextSummary ? { contextSummary: parsed.contextSummary } : undefined,
      ),
    })

    const buddyObjectResult = buildSaveQuestionSetObjectResult({
      questionSet: toPublicQuestionSetObject(saved.payload),
    })

    return {
      title: "Saved question set",
      output: [
        buddyObjectResult.message,
        ...formatBuddyObjectRefLines(buddyObjectResult.primaryRef),
        `revision_id=${saved.revisionID}`,
        `question_count=${saved.payload.questions.length}`,
      ].join("\n"),
      metadata: {
        buddyObjectResult,
      },
    }
  },
})

export { saveQuestionSetTool, SaveQuestionSetInputSchema }
export type { SaveQuestionSetInput }
