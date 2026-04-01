import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import {
  currentDesktopRustTarget,
  getSidecarTargetByRustTarget,
  isWindowsRustTarget,
  resolveDesktopRustTarget,
  SIDECAR_BINARIES as SHARED_SIDECAR_BINARIES,
  windowsifyBinaryName,
  type DesktopSidecarTarget,
} from "../../../script/desktop-sidecar-targets"

export type Channel = "dev" | "beta" | "prod"

export type SidecarBinary = DesktopSidecarTarget

const PACKAGE_DIR = path.resolve(import.meta.dir, "..")
const PACKAGE_JSON_PATH = path.resolve(PACKAGE_DIR, "package.json")

export const SIDECAR_BINARIES: SidecarBinary[] = SHARED_SIDECAR_BINARIES

export const BUDDY_RUST_TARGET = resolveDesktopRustTarget(Bun.env)

export function resolveChannel(): Channel {
  const raw = Bun.env.BUDDY_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
}

export function currentTargetTriple() {
  return currentDesktopRustTarget()
}

export function getCurrentSidecar(target = BUDDY_RUST_TARGET ?? currentTargetTriple()) {
  return getSidecarTargetByRustTarget(target)
}

export function isWindowsTarget(target = BUDDY_RUST_TARGET ?? currentTargetTriple()) {
  return isWindowsRustTarget(target)
}

export function windowsify(filepath: string, target = BUDDY_RUST_TARGET ?? currentTargetTriple()) {
  return windowsifyBinaryName(filepath, target)
}

export function copyBinaryToResources(source: string, target = currentTargetTriple()) {
  if (!existsSync(source)) {
    throw new Error(`Buddy sidecar build missing at ${source}`)
  }

  const resourcesDir = path.resolve(PACKAGE_DIR, "resources")
  mkdirSync(resourcesDir, { recursive: true })

  const destination = path.resolve(resourcesDir, windowsify("buddy-backend", target))
  copyFileSync(source, destination)

  if (!isWindowsTarget(target)) {
    chmodSync(destination, 0o755)
  }

  return destination
}

export function updateDesktopPackageVersion(version: string) {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
    version: string
  }
  pkg.version = version
  writeFileSync(PACKAGE_JSON_PATH, `${JSON.stringify(pkg, null, 2)}\n`)
}

export function readDesktopPackageVersion() {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
    version: string
  }
  return pkg.version
}
