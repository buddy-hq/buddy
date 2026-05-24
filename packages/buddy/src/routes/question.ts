import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import {
  booleanJsonResponse,
  routeErrors,
  directoryQuerySchema,
  RequestIDParamSchema,
  ensureAllowedDirectory,
  respondWithSdkResult,
  runSdkRoute,
  openCodeDirectoryParams,
} from "../http"
import { getOpenCodeClient } from "../opencode-runtime/client"

const questionOptionSchema = z.object({
  label: z.string(),
  description: z.string(),
})

const questionInfoSchema = z.object({
  question: z.string(),
  header: z.string(),
  options: z.array(questionOptionSchema),
  multiple: z.boolean().optional(),
  custom: z.boolean().optional(),
})

const questionRequestSchema = z.object({
  id: z.string(),
  sessionID: z.string(),
  questions: z.array(questionInfoSchema),
  tool: z
    .object({
      messageID: z.string(),
      callID: z.string(),
    })
    .optional(),
})

const questionReplyRequestSchema = z.object({
  answers: z.array(z.array(z.string())),
})

export const QuestionRoutes = new Hono()
  .get(
    "/",
    describeRoute({
      operationId: "question.list",
      summary: "List pending question requests",
      responses: {
        200: {
          description: "Pending question requests",
          content: {
            "application/json": {
              schema: resolver(questionRequestSchema.array()),
            },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      runSdkRoute(c, async () => {
        const directoryResult = ensureAllowedDirectory(c)
        if (!directoryResult.ok) return directoryResult.response

        const client = await getOpenCodeClient(directoryResult.directory)
        const result = await client.question.list(openCodeDirectoryParams(directoryResult.directory))
        return respondWithSdkResult(c, result)
      }),
  )
  .post(
    "/:requestID/reply",
    describeRoute({
      operationId: "question.reply",
      summary: "Reply to a question request",
      responses: {
        200: {
          description: "Question reply accepted",
          content: {
            "application/json": booleanJsonResponse,
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", RequestIDParamSchema),
    validator("json", questionReplyRequestSchema),
    async (c) =>
      runSdkRoute(c, async () => {
        const directoryResult = ensureAllowedDirectory(c)
        if (!directoryResult.ok) return directoryResult.response

        const client = await getOpenCodeClient(directoryResult.directory)
        const result = await client.question.reply({
          requestID: c.req.valid("param").requestID,
          answers: c.req.valid("json").answers,
          ...openCodeDirectoryParams(directoryResult.directory),
        })
        return respondWithSdkResult(c, result)
      }),
  )
  .post(
    "/:requestID/reject",
    describeRoute({
      operationId: "question.reject",
      summary: "Reject a question request",
      responses: {
        200: {
          description: "Question rejection accepted",
          content: {
            "application/json": booleanJsonResponse,
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", RequestIDParamSchema),
    async (c) =>
      runSdkRoute(c, async () => {
        const directoryResult = ensureAllowedDirectory(c)
        if (!directoryResult.ok) return directoryResult.response

        const client = await getOpenCodeClient(directoryResult.directory)
        const result = await client.question.reject({
          requestID: c.req.valid("param").requestID,
          ...openCodeDirectoryParams(directoryResult.directory),
        })
        return respondWithSdkResult(c, result)
      }),
  )
