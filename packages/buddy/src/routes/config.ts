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
import { loadProjectConfig, loadProjectConfigFile } from "../config/store/read-config"
import { McpSettingsInfo, McpSettingsProjectInfo, projectMcpSettingsConfig } from "../config/secrets/mcp-secrets"
import { providerConfigSchema } from "@buddy/agent-runtime/providers"
import {
  directoryQuerySchema,
  McpNameParamSchema,
  routeErrors,
  runRouteTask,
  withConfigSyncRoute,
  withDirectoryRoute,
  runSdkRoute,
} from "../http"
import { getAgentRuntime } from "../runtime/agent-runtime"

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
            "application/json": { schema: resolver(providerConfigSchema) },
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
            const runtime = await getAgentRuntime()
            const result = await runtime.providers.catalog(context.directory)
            return c.json({ providers: result.all, default: result.default })
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
            "application/json": { schema: resolver(McpSettingsProjectInfo) },
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
            const config = await loadProjectConfigFile(context.directory, { resolveSubstitutions: false })
            return c.json(await projectMcpSettingsConfig(config))
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
            "application/json": { schema: resolver(McpSettingsInfo) },
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
            const config = await loadProjectConfig(context.directory, { resolveSubstitutions: false })
            return c.json(await projectMcpSettingsConfig(config))
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
            "application/json": { schema: resolver(McpSettingsInfo) },
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
            await patchProjectConfig({
              directory: context.directory,
              payload: c.req.valid("json"),
            })
            return c.json(await projectMcpSettingsConfig(await loadProjectConfig(context.directory, { resolveSubstitutions: false })))
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
            "application/json": { schema: resolver(McpSettingsInfo) },
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
            await putProjectMcpConfig({
              directory: context.directory,
              name: c.req.valid("param").name,
              payload: c.req.valid("json"),
            })
            return c.json(await projectMcpSettingsConfig(await loadProjectConfig(context.directory, { resolveSubstitutions: false })))
          },
          mapError: mapConfigRouteError,
        }),
      ),
  )
