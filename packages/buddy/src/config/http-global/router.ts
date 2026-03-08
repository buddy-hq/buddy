import { Hono } from "hono"
import {
  disposeGlobalHandler,
  getGlobalConfigHandler,
  patchGlobalConfigHandler,
} from "./route-handlers.js"
import {
  disposeGlobalRoute,
  getGlobalConfigRoute,
  patchGlobalConfigRoute,
} from "./route-definitions.js"

export const GlobalRoutes = (): Hono =>
  new Hono()
    .get("/config", getGlobalConfigRoute, getGlobalConfigHandler)
    .patch("/config", patchGlobalConfigRoute, patchGlobalConfigHandler)
    .post("/dispose", disposeGlobalRoute, disposeGlobalHandler)
