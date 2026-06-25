#!/usr/bin/env bun

import { $ } from "bun"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import {
  assertArtifactFileDoesNotContain,
  currentBackendNodeArtifactTarget,
  nodePtyNativePackageName,
  parcelWatcherNativePackageName,
} from "../../../script/backend-node-artifact"
import {
  BUNDLED_ADVANCED_MATH_RUNTIME_VERSION_DEFINE,
  computeAdvancedMathRuntimeVersion,
} from "../src/local-runtimes/advanced-math/version"

const backendDir = path.resolve(import.meta.dir, "..")
const repoRoot = path.resolve(backendDir, "../..")
const vendorCoreDir = path.resolve(repoRoot, "vendor/opencode/packages/core")
const vendorOpencodeDir = path.resolve(repoRoot, "vendor/opencode/packages/opencode")
const outdir = path.resolve(backendDir, "dist/node")
const require = createRequire(import.meta.url)
const TARGET_PLATFORM_ENV = "BUDDY_NODE_ARTIFACT_TARGET_PLATFORM"
const TARGET_ARCH_ENV = "BUDDY_NODE_ARTIFACT_TARGET_ARCH"
const NODE_MODULES_DIR = "node_modules" as const
const PACKAGE_MANIFEST = "package.json" as const
const BUN_STORE_DIR_NAME = ".bun" as const
const bunStoreDir = path.resolve(repoRoot, NODE_MODULES_DIR, BUN_STORE_DIR_NAME)
const target = currentBackendNodeArtifactTarget()
const nodePtyPackage = nodePtyNativePackageName(target)
const parcelWatcherBindingPackage = parcelWatcherNativePackageName(target)
const bundledAdvancedMathRuntimeVersion = computeAdvancedMathRuntimeVersion()
const chonkieWasmOutputPath = path.resolve(outdir, "pkg/chonkiejs_chunk_bg.wasm")

type RuntimePackageSpec = {
  name: string
  paths: string[]
  version?: string
}

type PackageManifest = {
  dependencies: Record<string, string>
  name: string
  optionalDependencies: Record<string, string>
  version: string
}

const runtimePackages: RuntimePackageSpec[] = [
  { name: "jsonc-parser", paths: [backendDir] },
  { name: "@lydell/node-pty", paths: [backendDir] },
  { name: nodePtyPackage, paths: [backendDir] },
  { name: parcelWatcherBindingPackage, paths: [vendorCoreDir] },
  { name: "@npmcli/arborist", paths: [vendorCoreDir] },
  { name: "@aws-sdk/credential-providers", paths: [vendorCoreDir, vendorOpencodeDir] },
  { name: "node-gyp", paths: [vendorCoreDir], version: nodeGypRuntimeVersion() },
  { name: "pino", paths: [backendDir] },
]

process.chdir(backendDir)

function validateRequestedTarget(): void {
  const targetPlatform = process.env[TARGET_PLATFORM_ENV]?.trim()
  if (targetPlatform && targetPlatform !== process.platform) {
    throw new Error(
      `${TARGET_PLATFORM_ENV}=${targetPlatform} does not match build host platform ${process.platform}`,
    )
  }

  const targetArch = process.env[TARGET_ARCH_ENV]?.trim()
  if (targetArch && targetArch !== process.arch) {
    throw new Error(
      `${TARGET_ARCH_ENV}=${targetArch} does not match build host architecture ${process.arch}`,
    )
  }
}

validateRequestedTarget()

rmSync(outdir, { recursive: true, force: true })
mkdirSync(outdir, { recursive: true })

const result = await Bun.build({
  conditions: ["node"],
  target: "node",
  format: "esm",
  minify: true,
  sourcemap: "none",
  entrypoints: ["./src/node.ts"],
  outdir,
  external: [
    "bufferutil",
    "utf-8-validate",
    ...runtimePackages.map((packageCopy) => packageCopy.name),
  ],
  loader: {
    ".md": "text",
    ".wasm": "file",
  },
  files: {
    "opencode-web-ui.gen.ts": "",
  },
  define: {
    [BUNDLED_ADVANCED_MATH_RUNTIME_VERSION_DEFINE]: JSON.stringify(
      bundledAdvancedMathRuntimeVersion,
    ),
  },
})

if (!result.success) {
  const summary = result.logs.map((log) => log.message).join("\n")
  throw new Error(summary || "Buddy Node backend build failed.")
}

await materializeRuntimePackages()
copyChonkieWasm()

assertArtifactFileDoesNotContain({
  artifactFile: path.resolve(outdir, "node.js"),
  forbiddenText: repoRoot,
})

console.log(`Built Buddy Node backend at ${path.resolve(outdir, "node.js")}`)
console.log(`Bundled advanced math runtime version ${bundledAdvancedMathRuntimeVersion}`)

