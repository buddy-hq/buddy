import { realpathSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { pathToFileURL } from "node:url"

const MAIN_DIR_ENV = "BUDDY_NATIVE_PACKAGE_PROBE_MAIN_DIR"
const PACKAGE_NAME_ENV = "BUDDY_NATIVE_PACKAGE_PROBE_PACKAGE"

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(name + " is required")
  return value
}

const mainDir = realpathSync(path.resolve(requiredEnv(MAIN_DIR_ENV)))
const packageName = requiredEnv(PACKAGE_NAME_ENV)
const probeModuleUrl = pathToFileURL(path.join(mainDir, "chunks", "native-probe.mjs"))
const require = createRequire(probeModuleUrl)
const resolved = realpathSync(path.resolve(require.resolve(packageName)))

if (!resolved.startsWith(mainDir + path.sep)) {
  throw new Error(packageName + " resolved outside isolated Electron output: " + resolved)
}

require(packageName)
