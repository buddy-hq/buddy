import { readProjectConfig } from "@buddy/backend/config/runtime"
import { getBuddyPersona } from "../../personas/wiring/persona-profiles"
import { REGISTERED_BUDDY_PERSONAS } from "../../personas/registry"
import {
  assertNoLegacyRuntimeOverrides,
  hasExplicitCommandModel,
  normalizePersonaTarget,
  resolveCurrentSurface,
  resolveFocusGoalIds,
} from "../../shared/targeting"
import { resolveSessionRuntime } from "../../access/resolve-session-runtime"
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
        const previousState = readTeachingSessionState(
          input.context.directory,
          input.context.sessionID,
        )
        const teachingWorkspaceState = previousState?.teachingWorkspaceState ?? "inactive"
        const persona = getBuddyPersona(target.personaID, projectConfig.personas)
        const personaDefinition = REGISTERED_BUDDY_PERSONAS.find(
          (definition) => definition.id === target.personaID,
        )
        if (!personaDefinition) {
          throw new Error(`Unknown Buddy persona "${target.personaID}"`)
        }
        const sessionRuntime = resolveSessionRuntime({
          persona: {
            id: persona.id,
            features: personaDefinition.features,
            defaultSurface: persona.defaultSurface,
          },
          teachingWorkspaceState,
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
          currentSurface: resolveCurrentSurface({
            personaID: target.personaID,
            config: projectConfig,
            teachingWorkspaceState,
          }),
          teachingWorkspaceState,
          sessionRuntime,
          focusGoalIds,
        })
        await syncBuddyRuntimeSessionPermissions({
          directory: input.context.directory,
          sessionID: input.context.sessionID,
          sessionRuntime,
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
