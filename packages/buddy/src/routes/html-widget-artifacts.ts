import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { mapHtmlWidgetRouteError } from "../learning/features/html-widgets/errors"
import {
  listHtmlWidgetArtifacts,
  readHtmlWidgetArtifact,
  readHtmlWidgetSource,
} from "../learning/features/html-widgets/service/store"
import {
  HTML_WIDGET_RUNTIME_CSP,
  HtmlWidgetListResponseSchema,
  HtmlWidgetReadSchema,
  HtmlWidgetSourceResponseSchema,
} from "../learning/features/html-widgets/service/types"

const widgetIDParamSchema = z.object({
  widgetID: z.string(),
})

const runtimeHeaders = {
  "cache-control": "private, max-age=31536000, immutable",
  "content-security-policy": HTML_WIDGET_RUNTIME_CSP,
  "content-type": "text/html; charset=utf-8",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
}

export const HtmlWidgetArtifactRoutes = new Hono()
  .get(
    "/",
    describeRoute({
      operationId: "htmlWidgetArtifacts.list",
      summary: "List persisted HTML widgets",
      responses: {
        200: {
          description: "Workspace HTML widgets",
          content: {
            "application/json": {
              schema: resolver(HtmlWidgetListResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const widgets = await listHtmlWidgetArtifacts(context.directory)
            return Response.json({ widgets })
          },
          mapError: mapHtmlWidgetRouteError,
        }),
      ),
  )
  .get(
    "/:widgetID",
    describeRoute({
      operationId: "htmlWidgetArtifacts.read",
      summary: "Read persisted HTML widget metadata",
      responses: {
        200: {
          description: "HTML widget metadata",
          content: {
            "application/json": {
              schema: resolver(HtmlWidgetReadSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404),
      },
    }),
    validator("query", directoryQuerySchema),
    validator("param", widgetIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const widget = await readHtmlWidgetArtifact(
              context.directory,
              c.req.valid("param").widgetID,
            )
            return Response.json(widget)
          },
          mapError: mapHtmlWidgetRouteError,
        }),
      ),
  )
  .get(
    "/:widgetID/source",
    describeRoute({
      operationId: "htmlWidgetArtifacts.source",
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
    validator("param", widgetIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const widgetID = c.req.valid("param").widgetID
            const source = await readHtmlWidgetSource(context.directory, widgetID)
            return Response.json({ widgetID, source })
          },
          mapError: mapHtmlWidgetRouteError,
        }),
      ),
  )
  .get(
    "/:widgetID/runtime",
    describeRoute({
      operationId: "htmlWidgetArtifacts.runtime",
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
    validator("param", widgetIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const source = await readHtmlWidgetSource(
              context.directory,
              c.req.valid("param").widgetID,
            )
            return new Response(source, {
              headers: runtimeHeaders,
            })
          },
          mapError: mapHtmlWidgetRouteError,
        }),
      ),
  )
