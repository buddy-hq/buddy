import type { Hono } from "hono"
import { registerProxyEndpoints } from "../../http/proxy-routes.js"
import { providerProxySpecs } from "./route-definitions.js"

export function registerProviderRoutes(app: Hono): Hono {
  return registerProxyEndpoints(app, providerProxySpecs)
}
