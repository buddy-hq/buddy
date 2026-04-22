import type { Context } from "hono"
import {
  ensureAllowedDirectory,
  fetchOpenCode,
  normalizeErrorResponse,
  prepareProxyBody,
} from "../../http"
import { resolveLearningToolRegistrationFlags } from "../../learning/tools/tool-registration-policy"
import { SessionLookupError, SessionTransformValidationError } from "./errors"

export function mapSessionTransformError(
  c: { json: (body: unknown, status?: number) => Response },
  error: unknown,
): Response | undefined {
  if (error instanceof SessionLookupError) {
    return error.response
  }

  if (error instanceof SessionTransformValidationError) {
    return c.json({ error: error.message }, error.status)
  }

  return undefined
}

export async function runSessionTransformProxy(input: {
  c: Context
  targetPath: string
  onTransform: (body: Record<string, unknown>) => Promise<Record<string, unknown>>
  onAccepted?: () => Promise<void>
  rollbackState?: () => void
  beforeProxy?: () => Promise<void>
}): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(input.c)
  if (!directoryResult.ok) return directoryResult.response

  const prepared = await prepareProxyBody(input.c, {
    targetPath: input.targetPath,
    transformJsonBody: input.onTransform,
    forceBusyAs409: true,
    toolRegistrations: resolveLearningToolRegistrationFlags(),
  })
  if (!prepared.ok) return prepared.response

  await input.beforeProxy?.()

  const proxyParams = new URLSearchParams(directoryResult.requestURL.searchParams)
  if (proxyParams.has("directory")) {
    proxyParams.set("directory", directoryResult.directory)
  }
  const query = proxyParams.toString()

  const response = await fetchOpenCode({
    directory: directoryResult.directory,
    method: prepared.method,
    path: input.targetPath,
    query: query ? `?${query}` : "",
    headers: prepared.headers,
    body: prepared.body,
    toolRegistrations: prepared.registrationFlags,
  }).then((result) => normalizeErrorResponse(result, true))

  if (!response.ok) {
    input.rollbackState?.()
    return response
  }

  if (input.onAccepted) {
    await input.onAccepted().catch((error) => {
      console.warn("Failed to record learner evidence after accepted prompt:", error)
    })
  }

  return response
}
