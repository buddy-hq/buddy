#!/usr/bin/env bun

import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import {
  OPENCODE_CHANNEL_DEFINE,
  readBuddyReleaseChannel,
  resolveOpenCodeChannelForBuddyChannel,
} from "@buddy/script/channel"
import {
  CHEMFIG_CHILD_FILENAME,
  CHEMFIG_RUNTIME_DIRECTORY_NAME,
  CHEMFIG_TEX_ASSET_FILENAMES,
  CHEMFIG_TEX_DIRECTORY_NAME,
} from "@buddy/script/chemfig-runtime"
import {
  LITEPARSE_PACKAGE_NAME,
  TYPESCRIPT_RUNTIME_PACKAGE_NAME,
  currentBackendNodeArtifactTarget,
} from "../../../script/backend-node-artifact"
import { SPREADSHEET_PARSER_WORKER_BUNDLED_FILENAME } from "@buddy/script/backend-node-runtime"
import {
  BUNDLED_ADVANCED_MATH_RUNTIME_VERSION_DEFINE,
  computeAdvancedMathRuntimeVersion,
} from "../src/local-runtimes/advanced-math/version"
const backendDir = path.resolve(import.meta.dir, "..")
const repositoryRoot = path.resolve(backendDir, "../..")
const outdir = path.resolve(backendDir, "dist/node")
const require = createRequire(import.meta.url)
const TARGET_PLATFORM_ENV = "BUDDY_NODE_ARTIFACT_TARGET_PLATFORM"
const TARGET_ARCH_ENV = "BUDDY_NODE_ARTIFACT_TARGET_ARCH"
const bundledAdvancedMathRuntimeVersion = computeAdvancedMathRuntimeVersion()
const chonkieWasmOutputPath = path.resolve(outdir, "pkg/chonkiejs_chunk_bg.wasm")
const tessdataSourcePath = path.resolve(backendDir, "resources/tessdata")
const tessdataOutputPath = path.resolve(outdir, "resources/tessdata")
const chemfigChildEntryPath = path.resolve(backendDir, "src/chemistry/chemfig-child.ts")
const chemfigRuntimeOutputPath = path.resolve(outdir, CHEMFIG_RUNTIME_DIRECTORY_NAME)
const chemfigChildOutputPath = path.resolve(chemfigRuntimeOutputPath, CHEMFIG_CHILD_FILENAME)
const chemfigTexOutputPath = path.resolve(chemfigRuntimeOutputPath, CHEMFIG_TEX_DIRECTORY_NAME)
const spreadsheetParserWorkerEntryPath = path.resolve(
  backendDir,
  "src/resource-packs/spreadsheet-parser-worker.ts",
)
const spreadsheetParserWorkerOutputPath = path.resolve(
  outdir,
  SPREADSHEET_PARSER_WORKER_BUNDLED_FILENAME,
)
const firstStageExternals = [
  "jsonc-parser",
  "@lydell/node-pty",
  LITEPARSE_PACKAGE_NAME,
  TYPESCRIPT_RUNTIME_PACKAGE_NAME,
] as const
const JSDOM_XML_HTTP_REQUEST_IMPLEMENTATION_PATTERN =
  /[\\/]jsdom[\\/]living[\\/]xhr[\\/]XMLHttpRequest-impl\.js$/u
const JSDOM_SYNC_WORKER_RESOLUTION =
  'const syncWorkerFile = require.resolve ? require.resolve("./xhr-sync-worker.js") : null;'
const BUNDLED_JSDOM_SYNC_WORKER_RESOLUTION = "const syncWorkerFile = null;"

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

await buildSpreadsheetParserWorker()
copyChonkieWasm()
copyTessdata()
await buildChemfigChild()
assertChemfigChildIsCheckoutIndependent()
copyChemfigTexAssets()

console.log(`Built Buddy Node backend at ${path.resolve(outdir, "node.js")}`)
console.log(`Bundled advanced math runtime version ${bundledAdvancedMathRuntimeVersion}`)

async function buildSpreadsheetParserWorker(): Promise<void> {
  const workerResult = await Bun.build({
    conditions: ["node"],
    target: "node",
    format: "esm",
    minify: true,
    sourcemap: "none",
    entrypoints: [spreadsheetParserWorkerEntryPath],
    outdir,
    naming: SPREADSHEET_PARSER_WORKER_BUNDLED_FILENAME,
  })
  if (!workerResult.success) {
    const summary = workerResult.logs.map((log) => log.message).join("\n")
    throw new Error(summary || "Spreadsheet parser worker build failed.")
  }
  if (!existsSync(spreadsheetParserWorkerOutputPath)) {
    throw new Error("Spreadsheet parser worker output was not created.")
  }
}

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

async function buildChemfigChild(): Promise<void> {
  const childResult = await Bun.build({
    conditions: ["node"],
    target: "node",
    format: "cjs",
    minify: true,
    sourcemap: "none",
    entrypoints: [chemfigChildEntryPath],
    outdir: chemfigRuntimeOutputPath,
    naming: CHEMFIG_CHILD_FILENAME,
    plugins: [
      {
        name: "buddy:chemfig-checkout-independent-jsdom",
        setup(build) {
          build.onLoad({ filter: JSDOM_XML_HTTP_REQUEST_IMPLEMENTATION_PATTERN }, async (args) => {
            const source = await Bun.file(args.path).text()
            const contents = source.replace(
              JSDOM_SYNC_WORKER_RESOLUTION,
              BUNDLED_JSDOM_SYNC_WORKER_RESOLUTION,
            )
            if (contents === source) {
              throw new Error(
                `Expected jsdom synchronous worker resolution was not found in ${args.path}`,
              )
            }
            return { contents, loader: "js" }
          })
        },
      },
    ],
  })
  if (childResult.success) return
  const summary = childResult.logs.map((log) => log.message).join("\n")
  throw new Error(summary || "Buddy chemfig child runtime build failed.")
}

function assertChemfigChildIsCheckoutIndependent(): void {
  const childSource = readFileSync(chemfigChildOutputPath, "utf8")
  const checkoutPathForms = [
    repositoryRoot,
    repositoryRoot.replaceAll("\\", "\\\\"),
    repositoryRoot.replaceAll("\\", "/"),
  ]
  if (checkoutPathForms.some((checkoutPath) => childSource.includes(checkoutPath))) {
    throw new Error("Buddy chemfig child runtime contains a build-host checkout path.")
  }
}

function copyChemfigTexAssets(): void {
  const packageManifestPath = require.resolve("node-tikzjax/package.json", {
    paths: [backendDir],
  })
  const sourceDirectory = path.resolve(
    path.dirname(packageManifestPath),
    CHEMFIG_TEX_DIRECTORY_NAME,
  )
  mkdirSync(chemfigTexOutputPath, { recursive: true })
  for (const assetFilename of CHEMFIG_TEX_ASSET_FILENAMES) {
    const sourcePath = path.join(sourceDirectory, assetFilename)
    if (!existsSync(sourcePath)) {
      throw new Error(`node-tikzjax runtime asset not found at ${sourcePath}`)
    }
    copyFileSync(sourcePath, path.join(chemfigTexOutputPath, assetFilename))
  }
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
