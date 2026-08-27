import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export const TEST_SANDBOX_ROOT_ENVIRONMENT_KEY = "BUDDY_TEST_PROCESS_ROOT"
export const TEST_SANDBOX_ORIGINAL_HOME_ENVIRONMENT_KEY = "BUDDY_TEST_ORIGINAL_HOME"
export const TEST_SANDBOX_PREFIX = "buddy-test-process-"
export const TEST_TEMP_DIRECTORY_NAME = "tmp"
export const TEST_HOME_DIRECTORY_NAME = "home"
export const WINDOWS_HOME_ENVIRONMENT_KEY = "USERPROFILE"
export const POSIX_HOME_ENVIRONMENT_KEY = "HOME"
export const TEMP_ENVIRONMENT_KEYS = ["TMPDIR", "TMP", "TEMP"] as const
const TEST_SANDBOX_REMOVE_MAX_RETRIES = 5
const TEST_SANDBOX_REMOVE_RETRY_DELAY_MILLISECONDS = 100

export type TestSandbox = Readonly<{
  home: string
  originalHome: string
  root: string
  temp: string
}>

export function createTestSandboxRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), TEST_SANDBOX_PREFIX))
}

export function configureTestSandbox(root: string): TestSandbox {
  const originalHome =
    process.env[TEST_SANDBOX_ORIGINAL_HOME_ENVIRONMENT_KEY]?.trim() || os.homedir()
  const resolvedRoot = path.resolve(root)
  const home = path.join(resolvedRoot, TEST_HOME_DIRECTORY_NAME)
  const temp = path.join(resolvedRoot, TEST_TEMP_DIRECTORY_NAME)

  fs.mkdirSync(home, { recursive: true })
  fs.mkdirSync(temp, { recursive: true })

  for (const environmentKey of TEMP_ENVIRONMENT_KEYS) {
    process.env[environmentKey] = temp
  }
  process.env[POSIX_HOME_ENVIRONMENT_KEY] = home
  process.env[WINDOWS_HOME_ENVIRONMENT_KEY] = home

  return { home, originalHome, root: resolvedRoot, temp }
}

export function removeTestSandboxRoot(root: string): void {
  fs.rmSync(root, {
    recursive: true,
    force: true,
    maxRetries: TEST_SANDBOX_REMOVE_MAX_RETRIES,
    retryDelay: TEST_SANDBOX_REMOVE_RETRY_DELAY_MILLISECONDS,
  })
}
