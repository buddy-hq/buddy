import path from "node:path"
import { buildCompiledBuddyBinary } from "./build-compiled-binary"

const backendDir = path.resolve(import.meta.dir, "..")
const outputFile = path.resolve(backendDir, "dist/desktop-sidecar/bin/buddy-backend")
const bundleOutputFile = path.resolve(backendDir, "dist/desktop-sidecar/app/index.js")

const built = await buildCompiledBuddyBinary({
  bundleOutputFile,
  outputFile,
})

console.log(
  `Built sidecar at ${built.outputFile} with runtime entry ${built.bundleOutputFile} (buddy migrations: ${built.buddyMigrationCount}, opencode migrations: ${built.opencodeMigrationCount})`,
)
