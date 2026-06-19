import z from "zod"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectManifestSchema,
  BuddyObjectValidationError,
  QuestionSetObjectSummarySchema,
  generateObjectID,
  readObjectJsonFile,
  readObjectManifest,
  registerBuddyObjectKind,
  writeObjectRecord,
  type BuddyObjectManifest,
  type BuddyObjectViewResponse,
} from "../../../../objects"
import {
  PublicQuestionSchema,
  SavedQuestionSetObjectSchema,
  type PublicQuestionSetObject,
  type SavedQuestion,
} from "../types"
const QUESTION_SET_OBJECT_VIEW_ID = "practice" as const
const QUESTION_SET_OBJECT_PAYLOAD_FILE_NAME = "question-set.json" as const

const QuestionSetObjectPayloadSchema = SavedQuestionSetObjectSchema
const PublicQuestionSetObjectReadSchema = QuestionSetObjectPayloadSchema.extend({
  questions: z.array(PublicQuestionSchema).min(1),
})

type QuestionSetObjectPayload = z.infer<typeof QuestionSetObjectPayloadSchema>

function ensureUniqueIDs(input: { values: string[]; label: string; context: string }): void {
  const unique = new Set(input.values)
  if (unique.size === input.values.length) {
    return
  }

  throw new BuddyObjectValidationError(
    `${input.context} has duplicate ${input.label} values. ${input.label} must be unique.`,
  )
}

function correctChoiceIDs(question: SavedQuestion): string[] {
  return question.payload.choices.filter((choice) => choice.correct).map((choice) => choice.id)
}

function validateSavedQuestion(input: SavedQuestion): void {
  ensureUniqueIDs({
    values: input.payload.choices.map((choice) => choice.id),
    label: "choice IDs",
    context: `Question '${input.id}'`,
  })

  const correctChoiceIds = correctChoiceIDs(input)
  if (correctChoiceIds.length === 0) {
    throw new BuddyObjectValidationError(
      `Question '${input.id}' must include at least one correct choice.`,
    )
  }

  if (!input.payload.multipleSelect && correctChoiceIds.length !== 1) {
    throw new BuddyObjectValidationError(
      `Question '${input.id}' is single-select and must have exactly one correct choice.`,
    )
  }

  const noneOfTheAboveChoices = input.payload.choices.filter((choice) => choice.isNoneOfTheAbove)

  if (input.payload.hasNoneOfTheAbove && noneOfTheAboveChoices.length !== 1) {
    throw new BuddyObjectValidationError(
      `Question '${input.id}' requires exactly one 'none of the above' choice.`,
    )
  }

  if (!input.payload.hasNoneOfTheAbove && noneOfTheAboveChoices.length > 0) {
    throw new BuddyObjectValidationError(
      `Question '${input.id}' includes 'none of the above' choices without hasNoneOfTheAbove enabled.`,
    )
  }

  if (noneOfTheAboveChoices.some((choice) => choice.correct) && correctChoiceIds.length > 1) {
    throw new BuddyObjectValidationError(
      `Question '${input.id}' cannot mark 'none of the above' as correct alongside other correct choices.`,
    )
  }

  if (
    input.payload.numCorrect !== undefined &&
    input.payload.numCorrect !== correctChoiceIds.length
  ) {
    throw new BuddyObjectValidationError(
      `Question '${input.id}' has numCorrect=${input.payload.numCorrect}, but ${correctChoiceIds.length} correct choices were authored.`,
    )
  }

  if (input.payload.countChoices) {
    const expectedCount = input.payload.numCorrect ?? correctChoiceIds.length
    if (expectedCount <= 0 || expectedCount > input.payload.choices.length) {
      throw new BuddyObjectValidationError(
        `Question '${input.id}' has an invalid expected choice count (${expectedCount}).`,
      )
    }
  }
}

function validateQuestionSetPayload(input: { title: string; questions: SavedQuestion[] }): void {
  ensureUniqueIDs({
    values: input.questions.map((question) => question.id),
    label: "question IDs",
    context: `Question set '${input.title}'`,
  })

  for (const question of input.questions) {
    validateSavedQuestion(question)
  }
}

function toPublicQuestionSetObject(payload: QuestionSetObjectPayload): PublicQuestionSetObject {
  const publicPayload = {
    ...payload,
    questions: payload.questions.map((question) => ({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      goalIds: [...question.goalIds],
      ...(question.explanation ? { explanation: question.explanation } : {}),
      payload: {
        multipleSelect: question.payload.multipleSelect,
        ...(question.payload.countChoices !== undefined
          ? { countChoices: question.payload.countChoices }
          : {}),
        ...(question.payload.numCorrect !== undefined
          ? { numCorrect: question.payload.numCorrect }
          : {}),
        ...(question.payload.hasNoneOfTheAbove !== undefined
          ? { hasNoneOfTheAbove: question.payload.hasNoneOfTheAbove }
          : {}),
        ...(question.payload.randomize !== undefined
          ? { randomize: question.payload.randomize }
          : {}),
        choices: question.payload.choices.map((choice) => ({
          id: choice.id,
          content: choice.content,
          ...(choice.isNoneOfTheAbove !== undefined
            ? { isNoneOfTheAbove: choice.isNoneOfTheAbove }
            : {}),
        })),
      },
    })),
  }

  return PublicQuestionSetObjectReadSchema.parse(publicPayload)
}

type SavedQuestionSetObjectResult = {
  objectID: string
  revisionID: string
  payload: QuestionSetObjectPayload
  manifest: BuddyObjectManifest & {
    summary: ReturnType<typeof QuestionSetObjectSummarySchema.parse>
  }
}

