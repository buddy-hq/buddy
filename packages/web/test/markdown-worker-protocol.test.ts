import { describe, expect, test } from "bun:test"
import {
  applyMarkdownWorkerResponse,
  shouldReleaseMarkdownWorkerState,
} from "../src/components/markdown/markdown-worker-protocol"

const token = (content: string): [string, string] => [content, ""]
const response = (
  id: number,
  reset: boolean,
  stable: [string, string][],
  unstable: [string, string][],
) => ({
  type: "highlight" as const,
  id,
  key: "code",
  reset,
  stable,
  unstable,
})

describe("markdown worker protocol", () => {
  test("accumulates stable tokens and replaces the unstable tail", () => {
    const first = applyMarkdownWorkerResponse(
      undefined,
      response(1, true, [token("one\n")], [token("tw")]),
    )
    const second = applyMarkdownWorkerResponse(
      first,
      response(2, false, [token("two\n")], [token("three")]),
    )

    expect(second.stable.map((item) => item[0])).toEqual(["one\n", "two\n"])
    expect(second.unstable.map((item) => item[0])).toEqual(["three"])
  })

  test("increments generation only when token identity resets", () => {
    const first = applyMarkdownWorkerResponse(undefined, response(1, true, [["const", ""]], []))
    const append = applyMarkdownWorkerResponse(first, response(2, false, [[" x", ""]], []))
    const replacement = applyMarkdownWorkerResponse(append, response(3, true, [["let y", ""]], []))

    expect([first.generation, append.generation, replacement.generation]).toEqual([1, 1, 2])
  })

  test("ignores stale responses and releases only the latest completed state", () => {
    const current = {
      id: 2,
      generation: 1,
      stable: [token("current")],
      unstable: [],
    }
    expect(applyMarkdownWorkerResponse(current, response(1, false, [token("stale")], []))).toBe(
      current,
    )
    expect(shouldReleaseMarkdownWorkerState(true, 4, 4)).toBe(true)
    expect(shouldReleaseMarkdownWorkerState(true, 5, 4)).toBe(false)
    expect(shouldReleaseMarkdownWorkerState(false, 4, 4)).toBe(false)
  })
})
