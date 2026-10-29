import { routeErrorBody } from "../http/route-errors"
import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import {
  booleanJsonResponse,
  routeErrors,
  directoryQuerySchema,
  RequestIDParamSchema,
  ensureAllowedDirectory,
  runRouteTask,
} from "../http"
import { mapRouteError } from "../http/route-errors"
import type { AgentQuestion } from "@buddy/agent-runtime/forms"
import type { AgentRuntime } from "@buddy/agent-runtime/runtime"
import { getAgentRuntime } from "../runtime/agent-runtime"

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

function questionError(error: Error) {
  return mapRouteError(error)
}

/** Creates notebook-scoped question endpoints using each session's runtime instance. */
export function createQuestionRoutes(getRuntime: () => Promise<Pick<AgentRuntime, "forms">> = getAgentRuntime) {
  return new Hono()
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
        runRouteTask({ mapError: questionError, task: async () => {
          const directoryResult = ensureAllowedDirectory(c)
          if (!directoryResult.ok) return directoryResult.response

          const runtime = await getRuntime()
          const questions: AgentQuestion[] = await runtime.forms.pending({ directory: directoryResult.directory })
          return c.json(questions)
        }}),
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
          ...routeErrors(400, 403, 404, 409),
        },
      }),
      validator("query", directoryQuerySchema),
      validator("param", RequestIDParamSchema),
      validator("json", questionReplyRequestSchema),
      async (c) =>
        runRouteTask({ mapError: questionError, task: async () => {
          const directoryResult = ensureAllowedDirectory(c)
          if (!directoryResult.ok) return directoryResult.response

          const runtime = await getRuntime()
          const questions: AgentQuestion[] = await runtime.forms.pending({ directory: directoryResult.directory })
          const form = questions.find((entry) => entry.id === c.req.valid("param").requestID)
          if (!form) return c.json(routeErrorBody(404, "Question not found"), 404)
          await runtime.forms.answer(form.sessionID, form.id, c.req.valid("json").answers)
          return c.json(true)
        }}),
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
          ...routeErrors(400, 403, 404, 409),
        },
      }),
      validator("query", directoryQuerySchema),
      validator("param", RequestIDParamSchema),
      async (c) =>
        runRouteTask({ mapError: questionError, task: async () => {
          const directoryResult = ensureAllowedDirectory(c)
          if (!directoryResult.ok) return directoryResult.response

          const runtime = await getRuntime()
          const questions: AgentQuestion[] = await runtime.forms.pending({ directory: directoryResult.directory })
          const form = questions.find((entry) => entry.id === c.req.valid("param").requestID)
          if (!form) return c.json(routeErrorBody(404, "Question not found"), 404)
          await runtime.forms.dismiss(form.sessionID, form.id)
          return c.json(true)
        }}),
    )
}

export const QuestionRoutes = createQuestionRoutes()
