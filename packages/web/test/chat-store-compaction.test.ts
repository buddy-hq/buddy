import { beforeEach, describe, expect, test } from "bun:test"
import { useChatStore } from "../src/state/chat-store"
import type { SessionInfo } from "../src/state/chat-types"

const directory = "/tmp/compaction"

function session(id: string, updated: number, compacting?: number): SessionInfo {
  return {
    id,
    title: id,
    time: Object.assign(
      {
        created: updated - 1,
        updated,
      },
      compacting === undefined ? undefined : { compacting },
    ),
  }
}

function resetStore() {
  useChatStore.setState({
    openProjects: [],
    activeDirectory: undefined,
    pendingActiveDirectory: undefined,
    entryError: undefined,
    lastSessionByDirectory: {},
    directories: {},
    streamStatus: "idle",
  })
}

beforeEach(() => {
  localStorage.clear()
  resetStore()
})

describe("chat-store compaction activity", () => {
  test("treats vendor compaction timestamps as active session work", () => {
    const store = useChatStore.getState()

    store.ensureOpenProject(directory)
    store.setSessions(directory, [session("session_1", 2, 3)])

    let next = useChatStore.getState().directories[directory]
    expect(next?.sessionID).toBe("session_1")
    expect(next?.isBusy).toBe(true)

    store.applySessionUpdated(directory, session("session_1", 4))

    next = useChatStore.getState().directories[directory]
    expect(next?.isBusy).toBe(false)
  })
})
