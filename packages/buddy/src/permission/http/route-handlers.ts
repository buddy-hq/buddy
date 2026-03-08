import type { Hono } from "hono"
import { registerProxyEndpoints } from "../../http/proxy-routes.js"
import { permissionProxySpecs } from "./route-definitions.js"

export function registerPermissionRoutes(app: Hono): Hono {
  return registerProxyEndpoints(app, permissionProxySpecs)
}
