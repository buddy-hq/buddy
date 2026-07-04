import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  BUDDY_APP_NAME,
  BUDDY_ENV,
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
export const BUDDY_TMP_DIR = runtimeRootPath
  ? path.join(runtimeRootPath, RUNTIME_ROOT_SEGMENTS.tmp)
  : path.join(os.tmpdir(), BUDDY_APP_NAME)
export const BUDDY_DEFAULT_GLOBAL_CONFIG_DIR = resolveDefaultBuddyGlobalConfigDir()

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

function configureOpenCodeGlobalPaths(configDirectory: string) {
  fs.mkdirSync(BUDDY_TMP_DIR, { recursive: true })
  if (openCodeGlobal) {
    openCodeGlobal.Path.config = configDirectory
    openCodeGlobal.Path.tmp = BUDDY_TMP_DIR
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
  process.env[OPENCODE_ENV.DISABLE_EXTERNAL_SKILLS] ||= OPENCODE_ENABLE_FLAG
  process.env[OPENCODE_ENV.CLIENT] ||= DEFAULT_OPENCODE_CLIENT
  process.env[OPENCODE_ENV.ENABLE_QUESTION_TOOL] ||= OPENCODE_ENABLE_FLAG
  process.env[OPENCODE_ENV.ENABLE_EXA] ||= OPENCODE_ENABLE_FLAG
  applyOptionalPathEnv(BUDDY_ENV.MIGRATION_DIR, findRepoPath("packages/buddy/migration"))
  configureOpenCodeGlobalPaths(buddyConfigDir)
}

configureOpenCodeEnvironment()

const { Global } = await import("@buddy/opencode-adapter/global")
openCodeGlobal = Global
configureOpenCodeEnvironment()
