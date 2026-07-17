import fs from "node:fs/promises"
import path from "node:path"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { resolveAtomicWriteTarget } from "../../storage/locked-atomic-file"
import type { BuddyToolContext } from "./create-buddy-tool"

const EXTERNAL_DIRECTORY_PERMISSION = "external_directory" as const
const DIRECTORY_CHILD_PATTERN = "*" as const

type ExternalFileAuthorizationContext = Pick<BuddyToolContext, "ask" | "directory">

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  )
}

function uniqueValues(values: readonly string[]): string[] {
  return Array.from(new Set(values))
}

function externalDirectoryPattern(filePath: string): string {
  return path.join(path.dirname(filePath), DIRECTORY_CHILD_PATTERN)
}

function containedByCurrentInstance(filePath: string): boolean | undefined {
  try {
    return OpenCodeInstance.containsPath(filePath, OpenCodeInstance.current)
  } catch {
    return undefined
  }
}

function isFileSystemRoot(filePath: string): boolean {
  const resolvedPath = path.resolve(filePath)
  return path.parse(resolvedPath).root === resolvedPath
}

function lexicalInstanceBoundaries(ctx: ExternalFileAuthorizationContext): string[] {
  const boundaries = [ctx.directory]
  try {
    const current = OpenCodeInstance.current
    boundaries.push(current.directory)
    if (!isFileSystemRoot(current.worktree)) {
      boundaries.push(current.worktree)
    }
  } catch {
    // The explicit tool context directory remains the fallback boundary.
  }
  return uniqueValues(boundaries.map((boundary) => path.resolve(boundary)))
}

function isWithinBoundary(boundaryPath: string, filePath: string): boolean {
  const relativePath = path.relative(boundaryPath, filePath)
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  )
}

async function requestExternalFileAuthorization(
  paths: readonly string[],
  ctx: ExternalFileAuthorizationContext,
): Promise<void> {
  const lexicalBoundaries = lexicalInstanceBoundaries(ctx)
  const canonicalBoundaries = await Promise.all(
    lexicalBoundaries.map((boundary) => fs.realpath(boundary).catch(() => boundary)),
  )
  const workspaceBoundaries = uniqueValues([...lexicalBoundaries, ...canonicalBoundaries])
  const externalPaths = uniqueValues(
    paths.filter((filePath) => {
      const contained = containedByCurrentInstance(filePath)
      return (
        contained !== true &&
        workspaceBoundaries.every((boundary) => !isWithinBoundary(boundary, filePath))
      )
    }),
  )
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
      fs.realpath(filePath).catch((error: unknown) => {
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
