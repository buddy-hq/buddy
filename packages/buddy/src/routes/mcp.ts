import { Hono } from "hono"
import {
  AnyObjectSchema,
  ErrorSchema,
  McpNamePath,
} from "../openapi/compatibility-schemas.js"
import { withConfigSync } from "./shared/route-helpers.js"
import { directoryForbiddenResponse, directoryParameters } from "./shared/openapi.js"
import type { ProxyEndpointSpec } from "./shared/proxy-routes.js"
import { registerProxyEndpoints } from "./shared/proxy-routes.js"

async function syncBeforeMcpProxy(c: { req: { raw: Request } }): Promise<Response | undefined> {
  const syncResult = await withConfigSync(c.req.raw, {
    operation: "MCP request",
  })
  if (!syncResult.ok) return syncResult.response
}

const mcpProxySpecs: ProxyEndpointSpec[] = [
  {
    method: "get",
    path: "/",
    route: {
      operationId: "mcp.status",
      summary: "List configured MCP servers",
      parameters: directoryParameters,
      responses: {
        200: {
          description: "Configured MCP servers",
          content: {
            "application/json": { schema: AnyObjectSchema },
          },
        },
        403: {
          ...directoryForbiddenResponse,
        },
      },
    },
    targetPath: "/mcp",
    beforeProxy: syncBeforeMcpProxy,
  },
  {
    method: "post",
    path: "/",
    route: {
      operationId: "mcp.add",
      summary: "Add or update an MCP server",
      parameters: directoryParameters,
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: AnyObjectSchema },
        },
      },
      responses: {
        200: {
          description: "Updated MCP status",
          content: {
            "application/json": { schema: AnyObjectSchema },
          },
        },
        400: {
          description: "Invalid MCP payload",
          content: {
            "application/json": { schema: ErrorSchema },
          },
        },
        403: {
          ...directoryForbiddenResponse,
        },
      },
    },
    targetPath: "/mcp",
    beforeProxy: syncBeforeMcpProxy,
  },
  {
    method: "post",
    path: "/:name/auth",
    route: {
      operationId: "mcp.auth.start",
      summary: "Start MCP auth",
      parameters: [McpNamePath, ...directoryParameters],
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: AnyObjectSchema },
        },
      },
      responses: {
        200: {
          description: "MCP auth initiation payload",
          content: {
            "application/json": { schema: AnyObjectSchema },
          },
        },
        400: {
          description: "Invalid MCP auth request",
          content: {
            "application/json": { schema: ErrorSchema },
          },
        },
        403: {
          ...directoryForbiddenResponse,
        },
      },
    },
    targetPath: (c) => `/mcp/${encodeURIComponent(c.req.param("name"))}/auth`,
    beforeProxy: syncBeforeMcpProxy,
  },
  {
    method: "post",
    path: "/:name/auth/callback",
    route: {
      operationId: "mcp.auth.callback",
      summary: "Handle MCP auth callback",
      parameters: [McpNamePath, ...directoryParameters],
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: AnyObjectSchema },
        },
      },
      responses: {
        200: {
          description: "MCP auth callback payload",
          content: {
            "application/json": { schema: AnyObjectSchema },
          },
        },
        400: {
          description: "Invalid MCP auth callback",
          content: {
            "application/json": { schema: ErrorSchema },
          },
        },
        403: {
          ...directoryForbiddenResponse,
        },
      },
    },
    targetPath: (c) => `/mcp/${encodeURIComponent(c.req.param("name"))}/auth/callback`,
    beforeProxy: syncBeforeMcpProxy,
  },
  {
    method: "post",
    path: "/:name/auth/authenticate",
    route: {
      operationId: "mcp.auth.authenticate",
      summary: "Complete MCP auth authentication",
      parameters: [McpNamePath, ...directoryParameters],
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: AnyObjectSchema },
        },
      },
      responses: {
        200: {
          description: "MCP auth authentication payload",
          content: {
            "application/json": { schema: AnyObjectSchema },
          },
        },
        400: {
          description: "Invalid MCP authentication payload",
          content: {
            "application/json": { schema: ErrorSchema },
          },
        },
        403: {
          ...directoryForbiddenResponse,
        },
      },
    },
    targetPath: (c) => `/mcp/${encodeURIComponent(c.req.param("name"))}/auth/authenticate`,
    beforeProxy: syncBeforeMcpProxy,
  },
  {
    method: "delete",
    path: "/:name/auth",
    route: {
      operationId: "mcp.auth.remove",
      summary: "Remove MCP auth configuration",
      parameters: [McpNamePath, ...directoryParameters],
      responses: {
        200: {
          description: "MCP auth removed",
          content: {
            "application/json": { schema: AnyObjectSchema },
          },
        },
        400: {
          description: "Invalid MCP name",
          content: {
            "application/json": { schema: ErrorSchema },
          },
        },
        403: {
          ...directoryForbiddenResponse,
        },
      },
    },
    targetPath: (c) => `/mcp/${encodeURIComponent(c.req.param("name"))}/auth`,
    beforeProxy: syncBeforeMcpProxy,
  },
  {
    method: "post",
    path: "/:name/connect",
    route: {
      operationId: "mcp.connect",
      summary: "Connect an MCP server",
      parameters: [McpNamePath, ...directoryParameters],
      responses: {
        200: {
          description: "MCP connection result",
          content: {
            "application/json": { schema: AnyObjectSchema },
          },
        },
        400: {
          description: "Invalid MCP name",
          content: {
            "application/json": { schema: ErrorSchema },
          },
        },
        403: {
          ...directoryForbiddenResponse,
        },
      },
    },
    targetPath: (c) => `/mcp/${encodeURIComponent(c.req.param("name"))}/connect`,
    beforeProxy: syncBeforeMcpProxy,
  },
  {
    method: "post",
    path: "/:name/disconnect",
    route: {
      operationId: "mcp.disconnect",
      summary: "Disconnect an MCP server",
      parameters: [McpNamePath, ...directoryParameters],
      responses: {
        200: {
          description: "MCP disconnection result",
          content: {
            "application/json": { schema: AnyObjectSchema },
          },
        },
        400: {
          description: "Invalid MCP name",
          content: {
            "application/json": { schema: ErrorSchema },
          },
        },
        403: {
          ...directoryForbiddenResponse,
        },
      },
    },
    targetPath: (c) => `/mcp/${encodeURIComponent(c.req.param("name"))}/disconnect`,
    beforeProxy: syncBeforeMcpProxy,
  },
]

export const McpRoutes = (): Hono => {
  const app = new Hono()
  return registerProxyEndpoints(app, mcpProxySpecs)
}
