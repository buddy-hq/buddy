import { Hono } from "hono"
import { registerAuthRoutes } from "./route-handlers.js"

export const AuthRoutes = (): Hono => registerAuthRoutes(new Hono())
