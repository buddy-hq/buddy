import fs from "node:fs/promises"
import path from "node:path"
import { isPathInsideDirectory } from "../../storage/path-containment"
import { resolveAtomicWriteTarget } from "../../storage/locked-atomic-file"
import type { BuddyToolContext } from "./create-buddy-tool"
import { parseTNodeErrorCode } from "../shared/parse-values"

const EXTERNAL_DIRECTORY_PERMISSION = "external_directory" as const
const DIRECTORY_CHILD_PATTERN = "*" as const

type ExternalFileAuthorizationContext = Pick<BuddyToolContext, "ask" | "directory">

function isMissingPathError<TError>(error: TError): boolean {
  const code = parseTNodeErrorCode(error)
  return code === "ENOENT" || code === "ENOTDIR"
}

function uniqueValues(values: readonly string[]): string[] {
  return Array.from(new Set(values))
}

function externalDirectoryPattern(filePath: string): string {
  return path.join(path.dirname(filePath), DIRECTORY_CHILD_PATTERN)
}

async function workspaceRoot(directory: string): Promise<string> {
  let current = path.resolve(directory)
  while (path.dirname(current) !== current) {
    const markers = await Promise.all([".git", ".hg"].map((marker) =>
      fs.stat(path.join(current, marker)).then(() => true, (error) => {
        if (isMissingPathError(error)) return false
        throw error
      }),
    ))
    if (markers.some(Boolean)) return current
    current = path.dirname(current)
  }
  return directory
}

async function workspaceBoundaries(ctx: ExternalFileAuthorizationContext): Promise<string[]> {
  const directory = path.resolve(ctx.directory)
  const canonicalDirectory = await fs.realpath(directory).catch(() => directory)
  const roots = await Promise.all([workspaceRoot(directory), workspaceRoot(canonicalDirectory)])
  const boundaries = uniqueValues([directory, canonicalDirectory, ...roots])
  const canonical = await Promise.all(boundaries.map((boundary) => fs.realpath(boundary).catch(() => boundary)))
  return uniqueValues([...boundaries, ...canonical])
}

async function requestExternalFileAuthorization(
  paths: readonly string[],
  ctx: ExternalFileAuthorizationContext,
): Promise<void> {
  const boundaries = await workspaceBoundaries(ctx)
  const externalPaths = uniqueValues(paths.filter((filePath) =>
    boundaries.every((boundary) => !isPathInsideDirectory(boundary, filePath)),
  ))
  if (externalPaths.length === 0) return

  const patterns = uniqueValues(externalPaths.map(externalDirectoryPattern))
  const singleFilePath = externalPaths.length === 1 ? externalPaths[0] : undefined

  await ctx.ask({
    permission: EXTERNAL_DIRECTORY_PERMISSION,
    patterns,
    always: patterns,
    metadata: singleFilePath
      ? {
          filepath: singleFilePath,
          parentDir: path.dirname(singleFilePath),
        }
      : {},
  })
}

async function authorizeFileReadPaths(
  paths: readonly string[],
  ctx: ExternalFileAuthorizationContext,
): Promise<string[]> {
  const lexicalPaths = paths.map((filePath) => path.resolve(filePath))
  await requestExternalFileAuthorization(lexicalPaths, ctx)

  const canonicalPaths = await Promise.all(
    lexicalPaths.map((filePath) =>
      fs.realpath(filePath).catch((error) => {
        if (isMissingPathError(error)) return filePath
        throw error
      }),
    ),
  )
  await requestExternalFileAuthorization(
    canonicalPaths.filter((canonicalPath, index) => canonicalPath !== lexicalPaths[index]),
    ctx,
  )
  return canonicalPaths
}

async function authorizeFileReadPath(
  filePath: string,
  ctx: ExternalFileAuthorizationContext,
): Promise<string> {
  const [canonicalPath] = await authorizeFileReadPaths([filePath], ctx)
  if (!canonicalPath) {
    throw new Error("Expected one authorized file path.")
  }
  return canonicalPath
}

async function authorizeFileWritePath(
  filePath: string,
  ctx: ExternalFileAuthorizationContext,
): Promise<string> {
  const lexicalPath = path.resolve(filePath)
  await requestExternalFileAuthorization([lexicalPath], ctx)

  const canonicalPath = await resolveAtomicWriteTarget(lexicalPath)
  if (canonicalPath !== lexicalPath) {
    await requestExternalFileAuthorization([canonicalPath], ctx)
  }
  return canonicalPath
}

export {
  authorizeFileReadPath,
  authorizeFileReadPaths,
  authorizeFileWritePath,
  requestExternalFileAuthorization,
}
export type { ExternalFileAuthorizationContext }
