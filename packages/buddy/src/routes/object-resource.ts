import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import {
  addResource,
  listResources,
  mapResourceRouteError,
  rebuildResource,
  removeResource,
  renameResource,
  resolveResourceObjectIDByKey,
} from "../resources/resource-registry-service"
import { BuddyObjectIDSchema } from "../objects"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"

const ResourceStatusSchema = z.enum(["preparing", "ready", "unsupported", "error", "stale"])

const ResourceObjectRecordSchema = z
  .object({
    objectID: BuddyObjectIDSchema,
    alias: z.string(),
    sourceRelpath: z.string(),
    sourceOriginRelpath: z.string().optional(),
    format: z.string(),
    status: ResourceStatusSchema,
    sourceValidity: z.enum(["valid", "invalid", "unknown"]),
    extractionStatus: ResourceStatusSchema,
    warnings: z.array(z.string()),
    preparedAt: z.string().optional(),
    sourceMtimeMs: z.number().optional(),
    sourceSizeBytes: z.number().optional(),
    coverRelpath: z.string().optional(),
    title: z.string().optional(),
    author: z.string().optional(),
    packPath: z.string().optional(),
    fullTextPath: z.string().optional(),
    fullTextEstimatedTokens: z.number().optional(),
    fullTextCharacters: z.number().optional(),
    readerPath: z.string().optional(),
  })
  .strict()

const ResourceObjectListResponseSchema = z
  .object({
    resources: z.array(ResourceObjectRecordSchema),
  })
  .strict()

const ResourceCreateBodySchema = z
  .object({
    sourcePath: z.string().min(1),
    alias: z.string().min(1).optional(),
  })
  .strict()

const ResourceRenameBodySchema = z
  .object({
    alias: z.string().min(1),
  })
  .strict()

const ResourceObjectIDParamSchema = z
  .object({
    objectID: BuddyObjectIDSchema,
  })
  .strict()

const ResourceKeyParamSchema = z
  .object({
    resourceKey: z.string().min(1),
  })
  .strict()

const ResourceDeleteResponseSchema = z
  .object({
    ok: z.literal(true),
  })
  .strict()

export const ObjectResourceRoutes = new Hono()
  .get(
    "/",
    describeRoute({
      operationId: "objectResource.list",
      summary: "List resource objects",
      responses: {
        200: {
          description: "Resource objects",
          content: {
            "application/json": { schema: resolver(ResourceObjectListResponseSchema) },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => c.json({ resources: await listResources(context.directory) }),
          mapError: mapResourceRouteError,
        }),
      ),
  )
  .post(
    "/",
    describeRoute({
      operationId: "objectResource.create",
      summary: "Create and prepare a resource object",
      responses: {
        200: {
          description: "Created resource object",
          content: {
            "application/json": { schema: resolver(ResourceObjectRecordSchema) },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("json", ResourceCreateBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const payload = c.req.valid("json")
            return c.json(
              await addResource({
                directory: context.directory,
                sourcePath: payload.sourcePath,
                alias: payload.alias,
              }),
            )
          },
          mapError: mapResourceRouteError,
        }),
      ),
  )
  .patch(
    "/:objectID",
    describeRoute({
      operationId: "objectResource.rename",
      summary: "Rename a resource object alias",
      responses: {
        200: {
          description: "Renamed resource object",
          content: {
            "application/json": { schema: resolver(ResourceObjectRecordSchema) },
          },
        },
        ...routeErrors(400, 403, 404, 410),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", ResourceObjectIDParamSchema),
    validator("json", ResourceRenameBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            const payload = c.req.valid("json")
            return c.json(
              await renameResource({
                directory: context.directory,
                objectID: params.objectID,
                alias: payload.alias,
              }),
            )
          },
          mapError: mapResourceRouteError,
        }),
      ),
  )
  .patch(
    "/by-key/:resourceKey",
    describeRoute({
      operationId: "objectResource.renameByKey",
      summary: "Rename a resource object alias by objectID or alias",
      responses: {
        200: {
          description: "Renamed resource object",
          content: {
            "application/json": { schema: resolver(ResourceObjectRecordSchema) },
          },
        },
        ...routeErrors(400, 403, 404, 410),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", ResourceKeyParamSchema),
    validator("json", ResourceRenameBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            const payload = c.req.valid("json")
            const objectID = await resolveResourceObjectIDByKey(
              context.directory,
              params.resourceKey,
            )
            return c.json(
              await renameResource({
                directory: context.directory,
                objectID,
                alias: payload.alias,
              }),
            )
          },
          mapError: mapResourceRouteError,
        }),
      ),
  )
  .post(
    "/:objectID/rebuild",
    describeRoute({
      operationId: "objectResource.rebuild",
      summary: "Rebuild a resource object pack",
      responses: {
        200: {
          description: "Resource object rebuild started",
          content: {
            "application/json": { schema: resolver(ResourceObjectRecordSchema) },
          },
        },
        ...routeErrors(403, 404, 410),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", ResourceObjectIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            return c.json(
              await rebuildResource({
                directory: context.directory,
                objectID: params.objectID,
              }),
            )
          },
          mapError: mapResourceRouteError,
        }),
      ),
  )
  .post(
    "/by-key/:resourceKey/rebuild",
    describeRoute({
      operationId: "objectResource.rebuildByKey",
      summary: "Rebuild a resource object pack by objectID or alias",
      responses: {
        200: {
          description: "Resource object rebuild started",
          content: {
            "application/json": { schema: resolver(ResourceObjectRecordSchema) },
          },
        },
        ...routeErrors(403, 404, 410),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", ResourceKeyParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            const objectID = await resolveResourceObjectIDByKey(
              context.directory,
              params.resourceKey,
            )
            return c.json(
              await rebuildResource({
                directory: context.directory,
                objectID,
              }),
            )
          },
          mapError: mapResourceRouteError,
        }),
      ),
  )
  .delete(
    "/:objectID",
    describeRoute({
      operationId: "objectResource.delete",
      summary: "Delete a resource object",
      responses: {
        200: {
          description: "Deleted resource object",
          content: {
            "application/json": { schema: resolver(ResourceDeleteResponseSchema) },
          },
        },
        ...routeErrors(403, 404, 410),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", ResourceObjectIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            await removeResource({ directory: context.directory, objectID: params.objectID })
            return c.json({ ok: true as const })
          },
          mapError: mapResourceRouteError,
        }),
      ),
  )
  .delete(
    "/by-key/:resourceKey",
    describeRoute({
      operationId: "objectResource.deleteByKey",
      summary: "Delete a resource object by objectID or alias",
      responses: {
        200: {
          description: "Deleted resource object",
          content: {
            "application/json": { schema: resolver(ResourceDeleteResponseSchema) },
          },
        },
        ...routeErrors(403, 404, 410),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", ResourceKeyParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            const objectID = await resolveResourceObjectIDByKey(
              context.directory,
              params.resourceKey,
            )
            await removeResource({ directory: context.directory, objectID })
            return c.json({ ok: true as const })
          },
          mapError: mapResourceRouteError,
        }),
      ),
  )
