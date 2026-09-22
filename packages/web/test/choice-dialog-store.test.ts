import { describe, expect, test } from "bun:test"
import { createChoiceDialogStore } from "../src/state/choice-dialog-store"

function createStore() {
  return createChoiceDialogStore<{ path: string }, "open" | "cancel">("cancel")
}

describe("choice dialog store", () => {
  test("resolves the pending request with the chosen answer", async () => {
    const store = createStore()
    const answer = store.getState().requestChoice({ path: "/Users/example/report.pdf" })

    expect(store.getState().request?.path).toBe("/Users/example/report.pdf")
    store.getState().resolveRequest("open")

    expect(await answer).toBe("open")
    expect(store.getState().request).toBeUndefined()
  })

  test("cancels an older request when a new one arrives", async () => {
    const store = createStore()
    const first = store.getState().requestChoice({ path: "/Users/example/first.pdf" })
    const second = store.getState().requestChoice({ path: "/Users/example/second.pdf" })

    expect(await first).toBe("cancel")
    expect(store.getState().request?.path).toBe("/Users/example/second.pdf")
    store.getState().resolveRequest("open")
    expect(await second).toBe("open")
  })
})
