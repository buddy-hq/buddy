import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { File as OpenCodeFile } from "@buddy/opencode-adapter/file"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"

const PROJECT_FILE_ESCAPE_ERROR = "Access denied: path escapes project directory"
const PROJECT_FILE_NOT_FOUND_ERROR = "File not found"
const PROJECT_TEXT_FILE_UNSUPPORTED_ERROR = "File type is not supported for in-app editing."
const PROJECT_TEXT_FILE_CONFLICT_ERROR = "File changed on disk. Reload or overwrite to continue."

export type ProjectTextFileState = {
  path: string
  content: string
  version: string | null
}

export type ProjectTextFileStatus = {
  path: string
  exists: boolean
  version: string | null
}

export type ProjectTextFileSaveResult = {
  path: string
  content: string
  version: string
}

export class ProjectFilePathEscapeError extends Error {}

export class ProjectFileNotFoundError extends Error {}

export class ProjectTextFileUnsupportedError extends Error {}

export class ProjectTextFileVersionConflictError extends Error {}

type ProjectContainedFile = {
  absolutePath: string
  realPath: string
}

function normalizeRelativePath(filepath: string) {
  return filepath.trim().replaceAll("\\", "/").replace(/^\/+/, "")
}

function contentVersion(content: string | undefined) {
  if (content === undefined) return null
  return createHash("sha256").update(content, "utf8").digest("hex")
}

async function readFileContent(filePath: string) {
  return fs.readFile(filePath, "utf8").catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return undefined
    }
    throw error
  })
}

async function resolveContainedFile(
  directory: string,
  relativePath: string,
): Promise<ProjectContainedFile> {
  const absolutePath = path.resolve(directory, relativePath)
  const realPath = await fs.realpath(absolutePath).catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return undefined
    }
    throw error
  })

  if (!realPath) {
    throw new ProjectFileNotFoundError(PROJECT_FILE_NOT_FOUND_ERROR)
  }
  if (!OpenCodeInstance.containsPath(realPath)) {
    throw new ProjectFilePathEscapeError(PROJECT_FILE_ESCAPE_ERROR)
  }

  const stats = await fs.stat(realPath)
  if (!stats.isFile()) {
    throw new ProjectFileNotFoundError(PROJECT_FILE_NOT_FOUND_ERROR)
  }

  return {
    absolutePath,
    realPath,
  }
}

async function assertContainedParentDirectory(directory: string, relativePath: string) {
  const absoluteParentPath = path.dirname(path.resolve(directory, relativePath))
  const realParentPath = await fs.realpath(absoluteParentPath).catch((error: unknown) => {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return undefined
    }
    throw error
  })

  if (!realParentPath || !OpenCodeInstance.containsPath(realParentPath)) {
    throw new ProjectFilePathEscapeError(PROJECT_FILE_ESCAPE_ERROR)
  }
}

async function assertTextEditableFile(relativePath: string) {
  const file = await OpenCodeFile.read(relativePath)
  if (file.type !== "text" || file.encoding === "base64") {
    throw new ProjectTextFileUnsupportedError(PROJECT_TEXT_FILE_UNSUPPORTED_ERROR)
  }
}

export function mapProjectTextFileEditorError(error: unknown): Response | undefined {
  if (error instanceof ProjectFilePathEscapeError) {
    return Response.json({ error: error.message }, { status: 403 })
  }
  if (error instanceof ProjectFileNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof ProjectTextFileUnsupportedError) {
    return Response.json({ error: error.message }, { status: 415 })
  }
  if (error instanceof ProjectTextFileVersionConflictError) {
    return Response.json({ error: error.message }, { status: 409 })
  }
  return undefined
}

export async function readProjectTextFile(input: {
  directory: string
  path: string
}): Promise<ProjectTextFileState> {
  const normalizedPath = normalizeRelativePath(input.path)
  return OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => {
      const file = await resolveContainedFile(input.directory, normalizedPath)
      await assertTextEditableFile(normalizedPath)
      const content = (await readFileContent(file.realPath)) ?? ""
      return {
        path: normalizedPath,
        content,
        version: contentVersion(content),
      }
    },
  })
}

export async function readProjectTextFileStatus(input: {
  directory: string
  path: string
}): Promise<ProjectTextFileStatus> {
  const normalizedPath = normalizeRelativePath(input.path)
  return OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => {
      const realPath = await fs
        .realpath(path.resolve(input.directory, normalizedPath))
        .catch((error: unknown) => {
          if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "ENOENT"
          ) {
            return undefined
          }
          throw error
        })

      if (!realPath) {
        await assertContainedParentDirectory(input.directory, normalizedPath)
        return {
          path: normalizedPath,
          exists: false,
          version: null,
        }
      }

      if (!OpenCodeInstance.containsPath(realPath)) {
        throw new ProjectFilePathEscapeError(PROJECT_FILE_ESCAPE_ERROR)
      }

      const stats = await fs.stat(realPath)
      if (!stats.isFile()) {
        throw new ProjectFileNotFoundError(PROJECT_FILE_NOT_FOUND_ERROR)
      }

      await assertTextEditableFile(normalizedPath)
      const content = (await readFileContent(realPath)) ?? ""
      return {
        path: normalizedPath,
        exists: true,
        version: contentVersion(content),
      }
    },
  })
}

export async function saveProjectTextFile(input: {
  directory: string
  path: string
  content: string
  expectedVersion?: string | null
}): Promise<ProjectTextFileSaveResult> {
  const normalizedPath = normalizeRelativePath(input.path)
  return OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => {
      const containedFile = await resolveContainedFile(input.directory, normalizedPath).catch(
        (error: unknown) => {
          if (error instanceof ProjectFileNotFoundError) {
            return undefined
          }
          throw error
        },
      )

      if (containedFile) {
        await assertTextEditableFile(normalizedPath)
      } else {
        await assertContainedParentDirectory(input.directory, normalizedPath)
      }

      const currentContent = containedFile
        ? await readFileContent(containedFile.realPath)
        : undefined
      const currentVersion = contentVersion(currentContent)

      if (input.expectedVersion !== undefined && input.expectedVersion !== currentVersion) {
        throw new ProjectTextFileVersionConflictError(PROJECT_TEXT_FILE_CONFLICT_ERROR)
      }

      const nextAbsolutePath =
        containedFile?.absolutePath ?? path.resolve(input.directory, normalizedPath)
      await fs.mkdir(path.dirname(nextAbsolutePath), { recursive: true })
      await fs.writeFile(nextAbsolutePath, input.content, "utf8")

      return {
        path: normalizedPath,
        content: input.content,
        version: contentVersion(input.content) ?? "",
      }
    },
  })
}
