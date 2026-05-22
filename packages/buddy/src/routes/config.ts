import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Config } from "@buddy/backend/config"
import {
  listProjectAgents,
  listProjectPersonas,
  mapConfigRouteError,
  patchProjectConfig,
  putProjectMcpConfig,
} from "@buddy/backend/config/orchestration"
import { readProjectConfig } from "../config/runtime/config-access"
import {
  directoryQuerySchema,
  McpNameParamSchema,
  routeErrors,
  runRouteTask,
  withConfigSyncRoute,
  withDirectoryRoute,
} from "../http"
import { readPiProviderCatalog } from "../pi-backend/provider-actions"

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

const providerModelSchema = z.object({
  id: z.string(),
  providerID: z.string(),
  api: z.object({
    id: z.string(),
    url: z.string(),
    npm: z.string(),
  }),
  name: z.string(),
  family: z.string(),
  capabilities: z.object({
    temperature: z.boolean(),
    reasoning: z.boolean(),
    attachment: z.boolean(),
    toolcall: z.boolean(),
    input: z.object({
      text: z.boolean(),
      audio: z.boolean(),
      image: z.boolean(),
      video: z.boolean(),
      pdf: z.boolean(),
    }),
    output: z.object({
      text: z.boolean(),
      audio: z.boolean(),
      image: z.boolean(),
      video: z.boolean(),
      pdf: z.boolean(),
    }),
    interleaved: z.boolean(),
  }),
  cost: z.object({
    input: z.number(),
    output: z.number(),
    cache: z.object({
      read: z.number(),
      write: z.number(),
    }),
  }),
  limit: z.object({
    context: z.number(),
    input: z.number(),
    output: z.number(),
  }),
  status: z.enum(["alpha", "beta", "deprecated", "active"]),
  options: z.record(z.string(), z.unknown()),
  headers: z.record(z.string(), z.string()),
  release_date: z.string(),
  variants: z.record(z.string(), z.record(z.string(), z.unknown())),
})

const providerConfigResponseSchema = z.object({
  providers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      source: z.enum(["env", "config", "custom", "api"]),
      env: z.array(z.string()),
      options: z.record(z.string(), z.unknown()),
      models: z.record(z.string(), providerModelSchema),
    }),
  ),
  default: z.record(z.string(), z.string()),
})
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
        handler: async () => {
          const catalog = await readPiProviderCatalog()
          return c.json({
            providers: catalog.all,
            default: catalog.default,
          })
        },
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
