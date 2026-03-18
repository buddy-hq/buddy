import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

const BACKEND_DIR = path.resolve(import.meta.dir, "..")
const BUILD_SCRIPT = path.resolve(BACKEND_DIR, "script/build-advanced-math-runtime.ts")
const RUNTIME_SOURCE = path.resolve(BACKEND_DIR, "src/local-runtimes/advanced-math/runtime/main.py")
const PACKAGE_JSON = path.resolve(BACKEND_DIR, "package.json")
const DIST_DIR = path.resolve(BACKEND_DIR, "dist/advanced-math-runtime")
const VERSION = process.env.BUDDY_VERSION?.trim() || process.env.npm_package_version?.trim() || "0.0.1"
const TARGET = process.env.BUDDY_RUST_TARGET ?? currentTargetTriple()
const EXECUTABLE_NAME = TARGET.includes("windows") ? "buddy-advanced-math.exe" : "buddy-advanced-math"
const ASSET_NAME = `${EXECUTABLE_NAME}-v${VERSION}-${TARGET}.zip`

function currentTargetTriple() {
  if (process.platform === "darwin" && process.arch === "arm64") return "aarch64-apple-darwin"
  if (process.platform === "darwin" && process.arch === "x64") return "x86_64-apple-darwin"
  if (process.platform === "linux" && process.arch === "arm64") return "aarch64-unknown-linux-gnu"
  if (process.platform === "linux" && process.arch === "x64") return "x86_64-unknown-linux-gnu"
  if (process.platform === "win32" && process.arch === "x64") return "x86_64-pc-windows-msvc"
  throw new Error(`Unsupported advanced math runtime target: ${process.platform}/${process.arch}`)
}

function disabledByEnvironment() {
  const value = process.env.BUDDY_SKIP_ADVANCED_MATH_RUNTIME_AUTO_BUILD?.trim().toLowerCase()
  return value === "1" || value === "true" || value === "yes"
}

function verboseBuildLogging() {
  const value = process.env.BUDDY_ADVANCED_MATH_BUILD_VERBOSE?.trim().toLowerCase()
  return value === "1" || value === "true" || value === "yes"
}

function outputArchivePath() {
  return path.join(DIST_DIR, TARGET, ASSET_NAME)
}

function outputChecksumPath() {
  return `${outputArchivePath()}.sha256`
}

function mtimeMs(filepath: string) {
  return fs.statSync(filepath).mtimeMs
}

function outputsAreFresh() {
  const archive = outputArchivePath()
  const checksum = outputChecksumPath()
  if (!fs.existsSync(archive) || !fs.existsSync(checksum)) {
    return false
  }

  const outputTime = Math.min(mtimeMs(archive), mtimeMs(checksum))
  const sourceTime = Math.max(mtimeMs(BUILD_SCRIPT), mtimeMs(RUNTIME_SOURCE), mtimeMs(PACKAGE_JSON))
  return outputTime >= sourceTime
}

function runBuild() {
  const verbose = verboseBuildLogging()
  const result = spawnSync("bun", [BUILD_SCRIPT], {
    cwd: BACKEND_DIR,
    stdio: verbose ? "inherit" : "pipe",
    encoding: "utf8",
    env: {
      ...process.env,
      BUDDY_VERSION: VERSION,
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

if (outputsAreFresh()) {
  console.log(`[advanced-math-runtime] using cached local asset for ${TARGET}`)
  process.exit(0)
}

console.log(`[advanced-math-runtime] building local asset for ${TARGET}`)
runBuild()
