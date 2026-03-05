import { mkdirSync, rmSync } from "node:fs"
import path from "node:path"
import {
  RELEASE_SIDECAR_BINARIES,
  currentTargetTriple,
  getCurrentSidecar,
  windowsify,
} from "../../desktop/scripts/utils"
import { buildCompiledBuddyBinary } from "./build-compiled-binary"

const BACKEND_DIR = path.resolve(import.meta.dir, "..")
const DIST_DIR = path.resolve(BACKEND_DIR, "dist/release-sidecars")
const args = process.argv.slice(2)
const targetIndex = args.indexOf("--target")
const requestedTarget = targetIndex >= 0 ? args[targetIndex + 1] : undefined
const selected = args.includes("--all")
  ? RELEASE_SIDECAR_BINARIES
  : [requestedTarget ? getCurrentSidecar(requestedTarget) : getCurrentSidecar(currentTargetTriple())]

rmSync(DIST_DIR, { recursive: true, force: true })
mkdirSync(DIST_DIR, { recursive: true })

for (const config of selected) {
  const outputDir = path.resolve(DIST_DIR, config.sidecarDir, "bin")
  const bundleOutputFile = path.resolve(DIST_DIR, config.sidecarDir, "app", "index.js")
  const outputFile = path.resolve(outputDir, windowsify("buddy-backend", config.rustTarget))

  mkdirSync(outputDir, { recursive: true })
  const built = await buildCompiledBuddyBinary({
    bundleOutputFile,
    outputFile,
    target: config.bunTarget,
  })
  console.log(`Built ${config.rustTarget} sidecar at ${outputFile}`)
  if (built.bundleOutputFile) {
    console.log(`Built ${config.rustTarget} runtime entry at ${built.bundleOutputFile}`)
  }
  console.log(
    `Embedded migrations: buddy=${built.buddyMigrationCount}, opencode=${built.opencodeMigrationCount}`,
  )
}