function questionSetObjectPayloadPath(revisionID: string): string {
  return `revisions/${revisionID}/${QUESTION_SET_OBJECT_PAYLOAD_FILE_NAME}`
}

function buildQuestionSetObjectViews(input: { groupType: string | null }): BuddyObjectManifest["views"] {
  return [
    {
      viewID: QUESTION_SET_OBJECT_VIEW_ID,
      label: "Question set",
      surfaces: ["inline", "bench", "library"],
      availability: { status: "available" },
      inline: {
        renderer: "question-set",
        params: {
          renderer: "question-set",
          groupType: input.groupType,
        },
      },
      bench: { resolver: "object-view" },
      library: { section: "practice" },
    },
  ]
}

async function saveQuestionSetObject(input: {
  directory: string
  payload: Omit<QuestionSetObjectPayload, "revisionID">
}): Promise<SavedQuestionSetObjectResult> {
  validateQuestionSetPayload({
    title: input.payload.title,
    questions: input.payload.questions,
  })
  const objectID = input.payload.objectID
  const revisionID = generateObjectID()
  const parsed = QuestionSetObjectPayloadSchema.parse({
    ...input.payload,
    revisionID,
  })
  const manifest = BuddyObjectManifestSchema.safeExtend({
    summary: QuestionSetObjectSummarySchema,
  }).parse({
    version: 1,
    kind: BUDDY_OBJECT_KINDS.questionSet,
    objectID,
    title: parsed.title,
    status: "ready",
    lifecycle: "revisioned",
    currentRevisionID: revisionID,
    origin: parsed.createdBy,
    createdAt: parsed.createdAt,
    updatedAt: parsed.createdAt,
    sourceRefs: [],
    views: buildQuestionSetObjectViews({ groupType: parsed.groupType }),
    summary: {
      kind: BUDDY_OBJECT_KINDS.questionSet,
      groupType: parsed.groupType,
      questionCount: parsed.questions.length,
    },
  })
  await writeObjectRecord({
    directory: input.directory,
    kind: BUDDY_OBJECT_KINDS.questionSet,
    objectID,
    manifest,
    files: [
      {
        relativePath: questionSetObjectPayloadPath(revisionID),
        format: "json",
        content: parsed,
      },
    ],
  })
  return {
    objectID,
    revisionID,
    payload: parsed,
    manifest,
  }
}

async function readQuestionSetObjectPayload(input: {
  directory: string
  objectID: string
  revisionID?: string | null
}): Promise<QuestionSetObjectPayload> {
  const manifest = BuddyObjectManifestSchema.safeExtend({
    summary: QuestionSetObjectSummarySchema,
  }).parse(await readObjectManifest({
    directory: input.directory,
    kind: BUDDY_OBJECT_KINDS.questionSet,
    objectID: input.objectID,
  }))
  const revisionID = input.revisionID ?? manifest.currentRevisionID
  if (!revisionID) {
    throw new BuddyObjectValidationError(
      `Question-set object '${input.objectID}' has no current revision.`,
    )
  }
  const parsed = await readObjectJsonFile({
    directory: input.directory,
    kind: BUDDY_OBJECT_KINDS.questionSet,
    objectID: input.objectID,
    relativePath: questionSetObjectPayloadPath(revisionID),
    schema: QuestionSetObjectPayloadSchema,
  })
  validateQuestionSetPayload({
    title: parsed.title,
    questions: parsed.questions,
  })
  return parsed
}

async function readPublicQuestionSetObject(input: {
  directory: string
  objectID: string
  revisionID?: string | null
}): Promise<PublicQuestionSetObject> {
  return toPublicQuestionSetObject(await readQuestionSetObjectPayload(input))
}

export {
  PublicQuestionSetObjectReadSchema,
  QuestionSetObjectPayloadSchema,
  saveQuestionSetObject,
  readPublicQuestionSetObject,
  readQuestionSetObjectPayload,
  toPublicQuestionSetObject,
  correctChoiceIDs,
  ensureUniqueIDs,
}

registerBuddyObjectKind({
  kind: BUDDY_OBJECT_KINDS.questionSet,
  manifestSchema: BuddyObjectManifestSchema.safeExtend({
    summary: QuestionSetObjectSummarySchema,
  }),
  async readManifest(input) {
    return BuddyObjectManifestSchema.safeExtend({
      summary: QuestionSetObjectSummarySchema,
    }).parse(await readObjectManifest({
      directory: input.directory,
      kind: BUDDY_OBJECT_KINDS.questionSet,
      objectID: input.ref.objectID,
    }))
  },
  async readView(input): Promise<BuddyObjectViewResponse> {
    if (input.viewID !== QUESTION_SET_OBJECT_VIEW_ID) {
      throw new BuddyObjectValidationError(`Unsupported question set view: ${input.viewID}`)
    }
    const payload = await readQuestionSetObjectPayload({
      directory: input.directory,
      objectID: input.ref.objectID,
      revisionID: input.ref.revisionID,
    })
    const questionSet = toPublicQuestionSetObject(payload)
    return {
      ref: input.ref,
      viewID: QUESTION_SET_OBJECT_VIEW_ID,
      title: payload.title,
      data: {
        renderer: "question-set",
        questionSet,
      },
    }
  },
  async resolveBenchView(input) {
    if (input.viewID !== QUESTION_SET_OBJECT_VIEW_ID) {
      return {
        status: "blocked",
        reason: "unsupported_question_set_view",
        message: `Unsupported question set Bench view: ${input.viewID}`,
      }
    }
    return {
      status: "ready",
      target: {
        type: "object",
        ref: input.ref,
        viewID: QUESTION_SET_OBJECT_VIEW_ID,
      },
    }
  },
})
