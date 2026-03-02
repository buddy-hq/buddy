import { Hono } from "hono"
import { syncOpenCodeProjectConfig } from "../config/compatibility.js"
import { AnyObjectSchema, DirectoryHeader, DirectoryQuery, ErrorSchema } from "../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../openapi/compatibility-route.js"
import { ensureAllowedDirectory, proxyToOpenCode } from "./support.js"

const directoryParameters = [DirectoryHeader, DirectoryQuery]

export const CompatibilityRoutes = (): Hono =>
  new Hono()
    .get(
      "/health",
      compatibilityRoute({
        operationId: "health.check",
        summary: "Health check",
        responses: {
          200: {
            description: "Health payload",
            content: {
              "application/json": { schema: AnyObjectSchema },
            },
          },
        },
      }),
      async (c) => {
        return proxyToOpenCode(c, {
          targetPath: "/global/health",
        })
      },
    )
    .get(
      "/event",
      compatibilityRoute({
        operationId: "event.stream",
        summary: "Server events stream",
        parameters: directoryParameters,
        responses: {
          200: {
            description: "Server-sent events stream",
            content: {
              "text/event-stream": {
                schema: { type: "string" },
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
        return proxyToOpenCode(c, {
          targetPath: "/global/event",
        })
      },
    )
    .get(
      "/find/file",
      compatibilityRoute({
        operationId: "find.file",
        summary: "Search files and directories",
        parameters: [
          ...directoryParameters,
          { in: "query", name: "query", required: true, schema: { type: "string" } },
          { in: "query", name: "dirs", required: false, schema: { type: "string", enum: ["true", "false"] } },
          { in: "query", name: "type", required: false, schema: { type: "string", enum: ["file", "directory"] } },
          { in: "query", name: "limit", required: false, schema: { type: "integer" } },
        ],
        responses: {
          200: {
            description: "Matching file and directory paths",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { type: "string" },
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
        return proxyToOpenCode(c, {
          targetPath: "/find/file",
        })
      },
    )
    .get(
      "/command",
      compatibilityRoute({
        operationId: "command.list",
        summary: "List project commands",
        parameters: directoryParameters,
        responses: {
          200: {
            description: "Project command metadata",
            content: {
              "application/json": { schema: AnyObjectSchema },
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
            `Failed to sync config before listing commands: ${String(error instanceof Error ? error.message : error)}`,
          )
        })

        return proxyToOpenCode(c, {
          targetPath: "/command",
        })
      },
    )