async function materializeRuntimePackages(): Promise<void> {
  const dependencies = runtimeDependencyVersions()
  const manifest = {
    name: "@buddy/node-backend-runtime",
    private: true,
    type: "module",
    dependencies,
    overrides: dependencies,
  }

  writeFileSync(path.resolve(outdir, PACKAGE_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`)

  await $`bun install --cwd ${outdir} --production --backend=copyfile --linker=hoisted --ignore-scripts --no-save --no-progress`

  assertInstalledRuntimeDependencies(dependencies)
}

function runtimeDependencyVersions(): Record<string, string> {
  const dependencies: Record<string, string> = {}
  for (const packageCopy of runtimePackages) {
    dependencies[packageCopy.name] =
      packageCopy.version ??
      readPackageManifest(resolvePackageManifest(packageCopy.name, packageCopy.paths)).version
  }
  return dependencies
}

function assertInstalledRuntimeDependencies(dependencies: Record<string, string>): void {
  for (const [packageName, expectedVersion] of Object.entries(dependencies)) {
    const manifestPath = path.resolve(
      outdir,
      NODE_MODULES_DIR,
      ...packageNameSegments(packageName),
      PACKAGE_MANIFEST,
    )
    if (!existsSync(manifestPath)) {
      throw new Error(`Buddy Node artifact is missing runtime dependency ${packageName}`)
    }

    const manifest = readPackageManifest(manifestPath)
    if (manifest.version !== expectedVersion) {
      throw new Error(
        `Buddy Node artifact installed ${packageName}@${manifest.version}, expected ${expectedVersion}`,
      )
    }
  }
}

function resolvePackageManifest(packageName: string, paths: string[]): string {
  try {
    return realpathSync(require.resolve(`${packageName}/${PACKAGE_MANIFEST}`, { paths }))
  } catch {
    return highestInstalledPackageManifest(packageName)
  }
}

function nodeGypRuntimeVersion(): string {
  const npmRunScriptManifest = readPackageManifest(
    highestInstalledPackageManifest("@npmcli/run-script"),
  )
  const nodeGypRange = npmRunScriptManifest.dependencies["node-gyp"]
  if (!nodeGypRange) {
    throw new Error("@npmcli/run-script does not declare a node-gyp dependency")
  }

  return highestInstalledPackageVersionSatisfying("node-gyp", nodeGypRange)
}

function highestInstalledPackageManifest(packageName: string): string {
  const [candidate] = installedPackageCandidates(packageName).toSorted((left, right) =>
    comparePackageVersions(right.version, left.version),
  )
  if (!candidate) {
    throw new Error(`Unable to resolve runtime package ${packageName} from ${bunStoreDir}`)
  }

  return candidate.manifestPath
}

function highestInstalledPackageVersionSatisfying(packageName: string, range: string): string {
  const [candidate] = installedPackageCandidates(packageName)
    .filter((packageCandidate) => satisfiesDependencyRange(packageCandidate.version, range))
    .toSorted((left, right) => comparePackageVersions(right.version, left.version))
  if (!candidate) {
    throw new Error(
      `Unable to resolve runtime package ${packageName} satisfying ${range} from ${bunStoreDir}`,
    )
  }

  return candidate.version
}

function installedPackageCandidates(packageName: string): Array<{
  manifestPath: string
  version: string
}> {
  const encodedPackageName = packageName.replace("/", "+")
  const candidates: Array<{ manifestPath: string; version: string }> = []
  for (const entry of readdirSync(bunStoreDir)) {
    if (!entry.startsWith(`${encodedPackageName}@`)) continue
    const manifestPath = path.resolve(
      bunStoreDir,
      entry,
      NODE_MODULES_DIR,
      ...packageNameSegments(packageName),
      PACKAGE_MANIFEST,
    )
    if (!existsSync(manifestPath)) continue
    candidates.push({
      manifestPath: realpathSync(manifestPath),
      version: readPackageManifest(manifestPath).version,
    })
  }
  return candidates
}

function copyChonkieWasm(): void {
  const chonkieWasmInputPath = resolveChonkieWasmInputPath()
  mkdirSync(path.dirname(chonkieWasmOutputPath), { recursive: true })
  copyFileSync(chonkieWasmInputPath, chonkieWasmOutputPath)
}

function resolveChonkieWasmInputPath(): string {
  const chonkieCoreEntry = require.resolve("@chonkiejs/core", { paths: [backendDir] })
  const chonkieWasmPath = path.resolve(
    path.dirname(chonkieCoreEntry),
    "../../../@chonkiejs/chunk/pkg/chonkiejs_chunk_bg.wasm",
  )
  if (!existsSync(chonkieWasmPath)) {
    throw new Error(`Chonkie WASM runtime not found at ${chonkieWasmPath}`)
  }
  return chonkieWasmPath
}

function readPackageManifest(manifestPath: string): PackageManifest {
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"))
  if (!isObjectRecord(parsed)) {
    throw new Error(`Invalid package manifest at ${manifestPath}`)
  }

  const name = parsed.name
  const version = parsed.version
  if (typeof name !== "string" || typeof version !== "string") {
    throw new Error(`Package manifest is missing name/version at ${manifestPath}`)
  }

  return {
    dependencies: readStringRecord(parsed.dependencies),
    name,
    optionalDependencies: readStringRecord(parsed.optionalDependencies),
    version,
  }
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!isObjectRecord(value)) return {}

  const result: Record<string, string> = {}
  for (const [key, recordValue] of Object.entries(value)) {
    if (typeof recordValue === "string") {
      result[key] = recordValue
    }
  }
  return result
}

function isObjectRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null
}

function packageNameSegments(packageName: string): string[] {
  return packageName.split("/")
}

function comparePackageVersions(left: string, right: string): number {
  const leftParts = packageVersionParts(left)
  const rightParts = packageVersionParts(right)
  const maxParts = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < maxParts; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (delta !== 0) return delta
  }
  return left.localeCompare(right)
}

function packageVersionParts(version: string): number[] {
  return version
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part))
}

function satisfiesDependencyRange(version: string, range: string): boolean {
  try {
    return Bun.semver.satisfies(version, range)
  } catch {
    return false
  }
}
