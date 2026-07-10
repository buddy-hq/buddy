import { existsSync, readdirSync } from "node:fs"
import path from "node:path"

const CHONKIE_WASM_RELATIVE_PATH = ["pkg", "chonkiejs_chunk_bg.wasm"] as const
const ENGLISH_TESSDATA_RELATIVE_PATH = ["resources", "tessdata", "eng.traineddata"] as const
const PHOTON_WASM_PATTERN = /^photon_rs_bg(?:-[a-z0-9]+)?\.wasm$/i
const DIRECTORY_NODE_MODULES = "node_modules" as const
export const LITEPARSE_PACKAGE_NAME = "@llamaindex/liteparse" as const
export const TYPESCRIPT_RUNTIME_PACKAGE_NAME = "typescript" as const

export type BackendNodeArtifactTarget = {
  arch: string
  platform: string
}

export type BuildOutputScan = {
  packagedNodeModules: string[]
}

export function currentBackendNodeArtifactTarget(): BackendNodeArtifactTarget {
  return {
    arch: process.arch,
    platform: process.platform,
  }
}

export function nodePtyNativePackageName(target: BackendNodeArtifactTarget): string {
  return `@lydell/node-pty-${target.platform}-${target.arch}`
}

export function parcelWatcherNativePackageName(target: BackendNodeArtifactTarget): string {
  const libcSuffix = target.platform === "linux" ? "-glibc" : ""
  return `@parcel/watcher-${target.platform}-${target.arch}${libcSuffix}`
}

export function liteParseNativePackageName(target: BackendNodeArtifactTarget): string {
  if (target.platform === "darwin") {
    return `@llamaindex/liteparse-darwin-${target.arch}`
  }
  if (target.platform === "win32") {
    return `@llamaindex/liteparse-win32-${target.arch}-msvc`
  }
  if (target.platform === "linux") {
    return `@llamaindex/liteparse-linux-${target.arch}-gnu`
  }
  throw new Error(`Unsupported LiteParse platform: ${target.platform}-${target.arch}`)
}

export function assertBackendNodeArtifactRuntimeFiles(input: { artifactDir: string }): void {
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

  const englishTessdataPath = path.join(input.artifactDir, ...ENGLISH_TESSDATA_RELATIVE_PATH)
  if (!existsSync(englishTessdataPath)) {
    throw new Error(`Buddy Node artifact is missing English tessdata at ${englishTessdataPath}`)
  }
}

export function scanBuildOutput(rootDir: string): BuildOutputScan {
  return {
    packagedNodeModules: listPackagedNodeModules(rootDir),
  }
}

function listPackagedNodeModules(rootDir: string): string[] {
  const packages = new Set<string>()
  const stack = [rootDir]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue

      const entryPath = path.join(current, entry.name)
      if (entry.name === DIRECTORY_NODE_MODULES) {
        for (const packageName of listPackagesInNodeModules(entryPath)) {
          packages.add(packageName)
        }
        continue
      }

      stack.push(entryPath)
    }
  }

  return [...packages].toSorted()
}

function listPackagesInNodeModules(nodeModulesDir: string): string[] {
  const packages: string[] = []
  for (const entry of readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (!entry.name.startsWith("@")) {
      packages.push(entry.name)
      continue
    }

    const scopeDir = path.join(nodeModulesDir, entry.name)
    for (const scopedEntry of readdirSync(scopeDir, { withFileTypes: true })) {
      if (!scopedEntry.isDirectory()) continue
      packages.push(`${entry.name}/${scopedEntry.name}`)
    }
  }

  return packages
}
