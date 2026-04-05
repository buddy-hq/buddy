import type { Dirent } from "node:fs"
import fs from "node:fs/promises"
import { ulid } from "ulid"
import { recordAssessmentEvent, recordPracticeEvent } from "@buddy/backend/learning/learner-model"
import { InvalidQuestionSetArtifactIDError, QuestionSetPath } from "./path"
import {
  QUESTION_SET_ATTEMPT_KIND,
  QUESTION_SET_SURFACE,
  PublicQuestionSetArtifactSchema,
  QuestionSetAttemptRecordSchema,
  QuestionSetEvaluationResultSchema,
  SavedQuestionSetArtifactSchema,
  type PublicQuestionSetArtifact,
  type QuestionSetAttemptAnswer,
  type QuestionSetEvaluationResult,
  type SavedQuestion,
  type SavedQuestionSetArtifact,
  type SubmitQuestionSetAttemptOutput,
} from "./types"

const QUESTION_SET_API_PATH = "/api/question-set-artifacts"

class QuestionSetArtifactNotFoundError extends Error {
  constructor(artifactID: string) {
    super(`Question-set artifact '${artifactID}' was not found.`)
    this.name = "QuestionSetArtifactNotFoundError"
  }
}

class QuestionSetValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "QuestionSetValidationError"
  }
}

type QuestionSetArtifactListResult = PublicQuestionSetArtifact[]

function mapQuestionSetRouteError(error: unknown): Response | undefined {
  if (error instanceof InvalidQuestionSetArtifactIDError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (error instanceof QuestionSetArtifactNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof QuestionSetValidationError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  return undefined
}

function buildArtifactUrl(directory: string, artifactID: string): string {
  return `${QUESTION_SET_API_PATH}/${artifactID}?directory=${encodeURIComponent(directory)}`
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)]
}

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

function normalizeSelectedChoiceIDs(selectedChoiceIDs: string[]): string[] {
  return dedupeStrings(selectedChoiceIDs)
}

function isSameChoiceSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false
  }

  const leftSet = new Set(left)
  for (const rightValue of right) {
    if (!leftSet.has(rightValue)) {
      return false
    }
  }

  return true
}

function expectedChoiceCount(question: SavedQuestion): number {
  return question.payload.numCorrect ?? correctChoiceIDs(question).length
}

