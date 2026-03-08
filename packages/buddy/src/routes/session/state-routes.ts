import type { Hono } from "hono"
import { readTeachingSessionState } from "../../learning/runtime/session-state.js"
import {
  AnyObjectSchema,
  ErrorSchema,
  SessionIDPath,
} from "../../openapi/compatibility-schemas.js"
import { compatibilityRoute } from "../../openapi/compatibility-route.js"
import { directoryParameters } from "../shared/openapi.js"
import { ensureAllowedDirectory } from "../support/directory.js"

export function registerSessionStateRoutes(app: Hono): Hono {
  return app
    .get(
      "/:sessionID/teaching-state",
      compatibilityRoute({
        operationId: "session.teachingState",
        summary: "Get Buddy teaching runtime state for a session",
        parameters: [SessionIDPath, ...directoryParameters],
        responses: {
          200: {
            description: "Teaching runtime state",
            content: {
              "application/json": { schema: AnyObjectSchema },
            },
          },
          204: {
            description: "No Buddy teaching state exists for this session yet",
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const directoryResult = ensureAllowedDirectory(c.req.raw)
        if (!directoryResult.ok) return directoryResult.response

        const sessionID = c.req.param("sessionID")
        const state = readTeachingSessionState(directoryResult.directory, sessionID)
        if (!state) {
          return c.body(null, 204)
        }

        return c.json(state)
      },
    )
    .get(
      "/:sessionID/runtime-inspector",
      compatibilityRoute({
        operationId: "session.runtimeInspector",
        summary: "Get Buddy runtime inspector state for a session",
        parameters: [SessionIDPath, ...directoryParameters],
        responses: {
          200: {
            description: "Runtime inspector state",
            content: {
              "application/json": { schema: AnyObjectSchema },
            },
          },
          204: {
            description: "No Buddy runtime inspector state exists for this session yet",
          },
          403: {
            description: "Directory is outside allowed roots",
            content: {
              "application/json": { schema: ErrorSchema },
            },
          },
        },
      }),
      async (c) => {
        const directoryResult = ensureAllowedDirectory(c.req.raw)
        if (!directoryResult.ok) return directoryResult.response

        const sessionID = c.req.param("sessionID")
        const state = readTeachingSessionState(directoryResult.directory, sessionID)
        if (!state?.inspector) {
          return c.body(null, 204)
        }

        const { activityBundles: _activityBundles, ...capabilityEnvelope } = state.inspector.capabilityEnvelope

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
      },
    )
}
