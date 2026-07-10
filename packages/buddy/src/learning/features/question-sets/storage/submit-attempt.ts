import path from "node:path"
import { writeJsonFileAtomic } from "../../../../storage/atomic-file"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectPath,
  BuddyObjectValidationError,
  generateObjectID,
} from "../../../../objects"
import {
  QUESTION_SET_ATTEMPT_KIND,
  QuestionSetEvaluationResultSchema,
  type SavedQuestion,
  type QuestionSetAttemptAnswer,
  type QuestionSetEvaluationResult,
} from "../types"
import { correctChoiceIDs, ensureUniqueIDs, readQuestionSetObjectPayload } from "./save-object"
import { ingestQuestionSetAttempt } from "../../memory"

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)]
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
  questionSet: {
    questions: SavedQuestion[]
  }
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
  const questionIDs = new Set(input.questionSet.questions.map((question) => question.id))
  for (const answer of input.answers) {
    if (!questionIDs.has(answer.questionID)) {
      throw new BuddyObjectValidationError(
        `Attempt payload includes unknown question id '${answer.questionID}'.`,
      )
    }
  }

  const evaluatedQuestions = input.questionSet.questions.map((question) => {
    const selectedChoiceIds = answerByQuestionID.get(question.id) ?? []
    const allowedChoiceIDs = new Set(question.payload.choices.map((choice) => choice.id))

    for (const selectedChoiceID of selectedChoiceIds) {
      if (!allowedChoiceIDs.has(selectedChoiceID)) {
        throw new BuddyObjectValidationError(
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
      throw new BuddyObjectValidationError(
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
      : attemptedQuestions === input.questionSet.questions.length
        ? "completed"
        : "partial"

  return QuestionSetEvaluationResultSchema.parse({
    totalQuestions: input.questionSet.questions.length,
    correctQuestions,
    status,
    questions: evaluatedQuestions,
  })
}

async function writeObjectAttempt(input: {
  directory: string
  objectID: string
  attemptRecord: {
    attemptID: string
    kind: typeof QUESTION_SET_ATTEMPT_KIND
    objectID: string
    submittedAt: string
    answers: QuestionSetAttemptAnswer[]
    result: QuestionSetEvaluationResult
  }
}): Promise<void> {
  const attemptID = BuddyObjectPath.sanitizeObjectID(input.attemptRecord.attemptID)
  await writeJsonFileAtomic(
    BuddyObjectPath.objectFile(
      input.directory,
      BUDDY_OBJECT_KINDS.questionSet,
      input.objectID,
      path.join("state", "attempts", `${attemptID}.json`),
    ),
    input.attemptRecord,
  )
}

async function submitQuestionSetObjectAttempt(input: {
  directory: string
  objectID: string
  answers: QuestionSetAttemptAnswer[]
}): Promise<{
  attemptID: string
  objectID: string
  result: QuestionSetEvaluationResult
}> {
  const questionSet = await readQuestionSetObjectPayload({
    directory: input.directory,
    objectID: input.objectID,
  })
  const evaluation = evaluateQuestionSet({
    questionSet,
    answers: input.answers,
  })

  const attemptID = generateObjectID()
  const submittedAt = new Date().toISOString()
  const attemptRecord = {
    attemptID,
    kind: QUESTION_SET_ATTEMPT_KIND,
    objectID: input.objectID,
    submittedAt,
    answers: input.answers,
    result: evaluation,
  }

  await writeObjectAttempt({
    directory: input.directory,
    objectID: input.objectID,
    attemptRecord,
  })
  const tags = dedupeStrings(questionSet.questions.flatMap((question) => question.goalIds))
  await ingestQuestionSetAttempt({
    directory: input.directory,
    objectID: input.objectID,
    attemptID,
    title: questionSet.title,
    groupType: questionSet.groupType,
    totalQuestions: evaluation.totalQuestions,
    correctQuestions: evaluation.correctQuestions,
    status: evaluation.status,
    tags,
    result: evaluation,
  })

  return {
    attemptID,
    objectID: input.objectID,
    result: evaluation,
  }
}

export { submitQuestionSetObjectAttempt, evaluateQuestionSet }
