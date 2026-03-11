import type { Context } from "hono"
import { isJsonContentType, parseJsonText } from "../http"
import {
  resolveBodyRegistrationFlags,
  resolveInitialRegistrationFlags,
} from "./registration"
import type { ProxyRegistrationFlags, ProxyToOpenCodeInput } from "./types"

type PrepareProxyBodyResult =
  | {
      ok: true
      body: BodyInit | undefined
      registrationFlags: ProxyRegistrationFlags
      method: string
      headers: Headers
    }
  | {
      ok: false
      response: Response
    }

function validateJsonObjectBody(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }
  return value as Record<string, unknown>
}

function invalidJsonObjectResponse(): PrepareProxyBodyResult {
  return {
    ok: false,
    response: Response.json({ error: "Invalid JSON body" }, { status: 400 }),
  }
}

type JsonValidatorRequest = {
  valid: (target: "json") => unknown
}

function validatedJsonBody(c: Context): unknown {
  const request = c.req as unknown as JsonValidatorRequest
  return request.valid("json")
}

async function parseRawJsonObject(c: Context): Promise<PrepareProxyBodyResult | Record<string, unknown>> {
  const raw = await c.req.raw.text()
  const parsedResult = raw.trim().length > 0 ? parseJsonText(raw) : { ok: true as const, value: {} as unknown }
  if (!parsedResult.ok) {
    return invalidJsonObjectResponse()
  }

  const parsed = validateJsonObjectBody(parsedResult.value)
  if (!parsed) {
    return invalidJsonObjectResponse()
  }
  return parsed
}

function isProxyFailureResult(value: PrepareProxyBodyResult | Record<string, unknown>): value is PrepareProxyBodyResult {
  return "ok" in value && value.ok === false
}

function serializeValidatedJsonBody(c: Context): string | undefined {
  const validated = validatedJsonBody(c)
  if (validated === undefined) return undefined
  return JSON.stringify(validated)
}

async function prepareProxyBody(
  c: Context,
  input: ProxyToOpenCodeInput,
): Promise<PrepareProxyBodyResult> {
  const method = c.req.method.toUpperCase()
  const headers = new Headers(c.req.raw.headers)
  let body: BodyInit | undefined
  let registrationFlags = resolveInitialRegistrationFlags(input)

  if (method !== "GET" && method !== "HEAD") {
    if (input.transformJsonBody) {
      const contentType = headers.get("content-type")
      if (isJsonContentType(contentType)) {
        let parsedBody = validateJsonObjectBody(validatedJsonBody(c))
        if (!parsedBody) {
          const parsedRawResult = await parseRawJsonObject(c)
          if (isProxyFailureResult(parsedRawResult)) return parsedRawResult
          parsedBody = parsedRawResult
        }

        const transformed = await input.transformJsonBody(parsedBody)
        registrationFlags = resolveBodyRegistrationFlags(transformed, input)
        body = JSON.stringify(transformed)
      } else {
        try {
          body = await c.req.raw.arrayBuffer()
        } catch (error) {
          const validatedJson = serializeValidatedJsonBody(c)
          if (validatedJson !== undefined) {
            body = validatedJson
          } else {
            throw error
          }
        }
      }
    } else {
      const validatedJson = isJsonContentType(headers.get("content-type")) ? serializeValidatedJsonBody(c) : undefined
      if (validatedJson !== undefined) {
        body = validatedJson
      } else {
        const buffer = await c.req.raw.arrayBuffer()
        body = buffer.byteLength > 0 ? buffer : undefined
      }
    }
  }

  return {
    ok: true,
    body,
    registrationFlags,
    method,
    headers,
  }
}

export { prepareProxyBody }
