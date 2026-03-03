import path from "node:path"
import { copyBinaryToSidecarFolder, getCurrentSidecar, syncMigrations, updateDesktopPackageVersion, windowsify } from "./utils"

const version = Bun.env.BUDDY_VERSION?.trim()
if (!version) {
  throw new Error("BUDDY_VERSION is required for release preparation")
}

const artifactDir = Bun.env.BUDDY_SIDECAR_ARTIFACT_DIR?.trim()
if (!artifactDir) {
  throw new Error("BUDDY_SIDECAR_ARTIFACT_DIR is required for release preparation")
}

const target = Bun.env.BUDDY_RUST_TARGET ?? Bun.env.RUST_TARGET ?? Bun.env.TAURI_ENV_TARGET_TRIPLE
const config = getCurrentSidecar(target)
const source = path.resolve(artifactDir, config.sidecarDir, "bin", windowsify("buddy-backend", config.rustTarget))

updateDesktopPackageVersion(version)
copyBinaryToSidecarFolder(source, config.rustTarget)
syncMigrations()

console.log(`Prepared desktop release assets for ${config.rustTarget}`)
