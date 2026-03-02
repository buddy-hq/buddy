import { Hono } from "hono"
import type { Context } from "hono"
import { syncOpenCodeProjectConfig } from "../config/compatibility.js"
import {
  AnyObjectSchema,
  DirectoryHeader,
  DirectoryQuery,
  ErrorSchema,
  McpNamePath,
} from "../openapi/compatibility-doc.js"
import { compatibilityRoute } from "../openapi/route-doc.js"
import { ensureAllowedDirectory, proxyToOpenCode } from "./support.js"

const directoryParameters = [DirectoryHeader, DirectoryQuery]

async function proxyMcpToOpenCode(c: Context, targetPath: string): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c.req.raw)
  if (!directoryResult.ok) return directoryResult.response

  await syncOpenCodeProjectConfig(directoryResult.directory).catch((error) => {
    throw new Error(
      `Failed to sync config before MCP request: ${String(error instanceof Error ? error.message : error)}`,
    )
  })

  return proxyToOpenCode(c, {
    targetPath,
  })
}

export const McpRoutes = (): Hono =>
  new Hono()
    .get(
      "/",
      compatibilityRoute({
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
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        return proxyMcpToOpenCode(c, "/mcp")
      },
    )
    .post(
      "/",
      compatibilityRoute({
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
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        return proxyMcpToOpenCode(c, "/mcp")
      },
    )
    .post(
      "/:name/auth",
      compatibilityRoute({
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
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const name = c.req.param("name")
        return proxyMcpToOpenCode(c, `/mcp/${encodeURIComponent(name)}/auth`)
      },
    )
    .post(
      "/:name/auth/callback",
      compatibilityRoute({
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
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const name = c.req.param("name")
        return proxyMcpToOpenCode(c, `/mcp/${encodeURIComponent(name)}/auth/callback`)
      },
    )
    .post(
      "/:name/auth/authenticate",
      compatibilityRoute({
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
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const name = c.req.param("name")
        return proxyMcpToOpenCode(c, `/mcp/${encodeURIComponent(name)}/auth/authenticate`)
      },
    )
    .delete(
      "/:name/auth",
      compatibilityRoute({
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
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const name = c.req.param("name")
        return proxyMcpToOpenCode(c, `/mcp/${encodeURIComponent(name)}/auth`)
      },
    )
    .post(
      "/:name/connect",
      compatibilityRoute({
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
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const name = c.req.param("name")
        return proxyMcpToOpenCode(c, `/mcp/${encodeURIComponent(name)}/connect`)
      },
    )
    .post(
      "/:name/disconnect",
      compatibilityRoute({
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
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const name = c.req.param("name")
        return proxyMcpToOpenCode(c, `/mcp/${encodeURIComponent(name)}/disconnect`)
      },
    )
