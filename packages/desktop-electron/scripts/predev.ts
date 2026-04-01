import { $ } from "bun"
import path from "node:path"
import { copyBinaryToResources, getCurrentSidecar, windowsify } from "./utils"

await $`bun ./scripts/copy-icons.ts ${process.env.BUDDY_CHANNEL ?? "dev"}`

const packageDir = path.resolve(import.meta.dir, "..")
const backendDir = path.resolve(packageDir, "../buddy")
const config = getCurrentSidecar()
const source = path.resolve(
  backendDir,
  "dist/desktop-sidecar/bin",
  windowsify("buddy-backend", config.rustTarget),
)

await $`bun run --cwd ${backendDir} ensure:advanced-math-runtime`
await $`bun run --cwd ${backendDir} build:desktop-sidecar`
const destination = copyBinaryToResources(source, config.rustTarget)

console.log(`Copied Buddy sidecar to ${destination}`)
