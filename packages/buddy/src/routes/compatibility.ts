import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import {
  routeErrors,
  directoryForbiddenResponse,
  directoryQuerySchema,
  resolveDirectoryRequestContext,
  runRouteTask,
  withDirectoryRoute,
} from "../http"
import { piEventStream } from "../pi-backend/event-bus"
import {
  mapProjectTextFileEditorError,
  readProjectTextFile,
  saveProjectTextFile,
} from "../project/project-file-editor-service"
import { resolvePresentedMediaItem } from "../learning/features/media-presentations/service/file-media"
import { listPiCommands } from "../pi-backend/commands"

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

const fileNodeSchema = z.object({
  name: z.string(),
  path: z.string(),
  absolute: z.string(),
  type: z.enum(["file", "directory"]),
  ignored: z.boolean(),
})

const fileContentResponseSchema = z.object({
  type: z.enum(["text", "binary"]),
  content: z.string(),
  diff: z.string().nullable().optional(),
  patch: z.unknown().nullable().optional(),
  encoding: z.literal("base64").nullable().optional(),
  mimeType: z.string().nullable().optional(),
})

const commandInfoSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  agent: z.string().nullable().optional(),
})

const healthResponseSchema = z.object({
  healthy: z.literal(true),
  version: z.string(),
})

const FILE_NOT_FOUND_ERROR = "File not found"
const FILE_ESCAPE_ERROR = "Access denied: path escapes project directory"
const FILE_READ_ERROR = "Unable to read file"
const DEFAULT_BINARY_MIME_TYPE = "application/octet-stream"
const TEXT_DECODER_FATAL = true
const CONTENT_LENGTH_HEADER = "content-length"
const CONTENT_TYPE_HEADER = "content-type"
const INLINE_CONTENT_DISPOSITION_PREFIX = "inline; filename*=UTF-8''"
const PI_HEALTH_VERSION = "pi"
const PROJECT_FILE_IGNORED = false
const FIND_SKIP_DIRECTORIES = new Set([".git", "node_modules", ".turbo", "dist"])

function resolveProjectFilePath(directory: string, relativePath: string) {
  return path.resolve(directory, relativePath)
}

function relativeProjectPath(directory: string, absolutePath: string) {
  const relative = path.relative(directory, absolutePath)
  return relative || "."
}

