import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, withDirectoryRoute, runRouteTask } from "../http"
import {
  addResource,
  listResources,
  rebuildResource,
  removeResource,
  renameResource,
  resolveResourceIDByKey,
  mapResourceRouteError,
  type ResourceRecord,
} from "../resources/resource-registry-service"

const ResourceStatusSchema = z.enum(["preparing", "ready", "unsupported", "error", "stale"])

const ResourceRecordSchema = z.object({
  id: z.string(),
  alias: z.string(),
  sourceRelpath: z.string(),
  sourceOriginRelpath: z.string().optional(),
  format: z.string(),
  status: ResourceStatusSchema,
  warnings: z.array(z.string()),
  preparedAt: z.string().optional(),
  sourceMtimeMs: z.number().optional(),
  sourceSizeBytes: z.number().optional(),
  coverRelpath: z.string().optional(),
  title: z.string().optional(),
  author: z.string().optional(),
})

const ResourceListResponseSchema = z.object({
  resources: z.array(ResourceRecordSchema),
})

const ResourceAddBodySchema = z
  .object({
    sourcePath: z.string().min(1).optional(),
    sourceRelpath: z.string().min(1).optional(),
    alias: z.string().min(1).optional(),
  })
  .refine(
    (value) => {
      const sourcePath = value.sourcePath?.trim()
      const sourceRelpath = value.sourceRelpath?.trim()
      return Boolean(sourcePath || sourceRelpath)
    },
    {
      message: "sourcePath is required",
    },
  )

const ResourceRenameBodySchema = z.object({
  alias: z.string().min(1),
})

const ResourceKeyParamSchema = z.object({
  resourceKey: z.string().min(1),
})

const ResourceDeleteResponseSchema = z.object({
  ok: z.literal(true),
})

export const ResourceRoutes = new Hono()
  .get(
    "/",
    describeRoute({
      operationId: "resource.list",
      summary: "List resources",
      responses: {
        200: {
          description: "Registered resources",
          content: {
            "application/json": { schema: resolver(ResourceListResponseSchema) },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const resources = await listResources(context.directory)
            return c.json({ resources })
          },
          mapError: mapResourceRouteError,
        }),
      ),
  )
  .post(
    "/",
    describeRoute({
      operationId: "resource.add",
      summary: "Register and prepare a resource",
      responses: {
        200: {
          description: "Registered resource",
          content: {
            "application/json": { schema: resolver(ResourceRecordSchema) },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", ResourceAddBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const payload = c.req.valid("json")
            const sourcePath = payload.sourcePath?.trim() || payload.sourceRelpath?.trim() || ""
            const record = await addResource({
              directory: context.directory,
              sourcePath,
              alias: payload.alias,
            })
            return c.json(record)
          },
          mapError: mapResourceRouteError,
        }),
      ),
  )
  .patch(
    "/:resourceKey",
    describeRoute({
      operationId: "resource.rename",
      summary: "Rename a resource alias",
      responses: {
        200: {
          description: "Updated resource",
          content: {
            "application/json": { schema: resolver(ResourceRecordSchema) },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", ResourceKeyParamSchema),
    validator("json", ResourceRenameBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const { resourceKey } = c.req.valid("param")
            const resourceID = await resolveResourceIDByKey(context.directory, resourceKey)
            const payload = c.req.valid("json")
            const record = await renameResource({
              directory: context.directory,
              resourceID,
              alias: payload.alias,
            })
            return c.json(record)
          },
          mapError: mapResourceRouteError,
        }),
      ),
  )
  .post(
    "/:resourceKey/rebuild",
    describeRoute({
      operationId: "resource.rebuild",
      summary: "Rebuild a resource pack",
      responses: {
        200: {
          description: "Resource marked for rebuild",
          content: {
            "application/json": { schema: resolver(ResourceRecordSchema) },
          },
        },
        ...routeErrors(403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", ResourceKeyParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const { resourceKey } = c.req.valid("param")
            const resourceID = await resolveResourceIDByKey(context.directory, resourceKey)
            const record = await rebuildResource({
              directory: context.directory,
              resourceID,
            })
            return c.json(record)
          },
          mapError: mapResourceRouteError,
        }),
      ),
  )
  .delete(
    "/:resourceKey",
    describeRoute({
      operationId: "resource.remove",
      summary: "Remove a registered resource",
      responses: {
        200: {
          description: "Resource removed",
          content: {
            "application/json": { schema: resolver(ResourceDeleteResponseSchema) },
          },
        },
        ...routeErrors(403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", ResourceKeyParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const { resourceKey } = c.req.valid("param")
            const resourceID = await resolveResourceIDByKey(context.directory, resourceKey)
            await removeResource({
              directory: context.directory,
              resourceID,
            })
            return c.json({ ok: true as const })
          },
          mapError: mapResourceRouteError,
        }),
      ),
  )

export type { ResourceRecord }
