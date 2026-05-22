import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import {
  booleanJsonResponse,
  routeErrors,
  directoryQuerySchema,
  RequestIDParamSchema,
  withDirectoryRoute,
} from "../http"
import {
  listPendingPermissionRequests,
  replyPendingPermissionRequest,
} from "../pi-backend/ui-requests"

const permissionRequestSchema = z.object({
  id: z.string(),
  sessionID: z.string(),
  permission: z.string(),
  patterns: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()),
  always: z.array(z.string()),
  tool: z
    .object({
      messageID: z.string(),
      callID: z.string(),
    })
    .nullable()
    .optional(),
})

const permissionReplyRequestSchema = z.object({
  reply: z.enum(["once", "always", "reject"]),
  message: z.string().optional(),
})

export const PermissionRoutes = new Hono()
  .get(
    "/",
    describeRoute({
      operationId: "permission.list",
      summary: "List pending permission requests",
      responses: {
        200: {
          description: "Pending permission requests",
          content: {
            "application/json": {
              schema: resolver(z.array(permissionRequestSchema)),
            },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        c.json(listPendingPermissionRequests(context.directory)),
      ),
  )
  .post(
    "/:requestID/reply",
    describeRoute({
      operationId: "permission.reply",
      summary: "Reply to a permission request",
      responses: {
        200: {
          description: "Permission reply accepted",
          content: {
            "application/json": booleanJsonResponse,
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", RequestIDParamSchema),
    validator("json", permissionReplyRequestSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const ok = replyPendingPermissionRequest(
          context.directory,
          c.req.valid("param").requestID,
          c.req.valid("json").reply,
          c.req.valid("json").message,
        )
        if (!ok) {
          return c.json({ error: "Permission request not found" }, 404)
        }
        return c.json(true)
      }),
  )
