import type { Context } from "hono"
import { normalizeErrorResponse } from "./error-normalization"
import { ensureAllowedDirectory } from "./directory"
import { prepareProxyBody } from "./proxy/body"
import { fetchOpenCode } from "./proxy/fetch"
import type { ProxyToOpenCodeInput } from "./proxy/types"

function buildProxyQuery(url: URL, directory: string): string {
  const proxyParams = new URLSearchParams(url.searchParams)
  if (proxyParams.has("directory")) {
    proxyParams.set("directory", directory)
  }

  const query = proxyParams.toString()
  return query ? `?${query}` : ""
}

async function proxyToOpenCode(c: Context, input: ProxyToOpenCodeInput): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c)
  if (!directoryResult.ok) return directoryResult.response

  const prepared = await prepareProxyBody(c, input)
  if (!prepared.ok) return prepared.response

  const sourceURL = new URL(c.req.url)
  const response = await fetchOpenCode({
    directory: directoryResult.directory,
    method: prepared.method,
    path: input.targetPath,
    query: buildProxyQuery(sourceURL, directoryResult.directory),
    headers: prepared.headers,
    body: prepared.body,
    registerPedagogyTools: prepared.registrationFlags.registerPedagogyTools,
    registerCurriculumTools: prepared.registrationFlags.registerCurriculumTools,
    registerFigureTools: prepared.registrationFlags.registerFigureTools,
    registerFreeformFigureTools: prepared.registrationFlags.registerFreeformFigureTools,
    registerMermaidTools: prepared.registrationFlags.registerMermaidTools,
    registerGoalTools: prepared.registrationFlags.registerGoalTools,
    registerLearnerTools: prepared.registrationFlags.registerLearnerTools,
    registerTeachingTools: prepared.registrationFlags.registerTeachingTools,
    registerMathTools: prepared.registrationFlags.registerMathTools,
  })

  return normalizeErrorResponse(response, input.forceBusyAs409)
}

export { fetchOpenCode, proxyToOpenCode }
export { prepareProxyBody }

export type { ProxyToOpenCodeInput } from "./proxy/types"
