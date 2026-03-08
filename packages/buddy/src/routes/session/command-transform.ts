import { readProjectConfig } from "../../config/compatibility.js"
import { readTeachingSessionState, writeTeachingSessionState } from "../../learning/runtime/session-state.js"
import { assertSessionExistsInDirectory } from "./lookup.js"
import { compileCommandRuntimeProfile, syncBuddyRuntimeSessionPermissions } from "./permissions.js"
import { restoreTeachingSessionState, writeLastLlmOutbound } from "./state.js"
import type { SessionTransform, SessionTransformContext } from "./transform-types.js"
import {
  assertNoLegacyRuntimeOverrides,
  hasExplicitCommandModel,
  normalizePersonaTarget,
  resolveCurrentSurface,
  resolveFocusGoalIds,
  resolveIntentOverride,
} from "./targeting.js"

export function createSessionCommandTransform(input: { context: SessionTransformContext }): SessionTransform {
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
        const intentOverride = resolveIntentOverride({
          body,
          config: projectConfig,
        })
        const runtimeProfile = await compileCommandRuntimeProfile({
          directory: input.context.directory,
          sessionID: input.context.sessionID,
          config: projectConfig,
          personaID: target.personaID,
          intentOverride,
        })
        const focusGoalIds = resolveFocusGoalIds(body)
        await assertSessionExistsInDirectory({
          directory: input.context.directory,
          sessionID: input.context.sessionID,
          request: input.context.request,
        })
        const previousState = readTeachingSessionState(input.context.directory, input.context.sessionID)
        const workspaceState = previousState?.workspaceState ?? "chat"
        rollbackTeachingState = () =>
          restoreTeachingSessionState({
            directory: input.context.directory,
            sessionID: input.context.sessionID,
            previousState,
          })
        writeTeachingSessionState(input.context.directory, {
          sessionId: input.context.sessionID,
          persona: target.personaID,
          intentOverride,
          currentSurface: resolveCurrentSurface({
            personaID: target.personaID,
            config: projectConfig,
            workspaceState,
          }),
          workspaceState,
          focusGoalIds,
          promptInjectionCache: previousState?.promptInjectionCache,
        })
        await syncBuddyRuntimeSessionPermissions({
          directory: input.context.directory,
          sessionID: input.context.sessionID,
          runtimeProfile,
        })
      } else {
        await assertSessionExistsInDirectory({
          directory: input.context.directory,
          sessionID: input.context.sessionID,
          request: input.context.request,
        })
        await syncBuddyRuntimeSessionPermissions({
          directory: input.context.directory,
          sessionID: input.context.sessionID,
        })
      }

      const transformed: Record<string, unknown> = {
        ...body,
        agent: target.runtimeAgent,
      }
      if (!hasExplicitCommandModel(body.model) && projectConfig.model) {
        transformed.model = projectConfig.model
      }
      delete transformed.persona
      delete transformed.intent
      delete transformed.focusGoalIds
      delete transformed.activityBundleId
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
