import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs"
import path from "node:path"

const CHONKIE_WASM_RELATIVE_PATH = ["pkg", "chonkiejs_chunk_bg.wasm"] as const
const PHOTON_WASM_PATTERN = /^photon_rs_bg(?:-[a-z0-9]+)?\.wasm$/i
const JSONC_PARSER_PACKAGE = "jsonc-parser"
const NODE_PTY_PACKAGE = "@lydell/node-pty"
const NPM_ARBORIST_PACKAGE = "@npmcli/arborist"
const AWS_CREDENTIAL_PROVIDERS_PACKAGE = "@aws-sdk/credential-providers"
const NODE_GYP_PACKAGE = "node-gyp"
const PINO_PACKAGE = "pino"
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
  return [
    JSONC_PARSER_PACKAGE,
    NODE_PTY_PACKAGE,
    nodePtyNativePackageName(target),
    parcelWatcherNativePackageName(target),
    NPM_ARBORIST_PACKAGE,
    AWS_CREDENTIAL_PROVIDERS_PACKAGE,
    NODE_GYP_PACKAGE,
    PINO_PACKAGE,
  ]
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

  if (!readdirSync(input.artifactDir).some((name) => PHOTON_WASM_PATTERN.test(name))) {
    throw new Error(`Buddy Node artifact is missing Photon WASM in ${input.artifactDir}`)
  }

  for (const packageName of backendNodeRuntimePackageNames(input.target)) {
    assertRuntimePackageInArtifact({
      artifactDir: input.artifactDir,
      packageName,
    })
  }
}

export function assertArtifactFileDoesNotContain(input: {
  artifactFile: string
  forbiddenText: string
}): void {
  if (!existsSync(input.artifactFile)) {
    throw new Error(`Buddy Node artifact file missing at ${input.artifactFile}`)
  }

  if (!input.forbiddenText) return

  const content = readFileSync(input.artifactFile, "utf8")
  if (content.includes(input.forbiddenText)) {
    throw new Error(
      `Buddy Node artifact contains forbidden local path ${input.forbiddenText}: ${input.artifactFile}`,
    )
  }
}
