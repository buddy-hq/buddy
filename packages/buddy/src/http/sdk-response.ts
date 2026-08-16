import type { Context } from "hono"
import { parseTJsonObject, parseTString, type TJsonValue } from "./parse"

type TSdkErrorPayloadData = {
  message?: string
  name?: string
}

type TSdkErrorPayload = {
  error?: string
  message?: string
  name?: string
  data?: TSdkErrorPayloadData
}

export type SdkResult<T> = {
  data?: T
  error?: TJsonValue
  response?: Response
}

function parseTSdkErrorPayloadData<TValue>(value: TValue): TSdkErrorPayloadData | undefined {
  const record = parseTJsonObject(value)
  if (record === undefined) return undefined
  const message = parseTString(record.message)
  const name = parseTString(record.name)
  return Object.assign(
    {},
    message !== undefined ? { message } : undefined,
    name !== undefined ? { name } : undefined,
  )
}

function parseTSdkErrorPayload<TValue>(value: TValue): TSdkErrorPayload | undefined {
  const record = parseTJsonObject(value)
  if (record === undefined) return undefined
  const error = parseTString(record.error)
  const message = parseTString(record.message)
  const name = parseTString(record.name)
  const data = parseTSdkErrorPayloadData(record.data)
  return Object.assign(
    {},
    error !== undefined ? { error } : undefined,
    message !== undefined ? { message } : undefined,
    name !== undefined ? { name } : undefined,
    data !== undefined ? { data } : undefined,
  )
}

export function extractSdkErrorMessage<TError>(error: TError): string | undefined {
  const text = parseTString(error)
  if (text !== undefined && text.trim().length > 0) {
    return text
  }

  const data = parseTSdkErrorPayload(error)
  if (data === undefined) return undefined

  if (data.error !== undefined) return data.error
  if (data.message !== undefined) return data.message
  if (data.data?.message !== undefined) return data.data.message
  if (data.name !== undefined && data.data?.name !== undefined) {
    return `${data.name}: ${data.data.name}`
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
