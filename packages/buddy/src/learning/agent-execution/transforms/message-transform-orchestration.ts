import { readProjectConfig } from "@buddy/backend/config/runtime"
import { SessionID } from "@buddy/opencode-adapter/id"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { Session as OpenCodeSession } from "@buddy/opencode-adapter/session"
import { ingestLearnerContextDelivery } from "../../features/memory/ingestion"
import { syncBuddyRuntimeSessionPermissions } from "../permissions/runtime-session-permissions"
import { readTeachingSessionState, writeTeachingSessionState } from "../state/session-state"
import { restoreTeachingSessionState, writeLastLlmOutbound } from "../state/transform-state"
import type { SessionTransformContext } from "./types"
import { runMessagePromptPipeline } from "../../prompt/message-prompt-pipeline"
import type { TJsonObject } from "../../prompt/utils"

export type SessionMessageTransformOrchestrationResult = {
  transformed: TJsonObject
  rollbackState?: () => void
  onAccepted?: () => Promise<void>
}

export async function orchestrateSessionMessageTransform(input: {
  context: SessionTransformContext
  body: TJsonObject
}): Promise<SessionMessageTransformOrchestrationResult> {
  await OpenCodeInstance.provide({
    directory: input.context.directory,
    fn: () => ToolRegistry.prime(),
  })

  const projectConfig = await readProjectConfig(input.context.directory)
  const previousState = readTeachingSessionState(input.context.directory, input.context.sessionID)

  const pipelineResult = await runMessagePromptPipeline({
    context: {
      directory: input.context.directory,
      sessionID: input.context.sessionID,
    },
    body: input.body,
    projectConfig,
    previousState,
  })

  let rollbackTeachingState: (() => void) | undefined
  if (pipelineResult.nextTeachingState) {
    const turnContextDelivery = pipelineResult.turnContextDelivery
    const readingDeliveryPatch = turnContextDelivery
      ? Object.assign(
          {
            readingTurnContextDigest: turnContextDelivery.currentReadingFingerprint,
          },
          turnContextDelivery.deliveredReadingFingerprint
            ? {
                lastDeliveredReadingTurnContextDigest:
                  turnContextDelivery.deliveredReadingFingerprint,
              }
            : turnContextDelivery.currentReadingFingerprint === undefined
              ? {
                  lastDeliveredReadingTurnContextDigest: undefined,
                }
              : undefined,
        )
      : {}
    const teachingDeliveryPatch = turnContextDelivery
      ? Object.assign(
          {
            teachingTurnContextDigest: turnContextDelivery.currentTeachingFingerprint,
          },
          turnContextDelivery.deliveredTeachingFingerprint
            ? {
                lastDeliveredTeachingTurnContextDigest:
                  turnContextDelivery.deliveredTeachingFingerprint,
              }
            : turnContextDelivery.currentTeachingFingerprint === undefined
              ? {
                  lastDeliveredTeachingTurnContextDigest: undefined,
                }
              : undefined,
        )
      : {}
    const benchDeliveryPatch = turnContextDelivery
      ? Object.assign(
          {
            benchTurnContextDigest: turnContextDelivery.currentBenchFingerprint,
          },
          turnContextDelivery.deliveredBenchFingerprint
            ? {
                lastDeliveredBenchTurnContextDigest: turnContextDelivery.deliveredBenchFingerprint,
              }
            : turnContextDelivery.currentBenchFingerprint === undefined
              ? {
                  lastDeliveredBenchTurnContextDigest: undefined,
                }
              : undefined,
        )
      : {}

    rollbackTeachingState = () =>
      restoreTeachingSessionState({
        directory: input.context.directory,
        sessionID: input.context.sessionID,
        previousState,
      })
    writeTeachingSessionState(
      input.context.directory,
      Object.assign(
        Object.assign(
          Object.assign(
            Object.assign(
              {},
              previousState?.lastDeliveredLearnerContextDigest
                ? {
                    lastDeliveredLearnerContextDigest:
                      previousState.lastDeliveredLearnerContextDigest,
                  }
                : undefined,
              previousState?.lastDeliveredLearnerContextItems
                ? {
                    lastDeliveredLearnerContextItems:
                      previousState.lastDeliveredLearnerContextItems,
                  }
                : undefined,
              previousState?.lastDeliveredLearnerContextMessageId
                ? {
                    lastDeliveredLearnerContextMessageId:
                      previousState.lastDeliveredLearnerContextMessageId,
                  }
                : undefined,
            ),
            previousState?.lastDeliveredReadingTurnContextDigest
              ? {
                  lastDeliveredReadingTurnContextDigest:
                    previousState.lastDeliveredReadingTurnContextDigest,
                }
              : undefined,
            previousState?.lastDeliveredBenchTurnContextDigest
              ? {
                  lastDeliveredBenchTurnContextDigest:
                    previousState.lastDeliveredBenchTurnContextDigest,
                }
              : undefined,
            previousState?.lastDeliveredTeachingTurnContextDigest
              ? {
                  lastDeliveredTeachingTurnContextDigest:
                    previousState.lastDeliveredTeachingTurnContextDigest,
                }
              : undefined,
          ),
          pipelineResult.nextTeachingState,
          readingDeliveryPatch,
          benchDeliveryPatch,
        ),
        teachingDeliveryPatch,
        pipelineResult.learnerContextDelivery
          ? {
              lastDeliveredLearnerContextDigest: pipelineResult.learnerContextDelivery.fingerprint,
              lastDeliveredLearnerContextItems: pipelineResult.learnerContextDelivery.items,
              lastDeliveredLearnerContextMessageId: undefined,
            }
          : undefined,
      ),
    )
  }

  await syncBuddyRuntimeSessionPermissions({
    directory: input.context.directory,
    sessionID: input.context.sessionID,
    sessionRuntime: pipelineResult.sessionRuntimeForPermissions,
  })

  if (pipelineResult.subagentSessionPermission) {
    await OpenCodeInstance.provide({
      directory: input.context.directory,
      fn: () =>
        OpenCodeSession.setPermission({
          sessionID: SessionID.make(input.context.sessionID),
          permission: pipelineResult.subagentSessionPermission!,
        }),
    })
  }

  const learnerContextDelivery = pipelineResult.learnerContextDelivery

  writeLastLlmOutbound({
    directory: input.context.directory,
    sessionID: input.context.sessionID,
    kind: "message",
    payload: pipelineResult.transformed,
  })

  return {
    transformed: pipelineResult.transformed,
    rollbackState: () => {
      rollbackTeachingState?.()
    },
    onAccepted: learnerContextDelivery
      ? async () => {
          const state = readTeachingSessionState(input.context.directory, input.context.sessionID)
          if (!state) return

          const messageId = `learner_ctx_${input.context.sessionID}_${Date.now()}`
          writeTeachingSessionState(input.context.directory, {
            ...state,
            lastDeliveredLearnerContextMessageId: messageId,
          })
          await ingestLearnerContextDelivery({
            directory: input.context.directory,
            sessionID: input.context.sessionID,
            messageID: messageId,
            deliveryKind: learnerContextDelivery.kind,
            fingerprint: learnerContextDelivery.fingerprint,
            itemCount: learnerContextDelivery.items?.length ?? 0,
          })
        }
      : undefined,
  }
}
