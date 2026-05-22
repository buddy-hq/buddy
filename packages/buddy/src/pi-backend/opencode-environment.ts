import fs from "node:fs"
import path from "node:path"
import {
  resolveConfiguredPath,
  resolveDefaultBuddyGlobalConfigDir,
} from "../storage/constants"
import { Global as BuddyGlobal } from "../storage/global"

const DEFAULT_OPENCODE_CLIENT = "web"
const OPENCODE_ENABLE_FLAG = "1"
const OPENCODE_RUNTIME_DIRNAME = "opencode-runtime"
const OPENCODE_TOOL_OUTPUT_DIRNAME = "tool-output"

function runtimeRoot() {
  return (
    resolveConfiguredPath(process.env.BUDDY_RUNTIME_ROOT) ??
    path.join(BuddyGlobal.Path.state, OPENCODE_RUNTIME_DIRNAME)
  )
}

const runtimeRootPath = runtimeRoot()
const xdgRoot = path.join(runtimeRootPath, "xdg")
const xdgDataHome = path.join(xdgRoot, "data")
const xdgCacheHome = path.join(xdgRoot, "cache")
const xdgConfigHome = path.join(xdgRoot, "config")
const xdgStateHome = path.join(xdgRoot, "state")
const openCodeTmpDir = path.join(runtimeRootPath, "tmp")
const openCodeToolOutputDir = path.join(
  xdgDataHome,
  "opencode",
  OPENCODE_TOOL_OUTPUT_DIRNAME,
)

function ensureDirectory(directory: string) {
  fs.mkdirSync(directory, { recursive: true })
  return directory
}

function configureOpenCodeEnvironment() {
  const buddyConfigDir =
    resolveConfiguredPath(process.env.BUDDY_GLOBAL_CONFIG_DIR) ??
    resolveDefaultBuddyGlobalConfigDir()

  process.env.XDG_DATA_HOME = xdgDataHome
  process.env.XDG_CACHE_HOME = xdgCacheHome
  process.env.XDG_CONFIG_HOME = xdgConfigHome
  process.env.XDG_STATE_HOME = xdgStateHome
  process.env.BUDDY_GLOBAL_CONFIG_DIR = buddyConfigDir
  process.env.OPENCODE_CONFIG_DIR = buddyConfigDir
  process.env.OPENCODE_DISABLE_CHANNEL_DB ||= "1"
  process.env.OPENCODE_CLIENT ||= DEFAULT_OPENCODE_CLIENT
  process.env.OPENCODE_ENABLE_QUESTION_TOOL ||= OPENCODE_ENABLE_FLAG

  ensureDirectory(openCodeTmpDir)
  ensureDirectory(openCodeToolOutputDir)
}

configureOpenCodeEnvironment()

const { Global: OpenCodeGlobal } = await import("@buddy/opencode-adapter/global")
OpenCodeGlobal.Path.tmp = ensureDirectory(openCodeTmpDir)

export function buddyOpenCodeInternalDirectoryGlobs() {
  return [path.join(openCodeTmpDir, "*"), path.join(openCodeToolOutputDir, "*")]
}
