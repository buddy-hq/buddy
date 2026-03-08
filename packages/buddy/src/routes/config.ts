import { Hono } from "hono"
import { readProjectConfig } from "../config/compatibility.js"
import {
  AnyObjectSchema,
  ErrorSchema,
  McpNamePath,
} from "../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../openapi/compatibility-route.js"
import {
  listProjectAgents,
  listProjectPersonas,
  mapConfigRouteError,
  patchProjectConfig,
  putProjectMcpConfig,
} from "./handlers/config.js"
import {
  withConfigSync,
  withDirectoryContext,
  withJsonBody,
} from "./shared/route-helpers.js"
import { directoryForbiddenResponse, directoryParameters } from "./shared/openapi.js"
import { proxyToOpenCode } from "./support/proxy.js"

export const ConfigRoutes = (): Hono =>
  new Hono()
    .get(
      "/personas",
      compatibilityRoute({
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
      }),
      async (c) => {
        const contextResult = withDirectoryContext(c.req.raw)
        if (!contextResult.ok) return contextResult.response

        try {
          const personas = await listProjectPersonas(contextResult.value.directory)
          return c.json(personas)
        } catch (error) {
          const response = mapConfigRouteError(error)
          if (response) return response
          throw error
        }
      },
    )
    .get(
      "/agents",
      compatibilityRoute({
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
          403: {
            ...directoryForbiddenResponse,
          },
        },
      }),
      async (c) => {
        const contextResult = withDirectoryContext(c.req.raw)
        if (!contextResult.ok) return contextResult.response

        try {
          const agents = await listProjectAgents(contextResult.value.directory)
          return c.json(agents)
        } catch (error) {
          const response = mapConfigRouteError(error)
          if (response) return response
          throw error
        }
      },
    )
    .get(
      "/providers",
      compatibilityRoute({
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
      }),
      async (c) => {
        const syncResult = await withConfigSync(c.req.raw, {
          operation: "listing providers",
        })
        if (!syncResult.ok) return syncResult.response

        return proxyToOpenCode(c, {
          targetPath: "/config/providers",
        })
      },
    )
    .get(
      "/",
      compatibilityRoute({
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
      }),
      async (c) => {
        const contextResult = withDirectoryContext(c.req.raw)
        if (!contextResult.ok) return contextResult.response

        try {
          const config = await readProjectConfig(contextResult.value.directory)
          return c.json(config)
        } catch (error) {
          const response = mapConfigRouteError(error)
          if (response) return response
          throw error
        }
      },
    )
    .patch(
      "/",
      compatibilityRoute({
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
      }),
      async (c) => {
        const contextResult = withDirectoryContext(c.req.raw)
        if (!contextResult.ok) return contextResult.response

        const bodyResult = await withJsonBody(c.req.raw)
        if (!bodyResult.ok) return bodyResult.response

        try {
          const config = await patchProjectConfig({
            directory: contextResult.value.directory,
            payload: bodyResult.value,
          })
          return c.json(config)
        } catch (error) {
          const response = mapConfigRouteError(error)
          if (response) return response
          throw error
        }
      },
    )
    .put(
      "/mcp/:name",
      compatibilityRoute({
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
      }),
      async (c) => {
        const contextResult = withDirectoryContext(c.req.raw)
        if (!contextResult.ok) return contextResult.response

        const bodyResult = await withJsonBody(c.req.raw)
        if (!bodyResult.ok) return bodyResult.response

        try {
          const config = await putProjectMcpConfig({
            directory: contextResult.value.directory,
            name: c.req.param("name"),
            payload: bodyResult.value,
          })
          return c.json(config)
        } catch (error) {
          const response = mapConfigRouteError(error)
          if (response) return response
          throw error
        }
      },
    )
