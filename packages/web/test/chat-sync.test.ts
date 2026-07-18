import { describe, expect, test } from "bun:test"
import { consumeSseBuffer, createStreamYieldScheduler } from "../src/state/chat-sync"

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

    expect(parsed.messages).toEqual(["first line\nsecond line", "next message"])
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

describe("createStreamYieldScheduler", () => {
  test("starts a fresh processing budget after a delayed yield", async () => {
    let now = 0
    let yields = 0
    const scheduleYield = createStreamYieldScheduler({
      now: () => now,
      async yieldToMainThread() {
        yields += 1
        now += 100
      },
    })

    now = 8
    expect(await scheduleYield()).toBe(true)
    expect(await scheduleYield()).toBe(false)
    expect(yields).toBe(1)

    now += 8
    expect(await scheduleYield()).toBe(true)
    expect(yields).toBe(2)
  })
})
