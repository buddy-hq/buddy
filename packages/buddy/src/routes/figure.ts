import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { ArtifactValidationError, mapArtifactRouteError } from "../artifacts"
import { figureReadResponseSchema, readFigureArtifactMetadata } from "../learning/artifact-index"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { readGeometryFigure } from "../learning/features/figure-rendering/geometry/read-figure"
import { FigureRenderError } from "../learning/features/figure-rendering/geometry/render-figure"

const artifactIDParamSchema = z.object({
  artifactID: z.string(),
})

const figureSvgHeaders = {
  "cache-control": "private, max-age=31536000, immutable",
  "content-type": "image/svg+xml; charset=utf-8",
  vary: "x-buddy-directory",
}

function mapFigureRouteError(error: unknown): Response | undefined {
  if (error instanceof ArtifactValidationError || error instanceof FigureRenderError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  return mapArtifactRouteError(error)
}

export const FigureRoutes = new Hono()
  .get(
    "/:artifactID",
    describeRoute({
      operationId: "figure.read",
      summary: "Read rendered figure metadata",
      responses: {
        200: {
          description: "Figure metadata",
          content: {
            "application/json": {
              schema: resolver(figureReadResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", artifactIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () =>
            Response.json(
              await readFigureArtifactMetadata({
                directory: context.directory,
                artifactID: c.req.valid("param").artifactID,
              }),
            ),
          mapError: mapFigureRouteError,
        }),
      ),
  )
  .get(
    "/:artifactID/raw",
    describeRoute({
      operationId: "figure.raw",
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
    validator("param", artifactIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () =>
            new Response(
              await readGeometryFigure(context.directory, c.req.valid("param").artifactID),
              { headers: figureSvgHeaders },
            ),
          mapError: mapFigureRouteError,
        }),
      ),
  )
