import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { rememberProject, sendPrompt, shouldDeferTranscriptReload } from "../src/state/chat-actions"
import { useChatStore } from "../src/state/chat-store"

const originalFetch = globalThis.fetch

function resetStore() {
  useChatStore.setState({
    projects: [],
    activeDirectory: undefined,
    lastSessionByDirectory: {},
    directories: {},
    streamStatus: "idle",
  })
}

beforeEach(() => {
  localStorage.clear()
  resetStore()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("rememberProject", () => {
  test("persists the project only after the backend accepts it", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ directory: "/repo" }), {
        headers: {
          "content-type": "application/json",
        },
      })) as typeof fetch

    const nextDirectory = await rememberProject("/repo/")

    expect(nextDirectory).toBe("/repo")
    expect(useChatStore.getState().projects).toEqual(["/repo"])
  })

  test("does not add the project when the backend rejects it", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "Directory is outside allowed roots" }), {
        status: 403,
        headers: {
          "content-type": "application/json",
        },
      })) as typeof fetch

    await expect(rememberProject("/denied")).rejects.toThrow("Directory is outside allowed roots")
    expect(useChatStore.getState().projects).toEqual([])
  })
})

describe("shouldDeferTranscriptReload", () => {
  test("defers transcript reload while the current session is streaming", () => {
    useChatStore.setState({
      directories: {
        "/repo": {
          sessionTitle: "New chat",
          sessions: [],
          sessionStatusByID: { session_1: "busy" },
          messages: [],
          pendingPermissions: [],
          providers: [],
          providerDefault: {},
          isBusy: true,
          isReady: true,
          sessionID: "session_1",
        },
      },
      streamStatus: "connected",
    })

    expect(shouldDeferTranscriptReload("/repo", "session_1")).toBe(true)
  })

  test("does not defer transcript reload when the stream is not active", () => {
    useChatStore.setState({
      directories: {
        "/repo": {
          sessionTitle: "New chat",
          sessions: [],
          sessionStatusByID: { session_1: "busy" },
          messages: [],
          pendingPermissions: [],
          providers: [],
          providerDefault: {},
          isBusy: true,
          isReady: true,
          sessionID: "session_1",
        },
      },
      streamStatus: "idle",
    })

    expect(shouldDeferTranscriptReload("/repo", "session_1")).toBe(false)
  })
})

describe("sendPrompt", () => {
  test("does not start a transcript polling loop after prompt submission", async () => {
    let requests = 0

    useChatStore.setState({
      directories: {
        "/repo": {
          sessionTitle: "New chat",
          sessions: [],
          sessionStatusByID: {},
          messages: [],
          pendingPermissions: [],
          providers: [],
          providerDefault: {},
          isBusy: false,
          isReady: true,
          sessionID: "session_1",
        },
      },
    })

    globalThis.fetch = (async () => {
      requests += 1
      return new Response(JSON.stringify({}), {
        headers: {
          "content-type": "application/json",
        },
      })
    }) as typeof fetch

    await sendPrompt("/repo", "hello")
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 350)
    })

    expect(requests).toBe(1)
  })
})
