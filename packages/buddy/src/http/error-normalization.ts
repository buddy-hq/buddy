import { isJsonContentType, safeReadJson } from "./http"

type ErrorPayload = {
  error?: unknown
  message?: unknown
  data?: {
    message?: unknown
    name?: unknown
  }
  name?: unknown
}

type ValidationIssue = {
  message?: unknown
  path?: readonly unknown[]
}

type ValidationFailurePayload = {
  success?: unknown
  error?: unknown
}

function asErrorPayload(payload: unknown): ErrorPayload | undefined {
  // Intentional shallow assertion in asErrorPayload; extractErrorMessage validates field types.
  if (!payload || typeof payload !== "object") return undefined
  return payload as ErrorPayload
}

function extractErrorMessage(payload: unknown): string | undefined {
  const data = asErrorPayload(payload)
  if (!data) return undefined

  if (typeof data.error === "string") return data.error
  if (typeof data.message === "string") return data.message
  if (typeof data.data?.message === "string") return data.data.message
  if (typeof data.name === "string" && typeof data.data?.name === "string")
    return `${data.name}: ${data.data.name}`
  return undefined
}

function asValidationFailurePayload(payload: unknown): ValidationFailurePayload | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined
  }

  return payload as ValidationFailurePayload
}

function asValidationIssue(value: unknown): ValidationIssue | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }

  return value as ValidationIssue
}

function formatValidationPathSegment(segment: unknown): string | undefined {
  if (typeof segment === "string" || typeof segment === "number") {
    return String(segment)
  }

  if (!segment || typeof segment !== "object" || !("key" in segment)) {
    return undefined
  }

  const key = segment.key
  if (typeof key === "string" || typeof key === "number") {
    return String(key)
  }

  return undefined
}

function extractValidationErrorMessage(payload: unknown): string | undefined {
  const data = asValidationFailurePayload(payload)
  if (!data || data.success !== false || !Array.isArray(data.error)) {
    return undefined
  }

  const firstIssue = asValidationIssue(data.error[0])
  if (!firstIssue || typeof firstIssue.message !== "string") {
    return undefined
  }

  const path = Array.isArray(firstIssue.path)
    ? firstIssue.path.map(formatValidationPathSegment).filter((segment) => !!segment)
    : []

  return path.length > 0 ? `${path.join(".")}: ${firstIssue.message}` : firstIssue.message
}

export async function normalizeErrorResponse(
  response: Response,
  forceBusyAs409 = false,
): Promise<Response> {
  if (response.status < 400 || !isJsonContentType(response.headers.get("content-type"))) {
    return response
  }

  const payload = await safeReadJson(response, { clone: true })
  const message = extractErrorMessage(payload)
  if (!message) return response

  const busy = /busy/i.test(message)
  if (forceBusyAs409 && busy) {
    return Response.json({ error: "Session is already running" }, { status: 409 })
  }

  return Response.json({ error: message }, { status: response.status })
}

export async function normalizeValidationFailureResponse(response: Response): Promise<Response> {
  if (response.status !== 400 || !isJsonContentType(response.headers.get("content-type"))) {
    return response
  }

  const payload = await safeReadJson(response, { clone: true })
  const message = extractValidationErrorMessage(payload)
  if (!message) {
    return response
  }

  const headers = new Headers(response.headers)
  headers.set("content-type", "application/json; charset=UTF-8")

  return new Response(JSON.stringify({ error: message }), {
    status: response.status,
    headers,
  })
}
