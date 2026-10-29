import { mapRouteError } from "../http/route-errors"
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
import { BuddyObjectIDSchema, nonEmptyString } from "../objects"
import {
  decodeHtmlWidgetRuntimeDirectoryToken,
  htmlWidgetRuntimeVersionFromToken,
  presentHtmlWidgetObject,
  readHtmlWidgetObjectSource,
  resolveHtmlWidgetObjectRuntimeFile,
} from "../learning/features/html-widgets/service/store"
import { HTML_WIDGET_RUNTIME_CSP } from "../learning/features/html-widgets/service/types"
import { widgetFramePassSigner } from "../learning/features/html-widgets/service/widget-frame-pass"
import { INERT_DOCUMENT_CSP } from "../http/inert-document-headers"
import { createRawFileStream, readRawFileRecord } from "../project/raw-file-response-service"

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

type RuntimeFileInput = {
  directory: string
  objectID: string
  versionToken: string
  assetPath: string
}

function runtimeDirectoryContext(request: Request, directory: string) {
  const requestUrl = new URL(request.url)
  requestUrl.searchParams.set("directory", directory)
  return withDirectoryContext(new Request(requestUrl, { headers: request.headers }))
}

async function resolveRuntimeFile(request: Request, input: RuntimeFileInput) {
  const contextResult = runtimeDirectoryContext(request, input.directory)
  if (!contextResult.ok) return contextResult
  const runtime = await resolveHtmlWidgetObjectRuntimeFile({
    directory: contextResult.value.directory,
    objectID: input.objectID,
    assetPath: input.assetPath,
    version: htmlWidgetRuntimeVersionFromToken(input.versionToken),
  })
  if (!runtime) return { ok: false, response: new Response(null, { status: 404 }) } as const
  return { ok: true, value: runtime } as const
}

function runtimeFileResponse(
  runtime: NonNullable<Awaited<ReturnType<typeof resolveHtmlWidgetObjectRuntimeFile>>>,
  inertAssets = false,
) {
  const fileRecord = readRawFileRecord(runtime.filePath)
  if (!fileRecord.ok) return fileRecord.response
  const mediaType = runtime.contentType.split(";", 1)[0]?.trim().toLowerCase() ?? ""
  const inertAsset =
    inertAssets &&
    (mediaType === "application/xml" || mediaType === "text/xml" || mediaType.endsWith("+xml"))
  return new Response(createRawFileStream(fileRecord), {
    headers: Object.assign(
      { "content-type": runtime.contentType },
      runtime.immutable ? immutableRuntimeHeaders : liveRuntimeHeaders,
      runtime.isDocument
        ? runtimeDocumentHeaders
        : inertAsset
          ? { "content-security-policy": INERT_DOCUMENT_CSP }
          : undefined,
    ),
  })
}

function parseRuntimeUrl(runtimeUrl: string, requestUrl: string): RuntimeFileInput | undefined {
  try {
    const base = new URL(requestUrl)
    const url = new URL(runtimeUrl, base)
    if (url.origin !== base.origin || url.username || url.password) return undefined
    const match = /^\/api\/objects\/html-widget\/runtime\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/u.exec(
      url.pathname,
    )
    if (!match) return undefined
    const params = runtimeFileParamSchema.safeParse({
      directoryToken: decodeURIComponent(match[1] ?? ""),
      objectID: decodeURIComponent(match[2] ?? ""),
      versionToken: decodeURIComponent(match[3] ?? ""),
      assetPath: decodeURIComponent(match[4] ?? ""),
    })
    if (!params.success) return undefined
    return {
      directory: decodeHtmlWidgetRuntimeDirectoryToken(params.data.directoryToken),
      objectID: params.data.objectID,
      versionToken: params.data.versionToken,
      assetPath: params.data.assetPath,
    }
  } catch {
    return undefined
  }
}

const widgetLinkBodySchema = z.object({ runtimeUrl: nonEmptyString }).strict()
const widgetLinkResponseSchema = z.object({ url: nonEmptyString }).strict()

export const WidgetFrameRoutes = new Hono()
  .use("/widget/*", async (c, next) => {
    await next()
    c.header("referrer-policy", "no-referrer")
    c.header("x-content-type-options", "nosniff")
  })
  .get("/widget/:pass/:assetPath{.+}", async (c) => {
    const identity = widgetFramePassSigner.verify(c.req.param("pass"))
    if (!identity) return c.body(null, 404)
    return runRouteTask({
      task: async () => {
        const runtime = await resolveRuntimeFile(c.req.raw, {
          ...identity,
          assetPath: c.req.param("assetPath"),
        })
        if (!runtime.ok) return runtime.response
        if (!runtime.value.immutable || !runtime.value.versioned) return c.body(null, 404)
        return runtimeFileResponse(runtime.value, true)
      },
      mapError: mapRouteError,
    })
  })
  .post(
    "/widget-links",
    describeRoute({
      operationId: "widgetFrame.exchange",
      summary: "Exchange a saved HTML widget runtime URL for a signed frame link",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["runtimeUrl"],
              properties: { runtimeUrl: { type: "string", minLength: 1 } },
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        200: {
          description: "Signed widget frame link",
          content: { "application/json": { schema: resolver(widgetLinkResponseSchema) } },
        },
        ...routeErrors(401, 404),
      },
    }),
    async (c) => {
      const body = widgetLinkBodySchema.safeParse(await c.req.json().catch(() => undefined))
      if (!body.success) return c.body(null, 404)
      const input = parseRuntimeUrl(body.data.runtimeUrl, c.req.url)
      if (!input) return c.body(null, 404)
      try {
        const context = runtimeDirectoryContext(c.req.raw, input.directory)
        if (!context.ok) return c.body(null, 404)
        const current = await presentHtmlWidgetObject({
          action: "present_object",
          directory: context.value.directory,
          objectID: input.objectID,
        })
        const versionToken = current.inlineData.sourceVersion
        if (!versionToken) return c.body(null, 404)
        const currentInput = { ...input, versionToken }
        const runtime = await resolveRuntimeFile(c.req.raw, currentInput)
        if (!runtime.ok || !runtime.value.immutable) {
          return c.body(null, 404)
        }
        const pass = widgetFramePassSigner.mint(currentInput)
        const assetPath = input.assetPath.split("/").map(encodeURIComponent).join("/")
        c.header("cache-control", "no-store")
        return c.json({ url: `/api/frame/widget/${pass}/${assetPath}` })
      } catch {
        return c.body(null, 404)
      }
    },
  )

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
          mapError: mapRouteError,
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
          const runtime = await resolveRuntimeFile(c.req.raw, {
            directory: decodeHtmlWidgetRuntimeDirectoryToken(params.directoryToken),
            objectID: params.objectID,
            assetPath: params.assetPath,
            versionToken: params.versionToken,
          })
          if (!runtime.ok) return runtime.response
          return runtimeFileResponse(runtime.value)
        },
        mapError: mapRouteError,
      }),
  )
