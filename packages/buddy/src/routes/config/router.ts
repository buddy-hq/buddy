import { Hono } from "hono"
import {
  getProjectConfigHandler,
  listConfigAgentsHandler,
  listConfigPersonasHandler,
  listConfigProvidersHandler,
  patchProjectConfigHandler,
  putProjectMcpConfigHandler,
} from "./route-handlers.js"
import {
  getProjectConfigRoute,
  listConfigAgentsRoute,
  listConfigPersonasRoute,
  listConfigProvidersRoute,
  patchProjectConfigRoute,
  putProjectMcpConfigRoute,
} from "./route-definitions.js"

export const ConfigRoutes = (): Hono =>
  new Hono()
    .get("/personas", listConfigPersonasRoute, listConfigPersonasHandler)
    .get("/agents", listConfigAgentsRoute, listConfigAgentsHandler)
    .get("/providers", listConfigProvidersRoute, listConfigProvidersHandler)
    .get("/", getProjectConfigRoute, getProjectConfigHandler)
    .patch("/", patchProjectConfigRoute, patchProjectConfigHandler)
    .put("/mcp/:name", putProjectMcpConfigRoute, putProjectMcpConfigHandler)
