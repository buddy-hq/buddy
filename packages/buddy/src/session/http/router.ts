import { Hono } from "hono"
import {
  abortSessionHandler,
  createSessionHandler,
  getRuntimeInspectorHandler,
  getSessionHandler,
  getTeachingStateHandler,
  listSessionMessagesHandler,
  listSessionsHandler,
  postSessionCommandHandler,
  postSessionPromptHandler,
  updateSessionHandler,
} from "./route-handlers.js"
import {
  abortSessionRoute,
  createSessionRoute,
  getRuntimeInspectorRoute,
  getSessionRoute,
  getTeachingStateRoute,
  listSessionMessagesRoute,
  listSessionsRoute,
  postSessionCommandRoute,
  postSessionPromptRoute,
  updateSessionRoute,
} from "./route-definitions.js"

export const SessionRoutes = (): Hono =>
  new Hono()
    .get("/", listSessionsRoute, listSessionsHandler)
    .post("/", createSessionRoute, createSessionHandler)
    .get("/:sessionID", getSessionRoute, getSessionHandler)
    .patch("/:sessionID", updateSessionRoute, updateSessionHandler)
    .get("/:sessionID/message", listSessionMessagesRoute, listSessionMessagesHandler)
    .post("/:sessionID/message", postSessionPromptRoute, postSessionPromptHandler)
    .post("/:sessionID/command", postSessionCommandRoute, postSessionCommandHandler)
    .get("/:sessionID/teaching-state", getTeachingStateRoute, getTeachingStateHandler)
    .get("/:sessionID/runtime-inspector", getRuntimeInspectorRoute, getRuntimeInspectorHandler)
    .post("/:sessionID/abort", abortSessionRoute, abortSessionHandler)
