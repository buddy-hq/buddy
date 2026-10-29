import { isJsonContentType, safeReadJson } from "./http"
import { parseTBoolean, parseTJsonObject, parseTNumber, parseTString } from "./parse"
import { routeErrorBody, routeErrorResponse } from "./route-errors"

type TErrorPayloadData = {
  message?: string
  name?: string
}

type TErrorPayload = {
  error?: string
  message?: string
  name?: string
  data?: TErrorPayloadData
}

type TValidationIssue = {
  message: string
  path: readonly string[]
}

function parseTErrorPayloadData<TValue>(value: TValue): TErrorPayloadData | undefined {
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

function parseTErrorPayload<TValue>(value: TValue): TErrorPayload | undefined {
  const record = parseTJsonObject(value)
  if (record === undefined) return undefined
  const error = parseTString(record.error)
  const message = parseTString(record.message)
  const name = parseTString(record.name)
  const data = parseTErrorPayloadData(record.data)
  return Object.assign(
    {},
    error !== undefined ? { error } : undefined,
    message !== undefined ? { message } : undefined,
    name !== undefined ? { name } : undefined,
    data !== undefined ? { data } : undefined,
  )
}

function extractErrorMessage<TPayload>(payload: TPayload): string | undefined {
  const data = parseTErrorPayload(payload)
  if (data === undefined) return undefined

  if (data.error !== undefined) return data.error
  if (data.message !== undefined) return data.message
  if (data.data?.message !== undefined) return data.data.message
  if (data.name !== undefined && data.data?.name !== undefined) {
    return `${data.name}: ${data.data.name}`
  }
  return undefined
}

function parseTValidationPathSegment<TValue>(segment: TValue): string | undefined {
  const text = parseTString(segment)
  if (text !== undefined) return text
  const numeric = parseTNumber(segment)
  if (numeric !== undefined) return String(numeric)

  const record = parseTJsonObject(segment)
  if (record === undefined) return undefined
  const keyText = parseTString(record.key)
  if (keyText !== undefined) return keyText
  const keyNumeric = parseTNumber(record.key)
  if (keyNumeric !== undefined) return String(keyNumeric)
  return undefined
}

function parseTValidationIssue<TValue>(value: TValue): TValidationIssue | undefined {
  const record = parseTJsonObject(value)
  if (record === undefined) return undefined
  const message = parseTString(record.message)
  if (message === undefined) return undefined

  const path = Array.isArray(record.path)
    ? record.path
        .map(parseTValidationPathSegment)
        .filter((segment): segment is string => segment !== undefined && segment.length > 0)
    : []

  return { message, path }
}

function extractValidationErrorMessage<TPayload>(payload: TPayload): string | undefined {
  const record = parseTJsonObject(payload)
  if (record === undefined) return undefined
  if (parseTBoolean(record.success) !== false || !Array.isArray(record.error)) {
    return undefined
  }

  const firstIssue = parseTValidationIssue(record.error[0])
  if (firstIssue === undefined) return undefined

  return firstIssue.path.length > 0
    ? `${firstIssue.path.join(".")}: ${firstIssue.message}`
    : firstIssue.message
}

export async function normalizeErrorResponse(
  response: Response,
  forceBusyAs409 = false,
): Promise<Response> {
  if (response.status < 400) {
    return response
  }

  const payload = isJsonContentType(response.headers.get("content-type"))
    ? await safeReadJson(response, { clone: true })
    : undefined
  const record = parseTJsonObject(payload)
  const rawMessage = extractValidationErrorMessage(payload) ?? extractErrorMessage(payload)
    ?? ((await response.clone().text()).trim() || response.statusText || "Request failed")
  const message = response.status === 400 && rawMessage === "Malformed JSON in request body"
    ? "Invalid JSON body" : rawMessage

  const busy = /busy/i.test(message)
  const status = forceBusyAs409 && busy ? 409 : response.status
  const readableMessage = forceBusyAs409 && busy ? "Session is already running" : message
  const code = parseTString(record?.code)
  const body = code !== undefined
    ? { ...record, error: readableMessage, code }
    : status === 500
      ? await (await routeErrorResponse(new Error("Upstream route failed", { cause: payload ?? message }))).json()
      : routeErrorBody(status, readableMessage)
  const headers = new Headers(response.headers)
  headers.delete("content-length")
  headers.set("content-type", "application/json; charset=UTF-8")
  return new Response(JSON.stringify(body), { status, headers })
}
