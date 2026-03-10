import type { Context } from "hono"
import { Hono } from "hono"
import {
  activateTeachingWorkspaceFile,
  addTeachingWorkspaceFile,
  checkpointTeachingWorkspace,
  provisionTeachingWorkspace,
  readTeachingWorkspace,
  restoreTeachingWorkspace,
  saveTeachingWorkspace,
} from "../learning/adapters/http"
import {
  TeachingProvisionRequestSchema,
  TeachingWorkspaceActivateFileRequestSchema,
  TeachingWorkspaceCreateFileRequestSchema,
  TeachingWorkspaceUpdateRequestSchema,
} from "../learning/capabilities"
import { zodIssuesResponse } from "../http"
import { withDirectoryContext, withJsonBody } from "../http"

const teachingRoutes = {
  provisionWorkspace: {
    method: "post" as const,
    path: "/session/:sessionID/workspace",
    bodySchema: TeachingProvisionRequestSchema,
    bodyOptional: true,
    bodyFallback: {},
  },
  readWorkspace: {
    method: "get" as const,
    path: "/session/:sessionID/workspace",
  },
  saveWorkspace: {
    method: "put" as const,
    path: "/session/:sessionID/workspace",
    bodySchema: TeachingWorkspaceUpdateRequestSchema,
  },
  addFile: {
    method: "post" as const,
    path: "/session/:sessionID/file",
    bodySchema: TeachingWorkspaceCreateFileRequestSchema,
  },
  activateFile: {
    method: "post" as const,
    path: "/session/:sessionID/active-file",
    bodySchema: TeachingWorkspaceActivateFileRequestSchema,
  },
  checkpointWorkspace: {
    method: "post" as const,
    path: "/session/:sessionID/checkpoint",
  },
  restoreWorkspace: {
    method: "post" as const,
    path: "/session/:sessionID/restore",
  },
}

async function provisionWorkspaceHandler(c: Context): Promise<Response> {
  const contextResult = withDirectoryContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response

  const bodyResult = await withJsonBody(c.req.raw, {
    optional: teachingRoutes.provisionWorkspace.bodyOptional,
    fallbackBody: teachingRoutes.provisionWorkspace.bodyFallback,
  })
  if (!bodyResult.ok) return bodyResult.response

  const parsed = teachingRoutes.provisionWorkspace.bodySchema.safeParse(bodyResult.value)
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
}

async function readWorkspaceHandler(c: Context): Promise<Response> {
  const contextResult = withDirectoryContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response

  const workspaceResult = await readTeachingWorkspace({
    directory: contextResult.value.directory,
    sessionID: c.req.param("sessionID"),
    optional: c.req.query("optional") === "1",
  })
  if (!workspaceResult.ok) return workspaceResult.response
  return c.json(workspaceResult.value)
}

async function saveWorkspaceHandler(c: Context): Promise<Response> {
  const contextResult = withDirectoryContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response

  const bodyResult = await withJsonBody(c.req.raw)
  if (!bodyResult.ok) return bodyResult.response

  const parsed = teachingRoutes.saveWorkspace.bodySchema.safeParse(bodyResult.value)
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
}

async function addFileHandler(c: Context): Promise<Response> {
  const contextResult = withDirectoryContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response

  const bodyResult = await withJsonBody(c.req.raw)
  if (!bodyResult.ok) return bodyResult.response

  const parsed = teachingRoutes.addFile.bodySchema.safeParse(bodyResult.value)
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
}

async function activateFileHandler(c: Context): Promise<Response> {
  const contextResult = withDirectoryContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response

  const bodyResult = await withJsonBody(c.req.raw)
  if (!bodyResult.ok) return bodyResult.response

  const parsed = teachingRoutes.activateFile.bodySchema.safeParse(bodyResult.value)
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
}

async function checkpointWorkspaceHandler(c: Context): Promise<Response> {
  const contextResult = withDirectoryContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response

  const checkpointResult = await checkpointTeachingWorkspace({
    directory: contextResult.value.directory,
    sessionID: c.req.param("sessionID"),
  })
  if (!checkpointResult.ok) return checkpointResult.response
  return c.json(checkpointResult.value)
}

async function restoreWorkspaceHandler(c: Context): Promise<Response> {
  const contextResult = withDirectoryContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response

  const restoreResult = await restoreTeachingWorkspace({
    directory: contextResult.value.directory,
    sessionID: c.req.param("sessionID"),
  })
  if (!restoreResult.ok) return restoreResult.response
  return c.json(restoreResult.value)
}

export const TeachingRoutes = (): Hono =>
  new Hono()
    .post(teachingRoutes.provisionWorkspace.path, provisionWorkspaceHandler)
    .get(teachingRoutes.readWorkspace.path, readWorkspaceHandler)
    .put(teachingRoutes.saveWorkspace.path, saveWorkspaceHandler)
    .post(teachingRoutes.addFile.path, addFileHandler)
    .post(teachingRoutes.activateFile.path, activateFileHandler)
    .post(teachingRoutes.checkpointWorkspace.path, checkpointWorkspaceHandler)
    .post(teachingRoutes.restoreWorkspace.path, restoreWorkspaceHandler)
