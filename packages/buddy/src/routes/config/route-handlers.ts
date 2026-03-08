import type { Context } from "hono"
import { readProjectConfig } from "../../config/compatibility.js"
import {
  listProjectAgents,
  listProjectPersonas,
  mapConfigRouteError,
  patchProjectConfig,
  putProjectMcpConfig,
} from "../handlers/config.js"
import { withConfigSync, withDirectoryContext, withJsonBody } from "../shared/route-helpers.js"
import { proxyToOpenCode } from "../support/proxy.js"

async function handleConfigErrors(task: () => Promise<Response>): Promise<Response> {
  try {
    return await task()
  } catch (error) {
    const response = mapConfigRouteError(error)
    if (response) return response
    throw error
  }
}

async function listConfigPersonasHandler(c: Context): Promise<Response> {
  const contextResult = withDirectoryContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response

  return handleConfigErrors(async () => {
    const personas = await listProjectPersonas(contextResult.value.directory)
    return c.json(personas)
  })
}

async function listConfigAgentsHandler(c: Context): Promise<Response> {
  const contextResult = withDirectoryContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response

  return handleConfigErrors(async () => {
    const agents = await listProjectAgents(contextResult.value.directory)
    return c.json(agents)
  })
}

async function listConfigProvidersHandler(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c.req.raw, {
    operation: "listing providers",
  })
  if (!syncResult.ok) return syncResult.response

  return proxyToOpenCode(c, {
    targetPath: "/config/providers",
  })
}

async function getProjectConfigHandler(c: Context): Promise<Response> {
  const contextResult = withDirectoryContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response

  return handleConfigErrors(async () => {
    const config = await readProjectConfig(contextResult.value.directory)
    return c.json(config)
  })
}

async function patchProjectConfigHandler(c: Context): Promise<Response> {
  const contextResult = withDirectoryContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response

  const bodyResult = await withJsonBody(c.req.raw)
  if (!bodyResult.ok) return bodyResult.response

  return handleConfigErrors(async () => {
    const config = await patchProjectConfig({
      directory: contextResult.value.directory,
      payload: bodyResult.value,
    })
    return c.json(config)
  })
}

async function putProjectMcpConfigHandler(c: Context): Promise<Response> {
  const contextResult = withDirectoryContext(c.req.raw)
  if (!contextResult.ok) return contextResult.response

  const bodyResult = await withJsonBody(c.req.raw)
  if (!bodyResult.ok) return bodyResult.response

  return handleConfigErrors(async () => {
    const config = await putProjectMcpConfig({
      directory: contextResult.value.directory,
      name: c.req.param("name"),
      payload: bodyResult.value,
    })
    return c.json(config)
  })
}

export {
  getProjectConfigHandler,
  listConfigAgentsHandler,
  listConfigPersonasHandler,
  listConfigProvidersHandler,
  patchProjectConfigHandler,
  putProjectMcpConfigHandler,
}
