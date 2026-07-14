import { createHash } from "node:crypto"
import { describe, expect, test } from "bun:test"
import {
  BrowserSvgRenderRequests,
  type BrowserSvgRenderRequestClock,
} from "../../src/learning/features/svg-rendering/service/browser-render-requests"
import {
  SVG_RENDER_MAX_PENDING_REQUESTS_TOTAL,
  SVG_RENDER_TERMINAL_TOMBSTONE_TTL_MS,
} from "../../src/learning/features/svg-rendering/service/contracts"

const DIRECTORY = "/tmp/buddy-svg-render-requests"
const SOURCE = "CCO"
const SOURCE_HASH = createHash("sha256").update(SOURCE).digest("hex")
const SAFE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1"/></svg>'

function createClock(): BrowserSvgRenderRequestClock & {
  advance(milliseconds: number): void
  activeTimerCount(): number
} {
  let now = 0
  const timers = new Map<() => void, { callback: () => void; deadline: number }>()
  return {
    now: () => now,
    setTimeout(callback, delayMs) {
      const timer = () => {
        timers.delete(timer)
      }
      timers.set(timer, { callback, deadline: now + delayMs })
      return timer
    },
    clearTimeout(timer) {
      timer()
    },
    advance(milliseconds) {
      now += milliseconds
      while (true) {
        const due = Array.from(timers.entries()).find(
          ([, timer]) => timer.deadline <= now,
        )
        if (!due) return
        const [release, timer] = due
        release()
        timer.callback()
      }
    },
    activeTimerCount: () => timers.size,
  }
}

describe("browser SVG render requests", () => {
  test("lists pending requests and verifies the source hash before completing", async () => {
    const requests = new BrowserSvgRenderRequests()
    const enqueued = requests.enqueue({
      directory: DIRECTORY,
      format: "smiles",
      source: SOURCE,
      sourceHash: SOURCE_HASH,
    })

    expect(requests.listPending(DIRECTORY)).toEqual([enqueued.request])
    expect(
      requests.complete({
        directory: DIRECTORY,
        requestID: enqueued.request.requestID,
        completion: {
          outcome: "rendered",
          sourceHash: "0".repeat(64),
          svg: SAFE_SVG,
          warnings: [],
        },
      }),
    ).toEqual({ status: "conflict" })
    expect(requests.listPending(DIRECTORY)).toEqual([enqueued.request])

    const completion = {
      outcome: "rendered" as const,
      sourceHash: SOURCE_HASH,
      svg: SAFE_SVG,
      warnings: ["One unspecified stereocenter."],
    }
    expect(
      requests.complete({
        directory: DIRECTORY,
        requestID: enqueued.request.requestID,
        completion,
      }),
    ).toEqual({ status: "completed" })
    await expect(enqueued.completion).resolves.toEqual({
      status: "completed",
      svg: SAFE_SVG,
      warnings: ["One unspecified stereocenter."],
    })
    expect(requests.listPending(DIRECTORY)).toEqual([])
    expect(
      requests.complete({
        directory: DIRECTORY,
        requestID: enqueued.request.requestID,
        completion,
      }),
    ).toEqual({ status: "already_completed" })
  })

  test("cancels an outstanding request when its tool invocation aborts", async () => {
    const requests = new BrowserSvgRenderRequests()
    const abortController = new AbortController()
    const enqueued = requests.enqueue({
      directory: DIRECTORY,
      format: "smiles",
      source: SOURCE,
      sourceHash: SOURCE_HASH,
      signal: abortController.signal,
    })

    abortController.abort()

    await expect(enqueued.completion).resolves.toEqual({ status: "cancelled" })
    expect(requests.listPending(DIRECTORY)).toEqual([])
  })

  test("bounds pending requests across directories", () => {
    const clock = createClock()
    const requests = new BrowserSvgRenderRequests({ clock })
    for (let index = 0; index < SVG_RENDER_MAX_PENDING_REQUESTS_TOTAL; index += 1) {
      requests.enqueue({
        directory: `${DIRECTORY}-${index}`,
        format: "smiles",
        source: SOURCE,
        sourceHash: SOURCE_HASH,
      })
    }

    expect(() =>
      requests.enqueue({
        directory: `${DIRECTORY}-overflow`,
        format: "smiles",
        source: SOURCE,
        sourceHash: SOURCE_HASH,
      }),
    ).toThrow("globally")
    requests.reset()
    expect(clock.activeTimerCount()).toBe(0)
  })

  test("releases an idle directory after its completion tombstone expires", async () => {
    const clock = createClock()
    const requests = new BrowserSvgRenderRequests({ clock })
    const enqueued = requests.enqueue({
      directory: DIRECTORY,
      format: "smiles",
      source: SOURCE,
      sourceHash: SOURCE_HASH,
    })
    const completion = {
      outcome: "rendered" as const,
      sourceHash: SOURCE_HASH,
      svg: SAFE_SVG,
      warnings: [],
    }

    expect(
      requests.complete({
        directory: DIRECTORY,
        requestID: enqueued.request.requestID,
        completion,
      }),
    ).toEqual({ status: "completed" })
    expect(clock.activeTimerCount()).toBe(1)

    clock.advance(SVG_RENDER_TERMINAL_TOMBSTONE_TTL_MS)

    expect(clock.activeTimerCount()).toBe(0)
    expect(
      requests.complete({
        directory: DIRECTORY,
        requestID: enqueued.request.requestID,
        completion,
      }),
    ).toEqual({ status: "conflict" })
  })
})
