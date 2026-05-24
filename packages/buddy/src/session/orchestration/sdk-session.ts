import type { Context } from "hono"
import { isJsonContentType, parseJsonText } from "../../http/http"
import { invalidJsonResponse } from "../../http/request-json"
import { flattenPromptPartsForRuntime } from "../../learning/prompt/workspace-file-references"

type JsonValidatorRequest = {
  valid: (target: "json") => unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function validatedJsonBody(c: Context): unknown {
  const request = c.req as unknown as JsonValidatorRequest
  return request.valid("json")
}

function validateJsonObjectBody(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  return value
}

async function parseRawJsonObject(c: Context): Promise<Record<string, unknown> | Response> {
  const raw = await c.req.raw.text()
  const parsedResult =
    raw.trim().length > 0 ? parseJsonText(raw) : { ok: true as const, value: {} as unknown }
  if (!parsedResult.ok) {
    return invalidJsonResponse()
  }

  const parsed = validateJsonObjectBody(parsedResult.value)
  if (!parsed) {
    return invalidJsonResponse()
  }
  return parsed
}

export async function readValidatedJsonObject(c: Context): Promise<Record<string, unknown> | Response> {
  const contentType = c.req.header("content-type")
  if (!isJsonContentType(contentType)) {
    return invalidJsonResponse()
  }

  const validated = validateJsonObjectBody(validatedJsonBody(c))
  if (validated) {
    return validated
  }

  return parseRawJsonObject(c)
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
  const { sessionID: _sessionID, directory: _directory, workspace: _workspace, ...rest } = input.body
  return {
    sessionID: input.sessionID,
    directory: input.directory,
    ...rest,
  }
}
