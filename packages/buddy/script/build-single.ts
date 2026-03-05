import path from "node:path"
import { buildCompiledBuddyBinary } from "./build-compiled-binary"

const backendDir = path.resolve(import.meta.dir, "..")
const outputFile = path.resolve(backendDir, "dist/desktop-sidecar/bin/buddy-backend")

const built = await buildCompiledBuddyBinary({
  outputFile,
})

console.log(
  `Built sidecar at ${built.outputFile} (buddy migrations: ${built.buddyMigrationCount}, opencode migrations: ${built.opencodeMigrationCount})`,
)
