import { spawnSync } from "node:child_process"
import path from "node:path"
import {
  copyBinaryToResources,
  getCurrentSidecar,
  syncBackendRuntimeResources,
  syncKnowledgeGraphAssets,
  syncMigrations,
  updateDesktopPackageVersion,
  windowsify,
} from "./utils"

function verifyKnowledgeGraphArtifact(backendDir: string) {
  const sourcePath = Bun.env.BUDDY_KNOWLEDGE_GRAPH_DB_SOURCE?.trim()
  if (sourcePath) {
    return
  }

  const verify = spawnSync("bun", ["run", "--cwd", backendDir, "verify:knowledge-graph"], {
    encoding: "utf8",
    env: process.env,
  })

  if (verify.status === 0) {
    return
  }

  const output = [verify.stdout, verify.stderr]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .join("\n")
  throw new Error(
    output ||
      "Failed to verify the committed Knowledge Graph artifact for desktop release preparation.",
  )
}

const version = Bun.env.BUDDY_VERSION?.trim()
if (!version) {
  throw new Error("BUDDY_VERSION is required for release preparation")
}

const artifactDir = Bun.env.BUDDY_SIDECAR_ARTIFACT_DIR?.trim()
if (!artifactDir) {
  throw new Error("BUDDY_SIDECAR_ARTIFACT_DIR is required for release preparation")
}

const target = Bun.env.BUDDY_RUST_TARGET ?? Bun.env.RUST_TARGET
const backendDir = path.resolve(import.meta.dir, "../../buddy")
const config = getCurrentSidecar(target)
const source = path.resolve(
  artifactDir,
  config.sidecarDir,
  "bin",
  windowsify("buddy-backend", config.rustTarget),
)
const runtimeSourceDir = path.resolve(artifactDir, config.sidecarDir, "app")

updateDesktopPackageVersion(version)
verifyKnowledgeGraphArtifact(backendDir)
const destination = copyBinaryToResources(source, config.rustTarget)
const entrypoint = syncBackendRuntimeResources(runtimeSourceDir, config.rustTarget)
syncMigrations()
const knowledgeGraphPath = syncKnowledgeGraphAssets()

console.log(`Prepared electron desktop release assets for ${config.rustTarget}`)
console.log(`Copied Buddy sidecar to ${destination}`)
console.log(`Copied Buddy backend entrypoint to ${entrypoint}`)
console.log(`Copied Knowledge Graph asset bundle to ${knowledgeGraphPath}`)
