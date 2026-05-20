import type { Context } from "hono"
import { ensureGlobalBootstrapWorkspaceDirectory } from "../project"
import { normalizeErrorResponse } from "./error-normalization"
import { ensureAllowedDirectory } from "./directory"
import { resolveOptionalDirectoryRequestContext } from "./directory"
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

function resolveProxyDirectory(c: Context, input: ProxyToOpenCodeInput) {
  switch (input.directoryMode ?? "required") {
    case "none":
      return {
        ok: true as const,
        requestURL: new URL(c.req.url),
        directory: undefined,
      }
    case "optional": {
      const result = resolveOptionalDirectoryRequestContext(c)
      if (!result.ok) return result
      return {
        ok: true as const,
        requestURL: result.context.requestURL,
        directory: result.context.directory,
      }
    }
    case "bootstrap": {
      const result = resolveOptionalDirectoryRequestContext(c)
      if (!result.ok) return result
      return {
        ok: true as const,
        requestURL: result.context.requestURL,
        directory: result.context.directory ?? ensureGlobalBootstrapWorkspaceDirectory(),
      }
    }
    case "required": {
      const result = ensureAllowedDirectory(c)
      if (!result.ok) return result
      return {
        ok: true as const,
        requestURL: result.requestURL,
        directory: result.directory,
      }
    }
  }
}

async function proxyToOpenCode(c: Context, input: ProxyToOpenCodeInput): Promise<Response> {
  const directoryResult = resolveProxyDirectory(c, input)
  if (!directoryResult.ok) return directoryResult.response

  const prepared = await prepareProxyBody(c, input)
  if (!prepared.ok) return prepared.response

  const response = await fetchOpenCode({
    directory: directoryResult.directory,
    method: prepared.method,
    path: input.targetPath,
    query: directoryResult.directory
      ? buildProxyQuery(directoryResult.requestURL, directoryResult.directory)
      : directoryResult.requestURL.search,
    headers: prepared.headers,
    body: prepared.body,
    toolRegistrations: prepared.registrationFlags,
  })

  return normalizeErrorResponse(response, input.forceBusyAs409)
}

export { fetchOpenCode, proxyToOpenCode }
export { prepareProxyBody }

export type { ProxyToOpenCodeInput } from "./proxy/types"
