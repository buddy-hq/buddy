import { join } from "node:path"
import type { BuddyReleaseChannel } from "@buddy/script/channel"
import {
  BUDDY_APP_NAME,
  BUDDY_ENV,
  BUDDY_OPENCODE_DB_FILENAME,
  BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME,
  DEFAULT_NOTEBOOK_HOME_SEGMENTS,
  RUNTIME_ROOT_SEGMENTS,
  XDG_DEFAULT_SEGMENTS,
  XDG_ENV,
} from "@buddy/script/storage-env"

export type StorageChannel = BuddyReleaseChannel

const DEV_XDG_DIRECTORY_NAME = "xdg"
export const DESKTOP_XDG_ENV = {
  CACHE_HOME: XDG_ENV.CACHE_HOME,
  CONFIG_HOME: XDG_ENV.CONFIG_HOME,
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

export function resolveRuntimeXdgEnvironment(runtimeRoot: string): Record<string, string> {
  return {
    [DESKTOP_XDG_ENV.DATA_HOME]: join(runtimeRoot, RUNTIME_ROOT_SEGMENTS.data),
    [DESKTOP_XDG_ENV.CACHE_HOME]: join(runtimeRoot, RUNTIME_ROOT_SEGMENTS.cache),
    [DESKTOP_XDG_ENV.CONFIG_HOME]: join(runtimeRoot, RUNTIME_ROOT_SEGMENTS.config),
    [DESKTOP_XDG_ENV.STATE_HOME]: join(runtimeRoot, RUNTIME_ROOT_SEGMENTS.state),
  }
}

export function resolveDevXdgEnvironment(userDataPath: string): Record<string, string> {
  return resolveRuntimeXdgEnvironment(join(userDataPath, DEV_XDG_DIRECTORY_NAME))
}

export function resolveDevRuntimeEnvironment(userDataPath: string): Record<string, string> {
  const runtimeRoot = join(userDataPath, DEV_XDG_DIRECTORY_NAME)

  return {
    ...resolveRuntimeXdgEnvironment(runtimeRoot),
    [BUDDY_ENV.DATA_DIR]: join(runtimeRoot, RUNTIME_ROOT_SEGMENTS.data, BUDDY_APP_NAME),
    [BUDDY_ENV.CACHE_DIR]: join(runtimeRoot, RUNTIME_ROOT_SEGMENTS.cache, BUDDY_APP_NAME),
    [BUDDY_ENV.GLOBAL_CONFIG_DIR]: join(
      runtimeRoot,
      RUNTIME_ROOT_SEGMENTS.config,
      BUDDY_APP_NAME,
    ),
    [BUDDY_ENV.STATE_DIR]: join(runtimeRoot, RUNTIME_ROOT_SEGMENTS.state, BUDDY_APP_NAME),
  }
}

function resolveConfiguredDesktopPath(value: string | undefined): string | undefined {
  const configured = value?.trim()
  if (!configured || configured === "undefined") {
    return undefined
  }

  return configured
}

function resolveDefaultXdgDataHome(home: string): string {
  return join(home, ...XDG_DEFAULT_SEGMENTS.data)
}

function resolveEffectiveXdgDataHome(input: {
  channel: StorageChannel
  envXdgDataHome?: string | undefined
  home: string
  isPackaged: boolean
  userDataPath: string
}): string {
  const configured = resolveConfiguredDesktopPath(input.envXdgDataHome)
  if (configured) return configured

  if (
    shouldUseDevRuntimeIsolation({
      channel: input.channel,
      isPackaged: input.isPackaged,
    })
  ) {
    return join(input.userDataPath, DEV_XDG_DIRECTORY_NAME, RUNTIME_ROOT_SEGMENTS.data)
  }

  return resolveDefaultXdgDataHome(input.home)
}

export function resolveBuddyDataDir(input: {
  channel: StorageChannel
  envBuddyDataDir?: string | undefined
  envXdgDataHome?: string | undefined
  home: string
  isPackaged: boolean
  userDataPath: string
}): string {
  const configured = resolveConfiguredDesktopPath(input.envBuddyDataDir)
  if (configured) return configured

  return join(resolveEffectiveXdgDataHome(input), BUDDY_APP_NAME)
}

export function resolveOpenCodeSqlitePath(input: {
  channel: StorageChannel
  envBuddyDataDir?: string | undefined
  envXdgDataHome?: string | undefined
  home: string
  isPackaged: boolean
  userDataPath: string
}): string {
  return join(
    resolveBuddyDataDir(input),
    BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME,
    BUDDY_OPENCODE_DB_FILENAME,
  )
}
