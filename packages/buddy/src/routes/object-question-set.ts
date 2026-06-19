import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { BuddyObjectIDSchema, mapBuddyObjectRouteError } from "../objects"
import {
  PublicQuestionSetObjectReadSchema,
  readPublicQuestionSetObject,
} from "../learning/features/question-sets/storage/save-object"
import { submitQuestionSetObjectAttempt } from "../learning/features/question-sets/storage/submit-attempt"
import {
  QuestionSetEvaluationResultSchema,
  SubmitQuestionSetAttemptInputSchema,
} from "../learning/features/question-sets/types"

const objectIDParamSchema = z
  .object({
    objectID: BuddyObjectIDSchema,
  })
  .strict()

const SubmitQuestionSetObjectAttemptOutputSchema = z
  .object({
    attemptID: BuddyObjectIDSchema,
    objectID: BuddyObjectIDSchema,
    result: QuestionSetEvaluationResultSchema,
  })
  .strict()

function mapQuestionSetObjectRouteError(error: unknown): Response | undefined {
  return mapBuddyObjectRouteError(error)
}

export const ObjectQuestionSetRoutes = new Hono()
  .get(
    "/:objectID/questions",
    describeRoute({
      operationId: "objectQuestionSet.readQuestions",
      summary: "Read persisted question-set practice payload",
      responses: {
        200: {
          description: "Public question-set practice payload",
          content: {
            "application/json": {
              schema: resolver(PublicQuestionSetObjectReadSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404, 410, 500),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", objectIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            const questionSet = await readPublicQuestionSetObject({
              directory: context.directory,
              objectID: params.objectID,
            })
            return c.json(questionSet)
          },
          mapError: mapQuestionSetObjectRouteError,
        }),
      ),
  )
  .post(
    "/:objectID/attempts",
    describeRoute({
      operationId: "objectQuestionSet.submitAttempt",
      summary: "Submit and grade a question-set object attempt",
      responses: {
        200: {
          description: "Evaluated question-set object attempt",
          content: {
            "application/json": {
              schema: resolver(SubmitQuestionSetObjectAttemptOutputSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404, 410, 500),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", objectIDParamSchema),
    validator("json", SubmitQuestionSetAttemptInputSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            const payload = c.req.valid("json")
            const result = await submitQuestionSetObjectAttempt({
              directory: context.directory,
              objectID: params.objectID,
              answers: payload.answers,
            })
            return c.json(SubmitQuestionSetObjectAttemptOutputSchema.parse(result))
          },
          mapError: mapQuestionSetObjectRouteError,
        }),
      ),
  )
