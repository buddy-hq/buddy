import type { Context } from "hono"
import { parseTString, type TJsonValue } from "./parse"

export type SdkResult<T> = {
  data?: T
  error?: TJsonValue
  response?: Response
}

function readSdkStringField<TValue>(value: TValue, field: "error" | "message" | "name") {
  if (!(value instanceof Object)) return undefined
  if (field === "error") {
    if (!("error" in value)) return undefined
    return parseTString(value.error)
  }
  if (field === "message") {
    if (!("message" in value)) return undefined
    return parseTString(value.message)
  }
  if (!("name" in value)) return undefined
  return parseTString(value.name)
}

function readSdkErrorData<TValue>(value: TValue) {
  if (!(value instanceof Object) || !("data" in value)) return undefined
  const nested = value.data
  if (!(nested instanceof Object)) return undefined
  return nested
}

export function extractSdkErrorMessage<TError>(error: TError): string | undefined {
  const text = parseTString(error)
  if (text !== undefined && text.trim().length > 0) {
    return text
  }

  if (!(error instanceof Object)) return undefined

  const payloadError = readSdkStringField(error, "error")
  if (payloadError !== undefined) return payloadError
  const payloadMessage = readSdkStringField(error, "message")
  if (payloadMessage !== undefined) return payloadMessage
  const nested = readSdkErrorData(error)
  if (nested === undefined) return undefined
  const nestedMessage = readSdkStringField(nested, "message")
  if (nestedMessage !== undefined) return nestedMessage
  const payloadName = readSdkStringField(error, "name")
  const nestedName = readSdkStringField(nested, "name")
  if (payloadName !== undefined && nestedName !== undefined) {
    return `${payloadName}: ${nestedName}`
  }
  return undefined
}

export function openCodeDirectoryParams(directory?: string) {
  return directory ? { directory } : {}
}

export function sdkErrorResponse<TData>(
  result: SdkResult<TData>,
  options?: { forceBusyAs409?: boolean },
): Response {
  const status = result.response?.status ?? 400
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

export function respondWithStreamSdkResult<TData>(
  c: Context,
  result: SdkResult<TData>,
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
