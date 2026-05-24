import type { Context } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"

type ErrorPayload = {
  error?: unknown
  message?: unknown
  data?: {
    message?: unknown
    name?: unknown
  }
  name?: unknown
}

export type SdkResult<T> = {
  data?: T
  error?: unknown
  response?: Response
}

function asErrorPayload(payload: unknown): ErrorPayload | undefined {
  if (!payload || typeof payload !== "object") return undefined
  return payload as ErrorPayload
}

export function extractSdkErrorMessage(error: unknown): string | undefined {
  if (typeof error === "string" && error.trim().length > 0) {
    return error
  }

  const data = asErrorPayload(error)
  if (!data) return undefined

  if (typeof data.error === "string") return data.error
  if (typeof data.message === "string") return data.message
  if (typeof data.data?.message === "string") return data.data.message
  if (typeof data.name === "string" && typeof data.data?.name === "string") {
    return `${data.name}: ${data.data.name}`
  }
  return undefined
}

export function openCodeDirectoryParams(directory?: string) {
  return directory ? { directory } : {}
}

export function sdkErrorResponse(
  result: SdkResult<unknown>,
  options?: { forceBusyAs409?: boolean },
): Response {
  const status = (result.response?.status ?? 400) as ContentfulStatusCode
  const message = extractSdkErrorMessage(result.error) ?? "Request failed"
  if (options?.forceBusyAs409 && /busy/i.test(message)) {
    return Response.json({ error: "Session is already running" }, { status: 409 })
  }
  return Response.json({ error: message }, { status })
}

export function respondWithSdkResult<T>(
  c: Context,
  result: SdkResult<T>,
  options?: { forceBusyAs409?: boolean },
): Response {
  if (result.error !== undefined) {
    return sdkErrorResponse(result, options)
  }

  return c.json(result.data ?? null)
}

export function respondWithStreamSdkResult(
  c: Context,
  result: SdkResult<unknown>,
  options?: { forceBusyAs409?: boolean },
): Response {
  if (result.error !== undefined) {
    return sdkErrorResponse(result, options)
  }

  if (!result.response) {
    return c.json({ error: "Request failed" }, 500)
  }

  return new Response(result.response.body, {
    status: result.response.status,
    statusText: result.response.statusText,
    headers: result.response.headers,
  })
}

export async function runSdkRoute(c: Context, task: () => Promise<Response>): Promise<Response> {
  try {
    return await task()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return c.json({ error: message }, 500)
  }
}
