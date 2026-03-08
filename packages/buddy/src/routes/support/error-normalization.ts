import { isJsonContentType, safeReadJson } from "../shared/http.js"

type ErrorPayload = {
  error?: unknown
  message?: unknown
  data?: {
    message?: unknown
    name?: unknown
  }
  name?: unknown
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
  if (typeof data.name === "string" && typeof data.data?.name === "string") return `${data.name}: ${data.data.name}`
  return undefined
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
