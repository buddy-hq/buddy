import type { Hono } from "hono"
import { withConfigSync } from "../../http/route-helpers.js"
import type { ProxyEndpointSpec } from "../../http/proxy-routes.js"
import { registerProxyEndpoints } from "../../http/proxy-routes.js"
import { compatibilityProxyDefinitions } from "./route-definitions.js"

async function syncConfigBeforeCommands(c: { req: { raw: Request } }): Promise<Response | undefined> {
  const syncResult = await withConfigSync(c.req.raw, {
    operation: "listing commands",
  })
  if (!syncResult.ok) return syncResult.response
}

function withCompatibilityHandlers(): ProxyEndpointSpec[] {
  return compatibilityProxyDefinitions.map((definition) => {
    if (!definition.requiresConfigSync) return definition

    return {
      ...definition,
      beforeProxy: syncConfigBeforeCommands,
    }
  })
}

export function registerCompatibilityRoutes(app: Hono): Hono {
  return registerProxyEndpoints(app, withCompatibilityHandlers())
}
