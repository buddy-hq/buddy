import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import type { DescribeRouteOptions } from "hono-openapi"
import z from "zod"
import { CHEMISTRY_SVG_MAX_INPUT_BYTES } from "../chemistry/svg-sanitize"
import { directoryQuerySchema, routeErrors, withDirectoryRoute } from "../http"
import { readBoundedRequestBody, replayRequestBody } from "../http/bounded-request-body"
import { browserSvgRenderRequests } from "../learning/features/svg-rendering/service/browser-render-requests"
import {
  BrowserSvgRenderCompletionResponseSchema,
  BrowserSvgRenderCompletionSchema,
  BrowserSvgRenderRequestSchema,
  SVG_RENDER_MAX_ERROR_CHARACTERS,
  SVG_RENDER_MAX_WARNING_CHARACTERS,
  SVG_RENDER_MAX_WARNINGS,
  SVG_SOURCE_HASH_PATTERN,
} from "../learning/features/svg-rendering/service/contracts"

const JSON_STRING_EXPANSION_FACTOR = 6
const JSON_FIXED_ENVELOPE_MAX_BYTES = 4 * 1024
const JSON_COMPLETION_METADATA_MAX_CHARACTERS = Math.max(
  SVG_RENDER_MAX_WARNINGS * SVG_RENDER_MAX_WARNING_CHARACTERS,
  SVG_RENDER_MAX_ERROR_CHARACTERS,
)
const JSON_ENVELOPE_MAX_BYTES =
  JSON_COMPLETION_METADATA_MAX_CHARACTERS * JSON_STRING_EXPANSION_FACTOR +
  JSON_FIXED_ENVELOPE_MAX_BYTES
const BROWSER_SVG_RENDER_COMPLETION_MAX_REQUEST_BODY_BYTES =
  CHEMISTRY_SVG_MAX_INPUT_BYTES * JSON_STRING_EXPANSION_FACTOR + JSON_ENVELOPE_MAX_BYTES

type OpenApiRequestBodyObject = Extract<
  NonNullable<DescribeRouteOptions["requestBody"]>,
  { content: unknown }
>
type OpenApiRequestBodySchema = NonNullable<OpenApiRequestBodyObject["content"][string]["schema"]>

const sourceHashOpenApiSchema = {
  type: "string" as const,
  pattern: SVG_SOURCE_HASH_PATTERN.source,
}

const browserSvgRenderCompletionOpenApiSchema: OpenApiRequestBodySchema = {
  oneOf: [
    {
      type: "object",
      required: ["outcome", "sourceHash", "svg", "warnings"],
      additionalProperties: false,
      properties: {
        outcome: { type: "string", enum: ["rendered"] },
        sourceHash: sourceHashOpenApiSchema,
        svg: { type: "string", minLength: 1 },
        warnings: {
          type: "array",
          maxItems: SVG_RENDER_MAX_WARNINGS,
          items: {
            type: "string",
            minLength: 1,
            maxLength: SVG_RENDER_MAX_WARNING_CHARACTERS,
          },
        },
      },
    },
    {
      type: "object",
      required: ["outcome", "sourceHash", "error"],
      additionalProperties: false,
      properties: {
        outcome: { type: "string", enum: ["failed"] },
        sourceHash: sourceHashOpenApiSchema,
        error: {
          type: "string",
          minLength: 1,
          maxLength: SVG_RENDER_MAX_ERROR_CHARACTERS,
        },
      },
    },
  ],
}

const browserRenderRequestParamSchema = z
  .object({
    requestID: z.string().min(1),
  })
  .strict()

const svgRenderingErrorSchema = z
  .object({
    error: z.string().min(1),
  })
  .strict()

function invalidRequest(message: string): { error: string } {
  return { error: message }
}

export const SvgRenderingRoutes = new Hono()
  .get(
    "/browser-requests",
    describeRoute({
      operationId: "svgRendering.listBrowserRenderRequests",
      summary: "List pending browser-owned SVG render requests",
      responses: {
        200: {
          description: "Pending browser SVG render requests",
          content: {
            "application/json": {
              schema: resolver(z.array(BrowserSvgRenderRequestSchema)),
            },
          },
        },
        400: {
          description: "Invalid browser SVG render request query",
          content: {
            "application/json": {
              schema: resolver(svgRenderingErrorSchema),
            },
          },
        },
        ...routeErrors(403, 500),
      },
    }),
    validator("query", directoryQuerySchema, (result, c) => {
      if (result.success) return
      return c.json(invalidRequest("Invalid SVG render request query."), 400)
    }),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        c.json(
          z
            .array(BrowserSvgRenderRequestSchema)
            .parse(browserSvgRenderRequests.listPending(context.directory)),
        ),
      ),
  )
  .post(
    "/browser-requests/:requestID/complete",
    describeRoute({
      operationId: "svgRendering.completeBrowserRender",
      summary: "Complete a browser-owned SVG render request",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: browserSvgRenderCompletionOpenApiSchema,
          },
        },
      },
      responses: {
        200: {
          description: "Browser SVG render completion status",
          content: {
            "application/json": {
              schema: resolver(BrowserSvgRenderCompletionResponseSchema),
            },
          },
        },
        400: {
          description: "Invalid browser SVG render completion",
          content: {
            "application/json": {
              schema: resolver(svgRenderingErrorSchema),
            },
          },
        },
        413: {
          description: "Browser SVG render completion exceeds the request limit",
          content: {
            "application/json": {
              schema: resolver(svgRenderingErrorSchema),
            },
          },
        },
        ...routeErrors(403, 500),
      },
    }),
    validator("param", browserRenderRequestParamSchema, (result, c) => {
      if (result.success) return
      return c.json(invalidRequest("Invalid SVG render request id."), 400)
    }),
    validator("query", directoryQuerySchema, (result, c) => {
      if (result.success) return
      return c.json(invalidRequest("Invalid SVG render request query."), 400)
    }),
    async (c, next) => {
      const result = await readBoundedRequestBody(
        c.req.raw,
        BROWSER_SVG_RENDER_COMPLETION_MAX_REQUEST_BODY_BYTES,
      )
      if (result.status === "too_large") {
        return c.json(invalidRequest("SVG render completion exceeds the request size limit."), 413)
      }

      try {
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(result.body))
      } catch {
        return c.json(invalidRequest("Invalid JSON body."), 400)
      }
      c.req.raw = replayRequestBody(c.req.raw, result.body)
      await next()
    },
    validator("json", BrowserSvgRenderCompletionSchema, (result, c) => {
      if (result.success) return
      return c.json(invalidRequest("Invalid SVG render completion body."), 400)
    }),
    async (c) =>
      withDirectoryRoute(c, async (context) => {
        const params = c.req.valid("param")
        const completion = c.req.valid("json")
        return c.json(
          BrowserSvgRenderCompletionResponseSchema.parse(
            browserSvgRenderRequests.complete({
              directory: context.directory,
              requestID: params.requestID,
              completion,
            }),
          ),
        )
      }),
  )
