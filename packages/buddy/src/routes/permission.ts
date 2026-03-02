import { Hono } from "hono"
import {
  AnyObjectSchema,
  BooleanSchema,
  DirectoryHeader,
  DirectoryQuery,
  ErrorSchema,
  PermissionRequestSchema,
  RequestIDPath,
} from "../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../openapi/compatibility-route.js"
import { proxyToOpenCode } from "./support.js"

const directoryParameters = [DirectoryHeader, DirectoryQuery]

export const PermissionRoutes = (): Hono =>
  new Hono()
    .get(
      "/",
      compatibilityRoute({
        operationId: "permission.list",
        summary: "List pending permission requests",
        parameters: directoryParameters,
        responses: {
          200: {
            description: "Pending permission requests",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: PermissionRequestSchema,
                },
              },
            },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        return proxyToOpenCode(c, {
          targetPath: "/permission",
        })
      },
    )
    .post(
      "/:requestID/reply",
      compatibilityRoute({
        operationId: "permission.reply",
        summary: "Reply to a permission request",
        parameters: [RequestIDPath, ...directoryParameters],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reply: {
                    type: "string",
                    enum: ["once", "always", "reject"],
                  },
                  message: {
                    type: "string",
                  },
                },
                required: ["reply"],
                additionalProperties: true,
              },
            },
          },
        },
        responses: {
          200: {
            description: "Permission reply accepted",
            content: {
              "application/json": { schema: BooleanSchema },
            },
          },
          400: {
            description: "Invalid permission reply",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const requestID = c.req.param("requestID")
        return proxyToOpenCode(c, {
          targetPath: `/permission/${encodeURIComponent(requestID)}/reply`,
        })
      },
    )
