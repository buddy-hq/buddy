import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { outputsAreFresh } from "../script/advanced-math-runtime-cache"
import { tmpdir } from "./helpers/tmpdir"

function sha256(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex")
}

describe("advanced math runtime cache", () => {
  test("treats a versioned archive as fresh when the checksum matches", async () => {
    await using project = await tmpdir()
    const archivePath = path.join(
      project.path,
      "buddy-advanced-math-vtest-aarch64-apple-darwin.zip",
    )
    const checksumPath = `${archivePath}.sha256`
    const archiveBytes = new Uint8Array([98, 117, 100, 100, 121])

    await fs.writeFile(archivePath, archiveBytes)
    await fs.writeFile(checksumPath, `${sha256(archiveBytes)}\n`, "utf8")

    expect(outputsAreFresh(archivePath, checksumPath)).toEqual({ fresh: true })
  })

  test("treats a versioned archive as stale when the checksum does not match", async () => {
    await using project = await tmpdir()
    const archivePath = path.join(
      project.path,
      "buddy-advanced-math-vtest-aarch64-apple-darwin.zip",
    )
    const checksumPath = `${archivePath}.sha256`

    await fs.writeFile(archivePath, new Uint8Array([1, 2, 3]))
    await fs.writeFile(checksumPath, "deadbeef\n", "utf8")

    expect(outputsAreFresh(archivePath, checksumPath)).toEqual({
      fresh: false,
      reason: "checksum mismatch",
    })
  })

  test("treats a versioned archive as stale when the checksum file is empty", async () => {
    await using project = await tmpdir()
    const archivePath = path.join(
      project.path,
      "buddy-advanced-math-vtest-aarch64-apple-darwin.zip",
    )
    const checksumPath = `${archivePath}.sha256`

    await fs.writeFile(archivePath, new Uint8Array([1, 2, 3]))
    await fs.writeFile(checksumPath, "", "utf8")

    expect(outputsAreFresh(archivePath, checksumPath)).toEqual({
      fresh: false,
      reason: "checksum read failed",
    })
  })
})
