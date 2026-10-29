import { mapRouteError } from "../http/route-errors"
import { INERT_DOCUMENT_CSP } from "../http/inert-document-headers"
import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { BuddyObjectIDSchema } from "../objects"
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
  "content-security-policy": INERT_DOCUMENT_CSP,
  "x-content-type-options": "nosniff",
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
        mapError: mapRouteError,
      }),
    ),
)
