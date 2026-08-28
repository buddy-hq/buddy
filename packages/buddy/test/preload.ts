import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { afterAll } from "bun:test"
import { TEST_SANDBOX } from "../../../script/test-preload"
import {
  POSIX_HOME_ENVIRONMENT_KEY,
  WINDOWS_HOME_ENVIRONMENT_KEY,
} from "../../../script/test-sandbox"
import { BUDDY_ENV, OPENCODE_ENV, XDG_ENV } from "../src/storage/constants"

const configuredRootValue = process.env[BUDDY_ENV.TEST_XDG_ROOT]?.trim()
const configuredRoot =
  configuredRootValue && !isInsidePath(configuredRootValue, TEST_SANDBOX.root)
    ? configuredRootValue
    : undefined
const root =
  configuredRoot && configuredRoot.length > 0
    ? path.resolve(configuredRoot)
    : path.join(TEST_SANDBOX.root, "xdg")
const runRoot = path.join(root, "test-runs", randomUUID())
const testHome = path.join(runRoot, "home")
const dataHome = path.join(runRoot, "data")
const cacheHome = path.join(runRoot, "cache")
const configHome = path.join(runRoot, "config")
const stateHome = path.join(runRoot, "state")

for (const directory of [testHome, dataHome, cacheHome, configHome, stateHome]) {
  fs.mkdirSync(directory, { recursive: true })
}

process.env[XDG_ENV.DATA_HOME] = dataHome
process.env[XDG_ENV.CACHE_HOME] = cacheHome
process.env[XDG_ENV.CONFIG_HOME] = configHome
process.env[XDG_ENV.STATE_HOME] = stateHome
process.env[BUDDY_ENV.TEST_HOME] = testHome
process.env[BUDDY_ENV.TEST_XDG_ROOT] = runRoot
process.env[POSIX_HOME_ENVIRONMENT_KEY] = testHome
process.env[WINDOWS_HOME_ENVIRONMENT_KEY] = testHome
process.env[BUDDY_ENV.DISABLE_SKILL_ARTIFACT_FETCH] = "1"
process.env[OPENCODE_ENV.DISABLE_DEFAULT_PLUGINS] = "1"
process.env[OPENCODE_ENV.DISABLE_MODELS_FETCH] = "1"
process.env[OPENCODE_ENV.DISABLE_EXTERNAL_SKILLS] = "1"
process.env[OPENCODE_ENV.CLIENT] = "web"

if (configuredRoot) {
  const cleanupConfiguredRunRoot = () => {
    fs.rmSync(runRoot, { recursive: true, force: true })
  }
  afterAll(cleanupConfiguredRunRoot)
  process.once("exit", cleanupConfiguredRunRoot)
}

function isInsidePath(directory: string, rootDirectory: string): boolean {
  const relative = path.relative(rootDirectory, directory)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}
