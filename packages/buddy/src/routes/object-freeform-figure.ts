import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { BuddyObjectIDSchema, mapBuddyObjectRouteError } from "../objects"
import { readFreeformFigureObject } from "../learning/features/figure-rendering/freeform/service/io"
import { FreeformFigureRenderError } from "../learning/features/figure-rendering/freeform/service/render"

const objectIDParamSchema = z
  .object({
    objectID: BuddyObjectIDSchema,
  })
  .strict()

const freeformFigureRawQuerySchema = directoryQuerySchema.extend({
  revisionID: BuddyObjectIDSchema.optional(),
})

const freeformFigureSvgHeaders = {
  "cache-control": "private, max-age=31536000, immutable",
  "content-type": "image/svg+xml; charset=utf-8",
  "x-content-type-options": "nosniff",
}

function mapFreeformFigureObjectRouteError(error: unknown): Response | undefined {
  if (error instanceof FreeformFigureRenderError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  return mapBuddyObjectRouteError(error)
}

export const ObjectFreeformFigureRoutes = new Hono().get(
  "/:objectID/raw",
  describeRoute({
    operationId: "objectFreeformFigure.raw",
    summary: "Read rendered freeform figure object SVG",
    responses: {
      200: {
        description: "SVG freeform figure object payload",
        content: {
          "image/svg+xml": {
            schema: resolver(z.string()),
          },
        },
      },
      ...routeErrors(400, 403, 404, 410, 500),
    },
  }),
  validator("query", freeformFigureRawQuerySchema),
  validator("param", objectIDParamSchema),
  async (c) =>
    withDirectoryRoute(c, async (context) =>
      runRouteTask({
        task: async () => {
          const params = c.req.valid("param")
          const query = c.req.valid("query")
          const figure = await readFreeformFigureObject({
            directory: context.directory,
            objectID: params.objectID,
            revisionID: query.revisionID,
          })
          return new Response(figure.svg, { headers: freeformFigureSvgHeaders })
        },
        mapError: mapFreeformFigureObjectRouteError,
      }),
    ),
)
