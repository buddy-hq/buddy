import { expect, test } from "bun:test"

test("blocks external fetches after Happy DOM registers browser globals", async () => {
  await expect(fetch("https://example.invalid/should-not-run")).rejects.toThrow(
    "Live network fetch blocked during tests",
  )
})
