import {
  configErrorMessage,
  isConfigValidationError,
  syncOpenCodeProjectConfig,
} from "../../config/compatibility.js"
import type { DirectoryRequestContext } from "../support/directory.js"
import { resolveDirectoryRequestContext } from "../support/directory.js"
import { parseJsonBody, parseOptionalJsonBody } from "./request-json.js"

type RouteSuccess<T> = {
  ok: true
  value: T
}

type RouteFailure = {
  ok: false
  response: Response
}

export type RouteResult<T> = RouteSuccess<T> | RouteFailure

export class RouteResponseError extends Error {
  constructor(readonly response: Response, message = "Route response error") {
    super(message)
    this.name = "RouteResponseError"
  }
}

export function withDirectoryContext(request: Request): RouteResult<DirectoryRequestContext> {
  const contextResult = resolveDirectoryRequestContext(request)
  if (!contextResult.ok) {
    return {
      ok: false,
      response: contextResult.response,
    }
  }

  return {
    ok: true,
    value: contextResult.context,
  }
}

export async function withJsonBody(
  request: Request,
  input?: {
    optional?: boolean
    fallbackBody?: unknown
  },
): Promise<RouteResult<unknown>> {
  if (input?.optional) {
    const parsed = await parseOptionalJsonBody(request, input.fallbackBody)
    if (!parsed.ok) {
      return {
        ok: false,
        response: parsed.response,
      }
    }
    return {
      ok: true,
      value: parsed.body,
    }
  }

  const parsed = await parseJsonBody(request)
  if (!parsed.ok) {
    return {
      ok: false,
      response: parsed.response,
    }
  }
  return {
    ok: true,
    value: parsed.body,
  }
}

export async function withConfigSync(
  request: Request,
  input: {
    operation: string
  },
): Promise<RouteResult<DirectoryRequestContext>> {
  const contextResult = withDirectoryContext(request)
  if (!contextResult.ok) return contextResult

  try {
    await syncOpenCodeProjectConfig(contextResult.value.directory)
  } catch (error) {
    if (isConfigValidationError(error)) {
      return {
        ok: false,
        response: Response.json({ error: configErrorMessage(error) }, { status: 400 }),
      }
    }
    throw new Error(
      `Failed to sync config before ${input.operation}: ${String(error instanceof Error ? error.message : error)}`,
      { cause: error },
    )
  }

  return contextResult
}

export function mapRouteError(error: unknown): Response | undefined {
  if (error instanceof RouteResponseError) {
    return error.response
  }
  return undefined
}
