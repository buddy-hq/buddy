#!/usr/bin/env bun

import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import {
  OPENCODE_CHANNEL_DEFINE,
  readBuddyReleaseChannel,
  resolveOpenCodeChannelForBuddyChannel,
} from "@buddy/script/channel"
import {
  LITEPARSE_PACKAGE_NAME,
  TYPESCRIPT_RUNTIME_PACKAGE_NAME,
  currentBackendNodeArtifactTarget,
} from "../../../script/backend-node-artifact"
import {
  BUNDLED_ADVANCED_MATH_RUNTIME_VERSION_DEFINE,
  computeAdvancedMathRuntimeVersion,
} from "../src/local-runtimes/advanced-math/version"

const backendDir = path.resolve(import.meta.dir, "..")
const outdir = path.resolve(backendDir, "dist/node")
const require = createRequire(import.meta.url)
const TARGET_PLATFORM_ENV = "BUDDY_NODE_ARTIFACT_TARGET_PLATFORM"
const TARGET_ARCH_ENV = "BUDDY_NODE_ARTIFACT_TARGET_ARCH"
const bundledAdvancedMathRuntimeVersion = computeAdvancedMathRuntimeVersion()
const chonkieWasmOutputPath = path.resolve(outdir, "pkg/chonkiejs_chunk_bg.wasm")
const tessdataSourcePath = path.resolve(backendDir, "resources/tessdata")
const tessdataOutputPath = path.resolve(outdir, "resources/tessdata")
const firstStageExternals = [
  "jsonc-parser",
  "@lydell/node-pty",
  LITEPARSE_PACKAGE_NAME,
  TYPESCRIPT_RUNTIME_PACKAGE_NAME,
] as const

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
currentBackendNodeArtifactTarget()

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
  // Keep this aligned with the vendored OpenCode node artifact build. Adding
  // ordinary JS packages here pushes Electron back toward a hand-maintained
  // runtime dependency tree.
  external: [...firstStageExternals],
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
    [OPENCODE_CHANNEL_DEFINE]: JSON.stringify(
      resolveOpenCodeChannelForBuddyChannel(readBuddyReleaseChannel()),
    ),
  },
})

if (!result.success) {
  const summary = result.logs.map((log) => log.message).join("\n")
  throw new Error(summary || "Buddy Node backend build failed.")
}

copyChonkieWasm()
copyTessdata()

console.log(`Built Buddy Node backend at ${path.resolve(outdir, "node.js")}`)
console.log(`Bundled advanced math runtime version ${bundledAdvancedMathRuntimeVersion}`)

function copyChonkieWasm(): void {
  const chonkieWasmInputPath = resolveChonkieWasmInputPath()
  mkdirSync(path.dirname(chonkieWasmOutputPath), { recursive: true })
  copyFileSync(chonkieWasmInputPath, chonkieWasmOutputPath)
}

function copyTessdata(): void {
  if (!existsSync(tessdataSourcePath)) {
    throw new Error(`Buddy tessdata runtime not found at ${tessdataSourcePath}`)
  }
  mkdirSync(path.dirname(tessdataOutputPath), { recursive: true })
  cpSync(tessdataSourcePath, tessdataOutputPath, { recursive: true, dereference: true })
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
