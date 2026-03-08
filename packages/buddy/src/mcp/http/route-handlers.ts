import type { Hono } from "hono"
import { withConfigSync } from "../../http/route-helpers.js"
import { registerProxyEndpoints } from "../../http/proxy-routes.js"
import { mcpProxyDefinitions } from "./route-definitions.js"

async function syncBeforeMcpProxy(c: { req: { raw: Request } }): Promise<Response | undefined> {
  const syncResult = await withConfigSync(c.req.raw, {
    operation: "MCP request",
  })
  if (!syncResult.ok) return syncResult.response
}

export function registerMcpRoutes(app: Hono): Hono {
  return registerProxyEndpoints(
    app,
    mcpProxyDefinitions.map((definition) => ({
      ...definition,
      beforeProxy: syncBeforeMcpProxy,
    })),
  )
}
