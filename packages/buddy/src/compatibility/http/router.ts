import { Hono } from "hono"
import { registerCompatibilityRoutes } from "./route-handlers.js"

export const CompatibilityRoutes = (): Hono => registerCompatibilityRoutes(new Hono())
