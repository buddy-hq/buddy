import path from "node:path"
import {
  copyBinaryToResources,
  getCurrentSidecar,
  syncBackendRuntimeResources,
  syncKnowledgeGraphResources,
  syncMigrations,
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
const runtimeSourceDir = path.resolve(artifactDir, config.sidecarDir, "app")

updateDesktopPackageVersion(version)
const destination = copyBinaryToResources(source, config.rustTarget)
const entrypoint = syncBackendRuntimeResources(runtimeSourceDir, config.rustTarget)
const knowledgeGraphArchive = syncKnowledgeGraphResources()
syncMigrations()

console.log(`Prepared electron desktop release assets for ${config.rustTarget}`)
console.log(`Copied Buddy sidecar to ${destination}`)
console.log(`Copied Buddy backend entrypoint to ${entrypoint}`)
console.log(`Copied Knowledge Graph bundle to ${knowledgeGraphArchive}`)
