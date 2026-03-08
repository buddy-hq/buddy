import {
  BooleanSchema,
  ErrorSchema,
  PermissionRequestSchema,
  RequestIDPath,
} from "../../openapi/compatibility-schemas.js"
import type { ProxyEndpointSpec } from "../../http/proxy-routes.js"
import { directoryForbiddenResponse, directoryParameters } from "../../http/openapi.js"

const permissionProxySpecs: ProxyEndpointSpec[] = [
  {
    method: "get",
    path: "/",
    route: {
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
          ...directoryForbiddenResponse,
        },
      },
    },
    targetPath: "/permission",
  },
  {
    method: "post",
    path: "/:requestID/reply",
    route: {
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
          ...directoryForbiddenResponse,
        },
      },
    },
    targetPath: (c) => `/permission/${encodeURIComponent(c.req.param("requestID"))}/reply`,
  },
]

export { permissionProxySpecs }
