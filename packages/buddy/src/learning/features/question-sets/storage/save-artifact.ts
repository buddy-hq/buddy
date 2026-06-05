import { writeTextFileAtomic } from "../../../../storage/atomic-file"
import { QuestionSetPath } from "./path"
import {
  SavedQuestionSetArtifactSchema,
  PublicQuestionSetArtifactSchema,
  type PublicQuestionSetArtifact,
  type SavedQuestion,
  type SavedQuestionSetArtifact,
} from "../types"
import { QuestionSetValidationError } from "../errors"

const QUESTION_SET_API_PATH = "/api/question-set-artifacts"

function ensureUniqueIDs(input: { values: string[]; label: string; context: string }): void {
  const unique = new Set(input.values)
  if (unique.size === input.values.length) {
    return
  }

  throw new QuestionSetValidationError(
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
    throw new QuestionSetValidationError(
      `Question '${input.id}' must include at least one correct choice.`,
    )
  }

  if (!input.payload.multipleSelect && correctChoiceIds.length !== 1) {
    throw new QuestionSetValidationError(
      `Question '${input.id}' is single-select and must have exactly one correct choice.`,
    )
  }

  const noneOfTheAboveChoices = input.payload.choices.filter((choice) => choice.isNoneOfTheAbove)

  if (input.payload.hasNoneOfTheAbove && noneOfTheAboveChoices.length !== 1) {
    throw new QuestionSetValidationError(
      `Question '${input.id}' requires exactly one 'none of the above' choice.`,
    )
  }

  if (!input.payload.hasNoneOfTheAbove && noneOfTheAboveChoices.length > 0) {
    throw new QuestionSetValidationError(
      `Question '${input.id}' includes 'none of the above' choices without hasNoneOfTheAbove enabled.`,
    )
  }

  if (noneOfTheAboveChoices.some((choice) => choice.correct) && correctChoiceIds.length > 1) {
    throw new QuestionSetValidationError(
      `Question '${input.id}' cannot mark 'none of the above' as correct alongside other correct choices.`,
    )
  }

  if (
    input.payload.numCorrect !== undefined &&
    input.payload.numCorrect !== correctChoiceIds.length
  ) {
    throw new QuestionSetValidationError(
      `Question '${input.id}' has numCorrect=${input.payload.numCorrect}, but ${correctChoiceIds.length} correct choices were authored.`,
    )
  }

  if (input.payload.countChoices) {
    const expectedCount = input.payload.numCorrect ?? correctChoiceIds.length
    if (expectedCount <= 0 || expectedCount > input.payload.choices.length) {
      throw new QuestionSetValidationError(
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
  const artifactPath = QuestionSetPath.artifactFile(input.directory, input.artifact.artifactID)
  await writeTextFileAtomic(artifactPath, JSON.stringify(input.artifact, null, 2))
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
