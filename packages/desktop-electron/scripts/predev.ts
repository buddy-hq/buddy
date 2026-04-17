import { $ } from "bun"
import { rmSync } from "node:fs"
import path from "node:path"
import {
  copyBinaryToResources,
  getCurrentSidecar,
  syncBackendRuntimeResources,
  syncMigrations,
  windowsify,
} from "./utils"

await $`bun ./scripts/copy-icons.ts ${process.env.BUDDY_CHANNEL ?? "dev"}`

const packageDir = path.resolve(import.meta.dir, "..")
const viteCacheDirectory = path.resolve(packageDir, "node_modules/.vite")
const backendDir = path.resolve(packageDir, "../buddy")
const config = getCurrentSidecar()
const source = path.resolve(
  backendDir,
  "dist/desktop-sidecar/bin",
  windowsify("buddy-backend", config.rustTarget),
)
const runtimeSourceDir = path.resolve(backendDir, "dist/desktop-sidecar/app")

// Ensure renderer dependency graph is rebuilt after workspace dependency changes.
rmSync(viteCacheDirectory, { recursive: true, force: true })

await $`bun run --cwd ${backendDir} ensure:advanced-math-runtime`
await $`bun run --cwd ${backendDir} build:desktop-sidecar`
const destination = copyBinaryToResources(source, config.rustTarget)
const entrypoint = syncBackendRuntimeResources(runtimeSourceDir, config.rustTarget)
syncMigrations()

console.log(`Copied Buddy sidecar to ${destination}`)
console.log(`Copied Buddy backend entrypoint to ${entrypoint}`)
