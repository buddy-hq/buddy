import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { resolveAdvancedMathRuntimeVersion } from "./advanced-math-version"

const BACKEND_DIR = path.resolve(import.meta.dir, "..")
const DIST_DIR = path.resolve(BACKEND_DIR, "dist/advanced-math-runtime")
const WINDOWS_TARGET_SEGMENT = "windows"
const ASSET_FILE_EXTENSION = "zip"
const SHA256_HASH_ALGORITHM = "sha256"
const CACHE_MISS_REASON = "no cached output found"
const CHECKSUM_MISMATCH_REASON = "checksum mismatch"
const CHECKSUM_READ_FAILURE_REASON = "checksum read failed"

export type AdvancedMathRuntimeCacheResult = { fresh: true } | { fresh: false; reason: string }

export function resolveAdvancedMathRuntimeTarget() {
  return process.env.BUDDY_RUST_TARGET ?? currentTargetTriple()
}

export function resolveAdvancedMathRuntimeAssetName(
  version = resolveAdvancedMathRuntimeVersion(),
  target = resolveAdvancedMathRuntimeTarget(),
) {
  const executableName = target.includes(WINDOWS_TARGET_SEGMENT)
    ? "buddy-advanced-math.exe"
    : "buddy-advanced-math"
  return `${executableName}-v${version}-${target}.${ASSET_FILE_EXTENSION}`
}

export function resolveAdvancedMathRuntimeArchivePath(
  version = resolveAdvancedMathRuntimeVersion(),
  target = resolveAdvancedMathRuntimeTarget(),
) {
  return path.join(DIST_DIR, target, resolveAdvancedMathRuntimeAssetName(version, target))
}

export function resolveAdvancedMathRuntimeChecksumPath(
  version = resolveAdvancedMathRuntimeVersion(),
  target = resolveAdvancedMathRuntimeTarget(),
) {
  return `${resolveAdvancedMathRuntimeArchivePath(version, target)}.sha256`
}

function currentTargetTriple() {
  if (process.platform === "darwin" && process.arch === "arm64") return "aarch64-apple-darwin"
  if (process.platform === "darwin" && process.arch === "x64") return "x86_64-apple-darwin"
  if (process.platform === "linux" && process.arch === "arm64") return "aarch64-unknown-linux-gnu"
  if (process.platform === "linux" && process.arch === "x64") return "x86_64-unknown-linux-gnu"
  if (process.platform === "win32" && process.arch === "x64") return "x86_64-pc-windows-msvc"
  throw new Error(`Unsupported advanced math runtime target: ${process.platform}/${process.arch}`)
}

function sha256(value: Uint8Array) {
  return createHash(SHA256_HASH_ALGORITHM).update(value).digest("hex")
}

function readChecksum(checksumPath: string) {
  const text = fs.readFileSync(checksumPath, "utf8")
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  if (!firstLine) {
    throw new Error("Advanced math runtime checksum file is empty")
  }

  const [checksum] = firstLine.split(/\s+/)
  if (!checksum) {
    throw new Error("Advanced math runtime checksum file is invalid")
  }

  return checksum.trim().toLowerCase()
}

function readArchiveChecksum(archivePath: string) {
  return sha256(fs.readFileSync(archivePath))
}

export function outputsAreFresh(
  archivePath = resolveAdvancedMathRuntimeArchivePath(),
  checksumPath = resolveAdvancedMathRuntimeChecksumPath(),
): AdvancedMathRuntimeCacheResult {
  if (!fs.existsSync(archivePath) || !fs.existsSync(checksumPath)) {
    return { fresh: false, reason: CACHE_MISS_REASON }
  }

  try {
    const expectedChecksum = readChecksum(checksumPath)
    const actualChecksum = readArchiveChecksum(archivePath)
    if (expectedChecksum !== actualChecksum) {
      return { fresh: false, reason: CHECKSUM_MISMATCH_REASON }
    }
  } catch {
    return { fresh: false, reason: CHECKSUM_READ_FAILURE_REASON }
  }

  return { fresh: true }
}
