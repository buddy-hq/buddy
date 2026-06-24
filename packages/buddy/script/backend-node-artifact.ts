import { existsSync, realpathSync } from "node:fs"
import path from "node:path"

const CHONKIE_WASM_RELATIVE_PATH = ["pkg", "chonkiejs_chunk_bg.wasm"] as const
const NODE_PTY_PACKAGE = "@lydell/node-pty"
const PACKAGE_MANIFEST = "package.json"

export type BackendNodeArtifactTarget = {
  arch: string
  platform: string
}

export function currentBackendNodeArtifactTarget(): BackendNodeArtifactTarget {
  return {
    arch: process.arch,
    platform: process.platform,
  }
}

export function nodePtyNativePackageName(target: BackendNodeArtifactTarget): string {
  return `${NODE_PTY_PACKAGE}-${target.platform}-${target.arch}`
}

export function parcelWatcherNativePackageName(target: BackendNodeArtifactTarget): string {
  const libcSuffix = target.platform === "linux" ? "-glibc" : ""
  return `@parcel/watcher-${target.platform}-${target.arch}${libcSuffix}`
}

export function backendNodeRuntimePackageNames(target: BackendNodeArtifactTarget): string[] {
  return [NODE_PTY_PACKAGE, nodePtyNativePackageName(target), parcelWatcherNativePackageName(target)]
}

export function runtimePackagePath(artifactDir: string, packageName: string): string {
  return path.join(artifactDir, "node_modules", ...packageName.split("/"))
}

export function assertPathInsideDirectory(input: {
  directory: string
  pathToCheck: string
}): void {
  const directoryRealPath = realpathSync(input.directory)
  const checkedRealPath = realpathSync(input.pathToCheck)
  const rootPrefix = directoryRealPath.endsWith(path.sep)
    ? directoryRealPath
    : `${directoryRealPath}${path.sep}`

  if (checkedRealPath !== directoryRealPath && !checkedRealPath.startsWith(rootPrefix)) {
    throw new Error(`${input.pathToCheck} resolves outside ${input.directory}`)
  }
}

export function assertRuntimePackageInArtifact(input: {
  artifactDir: string
  packageName: string
}): string {
  const packageRoot = runtimePackagePath(input.artifactDir, input.packageName)
  const manifestPath = path.join(packageRoot, PACKAGE_MANIFEST)
  if (!existsSync(manifestPath)) {
    throw new Error(`Buddy Node artifact is missing ${input.packageName} at ${packageRoot}`)
  }

  assertPathInsideDirectory({
    directory: input.artifactDir,
    pathToCheck: manifestPath,
  })

  return manifestPath
}

export function assertBackendNodeArtifactRuntimeFiles(input: {
  artifactDir: string
  target: BackendNodeArtifactTarget
}): void {
  const entrypoint = path.join(input.artifactDir, "node.js")
  if (!existsSync(entrypoint)) {
    throw new Error(`Buddy Node artifact entrypoint missing at ${entrypoint}`)
  }

  const chonkieWasmPath = path.join(input.artifactDir, ...CHONKIE_WASM_RELATIVE_PATH)
  if (!existsSync(chonkieWasmPath)) {
    throw new Error(`Buddy Node artifact is missing Chonkie WASM at ${chonkieWasmPath}`)
  }

  for (const packageName of backendNodeRuntimePackageNames(input.target)) {
    assertRuntimePackageInArtifact({
      artifactDir: input.artifactDir,
      packageName,
    })
  }
}
