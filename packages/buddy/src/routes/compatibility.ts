import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Command as OpenCodeCommand } from "@buddy/opencode-adapter/command"
import { File as OpenCodeFile } from "@buddy/opencode-adapter/file"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import {
  routeErrors,
  directoryForbiddenResponse,
  directoryQuerySchema,
  resolveDirectoryRequestContext,
  withConfigSync,
} from "../http"
import { proxyToOpenCode } from "../http"

const findFileQuerySchema = z.object({
  query: z.string(),
  dirs: z.enum(["true", "false"]).optional(),
  type: z.enum(["file", "directory"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  directory: z.string().optional(),
})

const healthResponseSchema = z.object({
  healthy: z.literal(true),
  version: z.string(),
})

export const CompatibilityRoutes = new Hono()
  .get(
    "/health",
    describeRoute({
      operationId: "health.check",
      summary: "Health check",
      responses: {
        200: {
          description: "Health payload",
          content: {
            "application/json": { schema: resolver(healthResponseSchema) },
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
    describeRoute({
      operationId: "event.stream",
      summary: "Server events stream",
      responses: {
        200: {
          description: "Server-sent events stream",
          content: {
            "text/event-stream": {
              schema: resolver(z.string()),
            },
          },
        },
        403: directoryForbiddenResponse,
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) => {
      return proxyToOpenCode(c, {
        targetPath: "/global/event",
      })
    },
  )
  .get(
    "/find/file",
    describeRoute({
      operationId: "find.files",
      summary: "Search files and directories",
      responses: {
        200: {
          description: "Matching file and directory paths",
          content: {
            "application/json": {
              schema: resolver(z.array(z.string())),
            },
          },
        },
        403: directoryForbiddenResponse,
      },
    }),
    validator("query", findFileQuerySchema),
    async (c) => {
      const directoryContext = resolveDirectoryRequestContext(c)
      if (!directoryContext.ok) return directoryContext.response
      await OpenCodeInstance.provide({
        directory: directoryContext.context.directory,
        fn: async () => {
          await OpenCodeFile.init()
        },
      }).catch(() => undefined)
      return proxyToOpenCode(c, {
        targetPath: "/find/file",
      })
    },
  )
  .get(
    "/command",
    describeRoute({
      operationId: "command.list",
      summary: "List project commands",
      responses: {
        200: {
          description: "Project command metadata",
          content: {
            "application/json": { schema: resolver(OpenCodeCommand.Info.array()) },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) => {
      const syncResult = await withConfigSync(c, {
        operation: "listing commands",
      })
      if (!syncResult.ok) return syncResult.response

      return proxyToOpenCode(c, {
        targetPath: "/command",
      })
    },
  )
