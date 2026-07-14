import type { Context } from "hono"
import { isJsonContentType } from "../../http/http"
import { invalidJsonResponse } from "../../http/request-json"
import { flattenPromptPartsForRuntime } from "../../learning/prompt/workspace-file-references"

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function validateJsonObjectBody(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  return value
}

async function parseJsonObject(c: Context): Promise<Record<string, unknown> | Response> {
  let value: unknown
  try {
    value = await c.req.json()
  } catch {
    return invalidJsonResponse()
  }
  return validateJsonObjectBody(value) ?? invalidJsonResponse()
}

export async function readValidatedJsonObject(
  c: Context,
): Promise<Record<string, unknown> | Response> {
  const contentType = c.req.header("content-type")
  if (!isJsonContentType(contentType)) {
    return invalidJsonResponse()
  }

  return parseJsonObject(c)
}

export function prepareRuntimePromptBody(body: Record<string, unknown>) {
  if (!Array.isArray(body.parts)) {
    return body
  }

  return {
    ...body,
    parts: flattenPromptPartsForRuntime(body.parts),
  }
}

export function prepareRuntimeCommandBody(body: Record<string, unknown>) {
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
  body: Record<string, unknown>
}) {
  const {
    sessionID: _sessionID,
    directory: _directory,
    workspace: _workspace,
    ...rest
  } = input.body
  return {
    sessionID: input.sessionID,
    directory: input.directory,
    ...rest,
  }
}
