import {
  ARTIFACT_CONTENT_FILES,
  ARTIFACT_KINDS,
  ARTIFACT_MANIFEST_VERSION,
  ArtifactValidationError,
  writeArtifactRecord,
} from "../../../../artifacts"
import {
  QuestionSetArtifactManifestSchema,
  SavedQuestionSetArtifactSchema,
  PublicQuestionSetArtifactSchema,
  type PublicQuestionSetArtifact,
  type SavedQuestion,
  type SavedQuestionSetArtifact,
} from "../types"
const QUESTION_SET_API_PATH = "/api/artifacts/question-set"

function ensureUniqueIDs(input: { values: string[]; label: string; context: string }): void {
  const unique = new Set(input.values)
  if (unique.size === input.values.length) {
    return
  }

  throw new ArtifactValidationError(
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
    throw new ArtifactValidationError(
      `Question '${input.id}' must include at least one correct choice.`,
    )
  }

  if (!input.payload.multipleSelect && correctChoiceIds.length !== 1) {
    throw new ArtifactValidationError(
      `Question '${input.id}' is single-select and must have exactly one correct choice.`,
    )
  }

  const noneOfTheAboveChoices = input.payload.choices.filter((choice) => choice.isNoneOfTheAbove)

  if (input.payload.hasNoneOfTheAbove && noneOfTheAboveChoices.length !== 1) {
    throw new ArtifactValidationError(
      `Question '${input.id}' requires exactly one 'none of the above' choice.`,
    )
  }

  if (!input.payload.hasNoneOfTheAbove && noneOfTheAboveChoices.length > 0) {
    throw new ArtifactValidationError(
      `Question '${input.id}' includes 'none of the above' choices without hasNoneOfTheAbove enabled.`,
    )
  }

  if (noneOfTheAboveChoices.some((choice) => choice.correct) && correctChoiceIds.length > 1) {
    throw new ArtifactValidationError(
      `Question '${input.id}' cannot mark 'none of the above' as correct alongside other correct choices.`,
    )
  }

  if (
    input.payload.numCorrect !== undefined &&
    input.payload.numCorrect !== correctChoiceIds.length
  ) {
    throw new ArtifactValidationError(
      `Question '${input.id}' has numCorrect=${input.payload.numCorrect}, but ${correctChoiceIds.length} correct choices were authored.`,
    )
  }

  if (input.payload.countChoices) {
    const expectedCount = input.payload.numCorrect ?? correctChoiceIds.length
    if (expectedCount <= 0 || expectedCount > input.payload.choices.length) {
      throw new ArtifactValidationError(
        `Question '${input.id}' has an invalid expected choice count (${expectedCount}).`,
      )
    }
  }
}

function validateSavedQuestionSetArtifact(artifact: SavedQuestionSetArtifact): void {
  ensureUniqueIDs({
    values: artifact.questions.map((question) => question.id),
    label: "question IDs",
    context: `Question set '${artifact.title}'`,
  })

  for (const question of artifact.questions) {
    validateSavedQuestion(question)
  }
}

function toPublicQuestionSetArtifact(
  artifact: SavedQuestionSetArtifact,
): PublicQuestionSetArtifact {
  const publicArtifact = {
    ...artifact,
    questions: artifact.questions.map((question) => ({
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

  return PublicQuestionSetArtifactSchema.parse(publicArtifact)
}

async function writeQuestionSetArtifact(input: {
  directory: string
  artifact: SavedQuestionSetArtifact
}): Promise<void> {
  const manifest = QuestionSetArtifactManifestSchema.parse({
    version: ARTIFACT_MANIFEST_VERSION,
    artifactID: input.artifact.artifactID,
    kind: ARTIFACT_KINDS.questionSet,
    title: input.artifact.title,
    origin: input.artifact.createdBy,
    createdAt: input.artifact.createdAt,
    updatedAt: input.artifact.createdAt,
    summary: {
      groupType: input.artifact.groupType,
      questionCount: input.artifact.questions.length,
      ...(input.artifact.instructions ? { instructions: input.artifact.instructions } : {}),
      ...(input.artifact.contextSummary
        ? { contextSummary: input.artifact.contextSummary }
        : {}),
    },
  })
  await writeArtifactRecord({
    directory: input.directory,
    kind: ARTIFACT_KINDS.questionSet,
    artifactID: input.artifact.artifactID,
    manifest,
    files: [
      {
        relativePath: ARTIFACT_CONTENT_FILES.questionSet,
        format: "json",
        content: input.artifact,
      },
    ],
  })
}

async function saveQuestionSetArtifact(input: {
  directory: string
  artifact: SavedQuestionSetArtifact
}): Promise<SavedQuestionSetArtifact> {
  const parsed = SavedQuestionSetArtifactSchema.parse(input.artifact)
  validateSavedQuestionSetArtifact(parsed)
  await writeQuestionSetArtifact({
    directory: input.directory,
    artifact: parsed,
  })
  return parsed
}

function buildQuestionSetArtifactUrl(directory: string, artifactID: string): string {
  return `${QUESTION_SET_API_PATH}/${artifactID}?directory=${encodeURIComponent(directory)}`
}

export {
  saveQuestionSetArtifact,
  buildQuestionSetArtifactUrl,
  validateSavedQuestionSetArtifact,
  toPublicQuestionSetArtifact,
  writeQuestionSetArtifact,
  correctChoiceIDs,
  ensureUniqueIDs,
}
