import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import { sendCommand } from "../src/state/chat-actions"
import { useChatStore } from "../src/state/chat-store"
import {
  getTranscriptMessages,
  resetTranscriptRepositoryForTests,
} from "../src/state/transcript-repository"
import { createFetchStub, seedDirectoryChatState } from "./test-utils"

const DIRECTORY = "/repo-send-command"
const SESSION_ID = "ses_send_command"

describe("sendCommand", () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    resetTranscriptRepositoryForTests()
    useChatStore.setState({ directories: {} })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    useChatStore.setState({ directories: {} })
    resetTranscriptRepositoryForTests()
  })

  test("settles a command whose response is the session rather than an assistant turn", async () => {
    seedDirectoryChatState(DIRECTORY, {
      sessionID: SESSION_ID,
      sessions: [{ id: SESSION_ID, title: "Before", time: { created: 1, updated: 1 } }],
      messages: [],
    })
    const requests: string[] = []
    globalThis.fetch = createFetchStub(async (input) => {
      const url = input instanceof Request ? input.url : String(input)
      requests.push(new URL(url, "http://buddy.test").pathname)
      return Response.json({
        id: SESSION_ID,
        projectID: "prj_send_command",
        directory: DIRECTORY,
        title: "After",
        time: { created: 1, updated: 2 },
      })
    })

    await expect(sendCommand(DIRECTORY, "init", "")).resolves.toBe(SESSION_ID)

    const state = useChatStore.getState().directories[DIRECTORY]
    expect(requests).toEqual([`/api/session/${SESSION_ID}/command`])
    expect(state?.sessionStatusByID[SESSION_ID]).toEqual({ type: "idle" })
    expect(state?.sessions).toEqual([
      expect.objectContaining({ id: SESSION_ID, title: "After", time: { created: 1, updated: 2 } }),
    ])
    expect(state?.error).toBeUndefined()
    expect(getTranscriptMessages(DIRECTORY, SESSION_ID)).toEqual([])
  })
})
