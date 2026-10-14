import fs from "node:fs"
import path, { join } from "node:path"
import { BUDDY_CHANNEL_ENV, type BuddyReleaseChannel } from "@buddy/script/channel"
import { resolveBuddyDistribution } from "@buddy/script/distribution"
import {
  BUDDY_APP_NAME,
  BUDDY_ENV,
  BUDDY_OPENCODE_DB_FILENAME,
  BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME,
  DEFAULT_NOTEBOOK_HOME_SEGMENTS,
  OPENCODE_ENV,
  RUNTIME_ROOT_SEGMENTS,
  XDG_DEFAULT_SEGMENTS,
  XDG_ENV,
} from "@buddy/script/storage-env"
import {
  BACKEND_DEVELOPMENT_RELOAD_ACKNOWLEDGEMENT_ENV,
  BACKEND_DEVELOPMENT_RELOAD_SIGNAL_ENV,
} from "../shared/backend-development-reload"

export type StorageChannel = BuddyReleaseChannel

const DEV_XDG_DIRECTORY_NAME = "xdg"
export const DESKTOP_XDG_ENV = {
  CACHE_HOME: XDG_ENV.CACHE_HOME,
  CONFIG_HOME: XDG_ENV.CONFIG_HOME,
  DATA_HOME: XDG_ENV.DATA_HOME,
  STATE_HOME: XDG_ENV.STATE_HOME,
} as const

export type RuntimeXdgEnvironment = {
  [DESKTOP_XDG_ENV.DATA_HOME]: string
  [DESKTOP_XDG_ENV.CACHE_HOME]: string
  [DESKTOP_XDG_ENV.CONFIG_HOME]: string
  [DESKTOP_XDG_ENV.STATE_HOME]: string
}

export type DevRuntimeEnvironment = RuntimeXdgEnvironment & {
  [BUDDY_ENV.DATA_DIR]: string
  [BUDDY_ENV.CACHE_DIR]: string
  [BUDDY_ENV.GLOBAL_CONFIG_DIR]: string
  [BUDDY_ENV.STATE_DIR]: string
}

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

/** Resolve the four XDG categories beneath a desktop runtime root. */
export function resolveRuntimeXdgEnvironment(
  runtimeRoot: string,
  pathApi: Pick<typeof path, "join"> = path,
): RuntimeXdgEnvironment {
  return {
    [DESKTOP_XDG_ENV.DATA_HOME]: pathApi.join(runtimeRoot, RUNTIME_ROOT_SEGMENTS.data),
    [DESKTOP_XDG_ENV.CACHE_HOME]: pathApi.join(runtimeRoot, RUNTIME_ROOT_SEGMENTS.cache),
    [DESKTOP_XDG_ENV.CONFIG_HOME]: pathApi.join(runtimeRoot, RUNTIME_ROOT_SEGMENTS.config),
    [DESKTOP_XDG_ENV.STATE_HOME]: pathApi.join(runtimeRoot, RUNTIME_ROOT_SEGMENTS.state),
  }
}

/** Preserve the development desktop category roots beneath userData. */
export function resolveDevRuntimeEnvironment(
  userDataPath: string,
  pathApi: Pick<typeof path, "join"> = path,
): DevRuntimeEnvironment {
  const runtimeRoot = pathApi.join(userDataPath, DEV_XDG_DIRECTORY_NAME)

  return {
    ...resolveRuntimeXdgEnvironment(runtimeRoot, pathApi),
    [BUDDY_ENV.DATA_DIR]: pathApi.join(runtimeRoot, RUNTIME_ROOT_SEGMENTS.data, BUDDY_APP_NAME),
    [BUDDY_ENV.CACHE_DIR]: pathApi.join(runtimeRoot, RUNTIME_ROOT_SEGMENTS.cache, BUDDY_APP_NAME),
    [BUDDY_ENV.GLOBAL_CONFIG_DIR]: pathApi.join(
      runtimeRoot,
      RUNTIME_ROOT_SEGMENTS.config,
      BUDDY_APP_NAME,
    ),
    [BUDDY_ENV.STATE_DIR]: pathApi.join(runtimeRoot, RUNTIME_ROOT_SEGMENTS.state, BUDDY_APP_NAME),
  }
}

function resolveConfiguredDesktopPath(value: string | undefined): string | undefined {
  const configured = value?.trim()
  if (!configured || configured === "undefined") {
    return undefined
  }

  return configured
}