function evaluateQuestionSet(input: {
  artifact: SavedQuestionSetArtifact
  answers: QuestionSetAttemptAnswer[]
}): QuestionSetEvaluationResult {
  ensureUniqueIDs({
    values: input.answers.map((answer) => answer.questionID),
    label: "answer question IDs",
    context: "Attempt payload",
  })

  const answerByQuestionID = new Map(
    input.answers.map((answer) => [
      answer.questionID,
      normalizeSelectedChoiceIDs(answer.selectedChoiceIds),
    ]),
  )
  const artifactQuestionIDs = new Set(input.artifact.questions.map((question) => question.id))
  for (const answer of input.answers) {
    if (!artifactQuestionIDs.has(answer.questionID)) {
      throw new QuestionSetValidationError(
        `Attempt payload includes unknown question id '${answer.questionID}'.`,
      )
    }
  }

  const evaluatedQuestions = input.artifact.questions.map((question) => {
    const selectedChoiceIds = answerByQuestionID.get(question.id) ?? []
    const allowedChoiceIDs = new Set(question.payload.choices.map((choice) => choice.id))

    for (const selectedChoiceID of selectedChoiceIds) {
      if (!allowedChoiceIDs.has(selectedChoiceID)) {
        throw new QuestionSetValidationError(
          `Question '${question.id}' includes unknown selected choice id '${selectedChoiceID}'.`,
        )
      }
    }

    const noneOfTheAboveChoiceIDs = new Set(
      question.payload.choices
        .filter((choice) => choice.isNoneOfTheAbove)
        .map((choice) => choice.id),
    )
    const selectedNoneOfTheAbove = selectedChoiceIds.filter((choiceID) =>
      noneOfTheAboveChoiceIDs.has(choiceID),
    )
    if (selectedNoneOfTheAbove.length > 0 && selectedChoiceIds.length > 1) {
      throw new QuestionSetValidationError(
        `Question '${question.id}' cannot combine 'none of the above' with other selected choices.`,
      )
    }

    const correctChoiceIds = correctChoiceIDs(question)
    const exactMatch = isSameChoiceSet(selectedChoiceIds, correctChoiceIds)
    const choiceCountSatisfied = question.payload.countChoices
      ? selectedChoiceIds.length === expectedChoiceCount(question)
      : true
    const correct = exactMatch && choiceCountSatisfied

    return {
      questionID: question.id,
      correct,
      selectedChoiceIds,
      correctChoiceIds,
      ...(question.explanation ? { explanation: question.explanation } : {}),
      choices: question.payload.choices.map((choice) => ({
        choiceID: choice.id,
        selected: selectedChoiceIds.includes(choice.id),
        correct: choice.correct,
        ...(choice.rationale ? { rationale: choice.rationale } : {}),
      })),
    }
  })

  const correctQuestions = evaluatedQuestions.filter((question) => question.correct).length
  const attemptedQuestions = evaluatedQuestions.filter(
    (question) => question.selectedChoiceIds.length > 0,
  ).length

  const status =
    attemptedQuestions === 0
      ? "stuck"
      : attemptedQuestions === input.artifact.questions.length
        ? "completed"
        : "partial"

  return QuestionSetEvaluationResultSchema.parse({
    totalQuestions: input.artifact.questions.length,
    correctQuestions,
    status,
    questions: evaluatedQuestions,
  })
}

async function writeArtifact(input: {
  directory: string
  artifact: SavedQuestionSetArtifact
}): Promise<void> {
  const artifactPath = QuestionSetPath.artifactFile(input.directory, input.artifact.artifactID)
  await fs.mkdir(QuestionSetPath.artifactDirectory(input.directory, input.artifact.artifactID), {
    recursive: true,
  })
  await fs.writeFile(artifactPath, JSON.stringify(input.artifact, null, 2), "utf8")
}

async function save(input: {
  directory: string
  artifact: SavedQuestionSetArtifact
}): Promise<SavedQuestionSetArtifact> {
  const parsed = SavedQuestionSetArtifactSchema.parse(input.artifact)
  validateSavedQuestionSetArtifact(parsed)
  await writeArtifact({
    directory: input.directory,
    artifact: parsed,
  })
  return parsed
}

async function read(directory: string, artifactID: string): Promise<SavedQuestionSetArtifact> {
  const safeArtifactID = QuestionSetPath.sanitizeArtifactID(artifactID)

  let artifactText: string
  try {
    artifactText = await fs.readFile(
      QuestionSetPath.artifactFile(directory, safeArtifactID),
      "utf8",
    )
  } catch (error) {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
      throw new QuestionSetArtifactNotFoundError(safeArtifactID)
    }
    throw error
  }

  const parsedArtifact = SavedQuestionSetArtifactSchema.parse(JSON.parse(artifactText))
  validateSavedQuestionSetArtifact(parsedArtifact)
  return parsedArtifact
}

async function readPublic(
  directory: string,
  artifactID: string,
): Promise<PublicQuestionSetArtifact> {
  const saved = await read(directory, artifactID)
  return toPublicQuestionSetArtifact(saved)
}

async function list(directory: string): Promise<QuestionSetArtifactListResult> {
  let entries: Dirent[]
  try {
    entries = await fs.readdir(QuestionSetPath.root(directory), {
      withFileTypes: true,
    })
  } catch (error) {
    const maybe = error as { code?: string }
    if (maybe.code === "ENOENT") {
      return []
    }
    throw error
  }

  const artifacts = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          return await readPublic(directory, entry.name)
        } catch {
          return undefined
        }
      }),
  )

  return artifacts
    .filter((artifact): artifact is PublicQuestionSetArtifact => artifact !== undefined)
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
}

