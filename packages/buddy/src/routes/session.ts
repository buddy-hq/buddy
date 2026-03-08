import { Hono } from "hono"
import { registerSessionAbortRoutes } from "./session/abort-routes.js"
import { registerSessionCoreRoutes } from "./session/core-routes.js"
import { registerSessionInteractionRoutes } from "./session/interaction-routes.js"
import { registerSessionStateRoutes } from "./session/state-routes.js"

export const SessionRoutes = (): Hono => {
  const app = new Hono()
  registerSessionCoreRoutes(app)
  registerSessionStateRoutes(app)
  registerSessionInteractionRoutes(app)
  registerSessionAbortRoutes(app)
  return app
}
