import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { mapChemistryRouteError } from "../chemistry/errors"
import { ChemfigRenderRecordSchema, renderChemfig } from "../chemistry/chemfig-renderer"
import {
  CHEMFIG_MAX_REQUEST_BODY_BYTES,
  ChemistryRenderErrorCodeSchema,
  ChemistrySourceSchema,
} from "../chemistry/types"
import { directoryQuerySchema, routeErrors, runRouteTask, withDirectoryRoute } from "../http"
import { readBoundedRequestBody, replayRequestBody } from "../http/bounded-request-body"

const nonEmptyString = z.string().trim().min(1)

const renderChemfigBodySchema = z
  .object({
    source: ChemistrySourceSchema,
  })
  .strict()

const chemistryTypedErrorSchema = z
  .object({
    error: nonEmptyString,
    code: ChemistryRenderErrorCodeSchema,
  })
  .strict()

function chemistryErrorResponse(description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: resolver(chemistryTypedErrorSchema),
      },
    },
  }
}

function chemistryValidationError(message: string): {
  error: string
  code: "invalid_source"
} {
  return {
    error: message,
    code: "invalid_source",
  }
}

function requestBodyTooLargeResponse(): {
  error: string
  code: "source_too_large"
} {
  return {
    error: `chemfig request body exceeds the ${CHEMFIG_MAX_REQUEST_BODY_BYTES}-byte limit.`,
    code: "source_too_large",
  }
}

export const ChemistryRoutes = new Hono().post(
  "/chemfig/render",
  describeRoute({
    operationId: "chemistry.renderChemfig",
    summary: "Compile chemfig source to a sanitized cached SVG",
    responses: {
      200: {
        description: "Rendered chemfig SVG record",
        content: {
          "application/json": {
            schema: resolver(ChemfigRenderRecordSchema),
          },
        },
      },
      400: chemistryErrorResponse("Invalid or unsafe chemfig source"),
      413: chemistryErrorResponse("chemfig source or output exceeds a size limit"),
      422: chemistryErrorResponse("chemfig compilation or SVG validation failed"),
      503: chemistryErrorResponse("chemfig renderer is unavailable or busy"),
      504: chemistryErrorResponse("chemfig rendering timed out"),
      ...routeErrors(403, 500),
    },
  }),
  validator("query", directoryQuerySchema, (result, c) => {
    if (result.success) return
    const message = result.error[0]?.message ?? "Invalid chemistry request query."
    return c.json(chemistryValidationError(message), 400)
  }),
  async (c, next) => {
    const result = await readBoundedRequestBody(c.req.raw, CHEMFIG_MAX_REQUEST_BODY_BYTES)
    if (result.status === "too_large") {
      return c.json(requestBodyTooLargeResponse(), 413)
    }

    try {
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(result.body))
    } catch {
      return c.json(chemistryValidationError("Invalid JSON body."), 400)
    }
    c.req.raw = replayRequestBody(c.req.raw, result.body)
    await next()
  },
  validator("json", renderChemfigBodySchema, (result, c) => {
    if (result.success) return
    const message = result.error[0]?.message ?? "Invalid chemfig request body."
    return c.json(chemistryValidationError(message), 400)
  }),
  async (c) =>
    withDirectoryRoute(c, async (context) =>
      runRouteTask({
        task: async () => {
          const body = c.req.valid("json")
          const record = await renderChemfig({
            directory: context.directory,
            source: body.source,
            signal: c.req.raw.signal,
          })
          return c.json(ChemfigRenderRecordSchema.parse(record))
        },
        mapError: mapChemistryRouteError,
      }),
    ),
)
