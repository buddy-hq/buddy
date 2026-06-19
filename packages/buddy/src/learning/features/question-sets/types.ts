import z from "zod"
import {
  BUDDY_OBJECT_KINDS,
  BuddyObjectIDSchema,
  BuddyObjectOriginSchema,
  QuestionSetGroupTypeSchema,
  QuestionSetInlineQuestionSchema,
  nonEmptyString,
  timestampString,
} from "../../../objects"

const QUESTION_SET_OBJECT_KIND = BUDDY_OBJECT_KINDS.questionSet
const QUESTION_SET_ATTEMPT_KIND = "question-set-attempt.v1" as const
const QUESTION_SET_SUBAGENT_ID = "question-set-author" as const
const QUESTION_SET_SURFACE = "question-set" as const

const GroupTypeSchema = QuestionSetGroupTypeSchema

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

const PublicQuestionSchema = QuestionSetInlineQuestionSchema

const QuestionSetObjectBaseSchema = z.object({
  objectID: BuddyObjectIDSchema,
  revisionID: BuddyObjectIDSchema,
  kind: z.literal(QUESTION_SET_OBJECT_KIND),
  groupType: GroupTypeSchema,
  title: nonEmptyString,
  instructions: nonEmptyString.optional(),
  contextSummary: nonEmptyString.optional(),
  createdAt: timestampString,
  createdBy: BuddyObjectOriginSchema,
})

const SavedQuestionSetObjectSchema = QuestionSetObjectBaseSchema.extend({
  questions: z.array(SavedQuestionSchema).min(1),
})

const PublicQuestionSetObjectSchema = QuestionSetObjectBaseSchema.extend({
  questions: z.array(PublicQuestionSchema).min(1),
})

const QuestionSetSummarySchema = z.object({
  groupType: GroupTypeSchema,
  questionCount: z.number().int().positive(),
  instructions: nonEmptyString.optional(),
  contextSummary: nonEmptyString.optional(),
})

const QuestionSetAttemptAnswerSchema = z.object({
  questionID: nonEmptyString,
  selectedChoiceIds: z.array(nonEmptyString),
})

const SubmitQuestionSetAttemptInputSchema = z.object({
  answers: z.array(QuestionSetAttemptAnswerSchema),
})

const QuestionSetEvaluationResultSchema = z.object({
  totalQuestions: z.number().int().nonnegative(),
  correctQuestions: z.number().int().nonnegative(),
  status: z.enum(["completed", "partial", "stuck"]),
  questions: z.array(
    z.object({
      questionID: nonEmptyString,
      correct: z.boolean(),
      selectedChoiceIds: z.array(nonEmptyString),
      correctChoiceIds: z.array(nonEmptyString),
      explanation: nonEmptyString.optional(),
      choices: z.array(
        z.object({
          choiceID: nonEmptyString,
          selected: z.boolean(),
          correct: z.boolean(),
          rationale: nonEmptyString.optional(),
        }),
      ),
    }),
  ),
})

const QuestionSetAttemptRecordSchema = z.object({
  attemptID: BuddyObjectIDSchema,
  kind: z.literal(QUESTION_SET_ATTEMPT_KIND),
  objectID: BuddyObjectIDSchema,
  submittedAt: timestampString,
  answers: z.array(QuestionSetAttemptAnswerSchema),
  result: QuestionSetEvaluationResultSchema,
})

const SubmitQuestionSetAttemptOutputSchema = z.object({
  attemptID: BuddyObjectIDSchema,
  objectID: BuddyObjectIDSchema,
  result: QuestionSetEvaluationResultSchema,
})

type GroupType = z.infer<typeof GroupTypeSchema>
type SavedQuestion = z.infer<typeof SavedQuestionSchema>
type SavedQuestionSetObject = z.infer<typeof SavedQuestionSetObjectSchema>
type PublicQuestionSetObject = z.infer<typeof PublicQuestionSetObjectSchema>
type QuestionSetAttemptAnswer = z.infer<typeof QuestionSetAttemptAnswerSchema>
type QuestionSetAttemptRecord = z.infer<typeof QuestionSetAttemptRecordSchema>
type QuestionSetEvaluationResult = z.infer<typeof QuestionSetEvaluationResultSchema>
type QuestionSetSummary = z.infer<typeof QuestionSetSummarySchema>
type SubmitQuestionSetAttemptInput = z.infer<typeof SubmitQuestionSetAttemptInputSchema>
type SubmitQuestionSetAttemptOutput = z.infer<typeof SubmitQuestionSetAttemptOutputSchema>

export {
  GroupTypeSchema,
  PublicQuestionSetObjectSchema,
  PublicQuestionSchema,
  QUESTION_SET_ATTEMPT_KIND,
  QUESTION_SET_OBJECT_KIND,
  QUESTION_SET_SUBAGENT_ID,
  QUESTION_SET_SURFACE,
  QuestionSetAttemptRecordSchema,
  QuestionSetEvaluationResultSchema,
  QuestionSetSummarySchema,
  SavedQuestionSetObjectSchema,
  SavedQuestionSchema,
  SubmitQuestionSetAttemptInputSchema,
  SubmitQuestionSetAttemptOutputSchema,
}

export type {
  GroupType,
  PublicQuestionSetObject,
  QuestionSetAttemptAnswer,
  QuestionSetAttemptRecord,
  QuestionSetEvaluationResult,
  QuestionSetSummary,
  SavedQuestion,
  SavedQuestionSetObject,
  SubmitQuestionSetAttemptInput,
  SubmitQuestionSetAttemptOutput,
}
