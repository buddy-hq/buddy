import { isUtf8 } from "node:buffer"
import { createHash } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { File as OpenCodeFile } from "@buddy/opencode-adapter/file"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { writeTextFileAtomic } from "../storage/atomic-file"
import { withFileLock } from "../storage/file-lock"
import { textFileWriteLockPath } from "../storage/locked-atomic-file"

const PROJECT_FILE_ESCAPE_ERROR = "Access denied: path escapes project directory"
const PROJECT_FILE_NOT_FOUND_ERROR = "File not found"
const PROJECT_FILE_RENAME_CONFLICT_ERROR = "A file with that name already exists."
const PROJECT_TEXT_FILE_UNSUPPORTED_ERROR = "File type is not supported for in-app editing."
const PROJECT_TEXT_FILE_CONFLICT_ERROR = "File changed on disk. Reload or overwrite to continue."
const FILE_SYSTEM_ERROR_CODE = {
  alreadyExists: "EEXIST",
  functionNotImplemented: "ENOSYS",
  notFound: "ENOENT",
  operationNotSupported: "ENOTSUP",
  operationNotSupportedPosix: "EOPNOTSUPP",
  permissionDenied: "EPERM",
} as const
const HARD_LINK_FALLBACK_ERROR_CODES = new Set<string>([
  FILE_SYSTEM_ERROR_CODE.functionNotImplemented,
  FILE_SYSTEM_ERROR_CODE.operationNotSupported,
  FILE_SYSTEM_ERROR_CODE.operationNotSupportedPosix,
  FILE_SYSTEM_ERROR_CODE.permissionDenied,
])

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

export type ProjectTextFileRenameResult = ProjectTextFileSaveResult

export class ProjectFilePathEscapeError extends Error {}

export class ProjectFileNotFoundError extends Error {}

export class ProjectFileRenameConflictError extends Error {}

export class ProjectTextFileUnsupportedError extends Error {}

export class ProjectTextFileVersionConflictError extends Error {}

type ProjectContainedFile = {
  absolutePath: string
  realPath: string
}

type FileSystemErrorCode = (typeof FILE_SYSTEM_ERROR_CODE)[keyof typeof FILE_SYSTEM_ERROR_CODE]

function fileSystemErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined
  }
  return typeof error.code === "string" ? error.code : undefined
}

function isFileSystemError(error: unknown, code: FileSystemErrorCode) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code
}

function normalizeRelativePath(filepath: string) {
  return filepath.trim().replaceAll("\\", "/").replace(/^\/+/, "")
}

function contentVersion(content: string | undefined) {
  if (content === undefined) return null
  return createHash("sha256").update(content, "utf8").digest("hex")
}

async function readFileContent(filePath: string) {
  const content = await fs.readFile(filePath).catch((error: unknown) => {
    if (isFileSystemError(error, FILE_SYSTEM_ERROR_CODE.notFound)) {
      return undefined
    }
    throw error
  })
  if (content === undefined) return undefined
  if (!isUtf8(content)) {
    throw new ProjectTextFileUnsupportedError(PROJECT_TEXT_FILE_UNSUPPORTED_ERROR)
  }
  return content.toString("utf8")
}

