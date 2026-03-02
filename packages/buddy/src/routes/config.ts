import { Hono } from "hono"
import { Agent as OpenCodeAgent } from "@buddy/opencode-adapter/agent"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import {
  configErrorMessage,
  isConfigValidationError,
  readProjectConfig,
  syncOpenCodeProjectConfig,
} from "../config/compatibility.js"
import { Config } from "../config/config.js"
import {
  AnyObjectSchema,
  DirectoryHeader,
  DirectoryQuery,
  ErrorSchema,
  McpNamePath,
} from "../openapi/compatibility-doc.js"
import { compatibilityRoute } from "../openapi/route-doc.js"
import { ensureAllowedDirectory, proxyToOpenCode } from "./support.js"

const directoryParameters = [DirectoryHeader, DirectoryQuery]

export const ConfigRoutes = (): Hono =>
  new Hono()
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
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const directoryResult = ensureAllowedDirectory(c.req.raw)
        if (!directoryResult.ok) return directoryResult.response

        await syncOpenCodeProjectConfig(directoryResult.directory).catch((error) => {
          throw new Error(
            `Failed to sync config before listing agents: ${String(error instanceof Error ? error.message : error)}`,
          )
        })

        const agents = await OpenCodeInstance.provide({
          directory: directoryResult.directory,
          fn: () => OpenCodeAgent.list(),
        })

        return c.json(
          agents.map((agent: { name: string; description?: string; mode: string; hidden?: boolean }) => ({
            name: agent.name,
            description: agent.description,
            mode: agent.mode,
            hidden: agent.hidden,
          })),
        )
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
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const directoryResult = ensureAllowedDirectory(c.req.raw)
        if (!directoryResult.ok) return directoryResult.response

        try {
          await syncOpenCodeProjectConfig(directoryResult.directory)
        } catch (error) {
          if (isConfigValidationError(error)) {
            return c.json({ error: configErrorMessage(error) }, 400)
          }
          throw new Error(
            `Failed to sync config before listing providers: ${String(error instanceof Error ? error.message : error)}`,
          )
        }

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
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const directoryResult = ensureAllowedDirectory(c.req.raw)
        if (!directoryResult.ok) return directoryResult.response

        try {
          const config = await readProjectConfig(directoryResult.directory)
          return c.json(config)
        } catch (error) {
          if (isConfigValidationError(error)) {
            return c.json({ error: configErrorMessage(error) }, 400)
          }
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
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const directoryResult = ensureAllowedDirectory(c.req.raw)
        if (!directoryResult.ok) return directoryResult.response

        let body: unknown
        try {
          body = await c.req.json()
        } catch {
          return c.json({ error: "Invalid JSON body" }, 400)
        }

        try {
          const parsed = Config.Info.parse(body)
          await Config.updateProject(directoryResult.directory, parsed)
          await syncOpenCodeProjectConfig(directoryResult.directory)
          const config = await readProjectConfig(directoryResult.directory)
          return c.json(config)
        } catch (error) {
          if (isConfigValidationError(error)) {
            return c.json({ error: configErrorMessage(error) }, 400)
          }
          if (error instanceof Error && error.name === "ZodError") {
            return c.json({ error: error.message }, 400)
          }
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
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const directoryResult = ensureAllowedDirectory(c.req.raw)
        if (!directoryResult.ok) return directoryResult.response

        const name = c.req.param("name")

        let body: unknown
        try {
          body = await c.req.json()
        } catch {
          return c.json({ error: "Invalid JSON body" }, 400)
        }

        try {
          const parsed = Config.Mcp.parse(body)
          await Config.setProjectMcp(directoryResult.directory, name, parsed)
          await syncOpenCodeProjectConfig(directoryResult.directory)
          const config = await readProjectConfig(directoryResult.directory)
          return c.json(config)
        } catch (error) {
          if (isConfigValidationError(error)) {
            return c.json({ error: configErrorMessage(error) }, 400)
          }
          if (error instanceof Error && error.name === "ZodError") {
            return c.json({ error: error.message }, 400)
          }
          throw error
        }
      },
    )
