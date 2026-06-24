#!/usr/bin/env bun

import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import {
  currentBackendNodeArtifactTarget,
  nodePtyNativePackageName,
  parcelWatcherNativePackageName,
} from "./backend-node-artifact"
import {
  BUNDLED_ADVANCED_MATH_RUNTIME_VERSION_DEFINE,
  computeAdvancedMathRuntimeVersion,
} from "../src/local-runtimes/advanced-math/version"

const backendDir = path.resolve(import.meta.dir, "..")
const repoRoot = path.resolve(backendDir, "../..")
const vendorCoreDir = path.resolve(repoRoot, "vendor/opencode/packages/core")
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
  target: "node",
  format: "esm",
  sourcemap: "linked",
  entrypoints: ["./src/node.ts"],
  outdir,
  external: [
    "bufferutil",
    "utf-8-validate",
    ...copiedRuntimePackages.map((packageCopy) => packageCopy.name),
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

const chonkieWasmInputPath = resolveChonkieWasmInputPath()
mkdirSync(path.dirname(chonkieWasmOutputPath), { recursive: true })
copyFileSync(chonkieWasmInputPath, chonkieWasmOutputPath)

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
