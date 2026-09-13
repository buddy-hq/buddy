import { constants as fsConstants } from "node:fs"
import fs from "node:fs/promises"
import { nodeErrorHasCode } from "./parse-node-error"

const HARD_LINK_FALLBACK_ERROR_CODES = new Set([
  "ENOSYS",
  "ENOTSUP",
  "EOPNOTSUPP",
  "EPERM",
])

export class FileRenameConflictError extends Error {}

async function createFileLinkWithoutOverwrite(sourcePath: string, destinationPath: string) {
  try {
    await fs.link(sourcePath, destinationPath)
  } catch (error) {
    if (nodeErrorHasCode(error, "EEXIST")) throw new FileRenameConflictError()
    const code = error instanceof Error && "code" in error ? String(error.code) : undefined
    if (!code || !HARD_LINK_FALLBACK_ERROR_CODES.has(code)) throw error
    try {
      await fs.copyFile(sourcePath, destinationPath, fsConstants.COPYFILE_EXCL)
    } catch (copyError) {
      if (nodeErrorHasCode(copyError, "EEXIST")) throw new FileRenameConflictError()
      throw copyError
    }
  }
}

export async function renameFileWithoutOverwrite(sourcePath: string, destinationPath: string) {
  const destinationStats = await fs.lstat(destinationPath).catch((error) => {
    if (nodeErrorHasCode(error, "ENOENT")) return undefined
    throw error
  })

  if (destinationStats) {
    const [sourceStats, sourceRealPath, destinationRealPath] = await Promise.all([
      fs.lstat(sourcePath),
      fs.realpath(sourcePath),
      fs.realpath(destinationPath),
    ])
    const sameDirectoryEntry =
      destinationRealPath === sourceRealPath &&
      destinationStats.dev === sourceStats.dev &&
      destinationStats.ino === sourceStats.ino
    if (!sameDirectoryEntry) throw new FileRenameConflictError()
    await fs.rename(sourcePath, destinationPath)
    return
  }

  await createFileLinkWithoutOverwrite(sourcePath, destinationPath)
  try {
    await fs.unlink(sourcePath)
  } catch (error) {
    await fs.unlink(destinationPath).catch(() => undefined)
    throw error
  }
}
