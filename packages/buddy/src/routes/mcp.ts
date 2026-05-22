import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import {
  booleanJsonResponse,
  createConfigSyncMiddleware,
  routeErrors,
  directoryQuerySchema,
  McpNameParamSchema,
  runRouteTask,
  withDirectoryRoute,
} from "../http"
import {
  authenticateMcpServer,
  completeMcpServerAuth,
  connectMcpServer,
  disconnectMcpServer,
  listMcpStatus,
  refreshMcpStatus,
  removeMcpServerAuth,
  startMcpServerAuth,
} from "../pi-backend/mcp-runtime"

const mcpStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("connected") }),
  z.object({ status: z.literal("disabled") }),
  z.object({ status: z.literal("failed"), error: z.string() }),
  z.object({ status: z.literal("needs_auth") }),
  z.object({ status: z.literal("needs_client_registration"), error: z.string() }),
])

const mcpStatusMapSchema = z.record(z.string(), mcpStatusSchema)

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
    async (c) =>
      withDirectoryRoute(c, async (context) => c.json(await listMcpStatus(context.directory))),
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
      withDirectoryRoute(c, async (context) => c.json(await refreshMcpStatus(context.directory))),
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
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () =>
            c.json(await startMcpServerAuth(context.directory, c.req.valid("param").name)),
          mapError: (error) =>
            Response.json(
              { error: error instanceof Error ? error.message : String(error) },
              { status: 400 },
            ),
        }),
      ),
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
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () =>
            c.json(
              await completeMcpServerAuth(
                context.directory,
                c.req.valid("param").name,
                c.req.valid("json").code,
              ),
            ),
          mapError: (error) =>
            Response.json(
              { error: error instanceof Error ? error.message : String(error) },
              { status: 400 },
            ),
        }),
      ),
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
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () =>
            c.json(await authenticateMcpServer(context.directory, c.req.valid("param").name)),
          mapError: (error) =>
            Response.json(
              { error: error instanceof Error ? error.message : String(error) },
              { status: 400 },
            ),
        }),
      ),
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
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () =>
            c.json(await removeMcpServerAuth(context.directory, c.req.valid("param").name)),
          mapError: (error) =>
            Response.json(
              { error: error instanceof Error ? error.message : String(error) },
              { status: 400 },
            ),
        }),
      ),
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
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () =>
            c.json(await connectMcpServer(context.directory, c.req.valid("param").name)),
          mapError: (error) =>
            Response.json(
              { error: error instanceof Error ? error.message : String(error) },
              { status: 400 },
            ),
        }),
      ),
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
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () =>
            c.json(await disconnectMcpServer(context.directory, c.req.valid("param").name)),
          mapError: (error) =>
            Response.json(
              { error: error instanceof Error ? error.message : String(error) },
              { status: 400 },
            ),
        }),
      ),
  )
