import { readProjectConfig } from "@buddy/backend/config/runtime"
import { SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
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
import { resolveSubagentToolForwarding } from "./subagent-tool-forwarding"
import {
  persistConciseResponseChatState,
  readConciseResponseChatState,
} from "./concise-response-chat-state"
import {
  resolveConciseResponses,
  type ConciseResponseChatState,
} from "../../shared/concise-responses"

import type { TJsonObject } from "../../prompt/utils"

type TransformedCommand = TJsonObject & {
  agent: string
}

export function createSessionCommandTransform(input: {
  context: SessionTransformContext
}): SessionTransform {
  let rollbackTeachingState: (() => void) | undefined
  let acceptedConciseResponseChatState: ConciseResponseChatState | undefined

  return {
    onTransform: async (body: TJsonObject): Promise<TJsonObject> => {
      acceptedConciseResponseChatState = undefined
      assertNoLegacyRuntimeOverrides(body)

      await OpenCodeInstance.provide({
        directory: input.context.directory,
        fn: () => ToolRegistry.prime(),
      })

      const projectConfig = await readProjectConfig(input.context.directory)
      const previousState = readTeachingSessionState(
        input.context.directory,
        input.context.sessionID,
      )
      const target = normalizePersonaTarget({
        body,
        config: projectConfig,
        sessionPersona: previousState?.persona,
      })
      let conciseResponseChatState: ConciseResponseChatState | undefined
      const resolveConciseResponseChatState = async (): Promise<ConciseResponseChatState> => {
        if (conciseResponseChatState) return conciseResponseChatState

        conciseResponseChatState = previousState
          ? {
              base: previousState.baseConciseResponses ?? previousState.conciseResponses ?? true,
              applied: previousState.conciseResponses ?? true,
            }
          : await readConciseResponseChatState({
              directory: input.context.directory,
              sessionID: input.context.sessionID,
              configured: resolveConciseResponses(projectConfig),
            })
        return conciseResponseChatState
      }

      if (target.includeBuddySystem && target.personaID) {
        const responseStyle = await resolveConciseResponseChatState()
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
          config: projectConfig,
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
          baseConciseResponses: responseStyle.base,
          conciseResponses: responseStyle.applied,
          sessionRuntime,
          focusGoalIds,
        })
        acceptedConciseResponseChatState = responseStyle
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

      const transformed: TransformedCommand = {
        ...body,
        agent: target.agent,
      }
      if (!hasExplicitCommandModel(body.model) && projectConfig.model) {
        transformed.model = projectConfig.model
      }
      const subagentForwarding = await resolveSubagentToolForwarding({
        currentTools: transformed.tools,
        directory: input.context.directory,
        previousState,
        projectConfig,
        sessionID: input.context.sessionID,
        targetAgent: target.agent,
      })
      if (subagentForwarding.stateSeed && !previousState) {
        const responseStyle = await resolveConciseResponseChatState()
        rollbackTeachingState = () =>
          restoreTeachingSessionState({
            directory: input.context.directory,
            sessionID: input.context.sessionID,
            previousState,
          })
        writeTeachingSessionState(input.context.directory, {
          ...subagentForwarding.stateSeed,
          baseConciseResponses: responseStyle.base,
          conciseResponses: responseStyle.applied,
        })
        acceptedConciseResponseChatState = responseStyle
      }
      if (subagentForwarding.toolOverrides) {
        transformed.tools = subagentForwarding.toolOverrides
      }
      const sessionPermission = subagentForwarding.sessionPermission
      if (sessionPermission) {
        await OpenCodeInstance.provide({
          directory: input.context.directory,
          fn: () =>
            OpenCodeSession.setPermission({
              sessionID: SessionID.make(input.context.sessionID),
              permission: sessionPermission,
            }),
        })
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
    onAccepted: async () => {
      if (!acceptedConciseResponseChatState) return

      await persistConciseResponseChatState({
        directory: input.context.directory,
        sessionID: input.context.sessionID,
        ...acceptedConciseResponseChatState,
      })
    },
  }
}
