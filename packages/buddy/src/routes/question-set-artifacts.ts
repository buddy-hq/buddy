import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import {
  PublicQuestionSetArtifactSchema,
  QuestionSetService,
  SubmitQuestionSetAttemptInputSchema,
  SubmitQuestionSetAttemptOutputSchema,
  mapQuestionSetRouteError,
} from "../learning/capabilities"

const artifactIDParamSchema = z.object({
  artifactID: z.string(),
})

const questionSetArtifactListResponseSchema = z.object({
  artifacts: z.array(PublicQuestionSetArtifactSchema),
})

export const QuestionSetArtifactRoutes = new Hono()
  .get(
    "/",
    describeRoute({
      operationId: "questionSetArtifacts.list",
      summary: "List persisted question-set artifacts",
      responses: {
        200: {
          description: "Workspace question-set artifacts",
          content: {
            "application/json": {
              schema: resolver(questionSetArtifactListResponseSchema),
            },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const artifacts = await QuestionSetService.list(context.directory)
            return Response.json({ artifacts })
          },
          mapError: mapQuestionSetRouteError,
        }),
      ),
  )
  .get(
    "/:artifactID",
    describeRoute({
      operationId: "questionSetArtifacts.read",
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
            const artifact = await QuestionSetService.readPublic(
              context.directory,
              c.req.valid("param").artifactID,
            )
            return Response.json(artifact)
          },
          mapError: mapQuestionSetRouteError,
        }),
      ),
  )
  .post(
    "/:artifactID/attempts",
    describeRoute({
      operationId: "questionSetArtifacts.submitAttempt",
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
            const result = await QuestionSetService.submitAttempt({
              directory: context.directory,
              artifactID,
              answers: payload.answers,
            })
            return Response.json(result)
          },
          mapError: mapQuestionSetRouteError,
        }),
      ),
  )
