import { realpathSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

const mainDirectory = process.env.BUDDY_NATIVE_PACKAGE_PROBE_MAIN_DIR
const packageName = process.env.BUDDY_NATIVE_PACKAGE_PROBE_PACKAGE
if (!mainDirectory || !packageName) throw new Error("Credential native probe configuration missing")
if (packageName !== "@napi-rs/keyring" && packageName !== "@primno/dpapi") {
  throw new Error(`Unexpected credential package: ${packageName}`)
}
const root = realpathSync(mainDirectory)
const require = createRequire(path.join(root, "native-probe.cjs"))
const entry = realpathSync(
  packageName === "@primno/dpapi"
    ? path.join(
        root,
        "node_modules",
        "@primno",
        "dpapi",
        "prebuilds",
        `win32-${process.arch}`,
        "@primno+dpapi.node",
      )
    : require.resolve(packageName),
)
if (!entry.startsWith(root + path.sep)) {
  throw new Error(`${packageName} resolved outside isolated app.asar.unpacked: ${entry}`)
}
const loaded = require(entry)
if (
  packageName === "@napi-rs/keyring" &&
  Object.prototype.toString.call(loaded.Entry) !== "[object Function]"
) {
  throw new Error("Keyring did not export its native Entry constructor")
}
if (
  packageName === "@primno/dpapi" &&
  Object.prototype.toString.call(loaded.unprotectData) !== "[object Function]"
) {
  throw new Error("DPAPI did not load its Windows native binding")
}
const bindings = Object.keys(require.cache).filter((filename) => filename.endsWith(".node"))
if (bindings.length === 0) throw new Error(`${packageName} did not load a native binding`)
for (const filename of bindings) {
  if (!realpathSync(filename).startsWith(root + path.sep)) {
    throw new Error(
      `${packageName} loaded a binding outside isolated app.asar.unpacked: ${filename}`,
    )
  }
}
console.log(
  `Electron ${process.versions.electron} loaded ${packageName} from isolated app.asar.unpacked`,
)
