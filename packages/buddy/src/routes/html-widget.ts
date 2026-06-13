import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { ArtifactValidationError, mapArtifactRouteError } from "../artifacts"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import {
  HtmlWidgetValidationError,
  readHtmlWidgetManifest,
  readHtmlWidgetSource,
} from "../learning/features/html-widgets/service/store"
import {
  HtmlWidgetArtifactManifestSchema,
  HTML_WIDGET_RUNTIME_CSP,
  HtmlWidgetSourceResponseSchema,
} from "../learning/features/html-widgets/service/types"

const artifactIDParamSchema = z.object({
  artifactID: z.string(),
})

const runtimeHeaders = {
  "cache-control": "private, max-age=31536000, immutable",
  "content-security-policy": HTML_WIDGET_RUNTIME_CSP,
  "content-type": "text/html; charset=utf-8",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
}

function mapHtmlWidgetRouteError(error: unknown): Response | undefined {
  if (error instanceof ArtifactValidationError || error instanceof HtmlWidgetValidationError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  return mapArtifactRouteError(error)
}

export const HtmlWidgetRoutes = new Hono()
  .get(
    "/:artifactID",
    describeRoute({
      operationId: "htmlWidget.read",
      summary: "Read persisted HTML widget metadata",
      responses: {
        200: {
          description: "HTML widget metadata",
          content: {
            "application/json": {
              schema: resolver(HtmlWidgetArtifactManifestSchema),
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
          task: async () => {
            const widget = await readHtmlWidgetManifest(
              context.directory,
              c.req.valid("param").artifactID,
            )
            return Response.json(widget)
          },
          mapError: mapHtmlWidgetRouteError,
        }),
      ),
  )
  .get(
    "/:artifactID/source",
    describeRoute({
      operationId: "htmlWidget.source",
      summary: "Read persisted HTML widget source",
      responses: {
        200: {
          description: "HTML widget source",
          content: {
            "application/json": {
              schema: resolver(HtmlWidgetSourceResponseSchema),
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
          task: async () => {
            const artifactID = c.req.valid("param").artifactID
            const source = await readHtmlWidgetSource(context.directory, artifactID)
            return Response.json({ artifactID, source })
          },
          mapError: mapHtmlWidgetRouteError,
        }),
      ),
  )
  .get(
    "/:artifactID/runtime",
    describeRoute({
      operationId: "htmlWidget.runtime",
      summary: "Serve persisted HTML widget runtime document",
      responses: {
        200: {
          description: "HTML widget runtime document",
          content: {
            "text/html": {
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
          task: async () => {
            const source = await readHtmlWidgetSource(
              context.directory,
              c.req.valid("param").artifactID,
            )
            return new Response(source, {
              headers: runtimeHeaders,
            })
          },
          mapError: mapHtmlWidgetRouteError,
        }),
      ),
  )
