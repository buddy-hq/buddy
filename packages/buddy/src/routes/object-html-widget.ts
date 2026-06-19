import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import {
  directoryQuerySchema,
  routeErrors,
  runRouteTask,
  withDirectoryContext,
  withDirectoryRoute,
} from "../http"
import { BuddyObjectIDSchema, mapBuddyObjectRouteError, nonEmptyString } from "../objects"
import {
  HtmlWidgetValidationError,
  decodeHtmlWidgetRuntimeDirectoryToken,
  htmlWidgetRuntimeVersionFromToken,
  readHtmlWidgetObjectSource,
  resolveHtmlWidgetObjectRuntimeFile,
} from "../learning/features/html-widgets/service/store"
import { HTML_WIDGET_RUNTIME_CSP } from "../learning/features/html-widgets/service/types"

const objectIDParamSchema = z
  .object({
    objectID: BuddyObjectIDSchema,
  })
  .strict()

const runtimeFileParamSchema = objectIDParamSchema.extend({
  directoryToken: nonEmptyString,
  versionToken: nonEmptyString,
  assetPath: nonEmptyString,
})

const sourceQuerySchema = directoryQuerySchema.extend({
  path: nonEmptyString.optional(),
})

const htmlWidgetObjectSourceResponseSchema = z
  .object({
    objectID: BuddyObjectIDSchema,
    path: nonEmptyString,
    source: z.string(),
  })
  .strict()

const liveRuntimeHeaders = {
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
}

const immutableRuntimeHeaders = {
  ...liveRuntimeHeaders,
  "cache-control": "private, max-age=31536000, immutable",
}

const runtimeDocumentHeaders = {
  "content-security-policy": HTML_WIDGET_RUNTIME_CSP,
}

function mapHtmlWidgetObjectRouteError(error: unknown): Response | undefined {
  if (error instanceof HtmlWidgetValidationError) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  return mapBuddyObjectRouteError(error)
}

export const ObjectHtmlWidgetRoutes = new Hono()
  .get(
    "/:objectID/source",
    describeRoute({
      operationId: "objectHtmlWidget.source",
      summary: "Read HTML widget object source",
      responses: {
        200: {
          description: "HTML widget object source",
          content: {
            "application/json": {
              schema: resolver(htmlWidgetObjectSourceResponseSchema),
            },
          },
        },
        ...routeErrors(400, 403, 404, 410, 500),
      },
    }),
    validator("query", sourceQuerySchema),
    validator("param", objectIDParamSchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const params = c.req.valid("param")
            const query = c.req.valid("query")
            const source = await readHtmlWidgetObjectSource({
              directory: context.directory,
              objectID: params.objectID,
              path: query.path,
            })
            return c.json(htmlWidgetObjectSourceResponseSchema.parse(source))
          },
          mapError: mapHtmlWidgetObjectRouteError,
        }),
      ),
  )
  .get(
    "/runtime/:directoryToken/:objectID/:versionToken/:assetPath{.+}",
    describeRoute({
      operationId: "objectHtmlWidget.runtime",
      summary: "Serve HTML widget object runtime document",
      responses: {
        200: {
          description: "HTML widget object runtime document",
          content: {
            "text/html": {
              schema: resolver(z.string()),
            },
          },
        },
        ...routeErrors(400, 403, 404, 410, 500),
      },
    }),
    validator("param", runtimeFileParamSchema),
    async (c) =>
      runRouteTask({
        task: async () => {
          const params = c.req.valid("param")
          const requestUrl = new URL(c.req.url)
          requestUrl.searchParams.set(
            "directory",
            decodeHtmlWidgetRuntimeDirectoryToken(params.directoryToken),
          )
          const contextResult = withDirectoryContext(
            new Request(requestUrl, { headers: c.req.raw.headers }),
          )
          if (!contextResult.ok) return contextResult.response

          const runtime = await resolveHtmlWidgetObjectRuntimeFile({
            directory: contextResult.value.directory,
            objectID: params.objectID,
            assetPath: params.assetPath,
            version: htmlWidgetRuntimeVersionFromToken(params.versionToken),
          })
          return new Response(Bun.file(runtime.filePath), {
            headers: {
              ...(runtime.immutable ? immutableRuntimeHeaders : liveRuntimeHeaders),
              ...(runtime.isDocument ? runtimeDocumentHeaders : {}),
              "content-type": runtime.contentType,
            },
          })
        },
        mapError: mapHtmlWidgetObjectRouteError,
      }),
  )
