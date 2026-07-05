import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  BUDDY_APP_NAME,
  BUDDY_ENV,
  BUDDY_OPENCODE_DB_FILENAME,
  BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME,
  OPENCODE_ENV,
  RUNTIME_ROOT_SEGMENTS,
  XDG_DEFAULT_SEGMENTS,
  XDG_ENV,
  resolveConfiguredPath,
  resolveDefaultBuddyGlobalConfigDir,
} from "../storage/constants"

function runtimeRoot(): string | undefined {
  const configured = process.env[BUDDY_ENV.RUNTIME_ROOT]?.trim()
  if (configured && configured !== "undefined") {
    try {
      return path.resolve(decodeURIComponent(configured))
    } catch {
      return path.resolve(configured)
    }
  }

  if (process.env.NODE_ENV === "test") {
    return undefined
  }

  return undefined
}

const DEFAULT_OPENCODE_CLIENT = "web"
const OPENCODE_ENABLE_FLAG = "1"
const runtimeRootPath = runtimeRoot()

function xdgPath(envName: string, fallback: string) {
  return resolveConfiguredPath(process.env[envName]) ?? path.resolve(fallback)
}

const BUDDY_XDG_DATA_HOME = runtimeRootPath
  ? path.join(runtimeRootPath, RUNTIME_ROOT_SEGMENTS.data)
  : xdgPath(XDG_ENV.DATA_HOME, path.join(os.homedir(), ...XDG_DEFAULT_SEGMENTS.data))
const BUDDY_XDG_CACHE_HOME = runtimeRootPath
  ? path.join(runtimeRootPath, RUNTIME_ROOT_SEGMENTS.cache)
  : xdgPath(XDG_ENV.CACHE_HOME, path.join(os.homedir(), ...XDG_DEFAULT_SEGMENTS.cache))
const BUDDY_XDG_CONFIG_HOME = runtimeRootPath
  ? path.join(runtimeRootPath, RUNTIME_ROOT_SEGMENTS.config)
  : xdgPath(XDG_ENV.CONFIG_HOME, path.join(os.homedir(), ...XDG_DEFAULT_SEGMENTS.config))
const BUDDY_XDG_STATE_HOME = runtimeRootPath
  ? path.join(runtimeRootPath, RUNTIME_ROOT_SEGMENTS.state)
  : xdgPath(XDG_ENV.STATE_HOME, path.join(os.homedir(), ...XDG_DEFAULT_SEGMENTS.state))
const BUDDY_TMP_PARENT_DIR = runtimeRootPath
  ? path.join(runtimeRootPath, RUNTIME_ROOT_SEGMENTS.tmp, BUDDY_APP_NAME)
  : path.join(os.tmpdir(), BUDDY_APP_NAME)
export const BUDDY_TMP_DIR = path.join(
  BUDDY_TMP_PARENT_DIR,
  BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME,
)
export const BUDDY_DEFAULT_GLOBAL_CONFIG_DIR = resolveDefaultBuddyGlobalConfigDir()
const BUDDY_DATA_DIR =
  resolveConfiguredPath(process.env[BUDDY_ENV.DATA_DIR]) ??
  path.join(BUDDY_XDG_DATA_HOME, BUDDY_APP_NAME)
const BUDDY_CACHE_DIR =
  resolveConfiguredPath(process.env[BUDDY_ENV.CACHE_DIR]) ??
  path.join(BUDDY_XDG_CACHE_HOME, BUDDY_APP_NAME)
const BUDDY_STATE_DIR =
  resolveConfiguredPath(process.env[BUDDY_ENV.STATE_DIR]) ??
  path.join(BUDDY_XDG_STATE_HOME, BUDDY_APP_NAME)

let openCodeGlobal: typeof import("@buddy/opencode-adapter/global").Global | undefined

function findRepoPath(relativePath: string): string | undefined {
  const searchRoots = [process.cwd(), path.dirname(process.execPath)]

  for (const root of searchRoots) {
    let current = path.resolve(root)

    while (true) {
      const candidate = path.join(current, relativePath)
      if (fs.existsSync(candidate)) {
        return candidate
      }

      const parent = path.dirname(current)
      if (parent === current) {
        break
      }
      current = parent
    }
  }

  return undefined
}

function applyOptionalPathEnv(name: string, resolvedPath: string | undefined) {
  const current = process.env[name]

  if (current && current !== "undefined") {
    return
  }

  if (resolvedPath) {
    process.env[name] = resolvedPath
    return
  }

  delete process.env[name]
}

