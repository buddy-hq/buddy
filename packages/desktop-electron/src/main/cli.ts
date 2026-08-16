import { existsSync, mkdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { app } from "electron"
import { OPENCODE_DB_FILENAME } from "@buddy/script/channel"
import { BUDDY_ENV, OPENCODE_ENV } from "@buddy/script/storage-env"
import { APP_PROTOCOL, BACKEND_SERVER_USERNAME, CHANNEL } from "./constants"
import { parseTString } from "../shared/parse-external"
import { getUserShell, loadShellEnv, mergeShellEnv } from "./shell-env"
import {
  resolveAllowedDirectoryRoots,
  resolveDefaultNotebookHome,
  resolveDevRuntimeEnvironment,
  shouldUseDevRuntimeIsolation,
} from "./storage-paths"

const ADVANCED_MATH_LOCAL_ASSET_PATH_SEGMENTS = ["dist", "advanced-math-runtime"] as const
const STANDARDS_LOCAL_ASSET_PATH_SEGMENTS = ["resources", "knowledge-graph"] as const
const BACKEND_SOURCE_RESOURCES_PATH_SEGMENTS = ["src"] as const
const DEVELOPMENT_TESSDATA_PATH_SEGMENTS = ["resources", "tessdata"] as const
const BUNDLED_MIGRATIONS_DIRECTORY_NAME = "migrations"
const BUDDY_MIGRATION_DIRECTORY_NAME = "buddy"
const OPENAI_AUTH_TRACE_FILENAME = "openai-auth-debug.jsonl"
const DEVELOPMENT_BACKEND_PACKAGE_NAME = "buddy"
const DEVELOPMENT_BACKEND_ENTRYPOINT_PATH_SEGMENTS = ["src", "index.ts"] as const
const DEVELOPMENT_BACKEND_MIGRATION_PATH_SEGMENTS = ["migration"] as const

function resourcesDirectory() {
  if (app.isPackaged) {
    return process.resourcesPath
  }
  return path.join(import.meta.dirname, "../../resources")
}

function getBundledBuddyMigrationDir() {
  const migrationDir = path.join(
    resourcesDirectory(),
    BUNDLED_MIGRATIONS_DIRECTORY_NAME,
    BUDDY_MIGRATION_DIRECTORY_NAME,
  )
  if (!existsSync(migrationDir)) {
    throw new Error(`Bundled Buddy migration directory not found at ${migrationDir}`)
  }
  return migrationDir
}

function getBundledBackendResourcesDir() {
  const resourcesDir = path.join(resourcesDirectory(), "backend")
  if (!existsSync(resourcesDir)) {
    throw new Error(`Bundled Buddy backend resources directory not found at ${resourcesDir}`)
  }
  return resourcesDir
}

function getBackendResourcesDir() {
  return (
    resolveDevelopmentBackendPath(BACKEND_SOURCE_RESOURCES_PATH_SEGMENTS) ??
    getBundledBackendResourcesDir()
  )
}

function getBundledTessdataDir() {
  const tessdataDir = path.join(resourcesDirectory(), "tessdata")
  if (!existsSync(tessdataDir)) {
    throw new Error(`Bundled Buddy tessdata directory not found at ${tessdataDir}`)
  }
  return tessdataDir
}

function getTessdataDir() {
  return (
    resolveDevelopmentBackendPath(DEVELOPMENT_TESSDATA_PATH_SEGMENTS) ?? getBundledTessdataDir()
  )
}

function resolveDevelopmentBackendRoot() {
  if (app.isPackaged) return undefined

  const candidates = [
    path.resolve(app.getAppPath(), "..", DEVELOPMENT_BACKEND_PACKAGE_NAME),
    path.resolve(process.cwd(), "..", DEVELOPMENT_BACKEND_PACKAGE_NAME),
  ]

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, ...DEVELOPMENT_BACKEND_ENTRYPOINT_PATH_SEGMENTS))) {
      return candidate
    }
  }

  return undefined
}

function resolveDevelopmentBackendPath(pathSegments: readonly string[]) {
  const backendRoot = resolveDevelopmentBackendRoot()
  if (!backendRoot) return undefined

  const candidate = path.join(backendRoot, ...pathSegments)
  return existsSync(candidate) ? candidate : undefined
}

function getBuddyMigrationDir() {
  return (
    resolveDevelopmentBackendPath(DEVELOPMENT_BACKEND_MIGRATION_PATH_SEGMENTS) ??
    getBundledBuddyMigrationDir()
  )
}

