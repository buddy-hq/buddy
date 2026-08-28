import type { Context } from "hono"
import { isJsonContentType } from "../../http/http"
import { invalidJsonResponse } from "../../http/request-json"
import { extractSdkErrorMessage, type SdkResult } from "../../http/sdk-response"
import { flattenPromptPartsForRuntime } from "../../learning/prompt/workspace-file-references"
import { parseTSessionJsonObject, type TSessionJsonObject } from "./parse-values"

async function parseRequestJsonObject(c: Context): Promise<TSessionJsonObject | Response> {
  try {
    const value = await c.req.json()
    return parseTSessionJsonObject(value) ?? invalidJsonResponse()
  } catch {
    return invalidJsonResponse()
  }
}

export async function readValidatedJsonObject(c: Context): Promise<TSessionJsonObject | Response> {
  const contentType = c.req.header("content-type")
  if (!isJsonContentType(contentType)) {
    return invalidJsonResponse()
  }

  return parseRequestJsonObject(c)
}

export function toSessionSdkResult<TData, TError>(result: {
  data?: TData
  error?: TError
  response?: Response
}): SdkResult<TData> {
  return {
    data: result.data,
    error:
      result.error === undefined
        ? undefined
        : (extractSdkErrorMessage(result.error) ?? "Request failed"),
    response: result.response,
  }
}

export function prepareRuntimePromptBody(body: TSessionJsonObject): TSessionJsonObject {
  if (!Array.isArray(body.parts)) {
    return body
  }

  return {
    ...body,
    parts: flattenPromptPartsForRuntime(body.parts),
  }
}

export function prepareRuntimeCommandBody(body: TSessionJsonObject): TSessionJsonObject {
  const withRuntimeParts = Array.isArray(body.parts)
    ? {
        ...body,
        parts: flattenPromptPartsForRuntime(body.parts),
      }
    : body

  if ("arguments" in withRuntimeParts) {
    return withRuntimeParts
  }

  return {
    ...withRuntimeParts,
    arguments: "",
  }
}

export function buildSessionSdkParameters(input: {
  sessionID: string
  directory: string
  body: TSessionJsonObject
}) {
  const rest: TSessionJsonObject = { ...input.body }
  delete rest.sessionID
  delete rest.directory
  delete rest.workspace
  return {
    sessionID: input.sessionID,
    directory: input.directory,
    ...rest,
  }
}
