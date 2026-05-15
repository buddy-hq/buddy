import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { mapConfigRouteError, patchGlobalConfig } from "@buddy/backend/config/orchestration"
import { Config } from "@buddy/backend/config"
import z from "zod"
import {
  mapAgentsMdConflictError,
  readGlobalAgentsMd,
  saveGlobalAgentsMd,
} from "../agents-md/service"
import { booleanJsonResponse, routeErrors, runRouteTask } from "../http"
import { proxyToOpenCode } from "../http"
import {
  listManagedNotebooks,
  mapManagedNotebookError,
  readBuddyHomeDefaultAccessState,
  readNotebookHomeState,
  saveNotebookHome,
} from "../project"

const globalAgentsMdReadResponseSchema = z.object({
  path: z.string(),
  exists: z.boolean(),
  content: z.string(),
  version: z.string().nullable(),
})

const globalAgentsMdWriteBodySchema = z.object({
  content: z.string(),
  expectedVersion: z.string().nullable().optional(),
})

const globalAgentsMdWriteResponseSchema = z.object({
  path: z.string(),
  content: z.string(),
  version: z.string(),
})
const notebookHomeResponseSchema = z.object({
  configuredDirectory: z.string().optional(),
  defaultDirectory: z.string(),
  resolvedDirectory: z.string(),
  inboxDirectory: z.string(),
  inboxName: z.string(),
})
const notebookHomeAccessResponseSchema = z.object({
  defaultDirectory: z.string(),
  granted: z.boolean(),
})
const notebookHomeBodySchema = z.object({
  directory: z.string(),
})
const managedNotebookSchema = z.object({
  name: z.string(),
  directory: z.string(),
})

export const GlobalRoutes = new Hono()
  .get(
    "/config",
    describeRoute({
      operationId: "global.config.get",
      summary: "Get global config",
      responses: {
        200: {
          description: "Global configuration payload",
          content: {
            "application/json": { schema: resolver(Config.Info) },
          },
        },
        ...routeErrors(400),
      },
    }),
    async (c) =>
      runRouteTask({
        task: async () => c.json(await Config.getGlobal()),
        mapError: mapConfigRouteError,
      }),
  )
  .patch(
    "/config",
    describeRoute({
      operationId: "global.config.patch",
      summary: "Update global config",
      responses: {
        200: {
          description: "Updated global configuration",
          content: {
            "application/json": { schema: resolver(Config.Info) },
          },
        },
        ...routeErrors(400),
      },
    }),
    validator("json", z.record(z.string(), z.unknown())),
    async (c) =>
      runRouteTask({
        task: async () => c.json(await patchGlobalConfig(c.req.valid("json"))),
        mapError: mapConfigRouteError,
      }),
  )
  .get(
    "/notebook-home",
    describeRoute({
      operationId: "global.notebookHome.get",
      summary: "Get Buddy notebook home",
      responses: {
        200: {
          description: "Buddy notebook home state",
          content: {
            "application/json": { schema: resolver(notebookHomeResponseSchema) },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    async (c) =>
      runRouteTask({
        task: async () => c.json(await readNotebookHomeState()),
        mapError: (error) => mapManagedNotebookError(error) ?? mapConfigRouteError(error),
      }),
  )
  .get(
    "/notebook-home/access",
    describeRoute({
      operationId: "global.notebookHome.access",
      summary: "Check access to Buddy's default notebook home",
      responses: {
        200: {
          description: "Default Buddy notebook home access state",
          content: {
            "application/json": { schema: resolver(notebookHomeAccessResponseSchema) },
          },
        },
      },
    }),
    async (c) =>
      runRouteTask({
        task: async () => {
          const access = readBuddyHomeDefaultAccessState()
          return c.json({
            defaultDirectory: access.defaultPath,
            granted: access.granted,
          })
        },
        mapError: mapConfigRouteError,
      }),
  )
  .put(
    "/notebook-home",
    describeRoute({
      operationId: "global.notebookHome.put",
      summary: "Set Buddy notebook home",
      responses: {
        200: {
          description: "Updated Buddy notebook home state",
          content: {
            "application/json": { schema: resolver(notebookHomeResponseSchema) },
          },
        },
        ...routeErrors(400, 403, 409),
      },
    }),
    validator("json", notebookHomeBodySchema),
    async (c) =>
      runRouteTask({
        task: async () => c.json(await saveNotebookHome(c.req.valid("json").directory)),
        mapError: (error) => mapManagedNotebookError(error) ?? mapConfigRouteError(error),
      }),
  )
  .get(
    "/notebooks",
    describeRoute({
      operationId: "global.notebooks.list",
      summary: "List Buddy-managed notebooks",
      responses: {
        200: {
          description: "Buddy-managed notebook list",
          content: {
            "application/json": { schema: resolver(z.array(managedNotebookSchema)) },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    async (c) =>
      runRouteTask({
        task: async () => c.json(await listManagedNotebooks()),
        mapError: (error) => mapManagedNotebookError(error) ?? mapConfigRouteError(error),
      }),
  )
  .post(
    "/dispose",
    describeRoute({
      operationId: "global.dispose",
      summary: "Dispose all global runtime instances",
      responses: {
        200: {
          description: "Disposal response",
          content: {
            "application/json": booleanJsonResponse,
          },
        },
      },
    }),
    async (c) =>
      proxyToOpenCode(c, {
        targetPath: "/global/dispose",
      }),
  )
  .get(
    "/agents-md",
    describeRoute({
      operationId: "global.agentsMd.read",
      summary: "Read global AGENTS.md",
      responses: {
        200: {
          description: "Global AGENTS.md state",
          content: {
            "application/json": {
              schema: resolver(globalAgentsMdReadResponseSchema),
            },
          },
        },
      },
    }),
    async (c) =>
      runRouteTask({
        task: async () => c.json(await readGlobalAgentsMd()),
        mapError: mapAgentsMdConflictError,
      }),
  )
  .put(
    "/agents-md",
    describeRoute({
      operationId: "global.agentsMd.save",
      summary: "Create or update global AGENTS.md",
      responses: {
        200: {
          description: "Updated global AGENTS.md",
          content: {
            "application/json": {
              schema: resolver(globalAgentsMdWriteResponseSchema),
            },
          },
        },
        ...routeErrors(400, 409),
      },
    }),
    validator("json", globalAgentsMdWriteBodySchema),
    async (c) =>
      runRouteTask({
        task: async () => {
          const payload = c.req.valid("json")
          return c.json(
            await saveGlobalAgentsMd({
              content: payload.content,
              expectedVersion: payload.expectedVersion,
            }),
          )
        },
        mapError: mapAgentsMdConflictError,
      }),
  )
