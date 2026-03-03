import { $ } from "bun"
import path from "path"
import { copyBinaryToSidecarFolder, getCurrentSidecar, syncMigrations, windowsify } from "./utils"

const desktopDir = path.resolve(import.meta.dir, "..")
const backendDir = path.resolve(desktopDir, "../buddy")
const config = getCurrentSidecar()
const source = path.resolve(backendDir, "dist/desktop-sidecar/bin", windowsify("buddy-backend", config.rustTarget))

await $`bun run --cwd ${backendDir} build:desktop-sidecar`
const copied = copyBinaryToSidecarFolder(source, config.rustTarget)
syncMigrations()

console.log(`Copied Buddy sidecar to ${copied.primaryTarget}`)
