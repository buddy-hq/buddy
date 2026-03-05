import { $ } from "bun"
import path from "path"
import { copyBinaryToSidecarFolder, getCurrentSidecar, syncBackendRuntimeResources, syncMigrations, windowsify } from "./utils"

const desktopDir = path.resolve(import.meta.dir, "..")
const backendDir = path.resolve(desktopDir, "../buddy")
const config = getCurrentSidecar()
const source = path.resolve(backendDir, "dist/desktop-sidecar/bin", windowsify("buddy-backend", config.rustTarget))
const runtimeSourceDir = path.resolve(backendDir, "dist/desktop-sidecar/app")

await $`bun run --cwd ${backendDir} build:desktop-sidecar`
const copied = copyBinaryToSidecarFolder(source, config.rustTarget)
const entrypoint = syncBackendRuntimeResources(runtimeSourceDir, config.rustTarget)
syncMigrations()

console.log(`Copied Buddy sidecar to ${copied.primaryTarget}`)
console.log(`Copied Buddy backend entrypoint to ${entrypoint}`)
