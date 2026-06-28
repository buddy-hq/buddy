import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import {
  addTranscriptPendingInput,
  applyTranscriptMessageRemoved,
  applyTranscriptMessageUpdated,
  applyTranscriptPartDelta,
  applyTranscriptPartRemoved,
  applyTranscriptPartUpdated,
  getTranscriptMessages,
  getTranscriptPart,
  hasTranscriptMessages,
  loadOlderTranscriptMessages,
  loadTranscriptMessages,
  markTranscriptSessionOptimistic,
  markTranscriptSessionRunning,
  pinTranscriptSession,
  removeTranscriptPendingInput,
  resetTranscriptRepositoryForTests,
  sealTranscriptAssistantMessages,
  syncTranscriptPendingInputs,
  TRANSCRIPT_CACHE_LIMIT,
} from "../src/state/transcript-repository"
import type { MessagePart, MessageWithParts } from "../src/state/chat-types"
import {
  createAssistantMessageInfo,
  createMessageWithParts,
  createUserMessageInfo,
} from "./test-utils"

const directory = "/repo"
const sessionID = "session_1"
const NEXT_CURSOR_HEADER = "x-next-cursor"
const INITIAL_LIMIT = "2"
const HISTORY_LIMIT = "200"

type FetchPage = {
  messages: MessageWithParts[]
  cursor?: string
}

type DeferredPage = FetchPage & {
  deferred: true
}

function textPart(input: {
  id: string
  messageID: string
  sessionID?: string
  text: string
}): MessagePart {
  return {
    id: input.id,
    sessionID: input.sessionID ?? sessionID,
    messageID: input.messageID,
    type: "text",
    text: input.text,
  }
}

function reasoningPart(input: {
  id: string
  messageID: string
  sessionID?: string
  text: string
}): MessagePart {
  return {
    id: input.id,
    sessionID: input.sessionID ?? sessionID,
    messageID: input.messageID,
    type: "reasoning",
    text: input.text,
    time: {
      start: 10,
    },
  }
}

