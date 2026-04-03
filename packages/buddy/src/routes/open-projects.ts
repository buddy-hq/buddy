import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { routeErrors, runRouteTask } from "../http"
import {
  closeOpenProjectRegistryEntry,
  listOpenProjects,
  mapOpenProjectRegistryError,
  openProjectRegistryEntry,
  reorderOpenProjectRegistryEntries,
} from "../project/open-project-registry"
import { createManagedNotebook, mapManagedNotebookError } from "../project"

const openProjectsResponseSchema = z.object({
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
      },
    }),
    async (c) => c.json({ directories: await listOpenProjects() }),
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
        ...routeErrors(400, 403),
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
        ...routeErrors(400, 403, 409),
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
        ...routeErrors(400),
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
        ...routeErrors(400),
      },
    }),
    validator("json", openProjectsResponseSchema),
    async (c) =>
      runRouteTask({
        task: async () =>
          c.json({
            directories: await reorderOpenProjectRegistryEntries(c.req.valid("json").directories),
          }),
        mapError: mapOpenProjectRegistryError,
      }),
  )
