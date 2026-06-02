import { describe, expect, test } from "bun:test"
import {
  createWhiteboardLearnerSaveScheduler,
  type WhiteboardLearnerSaveHandler,
  type WhiteboardLearnerSaveResult,
} from "../src/components/whiteboard/whiteboard-learner-save"
import type { PersistedWhiteboardElement } from "../src/components/whiteboard/whiteboard-elements"

const viewport = { x: 0, y: 0, width: 800, height: 600 }
const baseBoardID = "board-1"
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
  test("flushes the captured save handler", async () => {
    const calls: string[] = []
    const save: WhiteboardLearnerSaveHandler = async (input) => {
      calls.push(input.elements[0]?.id ?? "missing")
      return { status: "saved" }
    }
    const scheduler = createWhiteboardLearnerSaveScheduler({ delayMs: 60_000 })

    scheduler.schedule({
      save,
      baseBoardID,
      elements,
      viewport,
    })

    expect(await scheduler.flush()).toBeTrue()
    await flushMicrotasks()
    expect(calls).toEqual(["node"])
  })

  test("reports failed saves to callers", async () => {
    const calls: string[] = []
    const save: WhiteboardLearnerSaveHandler = async () => {
      calls.push("save")
      return calls.length === 1 ? { status: "failed" } : { status: "saved" }
    }
    const scheduler = createWhiteboardLearnerSaveScheduler({ delayMs: 60_000 })

    scheduler.schedule({
      save,
      baseBoardID,
      elements,
      viewport,
    })

    expect(await scheduler.flush()).toBeFalse()
    expect(await scheduler.flush()).toBeTrue()
    expect(calls).toEqual(["save", "save"])
  })

  test("replaces a pending payload without saving the old snapshot", async () => {
    const calls: string[] = []
    const saveFirst: WhiteboardLearnerSaveHandler = async () => {
      calls.push("first")
      return { status: "saved" }
    }
    const saveSecond: WhiteboardLearnerSaveHandler = async (input) => {
      calls.push(`second:${input.elements[0]?.id ?? "missing"}`)
      return { status: "saved" }
    }
    const scheduler = createWhiteboardLearnerSaveScheduler({ delayMs: 60_000 })

    scheduler.schedule({
      save: saveFirst,
      baseBoardID,
      elements,
      viewport,
    })
    scheduler.schedule({
      save: saveSecond,
      baseBoardID,
      elements,
      viewport,
    })

    expect(await scheduler.flush()).toBeTrue()
    await flushMicrotasks()
    expect(calls).toEqual(["second:node"])
  })

  test("flushes the latest queued edit against the same checkpoint after an in-flight save", async () => {
    const calls: string[] = []
    const baseBoardIDs: string[] = []
    let finishFirst = noopFinishWhiteboardSave
    const save: WhiteboardLearnerSaveHandler = async (input) => {
      calls.push(input.elements[0]?.id ?? "missing")
      baseBoardIDs.push(input.baseBoardID)
      if (calls.length === 1) {
        return new Promise<WhiteboardLearnerSaveResult>((resolve) => {
          finishFirst = resolve
        })
      }
      return { status: "saved" }
    }
    const scheduler = createWhiteboardLearnerSaveScheduler({ delayMs: 60_000 })

    scheduler.schedule({
      save,
      baseBoardID,
      elements,
      viewport,
    })
    const firstFlush = scheduler.flush()

    scheduler.schedule({
      save,
      baseBoardID,
      elements: [{ type: "rectangle", id: "node-2", x: 0, y: 0, width: 120, height: 80 }],
      viewport,
    })
    const secondFlush = scheduler.flush()
    expect(calls).toEqual(["node"])

    finishFirst({ status: "saved" })
    expect(await firstFlush).toBeTrue()
    expect(await secondFlush).toBeTrue()
    await flushMicrotasks()

    expect(calls).toEqual(["node", "node-2"])
    expect(baseBoardIDs).toEqual([baseBoardID, baseBoardID])
  })

  test("keeps the latest queued edit when an in-flight save fails", async () => {
    const calls: string[] = []
    let finishFirst = noopFinishWhiteboardSave
    const save: WhiteboardLearnerSaveHandler = async (input) => {
      calls.push(input.elements[0]?.id ?? "missing")
      if (calls.length === 1) {
        return new Promise<WhiteboardLearnerSaveResult>((resolve) => {
          finishFirst = resolve
        })
      }
      return { status: "saved" }
    }
    const scheduler = createWhiteboardLearnerSaveScheduler({ delayMs: 60_000 })

    scheduler.schedule({
      save,
      baseBoardID,
      elements,
      viewport,
    })
    const firstFlush = scheduler.flush()

    scheduler.schedule({
      save,
      baseBoardID,
      elements: [{ type: "rectangle", id: "node-2", x: 0, y: 0, width: 120, height: 80 }],
      viewport,
    })
    const secondFlush = scheduler.flush()

    finishFirst({ status: "failed" })
    expect(await firstFlush).toBeFalse()
    expect(await secondFlush).toBeFalse()
    await flushMicrotasks()

    expect(calls).toEqual(["node"])

    expect(await scheduler.flush()).toBeTrue()
    await flushMicrotasks()
    expect(calls).toEqual(["node", "node-2"])
  })

  test("discards same-base queued edits after a stale save is skipped", async () => {
    const calls: string[] = []
    let finishFirst = noopFinishWhiteboardSave
    const save: WhiteboardLearnerSaveHandler = async (input) => {
      calls.push(input.elements[0]?.id ?? "missing")
      return new Promise<WhiteboardLearnerSaveResult>((resolve) => {
        finishFirst = resolve
      })
    }
    const scheduler = createWhiteboardLearnerSaveScheduler({ delayMs: 60_000 })

    scheduler.schedule({
      save,
      baseBoardID,
      elements,
      viewport,
    })
    const firstFlush = scheduler.flush()

    scheduler.schedule({
      save,
      baseBoardID,
      elements: [{ type: "rectangle", id: "node-2", x: 0, y: 0, width: 120, height: 80 }],
      viewport,
    })
    const secondFlush = scheduler.flush()

    finishFirst({ status: "skipped" })
    expect(await firstFlush).toBeFalse()
    expect(await secondFlush).toBeFalse()
    expect(await scheduler.flush()).toBeTrue()
    expect(calls).toEqual(["node"])
  })

  test("keeps a pending edit after an in-flight save throws until it can be flushed again", async () => {
    const calls: string[] = []
    let failFirst = noopFailWhiteboardSave
    const save: WhiteboardLearnerSaveHandler = async (input) => {
      calls.push(input.elements[0]?.id ?? "missing")
      if (calls.length === 1) {
        return new Promise<WhiteboardLearnerSaveResult>((_resolve, reject) => {
          failFirst = reject
        })
      }
      return { status: "saved" }
    }
    const scheduler = createWhiteboardLearnerSaveScheduler({ delayMs: 60_000 })

    scheduler.schedule({
      save,
      baseBoardID,
      elements,
      viewport,
    })
    const firstFlush = scheduler.flush()

    scheduler.schedule({
      save,
      baseBoardID,
      elements: [{ type: "rectangle", id: "node-2", x: 0, y: 0, width: 120, height: 80 }],
      viewport,
    })
    const secondFlush = scheduler.flush()

    failFirst(new Error("offline"))
    expect(await firstFlush).toBeFalse()
    expect(await secondFlush).toBeFalse()
    await flushMicrotasks()
    expect(calls).toEqual(["node"])

    expect(await scheduler.flush()).toBeTrue()
    await flushMicrotasks()
    expect(calls).toEqual(["node", "node-2"])
  })
})