/** Inputs shared by backend startup and pre-startup database inspection. */
export type DesktopStoragePlanInput = {
  channel: StorageChannel
  isPackaged: boolean
  home: string
  documentsPath: string
  userDataPath: string
  envBuddyDataDir?: string | undefined
  envXdgDataHome?: string | undefined
  pathApi?: Pick<typeof path, "join">
}

/** Resolved desktop storage policy; only packaged Beta changes Electron's paths. */
export type DesktopStoragePlan = {
  kind: "development" | "beta" | "production"
  notebookHome: string
  buddyDataDir: string
  openCodeSqlitePath: string
  environmentOverrides: Readonly<Record<string, string>>
  directoriesToCreate: readonly string[]
  electronPaths?: {
    sessionData: string
    temp: string
    logs: string
    crashDumps: string
  }
  storeCwd?: string
}

/** Resolve storage without consulting Electron, the filesystem, or ambient env. */
export function resolveDesktopStoragePlan(input: DesktopStoragePlanInput): DesktopStoragePlan {
  const pathApi = input.pathApi ?? path
  const distribution = resolveBuddyDistribution(input.channel)
  if (input.isPackaged && distribution?.id === "beta") {
    const userData = input.userDataPath
    const xdg = pathApi.join(userData, DEV_XDG_DIRECTORY_NAME)
    const data = pathApi.join(xdg, "data")
    const cache = pathApi.join(xdg, "cache")
    const config = pathApi.join(xdg, "config")
    const state = pathApi.join(xdg, "state")
    const temp = pathApi.join(xdg, "tmp")
    const managedHome = pathApi.join(config, BUDDY_APP_NAME)
    const skillCache = pathApi.join(cache, BUDDY_APP_NAME, "opencode", "skills")
    const buddyDataDir = pathApi.join(data, BUDDY_APP_NAME)
    const notebookHome = pathApi.join(input.documentsPath, distribution.productName)
    const electronPaths = {
      sessionData: userData,
      temp,
      logs: pathApi.join(userData, "logs"),
      crashDumps: pathApi.join(userData, "crash-dumps"),
    }
    const environmentOverrides = {
      [XDG_ENV.DATA_HOME]: data,
      [XDG_ENV.CACHE_HOME]: cache,
      [XDG_ENV.CONFIG_HOME]: config,
      [XDG_ENV.STATE_HOME]: state,
      [BUDDY_ENV.DATA_DIR]: buddyDataDir,
      [BUDDY_ENV.CACHE_DIR]: pathApi.join(cache, BUDDY_APP_NAME),
      [BUDDY_ENV.GLOBAL_CONFIG_DIR]: managedHome,
      [BUDDY_ENV.STATE_DIR]: pathApi.join(state, BUDDY_APP_NAME),
      [BUDDY_ENV.MANAGED_HOME_DIR]: managedHome,
      [BUDDY_ENV.DEFAULT_NOTEBOOK_HOME]: notebookHome,
      [BUDDY_ENV.OPENCODE_SKILL_CACHE_DIR]: skillCache,
      [BUDDY_ENV.DIRECTORY_BASE]: notebookHome,
      [BUDDY_ENV.ALLOWED_DIRECTORY_ROOTS]: notebookHome,
      TMPDIR: temp,
      TMP: temp,
      TEMP: temp,
      [OPENCODE_ENV.CONFIG_DIR]: managedHome,
      [OPENCODE_ENV.DB]: BUDDY_OPENCODE_DB_FILENAME,
      [BUDDY_CHANNEL_ENV]: distribution.id,
    }
    return {
      kind: "beta",
      notebookHome,
      buddyDataDir,
      openCodeSqlitePath: pathApi.join(
        buddyDataDir,
        BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME,
        BUDDY_OPENCODE_DB_FILENAME,
      ),
      environmentOverrides,
      directoriesToCreate: [
        ...Object.values(electronPaths),
        data,
        cache,
        managedHome,
        pathApi.join(state, BUDDY_APP_NAME),
        skillCache,
        buddyDataDir,
        notebookHome,
      ],
      electronPaths,
      storeCwd: userData,
    }
  }

  // Keep Stable/development defaults and configured database precedence intact.
  const development = shouldUseDevRuntimeIsolation(input)
  const environmentOverrides = development
    ? resolveDevRuntimeEnvironment(input.userDataPath, pathApi)
    : {}
  const dataHome =
    resolveConfiguredDesktopPath(input.envXdgDataHome) ??
    (development
      ? pathApi.join(input.userDataPath, DEV_XDG_DIRECTORY_NAME, RUNTIME_ROOT_SEGMENTS.data)
      : pathApi.join(input.home, ...XDG_DEFAULT_SEGMENTS.data))
  const buddyDataDir =
    resolveConfiguredDesktopPath(input.envBuddyDataDir) ??
    pathApi.join(dataHome, BUDDY_APP_NAME)
  return {
    kind: development ? "development" : "production",
    notebookHome: pathApi.join(input.home, ...DEFAULT_NOTEBOOK_HOME_SEGMENTS),
    buddyDataDir,
    openCodeSqlitePath: pathApi.join(
      buddyDataDir,
      BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME,
      BUDDY_OPENCODE_DB_FILENAME,
    ),
    environmentOverrides,
    directoriesToCreate: Object.values(environmentOverrides),
  }
}

