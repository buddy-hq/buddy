import { readProjectConfig } from "@buddy/backend/config/runtime"
import { appendLearnerEvent, createLearnerEvent } from "../../features/memory"
import { syncBuddyRuntimeSessionPermissions } from "../permissions/runtime-session-permissions"
import { readTeachingSessionState, writeTeachingSessionState } from "../state/session-state"
import { restoreTeachingSessionState, writeLastLlmOutbound } from "../state/transform-state"
import type { SessionTransformContext } from "./types"
import { runMessagePromptPipeline } from "../../prompt/message-prompt-pipeline"

export type SessionMessageTransformOrchestrationResult = {
  transformed: Record<string, unknown>
  rollbackState?: () => void
  onAccepted?: () => Promise<void>
}

export async function orchestrateSessionMessageTransform(input: {
  context: SessionTransformContext
  body: Record<string, unknown>
}): Promise<SessionMessageTransformOrchestrationResult> {
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
      ? {
          readingTurnContextDigest: turnContextDelivery.currentReadingFingerprint,
          ...(turnContextDelivery.deliveredReadingFingerprint
            ? {
                lastDeliveredReadingTurnContextDigest:
                  turnContextDelivery.deliveredReadingFingerprint,
              }
            : turnContextDelivery.currentReadingFingerprint === undefined
              ? {
                  lastDeliveredReadingTurnContextDigest: undefined,
                }
              : {}),
        }
      : {}
    const teachingDeliveryPatch = turnContextDelivery
      ? {
          teachingTurnContextDigest: turnContextDelivery.currentTeachingFingerprint,
          ...(turnContextDelivery.deliveredTeachingFingerprint
            ? {
                lastDeliveredTeachingTurnContextDigest:
                  turnContextDelivery.deliveredTeachingFingerprint,
              }
            : turnContextDelivery.currentTeachingFingerprint === undefined
              ? {
                  lastDeliveredTeachingTurnContextDigest: undefined,
                }
              : {}),
        }
      : {}

    rollbackTeachingState = () =>
      restoreTeachingSessionState({
        directory: input.context.directory,
        sessionID: input.context.sessionID,
        previousState,
      })
    writeTeachingSessionState(input.context.directory, {
      ...(previousState?.lastDeliveredLearnerContextDigest
        ? {
            lastDeliveredLearnerContextDigest: previousState.lastDeliveredLearnerContextDigest,
          }
        : {}),
      ...(previousState?.lastDeliveredLearnerContextItems
        ? {
            lastDeliveredLearnerContextItems: previousState.lastDeliveredLearnerContextItems,
          }
        : {}),
      ...(previousState?.lastDeliveredLearnerContextMessageId
        ? {
            lastDeliveredLearnerContextMessageId:
              previousState.lastDeliveredLearnerContextMessageId,
          }
        : {}),
      ...(previousState?.lastDeliveredReadingTurnContextDigest
        ? {
            lastDeliveredReadingTurnContextDigest:
              previousState.lastDeliveredReadingTurnContextDigest,
          }
        : {}),
      ...(previousState?.lastDeliveredTeachingTurnContextDigest
        ? {
            lastDeliveredTeachingTurnContextDigest:
              previousState.lastDeliveredTeachingTurnContextDigest,
          }
        : {}),
      ...pipelineResult.nextTeachingState,
      ...readingDeliveryPatch,
      ...teachingDeliveryPatch,
      ...(pipelineResult.learnerContextDelivery
        ? {
            lastDeliveredLearnerContextDigest: pipelineResult.learnerContextDelivery.fingerprint,
            lastDeliveredLearnerContextItems: pipelineResult.learnerContextDelivery.items,
            lastDeliveredLearnerContextMessageId: undefined,
          }
        : {}),
    })
  }

  await syncBuddyRuntimeSessionPermissions({
    directory: input.context.directory,
    sessionID: input.context.sessionID,
    sessionRuntime: pipelineResult.sessionRuntimeForPermissions,
  })

  const learnerContextDelivery = pipelineResult.learnerContextDelivery

  writeLastLlmOutbound({
    directory: input.context.directory,
    sessionID: input.context.sessionID,
    kind: "message",
    payload: pipelineResult.transformed,
  })

  return {
    transformed: pipelineResult.transformed,
    rollbackState: rollbackTeachingState,
    onAccepted: learnerContextDelivery
      ? async () => {
          const state = readTeachingSessionState(input.context.directory, input.context.sessionID)
          if (!state) return

          const messageId = `learner_ctx_${input.context.sessionID}_${Date.now()}`
          writeTeachingSessionState(input.context.directory, {
            ...state,
            lastDeliveredLearnerContextMessageId: messageId,
          })
          await appendLearnerEvent(
            input.context.directory,
            createLearnerEvent({
              type: "learner_context_delivered",
              sessionId: input.context.sessionID,
              projectPath: input.context.directory,
              sourceKind: "learner_context",
              sourceId: messageId,
              searchableText: `Learner context ${learnerContextDelivery.kind} delivered for session ${input.context.sessionID}.`,
              payload: {
                deliveryKind: learnerContextDelivery.kind,
                fingerprint: learnerContextDelivery.fingerprint,
                itemCount: learnerContextDelivery.items?.length ?? 0,
              },
            }),
          )
        }
      : undefined,
  }
}
