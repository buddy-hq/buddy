import type { Context } from "hono"
import { Project as OpenCodeProject } from "@buddy/opencode-adapter/project"
import { openProjectFromPayload, updateProjectFromPayload } from "../orchestration/project-operations.js"
import { withJsonBody } from "../../http/route-helpers.js"
import { proxyToOpenCode } from "../../http/proxy.js"

function listProjectsHandler(c: Context): Response {
  return c.json(OpenCodeProject.list())
}

async function openProjectHandler(c: Context): Promise<Response> {
  const bodyResult = await withJsonBody(c.req.raw)
  if (!bodyResult.ok) return bodyResult.response

  const openResult = await openProjectFromPayload(bodyResult.value)
  if (!openResult.ok) {
    return c.json({ error: openResult.error }, openResult.status)
  }

  return c.json({ directory: openResult.directory })
}

async function currentProjectHandler(c: Context): Promise<Response> {
  return proxyToOpenCode(c, {
    targetPath: "/project/current",
  })
}

async function updateProjectHandler(c: Context): Promise<Response> {
  const bodyResult = await withJsonBody(c.req.raw)
  if (!bodyResult.ok) return bodyResult.response

  const updateResult = await updateProjectFromPayload({
    projectID: c.req.param("projectID"),
    payload: bodyResult.value,
  })
  if (!updateResult.ok) {
    return c.json({ error: updateResult.error }, updateResult.status)
  }

  return c.json(updateResult.project)
}

export {
  currentProjectHandler,
  listProjectsHandler,
  openProjectHandler,
  updateProjectHandler,
}
