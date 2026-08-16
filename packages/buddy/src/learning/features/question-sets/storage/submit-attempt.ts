import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import {
  assertIdempotencyRequestHash,
  createIdempotencyKeyDigest,
  createIdempotencyRequestHash,
  createIdempotentEventID,
  IdempotencyRequestHashSchema,
} from "../../../../http/idempotency"
import { writeJsonFileAtomic } from "../../../../storage/atomic-file"
import { withFileLock } from "../../../../storage/file-lock"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectPath,
  BuddyObjectValidationError,
  generateObjectID,
} from "../../../../objects"
import {
  QUESTION_SET_ATTEMPT_KIND,
  GroupTypeSchema,
  QuestionSetAttemptRecordSchema,
  QuestionSetEvaluationResultSchema,
  SubmitQuestionSetAttemptOutputSchema,
  type SavedQuestion,
  type QuestionSetAttemptAnswer,
  type QuestionSetAttemptRecord,
  type QuestionSetEvaluationResult,
  type SubmitQuestionSetAttemptOutput,
} from "../types"
import { correctChoiceIDs, ensureUniqueIDs, readQuestionSetObjectPayload } from "./save-object"
import { ingestQuestionSetAttempt } from "../../memory"

const QUESTION_SET_ATTEMPT_LOCK_FILE = ".attempts.lock"
const QUESTION_SET_PENDING_ATTEMPT_DIRECTORY = "pending-attempts"
const QUESTION_SET_PENDING_INGESTION_DIRECTORY = "pending-attempt-ingestions"
const QUESTION_SET_IDEMPOTENCY_DIRECTORY = "attempt-idempotency"
const QUESTION_SET_ATTEMPT_EVENT_NAMESPACE = "question_set_attempt"

const QuestionSetAttemptIngestionSchema = z.object({
  completed: z.boolean(),
  eventID: z.string().min(1),
  eventCreatedAt: z.string().datetime(),
  objectID: z.string().min(1),
  attemptID: z.string().min(1),
  title: z.string().min(1),
  groupType: GroupTypeSchema,
  totalQuestions: z.number().int().nonnegative(),
  correctQuestions: z.number().int().nonnegative(),
  status: z.enum(["completed", "partial", "stuck"]),
  tags: z.array(z.string().min(1)),
  result: QuestionSetEvaluationResultSchema,
})

const CommittedQuestionSetAttemptSchema = z.object({
  submissionID: z.string().uuid(),
  requestHash: IdempotencyRequestHashSchema,
  output: SubmitQuestionSetAttemptOutputSchema,
  ingestion: QuestionSetAttemptIngestionSchema,
})

const QuestionSetAttemptTransactionSchema = z.object({
  attemptRecord: QuestionSetAttemptRecordSchema,
  committed: CommittedQuestionSetAttemptSchema,
})
type QuestionSetAttemptTransaction = z.infer<typeof QuestionSetAttemptTransactionSchema>
type CommittedQuestionSetAttempt = z.infer<typeof CommittedQuestionSetAttemptSchema>

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

    return Object.assign(
      {
        questionID: question.id,
        correct,
        selectedChoiceIds,
        correctChoiceIds,
        choices: question.payload.choices.map((choice) =>
          Object.assign(
            {
              choiceID: choice.id,
              selected: selectedChoiceIds.includes(choice.id),
              correct: choice.correct,
            },
            choice.rationale ? { rationale: choice.rationale } : undefined,
          ),
        ),
      },
      question.explanation ? { explanation: question.explanation } : undefined,
    )
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
  attemptRecord: QuestionSetAttemptRecord
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

function questionSetStateFile(input: {
  directory: string
  objectID: string
  relativePath: string
}): string {
  return BuddyObjectPath.objectFile(
    input.directory,
    BUDDY_OBJECT_KINDS.questionSet,
    input.objectID,
    path.join("state", input.relativePath),
  )
}

function attemptIdempotencyFile(input: {
  directory: string
  objectID: string
  submissionID: string
}): string {
  return questionSetStateFile({
    directory: input.directory,
    objectID: input.objectID,
    relativePath: path.join(
      QUESTION_SET_IDEMPOTENCY_DIRECTORY,
      `${createIdempotencyKeyDigest(input.submissionID)}.json`,
    ),
  })
}

function pendingAttemptFile(input: {
  directory: string
  objectID: string
  submissionID: string
}): string {
  return questionSetStateFile({
    directory: input.directory,
    objectID: input.objectID,
    relativePath: path.join(
      QUESTION_SET_PENDING_ATTEMPT_DIRECTORY,
      `${createIdempotencyKeyDigest(input.submissionID)}.json`,
    ),
  })
}

function pendingAttemptIngestionFile(input: {
  directory: string
  objectID: string
  submissionID: string
}): string {
  return questionSetStateFile({
    directory: input.directory,
    objectID: input.objectID,
    relativePath: path.join(
      QUESTION_SET_PENDING_INGESTION_DIRECTORY,
      `${createIdempotencyKeyDigest(input.submissionID)}.json`,
    ),
  })
}

