import { routeErrorBody } from "../http/route-errors"
import { Hono, type Context } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { Schema } from "effect"
import z from "zod"
import { PermissionRequest, SavedPermission } from "@buddy/transcript-contract/permission"
import { isNotFound } from "@buddy/agent-runtime/errors"
import type { AgentRuntime } from "@buddy/agent-runtime/runtime"
import { getAgentRuntime } from "../runtime/agent-runtime"
import { toOpenApiSchema } from "../http/effect-schema"
import { booleanJsonResponse, routeErrors, RequestIDParamSchema, directoryQuerySchema } from "../http/openapi"
import type { AllowedDirectoryResult } from "../http/directory"
import { runSdkRoute } from "../http/sdk-response"
import type { Session } from "@buddy/transcript-contract/session"
import { resolveDirectory as resolveNotebookDirectory } from "../project/directory"
import { isPathInsideDirectory } from "../storage/path-containment"

const permissionReplyRequestSchema = z.object({
  reply: z.enum(["once", "always", "reject"]),
  message: z.string().trim().min(1).optional(),
}).refine((input) => input.message === undefined || input.reply === "reject", { message: "Feedback is only supported when denying a request" })
const permissionListQuerySchema = directoryQuerySchema.extend({ sessionID: z.string({ error: "sessionID is required" }).min(1, "sessionID is required") })
const permissionQueryValidator = validator("query", permissionListQuerySchema, (result, c) => {
  if (result.success) return
  return c.json(routeErrorBody(400, result.error[0]?.message ?? "Invalid permission query"), 400)
})
const savedIDParamSchema = z.object({ id: z.string().min(1) })

function sessionIsInsideNotebook(session: Session, directory: string): boolean {
  return isPathInsideDirectory(resolveNotebookDirectory(directory), resolveNotebookDirectory(session.directory))
}

type PermissionRuntime = Pick<AgentRuntime, "approvals" | "conversations">

async function listNotebookSessionPermissions(runtime: PermissionRuntime, sessionID: string, directory: string): Promise<PermissionRequest[]> {
  const allowed = new Set([sessionID])
  const queue = [sessionID]
  for (const id of queue) {
    const children = await runtime.conversations.children(id)
    for (const child of children) {
      if (allowed.has(child.id) || !sessionIsInsideNotebook(child, directory)) continue
      allowed.add(child.id)
      queue.push(child.id)
    }
  }
  return runtime.approvals.pending({ sessions: [...allowed] })
}

function runPermissionRoute(context: Context, task: () => Promise<Response>): Promise<Response> {
  return runSdkRoute(context, async () => {
    try {
      return await task()
    } catch (error) {
      if (isNotFound(error, "permission") || isNotFound(error, "session")) return context.json(routeErrorBody(404, "Permission request or session not found"), 404)
      throw error
    }
  })
}

export function createPermissionRoutes(
  getRuntime: (directory: string) => Promise<PermissionRuntime> = getAgentRuntime,
  resolveDirectory: (context: Context) => AllowedDirectoryResult | Promise<AllowedDirectoryResult> = async (context) => {
    const { ensureAllowedDirectory } = await import("../http/directory")
    return ensureAllowedDirectory(context)
  },
) {
  return new Hono()
    .get("/", describeRoute({
      operationId: "permission.list",
      summary: "List pending permissions for a chat and its subagents",
      responses: {
        200: { description: "Pending permission requests", content: { "application/json": { schema: resolver(toOpenApiSchema(Schema.Array(PermissionRequest))) } } },
        ...routeErrors(400, 403, 404),
      },
    }), permissionQueryValidator, async (c) => runPermissionRoute(c, async () => {
      const directoryResult = await resolveDirectory(c)
      if (!directoryResult.ok) return directoryResult.response
      const runtime = await getRuntime(directoryResult.directory)
      const sessionID = c.req.valid("query").sessionID
      const session = await runtime.conversations.get(sessionID)
      if (!sessionIsInsideNotebook(session, directoryResult.directory)) return c.json(routeErrorBody(404, "Session not found in this notebook"), 404)
      return c.json(await listNotebookSessionPermissions(runtime, sessionID, directoryResult.directory))
    }))
    .get("/saved", describeRoute({
      operationId: "permission.saved.list",
      summary: "List remembered approvals for this notebook's project",
      responses: {
        200: { description: "Remembered approvals", content: { "application/json": { schema: resolver(toOpenApiSchema(Schema.Array(SavedPermission))) } } },
        ...routeErrors(403),
      },
    }), validator("query", directoryQuerySchema), async (c) => runPermissionRoute(c, async () => {
      const directoryResult = await resolveDirectory(c)
      if (!directoryResult.ok) return directoryResult.response
      return c.json(await (await getRuntime(directoryResult.directory)).approvals.saved(directoryResult.directory))
    }))
    .delete("/saved/:id", describeRoute({
      operationId: "permission.saved.remove",
      summary: "Remove a remembered approval from this notebook's project",
      responses: {
        200: { description: "Approval removed", content: { "application/json": booleanJsonResponse } },
        ...routeErrors(403, 404),
      },
    }), validator("query", directoryQuerySchema), validator("param", savedIDParamSchema), async (c) => runPermissionRoute(c, async () => {
      const directoryResult = await resolveDirectory(c)
      if (!directoryResult.ok) return directoryResult.response
      const removed = await (await getRuntime(directoryResult.directory)).approvals.forget(directoryResult.directory, c.req.valid("param").id)
      return removed ? c.json(true) : c.json(routeErrorBody(404, "Remembered approval not found in this notebook"), 404)
    }))
    .post("/:requestID/reply", describeRoute({
      operationId: "permission.reply",
      summary: "Reply to a permission request",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["reply"],
              properties: {
                reply: { type: "string", enum: ["once", "always", "reject"] },
                message: { type: "string", minLength: 1 },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Permission reply accepted", content: { "application/json": booleanJsonResponse } },
        ...routeErrors(400, 403, 404),
      },
    }), permissionQueryValidator, validator("param", RequestIDParamSchema), validator("json", permissionReplyRequestSchema), async (c) => runPermissionRoute(c, async () => {
      const directoryResult = await resolveDirectory(c)
      if (!directoryResult.ok) return directoryResult.response
      const runtime = await getRuntime(directoryResult.directory)
      const requestID = c.req.valid("param").requestID
      const sessionID = c.req.valid("query").sessionID
      const session = await runtime.conversations.get(sessionID)
      if (!sessionIsInsideNotebook(session, directoryResult.directory)) return c.json(routeErrorBody(404, "Session not found in this notebook"), 404)
      const request = await runtime.approvals.get(sessionID, requestID)
      await runtime.approvals.reply({ ...c.req.valid("json"), requestID, sessionID: request.sessionID })
      return c.json(true)
    }))
}

export const PermissionRoutes = createPermissionRoutes()
