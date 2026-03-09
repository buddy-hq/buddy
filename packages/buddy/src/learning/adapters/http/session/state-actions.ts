import type { Context } from "hono"
import { readTeachingSessionState } from "../../../agent-execution"
import { ensureAllowedDirectory } from "../../../../http"

export async function getTeachingState(c: Context): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c.req.raw)
  if (!directoryResult.ok) return directoryResult.response

  const sessionID = c.req.param("sessionID")
  const state = readTeachingSessionState(directoryResult.directory, sessionID)
  if (!state) {
    return c.body(null, 204)
  }

  return c.json(state)
}

export async function getRuntimeInspectorState(c: Context): Promise<Response> {
  const directoryResult = ensureAllowedDirectory(c.req.raw)
  if (!directoryResult.ok) return directoryResult.response

  const sessionID = c.req.param("sessionID")
  const state = readTeachingSessionState(directoryResult.directory, sessionID)
  if (!state?.inspector) {
    return c.body(null, 204)
  }

  const capabilityEnvelope =
    state.inspector.capabilityEnvelope && typeof state.inspector.capabilityEnvelope === "object"
      ? state.inspector.capabilityEnvelope
      : {
          visibleSurfaces: [],
          defaultSurface: "chat",
          tools: {},
          subagents: {},
          skills: {},
          activityBundles: [],
        }

  return c.json({
    sessionId: state.sessionId,
    persona: state.persona,
    intentOverride: state.intentOverride,
    currentSurface: state.currentSurface,
    workspaceState: state.workspaceState,
    focusGoalIds: state.focusGoalIds,
    inspector: {
      ...state.inspector,
      capabilityEnvelope,
    },
  })
}