function isNodeFsErrorCode<TError>(error: TError, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}

async function readJsonIfPresent<T>(
  filePath: string,
  schema: z.ZodSchema<T>,
): Promise<T | undefined> {
  const raw = await fs.readFile(filePath, "utf8").catch((error) => {
    if (isNodeFsErrorCode(error, "ENOENT")) {
      return undefined
    }
    throw error
  })
  if (raw === undefined) return undefined
  return schema.parse(JSON.parse(raw))
}

function questionSetAttemptRequestHash(answers: QuestionSetAttemptAnswer[]): string {
  const canonicalAnswers = answers
    .map((answer) => ({
      questionID: answer.questionID,
      selectedChoiceIds: dedupeStrings(answer.selectedChoiceIds).toSorted(),
    }))
    .toSorted((left, right) => left.questionID.localeCompare(right.questionID))
  return createIdempotencyRequestHash({ answers: canonicalAnswers })
}

async function listPendingQuestionSetAttemptIngestions(input: {
  directory: string
  objectID: string
}): Promise<CommittedQuestionSetAttempt[]> {
  const pendingIngestionDirectory = questionSetStateFile({
    ...input,
    relativePath: QUESTION_SET_PENDING_INGESTION_DIRECTORY,
  })
  const entries = await fs
    .readdir(pendingIngestionDirectory, { withFileTypes: true })
    .catch((error) => {
      if (isNodeFsErrorCode(error, "ENOENT")) {
        return []
      }
      throw error
    })
  const records = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) =>
        readJsonIfPresent(
          path.join(pendingIngestionDirectory, entry.name),
          CommittedQuestionSetAttemptSchema,
        ),
      ),
  )
  return records.filter(
    (record): record is CommittedQuestionSetAttempt =>
      record !== undefined && !record.ingestion.completed,
  )
}

async function commitQuestionSetAttemptTransaction(input: {
  directory: string
  objectID: string
  transaction: QuestionSetAttemptTransaction
}): Promise<void> {
  const submissionID = input.transaction.committed.submissionID
  await writeObjectAttempt({
    directory: input.directory,
    objectID: input.objectID,
    attemptRecord: input.transaction.attemptRecord,
  })
  await writeJsonFileAtomic(
    attemptIdempotencyFile({ ...input, submissionID }),
    input.transaction.committed,
  )
  await writeJsonFileAtomic(
    pendingAttemptIngestionFile({ ...input, submissionID }),
    input.transaction.committed,
  )
  await fs.rm(pendingAttemptFile({ ...input, submissionID }), { force: true })
}

async function markQuestionSetAttemptIngestionCompleted(input: {
  directory: string
  record: CommittedQuestionSetAttempt
}): Promise<void> {
  const completed = CommittedQuestionSetAttemptSchema.parse({
    ...input.record,
    ingestion: { ...input.record.ingestion, completed: true },
  })
  await writeJsonFileAtomic(
    attemptIdempotencyFile({
      directory: input.directory,
      objectID: completed.ingestion.objectID,
      submissionID: completed.submissionID,
    }),
    completed,
  )
  await fs.rm(
    pendingAttemptIngestionFile({
      directory: input.directory,
      objectID: completed.ingestion.objectID,
      submissionID: completed.submissionID,
    }),
    { force: true },
  )
}

async function recoverPendingQuestionSetAttemptTransactions(input: {
  directory: string
  objectID: string
}): Promise<CommittedQuestionSetAttempt[]> {
  const pendingDirectory = questionSetStateFile({
    ...input,
    relativePath: QUESTION_SET_PENDING_ATTEMPT_DIRECTORY,
  })
  const entries = await fs.readdir(pendingDirectory, { withFileTypes: true }).catch((error) => {
    if (isNodeFsErrorCode(error, "ENOENT")) {
      return []
    }
    throw error
  })
  const transactions = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .toSorted((left, right) => left.name.localeCompare(right.name))
      .map((entry) =>
        readJsonIfPresent(
          path.join(pendingDirectory, entry.name),
          QuestionSetAttemptTransactionSchema,
        ),
      ),
  )
  const committed: CommittedQuestionSetAttempt[] = []
  for (const transaction of transactions) {
    if (!transaction) continue
    await commitQuestionSetAttemptTransaction({ ...input, transaction })
    committed.push(transaction.committed)
  }
  return committed
}

async function writeRecoveredQuestionSetAttemptAlias(input: {
  directory: string
  objectID: string
  submissionID: string
  recovered: CommittedQuestionSetAttempt
}): Promise<SubmitQuestionSetAttemptOutput> {
  const latest =
    (await readJsonIfPresent(
      attemptIdempotencyFile({
        directory: input.directory,
        objectID: input.objectID,
        submissionID: input.recovered.submissionID,
      }),
      CommittedQuestionSetAttemptSchema,
    )) ?? input.recovered
  const alias = CommittedQuestionSetAttemptSchema.parse({
    ...latest,
    submissionID: input.submissionID,
  })
  await writeJsonFileAtomic(attemptIdempotencyFile(input), alias)
  return alias.output
}

