import { afterEach, expect, test } from "bun:test"
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { ToolPart } from "@buddy/transcript-contract/message"
import { McpInputNotice } from "../src/components/directory-chat/mcp-input-notice"
import { useChatStore } from "../src/state/chat-store"
import { applyTranscriptPartUpdated, resetTranscriptRepositoryForTests } from "../src/state/transcript-repository"
import { createAssistantMessageInfo, createMessageWithParts, seedDirectoryChatState } from "./test-utils"

const initial = useChatStore.getState()
const request = { requestID: "frm_lifetime", server: "Docs", toolPrefix: "Docs" }

function call(directory = "/first", sessionID = "ses_first", messageID = "msg_first", callID = "call_first", rows?: { tool: string; status: string }[]) {
  const part: ToolPart = {
    type: "tool", id: `part_${callID}`, sessionID, messageID, callID, tool: rows ? "execute" : "Docs_search",
    state: { status: "running", input: {}, metadata: rows ? { toolCalls: rows } : {}, time: { start: 1 } },
  }
  const message = createMessageWithParts(createAssistantMessageInfo({ id: messageID, sessionID }), [part])
  useChatStore.getState().ensureOpenProject(directory)
  seedDirectoryChatState(directory, { sessionID, sessions: [{ id: sessionID, title: sessionID, time: { created: 1, updated: 1 } }], sessionStatusByID: { [sessionID]: { type: "busy" } }, isBusy: true, messages: [message] })
  return { part, message, directory }
}

function end(input: ReturnType<typeof call>) {
  applyTranscriptPartUpdated(input.directory, { ...input.part, state: { status: "completed", input: {}, output: "Done", metadata: {}, time: { start: 1, end: 2 } } })
}

afterEach(() => {
  useChatStore.getState().clearMcpInputRequests()
  useChatStore.setState(initial)
  resetTranscriptRepositoryForTests()
})

test("256 unsettled requests cannot reattach to a later call to the same server", async () => {
  const old = call()
  for (let index = 0; index < 256; index++) useChatStore.getState().applyMcpInputRequested({ ...request, requestID: `frm_${index}` })
  end(old)
  call("/first", "ses_first", "msg_later", "call_later")
  const container = document.createElement("div")
  const root = createRoot(container)
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  try {
    await act(async () => root.render(<McpInputNotice sessionID="ses_first" isRunning onStop={() => {}} />))
    expect(container.querySelectorAll('[role="alert"]').length).toBe(0)
    expect(useChatStore.getState().pendingMcpInputRequests).toEqual({})
  } finally {
    await act(async () => root.unmount())
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  }
})

test("retires a request from the store when its captured call ends without settlement", () => {
  const current = call()
  useChatStore.getState().applyMcpInputRequested(request)
  end(current)
  expect(useChatStore.getState().pendingMcpInputRequests).toEqual({})
})

test("captures candidates in every open notebook and waits for the last one", () => {
  const first = call()
  const second = call("/second", "ses_second", "msg_second", "call_second")
  useChatStore.getState().applyMcpInputRequested(request)
  end(first)
  expect(useChatStore.getState().pendingMcpInputRequests).toHaveProperty(request.requestID)
  end(second)
  expect(useChatStore.getState().pendingMcpInputRequests).toEqual({})
})

test("a later Code Mode row in the same execute call does not inherit a request", () => {
  const current = call("/first", "ses_first", "msg_first", "call_first", [{ tool: "Docs.search", status: "running" }])
  useChatStore.getState().applyMcpInputRequested(request)
  applyTranscriptPartUpdated(current.directory, { ...current.part, state: { ...current.part.state, status: "running", metadata: { toolCalls: [{ tool: "Docs.search", status: "completed" }, { tool: "Docs.search", status: "running" }] }, time: { start: 1 } } })
  expect(useChatStore.getState().pendingMcpInputRequests).toEqual({})
})

test("idle retires captured candidates even if a stale part still says running", () => {
  call()
  useChatStore.getState().applyMcpInputRequested(request)
  useChatStore.getState().applySessionStatus("/first", "ses_first", { type: "idle" })
  expect(useChatStore.getState().pendingMcpInputRequests).toEqual({})
})

test("unmatched requests expire at 10 seconds and duplicate delivery does not extend the window", () => {
  const originalTimeout = globalThis.setTimeout
  const originalClear = globalThis.clearTimeout
  const originalNow = Date.now
  let now = 0
  const timers = new Map<ReturnType<typeof setTimeout>, { at: number; callback: () => void }>()
  function timeout(handler: Parameters<typeof setTimeout>[0], delay?: number): ReturnType<typeof setTimeout> {
    const id = originalTimeout(() => {}, 1_000_000)
    originalClear(id)
    timers.set(id, { at: now + (delay ?? 0), callback: () => { handler() } })
    return id
  }
  function clear<TTimer>(id?: TTimer): void {
    for (const timerID of timers.keys()) {
      if (timerID === id) {
        timers.delete(timerID)
        originalClear(timerID)
      }
    }
  }
  function advance(milliseconds: number) {
    now += milliseconds
    for (const [id, timer] of timers) {
      if (timer.at > now) continue
      timers.delete(id)
      timer.callback()
    }
  }
  globalThis.setTimeout = Object.assign(timeout, originalTimeout)
  globalThis.clearTimeout = clear
  Date.now = () => now
  try {
    useChatStore.getState().applyMcpInputRequested(request)
    advance(9_999)
    useChatStore.getState().applyMcpInputRequested({ ...request })
    expect(useChatStore.getState().pendingMcpInputRequests).toHaveProperty(request.requestID)
    advance(1)
    expect(useChatStore.getState().pendingMcpInputRequests).toEqual({})
    call()
    expect(useChatStore.getState().pendingMcpInputRequests).toEqual({})
  } finally {
    useChatStore.getState().clearMcpInputRequests()
    globalThis.setTimeout = originalTimeout
    globalThis.clearTimeout = originalClear
    Date.now = originalNow
  }
})

test("binds a part that arrives within the grace window and retires it when it ends", () => {
  useChatStore.getState().applyMcpInputRequested(request)
  const late = call()
  end(late)
  expect(useChatStore.getState().pendingMcpInputRequests).toEqual({})
})

test("a Code Mode row arriving during grace updates the mounted notice", async () => {
  const current = call("/first", "ses_first", "msg_first", "call_first", [])
  useChatStore.getState().applyMcpInputRequested(request)
  const container = document.createElement("div")
  const root = createRoot(container)
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  try {
    await act(async () => root.render(<McpInputNotice sessionID="ses_first" isRunning onStop={() => {}} />))
    expect(container.querySelector('[role="alert"]')).toBeNull()
    await act(async () => applyTranscriptPartUpdated(current.directory, { ...current.part, state: { status: "running", input: {}, time: { start: 1 }, metadata: { toolCalls: [{ tool: "Docs.search", status: "running" }] } } }))
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
  } finally {
    await act(async () => root.unmount())
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
  }
})
