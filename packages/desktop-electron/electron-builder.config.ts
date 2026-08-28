import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { readBuddyReleaseChannel } from "@buddy/script/channel"
import {
  createElectronBuilderConfiguration,
  ELECTRON_BUILDER_RESOURCE_NAMES,
} from "./electron-builder-config"

const PACKAGE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = path.resolve(PACKAGE_DIRECTORY, "../..")

for (const name of ELECTRON_BUILDER_RESOURCE_NAMES.runtime) {
  const resourceDirectory = path.resolve(PACKAGE_DIRECTORY, "resources", name)
  if (!existsSync(resourceDirectory)) {
    throw new Error(
      `Required Electron runtime resource missing: resources/${name}. Run the desktop prebuild or prepare:release script before packaging.`,
    )
  }
}

for (const name of ELECTRON_BUILDER_RESOURCE_NAMES.legal) {
  const source = path.resolve(REPOSITORY_ROOT, name)
  if (!existsSync(source)) {
    throw new Error(`Required legal resource missing: ${source}`)
  }
}

export default createElectronBuilderConfiguration({
  channel: readBuddyReleaseChannel(),
  repositoryRoot: REPOSITORY_ROOT,
})
