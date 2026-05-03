import fs from "node:fs/promises"
import { ulid } from "ulid"
import { QuestionSetPath } from "./path"
import {
  QUESTION_SET_ATTEMPT_KIND,
  QuestionSetAttemptRecordSchema,
  QuestionSetEvaluationResultSchema,
  type SavedQuestion,
  type SavedQuestionSetArtifact,
  type QuestionSetAttemptAnswer,
  type QuestionSetEvaluationResult,
  type SubmitQuestionSetAttemptOutput,
} from "../types"
import { QuestionSetValidationError } from "../errors"
import { readQuestionSetArtifact } from "./read-artifact"
import { correctChoiceIDs, ensureUniqueIDs } from "./save-artifact"
import {
  appendLearnerEvent,
  createLearnerEvent,
  recordQuestionSetAttemptMemory,
} from "../../memory"
import { writeLearnerEvidenceForEvent } from "../../memory/evidence"

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

async function submitQuestionSetAttempt(input: {
  directory: string
  artifactID: string
  answers: QuestionSetAttemptAnswer[]
}): Promise<SubmitQuestionSetAttemptOutput> {
  const savedArtifact = await readQuestionSetArtifact(input.directory, input.artifactID)
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
  const learnerEvent = createLearnerEvent({
    type: "question_set_attempt_ingested",
    sourceKind: "question_set_attempt",
    sourceId: attemptID,
    searchableText: `Question set attempt ${savedArtifact.artifactID}: ${evaluation.correctQuestions}/${evaluation.totalQuestions} correct, status ${evaluation.status}.`,
    payload: {
      artifactID: savedArtifact.artifactID,
      attemptID,
      result: evaluation,
    },
  })
  await appendLearnerEvent(input.directory, learnerEvent)
  const tags = dedupeStrings(savedArtifact.questions.flatMap((question) => question.goalIds))
  const memory = await recordQuestionSetAttemptMemory({
    directory: input.directory,
    eventId: learnerEvent.id,
    title: savedArtifact.title,
    groupType: savedArtifact.groupType,
    totalQuestions: evaluation.totalQuestions,
    correctQuestions: evaluation.correctQuestions,
    tags,
    projectPath: input.directory,
  })
  await writeLearnerEvidenceForEvent({
    directory: input.directory,
    event: learnerEvent,
    artifactId: savedArtifact.artifactID,
    title: savedArtifact.title,
    note: `Question-set attempt recorded with ${evaluation.correctQuestions} of ${evaluation.totalQuestions} correct (${evaluation.status}).`,
    tags,
    payload: {
      groupType: savedArtifact.groupType,
      totalQuestions: evaluation.totalQuestions,
      correctQuestions: evaluation.correctQuestions,
      status: evaluation.status,
    },
    memoryEffects: [
      {
        memoryId: memory.id,
        effect:
          evaluation.correctQuestions === evaluation.totalQuestions
            ? "noted"
            : evaluation.correctQuestions > 0
              ? "reinforced"
              : "weakened",
        reason:
          evaluation.correctQuestions === evaluation.totalQuestions
            ? "Perfect assessment evidence is available for this question set."
            : evaluation.correctQuestions > 0
              ? "Partial assessment result indicates this topic still needs reinforcement."
              : "Missed assessment result indicates this topic likely remains weak.",
      },
    ],
  })

  return {
    attemptID,
    artifactID: savedArtifact.artifactID,
    result: evaluation,
  }
}

export { submitQuestionSetAttempt, evaluateQuestionSet }