function containsProjectPath(directory: string, filepath: string) {
  const realDirectory = fs.realpathSync.native(directory)
  const relative = path.relative(realDirectory, filepath)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function readContainedProjectFileRecord(directory: string, requestedPath: string) {
  const absolutePath = resolveProjectFilePath(directory, requestedPath)
  const fileRecord = readProjectFileRecord(absolutePath)
  if (!fileRecord.ok) return fileRecord
  if (!containsProjectPath(directory, fileRecord.filepath)) {
    return {
      ok: false as const,
      response: Response.json({ error: FILE_ESCAPE_ERROR }, { status: 403 }),
    }
  }
  return fileRecord
}

function fileNode(directory: string, absolutePath: string, stats: fs.Stats) {
  return {
    name: path.basename(absolutePath),
    path: relativeProjectPath(directory, absolutePath),
    absolute: absolutePath,
    type: stats.isDirectory() ? ("directory" as const) : ("file" as const),
    ignored: PROJECT_FILE_IGNORED,
  }
}

function listProjectDirectory(directory: string, requestedPath: string) {
  const absolutePath = resolveProjectFilePath(directory, requestedPath)
  if (!containsProjectPath(directory, absolutePath)) {
    return Response.json({ error: FILE_ESCAPE_ERROR }, { status: 403 })
  }

  const stats = fs.statSync(absolutePath)
  if (!stats.isDirectory()) {
    return Response.json({ error: FILE_NOT_FOUND_ERROR }, { status: 404 })
  }

  const entries = fs.readdirSync(absolutePath, { withFileTypes: true })
  return Response.json(
    entries
      .map((entry) => {
        const entryPath = path.join(absolutePath, entry.name)
        return fileNode(directory, entryPath, fs.statSync(entryPath))
      })
      .toSorted((left, right) => {
        if (left.type !== right.type) return left.type === "directory" ? -1 : 1
        return left.name.localeCompare(right.name)
      }),
  )
}

function isTextBuffer(buffer: Buffer) {
  try {
    new TextDecoder("utf-8", { fatal: TEXT_DECODER_FATAL }).decode(buffer)
    return true
  } catch {
    return false
  }
}

function readProjectFileContent(directory: string, requestedPath: string) {
  const fileRecord = readContainedProjectFileRecord(directory, requestedPath)
  if (!fileRecord.ok) return fileRecord.response

  const buffer = fs.readFileSync(fileRecord.filepath)
  const mimeType = readProjectFileMimeType(fileRecord.filepath)
  if (isTextBuffer(buffer)) {
    return Response.json({
      type: "text",
      content: buffer.toString("utf8"),
      mimeType,
    })
  }

  return Response.json({
    type: "binary",
    content: buffer.toString("base64"),
    encoding: "base64",
    mimeType,
  })
}

function shouldSkipFindDirectory(name: string) {
  return FIND_SKIP_DIRECTORIES.has(name)
}

function findProjectFiles(input: {
  directory: string
  query: string
  includeDirectories: boolean
  type?: "file" | "directory"
  limit: number
}) {
  const needle = input.query.trim().toLowerCase()
  const matches: string[] = []

  function visit(directory: string) {
    if (matches.length >= input.limit) return
    const entries = fs.readdirSync(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (matches.length >= input.limit) return
      const entryPath = path.join(directory, entry.name)
      const isDirectory = entry.isDirectory()
      if (isDirectory && shouldSkipFindDirectory(entry.name)) continue

      const entryType = isDirectory ? "directory" : "file"
      const relative = relativeProjectPath(input.directory, entryPath)
      const typeMatches = input.type
        ? entryType === input.type
        : input.includeDirectories || entryType === "file"
      if (typeMatches && relative.toLowerCase().includes(needle)) {
        matches.push(relative)
      }

      if (isDirectory) visit(entryPath)
    }
  }

  visit(input.directory)
  return matches
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
      return c.json({ healthy: true, version: PI_HEALTH_VERSION })
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
      const directoryContext = resolveDirectoryRequestContext(c)
      if (!directoryContext.ok) return directoryContext.response
      return piEventStream(directoryContext.context.directory)
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
      const query = c.req.valid("query")
      return c.json(
        findProjectFiles({
          directory: directoryContext.context.directory,
          query: query.query,
          includeDirectories: query.dirs === "true",
          type: query.type,
          limit: query.limit ?? 20,
        }),
      )
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
              schema: resolver(z.array(fileNodeSchema)),
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
      try {
        return listProjectDirectory(directoryContext.context.directory, c.req.valid("query").path)
      } catch {
        return Response.json({ error: FILE_NOT_FOUND_ERROR }, { status: 404 })
      }
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
              schema: resolver(fileContentResponseSchema),
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
      try {
        return readProjectFileContent(directoryContext.context.directory, c.req.valid("query").path)
      } catch {
        return Response.json({ error: FILE_READ_ERROR }, { status: 500 })
      }
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

      const requestedPath = c.req.valid("query").path
      const fileRecord = readContainedProjectFileRecord(
        directoryContext.context.directory,
        requestedPath,
      )
      if (!fileRecord.ok) return fileRecord.response

      const downloadName = path.basename(requestedPath) || c.req.valid("param").fileName
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
    "/file/raw/:fileName",
    validator("param", fileRawParamSchema),
    validator("query", fileReadQuerySchema),
    async (c) => {
      const directoryContext = resolveDirectoryRequestContext(c)
      if (!directoryContext.ok) return directoryContext.response

      const requestedPath = c.req.valid("query").path
      const fileRecord = readContainedProjectFileRecord(
        directoryContext.context.directory,
        requestedPath,
      )
      if (!fileRecord.ok) return fileRecord.response

      const downloadName = path.basename(requestedPath) || c.req.valid("param").fileName
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
            "application/json": {
              schema: resolver(z.array(commandInfoSchema)),
            },
          },
        },
        ...routeErrors(403),
      },
    }),
    validator("query", directoryQuerySchema),
    async (c) => {
      const directoryContext = resolveDirectoryRequestContext(c)
      if (!directoryContext.ok) return directoryContext.response
      return c.json(await listPiCommands(directoryContext.context.directory))
    },
  )
