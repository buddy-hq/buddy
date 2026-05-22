import type { ResolvedSessionRuntime } from "../../access/types"
import { piRuntime } from "../../../pi-backend/runtime"
import {
  readTeachingSessionState,
  writeTeachingSessionState,
} from "../state/session-state"

export async function syncBuddyRuntimeSessionPermissions(input: {
  directory: string
  sessionID: string
  sessionRuntime?: ResolvedSessionRuntime
}) {
  if (input.sessionRuntime) {
    const existingState = readTeachingSessionState(input.directory, input.sessionID)
    if (existingState) {
      writeTeachingSessionState(input.directory, {
        ...existingState,
        sessionRuntime: input.sessionRuntime,
      })
    }
  }

  piRuntime.syncSessionRuntimeTools(input.directory, input.sessionID)
  return input.sessionRuntime
}
