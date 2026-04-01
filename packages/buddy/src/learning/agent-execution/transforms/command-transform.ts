import { readProjectConfig } from "@buddy/backend/config/runtime"
import { getBuddyPersona } from "../../personas"
import {
  assertNoLegacyRuntimeOverrides,
  hasExplicitCommandModel,
  normalizePersonaTarget,
  resolveCurrentSurface,
  resolveFocusGoalIds,
  resolveIntent,
} from "../../shared/targeting"
import { resolveCapabilityProfile } from "../../resolve-capability-profile"
import { readTeachingSessionState, writeTeachingSessionState } from "../state/session-state"
import { syncBuddyRuntimeSessionPermissions } from "../permissions/runtime-session-permissions"
import { restoreTeachingSessionState, writeLastLlmOutbound } from "../state/transform-state"
import type { SessionTransform, SessionTransformContext } from "./types"

export function createSessionCommandTransform(input: {
  context: SessionTransformContext
}): SessionTransform {
  let rollbackTeachingState: (() => void) | undefined

  return {
    onTransform: async (body: Record<string, unknown>): Promise<Record<string, unknown>> => {
      assertNoLegacyRuntimeOverrides(body)

      const projectConfig = await readProjectConfig(input.context.directory)
      const target = normalizePersonaTarget({
        body,
        config: projectConfig,
      })

      if (target.includeBuddySystem && target.personaID) {
        const intent = resolveIntent({
          body,
          config: projectConfig,
        })
        const previousState = readTeachingSessionState(
          input.context.directory,
          input.context.sessionID,
        )
        const workspaceState = previousState?.workspaceState ?? "chat"
        const persona = getBuddyPersona(target.personaID, projectConfig.personas)
        const runtimeProfile = resolveCapabilityProfile({
          persona,
          workspaceState,
          intent,
          configuredToolToggles: projectConfig.tools,
        })
        const focusGoalIds = resolveFocusGoalIds(body)
        rollbackTeachingState = () =>
          restoreTeachingSessionState({
            directory: input.context.directory,
            sessionID: input.context.sessionID,
            previousState,
          })
        writeTeachingSessionState(input.context.directory, {
          sessionId: input.context.sessionID,
          persona: target.personaID,
          intent,
          currentSurface: resolveCurrentSurface({
            personaID: target.personaID,
            config: projectConfig,
            workspaceState,
          }),
          workspaceState,
          focusGoalIds,
        })
        await syncBuddyRuntimeSessionPermissions({
          directory: input.context.directory,
          sessionID: input.context.sessionID,
          runtimeProfile,
        })
      } else {
        await syncBuddyRuntimeSessionPermissions({
          directory: input.context.directory,
          sessionID: input.context.sessionID,
        })
      }

      const transformed: Record<string, unknown> = {
        ...body,
        agent: target.agent,
      }
      if (!hasExplicitCommandModel(body.model) && projectConfig.model) {
        transformed.model = projectConfig.model
      }
      delete transformed.persona
      delete transformed.intent
      delete transformed.focusGoalIds
      writeLastLlmOutbound({
        directory: input.context.directory,
        sessionID: input.context.sessionID,
        kind: "command",
        payload: transformed,
      })
      return transformed
    },
    rollbackState: () => {
      rollbackTeachingState?.()
    },
  }
}
