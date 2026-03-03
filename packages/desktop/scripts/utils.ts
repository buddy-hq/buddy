import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

const DESKTOP_DIR = path.resolve(import.meta.dir, "..")
const BACKEND_DIR = path.resolve(DESKTOP_DIR, "../buddy")
const SIDECARS_DIR = path.resolve(DESKTOP_DIR, "src-tauri/sidecars")
const RESOURCES_DIR = path.resolve(DESKTOP_DIR, "src-tauri/resources/migrations")
const DESKTOP_PACKAGE_JSON = path.resolve(DESKTOP_DIR, "package.json")
const BUDDY_MIGRATION_SOURCE = path.resolve(BACKEND_DIR, "migration")
const OPENCODE_MIGRATION_SOURCE = path.resolve(BACKEND_DIR, "../../vendor/opencode/packages/opencode/migration")

export const SIDECAR_BINARIES = [
  {
    rustTarget: "aarch64-apple-darwin",
    bunTarget: "bun-darwin-arm64",
    sidecarDir: "buddy-backend-darwin-arm64",
  },
  {
    rustTarget: "x86_64-apple-darwin",
    bunTarget: "bun-darwin-x64",
    sidecarDir: "buddy-backend-darwin-x64",
  },
  {
    rustTarget: "x86_64-pc-windows-msvc",
    bunTarget: "bun-windows-x64",
    sidecarDir: "buddy-backend-windows-x64",
  },
  {
    rustTarget: "x86_64-unknown-linux-gnu",
    bunTarget: "bun-linux-x64",
    sidecarDir: "buddy-backend-linux-x64",
  },
  {
    rustTarget: "aarch64-unknown-linux-gnu",
    bunTarget: "bun-linux-arm64",
    sidecarDir: "buddy-backend-linux-arm64",
  },
] as const

export const RELEASE_SIDECAR_BINARIES = SIDECAR_BINARIES.filter((item) =>
  !item.rustTarget.includes("linux"),
)

export const BUDDY_RUST_TARGET = Bun.env.BUDDY_RUST_TARGET ?? Bun.env.RUST_TARGET ?? Bun.env.TAURI_ENV_TARGET_TRIPLE

export function currentTargetTriple() {
  if (process.platform === "darwin" && process.arch === "arm64") return "aarch64-apple-darwin"
  if (process.platform === "darwin" && process.arch === "x64") return "x86_64-apple-darwin"
  if (process.platform === "linux" && process.arch === "arm64") return "aarch64-unknown-linux-gnu"
  if (process.platform === "linux" && process.arch === "x64") return "x86_64-unknown-linux-gnu"
  if (process.platform === "win32" && process.arch === "x64") return "x86_64-pc-windows-msvc"
  throw new Error(`Unsupported desktop target: ${process.platform}/${process.arch}`)
}

export function getCurrentSidecar(target = BUDDY_RUST_TARGET ?? currentTargetTriple()) {
  const binary = SIDECAR_BINARIES.find((item) => item.rustTarget === target)
  if (!binary) {
    throw new Error(`Sidecar configuration not available for Rust target '${target}'`)
  }
  return binary
}

export function isWindowsTarget(target = BUDDY_RUST_TARGET ?? currentTargetTriple()) {
  return target.includes("windows")
}

export function windowsify(filepath: string, target = BUDDY_RUST_TARGET ?? currentTargetTriple()) {
  if (filepath.endsWith(".exe")) return filepath
  return isWindowsTarget(target) ? `${filepath}.exe` : filepath
}

export function copyBinaryToSidecarFolder(source: string, target = BUDDY_RUST_TARGET ?? currentTargetTriple()) {
  if (!existsSync(source)) {
    throw new Error(`Buddy sidecar build missing at ${source}`)
  }

  const config = getCurrentSidecar(target)
  const primaryTarget = path.resolve(SIDECARS_DIR, windowsify(`buddy-backend-${config.rustTarget}`, config.rustTarget))
  const compatibilityTarget = path.resolve(SIDECARS_DIR, windowsify("buddy-backend", config.rustTarget))

  mkdirSync(SIDECARS_DIR, { recursive: true })
  copyFileSync(source, primaryTarget)
  copyFileSync(source, compatibilityTarget)

  return {
    compatibilityTarget,
    primaryTarget,
  }
}

export function syncMigrations() {
  rmSync(RESOURCES_DIR, { recursive: true, force: true })
  mkdirSync(RESOURCES_DIR, { recursive: true })
  cpSync(BUDDY_MIGRATION_SOURCE, path.resolve(RESOURCES_DIR, "buddy"), { recursive: true })
  cpSync(OPENCODE_MIGRATION_SOURCE, path.resolve(RESOURCES_DIR, "opencode"), { recursive: true })
  return RESOURCES_DIR
}

export function updateDesktopPackageVersion(version: string) {
  const pkg = JSON.parse(readFileSync(DESKTOP_PACKAGE_JSON, "utf8")) as {
    version: string
  }
  pkg.version = version
  writeFileSync(DESKTOP_PACKAGE_JSON, `${JSON.stringify(pkg, null, 2)}\n`)
}

export function readDesktopPackageVersion() {
  const pkg = JSON.parse(readFileSync(DESKTOP_PACKAGE_JSON, "utf8")) as {
    version: string
  }
  return pkg.version
}