async function resolveContainedFile(
  directory: string,
  relativePath: string,
): Promise<ProjectContainedFile> {
  const absolutePath = path.resolve(directory, relativePath)
  const realPath = await fs.realpath(absolutePath).catch((error: unknown) => {
    if (isFileSystemError(error, FILE_SYSTEM_ERROR_CODE.notFound)) {
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
    if (isFileSystemError(error, FILE_SYSTEM_ERROR_CODE.notFound)) {
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

async function createFileLinkWithoutOverwrite(sourcePath: string, destinationPath: string) {
  try {
    await fs.link(sourcePath, destinationPath)
  } catch (error) {
    if (isFileSystemError(error, FILE_SYSTEM_ERROR_CODE.alreadyExists)) {
      throw new ProjectFileRenameConflictError(PROJECT_FILE_RENAME_CONFLICT_ERROR)
    }
    const code = fileSystemErrorCode(error)
    if (!code || !HARD_LINK_FALLBACK_ERROR_CODES.has(code)) {
      throw error
    }
    try {
      await fs.copyFile(sourcePath, destinationPath, fsConstants.COPYFILE_EXCL)
    } catch (copyError) {
      if (isFileSystemError(copyError, FILE_SYSTEM_ERROR_CODE.alreadyExists)) {
        throw new ProjectFileRenameConflictError(PROJECT_FILE_RENAME_CONFLICT_ERROR)
      }
      throw copyError
    }
  }
}

async function renameFileWithoutOverwrite(source: ProjectContainedFile, destinationPath: string) {
  const destinationStats = await fs.lstat(destinationPath).catch((error: unknown) => {
    if (isFileSystemError(error, FILE_SYSTEM_ERROR_CODE.notFound)) return undefined
    throw error
  })

  if (destinationStats) {
    const [sourceStats, destinationRealPath] = await Promise.all([
      fs.lstat(source.absolutePath),
      fs.realpath(destinationPath),
    ])
    const sameDirectoryEntry =
      destinationRealPath === source.realPath &&
      destinationStats.dev === sourceStats.dev &&
      destinationStats.ino === sourceStats.ino
    if (!sameDirectoryEntry) {
      throw new ProjectFileRenameConflictError(PROJECT_FILE_RENAME_CONFLICT_ERROR)
    }
    await fs.rename(source.absolutePath, destinationPath)
    return
  }

  await createFileLinkWithoutOverwrite(source.absolutePath, destinationPath)
  try {
    await fs.unlink(source.absolutePath)
  } catch (error) {
    await fs.unlink(destinationPath).catch(() => undefined)
    throw error
  }
}

export function mapProjectTextFileEditorError(error: unknown): Response | undefined {
  if (error instanceof ProjectFilePathEscapeError) {
    return Response.json({ error: error.message }, { status: 403 })
  }
  if (error instanceof ProjectFileNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof ProjectFileRenameConflictError) {
    return Response.json({ error: error.message }, { status: 409 })
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
          if (isFileSystemError(error, FILE_SYSTEM_ERROR_CODE.notFound)) {
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
      const initialContainedFile = await resolveContainedFile(
        input.directory,
        normalizedPath,
      ).catch((error: unknown) => {
        if (error instanceof ProjectFileNotFoundError) {
          return undefined
        }
        throw error
      })

      if (initialContainedFile) {
        await assertTextEditableFile(normalizedPath)
      } else {
        await assertContainedParentDirectory(input.directory, normalizedPath)
      }

      const lexicalTargetPath = path.resolve(input.directory, normalizedPath)
      const lockPath = textFileWriteLockPath(lexicalTargetPath)

      return withFileLock(lockPath, async () => {
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

        const nextPath = containedFile?.realPath ?? path.resolve(input.directory, normalizedPath)
        const save = async () => {
          await writeTextFileAtomic(nextPath, input.content, async () => {
            const latestContainedFile = await resolveContainedFile(
              input.directory,
              normalizedPath,
            ).catch((error: unknown) => {
              if (error instanceof ProjectFileNotFoundError) return undefined
              throw error
            })
            const latestPath = latestContainedFile?.realPath ?? lexicalTargetPath
            if (latestPath !== nextPath) {
              throw new ProjectTextFileVersionConflictError(PROJECT_TEXT_FILE_CONFLICT_ERROR)
            }

            const currentContent = latestContainedFile
              ? await readFileContent(latestContainedFile.realPath)
              : undefined
            const currentVersion = contentVersion(currentContent)
            if (input.expectedVersion !== undefined && input.expectedVersion !== currentVersion) {
              throw new ProjectTextFileVersionConflictError(PROJECT_TEXT_FILE_CONFLICT_ERROR)
            }
          })
        }

        if (nextPath === lexicalTargetPath) {
          await save()
        } else {
          await withFileLock(textFileWriteLockPath(nextPath), save)
        }

        return {
          path: normalizedPath,
          content: input.content,
          version: contentVersion(input.content) ?? "",
        }
      })
    },
  })
}

export async function renameProjectTextFile(input: {
  directory: string
  path: string
  nextPath: string
  expectedVersion?: string | null
}): Promise<ProjectTextFileRenameResult> {
  const normalizedPath = normalizeRelativePath(input.path)
  const normalizedNextPath = normalizeRelativePath(input.nextPath)

  return OpenCodeInstance.provide({
    directory: input.directory,
    fn: async () => {
      const sourcePath = path.resolve(input.directory, normalizedPath)
      const destinationPath = path.resolve(input.directory, normalizedNextPath)
      const sourceParent = path.dirname(sourcePath)
      const destinationParent = path.dirname(destinationPath)

      if (sourceParent !== destinationParent) {
        throw new ProjectFilePathEscapeError(PROJECT_FILE_ESCAPE_ERROR)
      }

      const lockPaths = [
        textFileWriteLockPath(sourcePath),
        textFileWriteLockPath(destinationPath),
      ].toSorted()

      const rename = async (): Promise<ProjectTextFileRenameResult> => {
        const source = await resolveContainedFile(input.directory, normalizedPath)
        await assertTextEditableFile(normalizedPath)
        await assertContainedParentDirectory(input.directory, normalizedNextPath)

        const content = (await readFileContent(source.realPath)) ?? ""
        const version = contentVersion(content)
        if (input.expectedVersion !== undefined && input.expectedVersion !== version) {
          throw new ProjectTextFileVersionConflictError(PROJECT_TEXT_FILE_CONFLICT_ERROR)
        }

        if (sourcePath === destinationPath) {
          return {
            path: normalizedNextPath,
            content,
            version: version ?? "",
          }
        }

        await renameFileWithoutOverwrite(source, destinationPath)

        return {
          path: normalizedNextPath,
          content,
          version: version ?? "",
        }
      }

      if (lockPaths[0] === lockPaths[1]) {
        return withFileLock(lockPaths[0], rename)
      }
      return withFileLock(lockPaths[0], () => withFileLock(lockPaths[1], rename))
    },
  })
}
