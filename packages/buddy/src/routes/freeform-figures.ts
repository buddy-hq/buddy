import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { mapFreeformFigureRouteError } from "../learning/capabilities/figures/freeform/errors"
import { readFreeformFigure } from "../learning/capabilities/figures/freeform/service/io"

const figureIDParamSchema = z.object({
  figureID: z.string(),
})

const freeformFigureSvgPath = "/:figureID"

const freeformFigureSvgHeaders = {
  "cache-control": "private, max-age=31536000, immutable",
  "content-type": "image/svg+xml; charset=utf-8",
  vary: "x-buddy-directory",
}

export const FreeformFigureRoutes = new Hono().get(
  freeformFigureSvgPath,
  describeRoute({
    operationId: "freeformFigure.read",
    summary: "Read rendered freeform figure SVG",
    responses: {
      200: {
        description: "SVG figure payload",
        content: {
          "image/svg+xml": {
            schema: resolver(z.string()),
          },
        },
      },
      ...routeErrors(400, 403, 404),
    },
  }),
  validator("query", directoryQuerySchema),
  validator("param", figureIDParamSchema),
  async (c) =>
    withDirectoryRoute(c, async (context) =>
      runRouteTask({
        task: async () => {
          const svg = await readFreeformFigure(context.directory, c.req.valid("param").figureID)
          return new Response(svg, {
            headers: freeformFigureSvgHeaders,
          })
        },
        mapError: mapFreeformFigureRouteError,
      }),
    ),
)
