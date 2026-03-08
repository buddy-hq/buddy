import { Hono } from "hono"
import {
  currentProjectHandler,
  listProjectsHandler,
  openProjectHandler,
  updateProjectHandler,
} from "./route-handlers.js"
import {
  currentProjectRoute,
  listProjectsRoute,
  openProjectRoute,
  updateProjectRoute,
} from "./route-definitions.js"

export const ProjectRoutes = (): Hono =>
  new Hono()
    .get("/", listProjectsRoute, listProjectsHandler)
    .post("/", openProjectRoute, openProjectHandler)
    .get("/current", currentProjectRoute, currentProjectHandler)
    .patch("/:projectID", updateProjectRoute, updateProjectHandler)
