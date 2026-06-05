import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { routeErrors, runRouteTask } from "../http"
import {
  closeOpenProjectRegistryEntry,
  inspectOpenProjectRegistryRecovery,
  listOpenProjects,
  mapOpenProjectRegistryError,
  openProjectRegistryEntry,
  reorderOpenProjectRegistryEntries,
  restoreOpenProjectRegistryRecovery,
  startFreshOpenProjectRegistryRecovery,
} from "../project/open-project-registry"
import { createManagedNotebook, mapManagedNotebookError } from "../project"

const openProjectsRecoverySummarySchema = z.object({
  needed: z.boolean(),
})

const openProjectsResponseSchema = z.object({
  directories: z.array(z.string()),
  recovery: openProjectsRecoverySummarySchema.optional(),
})

const openProjectsReorderBodySchema = z.object({
  directories: z.array(z.string()),
})

const openProjectBodySchema = z.object({
  directory: z.string(),
})
const createManagedNotebookBodySchema = z.object({
  name: z.string(),
})

const openProjectQuerySchema = z.object({
  directory: z.string(),
})

const openProjectResponseSchema = z.object({
  directory: z.string(),
})

const openProjectsRecoveryCandidateSchema = z.object({
  directory: z.string(),
  name: z.string(),
})

const openProjectsRecoveryResponseSchema = z.object({
  needed: z.boolean(),
  candidates: z.array(openProjectsRecoveryCandidateSchema),
})

const openProjectsRecoveryRestoreBodySchema = z.object({
  directories: z.array(z.string()),
})

export const OpenProjectsRoutes = new Hono()
  .get(
    "/",
    describeRoute({
      operationId: "openProjects.list",
      summary: "List curated open projects",
      responses: {
        200: {
          description: "Ordered curated open-project list",
          content: {
            "application/json": {
              schema: resolver(openProjectsResponseSchema),
            },
          },
        },
        ...routeErrors(500),
      },
    }),
    async (c) =>
      runRouteTask({
        task: async () => c.json(await listOpenProjects()),
        mapError: mapOpenProjectRegistryError,
      }),
  )
  .get(
    "/recovery",
    describeRoute({
      operationId: "openProjects.recovery",
      summary: "Inspect open-project registry recovery candidates",
      responses: {
        200: {
          description: "Open-project registry recovery state",
          content: {
            "application/json": {
              schema: resolver(openProjectsRecoveryResponseSchema),
            },
          },
        },
        ...routeErrors(500),
      },
    }),
    async (c) =>
      runRouteTask({
        task: async () => c.json(await inspectOpenProjectRegistryRecovery()),
        mapError: mapOpenProjectRegistryError,
      }),
  )
  .post(
    "/recovery/restore",
    describeRoute({
      operationId: "openProjects.restoreRecovery",
      summary: "Restore selected open-project registry recovery candidates",
      responses: {
        200: {
          description: "Restored curated open-project list",
          content: {
            "application/json": {
              schema: resolver(openProjectsResponseSchema),
            },
          },
        },
        ...routeErrors(400, 500),
      },
    }),
    validator("json", openProjectsRecoveryRestoreBodySchema),
    async (c) =>
      runRouteTask({
        task: async () =>
          c.json({
            directories: await restoreOpenProjectRegistryRecovery(
              c.req.valid("json").directories,
            ),
          }),
        mapError: mapOpenProjectRegistryError,
      }),
  )
  .post(
    "/recovery/start-fresh",
    describeRoute({
      operationId: "openProjects.startFresh",
      summary: "Start a fresh open-project registry",
      responses: {
        200: {
          description: "Fresh curated open-project list",
          content: {
            "application/json": {
              schema: resolver(openProjectsResponseSchema),
            },
          },
        },
        ...routeErrors(500),
      },
    }),
    async (c) =>
      runRouteTask({
        task: async () =>
          c.json({
            directories: await startFreshOpenProjectRegistryRecovery(),
          }),
        mapError: mapOpenProjectRegistryError,
      }),
  )
  .post(
    "/",
    describeRoute({
      operationId: "openProjects.open",
      summary: "Add a project to the curated open-project list",
      responses: {
        200: {
          description: "Opened project directory",
          content: {
            "application/json": {
              schema: resolver(openProjectResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403, 500),
      },
    }),
    validator("json", openProjectBodySchema),
    async (c) =>
      runRouteTask({
        task: async () =>
          c.json({ directory: await openProjectRegistryEntry(c.req.valid("json").directory) }),
        mapError: mapOpenProjectRegistryError,
      }),
  )
  .post(
    "/create",
    describeRoute({
      operationId: "openProjects.create",
      summary: "Create or open a Buddy-managed notebook",
      responses: {
        200: {
          description: "Managed notebook directory",
          content: {
            "application/json": {
              schema: resolver(openProjectResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403, 409, 500),
      },
    }),
    validator("json", createManagedNotebookBodySchema),
    async (c) =>
      runRouteTask({
        task: async () =>
          c.json({ directory: await createManagedNotebook(c.req.valid("json").name) }),
        mapError: (error) => mapManagedNotebookError(error) ?? mapOpenProjectRegistryError(error),
      }),
  )
  .delete(
    "/",
    describeRoute({
      operationId: "openProjects.close",
      summary: "Remove a project from the curated open-project list",
      responses: {
        200: {
          description: "Closed project directory",
          content: {
            "application/json": {
              schema: resolver(openProjectResponseSchema),
            },
          },
        },
        ...routeErrors(400, 500),
      },
    }),
    validator("query", openProjectQuerySchema),
    async (c) =>
      runRouteTask({
        task: async () =>
          c.json({
            directory: await closeOpenProjectRegistryEntry(c.req.valid("query").directory),
          }),
        mapError: mapOpenProjectRegistryError,
      }),
  )
  .put(
    "/order",
    describeRoute({
      operationId: "openProjects.reorder",
      summary: "Reorder the curated open-project list",
      responses: {
        200: {
          description: "Reordered curated open-project list",
          content: {
            "application/json": {
              schema: resolver(openProjectsResponseSchema),
            },
          },
        },
        ...routeErrors(400, 500),
      },
    }),
    validator("json", openProjectsReorderBodySchema),
    async (c) =>
      runRouteTask({
        task: async () =>
          c.json({
            directories: await reorderOpenProjectRegistryEntries(c.req.valid("json").directories),
          }),
        mapError: mapOpenProjectRegistryError,
      }),
  )
