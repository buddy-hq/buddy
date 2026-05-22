import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

const SNAPSHOT_ROOT_DIR = ".buddy"
const SNAPSHOT_STORE_DIR = "session-revert-snapshots"
const SNAPSHOT_FILES_DIR = "files"
const IGNORED_DIRECTORY_NAMES = new Set([
  ".buddy",
  ".git",
  ".turbo",
  "dist",
  "node_modules",
])

type SnapshotEntry =
  | {
      relativePath: string
      type: "directory"
    }
  | {
      relativePath: string
      type: "file"
    }
  | {
      relativePath: string
      type: "symlink"
      target: string
    }

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_")
}

function snapshotDirectory(input: { directory: string; sessionID: string; snapshotKey: string }) {
  return path.join(
    input.directory,
    SNAPSHOT_ROOT_DIR,
    SNAPSHOT_STORE_DIR,
    sanitizePathSegment(input.sessionID),
    sanitizePathSegment(input.snapshotKey),
  )
}

function snapshotFilesDirectory(input: {
  directory: string
  sessionID: string
  snapshotKey: string
}) {
  return path.join(snapshotDirectory(input), SNAPSHOT_FILES_DIR)
}

function shouldIgnoreRelativePath(relativePath: string) {
  if (!relativePath) return false
  const segments = relativePath.split(path.sep)
  return segments.some((segment) => IGNORED_DIRECTORY_NAMES.has(segment))
}

async function listEntries(root: string, current = root): Promise<SnapshotEntry[]> {
  const relativeDirectory = path.relative(root, current)
  if (relativeDirectory && shouldIgnoreRelativePath(relativeDirectory)) {
    return []
  }

  const dirEntries = await fs.readdir(current, {
    withFileTypes: true,
  })

  const entries: SnapshotEntry[] = []
  for (const dirent of dirEntries) {
    const absolutePath = path.join(current, dirent.name)
    const relativePath = path.relative(root, absolutePath)
    if (shouldIgnoreRelativePath(relativePath)) {
      continue
    }

    if (dirent.isDirectory()) {
      entries.push({
        relativePath,
        type: "directory",
      })
      entries.push(...(await listEntries(root, absolutePath)))
      continue
    }

    if (dirent.isSymbolicLink()) {
      entries.push({
        relativePath,
        type: "symlink",
        target: await fs.readlink(absolutePath),
      })
      continue
    }

    if (dirent.isFile()) {
      entries.push({
        relativePath,
        type: "file",
      })
    }
  }

  return entries
}

async function copyWorkspaceEntry(input: {
  sourceRoot: string
  destinationRoot: string
  entry: SnapshotEntry
}) {
  const sourcePath = path.join(input.sourceRoot, input.entry.relativePath)
  const destinationPath = path.join(input.destinationRoot, input.entry.relativePath)

  if (input.entry.type === "directory") {
    await fs.mkdir(destinationPath, { recursive: true })
    return
  }

  await fs.mkdir(path.dirname(destinationPath), { recursive: true })

  if (input.entry.type === "file") {
    await fs.copyFile(sourcePath, destinationPath)
    return
  }

  await fs.symlink(input.entry.target, destinationPath)
}

async function removeWorkspacePath(targetPath: string) {
  const stats = await fs.lstat(targetPath)
  if (stats.isDirectory() && !stats.isSymbolicLink()) {
    await fs.rm(targetPath, { recursive: true, force: true })
    return
  }
  await fs.rm(targetPath, { force: true })
}

export function createWorkspaceSnapshotKey() {
  return randomUUID().replaceAll("-", "_")
}

export async function captureWorkspaceSnapshot(input: {
  directory: string
  sessionID: string
  snapshotKey: string
}) {
  const outputDirectory = snapshotFilesDirectory(input)
  await fs.rm(snapshotDirectory(input), { recursive: true, force: true })
  await fs.mkdir(outputDirectory, { recursive: true })

  const entries = await listEntries(input.directory)
  for (const entry of entries) {
    await copyWorkspaceEntry({
      sourceRoot: input.directory,
      destinationRoot: outputDirectory,
      entry,
    })
  }

  return outputDirectory
}

export async function deleteWorkspaceSnapshot(input: {
  directory: string
  sessionID: string
  snapshotKey: string
}) {
  await fs.rm(snapshotDirectory(input), { recursive: true, force: true })
}

export async function restoreWorkspaceSnapshot(input: {
  directory: string
  sessionID: string
  snapshotKey: string
}) {
  const sourceRoot = snapshotFilesDirectory(input)
  const sourceEntries = await listEntries(sourceRoot)
  const currentEntries = await listEntries(input.directory)
  const sourcePaths = new Set(sourceEntries.map((entry) => entry.relativePath))

  const stalePaths = currentEntries
    .filter((entry) => !sourcePaths.has(entry.relativePath))
    .sort((left, right) => right.relativePath.length - left.relativePath.length)

  for (const entry of stalePaths) {
    await removeWorkspacePath(path.join(input.directory, entry.relativePath))
  }

  for (const entry of sourceEntries) {
    const destinationPath = path.join(input.directory, entry.relativePath)
    await fs.rm(destinationPath, { recursive: true, force: true })
    await copyWorkspaceEntry({
      sourceRoot,
      destinationRoot: input.directory,
      entry,
    })
  }
}
