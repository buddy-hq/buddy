import { existsSync, mkdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { app } from "electron"
import { BACKEND_SERVER_USERNAME } from "./constants"
import { getUserShell, loadShellEnv, mergeShellEnv } from "./shell-env"

const ADVANCED_MATH_LOCAL_ASSET_DIR_ENV = "BUDDY_ADVANCED_MATH_LOCAL_ASSET_DIR"
const BACKEND_NODE_ENTRY_ENV = "BUDDY_BACKEND_NODE_ENTRY"
const BACKEND_RESOURCES_DIR_ENV = "BUDDY_BACKEND_RESOURCES_DIR"
const STANDARDS_LOCAL_ASSET_DIR_ENV = "BUDDY_STANDARDS_LOCAL_ASSET_DIR"
const ADVANCED_MATH_LOCAL_ASSET_PATH_SEGMENTS = ["dist", "advanced-math-runtime"] as const
const BACKEND_NODE_ENTRY_PATH_SEGMENTS = ["dist", "node", "node.js"] as const
const STANDARDS_LOCAL_ASSET_PATH_SEGMENTS = ["resources", "knowledge-graph"] as const
const RUNTIME_SUBDIRECTORIES = ["data", "cache", "config", "state", "tmp"] as const
const OPENCODE_DATA_SUBDIRECTORY = "opencode"
const BUDDY_RUNTIME_DIRECTORY_NAME = ".buddy-runtime"
const BUDDY_RUNTIME_XDG_DIRECTORY_NAME = "xdg"
const BUNDLED_BACKEND_NODE_DIRECTORY_NAME = "backend-node"
const BUNDLED_MIGRATIONS_DIRECTORY_NAME = "migrations"
const BUDDY_MIGRATION_DIRECTORY_NAME = "buddy"
const DEVELOPMENT_BACKEND_PACKAGE_NAME = "buddy"
const DEVELOPMENT_BACKEND_ENTRYPOINT_PATH_SEGMENTS = ["src", "index.ts"] as const
const DEVELOPMENT_BACKEND_MIGRATION_PATH_SEGMENTS = ["migration"] as const
const DEFAULT_NOTEBOOK_HOME_SEGMENTS = ["Documents", "Buddy"] as const

function resourcesDirectory() {
  if (app.isPackaged) {
    return process.resourcesPath
  }
  return path.join(import.meta.dirname, "../../resources")
}

function resolveAllowedDirectoryRoots(input: { home: string; runtimeRoot: string }) {
  const configuredRoots = [
    path.join(input.home, ...DEFAULT_NOTEBOOK_HOME_SEGMENTS),
    input.runtimeRoot,
  ]

  return Array.from(new Set(configuredRoots)).join(",")
}

function resolveDefaultNotebookHome(home: string) {
  return path.join(home, ...DEFAULT_NOTEBOOK_HOME_SEGMENTS)
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

function getBundledBackendNodeEntry() {
  const entry = path.join(
    resourcesDirectory(),
    BUNDLED_BACKEND_NODE_DIRECTORY_NAME,
    "node.js",
  )
  if (!existsSync(entry)) {
    throw new Error(`Bundled Buddy Node backend entry not found at ${entry}`)
  }
  return entry
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

function resolveDevelopmentBackendNodeEntry() {
  const backendRoot = resolveDevelopmentBackendRoot()
  if (!backendRoot) return undefined

  const entry = path.join(backendRoot, ...BACKEND_NODE_ENTRY_PATH_SEGMENTS)
  if (!existsSync(entry)) return undefined
  return entry
}

function getBackendNodeEntry() {
  const developmentEntry = resolveDevelopmentBackendNodeEntry()
  if (developmentEntry) {
    return developmentEntry
  }

  return getBundledBackendNodeEntry()
}

export async function buildRuntimeEnvironment(password: string, port: number) {
  const runtimeRoot = resolveBuddyRuntimeRoot()
  const xdgDataHome = path.join(runtimeRoot, "data")
  const home = os.homedir()
  const appEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  )
  const shellEnvironment =
    process.platform === "win32" ? null : loadShellEnv(getUserShell())
  const base = mergeShellEnv(shellEnvironment, appEnvironment)

  ensureRuntimeDirectories(runtimeRoot, xdgDataHome)

  const environment: Record<string, string> = {
    ...base,
    [BACKEND_NODE_ENTRY_ENV]: getBackendNodeEntry(),
    BUDDY_SERVER_USERNAME: BACKEND_SERVER_USERNAME,
    BUDDY_SERVER_PASSWORD: password,
    OPENCODE_SERVER_USERNAME: BACKEND_SERVER_USERNAME,
    OPENCODE_SERVER_PASSWORD: password,
    BUDDY_APP_VERSION: app.getVersion(),
    [BACKEND_RESOURCES_DIR_ENV]: getBundledBackendResourcesDir(),
    BUDDY_MIGRATION_DIR: getBuddyMigrationDir(),
    BUDDY_DIRECTORY_BASE: resolveDefaultNotebookHome(home),
    BUDDY_ALLOWED_DIRECTORY_ROOTS: resolveAllowedDirectoryRoots({
      home,
      runtimeRoot,
    }),
    BUDDY_RUNTIME_ROOT: runtimeRoot,
    XDG_DATA_HOME: xdgDataHome,
    XDG_CACHE_HOME: path.join(runtimeRoot, "cache"),
    XDG_CONFIG_HOME: path.join(runtimeRoot, "config"),
    XDG_STATE_HOME: path.join(runtimeRoot, "state"),
    PORT: String(port),
    OPENCODE_EXPERIMENTAL_ICON_DISCOVERY: "true",
    OPENCODE_EXPERIMENTAL_FILEWATCHER: "true",
    OPENCODE_CLIENT: "desktop",
  }

  const advancedMathAssetDir = resolveDevelopmentAdvancedMathAssetDir()
  if (advancedMathAssetDir) {
    environment[ADVANCED_MATH_LOCAL_ASSET_DIR_ENV] = advancedMathAssetDir
  }

  const standardsAssetDir = resolveStandardsAssetDir()
  if (standardsAssetDir) {
    environment[STANDARDS_LOCAL_ASSET_DIR_ENV] = standardsAssetDir
  }

  return environment
}

function resolveBuddyRuntimeRoot() {
  return path.join(os.homedir(), BUDDY_RUNTIME_DIRECTORY_NAME, BUDDY_RUNTIME_XDG_DIRECTORY_NAME)
}

function ensureRuntimeDirectories(runtimeRoot: string, xdgDataHome: string) {
  mkdirSync(runtimeRoot, { recursive: true })

  for (const segment of RUNTIME_SUBDIRECTORIES) {
    mkdirSync(path.join(runtimeRoot, segment), { recursive: true })
  }

  mkdirSync(path.join(xdgDataHome, OPENCODE_DATA_SUBDIRECTORY), { recursive: true })
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
  return Promise.reject(new Error("Buddy desktop does not currently provide a standalone CLI installer"))
}
