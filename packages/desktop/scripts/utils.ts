import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
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
const BACKEND_DIR = path.resolve(DESKTOP_DIR, "../buddy")
const SIDECARS_DIR = path.resolve(DESKTOP_DIR, "src-tauri/sidecars")
const RESOURCES_DIR = path.resolve(DESKTOP_DIR, "src-tauri/resources/migrations")
const BACKEND_RESOURCES_DIR = path.resolve(DESKTOP_DIR, "src-tauri/resources/backend")
const DESKTOP_PACKAGE_JSON = path.resolve(DESKTOP_DIR, "package.json")
const BUDDY_MIGRATION_SOURCE = path.resolve(BACKEND_DIR, "migration")
const OPENCODE_PACKAGE_JSON = path.resolve(
  BACKEND_DIR,
  "../../vendor/opencode/packages/opencode/package.json",
)

const WATCHER_BINDING_BY_TARGET: Record<string, { packageName: string; os: string; cpu: string }> =
  {
    "aarch64-apple-darwin": {
      packageName: "@parcel/watcher-darwin-arm64",
      os: "darwin",
      cpu: "arm64",
    },
    "x86_64-apple-darwin": {
      packageName: "@parcel/watcher-darwin-x64",
      os: "darwin",
      cpu: "x64",
    },
    "x86_64-pc-windows-msvc": {
      packageName: "@parcel/watcher-win32-x64",
      os: "win32",
      cpu: "x64",
    },
    "x86_64-unknown-linux-gnu": {
      packageName: "@parcel/watcher-linux-x64-glibc",
      os: "linux",
      cpu: "x64",
    },
    "aarch64-unknown-linux-gnu": {
      packageName: "@parcel/watcher-linux-arm64-glibc",
      os: "linux",
      cpu: "arm64",
    },
  }

function getWatcherBinding(target: string) {
  return WATCHER_BINDING_BY_TARGET[target]
}

function packageVersion(name: string) {
  const pkg = JSON.parse(readFileSync(OPENCODE_PACKAGE_JSON, "utf8")) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }

  return pkg.dependencies?.[name] ?? pkg.devDependencies?.[name] ?? "latest"
}

function installWatcherBinding(target: string, destinationDir: string) {
  const binding = getWatcherBinding(target)
  if (!binding) {
    return
  }

  const packageDirName = binding.packageName.replace("@parcel/", "")
  const workspaceSource = path.resolve(
    BACKEND_DIR,
    "../..",
    "vendor/opencode/packages/opencode/node_modules/@parcel",
    packageDirName,
  )
  const targetDir = path.resolve(destinationDir, "node_modules/@parcel", packageDirName)

  mkdirSync(path.dirname(targetDir), { recursive: true })

  if (existsSync(workspaceSource)) {
    cpSync(workspaceSource, targetDir, { recursive: true, dereference: true })
    return
  }

  const tempDir = mkdtempSync(path.join(os.tmpdir(), "buddy-parcel-watcher-"))
  const tempPackageJson = path.resolve(tempDir, "package.json")
  writeFileSync(tempPackageJson, "{}\n")

  const packageSpec = `${binding.packageName}@${packageVersion(binding.packageName)}`
  const install = spawnSync(
    "bun",
    [
      "add",
      "--silent",
      "--no-save",
      "--exact",
      "--cwd",
      tempDir,
      "--os",
      binding.os,
      "--cpu",
      binding.cpu,
      packageSpec,
    ],
    {
      encoding: "utf8",
    },
  )

  try {
    if (install.status !== 0) {
      const message =
        install.stderr ||
        install.stdout ||
        `bun add failed with code ${install.status ?? "unknown"}`
      throw new Error(`Failed to install ${packageSpec} for ${target}: ${message}`)
    }

    const installedSource = path.resolve(tempDir, "node_modules/@parcel", packageDirName)
    if (!existsSync(installedSource)) {
      throw new Error(`Installed watcher binding was not found at ${installedSource}`)
    }

    cpSync(installedSource, targetDir, { recursive: true, dereference: true })
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

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
  rmSync(RESOURCES_DIR, { recursive: true, force: true })
  mkdirSync(RESOURCES_DIR, { recursive: true })
  cpSync(BUDDY_MIGRATION_SOURCE, path.resolve(RESOURCES_DIR, "buddy"), { recursive: true })
  return RESOURCES_DIR
}

export function syncBackendRuntimeResources(
  sourceDir: string,
  target = BUDDY_RUST_TARGET ?? currentTargetTriple(),
) {
  if (!existsSync(sourceDir)) {
    throw new Error(`Buddy backend runtime directory missing at ${sourceDir}`)
  }

  rmSync(BACKEND_RESOURCES_DIR, { recursive: true, force: true })
  mkdirSync(BACKEND_RESOURCES_DIR, { recursive: true })
  cpSync(sourceDir, BACKEND_RESOURCES_DIR, { recursive: true, dereference: true })

  const sourceEntrypoint = path.resolve(BACKEND_RESOURCES_DIR, "index.js")
  if (!existsSync(sourceEntrypoint)) {
    throw new Error(`Buddy backend runtime entry missing at ${sourceEntrypoint}`)
  }

  installWatcherBinding(target, BACKEND_RESOURCES_DIR)

  const targetEntrypoint = path.resolve(BACKEND_RESOURCES_DIR, "buddy-backend.js")
  copyFileSync(sourceEntrypoint, targetEntrypoint)
  return targetEntrypoint
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
