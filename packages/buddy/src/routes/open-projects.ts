import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { routeErrors } from "../http"
import {
  closeOpenProjectRegistryEntry,
  isOpenProjectRegistryError,
  listOpenProjects,
  openProjectRegistryEntry,
  reorderOpenProjectRegistryEntries,
} from "../project/open-project-registry"

const openProjectsResponseSchema = z.object({
  directories: z.array(z.string()),
})

const openProjectBodySchema = z.object({
  directory: z.string(),
})

const openProjectQuerySchema = z.object({
  directory: z.string(),
})

const openProjectResponseSchema = z.object({
  directory: z.string(),
})

export const OpenProjectsRoutes = (): Hono =>
  new Hono()
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
      async (c) => {
        try {
          const directory = await openProjectRegistryEntry(c.req.valid("json").directory)
          return c.json({ directory })
        } catch (error) {
          if (isOpenProjectRegistryError(error)) {
            return c.json({ error: error.message }, error.status)
          }
          throw error
        }
      },
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
      async (c) => {
        try {
          const directory = await closeOpenProjectRegistryEntry(c.req.valid("query").directory)
          return c.json({ directory })
        } catch (error) {
          if (isOpenProjectRegistryError(error)) {
            return c.json({ error: error.message }, error.status)
          }
          throw error
        }
      },
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
      async (c) => {
        try {
          const directories = await reorderOpenProjectRegistryEntries(c.req.valid("json").directories)
          return c.json({ directories })
        } catch (error) {
          if (isOpenProjectRegistryError(error)) {
            return c.json({ error: error.message }, error.status)
          }
          throw error
        }
      },
    )
