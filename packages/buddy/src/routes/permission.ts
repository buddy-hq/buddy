import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import {
  booleanJsonResponse,
  routeErrors,
  directoryQuerySchema,
  RequestIDParamSchema,
} from "../http"
import { proxyToOpenCode } from "../http"

const permissionReplyRequestSchema = z.object({
  reply: PermissionNext.Reply,
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
              schema: resolver(PermissionNext.Request.array()),
            },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) => {
      return proxyToOpenCode(c, {
        targetPath: "/permission",
      })
    },
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
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", RequestIDParamSchema),
    validator("json", permissionReplyRequestSchema),
    async (c) => {
      return proxyToOpenCode(c, {
        targetPath: `/permission/${encodeURIComponent(c.req.valid("param").requestID)}/reply`,
      })
    },
  )
