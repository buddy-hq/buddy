import path from "node:path"
import {
  copyBinaryToResources,
  getCurrentSidecar,
  updateDesktopPackageVersion,
  windowsify,
} from "./utils"

const version = Bun.env.BUDDY_VERSION?.trim()
if (!version) {
  throw new Error("BUDDY_VERSION is required for release preparation")
}

const artifactDir = Bun.env.BUDDY_SIDECAR_ARTIFACT_DIR?.trim()
if (!artifactDir) {
  throw new Error("BUDDY_SIDECAR_ARTIFACT_DIR is required for release preparation")
}

const target = Bun.env.BUDDY_RUST_TARGET ?? Bun.env.RUST_TARGET
const config = getCurrentSidecar(target)
const source = path.resolve(
  artifactDir,
  config.sidecarDir,
  "bin",
  windowsify("buddy-backend", config.rustTarget),
)

updateDesktopPackageVersion(version)
copyBinaryToResources(source, config.rustTarget)

console.log(`Prepared electron desktop release assets for ${config.rustTarget}`)
