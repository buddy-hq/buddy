import type { StateCreator } from "zustand"
import type { ChatStore } from "./chat-store"
import { getTranscriptMessages, subscribeTranscriptChanges } from "./transcript-repository"
import type { McpInputRequestedEvent } from "@buddy/sdk/types"
import { isRecord, parseString, type MessageWithParts } from "./chat-types"

const MCP_INPUT_CANDIDATE_WINDOW_MS = 10_000

type McpInputCall = {
  sessionID: string
  messageID: string
  callID: string
  tool: string
  rowIndex?: number
}

type PendingMcpInputRequest = McpInputRequestedEvent["properties"] & {
  candidates: McpInputCall[]
  collectUntil?: number
}

function mcpInputCallKey(call: McpInputCall): string {
  return JSON.stringify([call.sessionID, call.messageID, call.callID, call.rowIndex])
}

function matchesMcpInputPrefix(call: McpInputCall, prefix: string): boolean {
  return call.tool.startsWith(`${prefix}${call.rowIndex === undefined ? "_" : "."}`)
}

function runningMcpInputCalls(messages: readonly MessageWithParts[]): McpInputCall[] {
  const calls: McpInputCall[] = []
  for (const message of messages) {
    if (message.info.role !== "assistant" || message.info.time.completed) continue
    for (const part of message.parts) {
      if (part.type !== "tool" || !isRecord(part.state) || part.state.status !== "running") continue
      const tool = parseString(part.tool)
      const callID = parseString(part.callID)
      if (tool === undefined || callID === undefined) continue
      const identity = { sessionID: message.info.sessionID, messageID: message.info.id, callID }
      calls.push({ ...identity, tool })
      if (tool !== "execute" || !isRecord(part.state.metadata)) continue
      const rows = part.state.metadata.toolCalls
      if (!Array.isArray(rows)) continue
      for (const [rowIndex, row] of rows.entries()) {
        if (!isRecord(row) || row.status !== "running") continue
        const nested = parseString(row.tool)
        if (nested !== undefined) calls.push({ ...identity, tool: nested, rowIndex })
      }
    }
  }
  return calls
}


export type McpInputRequestsSlice = {
  pendingMcpInputRequests: Record<string, PendingMcpInputRequest>
  applyMcpInputRequested: (request: McpInputRequestedEvent["properties"]) => void
  applyMcpInputSettled: (requestID: string) => void
  clearMcpInputRequests: () => void
}

export const createMcpInputRequestsSlice: StateCreator<
  ChatStore, [["zustand/immer", never]], [], McpInputRequestsSlice
> = (set, get, api) => {
  const seen = new Set<string>()
  let expiryTimer: ReturnType<typeof setTimeout> | undefined
  let unsubscribeTranscript: (() => void) | undefined
  let unsubscribeStore: (() => void) | undefined
  let reconciling = false

  function openCalls(): McpInputCall[] {
    const state = get()
    return state.openProjects.flatMap((directory) => {
      const current = state.directories[directory]
      if (!current) return []
      const sessions = new Set([
        ...current.sessions.map((session) => session.id),
        ...Object.keys(current.sessionStatusByID),
      ])
      if (current.sessionID) sessions.add(current.sessionID)
      return [...sessions].flatMap((sessionID) =>
        current.sessionStatusByID[sessionID]?.type === "idle"
          ? []
          : runningMcpInputCalls(getTranscriptMessages(directory, sessionID)),
      )
    })
  }

  function reconcile(): void {
    if (reconciling) return
    reconciling = true
    try {
      const calls = openCalls()
      const running = new Set(calls.map(mcpInputCallKey))
      const now = Date.now()
      set((state) => {
        for (const [id, request] of Object.entries(state.pendingMcpInputRequests)) {
          const live = request.candidates.filter((call) => running.has(mcpInputCallKey(call)))
          if (request.candidates.length > 0 && live.length === 0) {
            delete state.pendingMcpInputRequests[id]
            continue
          }
          if (request.candidates.length !== live.length) request.candidates = live
          if (request.collectUntil === undefined) continue
          if (now >= request.collectUntil) {
            if (request.candidates.length === 0) delete state.pendingMcpInputRequests[id]
            else delete request.collectUntil
            continue
          }
          const recorded = new Set(request.candidates.map(mcpInputCallKey))
          for (const call of calls) {
            if (matchesMcpInputPrefix(call, request.toolPrefix) && !recorded.has(mcpInputCallKey(call))) {
              request.candidates.push(call)
            }
          }
        }
      })
      clearTimeout(expiryTimer)
      expiryTimer = undefined
      const pending = Object.values(get().pendingMcpInputRequests)
      if (pending.length === 0) {
        unsubscribeTranscript?.()
        unsubscribeStore?.()
        unsubscribeTranscript = undefined
        unsubscribeStore = undefined
        return
      }
      const deadlines = pending.flatMap((request) =>
        request.collectUntil === undefined ? [] : [request.collectUntil],
      )
      if (deadlines.length > 0) {
        expiryTimer = setTimeout(reconcile, Math.max(0, Math.min(...deadlines) - Date.now()))
      }
    } finally {
      reconciling = false
    }
  }

  return {
    pendingMcpInputRequests: {},
    applyMcpInputRequested(request) {
      if (seen.has(request.requestID)) return
      seen.add(request.requestID)
      const candidates = openCalls().filter((call) => matchesMcpInputPrefix(call, request.toolPrefix))
      const pending: PendingMcpInputRequest = { ...request, candidates }
      if (candidates.length === 0) pending.collectUntil = Date.now() + MCP_INPUT_CANDIDATE_WINDOW_MS
      set((state) => { state.pendingMcpInputRequests[request.requestID] = pending })
      unsubscribeTranscript ??= subscribeTranscriptChanges(reconcile)
      unsubscribeStore ??= api.subscribe((state, previous) => {
        if (
          state.directories !== previous.directories ||
          state.openProjects !== previous.openProjects ||
          state.pendingMcpInputRequests !== previous.pendingMcpInputRequests
        ) reconcile()
      })
      reconcile()
    },
    applyMcpInputSettled(requestID) {
      seen.add(requestID)
      set((state) => { delete state.pendingMcpInputRequests[requestID] })
    },
    clearMcpInputRequests() {
      seen.clear()
      set((state) => {
        if (Object.keys(state.pendingMcpInputRequests).length > 0) state.pendingMcpInputRequests = {}
      })
    },
  }
}