export async function buildRuntimeEnvironment(password: string, port: number) {
  const home = os.homedir()
  const shouldIsolateDevRuntime = shouldUseDevRuntimeIsolation({
    channel: CHANNEL,
    isPackaged: app.isPackaged,
  })
  const isolatedRuntimeEnvironment = shouldIsolateDevRuntime
    ? resolveDevRuntimeEnvironment(app.getPath("userData"))
    : {}
  const appEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => parseTString(entry[1]) !== undefined,
    ),
  )
  const shellEnvironment = process.platform === "win32" ? null : loadShellEnv(getUserShell())
  const base = mergeShellEnv(shellEnvironment, appEnvironment)
  delete base[BUDDY_ENV.RUNTIME_ROOT]
  delete base[BUDDY_ENV.DESKTOP_CALLBACK_URL]
  delete base[OPENCODE_ENV.DISABLE_CHANNEL_DB]
  ensureDirectories(Object.values(isolatedRuntimeEnvironment))

  const environment = new Map<string, string>(
    Object.entries(
      Object.assign(
        {
          ...base,
          ...isolatedRuntimeEnvironment,
          [BUDDY_ENV.SERVER_USERNAME]: BACKEND_SERVER_USERNAME,
          [BUDDY_ENV.SERVER_PASSWORD]: password,
          [OPENCODE_ENV.SERVER_USERNAME]: BACKEND_SERVER_USERNAME,
          [OPENCODE_ENV.SERVER_PASSWORD]: password,
          [BUDDY_ENV.APP_VERSION]: app.getVersion(),
          [BUDDY_ENV.BACKEND_RESOURCES_DIR]: getBackendResourcesDir(),
          [BUDDY_ENV.TESSDATA_DIR]: getTessdataDir(),
          [BUDDY_ENV.MIGRATION_DIR]: getBuddyMigrationDir(),
          [BUDDY_ENV.DIRECTORY_BASE]: resolveDefaultNotebookHome(home),
          [BUDDY_ENV.ALLOWED_DIRECTORY_ROOTS]: resolveAllowedDirectoryRoots({
            home,
          }),
          PORT: String(port),
          [OPENCODE_ENV.EXPERIMENTAL_ICON_DISCOVERY]: "true",
          [OPENCODE_ENV.EXPERIMENTAL_FILEWATCHER]: "true",
          [OPENCODE_ENV.DB]: OPENCODE_DB_FILENAME,
          [OPENCODE_ENV.CLIENT]: "desktop",
        },
        app.isPackaged
          ? { [BUDDY_ENV.DESKTOP_CALLBACK_URL]: `${APP_PROTOCOL}://auth/callback` }
          : undefined,
      ),
    ),
  )
  if (shouldIsolateDevRuntime) {
    environment.set(
      BUDDY_ENV.OPENAI_AUTH_TRACE_FILE,
      path.join(app.getPath("logs"), OPENAI_AUTH_TRACE_FILENAME),
    )
  }

  const advancedMathAssetDir = resolveDevelopmentAdvancedMathAssetDir()
  if (advancedMathAssetDir) {
    environment.set(BUDDY_ENV.ADVANCED_MATH_LOCAL_ASSET_DIR, advancedMathAssetDir)
  }

  const standardsAssetDir = resolveStandardsAssetDir()
  if (standardsAssetDir) {
    environment.set(BUDDY_ENV.STANDARDS_LOCAL_ASSET_DIR, standardsAssetDir)
  }

  return Object.fromEntries(environment)
}

function ensureDirectories(directories: string[]) {
  for (const directory of directories) {
    mkdirSync(directory, { recursive: true })
  }
}

function resolveDevelopmentAdvancedMathAssetDir() {
  return resolveDevelopmentBackendPath(ADVANCED_MATH_LOCAL_ASSET_PATH_SEGMENTS)
}

function resolveDevelopmentStandardsAssetDir() {
  return resolveDevelopmentBackendPath(STANDARDS_LOCAL_ASSET_PATH_SEGMENTS)
}

function resolveStandardsAssetDir() {
  const developmentAssetDir = resolveDevelopmentStandardsAssetDir()
  if (developmentAssetDir) return developmentAssetDir

  const bundledAssetDir = path.join(resourcesDirectory(), "knowledge-graph")
  if (existsSync(bundledAssetDir)) return bundledAssetDir

  return undefined
}

export function installCli(): Promise<string> {
  return Promise.reject(
    new Error("Buddy desktop does not currently provide a standalone CLI installer"),
  )
}
