import os from "node:os"
import path from "node:path"
import { BUDDY_ENV, BUDDY_HOME_DIRECTORY_NAME } from "@buddy/script/storage-env"

export {
  BUDDY_APP_NAME,
  BUDDY_ENV,
  BUDDY_HOME_DIRECTORY_NAME,
  BUDDY_OPENCODE_DB_FILENAME,
  BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME,
  DEFAULT_NOTEBOOK_HOME_SEGMENTS,
  OPENCODE_ENV,
  RUNTIME_ROOT_SEGMENTS,
  XDG_DEFAULT_SEGMENTS,
  XDG_ENV,
} from "@buddy/script/storage-env"

export function resolveConfiguredPath(value: string | undefined): string | undefined {
  const configured = value?.trim()
  if (!configured || configured === "undefined") {
    return undefined
  }
  try {
    return path.resolve(decodeURIComponent(configured))
  } catch {
    return path.resolve(configured)
  }
}

export function resolveBuddyHomeDirectory() {
  return resolveConfiguredPath(process.env[BUDDY_ENV.TEST_HOME]) ?? os.homedir()
}

export function resolveDefaultBuddyGlobalConfigDir() {
  return path.join(resolveBuddyHomeDirectory(), BUDDY_HOME_DIRECTORY_NAME)
}
