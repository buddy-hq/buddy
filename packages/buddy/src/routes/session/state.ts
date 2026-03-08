import { deleteTeachingSessionState, readTeachingSessionState, writeTeachingSessionState } from "../../learning/runtime/session-state.js"
import type { TeachingSessionState } from "../../learning/runtime/types.js"

function cloneTracePayload(input: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(input)) as Record<string, unknown>
  } catch {
    return {
      _traceError: "failed to clone transformed payload",
    }
  }
}

const LLM_OUTBOUND_HISTORY_LIMIT = 120

export function writeLastLlmOutbound(input: {
  directory: string
  sessionID: string
  kind: "message" | "command"
  payload: Record<string, unknown>
}) {
  const state = readTeachingSessionState(input.directory, input.sessionID)
  if (!state) return

  const systemPromptSentRaw = typeof input.payload.system === "string" ? input.payload.system : ""
  const systemPromptSent = systemPromptSentRaw.trim()
  const systemPromptBase = state.inspector?.stableHeader.trim() ?? ""
  const systemPromptEffective = systemPromptSent || systemPromptBase
  const outboundEntry = {
    kind: input.kind,
    createdAt: new Date().toISOString(),
    payload: cloneTracePayload(input.payload),
    ...(systemPromptSent ? { systemPromptSent } : {}),
    ...(systemPromptBase ? { systemPromptBase } : {}),
    ...(systemPromptEffective ? { systemPromptEffective } : {}),
  }
  const nextHistory = [...(state.llmOutboundHistory ?? []), outboundEntry]

  writeTeachingSessionState(input.directory, {
    ...state,
    lastLlmOutbound: outboundEntry,
    llmOutboundHistory: nextHistory.length > LLM_OUTBOUND_HISTORY_LIMIT
      ? nextHistory.slice(nextHistory.length - LLM_OUTBOUND_HISTORY_LIMIT)
      : nextHistory,
  })
}

export function restoreTeachingSessionState(input: {
  directory: string
  sessionID: string
  previousState?: TeachingSessionState
}) {
  if (input.previousState) {
    writeTeachingSessionState(input.directory, input.previousState)
    return
  }

  deleteTeachingSessionState(input.directory, input.sessionID)
}
