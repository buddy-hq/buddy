import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { Schema } from "effect"
import z from "zod"
import { MCP as OpenCodeMcp } from "@buddy/opencode-adapter/mcp"
import { toOpenApiSchema } from "../http/effect-schema"
import {
  booleanJsonResponse,
  createConfigSyncMiddleware,
  routeErrors,
  directoryQuerySchema,
  McpNameParamSchema,
} from "../http"
import { proxyToOpenCode } from "../http"

const mcpStatusMapSchema = toOpenApiSchema(Schema.Record(Schema.String, OpenCodeMcp.Status))
const mcpStatusSchema = toOpenApiSchema(OpenCodeMcp.Status)

const mcpAuthCallbackSchema = z.object({
  code: z.string(),
})

const mcpAuthStartSchema = z.object({
  authorizationUrl: z.string(),
})

const mcpAuthRemovedSchema = z.object({
  success: z.literal(true),
})

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
    async (c) => proxyToOpenCode(c, { targetPath: "/mcp" }),
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
            "application/json": { schema: resolver(mcpStatusSchema) },
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
            "application/json": { schema: resolver(mcpStatusSchema) },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", McpNameParamSchema),
    async (c) =>
      proxyToOpenCode(c, {
        targetPath: `/mcp/${encodeURIComponent(c.req.valid("param").name)}/auth/authenticate`,
      }),
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
    async (c) =>
      proxyToOpenCode(c, {
        targetPath: `/mcp/${encodeURIComponent(c.req.valid("param").name)}/connect`,
      }),
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
    async (c) =>
      proxyToOpenCode(c, {
        targetPath: `/mcp/${encodeURIComponent(c.req.valid("param").name)}/disconnect`,
      }),
  )
