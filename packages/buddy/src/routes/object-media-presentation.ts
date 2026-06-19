import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { BuddyObjectIDSchema, mapBuddyObjectRouteError, nonEmptyString } from "../objects"
import {
  PROJECT_FILE_NOT_FOUND_ERROR,
  PresentedMediaValidationError,
  readPresentedMediaObjectItemAvailability,
  readPresentedMediaObjectRawResponse,
} from "../learning/features/media-presentations/service/file-media"

const mediaObjectRawParamSchema = z
  .object({
    objectID: BuddyObjectIDSchema,
    itemID: nonEmptyString,
  })
  .strict()

const mediaObjectRawQuerySchema = directoryQuerySchema.extend({
  fileName: nonEmptyString.optional(),
})

const mediaObjectAvailabilityResponseSchema = z
  .object({
    status: z.enum(["available", "missing", "error"]),
    message: z.string().nullable(),
  })
  .strict()

function mapMediaObjectRouteError(error: unknown): Response | undefined {
  if (error instanceof PresentedMediaValidationError) {
    const status = error.message === PROJECT_FILE_NOT_FOUND_ERROR ? 404 : 400
    return Response.json({ error: error.message }, { status })
  }
  return mapBuddyObjectRouteError(error)
}

export const ObjectMediaPresentationRoutes = new Hono()
  .get(
    "/:objectID/items/:itemID/availability",
    describeRoute({
      operationId: "objectMediaPresentation.availability",
      summary: "Read current availability for a media-presentation object item",
      responses: {
        200: {
          description: "Current media object item availability",
          content: {
            "application/json": {
              schema: resolver(mediaObjectAvailabilityResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404, 410, 500),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", mediaObjectRawParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            const availability = await readPresentedMediaObjectItemAvailability({
              directory: context.directory,
              objectID: params.objectID,
              itemID: params.itemID,
            })
            return c.json(mediaObjectAvailabilityResponseSchema.parse(availability))
          },
          mapError: mapMediaObjectRouteError,
        }),
      ),
  )
  .get(
    "/:objectID/raw/:itemID",
    describeRoute({
      operationId: "objectMediaPresentation.raw",
      summary: "Read raw media-presentation object item bytes",
      responses: {
        200: {
          description: "Raw media object item bytes",
          content: {
            "application/octet-stream": {
              schema: resolver(z.string()),
            },
          },
        },
        ...routeErrors(400, 403, 404, 410, 500),
      },
    }),
    validator("param", mediaObjectRawParamSchema),
    validator("query", mediaObjectRawQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            const query = c.req.valid("query")
            return readPresentedMediaObjectRawResponse({
              directory: context.directory,
              objectID: params.objectID,
              itemID: params.itemID,
              downloadName: query.fileName,
              includeBody: true,
              rangeHeader: c.req.header("range"),
            })
          },
          mapError: mapMediaObjectRouteError,
        }),
      ),
  )
  .on(
    "HEAD",
    "/:objectID/raw/:itemID",
    validator("param", mediaObjectRawParamSchema),
    validator("query", mediaObjectRawQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            const query = c.req.valid("query")
            return readPresentedMediaObjectRawResponse({
              directory: context.directory,
              objectID: params.objectID,
              itemID: params.itemID,
              downloadName: query.fileName,
              includeBody: false,
              rangeHeader: c.req.header("range"),
            })
          },
          mapError: mapMediaObjectRouteError,
        }),
      ),
  )
