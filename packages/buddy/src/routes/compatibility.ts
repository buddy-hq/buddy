import { Hono } from "hono"
import { AnyObjectSchema, ErrorSchema } from "../openapi/compatibility-schemas.js"
import { withConfigSync } from "./shared/route-helpers.js"
import { directoryForbiddenResponse, directoryParameters } from "./shared/openapi.js"
import type { ProxyEndpointSpec } from "./shared/proxy-routes.js"
import { registerProxyEndpoints } from "./shared/proxy-routes.js"

async function syncConfigBeforeCommands(c: { req: { raw: Request } }): Promise<Response | undefined> {
  const syncResult = await withConfigSync(c.req.raw, {
    operation: "listing commands",
  })
  if (!syncResult.ok) return syncResult.response
}

const compatibilityProxySpecs: ProxyEndpointSpec[] = [
  {
    method: "get",
    path: "/health",
    route: {
      operationId: "health.check",
      summary: "Health check",
      responses: {
        200: {
          description: "Health payload",
          content: {
            "application/json": { schema: AnyObjectSchema },
          },
        },
      },
    },
    targetPath: "/global/health",
  },
  {
    method: "get",
    path: "/event",
    route: {
      operationId: "event.stream",
      summary: "Server events stream",
      parameters: directoryParameters,
      responses: {
        200: {
          description: "Server-sent events stream",
          content: {
            "text/event-stream": {
              schema: { type: "string" },
            },
          },
        },
        403: {
          ...directoryForbiddenResponse,
        },
      },
    },
    targetPath: "/global/event",
  },
  {
    method: "get",
    path: "/find/file",
    route: {
      operationId: "find.file",
      summary: "Search files and directories",
      parameters: [
        ...directoryParameters,
        { in: "query", name: "query", required: true, schema: { type: "string" } },
        { in: "query", name: "dirs", required: false, schema: { type: "string", enum: ["true", "false"] } },
        { in: "query", name: "type", required: false, schema: { type: "string", enum: ["file", "directory"] } },
        { in: "query", name: "limit", required: false, schema: { type: "integer" } },
      ],
      responses: {
        200: {
          description: "Matching file and directory paths",
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        },
        403: {
          ...directoryForbiddenResponse,
        },
      },
    },
    targetPath: "/find/file",
  },
  {
    method: "get",
    path: "/command",
    route: {
      operationId: "command.list",
      summary: "List project commands",
      parameters: directoryParameters,
      responses: {
        200: {
          description: "Project command metadata",
          content: {
            "application/json": { schema: AnyObjectSchema },
          },
        },
        403: {
          ...directoryForbiddenResponse,
        },
      },
    },
    targetPath: "/command",
    beforeProxy: syncConfigBeforeCommands,
  },
]

export const CompatibilityRoutes = (): Hono => {
  const app = new Hono()
  return registerProxyEndpoints(app, compatibilityProxySpecs)
}
