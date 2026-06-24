#!/usr/bin/env bun

import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
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
const target = currentBackendNodeArtifactTarget()
const nodePtyPackage = nodePtyNativePackageName(target)
const parcelWatcherBindingPackage = parcelWatcherNativePackageName(target)
const copiedRuntimePackages = [
  { name: "jsonc-parser", paths: [backendDir] },
  { name: "@lydell/node-pty", paths: [backendDir] },
  { name: nodePtyPackage, paths: [backendDir] },
  { name: parcelWatcherBindingPackage, paths: [vendorCoreDir] },
] as const
// These packages intentionally stay Node-resolved instead of Bun-inlined. They
// either mirror vendor's runtime boundary (`node-gyp`) or contain CJS code that
// resolves sibling files/workers at runtime, which must remain relocatable in
// Electron's resources/backend-node directory.
const copiedRuntimePackageIslands = [
  { name: "@npmcli/arborist", paths: [vendorCoreDir] },
  { name: "@aws-sdk/credential-providers", paths: [vendorCoreDir, vendorOpencodeDir] },
  { name: "node-gyp", paths: [vendorCoreDir] },
  { name: "pino", paths: [backendDir] },
] as const
const bundledAdvancedMathRuntimeVersion = computeAdvancedMathRuntimeVersion()
const chonkieWasmOutputPath = path.resolve(outdir, "pkg/chonkiejs_chunk_bg.wasm")

process.chdir(backendDir)

function validateRequestedTarget() {
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
    ...copiedRuntimePackages.map((packageCopy) => packageCopy.name),
    ...copiedRuntimePackageIslands.map((packageCopy) => packageCopy.name),
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

for (const packageCopy of copiedRuntimePackages) {
  const packageJsonPath = require.resolve(`${packageCopy.name}/package.json`, {
    paths: [...packageCopy.paths],
  })
  const packageDir = path.dirname(packageJsonPath)
  const destinationDir = path.resolve(outdir, "node_modules", packageCopy.name)
  mkdirSync(path.dirname(destinationDir), { recursive: true })
  cpSync(packageDir, destinationDir, { recursive: true, dereference: true })
}

for (const packageCopy of copiedRuntimePackageIslands) {
  const packageJsonPath = resolvePackageManifest(packageCopy.name, [...packageCopy.paths])
  const packageNodeModulesDir = resolvePackageNodeModulesDir({
    packageJsonPath,
    packageName: packageCopy.name,
  })
  copyDirectoryContents(packageNodeModulesDir, path.resolve(outdir, "node_modules"))
}

function resolvePackageManifest(packageName: string, paths: string[]): string {
  try {
    return require.resolve(`${packageName}/package.json`, { paths })
  } catch {
    return resolveBunPackageManifest(packageName)
  }
}

function resolveBunPackageManifest(packageName: string): string {
  const bunNodeModulesDir = path.resolve(repoRoot, "node_modules/.bun")
  const encodedPackageName = packageName.replace("/", "+")
  for (const entry of readdirSync(bunNodeModulesDir).toSorted()) {
    if (!entry.startsWith(`${encodedPackageName}@`)) continue
    const manifestPath = path.resolve(
      bunNodeModulesDir,
      entry,
      "node_modules",
      ...packageName.split("/"),
      "package.json",
    )
    if (existsSync(manifestPath)) return manifestPath
  }

  throw new Error(`Unable to resolve runtime package ${packageName} from ${bunNodeModulesDir}`)
}

const chonkieWasmInputPath = resolveChonkieWasmInputPath()
mkdirSync(path.dirname(chonkieWasmOutputPath), { recursive: true })
copyFileSync(chonkieWasmInputPath, chonkieWasmOutputPath)

assertArtifactFileDoesNotContain({
  artifactFile: path.resolve(outdir, "node.js"),
  forbiddenText: repoRoot,
})

console.log(`Built Buddy Node backend at ${path.resolve(outdir, "node.js")}`)
console.log(`Bundled advanced math runtime version ${bundledAdvancedMathRuntimeVersion}`)

function resolveChonkieWasmInputPath() {
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

function resolvePackageNodeModulesDir(input: {
  packageJsonPath: string
  packageName: string
}): string {
  let current = path.dirname(input.packageJsonPath)
  const packagePathDepth = input.packageName.split("/").length
  for (let depth = 0; depth < packagePathDepth; depth += 1) {
    current = path.dirname(current)
  }

  if (path.basename(current) !== "node_modules") {
    throw new Error(
      `Unable to locate package node_modules root for ${input.packageName}: ${input.packageJsonPath}`,
    )
  }

  return current
}

function copyDirectoryContents(sourceDir: string, destinationDir: string) {
  mkdirSync(destinationDir, { recursive: true })

  for (const entry of readdirSync(sourceDir)) {
    cpSync(path.resolve(sourceDir, entry), path.resolve(destinationDir, entry), {
      recursive: true,
      dereference: true,
    })
  }
}
