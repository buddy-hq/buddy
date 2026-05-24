import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { Schema } from "effect"
import z from "zod"
import { PermissionNext } from "@buddy/opencode-adapter/permission"
import { toOpenApiSchema } from "../http/effect-schema"
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
              schema: resolver(toOpenApiSchema(Schema.Array(PermissionNext.Request))),
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
        const result = await client.permission.list(
          openCodeDirectoryParams(directoryResult.directory),
        )
        return respondWithSdkResult(c, result)
      }),
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
    async (c) =>
      runSdkRoute(c, async () => {
        const directoryResult = ensureAllowedDirectory(c)
        if (!directoryResult.ok) return directoryResult.response

        const body = c.req.valid("json")
        const client = await getOpenCodeClient(directoryResult.directory)
        const result = await client.permission.reply({
          requestID: c.req.valid("param").requestID,
          reply: body.reply,
          message: body.message,
          ...openCodeDirectoryParams(directoryResult.directory),
        })
        return respondWithSdkResult(c, result)
      }),
  )
