import type { Hono } from "hono"
import { registerProxyEndpoints } from "../../http/proxy-routes.js"
import { authProxySpecs } from "./route-definitions.js"

export function registerAuthRoutes(app: Hono): Hono {
  return registerProxyEndpoints(app, authProxySpecs)
}