async function writeAttempt(input: {
  directory: string
  artifactID: string
  attemptRecord: {
    attemptID: string
    kind: typeof QUESTION_SET_ATTEMPT_KIND
    artifactID: string
    submittedAt: string
    answers: QuestionSetAttemptAnswer[]
    result: QuestionSetEvaluationResult
  }
}): Promise<void> {
  await fs.mkdir(QuestionSetPath.attemptsDirectory(input.directory, input.artifactID), {
    recursive: true,
  })
  await fs.writeFile(
    QuestionSetPath.attemptFile(input.directory, input.artifactID, input.attemptRecord.attemptID),
    JSON.stringify(input.attemptRecord, null, 2),
    "utf8",
  )
}

function aggregateGoalIDs(artifact: SavedQuestionSetArtifact): string[] {
  return dedupeStrings(artifact.questions.flatMap((question) => question.goalIds))
}

function attemptSummary(input: {
  artifact: SavedQuestionSetArtifact
  result: QuestionSetEvaluationResult
}): string {
  return `${input.artifact.title}: ${input.result.correctQuestions}/${input.result.totalQuestions} correct`
}

async function recordLearnerAttemptSummary(input: {
  directory: string
  artifact: SavedQuestionSetArtifact
  result: QuestionSetEvaluationResult
}): Promise<void> {
  const goalIds = aggregateGoalIDs(input.artifact)
  if (goalIds.length === 0) {
    return
  }

  const summary = attemptSummary({
    artifact: input.artifact,
    result: input.result,
  })

  if (input.artifact.groupType === "assessment") {
    const result =
      input.result.correctQuestions === input.result.totalQuestions
        ? "demonstrated"
        : input.result.correctQuestions > 0
          ? "partial"
          : "not-demonstrated"

    await recordAssessmentEvent({
      directory: input.directory,
      goalIds,
      format: "concept-check",
      summary,
      result,
      learnerResponseSummary: summary,
    })
    return
  }

  const outcome =
    input.result.status === "stuck"
      ? "stuck"
      : input.result.correctQuestions === input.result.totalQuestions
        ? "completed"
        : "partial"

  await recordPracticeEvent({
    directory: input.directory,
    goalIds,
    prompt: input.artifact.title,
    learnerResponseSummary: summary,
    outcome,
    surface: QUESTION_SET_SURFACE,
  })
}

async function submitAttempt(input: {
  directory: string
  artifactID: string
  answers: QuestionSetAttemptAnswer[]
}): Promise<SubmitQuestionSetAttemptOutput> {
  const savedArtifact = await read(input.directory, input.artifactID)
  const evaluation = evaluateQuestionSet({
    artifact: savedArtifact,
    answers: input.answers,
  })

  const attemptID = ulid()
  const submittedAt = new Date().toISOString()
  const attemptRecord = QuestionSetAttemptRecordSchema.parse({
    attemptID,
    kind: QUESTION_SET_ATTEMPT_KIND,
    artifactID: savedArtifact.artifactID,
    submittedAt,
    answers: input.answers,
    result: evaluation,
  })

  await writeAttempt({
    directory: input.directory,
    artifactID: savedArtifact.artifactID,
    attemptRecord,
  })

  await recordLearnerAttemptSummary({
    directory: input.directory,
    artifact: savedArtifact,
    result: evaluation,
  }).catch((error) => {
    console.warn("Failed to record learner summary for question-set attempt:", error)
  })

  return {
    attemptID,
    artifactID: savedArtifact.artifactID,
    result: evaluation,
  }
}

const QuestionSetService = {
  buildArtifactUrl,
  list,
  read,
  readPublic,
  save,
  submitAttempt,
}

export {
  QuestionSetArtifactNotFoundError,
  QuestionSetService,
  QuestionSetValidationError,
  mapQuestionSetRouteError,
}

export type { QuestionSetArtifactListResult }
