import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import {
  BuddyObjectIDSchema,
  BuddyObjectIndexItemSchema,
  BuddyObjectKindSchema,
  BuddyObjectLoadErrorSchema,
  BuddyObjectReadResponseSchema,
  BuddyObjectViewResponseSchema,
  deleteObject,
  listObjects,
  mapBuddyObjectRouteError,
  nonEmptyString,
  readObject,
  requireBuddyObjectKindDefinition,
} from "../objects"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { ObjectHtmlWidgetRoutes } from "./object-html-widget"
import { ObjectFlashcardDeckRoutes } from "./object-flashcard-deck"
import { ObjectFigureRoutes } from "./object-figure"
import { ObjectFreeformFigureRoutes } from "./object-freeform-figure"
import { ObjectMediaPresentationRoutes } from "./object-media-presentation"
import { ObjectMermaidRoutes } from "./object-mermaid"
import { ObjectQuestionSetRoutes } from "./object-question-set"
import { ObjectResourceRoutes } from "./object-resource"
import { ObjectWhiteboardRoutes } from "./object-whiteboard"

const objectsListQuerySchema = directoryQuerySchema.extend({
  kind: BuddyObjectKindSchema.optional(),
})

const objectParamsSchema = z
  .object({
    kind: BuddyObjectKindSchema,
    objectID: BuddyObjectIDSchema,
  })
  .strict()

const objectViewParamsSchema = objectParamsSchema
  .extend({
    viewID: nonEmptyString,
  })
  .strict()

const objectViewQuerySchema = directoryQuerySchema.extend({
  revisionID: nonEmptyString.optional(),
  itemID: nonEmptyString.optional(),
})

const objectListResponseSchema = z
  .object({
    objects: z.array(BuddyObjectIndexItemSchema),
    loadErrors: z.array(BuddyObjectLoadErrorSchema),
  })
  .strict()

const objectDeleteResponseSchema = z
  .object({
    ok: z.literal(true),
  })
  .strict()

export const ObjectsRoutes = new Hono()
  .route("/resource", ObjectResourceRoutes)
  .route("/whiteboard", ObjectWhiteboardRoutes)
  .route("/figure", ObjectFigureRoutes)
  .route("/freeform-figure", ObjectFreeformFigureRoutes)
  .route("/flashcard-deck", ObjectFlashcardDeckRoutes)
  .route("/html-widget", ObjectHtmlWidgetRoutes)
  .route("/media-presentation", ObjectMediaPresentationRoutes)
  .route("/mermaid", ObjectMermaidRoutes)
  .route("/question-set", ObjectQuestionSetRoutes)
  .get(
    "/",
    describeRoute({
      operationId: "objects.list",
      summary: "List Buddy-managed objects",
      responses: {
        200: {
          description: "Buddy-managed object index",
          content: {
            "application/json": {
              schema: resolver(objectListResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403, 500),
      },
    }),
    validator("query", objectsListQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const { kind } = c.req.valid("query")
            const result = await listObjects({
              directory: context.directory,
              ...(kind ? { kind } : {}),
            })
            return c.json(objectListResponseSchema.parse(result))
          },
          mapError: mapBuddyObjectRouteError,
        }),
      ),
  )
  .get(
    "/:kind/:objectID",
    describeRoute({
      operationId: "objects.read",
      summary: "Read one Buddy-managed object manifest or tombstone",
      responses: {
        200: {
          description: "Buddy-managed object read response",
          content: {
            "application/json": {
              schema: resolver(BuddyObjectReadResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404, 410, 500),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", objectParamsSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            return c.json(
              await readObject({
                directory: context.directory,
                kind: params.kind,
                objectID: params.objectID,
              }),
            )
          },
          mapError: mapBuddyObjectRouteError,
        }),
      ),
  )
  .get(
    "/:kind/:objectID/views/:viewID",
    describeRoute({
      operationId: "objects.view",
      summary: "Read one Buddy-managed object view",
      responses: {
        200: {
          description: "Buddy-managed object view",
          content: {
            "application/json": {
              schema: resolver(BuddyObjectViewResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404, 410, 500),
      },
    }),
    validator("query", objectViewQuerySchema),
    validator("param", objectViewParamsSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            const query = c.req.valid("query")
            const definition = requireBuddyObjectKindDefinition(params.kind)
            const result = await definition.readView({
              directory: context.directory,
              ref: {
                kind: params.kind,
                objectID: params.objectID,
                revisionID: query.revisionID ?? null,
                itemID: query.itemID ?? null,
              },
              viewID: params.viewID,
              ...(query.revisionID ? { revisionID: query.revisionID } : {}),
              ...(query.itemID ? { itemID: query.itemID } : {}),
            })
            return c.json(BuddyObjectViewResponseSchema.parse(result))
          },
          mapError: mapBuddyObjectRouteError,
        }),
      ),
  )
  .delete(
    "/:kind/:objectID",
    describeRoute({
      operationId: "objects.delete",
      summary: "Delete one Buddy-managed object and write a tombstone",
      responses: {
        200: {
          description: "Deleted object result",
          content: {
            "application/json": {
              schema: resolver(objectDeleteResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404, 410, 500),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", objectParamsSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            const definition = requireBuddyObjectKindDefinition(params.kind)
            const ref = {
              kind: params.kind,
              objectID: params.objectID,
              revisionID: null,
              itemID: null,
            }
            if (definition.delete) {
              await definition.delete({
                directory: context.directory,
                ref,
              })
            } else {
              await deleteObject({
                directory: context.directory,
                kind: params.kind,
                objectID: params.objectID,
              })
            }
            return c.json(objectDeleteResponseSchema.parse({ ok: true }))
          },
          mapError: mapBuddyObjectRouteError,
        }),
      ),
  )
