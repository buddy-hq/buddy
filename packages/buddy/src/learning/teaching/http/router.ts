import { Hono } from "hono"
import {
  activateFileHandler,
  addFileHandler,
  checkpointWorkspaceHandler,
  provisionWorkspaceHandler,
  readWorkspaceHandler,
  restoreWorkspaceHandler,
  saveWorkspaceHandler,
} from "./route-handlers.js"
import { teachingRoutes } from "./route-definitions.js"

export const TeachingRoutes = (): Hono =>
  new Hono()
    .post(teachingRoutes.provisionWorkspace.path, provisionWorkspaceHandler)
    .get(teachingRoutes.readWorkspace.path, readWorkspaceHandler)
    .put(teachingRoutes.saveWorkspace.path, saveWorkspaceHandler)
    .post(teachingRoutes.addFile.path, addFileHandler)
    .post(teachingRoutes.activateFile.path, activateFileHandler)
    .post(teachingRoutes.checkpointWorkspace.path, checkpointWorkspaceHandler)
    .post(teachingRoutes.restoreWorkspace.path, restoreWorkspaceHandler)
