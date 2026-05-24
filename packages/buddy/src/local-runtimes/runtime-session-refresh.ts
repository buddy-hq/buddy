import { syncBuddyRuntimeSessionPermissions } from "../learning/agent-execution/permissions/runtime-session-permissions"
import {
  listTeachingSessionStateEntries,
  writeTeachingSessionState,
} from "../learning/agent-execution/state/session-state"
import { recomputeTeachingSessionState } from "../learning/agent-execution/state/recompute-session-state"

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export async function refreshSessionsForLocalRuntimeChange() {
  const entries = listTeachingSessionStateEntries()
  await Promise.all(
    entries.map(async (entry) => {
      try {
        const nextState = await recomputeTeachingSessionState({
          directory: entry.directory,
          state: entry.state,
        })
        writeTeachingSessionState(entry.directory, nextState)
        await syncBuddyRuntimeSessionPermissions({
          directory: entry.directory,
          sessionID: nextState.sessionId,
          sessionRuntime: nextState.sessionRuntime,
        })
      } catch (error) {
        console.warn(
          `[buddy] failed to refresh runtime-dependent session ${entry.state.sessionId}: ${describeError(error)}`,
        )
      }
    }),
  )
}
