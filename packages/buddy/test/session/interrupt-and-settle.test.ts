import { describe, expect, test } from "bun:test"
import type { BuddyEvent } from "@buddy/transcript-contract/event"
import { interruptAndSettle, stopSessionFamily } from "../../src/session/orchestration/abort-actions"

function createStopNoticeRuntime() {
  const queue: BuddyEvent[] = []
  let available = Promise.withResolvers<void>()
  let closed = false
  let childRunning = true
  let parentRunning = true
  let parentInterrupts = 0
  let statusReads = 0
  let subscriptions = 0
  const parentStopped = Promise.withResolvers<void>()
  const finalStatusReached = Promise.withResolvers<void>()
  const releaseFinalStatus = Promise.withResolvers<void>()
  const promptCreatedBeforeStop = Date.now() - 1_000
  function emit(event: BuddyEvent) {
    queue.push(event)
    available.resolve()
    available = Promise.withResolvers<void>()
  }
  function emitCompletion() {
    emit({ payload: { type: "message.updated", properties: { info: { id: "completion", sessionID: "p", role: "assistant", kind: "synthetic" } } } })
    emit({ payload: { type: "message.part.updated", properties: { part: { type: "notice", sessionID: "p", completion: { childSessionID: "c", outcome: "cancelled" } } } } })
  }
  const runtime = {
    conversations: {
      async get() {
        return { id: "p", projectID: "project", directory: "/fixture", title: "Parent", time: { created: 0, updated: 0 } }
      },
      async children(sessionID: string) {
        return sessionID === "p" ? [{ id: "c", parentID: "p", projectID: "project", directory: "/fixture", title: "Child", time: { created: 0, updated: 0 } }] : []
      },
    },
    events: {
      async *stream({ signal }: { signal?: AbortSignal }): AsyncGenerator<BuddyEvent> {
        subscriptions += 1
        const onAbort = () => available.resolve()
        signal?.addEventListener("abort", onAbort, { once: true })
        try {
          yield { payload: { type: "server.connected", properties: {} } }
          while (true) {
            if (closed || signal?.aborted) return
            const event = queue.shift()
            if (event) yield event
            else await available.promise
          }
        } finally {
          signal?.removeEventListener("abort", onAbort)
          subscriptions -= 1
        }
      },
    },
    execution: {
      async statuses() {
        statusReads += 1
        if (statusReads === 2) {
          finalStatusReached.resolve()
          await releaseFinalStatus.promise
        }
        const statuses: Record<string, { type: "busy" }> = {}
        if (childRunning) statuses.c = { type: "busy" }
        if (parentRunning) statuses.p = { type: "busy" }
        return statuses
      },
      async interrupt(sessionID: string) {
        if (sessionID === "c") childRunning = false
        else {
          parentRunning = false
          parentInterrupts += 1
          parentStopped.resolve()
          emit({ payload: { type: "session.status", properties: { sessionID: "p", status: { type: "idle" } } } })
        }
        return true
      },
      async wait() { return "interrupted" as const },
    },
  }
  return {
    runtime,
    parentStopped: parentStopped.promise,
    finalStatusReached: finalStatusReached.promise,
    releaseFinalStatus: () => releaseFinalStatus.resolve(),
    parentRunning: () => parentRunning,
    parentInterrupts: () => parentInterrupts,
    subscriptions: () => subscriptions,
    enqueueCompletion: emitCompletion,
    deliverUserPrompt() {
      const info = { id: "user", sessionID: "p", role: "user" as const, agent: "buddy", model: { providerID: "test", modelID: "test" }, time: { created: Date.now() } }
      emit({ payload: { type: "message.updated", properties: { info } } })
    },
    replayOriginalPrompt() {
      const info = { id: "prompt", sessionID: "p", role: "user" as const, agent: "buddy", model: { providerID: "test", modelID: "test" }, time: { created: promptCreatedBeforeStop } }
      emit({ payload: { type: "message.updated", properties: { info } } })
    },
    wakeParent() {
      parentRunning = true
      emit({ payload: { type: "session.status", properties: { sessionID: "p", status: { type: "busy" } } } })
    },
    async [Symbol.asyncDispose]() {
      closed = true
      releaseFinalStatus.resolve()
      available.resolve()
      await new Promise<void>((resolve) => setImmediate(resolve))
    },
  }
}

