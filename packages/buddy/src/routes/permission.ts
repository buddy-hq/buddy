import { Hono, type Context } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { Schema } from "effect"
import z from "zod"
import { PermissionRequest, SavedPermission } from "@buddy/transcript-contract/permission"
import {
  isPermissionMissingError,
  getPendingPermission,
  listPendingPermissionsForLocation,
  listPendingPermissionsForSessionTree,
  listSavedPermissions,
  removeSavedPermission,
  replyToPermission,
  type PermissionClient,
} from "@buddy/opencode-adapter/gateway/permission"
import { toOpenApiSchema } from "../http/effect-schema"
import { booleanJsonResponse, routeErrors, RequestIDParamSchema, directoryQuerySchema } from "../http/openapi"
import type { AllowedDirectoryResult } from "../http/directory"
import { runSdkRoute } from "../http/sdk-response"
import type { SessionInfo } from "@buddy/opencode-adapter/host"
import { resolveDirectory as resolveNotebookDirectory } from "../project/directory"
import { isPathInsideDirectory } from "../storage/path-containment"

const permissionReplyRequestSchema = z.object({
  reply: z.enum(["once", "always", "reject"]),
  message: z.string().trim().min(1).optional(),
}).refine((input) => input.message === undefined || input.reply === "reject", { message: "Feedback is only supported when denying a request" })
const permissionListQuerySchema = directoryQuerySchema.extend({ sessionID: z.string().min(1).optional() })
const savedIDParamSchema = z.object({ id: z.string().min(1) })

function sessionIsInsideNotebook(session: SessionInfo, directory: string): boolean {
  return isPathInsideDirectory(resolveNotebookDirectory(directory), resolveNotebookDirectory(session.location.directory))
}

function listNotebookSessionPermissions(client: PermissionClient, sessionID: string, directory: string): Promise<PermissionRequest[]> {
  return listPendingPermissionsForSessionTree({
    permission: client.permission,
    sessions: {
      ...client.sessions,
      list: async (input) => {
        const page = await client.sessions.list(input)
        return { ...page, data: page.data.filter((session) => sessionIsInsideNotebook(session, directory)) }
      },
    },
  }, sessionID)
}

function runPermissionRoute(context: Context, task: () => Promise<Response>): Promise<Response> {
  return runSdkRoute(context, async () => {
    try {
      return await task()
    } catch (error) {
      if (isPermissionMissingError(error)) return context.json({ error: "Permission request or session not found" }, 404)
      throw error
    }
  })
}

export function createPermissionRoutes(
  getClient: (directory: string) => Promise<PermissionClient>,
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
        ...routeErrors(403, 404),
      },
    }), validator("query", permissionListQuerySchema), async (c) => runPermissionRoute(c, async () => {
      const directoryResult = await resolveDirectory(c)
      if (!directoryResult.ok) return directoryResult.response
      const client = await getClient(directoryResult.directory)
      const sessionID = c.req.valid("query").sessionID
      if (sessionID !== undefined) {
        const session = await client.sessions.get({ sessionID })
        if (!sessionIsInsideNotebook(session, directoryResult.directory)) return c.json({ error: "Session not found in this notebook" }, 404)
        return c.json(await listNotebookSessionPermissions(client, sessionID, directoryResult.directory))
      }
      return c.json(await listPendingPermissionsForLocation(client, directoryResult.directory))
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
      return c.json(await listSavedPermissions(await getClient(directoryResult.directory), directoryResult.directory))
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
      const removed = await removeSavedPermission(await getClient(directoryResult.directory), directoryResult.directory, c.req.valid("param").id)
      return removed ? c.json(true) : c.json({ error: "Remembered approval not found in this notebook" }, 404)
    }))
    .post("/:requestID/reply", describeRoute({
      operationId: "permission.reply",
      summary: "Reply to a permission request",
      responses: {
        200: { description: "Permission reply accepted", content: { "application/json": booleanJsonResponse } },
        ...routeErrors(400, 403, 404),
      },
    }), validator("query", permissionListQuerySchema), validator("param", RequestIDParamSchema), validator("json", permissionReplyRequestSchema), async (c) => runPermissionRoute(c, async () => {
      const directoryResult = await resolveDirectory(c)
      if (!directoryResult.ok) return directoryResult.response
      const client = await getClient(directoryResult.directory)
      const requestID = c.req.valid("param").requestID
      const sessionID = c.req.valid("query").sessionID
      let request: PermissionRequest | undefined
      if (sessionID === undefined) {
        const requests = await listPendingPermissionsForLocation(client, directoryResult.directory)
        request = requests.find((pending) => pending.id === requestID)
      } else {
        const session = await client.sessions.get({ sessionID })
        if (!sessionIsInsideNotebook(session, directoryResult.directory)) return c.json({ error: "Session not found in this notebook" }, 404)
        request = await getPendingPermission(client, sessionID, requestID)
      }
      if (request === undefined) return c.json({ error: "Permission request not found in this notebook" }, 404)
      await replyToPermission(client, { ...c.req.valid("json"), requestID, sessionID: request.sessionID })
      return c.json(true)
    }))
}

export const PermissionRoutes = createPermissionRoutes(async () => {
  const { getOpenCodeClient } = await import("../opencode-runtime/client")
  return getOpenCodeClient()
})
