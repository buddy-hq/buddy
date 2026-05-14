import fs from "node:fs"
import path from "node:path"
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
  runRouteTask,
  withConfigSync,
  withDirectoryRoute,
} from "../http"
import { proxyToOpenCode } from "../http"
import {
  mapProjectTextFileEditorError,
  readProjectTextFile,
  saveProjectTextFile,
} from "../project/project-file-editor-service"
import { resolvePresentedMediaItem } from "../learning/features/media-presentations/service/file-media"

const findFileQuerySchema = z.object({
  query: z.string(),
  dirs: z.enum(["true", "false"]).optional(),
  type: z.enum(["file", "directory"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  directory: z.string().optional(),
})

const fileListQuerySchema = z.object({
  path: z.string(),
  directory: z.string().optional(),
})

const fileReadQuerySchema = z.object({
  path: z.string().min(1),
  directory: z.string().optional(),
})

const fileRawParamSchema = z.object({
  fileName: z.string().min(1),
})

const presentedMediaRawParamSchema = z.object({
  artifactID: z.string().min(1),
  itemID: z.string().min(1),
})

const presentedMediaRawQuerySchema = directoryQuerySchema.extend({
  fileName: z.string().min(1).optional(),
})

const fileEditBodySchema = z.object({
  content: z.string(),
  expectedVersion: z.string().nullable().optional(),
})

const fileEditResponseSchema = z.object({
  path: z.string(),
  content: z.string(),
  version: z.string().nullable(),
})

const healthResponseSchema = z.object({
  healthy: z.literal(true),
  version: z.string(),
})

const FILE_NOT_FOUND_ERROR = "File not found"
const FILE_ESCAPE_ERROR = "Access denied: path escapes project directory"
const DEFAULT_BINARY_MIME_TYPE = "application/octet-stream"
const CONTENT_LENGTH_HEADER = "content-length"
const CONTENT_TYPE_HEADER = "content-type"
const INLINE_CONTENT_DISPOSITION_PREFIX = "inline; filename*=UTF-8''"

function resolveProjectFilePath(directory: string, relativePath: string) {
  return path.resolve(directory, relativePath)
}

function buildInlineContentDisposition(filename: string) {
  return `${INLINE_CONTENT_DISPOSITION_PREFIX}${encodeURIComponent(filename)}`
}

function readProjectFileRecord(filepath: string) {
  try {
    const realpath = fs.realpathSync.native(filepath)
    const stats = fs.statSync(realpath)
    if (!stats.isFile()) {
      return {
        ok: false as const,
        response: Response.json({ error: FILE_NOT_FOUND_ERROR }, { status: 404 }),
      }
    }
    return {
      ok: true as const,
      filepath: realpath,
      size: stats.size,
    }
  } catch {
    return {
      ok: false as const,
      response: Response.json({ error: FILE_NOT_FOUND_ERROR }, { status: 404 }),
    }
  }
}

function readProjectFileMimeType(filepath: string) {
  return Bun.file(filepath).type || DEFAULT_BINARY_MIME_TYPE
}

function buildRawProjectFileHeaders(input: {
  downloadName: string
  filepath: string
  size: number
}) {
  return {
    "content-disposition": buildInlineContentDisposition(input.downloadName),
    [CONTENT_LENGTH_HEADER]: String(input.size),
    [CONTENT_TYPE_HEADER]: readProjectFileMimeType(input.filepath),
  }
}

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
    "/file",
    describeRoute({
      operationId: "explorer.file.list",
      summary: "List project files and directories",
      responses: {
        200: {
          description: "Project file and directory entries",
          content: {
            "application/json": {
              schema: resolver(OpenCodeFile.Node.array()),
            },
          },
        },
        403: directoryForbiddenResponse,
      },
    }),
    validator("query", fileListQuerySchema),
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
        targetPath: "/file",
      })
    },
  )
  .get(
    "/file/content",
    describeRoute({
      operationId: "explorer.file.read",
      summary: "Read project file contents",
      responses: {
        200: {
          description: "Project file content payload",
          content: {
            "application/json": {
              schema: resolver(OpenCodeFile.Content),
            },
          },
        },
        403: directoryForbiddenResponse,
      },
    }),
    validator("query", fileReadQuerySchema),
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
        targetPath: "/file/content",
      })
    },
  )
  .get(
    "/file/raw/:fileName",
    describeRoute({
      operationId: "explorer.file.raw",
      summary: "Read raw project file bytes",
      responses: {
        200: {
          description: "Raw project file bytes",
          content: {
            "application/octet-stream": {
              schema: resolver(z.string()),
            },
          },
        },
        403: directoryForbiddenResponse,
      },
    }),
    validator("param", fileRawParamSchema),
    validator("query", fileReadQuerySchema),
    async (c) => {
      const directoryContext = resolveDirectoryRequestContext(c)
      if (!directoryContext.ok) return directoryContext.response

      return OpenCodeInstance.provide({
        directory: directoryContext.context.directory,
        fn: async () => {
          const requestedPath = c.req.valid("query").path
          const absolutePath = resolveProjectFilePath(
            directoryContext.context.directory,
            requestedPath,
          )
          const fileRecord = readProjectFileRecord(absolutePath)
          if (!fileRecord.ok) return fileRecord.response
          if (!OpenCodeInstance.containsPath(fileRecord.filepath)) {
            return Response.json({ error: FILE_ESCAPE_ERROR }, { status: 403 })
          }

          const downloadName = path.basename(requestedPath) || c.req.valid("param").fileName
          return new Response(Bun.file(fileRecord.filepath), {
            headers: buildRawProjectFileHeaders({
              downloadName,
              filepath: fileRecord.filepath,
              size: fileRecord.size,
            }),
          })
        },
      })
    },
  )
  .on(
    "HEAD",
    "/file/raw/:fileName",
    validator("param", fileRawParamSchema),
    validator("query", fileReadQuerySchema),
    async (c) => {
      const directoryContext = resolveDirectoryRequestContext(c)
      if (!directoryContext.ok) return directoryContext.response

      return OpenCodeInstance.provide({
        directory: directoryContext.context.directory,
        fn: async () => {
          const requestedPath = c.req.valid("query").path
          const absolutePath = resolveProjectFilePath(
            directoryContext.context.directory,
            requestedPath,
          )
          const fileRecord = readProjectFileRecord(absolutePath)
          if (!fileRecord.ok) return fileRecord.response
          if (!OpenCodeInstance.containsPath(fileRecord.filepath)) {
            return Response.json({ error: FILE_ESCAPE_ERROR }, { status: 403 })
          }

          const downloadName = path.basename(requestedPath) || c.req.valid("param").fileName
          return new Response(null, {
            headers: buildRawProjectFileHeaders({
              downloadName,
              filepath: fileRecord.filepath,
              size: fileRecord.size,
            }),
          })
        },
      })
    },
  )
  .get(
    "/presented-media/:artifactID/raw/:itemID",
    describeRoute({
      operationId: "presentedMedia.raw",
      summary: "Read raw presented media bytes",
      responses: {
        200: {
          description: "Raw presented media bytes",
          content: {
            "application/octet-stream": {
              schema: resolver(z.string()),
            },
          },
        },
        ...routeErrors(403, 404),
      },
    }),
    validator("param", presentedMediaRawParamSchema),
    validator("query", presentedMediaRawQuerySchema),
    async (c) => {
      const directoryContext = resolveDirectoryRequestContext(c)
      if (!directoryContext.ok) return directoryContext.response
      const params = c.req.valid("param")
      const query = c.req.valid("query")

      const item = await resolvePresentedMediaItem(
        directoryContext.context.directory,
        params.artifactID,
        params.itemID,
      )
      if (!item) {
        return Response.json({ error: FILE_NOT_FOUND_ERROR }, { status: 404 })
      }

      const fileRecord = readProjectFileRecord(item.absolutePath)
      if (!fileRecord.ok) return fileRecord.response

      const downloadName = query.fileName ?? item.fileName
      return new Response(Bun.file(fileRecord.filepath), {
        headers: buildRawProjectFileHeaders({
          downloadName,
          filepath: fileRecord.filepath,
          size: fileRecord.size,
        }),
      })
    },
  )
  .on(
    "HEAD",
    "/presented-media/:artifactID/raw/:itemID",
    validator("param", presentedMediaRawParamSchema),
    validator("query", presentedMediaRawQuerySchema),
    async (c) => {
      const directoryContext = resolveDirectoryRequestContext(c)
      if (!directoryContext.ok) return directoryContext.response
      const params = c.req.valid("param")
      const query = c.req.valid("query")

      const item = await resolvePresentedMediaItem(
        directoryContext.context.directory,
        params.artifactID,
        params.itemID,
      )
      if (!item) {
        return Response.json({ error: FILE_NOT_FOUND_ERROR }, { status: 404 })
      }

      const fileRecord = readProjectFileRecord(item.absolutePath)
      if (!fileRecord.ok) return fileRecord.response

      const downloadName = query.fileName ?? item.fileName
      return new Response(null, {
        headers: buildRawProjectFileHeaders({
          downloadName,
          filepath: fileRecord.filepath,
          size: fileRecord.size,
        }),
      })
    },
  )
  .get(
    "/file/edit",
    describeRoute({
      operationId: "explorer.file.edit.read",
      summary: "Read editable project text file state",
      responses: {
        200: {
          description: "Editable project text file state",
          content: {
            "application/json": {
              schema: resolver(fileEditResponseSchema),
            },
          },
        },
        ...routeErrors(403, 404, 415),
      },
    }),
    validator("query", fileReadQuerySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () =>
            c.json(
              await readProjectTextFile({
                directory: context.directory,
                path: c.req.valid("query").path,
              }),
            ),
          mapError: mapProjectTextFileEditorError,
        }),
      ),
  )
  .put(
    "/file/edit",
    describeRoute({
      operationId: "explorer.file.edit.save",
      summary: "Save editable project text file state",
      responses: {
        200: {
          description: "Saved project text file state",
          content: {
            "application/json": {
              schema: resolver(fileEditResponseSchema),
            },
          },
        },
        ...routeErrors(403, 404, 409, 415),
      },
    }),
    validator("query", fileReadQuerySchema),
    validator("json", fileEditBodySchema),
    async (c) =>
      withDirectoryRoute(c, async (context) =>
        runRouteTask({
          task: async () => {
            const payload = c.req.valid("json")
            return c.json(
              await saveProjectTextFile({
                directory: context.directory,
                path: c.req.valid("query").path,
                content: payload.content,
                expectedVersion: payload.expectedVersion,
              }),
            )
          },
          mapError: mapProjectTextFileEditorError,
        }),
      ),
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
