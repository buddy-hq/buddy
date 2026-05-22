import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import {
  booleanJsonResponse,
  routeErrors,
  directoryQuerySchema,
  RequestIDParamSchema,
} from "../http"
import { withDirectoryRoute } from "../http"
import {
  listPendingQuestionRequests,
  rejectPendingQuestionRequest,
  replyPendingQuestionRequest,
} from "../pi-backend/ui-requests"

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
      withDirectoryRoute(c, async (context) =>
        c.json(listPendingQuestionRequests(context.directory)),
      ),
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
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", RequestIDParamSchema),
    validator("json", questionReplyRequestSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const ok = replyPendingQuestionRequest(
          context.directory,
          c.req.valid("param").requestID,
          c.req.valid("json").answers,
        )
        if (!ok) {
          return c.json({ error: "Question request not found" }, 404)
        }
        return c.json(true)
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
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", RequestIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const ok = rejectPendingQuestionRequest(context.directory, c.req.valid("param").requestID)
        if (!ok) {
          return c.json({ error: "Question request not found" }, 404)
        }
        return c.json(true)
      }),
  )
