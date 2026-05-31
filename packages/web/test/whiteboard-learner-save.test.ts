import { describe, expect, test } from "bun:test"
import {
  createWhiteboardLearnerSaveScheduler,
  isLearnerEditContentAlreadyDurable,
  type WhiteboardLearnerSaveHandler,
  type WhiteboardLearnerSaveResult,
} from "../src/components/whiteboard/whiteboard-learner-save"
import type { PersistedWhiteboardElement } from "../src/components/whiteboard/whiteboard-elements"

const viewport = { x: 0, y: 0, width: 800, height: 600 }
const elements: PersistedWhiteboardElement[] = [
  { type: "rectangle", id: "node", x: 0, y: 0, width: 120, height: 80 },
]

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

function noopFinishWhiteboardSave(_result: WhiteboardLearnerSaveResult): void {}
function noopFailWhiteboardSave(_reason?: unknown): void {}

describe("whiteboard learner save scheduler", () => {
  test("flushes the captured save handler and base revision", async () => {
    const calls: string[] = []
    const save: WhiteboardLearnerSaveHandler = async (input) => {
      calls.push(`${input.baseRevisionID ?? "missing"}:${input.elements[0]?.id ?? "missing"}`)
      return { status: "saved", baseRevisionID: "rev-2" }
    }
    const scheduler = createWhiteboardLearnerSaveScheduler({ delayMs: 60_000 })

    scheduler.schedule({
      save,
      elements,
      viewport,
      baseRevisionID: "rev-1",
    })

    expect(await scheduler.flush()).toBeTrue()
    await flushMicrotasks()
    expect(calls).toEqual(["rev-1:node"])
  })

  test("reports failed saves to callers", async () => {
    const calls: string[] = []
    const save: WhiteboardLearnerSaveHandler = async (input) => {
      calls.push(input.baseRevisionID ?? "missing")
      return calls.length === 1
        ? { status: "failed", baseRevisionID: "rev-2" }
        : { status: "saved", baseRevisionID: "rev-3" }
    }
    const scheduler = createWhiteboardLearnerSaveScheduler({ delayMs: 60_000 })

    scheduler.schedule({
      save,
      elements,
      viewport,
      baseRevisionID: "rev-1",
    })

    expect(await scheduler.flush()).toBeFalse()
    expect(await scheduler.flush()).toBeTrue()
    expect(calls).toEqual(["rev-1", "rev-2"])
  })

  test("replaces a pending payload without saving the old snapshot", async () => {
    const calls: string[] = []
    const saveFirst: WhiteboardLearnerSaveHandler = async () => {
      calls.push("first")
      return { status: "saved", baseRevisionID: "rev-2" }
    }
    const saveSecond: WhiteboardLearnerSaveHandler = async (input) => {
      calls.push(`second:${input.baseRevisionID ?? "missing"}`)
      return { status: "saved", baseRevisionID: "rev-3" }
    }
    const scheduler = createWhiteboardLearnerSaveScheduler({ delayMs: 60_000 })

    scheduler.schedule({
      save: saveFirst,
      elements,
      viewport,
      baseRevisionID: "rev-1",
    })
    scheduler.schedule({
      save: saveSecond,
      elements,
      viewport,
      baseRevisionID: "rev-2",
    })

    expect(await scheduler.flush()).toBeTrue()
    await flushMicrotasks()
    expect(calls).toEqual(["second:rev-2"])
  })

  test("rebases a pending edit onto the completed in-flight save", async () => {
    const calls: string[] = []
    let finishFirst = noopFinishWhiteboardSave
    const save: WhiteboardLearnerSaveHandler = async (input) => {
      calls.push(input.baseRevisionID ?? "missing")
      if (calls.length === 1) {
        return new Promise<WhiteboardLearnerSaveResult>((resolve) => {
          finishFirst = resolve
        })
      }
      return { status: "saved", baseRevisionID: "rev-3" }
    }
    const scheduler = createWhiteboardLearnerSaveScheduler({ delayMs: 60_000 })

    scheduler.schedule({
      save,
      elements,
      viewport,
      baseRevisionID: "rev-1",
    })
    const firstFlush = scheduler.flush()

    scheduler.schedule({
      save,
      elements: [{ type: "rectangle", id: "node-2", x: 0, y: 0, width: 120, height: 80 }],
      viewport,
      baseRevisionID: "rev-1",
    })
    const secondFlush = scheduler.flush()
    expect(calls).toEqual(["rev-1"])

    finishFirst({ status: "saved", baseRevisionID: "rev-2" })
    expect(await firstFlush).toBeTrue()
    expect(await secondFlush).toBeTrue()
    await flushMicrotasks()

    expect(calls).toEqual(["rev-1", "rev-2"])
  })

  test("rebases a pending edit onto a refetched head after an in-flight save fails", async () => {
    const calls: string[] = []
    let finishFirst = noopFinishWhiteboardSave
    const save: WhiteboardLearnerSaveHandler = async (input) => {
      calls.push(input.baseRevisionID ?? "missing")
      if (calls.length === 1) {
        return new Promise<WhiteboardLearnerSaveResult>((resolve) => {
          finishFirst = resolve
        })
      }
      return { status: "saved", baseRevisionID: "rev-3" }
    }
    const scheduler = createWhiteboardLearnerSaveScheduler({ delayMs: 60_000 })

    scheduler.schedule({
      save,
      elements,
      viewport,
      baseRevisionID: "rev-1",
    })
    const firstFlush = scheduler.flush()

    scheduler.schedule({
      save,
      elements: [{ type: "rectangle", id: "node-2", x: 0, y: 0, width: 120, height: 80 }],
      viewport,
      baseRevisionID: "rev-1",
    })
    const secondFlush = scheduler.flush()

    finishFirst({ status: "failed", baseRevisionID: "rev-2" })
    expect(await firstFlush).toBeTrue()
    expect(await secondFlush).toBeTrue()
    await flushMicrotasks()

    expect(calls).toEqual(["rev-1", "rev-2"])
  })

  test("keeps the latest queued edit when an in-flight save fails without a new base", async () => {
    const calls: string[] = []
    let finishFirst = noopFinishWhiteboardSave
    const save: WhiteboardLearnerSaveHandler = async (input) => {
      calls.push(`${input.baseRevisionID ?? "missing"}:${input.elements[0]?.id ?? "missing"}`)
      if (calls.length === 1) {
        return new Promise<WhiteboardLearnerSaveResult>((resolve) => {
          finishFirst = resolve
        })
      }
      return { status: "saved", baseRevisionID: "rev-2" }
    }
    const scheduler = createWhiteboardLearnerSaveScheduler({ delayMs: 60_000 })

    scheduler.schedule({
      save,
      elements,
      viewport,
      baseRevisionID: "rev-1",
    })
    const firstFlush = scheduler.flush()

    scheduler.schedule({
      save,
      elements: [{ type: "rectangle", id: "node-2", x: 0, y: 0, width: 120, height: 80 }],
      viewport,
      baseRevisionID: "rev-1",
    })
    const secondFlush = scheduler.flush()

    finishFirst({ status: "failed" })
    expect(await firstFlush).toBeFalse()
    expect(await secondFlush).toBeFalse()
    await flushMicrotasks()
    expect(calls).toEqual(["rev-1:node"])

    expect(await scheduler.flush()).toBeTrue()
    await flushMicrotasks()
    expect(calls).toEqual(["rev-1:node", "rev-1:node-2"])
  })

  test("keeps a pending edit after an in-flight save throws until it can be flushed again", async () => {
    const calls: string[] = []
    let failFirst = noopFailWhiteboardSave
    const save: WhiteboardLearnerSaveHandler = async (input) => {
      calls.push(`${input.baseRevisionID ?? "missing"}:${input.elements[0]?.id ?? "missing"}`)
      if (calls.length === 1) {
        return new Promise<WhiteboardLearnerSaveResult>((_resolve, reject) => {
          failFirst = reject
        })
      }
      return { status: "saved", baseRevisionID: "rev-2" }
    }
    const scheduler = createWhiteboardLearnerSaveScheduler({ delayMs: 60_000 })

    scheduler.schedule({
      save,
      elements,
      viewport,
      baseRevisionID: "rev-1",
    })
    const firstFlush = scheduler.flush()

    scheduler.schedule({
      save,
      elements: [{ type: "rectangle", id: "node-2", x: 0, y: 0, width: 120, height: 80 }],
      viewport,
      baseRevisionID: "rev-1",
    })
    const secondFlush = scheduler.flush()

    failFirst(new Error("offline"))
    expect(await firstFlush).toBeFalse()
    expect(await secondFlush).toBeFalse()
    await flushMicrotasks()
    expect(calls).toEqual(["rev-1:node"])

    expect(await scheduler.flush()).toBeTrue()
    await flushMicrotasks()
    expect(calls).toEqual(["rev-1:node", "rev-1:node-2"])
  })

  test("detects stale conflicts whose element content is already durable", () => {
    expect(
      isLearnerEditContentAlreadyDurable({
        latestElements: elements,
        elements,
      }),
    ).toBeTrue()
    expect(
      isLearnerEditContentAlreadyDurable({
        latestElements: elements,
        elements: [{ type: "rectangle", id: "other", x: 0, y: 0, width: 120, height: 80 }],
      }),
    ).toBeFalse()
    expect(
      isLearnerEditContentAlreadyDurable({
        latestElements: undefined,
        elements,
      }),
    ).toBeFalse()
  })
})
