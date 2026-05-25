import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { Schema } from "effect"
import z from "zod"
import { Config } from "@buddy/backend/config"
import {
  listProjectAgents,
  listProjectPersonas,
  mapConfigRouteError,
  patchProjectConfig,
  putProjectMcpConfig,
} from "@buddy/backend/config/orchestration"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import { Provider as OpenCodeProvider } from "@buddy/opencode-adapter/provider"
import { toOpenApiSchema } from "../http/effect-schema"
import {
  directoryQuerySchema,
  McpNameParamSchema,
  routeErrors,
  runRouteTask,
  withConfigSyncRoute,
  withDirectoryRoute,
  respondWithSdkResult,
  runSdkRoute,
  openCodeDirectoryParams,
} from "../http"
import { getOpenCodeClient } from "../opencode-runtime/client"

const personaCatalogEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  surfaces: z.array(z.string()),
  defaultSurface: z.string(),
  hidden: z.boolean().optional(),
})

const agentConfigEntrySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  mode: z.string().optional(),
  hidden: z.boolean().optional(),
  model: z
    .object({
      providerID: z.string(),
      modelID: z.string(),
    })
    .optional(),
  variant: z.string().optional(),
})

const providerConfigResponseSchema = toOpenApiSchema(
  Schema.Struct({
    providers: Schema.Array(OpenCodeProvider.Info),
    default: Schema.Record(Schema.String, Schema.String),
  }),
)
const projectConfigPatchSchema = z.record(z.string(), z.unknown())

export const ConfigRoutes = new Hono()
  .get(
    "/personas",
    describeRoute({
      operationId: "config.personas",
      summary: "List Buddy personas",
      responses: {
        200: {
          description: "Buddy personas",
          content: {
            "application/json": {
              schema: resolver(z.array(personaCatalogEntrySchema)),
            },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const personas = await listProjectPersonas(context.directory)
            return c.json(personas)
          },
          mapError: mapConfigRouteError,
        }),
      ),
  )
  .get(
    "/agents",
    describeRoute({
      operationId: "config.agents",
      summary: "List agent configurations",
      responses: {
        200: {
          description: "Agent configurations",
          content: {
            "application/json": {
              schema: resolver(z.array(agentConfigEntrySchema)),
            },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const agents = await listProjectAgents(context.directory)
            return c.json(agents)
          },
          mapError: mapConfigRouteError,
        }),
      ),
  )
  .get(
    "/providers",
    describeRoute({
      operationId: "config.providers",
      summary: "List configured providers",
      responses: {
        200: {
          description: "Configured providers and defaults",
          content: {
            "application/json": { schema: resolver(providerConfigResponseSchema) },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withConfigSyncRoute(c, {
        operation: "listing providers",
        handler: async (context) =>
          runSdkRoute(c, async () => {
            const client = await getOpenCodeClient(context.directory)
            const result = await client.config.providers(openCodeDirectoryParams(context.directory))
            return respondWithSdkResult(c, result)
          }),
      }),
  )
  .get(
    "/raw",
    describeRoute({
      operationId: "config.getRaw",
      summary: "Get raw project config",
      responses: {
        200: {
          description: "Raw project config payload",
          content: {
            "application/json": { schema: resolver(Config.Info) },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const config = await Config.getProjectFile(context.directory)
            return c.json(config)
          },
          mapError: mapConfigRouteError,
        }),
      ),
  )
  .get(
    "/",
    describeRoute({
      operationId: "config.get",
      summary: "Get project config",
      responses: {
        200: {
          description: "Project config payload",
          content: {
            "application/json": { schema: resolver(Config.Info) },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const config = await readProjectConfig(context.directory)
            return c.json(config)
          },
          mapError: mapConfigRouteError,
        }),
      ),
  )
  .patch(
    "/",
    describeRoute({
      operationId: "config.update",
      summary: "Patch project config",
      responses: {
        200: {
          description: "Updated project config payload",
          content: {
            "application/json": { schema: resolver(Config.Info) },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", projectConfigPatchSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const config = await patchProjectConfig({
              directory: context.directory,
              payload: c.req.valid("json"),
            })
            return c.json(config)
          },
          mapError: mapConfigRouteError,
        }),
      ),
  )
  .put(
    "/mcp/:name",
    describeRoute({
      operationId: "config.mcp.put",
      summary: "Set project MCP config",
      responses: {
        200: {
          description: "Updated project config payload",
          content: {
            "application/json": { schema: resolver(Config.Info) },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", McpNameParamSchema),
    validator("json", Config.Mcp),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const config = await putProjectMcpConfig({
              directory: context.directory,
              name: c.req.valid("param").name,
              payload: c.req.valid("json"),
            })
            return c.json(config)
          },
          mapError: mapConfigRouteError,
        }),
      ),
  )
