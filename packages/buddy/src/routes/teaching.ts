import { Hono } from "hono"
import {
  TeachingWorkspaceActivateFileRequestSchema,
  TeachingWorkspaceCreateFileRequestSchema,
  TeachingWorkspaceUpdateRequestSchema,
} from "../learning/teaching/types.js"
import {
  activateTeachingWorkspaceFile,
  addTeachingWorkspaceFile,
  checkpointTeachingWorkspace,
  provisionTeachingWorkspace,
  readTeachingWorkspace,
  restoreTeachingWorkspace,
  saveTeachingWorkspace,
  TeachingProvisionRequestSchema,
} from "./handlers/teaching.js"
import { zodIssuesResponse } from "./shared/request-json.js"
import { withDirectoryContext, withJsonBody } from "./shared/route-helpers.js"

export const TeachingRoutes = () =>
  new Hono()
    .post("/session/:sessionID/workspace", async (c) => {
      const contextResult = withDirectoryContext(c.req.raw)
      if (!contextResult.ok) return contextResult.response

      const bodyResult = await withJsonBody(c.req.raw, {
        optional: true,
        fallbackBody: {},
      })
      if (!bodyResult.ok) return bodyResult.response

      const parsed = TeachingProvisionRequestSchema.safeParse(bodyResult.value)
      if (!parsed.success) {
        return zodIssuesResponse(parsed.error)
      }

      const provisionResult = await provisionTeachingWorkspace({
        directory: contextResult.value.directory,
        sessionID: c.req.param("sessionID"),
        payload: parsed.data,
      })
      if (!provisionResult.ok) return provisionResult.response
      return c.json(provisionResult.value)
    })
    .get("/session/:sessionID/workspace", async (c) => {
      const contextResult = withDirectoryContext(c.req.raw)
      if (!contextResult.ok) return contextResult.response

      const workspaceResult = await readTeachingWorkspace({
        directory: contextResult.value.directory,
        sessionID: c.req.param("sessionID"),
        optional: c.req.query("optional") === "1",
      })
      if (!workspaceResult.ok) return workspaceResult.response
      return c.json(workspaceResult.value)
    })
    .put("/session/:sessionID/workspace", async (c) => {
      const contextResult = withDirectoryContext(c.req.raw)
      if (!contextResult.ok) return contextResult.response

      const bodyResult = await withJsonBody(c.req.raw)
      if (!bodyResult.ok) return bodyResult.response

      const parsed = TeachingWorkspaceUpdateRequestSchema.safeParse(bodyResult.value)
      if (!parsed.success) {
        return zodIssuesResponse(parsed.error)
      }

      const saveResult = await saveTeachingWorkspace({
        directory: contextResult.value.directory,
        sessionID: c.req.param("sessionID"),
        payload: parsed.data,
      })
      if (!saveResult.ok) return saveResult.response
      return c.json(saveResult.value)
    })
    .post("/session/:sessionID/file", async (c) => {
      const contextResult = withDirectoryContext(c.req.raw)
      if (!contextResult.ok) return contextResult.response

      const bodyResult = await withJsonBody(c.req.raw)
      if (!bodyResult.ok) return bodyResult.response

      const parsed = TeachingWorkspaceCreateFileRequestSchema.safeParse(bodyResult.value)
      if (!parsed.success) {
        return zodIssuesResponse(parsed.error)
      }

      const addFileResult = await addTeachingWorkspaceFile({
        directory: contextResult.value.directory,
        sessionID: c.req.param("sessionID"),
        payload: parsed.data,
      })
      if (!addFileResult.ok) return addFileResult.response
      return c.json(addFileResult.value)
    })
    .post("/session/:sessionID/active-file", async (c) => {
      const contextResult = withDirectoryContext(c.req.raw)
      if (!contextResult.ok) return contextResult.response

      const bodyResult = await withJsonBody(c.req.raw)
      if (!bodyResult.ok) return bodyResult.response

      const parsed = TeachingWorkspaceActivateFileRequestSchema.safeParse(bodyResult.value)
      if (!parsed.success) {
        return zodIssuesResponse(parsed.error)
      }

      const activateFileResult = await activateTeachingWorkspaceFile({
        directory: contextResult.value.directory,
        sessionID: c.req.param("sessionID"),
        payload: parsed.data,
      })
      if (!activateFileResult.ok) return activateFileResult.response
      return c.json(activateFileResult.value)
    })
    .post("/session/:sessionID/checkpoint", async (c) => {
      const contextResult = withDirectoryContext(c.req.raw)
      if (!contextResult.ok) return contextResult.response

      const checkpointResult = await checkpointTeachingWorkspace({
        directory: contextResult.value.directory,
        sessionID: c.req.param("sessionID"),
      })
      if (!checkpointResult.ok) return checkpointResult.response
      return c.json(checkpointResult.value)
    })
    .post("/session/:sessionID/restore", async (c) => {
      const contextResult = withDirectoryContext(c.req.raw)
      if (!contextResult.ok) return contextResult.response

      const restoreResult = await restoreTeachingWorkspace({
        directory: contextResult.value.directory,
        sessionID: c.req.param("sessionID"),
      })
      if (!restoreResult.ok) return restoreResult.response
      return c.json(restoreResult.value)
    })
