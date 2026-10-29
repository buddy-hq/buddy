import { readProjectConfig } from "@buddy/backend/config/runtime"
import { ingestLearnerContextDelivery } from "../../features/memory/ingestion"
import { syncBuddyRuntimeSessionPermissions } from "../permissions/runtime-session-permissions"
import {
  readTeachingSessionState,
  teachingSessionCompactionCount,
  withoutTeachingContextDelivery,
  writeTeachingSessionState,
} from "../state/session-state"
import { restoreTeachingSessionState, writeLastLlmOutbound } from "../state/transform-state"
import type { SessionTransformContext } from "./types"
import { runMessagePromptPipeline } from "../../prompt/message-prompt-pipeline"
import type { TJsonObject } from "../../prompt/utils"
import { resolveConciseResponses } from "../../shared/concise-responses"
import {
  persistConciseResponseChatState,
  readConciseResponseChatState,
} from "./concise-response-chat-state"

export type SessionMessageTransformOrchestrationResult = {
  transformed: TJsonObject
  rollbackState?: () => void
  onAccepted?: () => Promise<void>
}

export async function orchestrateSessionMessageTransform(input: {
  context: SessionTransformContext
  body: TJsonObject
}): Promise<SessionMessageTransformOrchestrationResult> {
  const compactionCount = teachingSessionCompactionCount(input.context.sessionID)
  const projectConfig = await readProjectConfig(input.context.directory)
  const previousState = readTeachingSessionState(input.context.directory, input.context.sessionID)
  const conciseResponseSnapshot = previousState
    ? undefined
    : await readConciseResponseChatState({
        directory: input.context.directory,
        sessionID: input.context.sessionID,
        configured: resolveConciseResponses(projectConfig),
      })

  const pipelineResult = await runMessagePromptPipeline({
    context: {
      directory: input.context.directory,
      sessionID: input.context.sessionID,
    },
    body: input.body,
    projectConfig,
    previousState,
    conciseResponseChatState: conciseResponseSnapshot,
  })

  const conciseResponseChatState = pipelineResult.nextTeachingState
    ? {
        base: pipelineResult.nextTeachingState.baseConciseResponses ?? true,
        applied: pipelineResult.nextTeachingState.conciseResponses ?? true,
      }
    : undefined
  if (conciseResponseChatState) {
    const previouslyApplied = previousState
      ? (previousState.conciseResponses ?? true)
      : (conciseResponseSnapshot?.applied ?? conciseResponseChatState.applied)
    await persistConciseResponseChatState({
      directory: input.context.directory,
      sessionID: input.context.sessionID,
      base: conciseResponseChatState.base,
      applied: previouslyApplied,
    })
  }

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
        compactionCount,
      })
    const nextState = Object.assign(
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
    )
    writeTeachingSessionState(
      input.context.directory,
      teachingSessionCompactionCount(input.context.sessionID) !== compactionCount
        ? withoutTeachingContextDelivery(nextState)
        : nextState,
    )
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
    rollbackState: () => {
      rollbackTeachingState?.()
    },
    onAccepted:
      conciseResponseChatState || learnerContextDelivery
        ? async () => {
            let failure: { cause: unknown } | undefined

            if (conciseResponseChatState) {
              try {
                await persistConciseResponseChatState({
                  directory: input.context.directory,
                  sessionID: input.context.sessionID,
                  ...conciseResponseChatState,
                })
              } catch (cause) {
                failure = { cause }
              }
            }

            if (learnerContextDelivery) {
              try {
                const state = readTeachingSessionState(
                  input.context.directory,
                  input.context.sessionID,
                )
                if (state) {
                  const messageId = `learner_ctx_${input.context.sessionID}_${Date.now()}`
                  const nextState = {
                    ...state,
                    lastDeliveredLearnerContextMessageId: messageId,
                  }
                  writeTeachingSessionState(
                    input.context.directory,
                    teachingSessionCompactionCount(input.context.sessionID) !== compactionCount
                      ? withoutTeachingContextDelivery(nextState)
                      : nextState,
                  )
                  await ingestLearnerContextDelivery({
                    directory: input.context.directory,
                    sessionID: input.context.sessionID,
                    messageID: messageId,
                    deliveryKind: learnerContextDelivery.kind,
                    fingerprint: learnerContextDelivery.fingerprint,
                    itemCount: learnerContextDelivery.items?.length ?? 0,
                  })
                }
              } catch (cause) {
                failure ??= { cause }
              }
            }

            if (failure) throw failure.cause
          }
        : undefined,
  }
}
