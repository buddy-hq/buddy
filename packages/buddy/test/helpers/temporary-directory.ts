import * as fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const DEFAULT_TEMPORARY_DIRECTORY_PREFIX = "buddy-test-"
const REMOVE_MAX_RETRIES = 5
const REMOVE_RETRY_DELAY_MILLISECONDS = 100

type TemporaryDirectoryOptions = Readonly<{
  parentDirectory?: string
  prefix?: string
}>

export type TemporaryDirectory = Readonly<{
  path: string
  [Symbol.asyncDispose]: () => Promise<void>
}>

export async function temporaryDirectory(
  options: TemporaryDirectoryOptions = {},
): Promise<TemporaryDirectory> {
  const parentDirectory = options.parentDirectory ?? os.tmpdir()
  const prefix = options.prefix ?? DEFAULT_TEMPORARY_DIRECTORY_PREFIX

  await fs.mkdir(parentDirectory, { recursive: true })
  const directoryPath = await fs.mkdtemp(path.join(parentDirectory, prefix))

  return {
    path: directoryPath,
    [Symbol.asyncDispose]: async () => {
      await fs.rm(directoryPath, {
        recursive: true,
        force: true,
        maxRetries: REMOVE_MAX_RETRIES,
        retryDelay: REMOVE_RETRY_DELAY_MILLISECONDS,
      })
    },
  }
}