async function reconcileQuestionSetAttemptIngestion(input: {
  directory: string
  record: CommittedQuestionSetAttempt
}): Promise<void> {
  if (input.record.ingestion.completed) return
  const ingestion = input.record.ingestion
  await ingestQuestionSetAttempt({
    directory: input.directory,
    eventID: ingestion.eventID,
    eventCreatedAt: ingestion.eventCreatedAt,
    objectID: ingestion.objectID,
    attemptID: ingestion.attemptID,
    title: ingestion.title,
    groupType: ingestion.groupType,
    totalQuestions: ingestion.totalQuestions,
    correctQuestions: ingestion.correctQuestions,
    status: ingestion.status,
    tags: ingestion.tags,
    result: ingestion.result,
  })
  await markQuestionSetAttemptIngestionCompleted(input)
}

async function reconcilePendingQuestionSetAttemptIngestions(input: {
  directory: string
  objectID: string
}): Promise<void> {
  const pending = await listPendingQuestionSetAttemptIngestions(input)
  for (const record of pending) {
    await reconcileQuestionSetAttemptIngestion({ directory: input.directory, record }).catch(
      (error) => {
        console.warn(
          "Failed to reconcile a committed question-set attempt into learner memory:",
          error,
        )
      },
    )
  }
}

async function submitQuestionSetObjectAttempt(input: {
  directory: string
  objectID: string
  answers: QuestionSetAttemptAnswer[]
  submissionID: string
}): Promise<SubmitQuestionSetAttemptOutput> {
  const lockFile = questionSetStateFile({
    directory: input.directory,
    objectID: input.objectID,
    relativePath: QUESTION_SET_ATTEMPT_LOCK_FILE,
  })
  return withFileLock<SubmitQuestionSetAttemptOutput>(lockFile, async () => {
    const recovered = await recoverPendingQuestionSetAttemptTransactions(input)
    await reconcilePendingQuestionSetAttemptIngestions(input)
    const requestHash = questionSetAttemptRequestHash(input.answers)
    const existing = await readJsonIfPresent(
      attemptIdempotencyFile(input),
      CommittedQuestionSetAttemptSchema,
    )
    if (existing) {
      assertIdempotencyRequestHash(existing.requestHash, requestHash)
      return existing.output
    }

    const recoveredMatch = recovered.find((record) => record.requestHash === requestHash)
    if (recoveredMatch) {
      return writeRecoveredQuestionSetAttemptAlias({ ...input, recovered: recoveredMatch })
    }

    const questionSet = await readQuestionSetObjectPayload({
      directory: input.directory,
      objectID: input.objectID,
    })
    const evaluation = evaluateQuestionSet({
      questionSet,
      answers: input.answers,
    })
    const attemptID = generateObjectID()
    const attemptRecord = QuestionSetAttemptRecordSchema.parse({
      attemptID,
      kind: QUESTION_SET_ATTEMPT_KIND,
      objectID: input.objectID,
      submittedAt: new Date().toISOString(),
      answers: input.answers,
      result: evaluation,
    })
    const output = SubmitQuestionSetAttemptOutputSchema.parse({
      attemptID,
      objectID: input.objectID,
      result: evaluation,
    })
    const tags = dedupeStrings(questionSet.questions.flatMap((question) => question.goalIds))
    const committed = CommittedQuestionSetAttemptSchema.parse({
      submissionID: input.submissionID,
      requestHash,
      output,
      ingestion: {
        completed: false,
        eventID: createIdempotentEventID({
          namespace: QUESTION_SET_ATTEMPT_EVENT_NAMESPACE,
          objectID: input.objectID,
          submissionID: input.submissionID,
        }),
        eventCreatedAt: attemptRecord.submittedAt,
        objectID: input.objectID,
        attemptID,
        title: questionSet.title,
        groupType: questionSet.groupType,
        totalQuestions: evaluation.totalQuestions,
        correctQuestions: evaluation.correctQuestions,
        status: evaluation.status,
        tags,
        result: evaluation,
      },
    })
    const transaction = QuestionSetAttemptTransactionSchema.parse({
      attemptRecord,
      committed,
    })
    await writeJsonFileAtomic(pendingAttemptFile(input), transaction)
    await commitQuestionSetAttemptTransaction({
      directory: input.directory,
      objectID: input.objectID,
      transaction,
    })
    await reconcileQuestionSetAttemptIngestion({
      directory: input.directory,
      record: committed,
    }).catch((error) => {
      console.warn("Failed to ingest a committed question-set attempt into learner memory:", error)
    })
    return output
  })
}

export { submitQuestionSetObjectAttempt, evaluateQuestionSet }
