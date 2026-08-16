import {
  deleteTeachingSessionState,
  readTeachingSessionState,
  writeTeachingSessionState,
} from "../state/session-state"
import type { TeachingSessionState } from "../../shared/teaching-session-state"
import { parseJsonObject, type TJsonObject } from "../../prompt/utils"

function cloneTracePayload(input: TJsonObject): TJsonObject {
  try {
    return parseJsonObject(JSON.parse(JSON.stringify(input))) ?? {}
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
  payload: TJsonObject
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
