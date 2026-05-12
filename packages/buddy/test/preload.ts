import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const configuredRoot = process.env.BUDDY_TEST_XDG_ROOT?.trim()
const root =
  configuredRoot && configuredRoot.length > 0
    ? path.resolve(configuredRoot)
    : path.join(os.tmpdir(), "buddy-test-xdg")
const runRoot = path.join(root, "test-runs", `${Date.now()}-${process.pid}`)
const testHome = path.join(runRoot, "home")
const dataHome = path.join(runRoot, "data")
const cacheHome = path.join(runRoot, "cache")
const configHome = path.join(runRoot, "config")
const stateHome = path.join(runRoot, "state")

for (const directory of [testHome, dataHome, cacheHome, configHome, stateHome]) {
  fs.mkdirSync(directory, { recursive: true })
}

process.env.XDG_DATA_HOME = dataHome
process.env.XDG_CACHE_HOME = cacheHome
process.env.XDG_CONFIG_HOME = configHome
process.env.XDG_STATE_HOME = stateHome
process.env.BUDDY_TEST_HOME = testHome
process.env.OPENCODE_DISABLE_DEFAULT_PLUGINS = "1"
process.env.OPENCODE_DISABLE_MODELS_FETCH = "1"
process.env.OPENCODE_DISABLE_EXTERNAL_SKILLS = "1"
process.env.OPENCODE_DISABLE_CHANNEL_DB = "1"
process.env.OPENCODE_CLIENT = "web"
