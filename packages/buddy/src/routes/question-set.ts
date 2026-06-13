import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { mapArtifactRouteError } from "../artifacts"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { readPublicQuestionSetArtifact } from "../learning/features/question-sets/storage/read-artifact"
import { submitQuestionSetAttempt } from "../learning/features/question-sets/storage/submit-attempt"
import {
  PublicQuestionSetArtifactSchema,
  SubmitQuestionSetAttemptInputSchema,
  SubmitQuestionSetAttemptOutputSchema,
} from "../learning/features/question-sets/types"

const artifactIDParamSchema = z.object({
  artifactID: z.string(),
})

export const QuestionSetRoutes = new Hono()
  .get(
    "/:artifactID",
    describeRoute({
      operationId: "questionSet.read",
      summary: "Read persisted question-set artifact",
      responses: {
        200: {
          description: "Public question-set artifact",
          content: {
            "application/json": {
              schema: resolver(PublicQuestionSetArtifactSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", artifactIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const artifact = await readPublicQuestionSetArtifact(
              context.directory,
              c.req.valid("param").artifactID,
            )
            return Response.json(artifact)
          },
          mapError: mapArtifactRouteError,
        }),
      ),
  )
  .post(
    "/:artifactID/attempts",
    describeRoute({
      operationId: "questionSet.submitAttempt",
      summary: "Submit and grade a question-set attempt",
      responses: {
        200: {
          description: "Evaluated question-set attempt",
          content: {
            "application/json": {
              schema: resolver(SubmitQuestionSetAttemptOutputSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", artifactIDParamSchema),
    validator("json", SubmitQuestionSetAttemptInputSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const { artifactID } = c.req.valid("param")
            const payload = c.req.valid("json")
            const result = await submitQuestionSetAttempt({
              directory: context.directory,
              artifactID,
              answers: payload.answers,
            })
            return Response.json(result)
          },
          mapError: mapArtifactRouteError,
        }),
      ),
  )
