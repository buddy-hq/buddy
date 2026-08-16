import {
  deleteTeachingSessionState,
  readTeachingSessionState,
  writeTeachingSessionState,
} from "../state/session-state"
import type { TeachingSessionState } from "../../shared/teaching-session-state"

function cloneTracePayload(input: Record<string, unknown>) {
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

  const outboundEntry = {
    kind: input.kind,
    createdAt: new Date().toISOString(),
    payload: cloneTracePayload(input.payload),
  }
  const nextHistory = [...(state.llmOutboundHistory ?? []), outboundEntry]

  writeTeachingSessionState(input.directory, {
    ...state,
    lastLlmOutbound: outboundEntry,
    llmOutboundHistory: nextHistory.slice(-LLM_OUTBOUND_HISTORY_LIMIT),
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
