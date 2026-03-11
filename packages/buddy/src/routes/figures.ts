import type { Context } from "hono"
import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { FigureNotFoundError, FigureService, InvalidFigureIDError } from "../learning/capabilities"

const figureIDParamSchema = z.object({
  figureID: z.string(),
})

const figureSvgPath = "/:figureID"

const figureSvgHeaders = {
  "cache-control": "private, max-age=31536000, immutable",
  "content-type": "image/svg+xml; charset=utf-8",
  vary: "x-buddy-directory",
}

function mapFigureError(c: Context, error: unknown): Response | undefined {
  if (error instanceof InvalidFigureIDError) {
    return c.json({ error: error.message }, 400)
  }
  if (error instanceof FigureNotFoundError) {
    return c.json({ error: error.message }, 404)
  }
  return undefined
}

export const FigureRoutes = (): Hono =>
  new Hono().get(
    figureSvgPath,
    describeRoute({
      operationId: "figure.read",
      summary: "Read rendered figure SVG",
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
            const svg = await FigureService.read(context.directory, c.req.valid("param").figureID)
            return new Response(svg, {
              headers: figureSvgHeaders,
            })
          },
          mapError: (error) => mapFigureError(c, error),
        }),
      ),
  )
