import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { BUDDY_TMP_DIR } from "../../../opencode-runtime/env"
import {
  BENCH_CAPTURE_MAX_BASE64_CHARACTERS,
  BENCH_CAPTURE_MAX_DIMENSION_PIXELS,
  BENCH_CAPTURE_MAX_PIXEL_COUNT,
  BENCH_CAPTURE_MAX_PNG_BYTES,
} from "./capture-limits"

const BENCH_CAPTURES_DIRECTORY = "bench-captures"
const BENCH_CAPTURE_FILENAME_PREFIX = "bench-capture-"
const BENCH_CAPTURE_EXTENSION = ".png"
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const PNG_IEND_CHUNK = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])
const PNG_IHDR_CHUNK_TYPE = "IHDR"
const PNG_IHDR_DATA_LENGTH = 13
const PNG_IHDR_CHUNK_OFFSET = 8
const PNG_CHUNK_TYPE_OFFSET = 12
const PNG_WIDTH_OFFSET = 16
const PNG_HEIGHT_OFFSET = 20
const PNG_MINIMUM_IHDR_BYTES = 33
const BASE64_GROUP_CHARACTERS = 4
const BASE64_GROUP_BYTES = 3
const BASE64_SINGLE_PADDING = "="
const BASE64_DOUBLE_PADDING = "=="
const BASE64_SINGLE_PADDING_BYTES = 1
const BASE64_DOUBLE_PADDING_BYTES = 2
const SAFE_TURN_ID_PATTERN = /^[A-Za-z0-9_-]+$/u
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u

const captureRoot = path.join(BUDDY_TMP_DIR, BENCH_CAPTURES_DIRECTORY)
const captureDirectoriesBySession = new Map<string, Set<string>>()

function captureTurnDirectoryName(messageID: string): string {
  if (SAFE_TURN_ID_PATTERN.test(messageID)) return messageID
  return createHash("sha256").update(messageID).digest("hex")
}

function decodedBase64ByteLength(value: string): number | null {
  if (value.length % BASE64_GROUP_CHARACTERS !== 0) return null
  const paddingBytes = value.endsWith(BASE64_DOUBLE_PADDING)
    ? BASE64_DOUBLE_PADDING_BYTES
    : value.endsWith(BASE64_SINGLE_PADDING)
      ? BASE64_SINGLE_PADDING_BYTES
      : 0
  return (value.length / BASE64_GROUP_CHARACTERS) * BASE64_GROUP_BYTES - paddingBytes
}

function decodePng(pngBase64: string): Buffer {
  const decodedByteLength = decodedBase64ByteLength(pngBase64)
  if (
    pngBase64.length > BENCH_CAPTURE_MAX_BASE64_CHARACTERS ||
    (decodedByteLength !== null && decodedByteLength > BENCH_CAPTURE_MAX_PNG_BYTES)
  ) {
    throw new Error("The Bench capture exceeds the PNG size limit.")
  }
  if (!BASE64_PATTERN.test(pngBase64)) {
    throw new Error("The Bench client returned an invalid PNG payload.")
  }
  const png = Buffer.from(pngBase64, "base64")
  if (png.length > BENCH_CAPTURE_MAX_PNG_BYTES) {
    throw new Error("The Bench capture exceeds the PNG size limit.")
  }
  if (
    png.length < PNG_MINIMUM_IHDR_BYTES ||
    !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) ||
    png.readUInt32BE(PNG_IHDR_CHUNK_OFFSET) !== PNG_IHDR_DATA_LENGTH ||
    png.subarray(PNG_CHUNK_TYPE_OFFSET, PNG_WIDTH_OFFSET).toString("ascii") !==
      PNG_IHDR_CHUNK_TYPE ||
    png.readUInt32BE(PNG_WIDTH_OFFSET) === 0 ||
    png.readUInt32BE(PNG_HEIGHT_OFFSET) === 0 ||
    !png.subarray(-PNG_IEND_CHUNK.length).equals(PNG_IEND_CHUNK)
  ) {
    throw new Error("The Bench client returned bytes that are not a PNG image.")
  }
  const width = png.readUInt32BE(PNG_WIDTH_OFFSET)
  const height = png.readUInt32BE(PNG_HEIGHT_OFFSET)
  if (
    width > BENCH_CAPTURE_MAX_DIMENSION_PIXELS ||
    height > BENCH_CAPTURE_MAX_DIMENSION_PIXELS ||
    height > Math.floor(BENCH_CAPTURE_MAX_PIXEL_COUNT / width)
  ) {
    throw new Error("The Bench capture exceeds the PNG dimension limit.")
  }
  return png
}

async function writeTemporaryBenchCapture(input: {
  sessionID: string
  messageID: string
  pngBase64: string
}): Promise<string> {
  const png = decodePng(input.pngBase64)
  const turnDirectory = path.join(captureRoot, captureTurnDirectoryName(input.messageID))
  await fs.mkdir(turnDirectory, { recursive: true })
  const filepath = path.join(
    turnDirectory,
    `${BENCH_CAPTURE_FILENAME_PREFIX}${randomUUID()}${BENCH_CAPTURE_EXTENSION}`,
  )
  try {
    await fs.writeFile(filepath, png, { flag: "wx" })
  } catch (error) {
    await fs.rm(filepath, { force: true }).catch(() => undefined)
    throw error
  }
  const directories = captureDirectoriesBySession.get(input.sessionID) ?? new Set<string>()
  directories.add(turnDirectory)
  captureDirectoriesBySession.set(input.sessionID, directories)
  return filepath
}

async function cleanupBenchCapturesForSession(sessionID: string): Promise<void> {
  const directories = captureDirectoriesBySession.get(sessionID)
  if (!directories) return
  captureDirectoriesBySession.delete(sessionID)
  await Promise.all(
    Array.from(directories, (directory) =>
      fs.rm(directory, { recursive: true, force: true }).catch(() => undefined),
    ),
  )
}

async function initializeBenchCaptureStorage(): Promise<void> {
  captureDirectoriesBySession.clear()
  await fs.rm(captureRoot, { recursive: true, force: true })
  await fs.mkdir(captureRoot, { recursive: true })
}

export {
  cleanupBenchCapturesForSession,
  initializeBenchCaptureStorage,
  writeTemporaryBenchCapture,
}
