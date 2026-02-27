import { describe, expect, test } from "bun:test"
import { consumeSseBuffer } from "../src/state/chat-sync"

describe("consumeSseBuffer", () => {
  test("parses CRLF-delimited events and ignores non-data fields", () => {
    const parsed = consumeSseBuffer(
      [
        ": keepalive",
        "data: first line",
        "data: second line",
        "id: 1",
        "",
        "event: update",
        "data: next message",
        "",
        "data: partial",
      ].join("\r\n"),
    )

    expect(parsed.messages).toEqual([
      "first line\nsecond line",
      "next message",
    ])
    expect(parsed.rest).toBe("data: partial")
  })

  test("keeps incomplete frames buffered until the next chunk arrives", () => {
    const first = consumeSseBuffer("data: ready\n\ndata: partial")
    expect(first.messages).toEqual(["ready"])
    expect(first.rest).toBe("data: partial")

    const second = consumeSseBuffer(`${first.rest}\ndata: still partial\n\n`)
    expect(second.messages).toEqual(["partial\nstill partial"])
    expect(second.rest).toBe("")
  })
})
