import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { xdgCache, xdgData, xdgState } from "xdg-basedir"
import {
  BUDDY_APP_NAME,
  resolveConfiguredPath,
  resolveDefaultBuddyGlobalConfigDir,
} from "./constants"

function withFallback(value: string | undefined, fallback: string) {
  return value ?? fallback
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
    process.env.BUDDY_DATA_DIR ??
      path.join(withFallback(xdgData, path.join(os.homedir(), ".local", "share")), BUDDY_APP_NAME),
  ),
  cache: path.resolve(
    process.env.BUDDY_CACHE_DIR ??
      path.join(withFallback(xdgCache, path.join(os.homedir(), ".cache")), BUDDY_APP_NAME),
  ),
  config: path.resolve(
    resolveConfiguredPath(process.env.BUDDY_GLOBAL_CONFIG_DIR) ??
      resolveDefaultBuddyGlobalConfigDir(),
  ),
  state: path.resolve(
    process.env.BUDDY_STATE_DIR ??
      path.join(withFallback(xdgState, path.join(os.homedir(), ".local", "state")), BUDDY_APP_NAME),
  ),
})

let current = preferred

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
      return process.env.BUDDY_TEST_HOME || os.homedir()
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
      ensurePaths(current)
      assertPathsWritable(current)
    } catch (error) {
      throw new GlobalStoragePathError(current, error)
    }
  }
}

Global.ensure()
