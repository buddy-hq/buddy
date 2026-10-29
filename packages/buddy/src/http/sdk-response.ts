import type { Context } from "hono"
import { parseTJsonObject, parseTString, type TJsonValue } from "./parse"
import { routeErrorBody, routeErrorResponse } from "./route-errors"
import { normalizeErrorResponse } from "./error-normalization"

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

export async function sdkErrorResponse<TData>(
  result: SdkResult<TData>,
  options?: { forceBusyAs409?: boolean },
): Promise<Response> {
  const originalStatus = result.response?.status ?? 400
  const message = extractSdkErrorMessage(result.error) ?? "Request failed"
  const busy = options?.forceBusyAs409 && /busy/i.test(message)
  const status = busy ? 409 : originalStatus
  const payload = parseTJsonObject(result.error)
  const code = parseTString(payload?.code)
  if (status === 500 && code === undefined) {
    const response = await routeErrorResponse(new Error("SDK request failed", { cause: result.error }))
    return new Response(response.body, { status, headers: response.headers })
  }
  const body = routeErrorBody(status, busy ? "Session is already running" : message, code)
  const errorID = parseTString(payload?.errorID)
  const details = parseTJsonObject(payload?.details)
  if (errorID !== undefined) body.errorID = errorID
  if (details !== undefined) body.details = details
  return Response.json(body, { status })
}

export async function respondWithSdkResult<T>(
  c: Context,
  result: SdkResult<T>,
  options?: { forceBusyAs409?: boolean },
): Promise<Response> {
  if (result.error !== undefined) {
    return sdkErrorResponse(result, options)
  }

  return c.json(result.data ?? null)
}

export async function respondWithStreamSdkResult<TData>(
  c: Context,
  result: SdkResult<TData>,
  options?: { forceBusyAs409?: boolean },
): Promise<Response> {
  if (result.error !== undefined) {
    return sdkErrorResponse(result, options)
  }

  if (!result.response) {
    return routeErrorResponse(new Error("SDK stream response is missing"))
  }

  return new Response(result.response.body, {
    status: result.response.status,
    statusText: result.response.statusText,
    headers: result.response.headers,
  })
}

export async function runSdkRoute(_c: Context, task: () => Promise<Response>): Promise<Response> {
  try {
    return await normalizeErrorResponse(await task())
  } catch (error) {
    return routeErrorResponse(error)
  }
}
