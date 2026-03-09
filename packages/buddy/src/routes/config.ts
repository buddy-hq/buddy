import type { Context } from "hono"
import { Hono } from "hono"
import { AnyObjectSchema, ErrorSchema, McpNamePath } from "../openapi"
import { compatibilityRoute } from "../openapi"
import { directoryForbiddenResponse, directoryParameters } from "../http"
import { withConfigSync, withDirectoryContext, withJsonBody } from "../http"
import { proxyToOpenCode } from "../http"
import {
  listProjectAgents,
  listProjectPersonas,
  mapConfigRouteError,
  patchProjectConfig,
  putProjectMcpConfig,
} from "@buddy/backend/config/orchestration"
import { readProjectConfig } from "@buddy/backend/config/runtime"

const listConfigPersonasRoute = compatibilityRoute({
  operationId: "config.personas",
  summary: "List Buddy personas",
  parameters: directoryParameters,
  responses: {
    200: {
      description: "Buddy personas",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: AnyObjectSchema,
          },
        },
      },
    },
    400: {
      description: "Invalid config",
      content: {
        "application/json": { schema: ErrorSchema },
      },
    },
    403: {
      ...directoryForbiddenResponse,
    },
  },
})

const listConfigAgentsRoute = compatibilityRoute({
  operationId: "config.agents",
  summary: "List agent configurations",
  parameters: directoryParameters,
  responses: {
    200: {
      description: "Agent configurations",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: AnyObjectSchema,
          },
        },
      },
    },
    400: {
      description: "Invalid config",
      content: {
        "application/json": { schema: ErrorSchema },
      },
    },
    403: {
      ...directoryForbiddenResponse,
    },
  },
})

const listConfigProvidersRoute = compatibilityRoute({
  operationId: "config.providers",
  summary: "List configured providers",
  parameters: directoryParameters,
  responses: {
    200: {
      description: "Configured providers and defaults",
      content: {
        "application/json": { schema: AnyObjectSchema },
      },
    },
    400: {
      description: "Invalid config",
      content: {
        "application/json": { schema: ErrorSchema },
      },
    },
    403: {
      ...directoryForbiddenResponse,
    },
  },
})

const getProjectConfigRoute = compatibilityRoute({
  operationId: "config.get",
  summary: "Get project config",
  parameters: directoryParameters,
  responses: {
    200: {
      description: "Project config payload",
      content: {
        "application/json": { schema: AnyObjectSchema },
      },
    },
    400: {
      description: "Invalid config",
      content: {
        "application/json": { schema: ErrorSchema },
      },
    },
    403: {
      ...directoryForbiddenResponse,
    },
  },
})

const patchProjectConfigRoute = compatibilityRoute({
  operationId: "config.patch",
  summary: "Patch project config",
  parameters: directoryParameters,
  requestBody: {
    required: true,
    content: {
      "application/json": { schema: AnyObjectSchema },
    },
  },
  responses: {
    200: {
      description: "Updated project config payload",
      content: {
        "application/json": { schema: AnyObjectSchema },
      },
    },
    400: {
      description: "Invalid config",
      content: {
        "application/json": { schema: ErrorSchema },
      },
    },
    403: {
      ...directoryForbiddenResponse,
    },
  },
})

const putProjectMcpConfigRoute = compatibilityRoute({
  operationId: "config.mcp.put",
  summary: "Set project MCP config",
  parameters: [McpNamePath, ...directoryParameters],
  requestBody: {
    required: true,
    content: {
      "application/json": { schema: AnyObjectSchema },
    },
  },
  responses: {
    200: {
      description: "Updated project config payload",
      content: {
        "application/json": { schema: AnyObjectSchema },
      },
    },
    400: {
      description: "Invalid MCP config",
      content: {
        "application/json": { schema: ErrorSchema },
      },
    },
    403: {
      ...directoryForbiddenResponse,
    },
  },
})

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

export const ConfigRoutes = (): Hono =>
  new Hono()
    .get("/personas", listConfigPersonasRoute, listConfigPersonasHandler)
    .get("/agents", listConfigAgentsRoute, listConfigAgentsHandler)
    .get("/providers", listConfigProvidersRoute, listConfigProvidersHandler)
    .get("/", getProjectConfigRoute, getProjectConfigHandler)
    .patch("/", patchProjectConfigRoute, patchProjectConfigHandler)
    .put("/mcp/:name", putProjectMcpConfigRoute, putProjectMcpConfigHandler)
