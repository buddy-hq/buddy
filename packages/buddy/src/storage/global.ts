import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  BUDDY_APP_NAME,
  BUDDY_ENV,
  XDG_DEFAULT_SEGMENTS,
  XDG_ENV,
  resolveConfiguredPath,
  resolveDefaultBuddyGlobalConfigDir,
} from "./constants"

function resolveXdgDirectory(envName: string, fallbackSegments: readonly string[]) {
  return resolveConfiguredPath(process.env[envName]) ?? path.join(os.homedir(), ...fallbackSegments)
}

function buildPaths(input: { data: string; cache: string; config: string; state: string }) {
  return {
    data: input.data,
    cache: input.cache,
    config: input.config,
    state: input.state,
    log: path.join(input.data, "log"),
    bin: path.join(input.data, "bin"),
  }
}

const preferred = buildPaths({
  data: path.resolve(
    resolveConfiguredPath(process.env[BUDDY_ENV.DATA_DIR]) ??
      path.join(
        resolveXdgDirectory(XDG_ENV.DATA_HOME, XDG_DEFAULT_SEGMENTS.data),
        BUDDY_APP_NAME,
      ),
  ),
  cache: path.resolve(
    resolveConfiguredPath(process.env[BUDDY_ENV.CACHE_DIR]) ??
      path.join(
        resolveXdgDirectory(XDG_ENV.CACHE_HOME, XDG_DEFAULT_SEGMENTS.cache),
        BUDDY_APP_NAME,
      ),
  ),
  config: path.resolve(
    resolveConfiguredPath(process.env[BUDDY_ENV.GLOBAL_CONFIG_DIR]) ??
      resolveDefaultBuddyGlobalConfigDir(),
  ),
  state: path.resolve(
    resolveConfiguredPath(process.env[BUDDY_ENV.STATE_DIR]) ??
      path.join(
        resolveXdgDirectory(XDG_ENV.STATE_HOME, XDG_DEFAULT_SEGMENTS.state),
        BUDDY_APP_NAME,
      ),
  ),
})

let current = preferred

function isInsidePath(directory: string, root: string) {
  const relative = path.relative(root, directory)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function assertTestPathsIsolated(paths: typeof preferred) {
  if (process.env.NODE_ENV !== "test") return

  const testHome = resolveConfiguredPath(process.env[BUDDY_ENV.TEST_HOME])
  if (!testHome) {
    throw new Error(`Buddy tests must set ${BUDDY_ENV.TEST_HOME} before storage is imported.`)
  }

  const testXdgRoot = resolveConfiguredPath(process.env[BUDDY_ENV.TEST_XDG_ROOT])
  if (!testXdgRoot) {
    throw new Error(`Buddy tests must set ${BUDDY_ENV.TEST_XDG_ROOT} before storage is imported.`)
  }

  const realHome = os.homedir()
  const allowedRoots = [testHome, testXdgRoot].map((root) => path.resolve(root))
  const mutablePaths = [paths.data, paths.cache, paths.config, paths.state]

  for (const target of mutablePaths) {
    const resolved = path.resolve(target)
    const underAllowedRoot = allowedRoots.some((root) => isInsidePath(resolved, root))
    const underRealHome = isInsidePath(resolved, realHome)

    if (underRealHome && !underAllowedRoot) {
      throw new Error(`Buddy test storage path resolves under the real home directory: ${resolved}`)
    }

    if (!underAllowedRoot) {
      throw new Error(`Buddy test storage path resolves outside isolated test roots: ${resolved}`)
    }
  }
}

class GlobalStoragePathError extends Error {
  constructor(paths: typeof preferred, cause: unknown) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause)
    super(
      [
        "Buddy global storage paths are not writable.",
        `data=${paths.data}`,
        `cache=${paths.cache}`,
        `config=${paths.config}`,
        `state=${paths.state}`,
        causeMessage,
      ].join(" "),
    )
    this.name = "GlobalStoragePathError"
  }
}

function ensurePaths(paths: typeof preferred) {
  for (const target of [paths.data, paths.cache, paths.config, paths.state, paths.log, paths.bin]) {
    fs.mkdirSync(target, { recursive: true })
  }
}

function assertPathsWritable(paths: typeof preferred) {
  const targets = [paths.data, paths.cache, paths.config, paths.state, paths.log, paths.bin]
  for (const target of targets) {
    fs.accessSync(target, fs.constants.W_OK | fs.constants.X_OK)
    const probe = path.join(target, `.buddy-write-test-${process.pid}-${Date.now()}`)
    fs.writeFileSync(probe, "")
    fs.unlinkSync(probe)
  }
}

export namespace Global {
  export const Path = {
    get home() {
      return process.env[BUDDY_ENV.TEST_HOME] || os.homedir()
    },
    get data() {
      return current.data
    },
    get cache() {
      return current.cache
    },
    get config() {
      return current.config
    },
    get state() {
      return current.state
    },
    get log() {
      return current.log
    },
    get bin() {
      return current.bin
    },
  }

  export function ensure() {
    try {
      assertTestPathsIsolated(current)
      ensurePaths(current)
      assertPathsWritable(current)
    } catch (error) {
      throw new GlobalStoragePathError(current, error)
    }
  }
}

Global.ensure()
