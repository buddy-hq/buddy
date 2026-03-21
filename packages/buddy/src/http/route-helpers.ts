import { configErrorMessage, isConfigValidationError, syncOpenCodeProjectConfig } from "@buddy/backend/config/runtime"
import type { Context } from "hono"
import type { DirectoryRequestContext, DirectoryRequestSource } from "./directory"
import { resolveDirectoryRequestContext } from "./directory"

type RouteSuccess<T> = {
  ok: true
  value: T
}

type RouteFailure = {
  ok: false
  response: Response
}

export type RouteResult<T> = RouteSuccess<T> | RouteFailure

export function withDirectoryContext(source: DirectoryRequestSource): RouteResult<DirectoryRequestContext> {
  const contextResult = resolveDirectoryRequestContext(source)
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

export async function withConfigSync(
  source: DirectoryRequestSource,
  input: {
    operation: string
  },
): Promise<RouteResult<DirectoryRequestContext>> {
  const contextResult = withDirectoryContext(source)
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

export async function withDirectoryRoute(
  c: Context,
  handler: (context: DirectoryRequestContext) => Promise<Response>,
): Promise<Response> {
  const contextResult = withDirectoryContext(c)
  if (!contextResult.ok) return contextResult.response
  return handler(contextResult.value)
}

export async function withConfigSyncRoute(
  c: Context,
  input: {
    operation: string
    handler: (context: DirectoryRequestContext) => Promise<Response>
  },
): Promise<Response> {
  const syncResult = await withConfigSync(c, {
    operation: input.operation,
  })
  if (!syncResult.ok) return syncResult.response
  return input.handler(syncResult.value)
}

export function createConfigSyncMiddleware(operation: string) {
  return async (c: Context, next: () => Promise<void>) => {
    const syncResult = await withConfigSync(c, {
      operation,
    })
    if (!syncResult.ok) return syncResult.response
    await next()
  }
}

export async function runRouteTask(input: {
  task: () => Promise<Response>
  mapError?: (error: unknown) => Response | undefined
}): Promise<Response> {
  try {
    return await input.task()
  } catch (error) {
    const response = input.mapError?.(error)
    if (response) return response
    throw error
  }
}
