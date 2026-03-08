import { Hono } from "hono"
import { registerMcpRoutes } from "./route-handlers.js"

export const McpRoutes = (): Hono => registerMcpRoutes(new Hono())