const BETA_INHERITED_STORAGE_ENV = [
  BUDDY_ENV.CONFIG,
  BUDDY_ENV.CONFIG_CONTENT,
  "OPENCODE_CONFIG",
  "OPENCODE_CONFIG_CONTENT",
  "OPENCODE_AUTH_CONTENT",
  BUDDY_ENV.RUNTIME_ROOT,
  OPENCODE_ENV.DISABLE_CHANNEL_DB,
  BUDDY_ENV.TEST_HOME,
  BUDDY_ENV.TEST_XDG_ROOT,
  "OPENCODE_TEST_HOME",
  BACKEND_DEVELOPMENT_RELOAD_SIGNAL_ENV,
  BACKEND_DEVELOPMENT_RELOAD_ACKNOWLEDGEMENT_ENV,
  BUDDY_ENV.OPENAI_AUTH_TRACE_FILE,
] as const

/** Apply storage policy after all app/shell env merging, including Windows casing. */
export function applyDesktopStorageEnvironment(
  environment: Readonly<Record<string, string>>,
  plan: DesktopStoragePlan,
  platform: NodeJS.Platform,
): Record<string, string> {
  const result = { ...environment }
  if (plan.kind === "beta") {
    const normalize = (key: string) => (platform === "win32" ? key.toUpperCase() : key)
    const replacedKeys = new Set(
      [...BETA_INHERITED_STORAGE_ENV, ...Object.keys(plan.environmentOverrides)].map(normalize),
    )
    for (const key of Object.keys(result)) {
      if (replacedKeys.has(normalize(key))) delete result[key]
    }
  }
  return Object.assign(result, plan.environmentOverrides)
}

/** Resolve the Buddy data root using the same policy as backend startup. */
export function resolveBuddyDataDir(input: Omit<DesktopStoragePlanInput, "documentsPath">): string {
  return resolveDesktopStoragePlan({
    ...input,
    documentsPath: (input.pathApi ?? path).join(input.home, "Documents"),
  }).buddyDataDir
}

/** Resolve the startup database without inspecting another distribution's data. */
export function resolveOpenCodeSqlitePath(input: Omit<DesktopStoragePlanInput, "documentsPath">): string {
  return resolveDesktopStoragePlan({
    ...input,
    documentsPath: (input.pathApi ?? path).join(input.home, "Documents"),
  }).openCodeSqlitePath
}

class DesktopStoragePathError extends Error {
  readonly _tag = "DesktopStoragePathError" as const

  constructor(readonly directory: string, cause: unknown) {
    super(`Buddy storage directory is not writable: ${directory}`, { cause })
  }
}

/** The result of provisioning desktop storage, with no fallback directory. */
export type DesktopStoragePreparationResult =
  | { readonly type: "ok" }
  | { readonly type: "err"; readonly error: DesktopStoragePathError }

/** Create storage roots and verify Beta can write before any service uses them. */
export function prepareDesktopStorageDirectories(
  plan: DesktopStoragePlan,
): DesktopStoragePreparationResult {
  for (const directory of plan.directoriesToCreate) {
    try {
      fs.mkdirSync(directory, { recursive: true })
      if (plan.kind === "beta") {
        const probe = fs.mkdtempSync(path.join(directory, ".buddy-storage-probe-"))
        fs.rmdirSync(probe)
      }
    } catch (cause) {
      return { type: "err", error: new DesktopStoragePathError(directory, cause) }
    }
  }
  return { type: "ok" }
}