function openCodeRuntimePaths(configDirectory: string) {
  const data = path.join(BUDDY_DATA_DIR, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME)
  const cache = path.join(BUDDY_CACHE_DIR, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME)
  const state = path.join(BUDDY_STATE_DIR, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME)

  return {
    data,
    cache,
    config: configDirectory,
    state,
    tmp: BUDDY_TMP_DIR,
    bin: path.join(cache, "bin"),
    log: path.join(data, "log"),
    repos: path.join(data, "repos"),
  }
}

function configureOpenCodeGlobalPaths(configDirectory: string) {
  const runtimePaths = openCodeRuntimePaths(configDirectory)
  for (const directory of [
    runtimePaths.data,
    runtimePaths.cache,
    runtimePaths.config,
    runtimePaths.state,
    runtimePaths.tmp,
    runtimePaths.bin,
    runtimePaths.log,
    runtimePaths.repos,
  ]) {
    fs.mkdirSync(directory, { recursive: true })
  }

  if (openCodeGlobal) {
    openCodeGlobal.Path.data = runtimePaths.data
    openCodeGlobal.Path.cache = runtimePaths.cache
    openCodeGlobal.Path.config = runtimePaths.config
    openCodeGlobal.Path.state = runtimePaths.state
    openCodeGlobal.Path.tmp = runtimePaths.tmp
    openCodeGlobal.Path.bin = runtimePaths.bin
    openCodeGlobal.Path.log = runtimePaths.log
    openCodeGlobal.Path.repos = runtimePaths.repos
  }
}

export function configureOpenCodeEnvironment() {
  const buddyConfigDir =
    resolveConfiguredPath(process.env[BUDDY_ENV.GLOBAL_CONFIG_DIR]) ??
    BUDDY_DEFAULT_GLOBAL_CONFIG_DIR

  if (runtimeRootPath) {
    process.env[XDG_ENV.DATA_HOME] = BUDDY_XDG_DATA_HOME
    process.env[XDG_ENV.CACHE_HOME] = BUDDY_XDG_CACHE_HOME
    process.env[XDG_ENV.CONFIG_HOME] = BUDDY_XDG_CONFIG_HOME
    process.env[XDG_ENV.STATE_HOME] = BUDDY_XDG_STATE_HOME
  }
  process.env[BUDDY_ENV.GLOBAL_CONFIG_DIR] = buddyConfigDir
  process.env[OPENCODE_ENV.CONFIG_DIR] = buddyConfigDir
  process.env[OPENCODE_ENV.DB] = BUDDY_OPENCODE_DB_FILENAME
  process.env[OPENCODE_ENV.DISABLE_EXTERNAL_SKILLS] ||= OPENCODE_ENABLE_FLAG
  process.env[OPENCODE_ENV.CLIENT] ||= DEFAULT_OPENCODE_CLIENT
  process.env[OPENCODE_ENV.ENABLE_QUESTION_TOOL] ||= OPENCODE_ENABLE_FLAG
  process.env[OPENCODE_ENV.ENABLE_EXA] ||= OPENCODE_ENABLE_FLAG
  applyOptionalPathEnv(BUDDY_ENV.MIGRATION_DIR, findRepoPath("packages/buddy/migration"))
  configureOpenCodeGlobalPaths(buddyConfigDir)
}

function applyTemporaryEnvironment(environment: Record<string, string>): () => void {
  const previous = new Map<string, string | undefined>()

  for (const [name, value] of Object.entries(environment)) {
    previous.set(name, process.env[name])
    process.env[name] = value
  }

  return () => {
    for (const [name, value] of previous) {
      if (value === undefined) {
        delete process.env[name]
        continue
      }

      process.env[name] = value
    }
  }
}

function openCodeImportEnvironment(): Record<string, string> {
  return {
    [XDG_ENV.DATA_HOME]: BUDDY_DATA_DIR,
    [XDG_ENV.CACHE_HOME]: BUDDY_CACHE_DIR,
    [XDG_ENV.CONFIG_HOME]: BUDDY_TMP_PARENT_DIR,
    [XDG_ENV.STATE_HOME]: BUDDY_STATE_DIR,
    TMPDIR: BUDDY_TMP_PARENT_DIR,
    TMP: BUDDY_TMP_PARENT_DIR,
    TEMP: BUDDY_TMP_PARENT_DIR,
  }
}

configureOpenCodeEnvironment()

const restoreOpenCodeImportEnvironment = applyTemporaryEnvironment(openCodeImportEnvironment())
try {
  const { Global } = await import("@buddy/opencode-adapter/global")
  openCodeGlobal = Global
} finally {
  restoreOpenCodeImportEnvironment()
}
configureOpenCodeEnvironment()
