import fs from "node:fs/promises"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import {
  cleanupBenchCapturesForSession,
  initializeBenchCaptureStorage,
  writeTemporaryBenchCapture,
} from "../../src/learning/features/bench/captures"
import {
  BENCH_CAPTURE_MAX_DIMENSION_PIXELS,
  BENCH_CAPTURE_MAX_PNG_BYTES,
} from "../../src/learning/features/bench/capture-limits"
import { BUDDY_TMP_DIR } from "../../src/opencode-runtime/env"

const SESSION_ID = "capture-session"
const MESSAGE_ID = "capture-turn"
const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
const PNG_WIDTH_OFFSET = 16
const PNG_HEIGHT_OFFSET = 20

afterEach(async () => {
  await cleanupBenchCapturesForSession(SESSION_ID)
})

describe("temporary Bench captures", () => {
  test("stores a validated PNG under the turn and removes it when the session becomes idle", async () => {
    await initializeBenchCaptureStorage()
    const filepath = await writeTemporaryBenchCapture({
      sessionID: SESSION_ID,
      messageID: MESSAGE_ID,
      pngBase64: ONE_PIXEL_PNG_BASE64,
    })

    expect(filepath.startsWith(path.join(BUDDY_TMP_DIR, "bench-captures", MESSAGE_ID))).toBe(true)
    expect(filepath.endsWith(".png")).toBe(true)
    expect((await fs.readFile(filepath)).subarray(1, 4).toString("ascii")).toBe("PNG")

    await cleanupBenchCapturesForSession(SESSION_ID)
    await expect(fs.stat(filepath)).rejects.toThrow()
  })

  test("rejects non-PNG capture bytes before writing a file", async () => {
    await expect(
      writeTemporaryBenchCapture({
        sessionID: SESSION_ID,
        messageID: MESSAGE_ID,
        pngBase64: Buffer.from("not a png").toString("base64"),
      }),
    ).rejects.toThrow("not a PNG")
  })

  test("rejects a truncated PNG header before writing a file", async () => {
    const truncatedPng = Buffer.from(ONE_PIXEL_PNG_BASE64, "base64").subarray(0, 33)

    await expect(
      writeTemporaryBenchCapture({
        sessionID: SESSION_ID,
        messageID: MESSAGE_ID,
        pngBase64: truncatedPng.toString("base64"),
      }),
    ).rejects.toThrow("not a PNG")
  })

  test("rejects PNG payloads beyond the decoded byte limit", async () => {
    const oversizedPngBase64 = Buffer.alloc(BENCH_CAPTURE_MAX_PNG_BYTES + 1).toString("base64")

    await expect(
      writeTemporaryBenchCapture({
        sessionID: SESSION_ID,
        messageID: MESSAGE_ID,
        pngBase64: oversizedPngBase64,
      }),
    ).rejects.toThrow("PNG size limit")
  })

  test("rejects PNG dimensions beyond the bounded pixel count", async () => {
    const oversizedDimensionsPng = Buffer.from(ONE_PIXEL_PNG_BASE64, "base64")
    oversizedDimensionsPng.writeUInt32BE(BENCH_CAPTURE_MAX_DIMENSION_PIXELS, PNG_WIDTH_OFFSET)
    oversizedDimensionsPng.writeUInt32BE(BENCH_CAPTURE_MAX_DIMENSION_PIXELS, PNG_HEIGHT_OFFSET)

    await expect(
      writeTemporaryBenchCapture({
        sessionID: SESSION_ID,
        messageID: MESSAGE_ID,
        pngBase64: oversizedDimensionsPng.toString("base64"),
      }),
    ).rejects.toThrow("PNG dimension limit")
  })
})