describe("interruptAndSettle", () => {
  test("returns true only after the interrupted execution settles", async () => {
    const order: string[] = []
    const execution = {
      async interrupt(sessionID: string) {
        order.push(`interrupt:${sessionID}`)
        return true
      },
      async wait(sessionID: string) {
        order.push(`wait:${sessionID}`)
        await new Promise<void>((resolve) => setTimeout(resolve, 50))
        order.push("settled")
        return "interrupted" as const
      },
    }

    const result = await interruptAndSettle(execution, "session-1")
    order.push("returned")

    expect(result).toBe(true)
    expect(order).toEqual(["interrupt:session-1", "wait:session-1", "settled", "returned"])
  })

  test("returns false without waiting when there is no execution to interrupt", async () => {
    let waited = false
    const execution = {
      async interrupt() {
        return false
      },
      async wait() {
        waited = true
        return undefined
      },
    }

    expect(await interruptAndSettle(execution, "session-1")).toBe(false)
    expect(waited).toBe(false)
  })

  test("returns true after the timeout when the execution never settles", async () => {
    const execution = {
      async interrupt() {
        return true
      },
      wait() {
        return new Promise<never>(() => {})
      },
    }
    const startedAt = performance.now()

    expect(await interruptAndSettle(execution, "session-1", 30)).toBe(true)
    const elapsed = performance.now() - startedAt
    expect(elapsed).toBeGreaterThanOrEqual(25)
    expect(elapsed).toBeLessThan(1_000)
  })

  test("returns true when waiting for the execution rejects", async () => {
    const execution = {
      async interrupt() {
        return true
      },
      wait() {
        return Promise.reject(new Error("Execution failed while settling"))
      },
    }

    expect(await interruptAndSettle(execution, "session-1")).toBe(true)
  })
})

