import { describe, expect, test } from "bun:test"
import { PassThrough } from "node:stream"
import {
  attachBrokenStandardIoErrorHandler,
  isBrokenStandardIoError,
} from "../src/main/broken-standard-io"

describe("broken standard IO detection", () => {
  test("recognizes EIO, EPIPE, and destroyed-stream codes", () => {
    expect(isBrokenStandardIoError(Object.assign(new Error("write EIO"), { code: "EIO" }))).toBe(
      true,
    )
    expect(
      isBrokenStandardIoError(Object.assign(new Error("write EPIPE"), { code: "EPIPE" })),
    ).toBe(true)
    expect(
      isBrokenStandardIoError(
        Object.assign(new Error("Cannot call write after a stream was destroyed"), {
          code: "ERR_STREAM_DESTROYED",
        }),
      ),
    ).toBe(true)
  })

  test("ignores unrelated errors and non-error values", () => {
    expect(isBrokenStandardIoError(new Error("boom"))).toBe(false)
    expect(isBrokenStandardIoError(Object.assign(new Error("disk"), { code: "ENOSPC" }))).toBe(
      false,
    )
    expect(isBrokenStandardIoError("write EIO")).toBe(false)
    expect(isBrokenStandardIoError(undefined)).toBe(false)
  })
})

describe("broken standard IO stream guards", () => {
  test("swallows EIO on the stream and notifies once per error", () => {
    const stream = new PassThrough()
    let brokenCount = 0
    attachBrokenStandardIoErrorHandler(stream, () => {
      brokenCount += 1
    })

    stream.emit("error", Object.assign(new Error("write EIO"), { code: "EIO" }))
    expect(brokenCount).toBe(1)
  })

  test("does not treat unrelated stream errors as broken standard IO", () => {
    const stream = new PassThrough()
    let brokenCount = 0
    attachBrokenStandardIoErrorHandler(stream, () => {
      brokenCount += 1
    })

    stream.emit("error", Object.assign(new Error("disk full"), { code: "ENOSPC" }))
    expect(brokenCount).toBe(0)
  })
})
