import path from "node:path"
import { spawnSync } from "node:child_process"
import {
  ADVANCED_MATH_VERSION_OVERRIDE_ENV,
  resolveAdvancedMathRuntimeVersion,
} from "./advanced-math-version"
import {
  outputsAreFresh,
  resolveAdvancedMathRuntimeArchivePath,
  resolveAdvancedMathRuntimeChecksumPath,
  resolveAdvancedMathRuntimeTarget,
} from "./advanced-math-runtime-cache"

const BACKEND_DIR = path.resolve(import.meta.dir, "..")
const BUILD_SCRIPT = path.resolve(BACKEND_DIR, "script/build-advanced-math-runtime.ts")
const VERSION = resolveAdvancedMathRuntimeVersion()
const TARGET = resolveAdvancedMathRuntimeTarget()
const ASSET_PATH = resolveAdvancedMathRuntimeArchivePath(VERSION, TARGET)
const CHECKSUM_PATH = resolveAdvancedMathRuntimeChecksumPath(VERSION, TARGET)

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
    const stdout = typeof result.stdout === "string" ? result.stdout.trim() : ""
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : ""
    const output = [stdout, stderr].filter((value) => value.length > 0).join("\n")
    if (output) {
      console.warn(output)
    }
  }
  return false
}

if (disabledByEnvironment()) {
  console.log("[advanced-math-runtime] auto-build disabled by environment")
  process.exit(0)
}

const cacheResult = outputsAreFresh(ASSET_PATH, CHECKSUM_PATH)
if (cacheResult.fresh) {
  console.log(`[advanced-math-runtime] using cached local asset for ${TARGET}`)
  process.exit(0)
}

console.log(`[advanced-math-runtime] building local asset for ${TARGET} (${cacheResult.reason})`)
runBuild()
