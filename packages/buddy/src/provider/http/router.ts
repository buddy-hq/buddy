import { Hono } from "hono"
import { registerProviderRoutes } from "./route-handlers.js"

export const ProviderRoutes = (): Hono => registerProviderRoutes(new Hono())