describe("stopSessionFamily", () => {
  test.each([true, false])("stops active descendants in parallel before the parent (parent interrupted: %s)", async (parentInterrupted) => {
    const order: string[] = []
    const children = new Map([["p", ["c", "idle"]], ["c", ["g"]], ["g", ["p"]]])
    const runtime = {
      conversations: {
        async get() {
          return { id: "p", projectID: "project", directory: "/fixture", title: "Parent", time: { created: 0, updated: 0 } }
        },
        async children(sessionID: string) {
          return (children.get(sessionID) ?? []).map((id) => ({
            id,
            parentID: sessionID,
            projectID: "project",
            directory: "/fixture",
            title: id,
            time: { created: 0, updated: 0 },
          }))
        },
      },
      events: {
        async *stream(): AsyncGenerator<BuddyEvent> {
          yield { payload: { type: "server.connected", properties: {} } }
          for (const childSessionID of ["g", "c"]) {
            yield { payload: { type: "message.part.updated", properties: { part: { type: "notice", sessionID: childSessionID === "g" ? "c" : "p", completion: { childSessionID, outcome: "cancelled" } } } } }
          }
        },
      },
      execution: {
        async statuses() {
          return { c: { type: "busy" as const }, g: { type: "busy" as const } }
        },
        async interrupt(sessionID: string) {
          order.push(`interrupt:${sessionID}`)
          return sessionID === "p" ? parentInterrupted : true
        },
        async wait(sessionID: string) {
          order.push(`wait:${sessionID}`)
          return "interrupted" as const
        },
      },
    }

    expect(await stopSessionFamily(runtime, "p")).toBe(true)
    expect(order).toEqual([
      "interrupt:g", "interrupt:c", "wait:g", "wait:c", "interrupt:p",
      ...(parentInterrupted ? ["wait:p"] : []),
    ])
  })

  test("interrupts the parent again after a delayed cancelled completion wakes it", async () => {
    const parentStopped = Promise.withResolvers<void>()
    const completion = Promise.withResolvers<BuddyEvent>()
    let parentRunning = true
    let childRunning = true
    let parentInterrupts = 0
    const runtime = {
      conversations: {
        async get() {
          return { id: "p", projectID: "project", directory: "/fixture", title: "Parent", time: { created: 0, updated: 0 } }
        },
        async children(sessionID: string) {
          return sessionID === "p" ? [{ id: "c", parentID: "p", projectID: "project", directory: "/fixture", title: "Child", time: { created: 0, updated: 0 } }] : []
        },
      },
      events: {
        async *stream(): AsyncGenerator<BuddyEvent> {
          yield { payload: { type: "server.connected", properties: {} } }
          yield await completion.promise
        },
      },
      execution: {
        async statuses() {
          const statuses: Record<string, { type: "busy" }> = {}
          if (childRunning) statuses.c = { type: "busy" }
          if (parentRunning) statuses.p = { type: "busy" }
          return statuses
        },
        async interrupt(sessionID: string) {
          if (sessionID === "c") childRunning = false
          else {
            parentRunning = false
            parentInterrupts += 1
            parentStopped.resolve()
          }
          return true
        },
        async wait() { return "interrupted" as const },
      },
    }
    const delivery = parentStopped.promise.then(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve))
      parentRunning = true
      completion.resolve({ payload: { type: "message.part.updated", properties: { part: { type: "notice", sessionID: "p", completion: { childSessionID: "c", outcome: "cancelled" } } } } })
    })

    const stopping = stopSessionFamily(runtime, "p")
    await delivery
    expect(await stopping).toBe(true)
    expect(parentRunning).toBe(false)
    expect(parentInterrupts).toBe(2)
  })

  test("interrupts a notice-before-wake reply when the wake happens before Stop returns", async () => {
    await using fixture = createStopNoticeRuntime()
    const stopping = stopSessionFamily(fixture.runtime, "p")
    await fixture.parentStopped
    fixture.enqueueCompletion()
    await fixture.finalStatusReached
    fixture.wakeParent()
    fixture.releaseFinalStatus()

    expect(await stopping).toBe(true)
    expect(fixture.parentRunning()).toBe(false)
    expect(fixture.parentInterrupts()).toBe(2)
    expect(fixture.subscriptions()).toBe(0)
  })

  test("interrupts a woken parent when the stream replays the prompt sent before Stop", async () => {
    await using fixture = createStopNoticeRuntime()
    const stopping = stopSessionFamily(fixture.runtime, "p")
    await fixture.parentStopped
    fixture.replayOriginalPrompt()
    fixture.enqueueCompletion()
    await fixture.finalStatusReached
    fixture.wakeParent()
    fixture.releaseFinalStatus()

    expect(await stopping).toBe(true)
    expect(fixture.parentRunning()).toBe(false)
    expect(fixture.parentInterrupts()).toBe(2)
    expect(fixture.subscriptions()).toBe(0)
  })

  test("leaves a real user turn that starts during the cancellation-notice wait running", async () => {
    await using fixture = createStopNoticeRuntime()
    const stopping = stopSessionFamily(fixture.runtime, "p")
    await fixture.parentStopped
    fixture.deliverUserPrompt()
    fixture.wakeParent()
    fixture.enqueueCompletion()
    await fixture.finalStatusReached
    fixture.releaseFinalStatus()

    expect(await stopping).toBe(true)
    expect(fixture.parentRunning()).toBe(true)
    expect(fixture.parentInterrupts()).toBe(1)
    expect(fixture.subscriptions()).toBe(0)
  })
})
