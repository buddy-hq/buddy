import { Hono, type Context } from "hono"
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
  ensureAllowedDirectory,
  isJsonContentType,
  parseJsonText,
  respondWithSdkResult,
  runSdkRoute,
  openCodeDirectoryParams,
} from "../http"
import { getOpenCodeClient } from "../opencode-runtime/client"

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

const mcpAddPayloadSchema = z.object({
  name: z.string().min(1),
  config: z.unknown(),
})

async function readMcpAddPayload(c: Context) {
  const contentType = c.req.header("content-type")
  if (!isJsonContentType(contentType)) {
    return {}
  }

  const raw = await c.req.raw.text()
  if (raw.trim().length === 0) {
    return {}
  }

  const parsed = parseJsonText(raw)
  if (!parsed.ok || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  return parsed.value as Record<string, unknown>
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
    async (c) =>
      runSdkRoute(c, async () => {
        const directoryResult = ensureAllowedDirectory(c)
        if (!directoryResult.ok) return directoryResult.response

        const client = await getOpenCodeClient(directoryResult.directory)
        const result = await client.mcp.status(openCodeDirectoryParams(directoryResult.directory))
        return respondWithSdkResult(c, result)
      }),
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
    async (c) =>
      runSdkRoute(c, async () => {
        const directoryResult = ensureAllowedDirectory(c)
        if (!directoryResult.ok) return directoryResult.response

        const payload = await readMcpAddPayload(c)
        if (payload instanceof Response) return payload

        const parsedPayload = mcpAddPayloadSchema.safeParse(payload)
        if (!parsedPayload.success) {
          return Response.json({ error: "Invalid MCP payload" }, { status: 400 })
        }

        const client = await getOpenCodeClient(directoryResult.directory)
        const result = await client.mcp.add({
          ...openCodeDirectoryParams(directoryResult.directory),
          name: parsedPayload.data.name,
          config: parsedPayload.data.config as Parameters<typeof client.mcp.add>[0] extends infer T
            ? T extends { config?: infer C }
              ? C
              : never
            : never,
        })
        return respondWithSdkResult(c, result)
      }),
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
      runSdkRoute(c, async () => {
        const directoryResult = ensureAllowedDirectory(c)
        if (!directoryResult.ok) return directoryResult.response

        const name = c.req.valid("param").name
        const client = await getOpenCodeClient(directoryResult.directory)
        const result = await client.mcp.auth.start({
          name,
          ...openCodeDirectoryParams(directoryResult.directory),
        })
        return respondWithSdkResult(c, result)
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
      runSdkRoute(c, async () => {
        const directoryResult = ensureAllowedDirectory(c)
        if (!directoryResult.ok) return directoryResult.response

        const name = c.req.valid("param").name
        const client = await getOpenCodeClient(directoryResult.directory)
        const result = await client.mcp.auth.callback({
          name,
          code: c.req.valid("json").code,
          ...openCodeDirectoryParams(directoryResult.directory),
        })
        return respondWithSdkResult(c, result)
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
      runSdkRoute(c, async () => {
        const directoryResult = ensureAllowedDirectory(c)
        if (!directoryResult.ok) return directoryResult.response

        const name = c.req.valid("param").name
        const client = await getOpenCodeClient(directoryResult.directory)
        const result = await client.mcp.auth.authenticate({
          name,
          ...openCodeDirectoryParams(directoryResult.directory),
        })
        return respondWithSdkResult(c, result)
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
      runSdkRoute(c, async () => {
        const directoryResult = ensureAllowedDirectory(c)
        if (!directoryResult.ok) return directoryResult.response

        const name = c.req.valid("param").name
        const client = await getOpenCodeClient(directoryResult.directory)
        const result = await client.mcp.auth.remove({
          name,
          ...openCodeDirectoryParams(directoryResult.directory),
        })
        return respondWithSdkResult(c, result)
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
      runSdkRoute(c, async () => {
        const directoryResult = ensureAllowedDirectory(c)
        if (!directoryResult.ok) return directoryResult.response

        const name = c.req.valid("param").name
        const client = await getOpenCodeClient(directoryResult.directory)
        const result = await client.mcp.connect({
          name,
          ...openCodeDirectoryParams(directoryResult.directory),
        })
        return respondWithSdkResult(c, result)
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
      runSdkRoute(c, async () => {
        const directoryResult = ensureAllowedDirectory(c)
        if (!directoryResult.ok) return directoryResult.response

        const name = c.req.valid("param").name
        const client = await getOpenCodeClient(directoryResult.directory)
        const result = await client.mcp.disconnect({
          name,
          ...openCodeDirectoryParams(directoryResult.directory),
        })
        return respondWithSdkResult(c, result)
      }),
  )
