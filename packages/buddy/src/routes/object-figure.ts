import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { BuddyObjectIDSchema, mapBuddyObjectRouteError } from "../objects"
import { FigureRenderError } from "../learning/features/figure-rendering/geometry/render-figure"
import { readGeometryFigureObject } from "../learning/features/figure-rendering/geometry/read-figure"

const objectIDParamSchema = z
  .object({
    objectID: BuddyObjectIDSchema,
  })
  .strict()

const figureRawQuerySchema = directoryQuerySchema.extend({
  revisionID: BuddyObjectIDSchema.optional(),
})

const figureSvgHeaders = {
  "cache-control": "private, max-age=31536000, immutable",
  "content-type": "image/svg+xml; charset=utf-8",
  "x-content-type-options": "nosniff",
}

function mapFigureObjectRouteError<TError>(error: TError): Response | undefined {
  if (error instanceof FigureRenderError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  return mapBuddyObjectRouteError(error)
}

export const ObjectFigureRoutes = new Hono().get(
  "/:objectID/raw",
  describeRoute({
    operationId: "objectFigure.raw",
    summary: "Read rendered figure object SVG",
    responses: {
      200: {
        description: "SVG figure object payload",
        content: {
          "image/svg+xml": {
            schema: resolver(z.string()),
          },
        },
      },
      ...routeErrors(400, 403, 404, 410, 500),
    },
  }),
  validator("query", figureRawQuerySchema),
  validator("param", objectIDParamSchema),
  async (c) =>
    withDirectoryRoute(c, async (context) =>
      runRouteTask({
        task: async () => {
          const params = c.req.valid("param")
          const query = c.req.valid("query")
          const figure = await readGeometryFigureObject({
            directory: context.directory,
            objectID: params.objectID,
            revisionID: query.revisionID,
          })
          return new Response(figure.svg, { headers: figureSvgHeaders })
        },
        mapError: mapFigureObjectRouteError,
      }),
    ),
)
