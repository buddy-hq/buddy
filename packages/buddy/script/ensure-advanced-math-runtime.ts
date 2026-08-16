import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import {
  ADVANCED_MATH_VERSION_OVERRIDE_ENV,
  resolveAdvancedMathRuntimeVersion,
} from "./advanced-math-version"
import { parseTString } from "./parse-values"
import {
  outputsAreFresh,
  resolveAdvancedMathRuntimeArchivePath,
  resolveAdvancedMathRuntimeCacheDir,
  resolveAdvancedMathRuntimeChecksumPath,
  resolveAdvancedMathRuntimeTarget,
  resolveLocalAdvancedMathRuntimeCacheDir,
} from "./advanced-math-runtime-cache"

const BACKEND_DIR = path.resolve(import.meta.dir, "..")
const BUILD_SCRIPT = path.resolve(BACKEND_DIR, "script/build-advanced-math-runtime.ts")
const VERSION = resolveAdvancedMathRuntimeVersion()
const TARGET = resolveAdvancedMathRuntimeTarget()
const LOCAL_CACHE_DIR = resolveLocalAdvancedMathRuntimeCacheDir()
const LOCAL_ASSET_PATH = resolveAdvancedMathRuntimeArchivePath(VERSION, TARGET, LOCAL_CACHE_DIR)
const LOCAL_CHECKSUM_PATH = resolveAdvancedMathRuntimeChecksumPath(VERSION, TARGET, LOCAL_CACHE_DIR)
const CACHE_DIR = resolveAdvancedMathRuntimeCacheDir()

function disabledByEnvironment() {
  const value = process.env.BUDDY_SKIP_ADVANCED_MATH_RUNTIME_AUTO_BUILD?.trim().toLowerCase()
  return value === "1" || value === "true" || value === "yes"
}

function verboseBuildLogging() {
  const value = process.env.BUDDY_ADVANCED_MATH_BUILD_VERBOSE?.trim().toLowerCase()
  return value === "1" || value === "true" || value === "yes"
}

function runBuild() {
  const verbose = verboseBuildLogging()
  const result = spawnSync("bun", [BUILD_SCRIPT], {
    cwd: BACKEND_DIR,
    stdio: verbose ? "inherit" : "pipe",
    encoding: "utf8",
    env: {
      ...process.env,
      [ADVANCED_MATH_VERSION_OVERRIDE_ENV]: VERSION,
      BUDDY_RUST_TARGET: TARGET,
    },
  })

  if (result.status === 0) {
    return true
  }

  console.warn(
    `[advanced-math-runtime] automatic local build skipped after failure. ` +
      `Buddy will continue without the optional runtime until it is built successfully.`,
  )
  if (!verbose) {
    const stdout = parseTString(result.stdout)?.trim() ?? ""
    const stderr = parseTString(result.stderr)?.trim() ?? ""
    const output = [stdout, stderr].filter((value) => value.length > 0).join("\n")
    if (output) {
      console.warn(output)
    }
  }
  return false
}

function copyFromCache() {
  const cacheAssetPath = resolveAdvancedMathRuntimeArchivePath(VERSION, TARGET, CACHE_DIR)
  const cacheChecksumPath = resolveAdvancedMathRuntimeChecksumPath(VERSION, TARGET, CACHE_DIR)
  const cacheResult = outputsAreFresh(cacheAssetPath, cacheChecksumPath)

  if (!cacheResult.fresh) {
    return false
  }

  const localDir = path.dirname(LOCAL_ASSET_PATH)
  fs.mkdirSync(localDir, { recursive: true })
  fs.copyFileSync(cacheAssetPath, LOCAL_ASSET_PATH)
  fs.copyFileSync(cacheChecksumPath, LOCAL_CHECKSUM_PATH)

  console.log(`[advanced-math-runtime] copied cached asset from ${CACHE_DIR} for ${TARGET}`)
  return true
}

if (disabledByEnvironment()) {
  console.log("[advanced-math-runtime] auto-build disabled by environment")
  process.exit(0)
}

const localCacheResult = outputsAreFresh(LOCAL_ASSET_PATH, LOCAL_CHECKSUM_PATH)
if (localCacheResult.fresh) {
  console.log(`[advanced-math-runtime] using cached local asset for ${TARGET}`)
  process.exit(0)
}

if (process.env.BUDDY_ADVANCED_MATH_RUNTIME_CACHE_DIR && copyFromCache()) {
  process.exit(0)
}

console.log(
  `[advanced-math-runtime] building local asset for ${TARGET} (${localCacheResult.reason})`,
)
runBuild()
