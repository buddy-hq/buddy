import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Config } from "@buddy/backend/config"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import { MCP as OpenCodeMcp } from "@buddy/opencode-adapter/mcp"
import {
  booleanJsonResponse,
  createConfigSyncMiddleware,
  withDirectoryContext,
  routeErrors,
  directoryQuerySchema,
  McpNameParamSchema,
} from "../http"
import { proxyToOpenCode } from "../http"
import { getE2ERuntimeState, isE2EModeEnabled, setE2EMcpStatus } from "../e2e/runtime"

const mcpStatusMapSchema = z.record(z.string(), OpenCodeMcp.Status)

const mcpAddSchema = z.object({
  name: z.string(),
  config: Config.Mcp,
})

const mcpAuthCallbackSchema = z.object({
  code: z.string(),
})

const mcpAuthStartSchema = z.object({
  authorizationUrl: z.string(),
})

const mcpAuthRemovedSchema = z.object({
  success: z.literal(true),
})

type E2EMcpStatus = "connected" | "disabled" | "failed" | "needs_auth"

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function readMcpEnabledConfig(value: unknown) {
  const record = asRecord(value)
  if (!record) return {}

  const output: Record<string, { enabled: boolean }> = {}
  for (const [name, entry] of Object.entries(record)) {
    const config = asRecord(entry)
    output[name] = {
      enabled: config?.enabled !== false,
    }
  }
  return output
}

function buildE2EMcpStatusRecord(input: {
  configured: Record<string, { enabled: boolean }>
  runtime: Record<string, E2EMcpStatus>
}) {
  const allNames = new Set<string>([
    ...Object.keys(input.configured),
    ...Object.keys(input.runtime),
  ])
  const status: Record<string, OpenCodeMcp.Status> = {}

  for (const name of allNames) {
    const override = input.runtime[name]
    const normalized = override ?? "disabled"

    if (normalized === "connected") {
      status[name] = { status: "connected" }
      continue
    }
    if (normalized === "needs_auth") {
      status[name] = { status: "needs_auth" }
      continue
    }
    if (normalized === "failed") {
      status[name] = {
        status: "failed",
        error: "E2E deterministic MCP failure",
      }
      continue
    }
    status[name] = { status: "disabled" }
  }

  return status
}

export const McpRoutes = new Hono()
  .use("*", createConfigSyncMiddleware("MCP request"))
  .get(
    "/",
    describeRoute({
      operationId: "mcp.status",
      summary: "List configured MCP servers",
      responses: {
        200: {
          description: "Configured MCP servers",
          content: {
            "application/json": { schema: resolver(mcpStatusMapSchema) },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) => {
      if (!isE2EModeEnabled()) {
        return proxyToOpenCode(c, { targetPath: "/mcp" })
      }

      const contextResult = withDirectoryContext(c)
      if (!contextResult.ok) return contextResult.response

      const config = await readProjectConfig(contextResult.value.directory).catch(() => undefined)
      const configured = readMcpEnabledConfig(config?.mcp)
      const runtime = getE2ERuntimeState().mcp[contextResult.value.directory] ?? {}
      return c.json(
        buildE2EMcpStatusRecord({
          configured,
          runtime,
        }),
      )
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "mcp.add",
      summary: "Add or update an MCP server",
      responses: {
        200: {
          description: "Updated MCP status",
          content: {
            "application/json": { schema: resolver(mcpStatusMapSchema) },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", mcpAddSchema),
    async (c) => proxyToOpenCode(c, { targetPath: "/mcp" }),
  )
  .post(
    "/:name/auth",
    describeRoute({
      operationId: "mcp.auth.start",
      summary: "Start MCP auth",
      responses: {
        200: {
          description: "MCP auth initiation payload",
          content: {
            "application/json": { schema: resolver(mcpAuthStartSchema) },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", McpNameParamSchema),
    async (c) =>
      proxyToOpenCode(c, {
        targetPath: `/mcp/${encodeURIComponent(c.req.valid("param").name)}/auth`,
      }),
  )
  .post(
    "/:name/auth/callback",
    describeRoute({
      operationId: "mcp.auth.callback",
      summary: "Handle MCP auth callback",
      responses: {
        200: {
          description: "MCP auth callback payload",
          content: {
            "application/json": { schema: resolver(OpenCodeMcp.Status) },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", McpNameParamSchema),
    validator("json", mcpAuthCallbackSchema),
    async (c) =>
      proxyToOpenCode(c, {
        targetPath: `/mcp/${encodeURIComponent(c.req.valid("param").name)}/auth/callback`,
      }),
  )
  .post(
    "/:name/auth/authenticate",
    describeRoute({
      operationId: "mcp.auth.authenticate",
      summary: "Complete MCP auth authentication",
      responses: {
        200: {
          description: "MCP auth authentication payload",
          content: {
            "application/json": { schema: resolver(OpenCodeMcp.Status) },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", McpNameParamSchema),
    async (c) => {
      if (isE2EModeEnabled()) {
        const contextResult = withDirectoryContext(c)
        if (!contextResult.ok) return contextResult.response
        const name = c.req.valid("param").name
        setE2EMcpStatus(contextResult.value.directory, name, "connected")
        return c.json({ status: "connected" })
      }
      return proxyToOpenCode(c, {
        targetPath: `/mcp/${encodeURIComponent(c.req.valid("param").name)}/auth/authenticate`,
      })
    },
  )
  .delete(
    "/:name/auth",
    describeRoute({
      operationId: "mcp.auth.remove",
      summary: "Remove MCP auth configuration",
      responses: {
        200: {
          description: "MCP auth removed",
          content: {
            "application/json": { schema: resolver(mcpAuthRemovedSchema) },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", McpNameParamSchema),
    async (c) =>
      proxyToOpenCode(c, {
        targetPath: `/mcp/${encodeURIComponent(c.req.valid("param").name)}/auth`,
      }),
  )
  .post(
    "/:name/connect",
    describeRoute({
      operationId: "mcp.connect",
      summary: "Connect an MCP server",
      responses: {
        200: {
          description: "MCP connection result",
          content: {
            "application/json": booleanJsonResponse,
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", McpNameParamSchema),
    async (c) => {
      if (isE2EModeEnabled()) {
        const contextResult = withDirectoryContext(c)
        if (!contextResult.ok) return contextResult.response
        const name = c.req.valid("param").name
        setE2EMcpStatus(contextResult.value.directory, name, "connected")
        return c.json(true)
      }
      return proxyToOpenCode(c, {
        targetPath: `/mcp/${encodeURIComponent(c.req.valid("param").name)}/connect`,
      })
    },
  )
  .post(
    "/:name/disconnect",
    describeRoute({
      operationId: "mcp.disconnect",
      summary: "Disconnect an MCP server",
      responses: {
        200: {
          description: "MCP disconnection result",
          content: {
            "application/json": booleanJsonResponse,
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", McpNameParamSchema),
    async (c) => {
      if (isE2EModeEnabled()) {
        const contextResult = withDirectoryContext(c)
        if (!contextResult.ok) return contextResult.response
        const name = c.req.valid("param").name
        setE2EMcpStatus(contextResult.value.directory, name, "disabled")
        return c.json(true)
      }
      return proxyToOpenCode(c, {
        targetPath: `/mcp/${encodeURIComponent(c.req.valid("param").name)}/disconnect`,
      })
    },
  )
