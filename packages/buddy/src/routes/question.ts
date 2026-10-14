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
import { toBuddyQuestion, toFormAnswer } from "@buddy/opencode-adapter/gateway/form"
import type { OpenCodeHost } from "@buddy/opencode-adapter/host"
import { getOpenCodeClient } from "../opencode-runtime/client"
import { resolveDirectory } from "../project/directory"
import { isPathInsideDirectory } from "../storage/path-containment"

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
  const status = error.name === "FormNotFoundError" || error.name === "SessionNotFoundError" ? 404
    : error.name === "FormAlreadySettledError" ? 409
    : error.name === "FormInvalidAnswerError" || error.name === "InvalidRequestError" ? 400 : 500
  return Response.json({ error: error.message }, { status })
}

async function listNotebookForms(client: Pick<OpenCodeHost, "session">, directory: string) {
  const pages: Awaited<ReturnType<OpenCodeHost["session"]["form"]["list"]>>[] = []
  let cursor: string | undefined
  do {
    const sessions = await client.session.list({ directory, cursor })
    for (const session of sessions.data) {
      if (!isPathInsideDirectory(directory, resolveDirectory(session.location.directory))) continue
      pages.push(await client.session.form.list({ sessionID: session.id }))
    }
    cursor = sessions.cursor.next ?? undefined
  } while (cursor !== undefined)
  return pages.flat()
}

/** Creates notebook-scoped question endpoints using each session's runtime instance. */
export function createQuestionRoutes(getClient: () => Promise<Pick<OpenCodeHost, "session">>) {
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

          const client = await getClient()
          const forms = await listNotebookForms(client, directoryResult.directory)
          return c.json(forms.flatMap((form) => { const question = toBuddyQuestion(form); return question ? [question] : [] }))
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

          const client = await getClient()
          const forms = await listNotebookForms(client, directoryResult.directory)
          const form = forms.find((entry) => entry.id === c.req.valid("param").requestID && toBuddyQuestion(entry))
          if (!form) return c.json({ error: "Question not found" }, 404)
          const answer = toFormAnswer(form, c.req.valid("json").answers)
          if (!answer.ok) return c.json({ error: answer.error }, 400)
          await client.session.form.reply({ sessionID: form.sessionID, formID: form.id, answer: answer.answer })
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

          const client = await getClient()
          const forms = await listNotebookForms(client, directoryResult.directory)
          const form = forms.find((entry) => entry.id === c.req.valid("param").requestID && toBuddyQuestion(entry))
          if (!form) return c.json({ error: "Question not found" }, 404)
          await client.session.form.cancel({ sessionID: form.sessionID, formID: form.id })
          return c.json(true)
        }}),
    )
}

export const QuestionRoutes = createQuestionRoutes(getOpenCodeClient)
