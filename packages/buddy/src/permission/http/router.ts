import { Hono } from "hono"
import { registerPermissionRoutes } from "./route-handlers.js"

export const PermissionRoutes = (): Hono => registerPermissionRoutes(new Hono())
