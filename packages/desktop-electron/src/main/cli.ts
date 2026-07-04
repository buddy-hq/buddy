import { existsSync, mkdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { app } from "electron"
import { BUDDY_ENV, OPENCODE_ENV } from "@buddy/script/storage-env"
import { BACKEND_SERVER_USERNAME, CHANNEL } from "./constants"
import { getUserShell, loadShellEnv, mergeShellEnv } from "./shell-env"
import {
  resolveAllowedDirectoryRoots,
  resolveDefaultNotebookHome,
  resolveDevXdgEnvironment,
  shouldUseDevRuntimeIsolation,
} from "./storage-paths"

const ADVANCED_MATH_LOCAL_ASSET_PATH_SEGMENTS = ["dist", "advanced-math-runtime"] as const
const STANDARDS_LOCAL_ASSET_PATH_SEGMENTS = ["resources", "knowledge-graph"] as const
const BUNDLED_MIGRATIONS_DIRECTORY_NAME = "migrations"
const BUDDY_MIGRATION_DIRECTORY_NAME = "buddy"
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

function getBundledTessdataDir() {
  const tessdataDir = path.join(resourcesDirectory(), "tessdata")
  if (!existsSync(tessdataDir)) {
    throw new Error(`Bundled Buddy tessdata directory not found at ${tessdataDir}`)
  }
  return tessdataDir
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

function getBuddyMigrationDir() {
  const backendRoot = resolveDevelopmentBackendRoot()
  if (backendRoot) {
    const migrationDir = path.join(backendRoot, ...DEVELOPMENT_BACKEND_MIGRATION_PATH_SEGMENTS)
    if (existsSync(migrationDir)) {
      return migrationDir
    }
  }

  return getBundledBuddyMigrationDir()
}

export async function buildRuntimeEnvironment(password: string, port: number) {
  const home = os.homedir()
  const appEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  )
  const shellEnvironment = process.platform === "win32" ? null : loadShellEnv(getUserShell())
  const base = mergeShellEnv(shellEnvironment, appEnvironment)
  const devXdgEnvironment = shouldUseDevRuntimeIsolation({
    channel: CHANNEL,
    isPackaged: app.isPackaged,
  })
    ? resolveDevXdgEnvironment(app.getPath("userData"))
    : {}
  ensureDirectories(Object.values(devXdgEnvironment))

  const environment: Record<string, string> = {
    ...base,
    ...devXdgEnvironment,
    [BUDDY_ENV.SERVER_USERNAME]: BACKEND_SERVER_USERNAME,
    [BUDDY_ENV.SERVER_PASSWORD]: password,
    [OPENCODE_ENV.SERVER_USERNAME]: BACKEND_SERVER_USERNAME,
    [OPENCODE_ENV.SERVER_PASSWORD]: password,
    [BUDDY_ENV.APP_VERSION]: app.getVersion(),
    [BUDDY_ENV.BACKEND_RESOURCES_DIR]: getBundledBackendResourcesDir(),
    [BUDDY_ENV.TESSDATA_DIR]: getBundledTessdataDir(),
    [BUDDY_ENV.MIGRATION_DIR]: getBuddyMigrationDir(),
    [BUDDY_ENV.DIRECTORY_BASE]: resolveDefaultNotebookHome(home),
    [BUDDY_ENV.ALLOWED_DIRECTORY_ROOTS]: resolveAllowedDirectoryRoots({
      home,
    }),
    PORT: String(port),
    [OPENCODE_ENV.EXPERIMENTAL_ICON_DISCOVERY]: "true",
    [OPENCODE_ENV.EXPERIMENTAL_FILEWATCHER]: "true",
    [OPENCODE_ENV.CLIENT]: "desktop",
  }

  const advancedMathAssetDir = resolveDevelopmentAdvancedMathAssetDir()
  if (advancedMathAssetDir) {
    environment[BUDDY_ENV.ADVANCED_MATH_LOCAL_ASSET_DIR] = advancedMathAssetDir
  }

  const standardsAssetDir = resolveStandardsAssetDir()
  if (standardsAssetDir) {
    environment[BUDDY_ENV.STANDARDS_LOCAL_ASSET_DIR] = standardsAssetDir
  }

  return environment
}

function ensureDirectories(directories: string[]) {
  for (const directory of directories) {
    mkdirSync(directory, { recursive: true })
  }
}

function resolveDevelopmentAdvancedMathAssetDir() {
  if (app.isPackaged) return undefined

  const appPathCandidate = path.resolve(
    app.getAppPath(),
    "..",
    "buddy",
    ...ADVANCED_MATH_LOCAL_ASSET_PATH_SEGMENTS,
  )
  if (existsSync(appPathCandidate)) {
    return appPathCandidate
  }

  const cwdCandidate = path.resolve(
    process.cwd(),
    "..",
    "buddy",
    ...ADVANCED_MATH_LOCAL_ASSET_PATH_SEGMENTS,
  )
  if (existsSync(cwdCandidate)) {
    return cwdCandidate
  }

  return undefined
}

function resolveDevelopmentStandardsAssetDir() {
  if (app.isPackaged) return undefined

  const appPathCandidate = path.resolve(
    app.getAppPath(),
    "..",
    "buddy",
    ...STANDARDS_LOCAL_ASSET_PATH_SEGMENTS,
  )
  if (existsSync(appPathCandidate)) {
    return appPathCandidate
  }

  const cwdCandidate = path.resolve(
    process.cwd(),
    "..",
    "buddy",
    ...STANDARDS_LOCAL_ASSET_PATH_SEGMENTS,
  )
  if (existsSync(cwdCandidate)) {
    return cwdCandidate
  }

  return undefined
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
