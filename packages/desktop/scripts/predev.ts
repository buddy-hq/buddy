import { $ } from "bun"
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "fs"
import path from "path"

const desktopDir = path.resolve(import.meta.dir, "..")
const backendDir = path.resolve(desktopDir, "../buddy")
const binaryName = process.platform === "win32" ? "buddy-backend.exe" : "buddy-backend"
const source = path.resolve(backendDir, `dist/desktop-sidecar/bin/${binaryName}`)
const targetDir = path.resolve(desktopDir, "src-tauri/sidecars")
const resourcesDir = path.resolve(desktopDir, "src-tauri/resources/migrations")
const buddyMigrationSource = path.resolve(backendDir, "migration")
const opencodeMigrationSource = path.resolve(backendDir, "../../vendor/opencode/packages/opencode/migration")

function currentTargetTriple() {
  if (process.platform === "darwin" && process.arch === "arm64") return "aarch64-apple-darwin"
  if (process.platform === "darwin" && process.arch === "x64") return "x86_64-apple-darwin"
  if (process.platform === "linux" && process.arch === "arm64") return "aarch64-unknown-linux-gnu"
  if (process.platform === "linux" && process.arch === "x64") return "x86_64-unknown-linux-gnu"
  if (process.platform === "win32" && process.arch === "x64") return "x86_64-pc-windows-msvc"
  throw new Error(`Unsupported desktop target: ${process.platform}/${process.arch}`)
}

const targetTriple = process.env.TAURI_ENV_TARGET_TRIPLE ?? currentTargetTriple()
const sidecarBaseName = `buddy-backend-${targetTriple}${process.platform === "win32" ? ".exe" : ""}`
const primaryTarget = path.resolve(targetDir, sidecarBaseName)
const compatibilityTarget = path.resolve(targetDir, binaryName)

await $`bun run --cwd ${backendDir} build:desktop-sidecar`

if (!existsSync(source)) {
  throw new Error(`Buddy sidecar build missing at ${source}`)
}

mkdirSync(targetDir, { recursive: true })
copyFileSync(source, primaryTarget)
copyFileSync(source, compatibilityTarget)

rmSync(resourcesDir, { recursive: true, force: true })
mkdirSync(resourcesDir, { recursive: true })
cpSync(buddyMigrationSource, path.resolve(resourcesDir, "buddy"), { recursive: true })
cpSync(opencodeMigrationSource, path.resolve(resourcesDir, "opencode"), { recursive: true })

console.log(`Copied Buddy sidecar to ${primaryTarget}`)
