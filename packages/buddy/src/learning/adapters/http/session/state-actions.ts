import type { Context } from "hono"
import { readTeachingSessionState } from "../../../agent-execution/state/session-state"
import { withConfigSync } from "../../../../http/route-helpers"
import { readCapturedSessionSystemPrompt } from "../../../../opencode-runtime"

export async function getTeachingState(c: Context): Promise<Response> {
  const syncResult = await withConfigSync(c, {
    operation: "teaching-state",
  })
  if (!syncResult.ok) return syncResult.response

  const sessionID = c.req.param("sessionID")
  const state = readTeachingSessionState(syncResult.value.directory, sessionID)
  if (!state) {
    return c.body(null, 204)
  }

  const fullSystemPrompt = state.lastLlmOutbound
    ? await readCapturedSessionSystemPrompt({
        directory: syncResult.value.directory,
        sessionID,
      })
    : undefined

  if (!fullSystemPrompt) {
    return c.json(state)
  }

  const nextHistory =
    Array.isArray(state.llmOutboundHistory) && state.llmOutboundHistory.length > 0
      ? state.llmOutboundHistory.map((entry, index, history) =>
          index === history.length - 1
            ? {
                ...entry,
                fullSystemPrompt,
              }
            : entry,
        )
      : state.llmOutboundHistory

  return c.json({
    ...state,
    lastLlmOutbound: state.lastLlmOutbound
      ? {
          ...state.lastLlmOutbound,
          fullSystemPrompt,
        }
      : state.lastLlmOutbound,
    llmOutboundHistory: nextHistory,
  })
}
