import z from "zod"
import {
  ARTIFACT_KINDS,
  ArtifactIDSchema,
  ArtifactManifestBaseSchema,
  ArtifactToolOriginSchema,
  nonEmptyString,
  timestampString,
} from "../../../artifacts"

const QUESTION_SET_ARTIFACT_KIND = ARTIFACT_KINDS.questionSet
const QUESTION_SET_ATTEMPT_KIND = "question-set-attempt.v1" as const
const QUESTION_SET_SUBAGENT_ID = "question-set-author" as const
const QUESTION_SET_SURFACE = "question-set" as const

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

const PublicMcqChoiceSchema = z.object({
  id: nonEmptyString,
  content: nonEmptyString,
  isNoneOfTheAbove: z.boolean().optional(),
})

const PublicMcqPayloadSchema = z.object({
  multipleSelect: z.boolean(),
  countChoices: z.boolean().optional(),
  numCorrect: z.number().int().positive().optional(),
  hasNoneOfTheAbove: z.boolean().optional(),
  randomize: z.boolean().optional(),
  choices: z.array(PublicMcqChoiceSchema).min(2),
})

const SavedQuestionSchema = z.object({
  id: nonEmptyString,
  type: z.literal("mcq"),
  prompt: nonEmptyString,
  goalIds: z.array(nonEmptyString).min(1),
  explanation: nonEmptyString.optional(),
  payload: SavedMcqPayloadSchema,
})

const PublicQuestionSchema = z.object({
  id: nonEmptyString,
  type: z.literal("mcq"),
  prompt: nonEmptyString,
  goalIds: z.array(nonEmptyString).min(1),
  explanation: nonEmptyString.optional(),
  payload: PublicMcqPayloadSchema,
})

const QuestionSetCreatedBySchema = ArtifactToolOriginSchema.extend({
  subagent: z.literal(QUESTION_SET_SUBAGENT_ID),
})

const QuestionSetArtifactBaseSchema = z.object({
  artifactID: ArtifactIDSchema,
  kind: z.literal(QUESTION_SET_ARTIFACT_KIND),
  groupType: GroupTypeSchema,
  title: nonEmptyString,
  instructions: nonEmptyString.optional(),
  contextSummary: nonEmptyString.optional(),
  createdAt: timestampString,
  createdBy: QuestionSetCreatedBySchema,
})

const SavedQuestionSetArtifactSchema = QuestionSetArtifactBaseSchema.extend({
  questions: z.array(SavedQuestionSchema).min(1),
})

const PublicQuestionSetArtifactSchema = QuestionSetArtifactBaseSchema.extend({
  questions: z.array(PublicQuestionSchema).min(1),
})

const SaveQuestionSetOutputSchema = z.object({
  artifactID: ArtifactIDSchema,
  kind: z.literal(QUESTION_SET_ARTIFACT_KIND),
  groupType: GroupTypeSchema,
  title: nonEmptyString,
  questionCount: z.number().int().positive(),
  artifactUrl: nonEmptyString,
})

const QuestionSetSummarySchema = z.object({
  groupType: GroupTypeSchema,
  questionCount: z.number().int().positive(),
  instructions: nonEmptyString.optional(),
  contextSummary: nonEmptyString.optional(),
})

const QuestionSetArtifactManifestSchema = ArtifactManifestBaseSchema.extend({
  kind: z.literal(QUESTION_SET_ARTIFACT_KIND),
  origin: QuestionSetCreatedBySchema,
  summary: QuestionSetSummarySchema,
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
  attemptID: ArtifactIDSchema,
  kind: z.literal(QUESTION_SET_ATTEMPT_KIND),
  artifactID: ArtifactIDSchema,
  submittedAt: timestampString,
  answers: z.array(QuestionSetAttemptAnswerSchema),
  result: QuestionSetEvaluationResultSchema,
})

const SubmitQuestionSetAttemptOutputSchema = z.object({
  attemptID: ArtifactIDSchema,
  artifactID: ArtifactIDSchema,
  result: QuestionSetEvaluationResultSchema,
})

type GroupType = z.infer<typeof GroupTypeSchema>
type SaveQuestionSetOutput = z.infer<typeof SaveQuestionSetOutputSchema>
type SavedQuestion = z.infer<typeof SavedQuestionSchema>
type SavedQuestionSetArtifact = z.infer<typeof SavedQuestionSetArtifactSchema>
type PublicQuestionSetArtifact = z.infer<typeof PublicQuestionSetArtifactSchema>
type QuestionSetAttemptAnswer = z.infer<typeof QuestionSetAttemptAnswerSchema>
type QuestionSetAttemptRecord = z.infer<typeof QuestionSetAttemptRecordSchema>
type QuestionSetEvaluationResult = z.infer<typeof QuestionSetEvaluationResultSchema>
type QuestionSetArtifactManifest = z.infer<typeof QuestionSetArtifactManifestSchema>
type QuestionSetSummary = z.infer<typeof QuestionSetSummarySchema>
type SubmitQuestionSetAttemptInput = z.infer<typeof SubmitQuestionSetAttemptInputSchema>
type SubmitQuestionSetAttemptOutput = z.infer<typeof SubmitQuestionSetAttemptOutputSchema>

export {
  GroupTypeSchema,
  PublicQuestionSetArtifactSchema,
  QUESTION_SET_ARTIFACT_KIND,
  QUESTION_SET_ATTEMPT_KIND,
  QUESTION_SET_SUBAGENT_ID,
  QUESTION_SET_SURFACE,
  QuestionSetArtifactManifestSchema,
  QuestionSetAttemptRecordSchema,
  QuestionSetEvaluationResultSchema,
  QuestionSetSummarySchema,
  SavedQuestionSetArtifactSchema,
  SaveQuestionSetOutputSchema,
  SubmitQuestionSetAttemptInputSchema,
  SubmitQuestionSetAttemptOutputSchema,
}

export type {
  GroupType,
  PublicQuestionSetArtifact,
  QuestionSetArtifactManifest,
  QuestionSetAttemptAnswer,
  QuestionSetAttemptRecord,
  QuestionSetEvaluationResult,
  QuestionSetSummary,
  SavedQuestion,
  SavedQuestionSetArtifact,
  SaveQuestionSetOutput,
  SubmitQuestionSetAttemptInput,
  SubmitQuestionSetAttemptOutput,
}
