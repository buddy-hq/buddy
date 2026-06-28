import { describe, expect, test } from "bun:test"
import { createLatestWorkerQueue } from "../src/components/markdown/markdown-worker-queue"

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe("markdown worker queue", () => {
  test("keeps only the latest queued request per key", async () => {
    const events: string[] = []
    const gate = Promise.withResolvers<void>()
    const queue = createLatestWorkerQueue<{ id: number; key: string }>({
      async run(request) {
        events.push(`parse:${request.id}`)
        if (request.id === 1) await gate.promise
      },
      supersede(request) {
        events.push(`supersede:${request.id}`)
      },
      dispose(key) {
        events.push(`dispose:${key}`)
      },
    })

    queue.highlight({ id: 1, key: "code" })
    await flushMicrotasks()
    queue.highlight({ id: 2, key: "code" })
    queue.highlight({ id: 3, key: "code" })
    queue.highlight({ id: 4, key: "code" })

    expect(queue.pending()).toBe(1)
    gate.resolve()
    await queue.idle()

    expect(events).toEqual(["parse:1", "supersede:2", "supersede:3", "parse:4"])
  })

  test("disposes queued requests before running newer work", async () => {
    const events: string[] = []
    const queue = createLatestWorkerQueue<{ id: number; key: string }>({
      async run(request) {
        events.push(`parse:${request.id}`)
      },
      supersede(request) {
        events.push(`supersede:${request.id}`)
      },
      dispose(key) {
        events.push(`dispose:${key}`)
      },
    })

    queue.highlight({ id: 1, key: "code" })
    queue.dispose("code")
    queue.highlight({ id: 2, key: "code" })
    await queue.idle()

    expect(events).toEqual(["supersede:1", "dispose:code", "parse:2"])
  })
})
