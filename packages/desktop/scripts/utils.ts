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
  syncBundledBackendResources,
  syncBundledMigrations,
} from "../../../script/desktop-runtime-resources"
import {
  RELEASE_SIDECAR_BINARIES as SHARED_RELEASE_SIDECAR_BINARIES,
  SIDECAR_BINARIES as SHARED_SIDECAR_BINARIES,
  currentDesktopRustTarget,
  getSidecarTargetByRustTarget,
  isWindowsRustTarget,
  resolveDesktopRustTarget,
  windowsifyBinaryName,
} from "../../../script/desktop-sidecar-targets"

const DESKTOP_DIR = path.resolve(import.meta.dir, "..")
const SIDECARS_DIR = path.resolve(DESKTOP_DIR, "src-tauri/sidecars")
const RESOURCES_DIR = path.resolve(DESKTOP_DIR, "src-tauri/resources/migrations")
const BACKEND_RESOURCES_DIR = path.resolve(DESKTOP_DIR, "src-tauri/resources/backend")
const DESKTOP_PACKAGE_JSON = path.resolve(DESKTOP_DIR, "package.json")

export const SIDECAR_BINARIES = SHARED_SIDECAR_BINARIES
export const RELEASE_SIDECAR_BINARIES = SHARED_RELEASE_SIDECAR_BINARIES

export const BUDDY_RUST_TARGET = resolveDesktopRustTarget(Bun.env)

export function currentTargetTriple() {
  return currentDesktopRustTarget()
}

export function isAppleTarget(target = BUDDY_RUST_TARGET ?? currentTargetTriple()) {
  return target.includes("apple-darwin")
}

export function resolveAppleSigningIdentity(
  env: NodeJS.ProcessEnv,
  target = BUDDY_RUST_TARGET ?? currentTargetTriple(),
) {
  if (!isAppleTarget(target)) {
    return undefined
  }

  const identity = env.APPLE_SIGNING_IDENTITY?.trim()
  if (identity) {
    return identity
  }

  if (env.APPLE_CERTIFICATE?.trim()) {
    return undefined
  }

  return "-"
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

export function copyBinaryToSidecarFolder(
  source: string,
  target = BUDDY_RUST_TARGET ?? currentTargetTriple(),
) {
  if (!existsSync(source)) {
    throw new Error(`Buddy sidecar build missing at ${source}`)
  }

  const config = getCurrentSidecar(target)
  const primaryTarget = path.resolve(
    SIDECARS_DIR,
    windowsify(`buddy-backend-${config.rustTarget}`, config.rustTarget),
  )
  const compatibilityTarget = path.resolve(
    SIDECARS_DIR,
    windowsify("buddy-backend", config.rustTarget),
  )

  mkdirSync(SIDECARS_DIR, { recursive: true })
  copyFileSync(source, primaryTarget)
  copyFileSync(source, compatibilityTarget)

  if (!isWindowsTarget(target)) {
    chmodSync(primaryTarget, 0o755)
    chmodSync(compatibilityTarget, 0o755)
  }

  return {
    compatibilityTarget,
    primaryTarget,
  }
}

export function syncMigrations() {
  return syncBundledMigrations(RESOURCES_DIR)
}

export function syncBackendRuntimeResources(
  sourceDir: string,
  target = BUDDY_RUST_TARGET ?? currentTargetTriple(),
) {
  return syncBundledBackendResources({
    destinationDir: BACKEND_RESOURCES_DIR,
    sourceDir,
    target,
  })
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