function toolPart(input: {
  id: string
  messageID: string
  sessionID?: string
  status: "pending" | "running" | "completed" | "error"
}): MessagePart {
  return {
    id: input.id,
    sessionID: input.sessionID ?? sessionID,
    messageID: input.messageID,
    callID: `${input.id}_call`,
    type: "tool",
    tool: "bench_present",
    state: {
      status: input.status,
      input: {},
      metadata: {},
      time: {
        start: 11,
      },
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  return true
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function userMessage(id: string, created: number, text = id): MessageWithParts {
  return createMessageWithParts(
    createUserMessageInfo({
      id,
      sessionID,
      time: { created },
    }),
    [textPart({ id: `${id}_part`, messageID: id, text })],
  )
}

function assistantMessage(id: string, created: number, text = id): MessageWithParts {
  return createMessageWithParts(
    createAssistantMessageInfo({
      id,
      sessionID,
      time: { created },
    }),
    [textPart({ id: `${id}_part`, messageID: id, text })],
  )
}

function requestURL(input: RequestInfo | URL) {
  if (input instanceof Request) return input.url
  if (input instanceof URL) return input.toString()
  return input
}

function responseFor(page: FetchPage) {
  const headers = new Headers()
  if (page.cursor) {
    headers.set(NEXT_CURSOR_HEADER, page.cursor)
  }
  return Response.json(page.messages, { headers })
}

function installTranscriptFetch(
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
) {
  globalThis.fetch = Object.assign(fetcher, {
    preconnect: globalThis.fetch.preconnect,
  })
}

function installPageFetch(pages: FetchPage[]) {
  const requests: URL[] = []
  installTranscriptFetch(async (input) => {
    requests.push(new URL(requestURL(input), "http://localhost"))
    const page = pages.shift()
    if (!page) {
      throw new Error("Unexpected transcript request")
    }
    return responseFor(page)
  })
  return requests
}

function installDeferredPageFetch(page: DeferredPage) {
  const requests: URL[] = []
  let resolvePage: (() => void) | undefined
  installTranscriptFetch(async (input) => {
    requests.push(new URL(requestURL(input), "http://localhost"))
    return new Promise<Response>((resolve) => {
      resolvePage = () => resolve(responseFor(page))
    })
  })
  return {
    requests,
    resolve() {
      resolvePage?.()
    },
  }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe("transcript repository", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    resetTranscriptRepositoryForTests()
  })

  afterEach(() => {
    resetTranscriptRepositoryForTests()
    globalThis.fetch = originalFetch
  })

  test("loads the newest page first and prepends older cursor pages", async () => {
    const requests = installPageFetch([
      {
        messages: [userMessage("m3", 3), assistantMessage("m4", 4)],
        cursor: "m3",
      },
      {
        messages: [userMessage("m1", 1), assistantMessage("m2", 2)],
      },
    ])

    await loadTranscriptMessages(directory, sessionID, { force: true })
    expect(getTranscriptMessages(directory, sessionID).map((message) => message.info.id)).toEqual([
      "m3",
      "m4",
    ])

    await loadOlderTranscriptMessages(directory, sessionID)

    expect(getTranscriptMessages(directory, sessionID).map((message) => message.info.id)).toEqual([
      "m1",
      "m2",
      "m3",
      "m4",
    ])
    expect(requests[0]?.searchParams.get("limit")).toBe(INITIAL_LIMIT)
    expect(requests[1]?.searchParams.get("limit")).toBe(HISTORY_LIMIT)
    expect(requests[1]?.searchParams.get("before")).toBe("m3")
  })

  test("preserves streamed message suffixes while a refresh page is in flight", async () => {
    applyTranscriptMessageUpdated(directory, userMessage("m1", 1).info)
    applyTranscriptPartUpdated(directory, textPart({ id: "m1_part", messageID: "m1", text: "old" }))

    const fetchControl = installDeferredPageFetch({
      deferred: true,
      messages: [userMessage("m1", 1, "snapshot")],
      cursor: "m1",
    })
    const load = loadTranscriptMessages(directory, sessionID, { force: true })
    await flushMicrotasks()

    applyTranscriptMessageUpdated(directory, assistantMessage("m2", 2).info)
    applyTranscriptPartUpdated(
      directory,
      textPart({ id: "m2_part", messageID: "m2", text: "live" }),
    )

    fetchControl.resolve()
    await load

    expect(fetchControl.requests).toHaveLength(1)
    expect(getTranscriptMessages(directory, sessionID).map((message) => message.info.id)).toEqual([
      "m1",
      "m2",
    ])
    expect(getTranscriptMessages(directory, sessionID)[1]?.parts[0]?.id).toBe("m2_part")
  })

  test("preserves interleaved part deltas while a refresh page is in flight", async () => {
    applyTranscriptMessageUpdated(directory, userMessage("m1", 1).info)
    applyTranscriptPartUpdated(directory, textPart({ id: "m1_part", messageID: "m1", text: "old" }))

    const fetchControl = installDeferredPageFetch({
      deferred: true,
      messages: [userMessage("m1", 1, "snapshot")],
    })
    const load = loadTranscriptMessages(directory, sessionID, { force: true })
    await flushMicrotasks()

    applyTranscriptPartDelta(directory, {
      sessionID,
      messageID: "m1",
      partID: "m1_part",
      field: "text",
      delta: " live",
    })

    fetchControl.resolve()
    await load

    expect(getTranscriptMessages(directory, sessionID)[0]?.parts[0]?.text).toBe("old live")
  })

  test("updates only the streamed part record while accumulating adjacent fields", () => {
    applyTranscriptMessageUpdated(directory, assistantMessage("m1", 1).info)
    applyTranscriptPartUpdated(
      directory,
      textPart({ id: "m1_part", messageID: "m1", text: "Hello" }),
    )
    applyTranscriptPartUpdated(
      directory,
      textPart({ id: "m1_other", messageID: "m1", text: "Stable" }),
    )
    const stablePart = getTranscriptPart("m1_other")

    applyTranscriptPartDelta(directory, {
      sessionID,
      messageID: "m1",
      partID: "m1_part",
      field: "text",
      delta: " world",
    })
    applyTranscriptPartDelta(directory, {
      sessionID,
      messageID: "m1",
      partID: "m1_part",
      field: "text",
      delta: "!",
    })

    expect(getTranscriptPart("m1_part")?.text).toBe("Hello world!")
    expect(getTranscriptPart("m1_other")).toBe(stablePart)
  })

  test("reconciles running parts when sealing terminal assistant messages", () => {
    applyTranscriptMessageUpdated(
      directory,
      createAssistantMessageInfo({
        id: "m_terminal",
        sessionID,
        time: { created: 1 },
      }),
    )
    applyTranscriptPartUpdated(
      directory,
      reasoningPart({ id: "m_terminal_reasoning", messageID: "m_terminal", text: "thinking" }),
    )
    applyTranscriptPartUpdated(
      directory,
      toolPart({ id: "m_terminal_tool", messageID: "m_terminal", status: "running" }),
    )

    sealTranscriptAssistantMessages(directory, sessionID, 20)

    const [message] = getTranscriptMessages(directory, sessionID)
    expect(message?.info.time.completed).toBe(20)

    const reasoningTime = recordValue(getTranscriptPart("m_terminal_reasoning")?.time)
    expect(reasoningTime?.start).toBe(10)
    expect(reasoningTime?.end).toBe(20)

    const toolState = recordValue(getTranscriptPart("m_terminal_tool")?.state)
    expect(toolState?.status).toBe("error")
    expect(toolState?.error).toBe("Tool execution interrupted")
    const toolMetadata = recordValue(toolState?.metadata)
    expect(toolMetadata?.interrupted).toBe(true)
    const toolTime = recordValue(toolState?.time)
    expect(toolTime?.start).toBe(11)
    expect(toolTime?.end).toBe(20)
  })

  test("does not resurrect running tools from late snapshots after terminal assistant messages", () => {
    applyTranscriptMessageUpdated(
      directory,
      createAssistantMessageInfo({
        id: "m_late_terminal",
        sessionID,
        time: { created: 1, completed: 30 },
        finish: "interrupted",
      }),
    )

    applyTranscriptPartUpdated(
      directory,
      toolPart({ id: "m_late_tool", messageID: "m_late_terminal", status: "pending" }),
    )

    const toolState = recordValue(getTranscriptPart("m_late_tool")?.state)
    expect(toolState?.status).toBe("error")
    expect(toolState?.error).toBe("Tool execution interrupted")
    const toolTime = recordValue(toolState?.time)
    expect(toolTime?.end).toBe(30)
  })

  test("preserves orphan parts that arrive before their parent message outside reloads", () => {
    applyTranscriptPartUpdated(
      directory,
      toolPart({ id: "orphan_tool", messageID: "orphan_parent", status: "running" }),
    )
    applyTranscriptMessageUpdated(
      directory,
      createAssistantMessageInfo({
        id: "orphan_parent",
        sessionID,
        time: { created: 1 },
      }),
    )

    expect(getTranscriptMessages(directory, sessionID)[0]?.parts.map((part) => part.id)).toEqual([
      "orphan_tool",
    ])
  })

  test("applies orphan part deltas before the parent message arrives", () => {
    applyTranscriptPartUpdated(
      directory,
      textPart({ id: "orphan_text", messageID: "orphan_text_parent", text: "first" }),
    )
    applyTranscriptPartDelta(directory, {
      sessionID,
      messageID: "orphan_text_parent",
      partID: "orphan_text",
      field: "text",
      delta: " second",
    })
    applyTranscriptMessageUpdated(
      directory,
      createAssistantMessageInfo({
        id: "orphan_text_parent",
        sessionID,
        time: { created: 1 },
      }),
    )

    expect(getTranscriptPart("orphan_text")?.text).toBe("first second")
  })

  test("honors orphan part removals before the parent message arrives", () => {
    applyTranscriptPartUpdated(
      directory,
      textPart({ id: "removed_orphan_text", messageID: "removed_orphan_parent", text: "gone" }),
    )
    applyTranscriptPartRemoved(directory, {
      sessionID,
      messageID: "removed_orphan_parent",
      partID: "removed_orphan_text",
    })
    applyTranscriptMessageUpdated(
      directory,
      createAssistantMessageInfo({
        id: "removed_orphan_parent",
        sessionID,
        time: { created: 1 },
      }),
    )

    expect(getTranscriptMessages(directory, sessionID)[0]?.parts).toEqual([])
    expect(getTranscriptPart("removed_orphan_text")).toBeUndefined()
  })

  test("preserves optimistic content while a refresh page is in flight", async () => {
    const fetchControl = installDeferredPageFetch({
      deferred: true,
      messages: [],
    })
    const load = loadTranscriptMessages(directory, sessionID, { force: true })
    await flushMicrotasks()

    applyTranscriptMessageUpdated(directory, userMessage("m1", 1).info)
    applyTranscriptPartUpdated(directory, {
      ...textPart({ id: "m1_part", messageID: "m1", text: "optimistic" }),
      optimistic: true,
    })

    fetchControl.resolve()
    await load

    expect(getTranscriptMessages(directory, sessionID).map((message) => message.info.id)).toEqual([
      "m1",
    ])
    expect(getTranscriptMessages(directory, sessionID)[0]?.parts[0]?.text).toBe("optimistic")
  })

  test("extends the initial page backward to the latest user boundary", async () => {
    const requests = installPageFetch([
      {
        messages: [
          createMessageWithParts(
            createAssistantMessageInfo({
              id: "m4",
              sessionID,
              time: { created: 4 },
            }),
            [textPart({ id: "m4_part", messageID: "m4", text: "assistant 2" })],
          ),
          createMessageWithParts(
            createAssistantMessageInfo({
              id: "m5",
              sessionID,
              time: { created: 5 },
            }),
            [textPart({ id: "m5_part", messageID: "m5", text: "assistant 3" })],
          ),
        ],
        cursor: "m4",
      },
      {
        messages: [userMessage("m3", 3, "latest prompt")],
        cursor: "m3",
      },
    ])

    await loadTranscriptMessages(directory, sessionID, { force: true })

    expect(getTranscriptMessages(directory, sessionID).map((message) => message.info.id)).toEqual([
      "m3",
      "m4",
      "m5",
    ])
    expect(requests[0]?.searchParams.get("limit")).toBe(INITIAL_LIMIT)
    expect(requests[1]?.searchParams.get("limit")).toBe(HISTORY_LIMIT)
    expect(requests[1]?.searchParams.get("before")).toBe("m4")
  })

  test("merges orphan parts that arrive before their parent message snapshot", async () => {
    const fetchControl = installDeferredPageFetch({
      deferred: true,
      messages: [assistantMessage("m2", 2, "snapshot")],
    })
    const load = loadTranscriptMessages(directory, sessionID, { force: true })
    await flushMicrotasks()

    applyTranscriptPartUpdated(
      directory,
      textPart({ id: "m2_live_part", messageID: "m2", text: "live" }),
    )

    fetchControl.resolve()
    await load

    expect(getTranscriptMessages(directory, sessionID)[0]?.parts.map((part) => part.id)).toEqual([
      "m2_live_part",
      "m2_part",
    ])
  })

  test("keeps message removals as tombstones while a refresh page is in flight", async () => {
    applyTranscriptMessageUpdated(directory, userMessage("m1", 1).info)
    applyTranscriptPartUpdated(directory, textPart({ id: "m1_part", messageID: "m1", text: "old" }))

    const fetchControl = installDeferredPageFetch({
      deferred: true,
      messages: [userMessage("m1", 1, "snapshot")],
    })
    const load = loadTranscriptMessages(directory, sessionID, { force: true })
    await flushMicrotasks()

    applyTranscriptMessageRemoved(directory, {
      sessionID,
      messageID: "m1",
    })

    fetchControl.resolve()
    await load

    expect(getTranscriptMessages(directory, sessionID)).toEqual([])
  })

  test("does not evict pinned sessions when the LRU exceeds its limit", () => {
    applyTranscriptMessageUpdated(directory, userMessage("s0_message", 1).info)
    const unpin = pinTranscriptSession(directory, sessionID)

    for (let index = 1; index <= TRANSCRIPT_CACHE_LIMIT; index += 1) {
      const nextSessionID = `session_${index + 1}`
      applyTranscriptMessageUpdated(
        directory,
        createUserMessageInfo({
          id: `s${index}_message`,
          sessionID: nextSessionID,
          time: { created: index + 1 },
        }),
      )
    }

    expect(hasTranscriptMessages(directory, sessionID)).toBe(true)
    expect(hasTranscriptMessages(directory, "session_2")).toBe(false)
    expect(hasTranscriptMessages(directory, "session_41")).toBe(true)
    unpin()
  })

  test("does not evict optimistic sessions when the LRU exceeds its limit", () => {
    applyTranscriptMessageUpdated(directory, userMessage("s0_message", 1).info)
    markTranscriptSessionOptimistic(directory, sessionID, true)

    for (let index = 1; index <= TRANSCRIPT_CACHE_LIMIT; index += 1) {
      const nextSessionID = `optimistic_session_${index + 1}`
      applyTranscriptMessageUpdated(
        directory,
        createUserMessageInfo({
          id: `optimistic_${index}_message`,
          sessionID: nextSessionID,
          time: { created: index + 1 },
        }),
      )
    }

    expect(hasTranscriptMessages(directory, sessionID)).toBe(true)
    expect(hasTranscriptMessages(directory, "optimistic_session_2")).toBe(false)
    expect(hasTranscriptMessages(directory, "optimistic_session_41")).toBe(true)
    markTranscriptSessionOptimistic(directory, sessionID, false)
  })

  test("does not evict running or pending-input sessions", () => {
    applyTranscriptMessageUpdated(directory, userMessage("s0_message", 1).info)
    markTranscriptSessionRunning(directory, sessionID, true)
    addTranscriptPendingInput(directory, {
      requestID: "request_1",
      sessionID,
    })

    for (let index = 1; index <= TRANSCRIPT_CACHE_LIMIT; index += 1) {
      const nextSessionID = `protected_session_${index + 1}`
      applyTranscriptMessageUpdated(
        directory,
        createUserMessageInfo({
          id: `protected_${index}_message`,
          sessionID: nextSessionID,
          time: { created: index + 1 },
        }),
      )
    }

    expect(hasTranscriptMessages(directory, sessionID)).toBe(true)
    expect(hasTranscriptMessages(directory, "protected_session_2")).toBe(false)
    markTranscriptSessionRunning(directory, sessionID, false)
    removeTranscriptPendingInput(directory, "request_1")
  })

  test("reconciles pending-input protection from a refreshed directory snapshot", () => {
    applyTranscriptMessageUpdated(directory, userMessage("s0_message", 1).info)
    syncTranscriptPendingInputs(directory, [{ requestID: "request_1", sessionID }])

    for (let index = 1; index <= TRANSCRIPT_CACHE_LIMIT; index += 1) {
      applyTranscriptMessageUpdated(
        directory,
        createUserMessageInfo({
          id: `synced_pending_${index}_message`,
          sessionID: `synced_pending_session_${index + 1}`,
          time: { created: index + 1 },
        }),
      )
    }

    expect(hasTranscriptMessages(directory, sessionID)).toBe(true)

    syncTranscriptPendingInputs(directory, [])
    applyTranscriptMessageUpdated(
      directory,
      createUserMessageInfo({
        id: "synced_pending_last_message",
        sessionID: "synced_pending_last_session",
        time: { created: TRANSCRIPT_CACHE_LIMIT + 2 },
      }),
    )

    expect(hasTranscriptMessages(directory, sessionID)).toBe(false)
  })
})
