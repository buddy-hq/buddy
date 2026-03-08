import { Hono } from "hono"
import type { Context } from "hono"
import { compatibilityRoute } from "../../openapi/compatibility-route.js"
import type { ProxyToOpenCodeInput } from "../support/proxy.js"
import { proxyToOpenCode } from "../support/proxy.js"

type ProxyMethod = "get" | "post" | "put" | "patch" | "delete"

type ProxyInputResolver =
  | Omit<ProxyToOpenCodeInput, "targetPath">
  | ((context: Context) => Omit<ProxyToOpenCodeInput, "targetPath">)

type ProxyPreflight = (context: Context) => Promise<Response | undefined> | Response | undefined
type ProxyRouteSpec = Parameters<typeof compatibilityRoute>[0]

export type ProxyEndpointSpec = {
  method: ProxyMethod
  path: string
  route: ProxyRouteSpec
  targetPath: string | ((context: Context) => string)
  beforeProxy?: ProxyPreflight | ProxyPreflight[]
  proxyInput?: ProxyInputResolver
}

function resolveProxyInput(
  context: Context,
  proxyInput: ProxyInputResolver | undefined,
): Omit<ProxyToOpenCodeInput, "targetPath"> {
  if (!proxyInput) return {}
  if (typeof proxyInput === "function") {
    return proxyInput(context)
  }
  return proxyInput
}

export function registerProxyEndpoints(app: Hono, specs: ProxyEndpointSpec[]): Hono {
  for (const spec of specs) {
    app[spec.method](
      spec.path,
      compatibilityRoute(spec.route),
      async (c) => {
        const preflights = spec.beforeProxy ? (Array.isArray(spec.beforeProxy) ? spec.beforeProxy : [spec.beforeProxy]) : []
        for (const beforeProxy of preflights) {
          const preflightResult = await beforeProxy(c)
          if (preflightResult) return preflightResult
        }

        const targetPath = typeof spec.targetPath === "function" ? spec.targetPath(c) : spec.targetPath
        return proxyToOpenCode(c, {
          ...resolveProxyInput(c, spec.proxyInput),
          targetPath,
        })
      },
    )
  }

  return app
}
