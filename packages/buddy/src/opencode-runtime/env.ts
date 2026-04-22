import fs from "node:fs"
import path from "node:path"
import {
  BUDDY_APP_NAME,
  resolveConfiguredPath,
  resolveDefaultBuddyGlobalConfigDir,
} from "../storage/constants"

function runtimeRoot() {
  const configured = process.env.BUDDY_RUNTIME_ROOT?.trim()
  if (configured && configured !== "undefined") {
    try {
      return path.resolve(decodeURIComponent(configured))
    } catch {
      return path.resolve(configured)
    }
  }

  return path.resolve(process.cwd(), ".buddy-runtime/xdg")
}

const runtimeRootPath = runtimeRoot()
const DEFAULT_OPENCODE_CLIENT = "web"
const OPENCODE_ENABLE_FLAG = "1"

export const BUDDY_XDG_DATA_HOME = path.join(runtimeRootPath, "data")
export const BUDDY_XDG_CACHE_HOME = path.join(runtimeRootPath, "cache")
export const BUDDY_XDG_CONFIG_HOME = path.join(runtimeRootPath, "config")
export const BUDDY_XDG_STATE_HOME = path.join(runtimeRootPath, "state")
export const BUDDY_RUNTIME_CONFIG_DIR = path.join(BUDDY_XDG_CONFIG_HOME, BUDDY_APP_NAME)
export const BUDDY_DEFAULT_GLOBAL_CONFIG_DIR = resolveDefaultBuddyGlobalConfigDir()

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

export function configureOpenCodeEnvironment() {
  const buddyConfigDir =
    resolveConfiguredPath(process.env.BUDDY_GLOBAL_CONFIG_DIR) ?? BUDDY_DEFAULT_GLOBAL_CONFIG_DIR

  process.env.XDG_DATA_HOME = BUDDY_XDG_DATA_HOME
  process.env.XDG_CACHE_HOME = BUDDY_XDG_CACHE_HOME
  process.env.XDG_CONFIG_HOME = BUDDY_XDG_CONFIG_HOME
  process.env.XDG_STATE_HOME = BUDDY_XDG_STATE_HOME
  process.env.BUDDY_GLOBAL_CONFIG_DIR = buddyConfigDir
  process.env.OPENCODE_CONFIG_DIR = buddyConfigDir
  process.env.OPENCODE_DISABLE_CHANNEL_DB ||= "1"
  process.env.OPENCODE_DISABLE_EXTERNAL_SKILLS ||= "1"
  process.env.OPENCODE_CLIENT ||= DEFAULT_OPENCODE_CLIENT
  process.env.OPENCODE_ENABLE_QUESTION_TOOL ||= OPENCODE_ENABLE_FLAG
  process.env.OPENCODE_ENABLE_EXA ||= "1"
  applyOptionalPathEnv("BUDDY_MIGRATION_DIR", findRepoPath("packages/buddy/migration"))
}

configureOpenCodeEnvironment()
