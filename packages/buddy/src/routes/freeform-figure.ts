import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { ArtifactValidationError, mapArtifactRouteError } from "../artifacts"
import {
  freeformFigureReadResponseSchema,
  readFreeformFigureArtifactMetadata,
} from "../learning/artifact-index"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { readFreeformFigure } from "../learning/features/figure-rendering/freeform/service/io"
import { FreeformFigureRenderError } from "../learning/features/figure-rendering/freeform/service/render"

const artifactIDParamSchema = z.object({
  artifactID: z.string(),
})

const figureSvgHeaders = {
  "cache-control": "private, max-age=31536000, immutable",
  "content-type": "image/svg+xml; charset=utf-8",
  vary: "x-buddy-directory",
}

function mapFreeformFigureRouteError(error: unknown): Response | undefined {
  if (error instanceof ArtifactValidationError || error instanceof FreeformFigureRenderError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  return mapArtifactRouteError(error)
}

export const FreeformFigureRoutes = new Hono()
  .get(
    "/:artifactID",
    describeRoute({
      operationId: "freeformFigure.read",
      summary: "Read rendered freeform figure metadata",
      responses: {
        200: {
          description: "Freeform figure metadata",
          content: {
            "application/json": {
              schema: resolver(freeformFigureReadResponseSchema),
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
              await readFreeformFigureArtifactMetadata({
                directory: context.directory,
                artifactID: c.req.valid("param").artifactID,
              }),
            ),
          mapError: mapFreeformFigureRouteError,
        }),
      ),
  )
  .get(
    "/:artifactID/raw",
    describeRoute({
      operationId: "freeformFigure.raw",
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
    validator("param", artifactIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () =>
            new Response(
              await readFreeformFigure(context.directory, c.req.valid("param").artifactID),
              { headers: figureSvgHeaders },
            ),
          mapError: mapFreeformFigureRouteError,
        }),
      ),
  )
