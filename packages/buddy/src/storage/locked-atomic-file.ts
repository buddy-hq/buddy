import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { writeTextFileAtomic } from "./atomic-file"
import { withFileLock } from "./file-lock"
import { Global } from "./global"
import { nodeErrorHasCode } from "./parse-node-error"

const TEXT_FILE_WRITE_LOCK_DIRECTORY = "text-file-locks"
const TEXT_FILE_WRITE_LOCK_EXTENSION = ".lock"

class TextFileWriteIdentityConflictError extends Error {}
class TextFileWriteVersionConflictError extends Error {}

type TextFileWriteSnapshot = {
  targetPath: string
  version: string | null
}

function isNodeErrorCode<TError>(error: TError, code: string): boolean {
  return nodeErrorHasCode(error, code)
}

function textFileWriteLockPath(targetPath: string): string {
  const identity = createHash("sha256").update(path.resolve(targetPath), "utf8").digest("hex")
  return path.join(
    Global.Path.state,
    TEXT_FILE_WRITE_LOCK_DIRECTORY,
    `${identity}${TEXT_FILE_WRITE_LOCK_EXTENSION}`,
  )
}

async function resolveAtomicWriteTarget(lexicalTargetPath: string): Promise<string> {
  try {
    const realTargetPath = await fs.realpath(lexicalTargetPath)
    const stats = await fs.stat(realTargetPath)
    if (!stats.isFile()) {
      throw new Error(`Atomic text target is not a file: ${lexicalTargetPath}`)
    }
    return realTargetPath
  } catch (error) {
    if (!isNodeErrorCode(error, "ENOENT")) throw error
  }

  const unresolvedSegments = [path.basename(lexicalTargetPath)]
  let ancestor = path.dirname(lexicalTargetPath)
  while (true) {
    try {
      const realAncestor = await fs.realpath(ancestor)
      const stats = await fs.stat(realAncestor)
      if (!stats.isDirectory()) {
        throw new Error(`Atomic text target parent is not a directory: ${ancestor}`)
      }
      return path.join(realAncestor, ...unresolvedSegments)
    } catch (error) {
      if (!isNodeErrorCode(error, "ENOENT")) throw error
      const parent = path.dirname(ancestor)
      if (parent === ancestor) throw error
      unresolvedSegments.unshift(path.basename(ancestor))
      ancestor = parent
    }
  }
}

async function textFileVersion(targetPath: string): Promise<string | null> {
  try {
    return createHash("sha256")
      .update(await fs.readFile(targetPath))
      .digest("hex")
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) return null
    throw error
  }
}

async function captureTextFileWriteSnapshot(targetPath: string): Promise<TextFileWriteSnapshot> {
  const lexicalTargetPath = path.resolve(targetPath)
  const resolvedTargetPath = await resolveAtomicWriteTarget(lexicalTargetPath)
  return {
    targetPath: resolvedTargetPath,
    version: await textFileVersion(resolvedTargetPath),
  }
}

async function writeTextFileAtomicLocked(input: {
  targetPath: string
  content: string
  expectedSnapshot?: TextFileWriteSnapshot
}): Promise<void> {
  const lexicalTargetPath = path.resolve(input.targetPath)
  const lexicalLockPath = textFileWriteLockPath(lexicalTargetPath)
  await withFileLock(lexicalLockPath, async () => {
    const targetPath = await resolveAtomicWriteTarget(lexicalTargetPath)
    if (input.expectedSnapshot && input.expectedSnapshot.targetPath !== targetPath) {
      throw new TextFileWriteIdentityConflictError(
        "File target changed before the atomic write could start.",
      )
    }
    const write = () =>
      writeTextFileAtomic(targetPath, input.content, async () => {
        const latestTargetPath = await resolveAtomicWriteTarget(lexicalTargetPath)
        if (latestTargetPath !== targetPath) {
          throw new TextFileWriteIdentityConflictError(
            "File target changed while the atomic write was in progress.",
          )
        }
        if (
          input.expectedSnapshot &&
          input.expectedSnapshot.version !== (await textFileVersion(targetPath))
        ) {
          throw new TextFileWriteVersionConflictError(
            "File changed while the replacement was being rendered.",
          )
        }
      })

    const targetLockPath = textFileWriteLockPath(targetPath)
    if (targetLockPath === lexicalLockPath) {
      await write()
      return
    }
    await withFileLock(targetLockPath, write)
  })
}

export {
  TextFileWriteIdentityConflictError,
  TextFileWriteVersionConflictError,
  captureTextFileWriteSnapshot,
  resolveAtomicWriteTarget,
  textFileWriteLockPath,
  writeTextFileAtomicLocked,
}
export type { TextFileWriteSnapshot }
