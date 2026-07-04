import { join } from "node:path"
import {
  type BuddyReleaseChannel,
  resolveOpenCodeDatabaseFilenameForBuddyChannel,
} from "@buddy/script/channel"
import {
  DEFAULT_NOTEBOOK_HOME_SEGMENTS,
  OPENCODE_APP_NAME,
  RUNTIME_ROOT_SEGMENTS,
  XDG_DEFAULT_SEGMENTS,
  XDG_ENV,
} from "@buddy/script/storage-env"

export type StorageChannel = BuddyReleaseChannel

const DEV_XDG_DIRECTORY_NAME = "xdg"
export const DESKTOP_XDG_ENV = {
  CACHE_HOME: XDG_ENV.CACHE_HOME,
  DATA_HOME: XDG_ENV.DATA_HOME,
  STATE_HOME: XDG_ENV.STATE_HOME,
} as const

export function resolveDefaultNotebookHome(home: string): string {
  return join(home, ...DEFAULT_NOTEBOOK_HOME_SEGMENTS)
}

export function resolveAllowedDirectoryRoots(input: { home: string }): string {
  return resolveDefaultNotebookHome(input.home)
}

export function shouldUseDevRuntimeIsolation(input: {
  channel: StorageChannel
  isPackaged: boolean
}): boolean {
  return !input.isPackaged || input.channel === "dev"
}

export function resolveDevXdgEnvironment(userDataPath: string): Record<string, string> {
  const root = join(userDataPath, DEV_XDG_DIRECTORY_NAME)
  return {
    [DESKTOP_XDG_ENV.DATA_HOME]: join(root, RUNTIME_ROOT_SEGMENTS.data),
    [DESKTOP_XDG_ENV.CACHE_HOME]: join(root, RUNTIME_ROOT_SEGMENTS.cache),
    [DESKTOP_XDG_ENV.STATE_HOME]: join(root, RUNTIME_ROOT_SEGMENTS.state),
  }
}

export function resolveOpenCodeSqlitePath(input: {
  channel: StorageChannel
  envXdgDataHome: string | undefined
  home: string
  isPackaged: boolean
  userDataPath: string
}): string {
  const configuredXdgDataHome = input.envXdgDataHome?.trim()
  const xdgDataHome =
    configuredXdgDataHome && configuredXdgDataHome.length > 0
      ? configuredXdgDataHome
      : shouldUseDevRuntimeIsolation({
            channel: input.channel,
            isPackaged: input.isPackaged,
          })
        ? join(input.userDataPath, DEV_XDG_DIRECTORY_NAME, RUNTIME_ROOT_SEGMENTS.data)
        : join(input.home, ...XDG_DEFAULT_SEGMENTS.data)

  return join(
    xdgDataHome,
    OPENCODE_APP_NAME,
    resolveOpenCodeDatabaseFilenameForBuddyChannel(input.channel),
  )
}
